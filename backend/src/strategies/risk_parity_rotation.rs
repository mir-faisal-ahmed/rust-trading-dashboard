use std::collections::HashMap;

use chrono::{DateTime, Utc};

use super::{Bar, RawTrade, RunConfig, StrategyMeta, StrategyResult, TradingStrategy};

pub struct RiskParityRotation;

impl RiskParityRotation {
    pub fn new() -> Self {
        Self
    }
}

#[derive(Clone)]
struct Position {
    qty: f64,
    entry_price: f64,
    entry_time: DateTime<Utc>,
}

fn rolling_vol(closes: &[f64], i: usize, lookback: usize) -> Option<f64> {
    if i < lookback || lookback < 2 {
        return None;
    }
    let mut rets = Vec::with_capacity(lookback - 1);
    for j in (i + 1 - lookback)..=i {
        if j == 0 {
            continue;
        }
        let prev = closes[j - 1];
        let cur = closes[j];
        if prev <= 0.0 {
            continue;
        }
        rets.push(cur / prev - 1.0);
    }
    if rets.len() < 2 {
        return None;
    }
    let mean = rets.iter().sum::<f64>() / rets.len() as f64;
    let var = rets.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / rets.len() as f64;
    Some(var.sqrt())
}

fn momentum(closes: &[f64], i: usize, lookback: usize) -> Option<f64> {
    if i < lookback {
        return None;
    }
    let prev = closes[i - lookback];
    if prev <= 0.0 {
        return None;
    }
    Some(closes[i] / prev - 1.0)
}

impl TradingStrategy for RiskParityRotation {
    fn meta(&self) -> StrategyMeta {
        StrategyMeta {
            code_key: "risk_parity_rotation_v1",
            name: "Risk Parity Rotation",
            strategy_type: "stat_arb",
            asset_class: "equity",
            description: "Research-backed risk-parity allocation across ETFs with momentum gating. Weights are inverse-volatility, then filtered by positive medium-term momentum.",
            default_parameters: serde_json::json!({
                "symbols": ["SPY", "QQQ", "TLT", "GLD", "XLF", "XLK", "XLE", "VNQ"],
                "vol_lookback": 63,
                "momentum_lookback": 126,
                "rebalance_every_bars": 21,
                "max_weight": 0.35,
                "min_momentum": 0.0,
                "cash_symbol": "SHY",
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
        let cash_symbol = params["cash_symbol"].as_str().unwrap_or("SHY").to_string();

        let vol_lookback = params["vol_lookback"].as_u64().unwrap_or(63) as usize;
        let mom_lookback = params["momentum_lookback"].as_u64().unwrap_or(126) as usize;
        let rebalance_every = params["rebalance_every_bars"].as_u64().unwrap_or(21) as usize;
        let max_weight = params["max_weight"].as_f64().unwrap_or(0.35);
        let min_momentum = params["min_momentum"].as_f64().unwrap_or(0.0);

        let mut universe: Vec<String> = symbols
            .iter()
            .filter(|s| bars_by_symbol.contains_key(s.as_str()))
            .cloned()
            .collect();
        if bars_by_symbol.contains_key(cash_symbol.as_str()) {
            universe.push(cash_symbol.clone());
        }
        if universe.is_empty() {
            return Err("no bars for configured risk parity symbols".to_string());
        }

        let n_bars = universe
            .iter()
            .filter_map(|s| bars_by_symbol.get(s).map(|b| b.len()))
            .max()
            .unwrap_or(0);
        if n_bars == 0 {
            return Err("empty bars".to_string());
        }

        let comm = config.commission_bps / 10_000.0;
        let slip = config.slippage_bps / 10_000.0;

        let mut cash = config.initial_capital;
        let mut positions: HashMap<String, Position> = HashMap::new();
        let mut trades: Vec<RawTrade> = Vec::new();
        let mut equity_curve: Vec<(DateTime<Utc>, f64)> = Vec::with_capacity(n_bars);

        for i in 0..n_bars {
            let ts = universe
                .iter()
                .find_map(|s| bars_by_symbol.get(s).and_then(|b| b.get(i)).map(|bar| bar.ts))
                .unwrap_or_else(Utc::now);

            if i >= mom_lookback && i % rebalance_every == 0 {
                // build target weights
                let mut inv_vol_scores: Vec<(String, f64)> = Vec::new();
                for sym in &symbols {
                    let Some(bars) = bars_by_symbol.get(sym) else { continue };
                    if i >= bars.len() {
                        continue;
                    }
                    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
                    let mom = momentum(&closes, i, mom_lookback).unwrap_or(-1.0);
                    if mom < min_momentum {
                        continue;
                    }
                    let vol = rolling_vol(&closes, i, vol_lookback).unwrap_or(1.0);
                    if vol <= 0.0 {
                        continue;
                    }
                    inv_vol_scores.push((sym.clone(), 1.0 / vol));
                }

                let mut target_w: HashMap<String, f64> = HashMap::new();
                let score_sum: f64 = inv_vol_scores.iter().map(|(_, s)| *s).sum();
                if score_sum > 0.0 {
                    for (sym, s) in inv_vol_scores {
                        let w = (s / score_sum).min(max_weight);
                        target_w.insert(sym, w);
                    }
                }

                let allocated: f64 = target_w.values().sum();
                if allocated < 0.98 {
                    target_w.insert(cash_symbol.clone(), (1.0 - allocated).max(0.0));
                }

                let equity = cash
                    + positions
                        .iter()
                        .filter_map(|(sym, p)| bars_by_symbol.get(sym).and_then(|b| b.get(i)).map(|bar| p.qty * bar.close))
                        .sum::<f64>();

                // execute to target
                // sell first
                let held_symbols: Vec<String> = positions.keys().cloned().collect();
                for sym in held_symbols {
                    let cur_val = if let (Some(p), Some(bar)) = (positions.get(&sym), bars_by_symbol.get(&sym).and_then(|b| b.get(i))) {
                        p.qty * bar.close
                    } else {
                        0.0
                    };
                    let tgt = target_w.get(&sym).copied().unwrap_or(0.0) * equity;
                    if cur_val <= tgt {
                        continue;
                    }
                    let delta = cur_val - tgt;
                    if let (Some(pos), Some(bar)) = (positions.get_mut(&sym), bars_by_symbol.get(&sym).and_then(|b| b.get(i))) {
                        let qty_sell = (delta / bar.close).min(pos.qty);
                        if qty_sell <= 0.0 {
                            continue;
                        }
                        let exit_price = bar.close * (1.0 - slip);
                        let fee = exit_price * qty_sell * comm;
                        let proceeds = exit_price * qty_sell - fee;
                        let pnl = proceeds - pos.entry_price * qty_sell;
                        let pnl_pct = if pos.entry_price > 0.0 { exit_price / pos.entry_price - 1.0 } else { 0.0 };
                        cash += proceeds;
                        pos.qty -= qty_sell;
                        trades.push(RawTrade {
                            symbol: sym.clone(),
                            side: "long".to_string(),
                            entry_price: pos.entry_price,
                            exit_price,
                            quantity: qty_sell,
                            entry_time: pos.entry_time,
                            exit_time: bar.ts,
                            pnl,
                            pnl_pct,
                            fees: fee,
                            slippage: qty_sell * bar.close * slip,
                        });
                    }
                    if positions.get(&sym).map(|p| p.qty <= 1e-8).unwrap_or(false) {
                        positions.remove(&sym);
                    }
                }

                // buy next
                for (sym, w) in target_w {
                    let Some(bar) = bars_by_symbol.get(&sym).and_then(|b| b.get(i)) else { continue };
                    let target_value = w * equity;
                    let current_value = positions.get(&sym).map(|p| p.qty * bar.close).unwrap_or(0.0);
                    if target_value <= current_value {
                        continue;
                    }
                    let to_buy = (target_value - current_value).min(cash);
                    if to_buy <= 0.0 {
                        continue;
                    }
                    let entry_price = bar.close * (1.0 + slip);
                    let qty = (to_buy / entry_price).floor();
                    if qty <= 0.0 {
                        continue;
                    }
                    let fee = entry_price * qty * comm;
                    let cost = entry_price * qty + fee;
                    if cost > cash {
                        continue;
                    }
                    cash -= cost;
                    positions
                        .entry(sym)
                        .and_modify(|p| {
                            let old_val = p.qty * p.entry_price;
                            let new_val = qty * entry_price;
                            p.qty += qty;
                            p.entry_price = (old_val + new_val) / p.qty;
                        })
                        .or_insert(Position {
                            qty,
                            entry_price,
                            entry_time: bar.ts,
                        });
                }
            }

            let mark = positions
                .iter()
                .filter_map(|(sym, p)| bars_by_symbol.get(sym).and_then(|b| b.get(i)).map(|bar| p.qty * bar.close))
                .sum::<f64>();
            equity_curve.push((ts, cash + mark));
        }

        Ok(StrategyResult {
            trades,
            equity_curve,
            predicted_equity: None,
        })
    }
}
