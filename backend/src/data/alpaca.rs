use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AlpacaClient {
    client: Client,
    pub api_key: String,
    pub api_secret: String,
    pub data_url: String,
}

#[derive(Debug, Deserialize)]
pub struct RawBar {
    pub t: chrono::DateTime<chrono::Utc>,
    pub o: f64,
    pub h: f64,
    pub l: f64,
    pub c: f64,
    pub v: f64,
}

#[derive(Debug, Deserialize)]
struct StockBarsResponse {
    bars: Option<Vec<RawBar>>,
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CryptoBarsResponse {
    bars: Option<std::collections::HashMap<String, Vec<RawBar>>>,
    next_page_token: Option<String>,
}

#[derive(Debug)]
pub struct StoredBar {
    pub symbol: String,
    pub timeframe: String,
    pub ts: chrono::DateTime<chrono::Utc>,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: i64,
}

impl AlpacaClient {
    pub fn new(api_key: String, api_secret: String, data_url: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            api_secret,
            data_url,
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && !self.api_secret.is_empty()
    }

    /// Fetch historical daily bars for a US stock symbol.
    pub async fn fetch_stock_bars(
        &self,
        symbol: &str,
        timeframe: &str,
        start: &str,
        end: &str,
    ) -> Result<Vec<RawBar>, String> {
        let mut all_bars = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut url = format!(
                "{}/v2/stocks/{}/bars?timeframe={}&start={}&end={}&limit=10000&adjustment=all&feed=sip",
                self.data_url, symbol, timeframe, start, end
            );
            if let Some(ref token) = page_token {
                url.push_str(&format!("&page_token={}", token));
            }

            let resp = self
                .client
                .get(&url)
                .header("APCA-API-KEY-ID", &self.api_key)
                .header("APCA-API-SECRET-KEY", &self.api_secret)
                .send()
                .await
                .map_err(|e| format!("request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("alpaca returned {}: {}", status, body));
            }

            let data: StockBarsResponse = resp
                .json()
                .await
                .map_err(|e| format!("failed to parse response: {}", e))?;

            if let Some(bars) = data.bars {
                all_bars.extend(bars);
            }

            match data.next_page_token {
                Some(t) if !t.is_empty() => page_token = Some(t),
                _ => break,
            }
        }

        Ok(all_bars)
    }

    /// Fetch historical daily bars for a crypto pair (e.g. "BTC/USD").
    pub async fn fetch_crypto_bars(
        &self,
        symbol: &str,
        timeframe: &str,
        start: &str,
        end: &str,
    ) -> Result<Vec<RawBar>, String> {
        let mut all_bars = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut url = format!(
                "{}/v1beta3/crypto/us/bars?symbols={}&timeframe={}&start={}&end={}&limit=10000",
                self.data_url, symbol, timeframe, start, end
            );
            if let Some(ref token) = page_token {
                url.push_str(&format!("&page_token={}", token));
            }

            let resp = self
                .client
                .get(&url)
                .header("APCA-API-KEY-ID", &self.api_key)
                .header("APCA-API-SECRET-KEY", &self.api_secret)
                .send()
                .await
                .map_err(|e| format!("request failed: {}", e))?;

            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("alpaca returned {}: {}", status, body));
            }

            let data: CryptoBarsResponse = resp
                .json()
                .await
                .map_err(|e| format!("failed to parse response: {}", e))?;

            if let Some(map) = data.bars {
                for bars in map.into_values() {
                    all_bars.extend(bars);
                }
            }

            match data.next_page_token {
                Some(t) if !t.is_empty() => page_token = Some(t),
                _ => break,
            }
        }

        Ok(all_bars)
    }
}

/// Insert fetched bars into market_bars, ignoring duplicates.
pub async fn store_bars(
    pool: &PgPool,
    symbol: &str,
    timeframe: &str,
    bars: &[RawBar],
) -> Result<u64, sqlx::Error> {
    let mut inserted: u64 = 0;

    for bar in bars {
        let rows = sqlx::query(
            r#"INSERT INTO market_bars (symbol, timeframe, ts, open, high, low, close, volume)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT ON CONSTRAINT uq_market_bars DO NOTHING"#,
        )
        .bind(symbol)
        .bind(timeframe)
        .bind(bar.t)
        .bind(bar.o)
        .bind(bar.h)
        .bind(bar.l)
        .bind(bar.c)
        .bind(bar.v)
        .execute(pool)
        .await?
        .rows_affected();

        inserted += rows;
    }

    Ok(inserted)
}
