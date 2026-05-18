use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;

use super::{Bar, RawTrade, RunConfig, StrategyMeta, StrategyResult, TradingStrategy};
use crate::strategies::indicators;

#[derive(Deserialize)]
struct FinRLParams {
    symbols: Vec<String>,
    model_id: String,
    #[serde(default = "default_grpc_endpoint")]
    grpc_endpoint: String,
    #[serde(default = "default_threshold")]
    rebalance_threshold_pct: f64,
    #[serde(default = "default_warmup")]
    warmup_bars: usize,
}

fn default_grpc_endpoint() -> String {
    std::env::var("FINRL_GRPC_ENDPOINT")
        .unwrap_or_else(|_| "http://finrl-service:50051".to_string())
}
fn default_threshold() -> f64 { 5.0 }
fn default_warmup()    -> usize { 20 }

// ─────────────────────────────────────────────────────────────────────────────
// Feature engineering: flat vector sent to the Python model.
// Order MUST match what the model was trained on.
// Indices: [close_norm, rsi/100, (close-sma20)/close, atr/close, vol_ratio]
//          repeated for each symbol, then concatenated.
// ─────────────────────────────────────────────────────────────────────────────
fn extract_features(bars_by_symbol: &HashMap<String, Vec<Bar>>, symbols: &[String], bar_idx: usize) -> Vec<f64> {
    let mut features = Vec::with_capacity(symbols.len() * 5);

    for sym in symbols {
        let bars = match bars_by_symbol.get(sym) {
            Some(b) => b,
            None => {
                features.extend_from_slice(&[0.0; 5]);
                continue;
            }
        };
        if bar_idx >= bars.len() {
            features.extend_from_slice(&[0.0; 5]);
            continue;
        }

        let closes: Vec<f64> = bars[..=bar_idx].iter().map(|b| b.close).collect();
        let highs:  Vec<f64> = bars[..=bar_idx].iter().map(|b| b.high).collect();
        let lows:   Vec<f64> = bars[..=bar_idx].iter().map(|b| b.low).collect();
        let vols:   Vec<f64> = bars[..=bar_idx].iter().map(|b| b.volume).collect();

        let rsi   = indicators::rsi(&closes, 14);
        let sma20 = indicators::sma(&closes, 20);
        let atr   = indicators::atr(&highs, &lows, &closes, 14);
        let vsma  = indicators::sma(&vols, 20);

        let i      = closes.len() - 1;
        let close  = closes[i];
        let first  = closes.first().copied().unwrap_or(1.0);
        let rsi_v  = rsi[i].clamp(0.0, 100.0) / 100.0;
        let dev    = if close > 0.0 { (close - sma20[i]) / close } else { 0.0 };
        let atr_v  = if close > 0.0 { atr[i] / close } else { 0.0 };
        let vol_r  = if vsma[i] > 0.0 { (vols[i] / vsma[i]).min(5.0) } else { 1.0 };
        let norm   = if first > 0.0 { close / first } else { 1.0 };

        features.extend_from_slice(&[norm, rsi_v, dev, atr_v, vol_r]);
    }

    features
}

// ─────────────────────────────────────────────────────────────────────────────
// Call the Python gRPC service from synchronous strategy code.
// ─────────────────────────────────────────────────────────────────────────────
fn call_grpc(endpoint: &str, model_id: &str, features: Vec<f64>, symbols: Vec<String>) -> Result<HashMap<String, f64>, String> {
    let endpoint  = endpoint.to_string();
    let model_id  = model_id.to_string();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("tokio runtime error: {e}"))?;

        rt.block_on(async {
            let mut client = crate::grpc::FinRLClient::connect(&endpoint)
                .await
                .map_err(|e| format!("gRPC connect failed: {e}"))?;
            client
                .predict_weights(&model_id, features, symbols)
                .await
                .map_err(|e| format!("gRPC predict failed: {e}"))
        })
    })
    .join()
    .map_err(|_| "gRPC thread panicked".to_string())?
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebalancer
// ─────────────────────────────────────────────────────────────────────────────
struct Rebalancer {
    positions: HashMap<String, (f64, f64)>, // symbol → (qty, avg_entry_price)
    cash: f64,
}

impl Rebalancer {
    fn new(initial_cash: f64) -> Self {
        Self { positions: HashMap::new(), cash: initial_cash }
    }

    fn equity(&self, prices: &HashMap<String, f64>) -> f64 {
        let pos_value: f64 = self.positions.iter().map(|(sym, (qty, _))| {
            qty * prices.get(sym).copied().unwrap_or(0.0)
        }).sum();
        self.cash + pos_value
    }

    fn rebalance(
        &mut self,
        target_weights: &HashMap<String, f64>,
        prices: &HashMap<String, f64>,
        threshold_pct: f64,
        commission_bps: f64,
        slippage_bps: f64,
        ts: DateTime<Utc>,
    ) -> Vec<RawTrade> {
        let comm = commission_bps / 10_000.0;
        let slip = slippage_bps  / 10_000.0;
        let total_eq = self.equity(prices);
        let mut trades = Vec::new();

        for (sym, &target_w) in target_weights {
            let price = match prices.get(sym) {
                Some(&p) if p > 0.0 => p,
                _ => continue,
            };
            let target_value   = total_eq * target_w;
            let (cur_qty, _cur_entry) = self.positions.get(sym).copied().unwrap_or((0.0, price));
            let current_value  = cur_qty * price;
            let delta_pct      = (target_value - current_value).abs() / total_eq * 100.0;

            if delta_pct < threshold_pct {
                continue;
            }

            if target_value > current_value {
                let buy_amount = target_value - current_value;
                let fill_price = price * (1.0 + slip);
                let fee        = buy_amount * comm;
                let qty        = (buy_amount - fee) / fill_price;

                if qty * fill_price > self.cash { continue; }

                self.cash -= qty * fill_price + fee;

                let (old_qty, old_entry) = self.positions.get(sym).copied().unwrap_or((0.0, fill_price));
                let new_qty   = old_qty + qty;
                let new_entry = if new_qty > 0.0 {
                    (old_qty * old_entry + qty * fill_price) / new_qty
                } else { fill_price };
                self.positions.insert(sym.clone(), (new_qty, new_entry));

                trades.push(RawTrade {
                    symbol:      sym.clone(),
                    side:        "long".to_string(),
                    entry_price: fill_price,
                    exit_price:  fill_price,
                    quantity:    qty,
                    entry_time:  ts,
                    exit_time:   ts,
                    pnl:         0.0,
                    pnl_pct:     0.0,
                    fees:        fee,
                    slippage:    qty * price * slip,
                });
            } else {
                let (cur_q, entry_p) = match self.positions.get(sym) {
                    Some(&v) if v.0 > 0.0 => v,
                    _ => continue,
                };
                let sell_qty   = ((current_value - target_value) / price).min(cur_q);
                let fill_price = price * (1.0 - slip);
                let fee        = sell_qty * fill_price * comm;
                let pnl        = (fill_price - entry_p) * sell_qty - fee;
                let pnl_pct    = fill_price / entry_p - 1.0;

                self.cash += sell_qty * fill_price - fee;

                let remaining = cur_q - sell_qty;
                if remaining > 1e-8 {
                    self.positions.insert(sym.clone(), (remaining, entry_p));
                } else {
                    self.positions.remove(sym);
                }

                trades.push(RawTrade {
                    symbol:      sym.clone(),
                    side:        "long".to_string(),
                    entry_price: entry_p,
                    exit_price:  fill_price,
                    quantity:    sell_qty,
                    entry_time:  ts,
                    exit_time:   ts,
                    pnl,
                    pnl_pct,
                    fees:        fee,
                    slippage:    sell_qty * price * slip,
                });
            }
        }
        trades
    }

    fn close_all(
        &mut self,
        prices: &HashMap<String, f64>,
        commission_bps: f64,
        slippage_bps: f64,
        ts: DateTime<Utc>,
    ) -> Vec<RawTrade> {
        let zero_weights: HashMap<String, f64> = prices.keys().map(|k| (k.clone(), 0.0)).collect();
        self.rebalance(&zero_weights, prices, 0.0, commission_bps, slippage_bps, ts)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy implementation -- parameterized by model algorithm
// ─────────────────────────────────────────────────────────────────────────────
pub struct FinRLGrpcStrategy {
    pub code_key:    &'static str,
    pub model_id:    &'static str,
    pub display_name: &'static str,
    pub algo_desc:   &'static str,
}

impl FinRLGrpcStrategy {
    pub fn ppo() -> Self {
        Self {
            code_key:     "finrl_ppo",
            model_id:     "ppo_v1",
            display_name: "FinRL PPO Portfolio",
            algo_desc:    "Proximal Policy Optimization -- clipped surrogate objective for stable policy updates.",
        }
    }
    pub fn sac() -> Self {
        Self {
            code_key:     "finrl_sac",
            model_id:     "sac_v1",
            display_name: "FinRL SAC Portfolio",
            algo_desc:    "Soft Actor-Critic -- maximum-entropy RL for better exploration and robustness.",
        }
    }
    pub fn a2c() -> Self {
        Self {
            code_key:     "finrl_a2c",
            model_id:     "a2c_v1",
            display_name: "FinRL A2C Portfolio",
            algo_desc:    "Advantage Actor-Critic -- synchronous on-policy policy gradient with value baseline.",
        }
    }
    pub fn td3() -> Self {
        Self {
            code_key:     "finrl_td3",
            model_id:     "td3_v1",
            display_name: "FinRL TD3 Portfolio",
            algo_desc:    "Twin Delayed DDPG -- double critics and delayed policy updates to reduce overestimation.",
        }
    }
}

impl TradingStrategy for FinRLGrpcStrategy {
    fn meta(&self) -> StrategyMeta {
        let endpoint = std::env::var("FINRL_GRPC_ENDPOINT")
            .unwrap_or_else(|_| "http://finrl-service:50051".to_string());
        StrategyMeta {
            code_key:      self.code_key,
            name:          self.display_name,
            strategy_type: "rl_portfolio_optimization",
            asset_class:   "equity",
            description:   self.algo_desc,
            default_parameters: json!({
                "symbols":                 ["AAPL", "MSFT", "GOOGL"],
                "model_id":                self.model_id,
                "grpc_endpoint":           endpoint,
                "rebalance_threshold_pct": 2.0,
                "warmup_bars":             20,
            }),
        }
    }

    fn run(
        &self,
        bars_by_symbol: &HashMap<String, Vec<Bar>>,
        params: &serde_json::Value,
        config: &RunConfig,
    ) -> Result<StrategyResult, String> {
        let p: FinRLParams = serde_json::from_value(params.clone())
            .map_err(|e| format!("invalid FinRL params: {e}"))?;

        let tradeable: Vec<String> = p.symbols.iter()
            .filter(|s| bars_by_symbol.contains_key(s.as_str()))
            .cloned()
            .collect();
        if tradeable.is_empty() {
            return Err("no market data found for requested symbols".into());
        }

        let n_bars = tradeable.iter()
            .filter_map(|s| bars_by_symbol.get(s).map(|b| b.len()))
            .max()
            .unwrap_or(0);
        if n_bars == 0 {
            return Err("empty bar data".into());
        }

        let mut rebalancer     = Rebalancer::new(config.initial_capital);
        let mut pred_rebalancer = Rebalancer::new(config.initial_capital);
        let mut all_trades     = Vec::new();
        let mut equity_curve   = Vec::with_capacity(n_bars);
        let mut pred_curve     = Vec::with_capacity(n_bars);
        let comm = config.commission_bps;
        let slip = config.slippage_bps;

        for i in 0..n_bars {
            let prices: HashMap<String, f64> = tradeable.iter().filter_map(|sym| {
                bars_by_symbol.get(sym).and_then(|b| b.get(i)).map(|bar| (sym.clone(), bar.close))
            }).collect();

            let ts = tradeable.iter()
                .find_map(|s| bars_by_symbol.get(s).and_then(|b| b.get(i)).map(|b| b.ts))
                .unwrap_or_else(Utc::now);

            equity_curve.push((ts, rebalancer.equity(&prices)));
            pred_curve.push((ts, pred_rebalancer.equity(&prices)));

            if i < p.warmup_bars {
                continue;
            }

            let features = extract_features(bars_by_symbol, &tradeable, i);
            let weights = match call_grpc(&p.grpc_endpoint, &p.model_id, features, tradeable.clone()) {
                Ok(w) => w,
                Err(e) => {
                    tracing::warn!("FinRL gRPC error at bar {i}: {e} -- holding current weights");
                    continue;
                }
            };

            // Actual portfolio: respects rebalance threshold
            let trades = rebalancer.rebalance(
                &weights, &prices,
                p.rebalance_threshold_pct,
                comm, slip, ts,
            );
            all_trades.extend(trades);

            // Predicted portfolio: follows model weights exactly (no threshold)
            pred_rebalancer.rebalance(&weights, &prices, 0.0, comm, slip, ts);
        }

        if let Some(&(last_ts, _)) = equity_curve.last() {
            let last_prices: HashMap<String, f64> = tradeable.iter().filter_map(|sym| {
                bars_by_symbol.get(sym)
                    .and_then(|b| b.last())
                    .map(|bar| (sym.clone(), bar.close))
            }).collect();

            let close_trades = rebalancer.close_all(&last_prices, comm, slip, last_ts);
            all_trades.extend(close_trades);
            pred_rebalancer.close_all(&last_prices, comm, slip, last_ts);

            if let Some(last) = equity_curve.last_mut() {
                last.1 = rebalancer.equity(&last_prices);
            }
            if let Some(last) = pred_curve.last_mut() {
                last.1 = pred_rebalancer.equity(&last_prices);
            }
        }

        Ok(StrategyResult {
            trades: all_trades,
            equity_curve,
            predicted_equity: Some(pred_curve),
        })
    }
}
