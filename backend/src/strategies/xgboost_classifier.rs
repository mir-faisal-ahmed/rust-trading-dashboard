use std::collections::HashMap;

use super::{indicators, Bar, RawTrade, RunConfig, StrategyMeta, StrategyResult, TradingStrategy};

// ────────────────────────────────────────────────────────────────────────────
// Gradient Boosted Decision Stump classifier (pure Rust, no external deps).
// Implements the XGBoost objective (second-order gradient descent, L2 leaf
// regularisation) using depth-1 trees (stumps) for speed and interpretability.
// ────────────────────────────────────────────────────────────────────────────

struct Stump {
    feature_idx: usize,
    threshold: f64,
    left_value: f64,
    right_value: f64,
}

struct GBClassifier {
    trees: Vec<Stump>,
    learning_rate: f64,
    n_estimators: usize,
}

impl GBClassifier {
    fn new(learning_rate: f64, n_estimators: usize) -> Self {
        Self {
            trees: Vec::with_capacity(n_estimators),
            learning_rate,
            n_estimators,
        }
    }

    #[inline]
    fn sigmoid(x: f64) -> f64 {
        1.0 / (1.0 + (-x.clamp(-500.0, 500.0)).exp())
    }

    fn fit(&mut self, features: &[Vec<f64>], labels: &[f64]) {
        self.trees.clear();
        let n = labels.len();
        if n == 0 {
            return;
        }
        let base = 0.0_f64; // log-odds starting point (sigmoid(0) = 0.5)
        let mut f = vec![base; n];
        let lambda = 1.0_f64;

        for _ in 0..self.n_estimators {
            let probs: Vec<f64> = f.iter().map(|&x| Self::sigmoid(x)).collect();
            let grads: Vec<f64> = (0..n).map(|i| probs[i] - labels[i]).collect();
            let hess: Vec<f64> = (0..n)
                .map(|i| (probs[i] * (1.0 - probs[i])).max(1e-6))
                .collect();

            let stump = Self::best_stump(features, &grads, &hess, lambda);
            for i in 0..n {
                let leaf = if features[i][stump.feature_idx] <= stump.threshold {
                    stump.left_value
                } else {
                    stump.right_value
                };
                f[i] += self.learning_rate * leaf;
            }
            self.trees.push(stump);
        }
    }

    fn best_stump(
        features: &[Vec<f64>],
        grads: &[f64],
        hess: &[f64],
        lambda: f64,
    ) -> Stump {
        let n = features.len();
        let n_feats = if n > 0 { features[0].len() } else { 0 };

        let total_g: f64 = grads.iter().sum();
        let total_h: f64 = hess.iter().sum();
        let root_score = total_g * total_g / (total_h + lambda);

        let mut best_gain = f64::NEG_INFINITY;
        let mut best = Stump {
            feature_idx: 0,
            threshold: 0.0,
            left_value: 0.0,
            right_value: 0.0,
        };

        // Pre-allocate sort buffer once.
        let mut order: Vec<usize> = (0..n).collect();

        for feat in 0..n_feats {
            order.sort_unstable_by(|&a, &b| {
                features[a][feat]
                    .partial_cmp(&features[b][feat])
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            let mut lg = 0.0_f64;
            let mut lh = 0.0_f64;

            for k in 0..n - 1 {
                let i = order[k];
                let j = order[k + 1];
                lg += grads[i];
                lh += hess[i];
                // Skip if consecutive feature values are identical.
                if (features[i][feat] - features[j][feat]).abs() < 1e-10 {
                    continue;
                }
                let rg = total_g - lg;
                let rh = total_h - lh;
                let gain = lg * lg / (lh + lambda) + rg * rg / (rh + lambda) - root_score;
                if gain > best_gain {
                    best_gain = gain;
                    best.feature_idx = feat;
                    best.threshold = (features[i][feat] + features[j][feat]) / 2.0;
                    best.left_value = -lg / (lh + lambda);
                    best.right_value = -rg / (rh + lambda);
                }
            }
        }
        best
    }

    fn predict_proba_one(&self, feat: &[f64]) -> f64 {
        let log_odds: f64 = self
            .trees
            .iter()
            .map(|t| {
                self.learning_rate
                    * if feat[t.feature_idx] <= t.threshold {
                        t.left_value
                    } else {
                        t.right_value
                    }
            })
            .sum();
        Self::sigmoid(log_odds)
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Feature matrix
// Features (all normalised / clipped to reasonable ranges):
//   0  RSI(14) / 100
//   1  MACD histogram / ATR (momentum direction)
//   2  Bollinger %B (mean-reversion position)
//   3  ATR / close (volatility)
//   4  Volume / SMA-volume-20 (volume surge)
//   5  5-day close momentum
//   6  10-day close momentum
//   7  20-day close momentum
//   8  (close / SMA20) - 1 (deviation from trend)
// ────────────────────────────────────────────────────────────────────────────

const N_FEATURES: usize = 9;
// MACD(12,26,9): EMA26 valid at bar 25, signal valid at bar 33. Use 34 to be safe.
const MIN_LOOKBACK: usize = 34;

fn build_features(bars: &[Bar]) -> Vec<Option<[f64; N_FEATURES]>> {
    let n = bars.len();
    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
    let highs: Vec<f64> = bars.iter().map(|b| b.high).collect();
    let lows: Vec<f64> = bars.iter().map(|b| b.low).collect();
    let vols: Vec<f64> = bars.iter().map(|b| b.volume).collect();

    let rsi = indicators::rsi(&closes, 14);
    let (_, _, macd_hist) = indicators::macd(&closes, 12, 26, 9);
    let (_, _, _, pct_b) = indicators::bollinger_bands(&closes, 20, 2.0);
    let atr = indicators::atr(&highs, &lows, &closes, 14);
    let vol_sma = indicators::sma(&vols, 20);
    let sma20 = indicators::sma(&closes, 20);

    let mut out = vec![None; n];
    for i in MIN_LOOKBACK..n {
        if !rsi[i].is_finite()
            || !macd_hist[i].is_finite()
            || !pct_b[i].is_finite()
            || !atr[i].is_finite()
            || !vol_sma[i].is_finite()
            || !sma20[i].is_finite()
            || i < 20
        {
            continue;
        }
        let atr_pct = if closes[i] > 0.0 { atr[i] / closes[i] } else { 0.0 };
        let macd_n = if atr[i] > 0.0 { macd_hist[i] / atr[i] } else { 0.0 };
        let vol_r = if vol_sma[i] > 0.0 { vols[i] / vol_sma[i] } else { 1.0 };
        let mom5 = if i >= 5 && closes[i - 5] > 0.0 { closes[i] / closes[i - 5] - 1.0 } else { 0.0 };
        let mom10 = if i >= 10 && closes[i - 10] > 0.0 { closes[i] / closes[i - 10] - 1.0 } else { 0.0 };
        let mom20 = if i >= 20 && closes[i - 20] > 0.0 { closes[i] / closes[i - 20] - 1.0 } else { 0.0 };
        let dev = if sma20[i] > 0.0 { closes[i] / sma20[i] - 1.0 } else { 0.0 };

        out[i] = Some([
            rsi[i] / 100.0,
            macd_n.clamp(-3.0, 3.0),
            pct_b[i].clamp(-0.5, 1.5),
            atr_pct.min(0.1),
            vol_r.clamp(0.1, 5.0),
            mom5.clamp(-0.15, 0.15),
            mom10.clamp(-0.2, 0.2),
            mom20.clamp(-0.25, 0.25),
            dev.clamp(-0.1, 0.1),
        ]);
    }
    out
}

/// Build binary labels: 1 if the forward `days`-bar return exceeds `threshold`.
fn build_labels(closes: &[f64], forward_days: usize, threshold: f64) -> Vec<Option<f64>> {
    let n = closes.len();
    let mut out = vec![None; n];
    for i in 0..n.saturating_sub(forward_days) {
        if closes[i] > 0.0 {
            let fwd = closes[i + forward_days] / closes[i] - 1.0;
            out[i] = Some(if fwd > threshold { 1.0 } else { 0.0 });
        }
    }
    out
}

// ────────────────────────────────────────────────────────────────────────────
// Single-symbol backtest loop
// ────────────────────────────────────────────────────────────────────────────

fn run_symbol(
    symbol: &str,
    bars: &[Bar],
    capital: f64,
    n_estimators: usize,
    buy_threshold: f64,
    sell_threshold: f64,
    max_hold_days: usize,
    forward_days: usize,
    return_threshold: f64,
    commission_bps: f64,
    slippage_bps: f64,
) -> (Vec<RawTrade>, Vec<f64>) {
    let n = bars.len();
    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
    let features = build_features(bars);
    let labels = build_labels(&closes, forward_days, return_threshold);

    let min_train = 252_usize;
    let retrain_every = 63_usize;
    let comm = commission_bps / 10_000.0;
    let slip = slippage_bps / 10_000.0;

    let mut trades: Vec<RawTrade> = Vec::new();
    let mut equity_per_bar: Vec<f64> = vec![capital; n];
    let mut cash = capital;
    // (entry_price, quantity, entry_bar_idx)
    let mut position: Option<(f64, f64, usize)> = None;

    let mut model = GBClassifier::new(0.1, n_estimators);
    let mut model_ready = false;

    for i in 0..n {
        // ── Retrain gate ────────────────────────────────────────────────
        if i >= min_train && (!model_ready || (i - min_train) % retrain_every == 0) {
            let train_start = i.saturating_sub(min_train * 2);
            let (mut fx, mut fy): (Vec<Vec<f64>>, Vec<f64>) = (Vec::new(), Vec::new());
            for j in train_start..i {
                if let (Some(f), Some(l)) = (&features[j], labels[j]) {
                    fx.push(f.to_vec());
                    fy.push(l);
                }
            }
            // Require at least 50 samples and both classes present.
            let pos = fy.iter().filter(|&&v| v > 0.5).count();
            if fx.len() >= 50 && pos > 5 && pos < fy.len() - 5 {
                model = GBClassifier::new(0.1, n_estimators);
                model.fit(&fx, &fy);
                model_ready = true;
            }
        }

        // ── Mark-to-market equity ────────────────────────────────────────
        let mtm = match &position {
            None => cash,
            Some((_, qty, _)) => cash + closes[i] * qty,
        };
        equity_per_bar[i] = mtm;

        if i < min_train || !model_ready {
            continue;
        }

        let feat = match &features[i] {
            Some(f) => f,
            None => continue,
        };

        let prob = model.predict_proba_one(feat.as_ref());

        match position {
            None => {
                if prob > buy_threshold {
                    let entry = closes[i] * (1.0 + slip);
                    let fee = cash * comm;
                    let qty = (cash - fee) / entry;
                    cash -= fee + entry * qty;
                    position = Some((entry, qty, i));
                }
            }
            Some((ep, qty, ei)) => {
                let held = i - ei;
                if prob < sell_threshold || held >= max_hold_days {
                    let exit = closes[i] * (1.0 - slip);
                    let fee = exit * qty * comm;
                    let pnl = (exit - ep) * qty - fee;
                    let pnl_pct = exit / ep - 1.0;
                    let total_slip = (ep - closes[ei]) * qty + (closes[i] - exit) * qty;
                    cash += exit * qty - fee;
                    trades.push(RawTrade {
                        symbol: symbol.to_string(),
                        side: "long".to_string(),
                        entry_price: ep,
                        exit_price: exit,
                        quantity: qty,
                        entry_time: bars[ei].ts,
                        exit_time: bars[i].ts,
                        pnl,
                        pnl_pct,
                        fees: fee,
                        slippage: total_slip.abs(),
                    });
                    position = None;
                }
            }
        }

        equity_per_bar[i] = match &position {
            None => cash,
            Some((_, qty, _)) => cash + closes[i] * qty,
        };
    }

    // Force-close any open position at end of data.
    if let Some((ep, qty, ei)) = position {
        let last = n - 1;
        let exit = closes[last] * (1.0 - slip);
        let fee = exit * qty * comm;
        let pnl = (exit - ep) * qty - fee;
        let pnl_pct = exit / ep - 1.0;
        cash += exit * qty - fee;
        trades.push(RawTrade {
            symbol: symbol.to_string(),
            side: "long".to_string(),
            entry_price: ep,
            exit_price: exit,
            quantity: qty,
            entry_time: bars[ei].ts,
            exit_time: bars[last].ts,
            pnl,
            pnl_pct,
            fees: fee,
            slippage: 0.0,
        });
        equity_per_bar[last] = cash;
    }

    (trades, equity_per_bar)
}

// ────────────────────────────────────────────────────────────────────────────
// Strategy implementation
// ────────────────────────────────────────────────────────────────────────────

pub struct XGBoostClassifier;

impl XGBoostClassifier {
    pub fn new() -> Self {
        Self
    }
}

impl TradingStrategy for XGBoostClassifier {
    fn meta(&self) -> StrategyMeta {
        StrategyMeta {
            code_key: "xgboost_classifier_v3",
            name: "XGBoost Classifier v3",
            strategy_type: "ml_classifier",
            asset_class: "equity",
            description: "Gradient boosted tree classifier on 9 technical features \
                (RSI, MACD, Bollinger %B, ATR, volume ratio, momentum 5/10/20-day, \
                price deviation). Walk-forward training with 252-bar window, \
                5-day forward return target. Long-only, single position per symbol.",
            default_parameters: serde_json::json!({
                "symbols": ["AAPL", "MSFT", "SPY", "QQQ"],
                "n_estimators": 100,
                "buy_threshold": 0.58,
                "sell_threshold": 0.42,
                "max_hold_days": 10,
                "forward_days": 5,
                "return_threshold": 0.003
            }),
        }
    }

    fn run(
        &self,
        bars_by_symbol: &HashMap<String, Vec<Bar>>,
        params: &serde_json::Value,
        config: &RunConfig,
    ) -> Result<StrategyResult, String> {
        let symbols: Vec<String> = params["symbols"]
            .as_array()
            .ok_or("params.symbols must be an array")?
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        let n_est = params["n_estimators"].as_u64().unwrap_or(100) as usize;
        let buy_t = params["buy_threshold"].as_f64().unwrap_or(0.58);
        let sell_t = params["sell_threshold"].as_f64().unwrap_or(0.42);
        let max_hold = params["max_hold_days"].as_u64().unwrap_or(10) as usize;
        let fwd_days = params["forward_days"].as_u64().unwrap_or(5) as usize;
        let ret_thr = params["return_threshold"].as_f64().unwrap_or(0.003);

        // Only trade symbols that actually have data.
        let tradeable: Vec<&str> = symbols
            .iter()
            .filter_map(|s| {
                let bars = bars_by_symbol.get(s.as_str())?;
                if bars.len() >= 300 { Some(s.as_str()) } else { None }
            })
            .collect();

        if tradeable.is_empty() {
            return Err(format!(
                "no market data found for any of the requested symbols: {:?}. \
                 Fetch data first via POST /api/v1/market-data/fetch.",
                symbols
            ));
        }

        let capital_per = config.initial_capital / tradeable.len() as f64;
        let mut all_trades: Vec<RawTrade> = Vec::new();
        // Map from timestamp → cumulative equity (sum across symbols).
        let mut equity_map: HashMap<i64, f64> = HashMap::new();

        for sym in &tradeable {
            let bars = &bars_by_symbol[*sym];
            let (trades, eq_per_bar) = run_symbol(
                sym,
                bars,
                capital_per,
                n_est,
                buy_t,
                sell_t,
                max_hold,
                fwd_days,
                ret_thr,
                config.commission_bps,
                config.slippage_bps,
            );
            all_trades.extend(trades);
            for (bar, &eq) in bars.iter().zip(eq_per_bar.iter()) {
                *equity_map.entry(bar.ts.timestamp()).or_insert(0.0) += eq;
            }
        }

        // Rebuild equity curve sorted by timestamp.
        let mut ts_sorted: Vec<i64> = equity_map.keys().copied().collect();
        ts_sorted.sort_unstable();

        let equity_curve: Vec<(chrono::DateTime<chrono::Utc>, f64)> = ts_sorted
            .into_iter()
            .map(|ts_secs| {
                let dt = chrono::DateTime::from_timestamp(ts_secs, 0)
                    .unwrap_or_default();
                (dt, equity_map[&ts_secs])
            })
            .collect();

        Ok(StrategyResult {
            trades: all_trades,
            equity_curve,
        })
    }
}
