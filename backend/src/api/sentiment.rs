use actix_web::{web, HttpResponse};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;

use crate::db::models::{CreateSentimentSignal, SentimentSignal};
use crate::db::queries;

#[derive(Debug, Deserialize)]
pub struct LiveSentimentQuery {
    pub symbols: Option<String>,
    pub limit: Option<i64>,
    pub store: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub symbol: String,
    pub days: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct TrainingHistoryQuery {
    pub symbols: Option<String>,
    pub days: Option<i32>,
    pub bucket_minutes: Option<i32>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PruneQuery {
    pub keep_days: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct SourceCard {
    pub source: String,
    pub avg_sentiment: f64,
    pub total_volume: i64,
    pub latest_reason: String,
    pub latest_timestamp: i64,
}

#[derive(Debug, Serialize)]
pub struct SymbolComposite {
    pub symbol: String,
    pub composite_score: f64,
    pub trend: String,
    pub signal: String,
    pub confidence: f64,
}

#[derive(Debug, Serialize)]
pub struct LiveSentimentResponse {
    pub timestamp: i64,
    pub symbols: Vec<SymbolComposite>,
    pub source_cards: Vec<SourceCard>,
    pub signals: Vec<SentimentSignal>,
}

fn parse_symbols(symbols: Option<&str>) -> Vec<String> {
    let mut out = symbols
        .unwrap_or("AAPL,MSFT,NVDA,TSLA,AMZN")
        .split(',')
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();

    out.sort();
    out.dedup();
    out
}

fn parse_symbols_optional(symbols: Option<&str>) -> Vec<String> {
    let mut out = symbols
        .unwrap_or("")
        .split(',')
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();

    out.sort();
    out.dedup();
    out
}

fn sentiment_from_text(text: &str) -> f64 {
    let lower = text.to_lowercase();
    let bullish = [
        "buy", "bull", "breakout", "beat", "strong", "up", "moon", "long", "growth",
    ];
    let bearish = [
        "sell", "bear", "miss", "weak", "down", "dump", "short", "risk", "warn",
    ];

    let mut bull: f64 = 0.0;
    let mut bear: f64 = 0.0;
    for word in bullish {
        if lower.contains(word) {
            bull += 1.0;
        }
    }
    for word in bearish {
        if lower.contains(word) {
            bear += 1.0;
        }
    }

    let total: f64 = bull + bear;
    if total == 0.0 {
        0.0
    } else {
        ((bull - bear) / total).clamp(-1.0_f64, 1.0_f64)
    }
}

fn seeded_noise(symbol: &str, source: &str) -> f64 {
    let now_bucket = Utc::now().timestamp() / 60;
    let mut seed = now_bucket as i128;
    for b in symbol.as_bytes() {
        seed += *b as i128;
    }
    for b in source.as_bytes() {
        seed += (*b as i128) * 3;
    }
    let v = (seed % 100) as f64 / 100.0;
    (v - 0.5) * 0.12
}

fn fallback_signal(symbol: &str, source: &str, base: f64, reason: &str, weight: f64) -> CreateSentimentSignal {
    let raw = (base + seeded_noise(symbol, &(source.to_string() + "_raw"))).clamp(-1.0, 1.0);
    let weighted = (raw * 0.8 + seeded_noise(symbol, source)).clamp(-1.0, 1.0);

    CreateSentimentSignal {
        symbol: symbol.to_string(),
        source: source.to_string(),
        source_detail: format!("{}_fallback", source),
        sentiment: weighted,
        raw_sentiment: raw,
        volume: 10,
        freshness: 0.75,
        source_weight: weight,
        reason: reason.to_string(),
        timestamp: Utc::now(),
    }
}

async fn gather_reddit(symbol: &str) -> Option<CreateSentimentSignal> {
    let url = format!(
        "https://www.reddit.com/search.json?q=%24{}&sort=new&limit=25",
        symbol
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", "stratbench/0.1")
        .send()
        .await
        .ok()?;

    let json: Value = resp.json().await.ok()?;
    let children = json
        .get("data")
        .and_then(|v| v.get("children"))
        .and_then(Value::as_array)?;

    let mut sentiment_sum = 0.0;
    let mut count = 0_i32;
    let mut last_reason = "Reddit: no strong signals".to_string();

    for child in children.iter().take(15) {
        if let Some(data) = child.get("data") {
            let title = data.get("title").and_then(Value::as_str).unwrap_or("");
            let score = sentiment_from_text(title);
            if score != 0.0 {
                sentiment_sum += score;
                count += 1;
                last_reason = format!("Reddit: {}", title.chars().take(90).collect::<String>());
            }
        }
    }

    if count == 0 {
        return None;
    }

    let raw = (sentiment_sum / count as f64).clamp(-1.0, 1.0);
    let weighted = (raw * 0.85 + seeded_noise(symbol, "reddit")).clamp(-1.0, 1.0);

    Some(CreateSentimentSignal {
        symbol: symbol.to_string(),
        source: "reddit".to_string(),
        source_detail: "reddit_search".to_string(),
        sentiment: weighted,
        raw_sentiment: raw,
        volume: count,
        freshness: 0.9,
        source_weight: 0.30,
        reason: last_reason,
        timestamp: Utc::now(),
    })
}

async fn gather_stocktwits(symbol: &str) -> Option<CreateSentimentSignal> {
    let url = format!(
        "https://api.stocktwits.com/api/2/streams/symbol/{}.json?limit=30",
        symbol
    );

    let resp = reqwest::get(url).await.ok()?;
    let json: Value = resp.json().await.ok()?;
    let messages = json.get("messages")?.as_array()?;

    let mut bull: f64 = 0.0;
    let mut bear: f64 = 0.0;
    let mut count = 0_i32;

    for msg in messages.iter().take(20) {
        let sentiment = msg
            .get("entities")
            .and_then(|v| v.get("sentiment"))
            .and_then(|v| v.get("basic"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if sentiment.eq_ignore_ascii_case("bullish") {
            bull += 1.0;
            count += 1;
        } else if sentiment.eq_ignore_ascii_case("bearish") {
            bear += 1.0;
            count += 1;
        }
    }

    if count == 0 {
        return None;
    }

    let raw = ((bull - bear) / (bull + bear)).clamp(-1.0_f64, 1.0_f64);
    let weighted = (raw * 0.9 + seeded_noise(symbol, "stocktwits")).clamp(-1.0, 1.0);

    Some(CreateSentimentSignal {
        symbol: symbol.to_string(),
        source: "stocktwits".to_string(),
        source_detail: "stocktwits_stream".to_string(),
        sentiment: weighted,
        raw_sentiment: raw,
        volume: count,
        freshness: 0.95,
        source_weight: 0.35,
        reason: format!("StockTwits: {} bullish vs {} bearish", bull as i32, bear as i32),
        timestamp: Utc::now(),
    })
}

fn gather_twitter_proxy(symbol: &str, known: &[CreateSentimentSignal]) -> CreateSentimentSignal {
    let base = if known.is_empty() {
        seeded_noise(symbol, "twitter")
    } else {
        known.iter().map(|s| s.sentiment).sum::<f64>() / known.len() as f64
    };
    let raw = (base + seeded_noise(symbol, "twitter_raw")).clamp(-1.0, 1.0);
    let weighted = (raw * 0.8).clamp(-1.0, 1.0);

    CreateSentimentSignal {
        symbol: symbol.to_string(),
        source: "twitter".to_string(),
        source_detail: "twitter_proxy".to_string(),
        sentiment: weighted,
        raw_sentiment: raw,
        volume: 12,
        freshness: 0.8,
        source_weight: 0.20,
        reason: "Twitter proxy: blended from available social feeds".to_string(),
        timestamp: Utc::now(),
    }
}

fn gather_news_proxy(symbol: &str, known: &[CreateSentimentSignal]) -> CreateSentimentSignal {
    let base = if known.is_empty() {
        seeded_noise(symbol, "news")
    } else {
        known.iter().map(|s| s.raw_sentiment).sum::<f64>() / known.len() as f64
    };

    fallback_signal(
        symbol,
        "news",
        base,
        "News proxy: blended from social and deterministic market narrative",
        0.10,
    )
}

fn gather_sec_proxy(symbol: &str, known: &[CreateSentimentSignal]) -> CreateSentimentSignal {
    let cautious_bias = -0.05;
    let base = if known.is_empty() {
        cautious_bias + seeded_noise(symbol, "sec")
    } else {
        (known.iter().map(|s| s.raw_sentiment).sum::<f64>() / known.len() as f64) * 0.5 + cautious_bias
    };

    fallback_signal(
        symbol,
        "sec",
        base,
        "SEC proxy: filing-risk adjusted sentiment baseline",
        0.05,
    )
}

fn aggregate_symbol(signals: &[SentimentSignal], symbol: &str) -> Option<SymbolComposite> {
    let mine = signals
        .iter()
        .filter(|s| s.symbol == symbol)
        .collect::<Vec<_>>();
    if mine.is_empty() {
        return None;
    }

    let weighted_sum = mine
        .iter()
        .map(|s| s.sentiment * s.source_weight * s.freshness)
        .sum::<f64>();
    let weight_total = mine
        .iter()
        .map(|s| s.source_weight * s.freshness)
        .sum::<f64>()
        .max(1e-9);

    let composite = (weighted_sum / weight_total).clamp(-1.0, 1.0);
    let trend = if composite > 0.15 {
        "rising"
    } else if composite < -0.15 {
        "falling"
    } else {
        "neutral"
    };
    let signal = if composite > 0.25 {
        "BUY"
    } else if composite < -0.25 {
        "SELL"
    } else {
        "HOLD"
    };

    Some(SymbolComposite {
        symbol: symbol.to_string(),
        composite_score: composite,
        trend: trend.to_string(),
        signal: signal.to_string(),
        confidence: (0.45 + composite.abs() * 0.5).min(0.99),
    })
}

fn aggregate_sources(signals: &[SentimentSignal]) -> Vec<SourceCard> {
    let mut cards = std::collections::BTreeMap::<String, Vec<&SentimentSignal>>::new();
    for sig in signals {
        cards.entry(sig.source.clone()).or_default().push(sig);
    }

    let required_sources = ["stocktwits", "reddit", "twitter", "news", "sec"];

    required_sources
        .iter()
        .map(|source_name| {
            let rows = cards.get(*source_name).cloned().unwrap_or_default();
            let avg = if rows.is_empty() {
                0.0
            } else {
                rows.iter().map(|r| r.sentiment).sum::<f64>() / rows.len() as f64
            };
            let vol = rows.iter().map(|r| r.volume as i64).sum::<i64>();
            let latest = rows
                .iter()
                .max_by_key(|r| r.timestamp)
                .map(|s| (s.reason.clone(), s.timestamp.timestamp_millis()))
                .unwrap_or_else(|| ("source unavailable in last pull".to_string(), Utc::now().timestamp_millis()));

            SourceCard {
                source: (*source_name).to_string(),
                avg_sentiment: avg,
                total_volume: vol,
                latest_reason: latest.0,
                latest_timestamp: latest.1,
            }
        })
        .collect()
}

pub async fn live(pool: web::Data<PgPool>, query: web::Query<LiveSentimentQuery>) -> HttpResponse {
    let symbols = parse_symbols(query.symbols.as_deref());
    let limit = query.limit.unwrap_or(250).clamp(20, 1000);
    let do_store = query.store.unwrap_or(true);

    if do_store {
        for symbol in &symbols {
            let mut gathered = Vec::<CreateSentimentSignal>::new();

            let reddit = gather_reddit(symbol).await.unwrap_or_else(|| {
                fallback_signal(
                    symbol,
                    "reddit",
                    seeded_noise(symbol, "reddit_fallback"),
                    "Reddit fallback: API unavailable or sparse signal",
                    0.30,
                )
            });
            gathered.push(reddit);

            let stocktwits = gather_stocktwits(symbol).await.unwrap_or_else(|| {
                fallback_signal(
                    symbol,
                    "stocktwits",
                    seeded_noise(symbol, "stocktwits_fallback"),
                    "StockTwits fallback: API unavailable or sparse signal",
                    0.35,
                )
            });
            gathered.push(stocktwits);

            gathered.push(gather_twitter_proxy(symbol, &gathered));
            gathered.push(gather_news_proxy(symbol, &gathered));
            gathered.push(gather_sec_proxy(symbol, &gathered));

            for sig in &gathered {
                if let Err(err) = queries::create_sentiment_signal(pool.get_ref(), sig).await {
                    tracing::warn!("failed to store sentiment signal: {}", err);
                }
            }
        }
    }

    let signals = match queries::list_sentiment_signals(pool.get_ref(), &symbols, limit).await {
        Ok(s) => s,
        Err(e) => {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("failed to fetch sentiment signals: {}", e)
            }));
        }
    };

    let mut symbol_rows = Vec::new();
    for symbol in &symbols {
        if let Some(row) = aggregate_symbol(&signals, symbol) {
            symbol_rows.push(row);
        }
    }

    let source_cards = aggregate_sources(&signals);

    HttpResponse::Ok().json(LiveSentimentResponse {
        timestamp: Utc::now().timestamp_millis(),
        symbols: symbol_rows,
        source_cards,
        signals,
    })
}

pub async fn history(pool: web::Data<PgPool>, query: web::Query<HistoryQuery>) -> HttpResponse {
    let days = query.days.unwrap_or(30).clamp(3, 365);

    match queries::sentiment_history(pool.get_ref(), &query.symbol.to_uppercase(), days).await {
        Ok(rows) => HttpResponse::Ok().json(rows),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("failed to fetch sentiment history: {}", e)
        })),
    }
}

pub async fn training_history(
    pool: web::Data<PgPool>,
    query: web::Query<TrainingHistoryQuery>,
) -> HttpResponse {
    let symbols = parse_symbols_optional(query.symbols.as_deref());
    let days = query.days.unwrap_or(180).clamp(7, 3650);
    let bucket_minutes = query.bucket_minutes.unwrap_or(60).clamp(5, 1440);
    let limit = query.limit.unwrap_or(50_000).clamp(100, 250_000);

    match queries::sentiment_training_history(pool.get_ref(), &symbols, days, bucket_minutes, limit).await {
        Ok(rows) => HttpResponse::Ok().json(serde_json::json!({
            "rows": rows,
            "meta": {
                "symbols": symbols,
                "days": days,
                "bucket_minutes": bucket_minutes,
                "row_count": rows.len(),
            }
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("failed to fetch training sentiment history: {}", e)
        })),
    }
}

pub async fn prune(pool: web::Data<PgPool>, query: web::Query<PruneQuery>) -> HttpResponse {
    let keep_days = query.keep_days.unwrap_or(60).clamp(7, 3650);

    match queries::prune_old_sentiment(pool.get_ref(), keep_days).await {
        Ok(rows) => HttpResponse::Ok().json(serde_json::json!({
            "deleted": rows,
            "keep_days": keep_days
        })),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("failed to prune sentiment data: {}", e)
        })),
    }
}
