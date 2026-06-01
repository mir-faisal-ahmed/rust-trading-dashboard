use std::collections::HashMap;

use chrono::{DateTime, Utc};

use super::{Bar, RawTrade, RunConfig, StrategyMeta, StrategyResult, TradingStrategy};

pub struct DualMomentumRotation;

impl DualMomentumRotation {
    pub fn new() -> Self {
        Self
    }
}

#[derive(Clone)]
struct Position {
    symbol: String,
    qty: f64,
    entry_price: f64,
    entry_time: DateTime<Utc>,
}

fn ret_over(prices: &[f64], i: usize, lookback: usize) -> Option<f64> {
    if i < lookback {
        return None;
    }
    let prev = prices[i - lookback];
    let cur = prices[i];
    if prev <= 0.0 {
        return None;
    }
    Some(cur / prev - 1.0)
}

impl TradingStrategy for DualMomentumRotation {
    fn meta(&self) -> StrategyMeta {
        StrategyMeta {
            code_key: "dual_momentum_rotation_v1",
            name: "Dual Momentum Rotation",
            strategy_type: "trend_following",
            asset_class: "equity",
            description: "Relative + absolute momentum rotation inspired by dual-momentum research. Monthly rotation into strongest risk-on asset when absolute momentum is positive, otherwise rotates into defensive assets.",
            default_parameters: serde_json::json!({
                "risk_on_symbols": ["QQQ", "SPY", "IWM", "EFA"],
                "defensive_symbols": ["TLT", "IEF", "GLD", "SHY"],
                "lookback_days": 126,
                "absolute_momentum_threshold": 0.0,
                "rebalance_every_bars": 21,
            }),
        }
    }

    fn run(
        &self,
        bars_by_symbol: &HashMap<String, Vec<Bar>>,
        params: &serde_json::Value,
        config: &RunConfig,
    ) -> Result<StrategyResult, String> {
        let risk_on: Vec<String> = params["risk_on_symbols"]
            .as_array()
            .ok_or("params.risk_on_symbols must be an array")?
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        let defensive: Vec<String> = params["defensive_symbols"]
            .as_array()
            .ok_or("params.defensive_symbols must be an array")?
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();

        let lookback_days = params["lookback_days"].as_u64().unwrap_or(126) as usize;
        let rebalance_every = params["rebalance_every_bars"].as_u64().unwrap_or(21) as usize;
        let abs_threshold = params["absolute_momentum_threshold"].as_f64().unwrap_or(0.0);

        let universe: Vec<String> = risk_on
            .iter()
            .chain(defensive.iter())
            .filter(|s| bars_by_symbol.contains_key(s.as_str()))
            .cloned()
            .collect();

        if universe.is_empty() {
            return Err("no bars available for configured symbols".to_string());
        }

        let n_bars = universe
            .iter()
            .filter_map(|s| bars_by_symbol.get(s).map(|b| b.len()))
            .max()
            .unwrap_or(0);
        if n_bars == 0 {
            return Err("empty bars".to_string());
        }

        let mut cash = config.initial_capital;
        let mut pos: Option<Position> = None;
        let mut trades: Vec<RawTrade> = Vec::new();
        let mut equity_curve: Vec<(DateTime<Utc>, f64)> = Vec::with_capacity(n_bars);

        let comm = config.commission_bps / 10_000.0;
        let slip = config.slippage_bps / 10_000.0;

        for i in 0..n_bars {
            let ts = universe
                .iter()
                .find_map(|s| bars_by_symbol.get(s).and_then(|b| b.get(i)).map(|b| b.ts))
                .unwrap_or_else(Utc::now);

            if i >= lookback_days && i % rebalance_every == 0 {
                let mut best_risk_on: Option<(String, f64)> = None;
                for sym in &risk_on {
                    let Some(bars) = bars_by_symbol.get(sym) else { continue };
                    if i >= bars.len() {
                        continue;
                    }
                    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
                    if let Some(r) = ret_over(&closes, i, lookback_days) {
                        if best_risk_on.as_ref().map(|(_, br)| r > *br).unwrap_or(true) {
                            best_risk_on = Some((sym.clone(), r));
                        }
                    }
                }

                let target = if let Some((sym, r)) = best_risk_on {
                    if r > abs_threshold {
                        Some(sym)
                    } else {
                        let mut best_def: Option<(String, f64)> = None;
                        for ds in &defensive {
                            let Some(bars) = bars_by_symbol.get(ds) else { continue };
                            if i >= bars.len() {
                                continue;
                            }
                            let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
                            if let Some(dr) = ret_over(&closes, i, lookback_days) {
                                if best_def.as_ref().map(|(_, br)| dr > *br).unwrap_or(true) {
                                    best_def = Some((ds.clone(), dr));
                                }
                            }
                        }
                        best_def.map(|(s, _)| s)
                    }
                } else {
                    None
                };

                if let Some(target_sym) = target {
                    let same = pos.as_ref().map(|p| p.symbol == target_sym).unwrap_or(false);
                    if !same {
                        // close current
                        if let Some(current) = pos.take() {
                            if let Some(exit_bar) = bars_by_symbol.get(&current.symbol).and_then(|b| b.get(i)) {
                                let exit_price = exit_bar.close * (1.0 - slip);
                                let fee = exit_price * current.qty * comm;
                                let proceeds = exit_price * current.qty - fee;
                                let pnl = proceeds - current.entry_price * current.qty;
                                let pnl_pct = if current.entry_price > 0.0 { exit_price / current.entry_price - 1.0 } else { 0.0 };
                                cash += proceeds;
                                trades.push(RawTrade {
                                    symbol: current.symbol,
                                    side: "long".to_string(),
                                    entry_price: current.entry_price,
                                    exit_price,
                                    quantity: current.qty,
                                    entry_time: current.entry_time,
                                    exit_time: exit_bar.ts,
                                    pnl,
                                    pnl_pct,
                                    fees: fee,
                                    slippage: current.qty * exit_bar.close * slip,
                                });
                            }
                        }

                        // open new
                        if let Some(entry_bar) = bars_by_symbol.get(&target_sym).and_then(|b| b.get(i)) {
                            let entry_price = entry_bar.close * (1.0 + slip);
                            let fee = cash * comm;
                            let invest = (cash - fee).max(0.0);
                            if invest > 0.0 && entry_price > 0.0 {
                                let qty = invest / entry_price;
                                cash = 0.0;
                                pos = Some(Position {
                                    symbol: target_sym,
                                    qty,
                                    entry_price,
                                    entry_time: entry_bar.ts,
                                });
                            }
                        }
                    }
                }
            }

            let mark = pos
                .as_ref()
                .and_then(|p| bars_by_symbol.get(&p.symbol).and_then(|b| b.get(i)).map(|bar| p.qty * bar.close))
                .unwrap_or(0.0);
            equity_curve.push((ts, cash + mark));
        }

        // close final position
        if let (Some(current), Some(&(ts, _))) = (pos.take(), equity_curve.last()) {
            if let Some(last_bar) = bars_by_symbol.get(&current.symbol).and_then(|b| b.last()) {
                let exit_price = last_bar.close * (1.0 - slip);
                let fee = exit_price * current.qty * comm;
                let proceeds = exit_price * current.qty - fee;
                let pnl = proceeds - current.entry_price * current.qty;
                let pnl_pct = if current.entry_price > 0.0 { exit_price / current.entry_price - 1.0 } else { 0.0 };
                cash += proceeds;
                trades.push(RawTrade {
                    symbol: current.symbol,
                    side: "long".to_string(),
                    entry_price: current.entry_price,
                    exit_price,
                    quantity: current.qty,
                    entry_time: current.entry_time,
                    exit_time: last_bar.ts,
                    pnl,
                    pnl_pct,
                    fees: fee,
                    slippage: current.qty * last_bar.close * slip,
                });
                if let Some(last) = equity_curve.last_mut() {
                    last.1 = cash;
                    last.0 = ts;
                }
            }
        }

        Ok(StrategyResult {
            trades,
            equity_curve,
            predicted_equity: None,
        })
    }
}
