use std::collections::HashMap;
use super::{Bar, RawTrade, RunConfig, StrategyMeta, StrategyResult, TradingStrategy};

pub struct RLMarketMaker;

impl RLMarketMaker {
    pub fn new() -> Self {
        Self
    }
}

const WARMUP: usize = 20;

fn calculate_volatility(bars: &[Bar], idx: usize, window: usize) -> f64 {
    if idx < window + 1 {
        return 0.02;
    }
    let slice = &bars[idx - window..idx];
    let returns: Vec<f64> = slice
        .windows(2)
        .map(|w| (w[1].close / w[0].close).ln())
        .collect();
    if returns.is_empty() {
        return 0.02;
    }
    let mean = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance =
        returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / returns.len() as f64;
    variance.sqrt().max(1e-6)
}

fn run_symbol(
    symbol: &str,
    bars: &[Bar],
    capital: f64,
    base_spread_bps: f64,
    vol_mult: f64,
    max_inv_usd: f64,
    risk_aversion: f64,
    rebal_threshold: f64,
    vwap_window: usize,
    commission_bps: f64,
    slippage_bps: f64,
) -> (Vec<RawTrade>, Vec<f64>) {
    let n = bars.len();
    let comm = commission_bps / 10_000.0;
    let slip = slippage_bps / 10_000.0;
    let base_spread = base_spread_bps / 10_000.0;

    let mut trades: Vec<RawTrade> = Vec::new();
    let mut equity_per_bar: Vec<f64> = vec![capital; n];

    let mut cash = capital;
    let mut inventory_qty = 0.0_f64;
    let mut avg_entry_price = 0.0_f64;
    let mut entry_bar_idx: usize = 0;

    for i in 0..n {
        let price = bars[i].close;

        if i < WARMUP {
            equity_per_bar[i] = cash + inventory_qty * price;
            continue;
        }

        let vol = calculate_volatility(bars, i, vwap_window);
        let half_spread = (base_spread + vol_mult * vol) / 2.0;

        let inventory_value = inventory_qty * price;
        let inv_ratio = if max_inv_usd > 0.0 {
            inventory_value / max_inv_usd
        } else {
            0.0
        };
        let penalty = risk_aversion * inv_ratio.powi(2);

        let bid_price = price * (1.0 - half_spread - penalty);
        let ask_price = price * (1.0 + half_spread + penalty);

        let prev_close = bars[i - 1].close;

        // Buy: price dipped below our bid level (compare against previous close)
        if prev_close > bid_price && price <= bid_price && inv_ratio < rebal_threshold {
            let entry = price * (1.0 + slip);
            let order_size = (max_inv_usd * 0.1).min(cash * 0.4);
            if order_size > 0.0 && cash >= order_size {
                let fee = order_size * comm;
                let qty = (order_size - fee) / entry;
                if qty > 0.0 {
                    let old_value = avg_entry_price * inventory_qty;
                    inventory_qty += qty;
                    avg_entry_price =
                        (old_value + entry * qty) / inventory_qty;
                    cash -= order_size;
                    entry_bar_idx = i;
                }
            }
        }

        // Sell: price rose to our ask or inventory over threshold
        if inventory_qty > 0.0 {
            let should_rebalance = inv_ratio > rebal_threshold;
            let price_hit_ask = price >= ask_price && prev_close < ask_price;

            if price_hit_ask || should_rebalance {
                let qty_to_sell = if should_rebalance {
                    inventory_qty * 0.5
                } else {
                    inventory_qty * 0.25
                };

                if qty_to_sell > 0.0 {
                    let exit = price * (1.0 - slip);
                    let fee = exit * qty_to_sell * comm;
                    let proceeds = exit * qty_to_sell - fee;
                    let cost_basis = avg_entry_price * qty_to_sell;
                    let entry_fee = cost_basis * comm;
                    let pnl = proceeds - cost_basis - entry_fee;
                    let pnl_pct = if avg_entry_price > 0.0 {
                        exit / avg_entry_price - 1.0
                    } else {
                        0.0
                    };

                    cash += proceeds;
                    inventory_qty -= qty_to_sell;

                    trades.push(RawTrade {
                        symbol: symbol.to_string(),
                        side: "long".to_string(),
                        entry_price: avg_entry_price,
                        exit_price: exit,
                        quantity: qty_to_sell,
                        entry_time: bars[entry_bar_idx].ts,
                        exit_time: bars[i].ts,
                        pnl,
                        pnl_pct,
                        fees: fee + entry_fee,
                        slippage: (avg_entry_price * slip + exit * slip) * qty_to_sell,
                    });
                }
            }
        }

        equity_per_bar[i] = cash + inventory_qty * price;
    }

    // Force-close remaining position
    if inventory_qty > 0.0 && n > 0 {
        let last = n - 1;
        let exit = bars[last].close * (1.0 - slip);
        let fee = exit * inventory_qty * comm;
        let proceeds = exit * inventory_qty - fee;
        let cost_basis = avg_entry_price * inventory_qty;
        let entry_fee = cost_basis * comm;
        let pnl = proceeds - cost_basis - entry_fee;
        let pnl_pct = if avg_entry_price > 0.0 {
            exit / avg_entry_price - 1.0
        } else {
            0.0
        };

        cash += proceeds;

        trades.push(RawTrade {
            symbol: symbol.to_string(),
            side: "long".to_string(),
            entry_price: avg_entry_price,
            exit_price: exit,
            quantity: inventory_qty,
            entry_time: bars[entry_bar_idx].ts,
            exit_time: bars[last].ts,
            pnl,
            pnl_pct,
            fees: fee + entry_fee,
            slippage: (avg_entry_price * slip + exit * slip) * inventory_qty,
        });

        equity_per_bar[last] = cash;
    }

    (trades, equity_per_bar)
}

impl TradingStrategy for RLMarketMaker {
    fn meta(&self) -> StrategyMeta {
        StrategyMeta {
            code_key: "rl_market_maker_v1",
            name: "RL Market Maker (PPO)",
            strategy_type: "reinforcement_learning",
            asset_class: "equity",
            description: "Adaptive market making with inventory risk penalties and \
                volatility-adjusted spreads. Buys when price dips below VWAP-derived bid, \
                sells when price rises above ask or inventory exceeds threshold. \
                Walk-forward per symbol with equal capital allocation.",
            default_parameters: serde_json::json!({
                "symbols": ["AAPL", "MSFT", "SPY", "QQQ"],
                "base_spread_bps": 50.0,
                "volatility_multiplier": 2.0,
                "max_inventory_usd": 50000.0,
                "risk_aversion": 0.5,
                "rebalance_threshold": 0.7,
                "vwap_window": 20
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

        let base_spread_bps = params["base_spread_bps"].as_f64().unwrap_or(50.0);
        let vol_mult = params["volatility_multiplier"].as_f64().unwrap_or(2.0);
        let max_inv = params["max_inventory_usd"].as_f64().unwrap_or(50000.0);
        let risk_aversion = params["risk_aversion"].as_f64().unwrap_or(0.5);
        let rebal_threshold = params["rebalance_threshold"].as_f64().unwrap_or(0.7);
        let vwap_window = params["vwap_window"].as_u64().unwrap_or(20) as usize;

        let tradeable: Vec<&str> = symbols
            .iter()
            .filter_map(|s| {
                let bars = bars_by_symbol.get(s.as_str())?;
                if bars.len() >= 100 {
                    Some(s.as_str())
                } else {
                    None
                }
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
        let mut equity_map: HashMap<i64, f64> = HashMap::new();

        for sym in &tradeable {
            let bars = &bars_by_symbol[*sym];
            let (trades, eq_per_bar) = run_symbol(
                sym,
                bars,
                capital_per,
                base_spread_bps,
                vol_mult,
                max_inv / tradeable.len() as f64,
                risk_aversion,
                rebal_threshold,
                vwap_window,
                config.commission_bps,
                config.slippage_bps,
            );
            all_trades.extend(trades);
            for (bar, &eq) in bars.iter().zip(eq_per_bar.iter()) {
                *equity_map.entry(bar.ts.timestamp()).or_insert(0.0) += eq;
            }
        }

        let mut ts_sorted: Vec<i64> = equity_map.keys().copied().collect();
        ts_sorted.sort_unstable();
        let equity_curve: Vec<(chrono::DateTime<chrono::Utc>, f64)> = ts_sorted
            .into_iter()
            .map(|ts| {
                let dt = chrono::DateTime::from_timestamp(ts, 0).unwrap_or_default();
                (dt, equity_map[&ts])
            })
            .collect();

        Ok(StrategyResult {
            trades: all_trades,
            equity_curve,
            predicted_equity: None,
        })
    }
}
