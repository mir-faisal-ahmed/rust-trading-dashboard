use std::collections::HashMap;

use chrono::{DateTime, Utc};

use super::{indicators, Bar, RawTrade, RunConfig, StrategyMeta, StrategyResult, TradingStrategy};

pub struct TrendBreakout;

impl TrendBreakout {
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

impl TradingStrategy for TrendBreakout {
    fn meta(&self) -> StrategyMeta {
        StrategyMeta {
            code_key: "trend_breakout_v2",
            name: "Trend Breakout (TSMOM)",
            strategy_type: "trend_following",
            asset_class: "equity",
            description: "Time-series momentum breakout strategy using 50/200 trend filter and 20-day breakout entries with risk-based position sizing.",
            default_parameters: serde_json::json!({
                "symbols": ["SPY", "QQQ", "IWM", "XLF", "XLK", "XLE", "TLT", "GLD"],
                "fast_ma": 50,
                "slow_ma": 200,
                "breakout_lookback": 20,
                "risk_fraction_per_position": 0.12,
                "max_positions": 4,
                "atr_stop_mult": 3.0,
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

        let fast_ma = params["fast_ma"].as_u64().unwrap_or(50) as usize;
        let slow_ma = params["slow_ma"].as_u64().unwrap_or(200) as usize;
        let breakout_lookback = params["breakout_lookback"].as_u64().unwrap_or(20) as usize;
        let risk_fraction = params["risk_fraction_per_position"].as_f64().unwrap_or(0.12);
        let max_positions = params["max_positions"].as_u64().unwrap_or(4) as usize;
        let atr_mult = params["atr_stop_mult"].as_f64().unwrap_or(3.0);

        let tradeable: Vec<String> = symbols
            .into_iter()
            .filter(|s| bars_by_symbol.get(s).map(|b| b.len() >= slow_ma + breakout_lookback).unwrap_or(false))
            .collect();

        if tradeable.is_empty() {
            return Err("no symbols with enough bars for trend breakout".to_string());
        }

        let n_bars = tradeable
            .iter()
            .filter_map(|s| bars_by_symbol.get(s).map(|b| b.len()))
            .max()
            .unwrap_or(0);

        let comm = config.commission_bps / 10_000.0;
        let slip = config.slippage_bps / 10_000.0;

        let mut cash = config.initial_capital;
        let mut positions: HashMap<String, Position> = HashMap::new();
        let mut stop_levels: HashMap<String, f64> = HashMap::new();
        let mut trades: Vec<RawTrade> = Vec::new();
        let mut equity_curve: Vec<(DateTime<Utc>, f64)> = Vec::with_capacity(n_bars);

        for i in 0..n_bars {
            let ts = tradeable
                .iter()
                .find_map(|s| bars_by_symbol.get(s).and_then(|b| b.get(i)).map(|bar| bar.ts))
                .unwrap_or_else(Utc::now);

            // exits first
            let mut to_close: Vec<String> = Vec::new();
            for sym in positions.keys() {
                let Some(bars) = bars_by_symbol.get(sym) else { continue };
                if i >= bars.len() {
                    continue;
                }
                let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
                let sma_fast = indicators::sma(&closes, fast_ma);
                let sma_slow = indicators::sma(&closes, slow_ma);
                let bar = &bars[i];

                let stop_hit = stop_levels.get(sym).map(|s| bar.low <= *s).unwrap_or(false);
                let trend_broken = sma_fast[i].is_finite() && sma_slow[i].is_finite() && sma_fast[i] < sma_slow[i];
                if stop_hit || trend_broken {
                    to_close.push(sym.clone());
                }
            }

            for sym in to_close {
                if let (Some(pos), Some(bar)) = (positions.remove(&sym), bars_by_symbol.get(&sym).and_then(|b| b.get(i))) {
                    let exit_price = bar.close * (1.0 - slip);
                    let fee = exit_price * pos.qty * comm;
                    let proceeds = exit_price * pos.qty - fee;
                    let pnl = proceeds - pos.entry_price * pos.qty;
                    let pnl_pct = if pos.entry_price > 0.0 { exit_price / pos.entry_price - 1.0 } else { 0.0 };
                    cash += proceeds;
                    stop_levels.remove(&sym);
                    trades.push(RawTrade {
                        symbol: sym,
                        side: "long".to_string(),
                        entry_price: pos.entry_price,
                        exit_price,
                        quantity: pos.qty,
                        entry_time: pos.entry_time,
                        exit_time: bar.ts,
                        pnl,
                        pnl_pct,
                        fees: fee,
                        slippage: pos.qty * bar.close * slip,
                    });
                }
            }

            // entries
            if positions.len() < max_positions {
                for sym in &tradeable {
                    if positions.contains_key(sym) {
                        continue;
                    }
                    let Some(bars) = bars_by_symbol.get(sym) else { continue };
                    if i < slow_ma || i < breakout_lookback || i >= bars.len() {
                        continue;
                    }
                    let closes: Vec<f64> = bars.iter().map(|b| b.close).collect();
                    let highs: Vec<f64> = bars.iter().map(|b| b.high).collect();
                    let lows: Vec<f64> = bars.iter().map(|b| b.low).collect();
                    let sma_fast = indicators::sma(&closes, fast_ma);
                    let sma_slow = indicators::sma(&closes, slow_ma);
                    let atr = indicators::atr(&highs, &lows, &closes, 14);

                    if !(sma_fast[i].is_finite() && sma_slow[i].is_finite() && atr[i].is_finite()) {
                        continue;
                    }
                    if sma_fast[i] <= sma_slow[i] {
                        continue;
                    }

                    let window_start = i + 1 - breakout_lookback;
                    let prev_high = highs[window_start..i]
                        .iter()
                        .copied()
                        .fold(f64::NEG_INFINITY, f64::max);
                    let bar = &bars[i];
                    let breakout = bar.close > prev_high;
                    if !breakout {
                        continue;
                    }

                    let stop = (bar.close - atr[i] * atr_mult).max(0.0);
                    let risk_per_share = (bar.close - stop).max(0.01);
                    let capital_for_trade = cash * risk_fraction;
                    let qty = (capital_for_trade / (bar.close * (1.0 + slip))).floor();
                    if qty <= 0.0 {
                        continue;
                    }

                    let entry_price = bar.close * (1.0 + slip);
                    let fee = entry_price * qty * comm;
                    let cost = entry_price * qty + fee;
                    if cost > cash {
                        continue;
                    }

                    cash -= cost;
                    positions.insert(
                        sym.clone(),
                        Position {
                            qty,
                            entry_price,
                            entry_time: bar.ts,
                        },
                    );
                    stop_levels.insert(sym.clone(), stop);

                    if positions.len() >= max_positions {
                        break;
                    }
                }
            }

            let mark: f64 = positions
                .iter()
                .filter_map(|(sym, pos)| bars_by_symbol.get(sym).and_then(|b| b.get(i)).map(|bar| pos.qty * bar.close))
                .sum();
            equity_curve.push((ts, cash + mark));
        }

        // force close
        for (sym, pos) in positions {
            if let Some(last_bar) = bars_by_symbol.get(&sym).and_then(|b| b.last()) {
                let exit_price = last_bar.close * (1.0 - slip);
                let fee = exit_price * pos.qty * comm;
                let proceeds = exit_price * pos.qty - fee;
                let pnl = proceeds - pos.entry_price * pos.qty;
                let pnl_pct = if pos.entry_price > 0.0 { exit_price / pos.entry_price - 1.0 } else { 0.0 };
                trades.push(RawTrade {
                    symbol: sym,
                    side: "long".to_string(),
                    entry_price: pos.entry_price,
                    exit_price,
                    quantity: pos.qty,
                    entry_time: pos.entry_time,
                    exit_time: last_bar.ts,
                    pnl,
                    pnl_pct,
                    fees: fee,
                    slippage: pos.qty * last_bar.close * slip,
                });
            }
        }

        Ok(StrategyResult {
            trades,
            equity_curve,
            predicted_equity: None,
        })
    }
}
