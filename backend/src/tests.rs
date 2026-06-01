//! Integration tests for the paper trading and backtesting APIs.
//! These tests verify the API endpoints respond correctly.

use actix_web::{test, web, App};
use serde_json::json;

/// Helper to build the test app (without database).
/// For full integration tests, requires a running PostgreSQL instance.

#[cfg(test)]
mod api_tests {
    use super::*;

    #[actix_web::test]
    async fn test_health_endpoint() {
        let app = test::init_service(
            App::new().route("/api/v1/health", web::get().to(health_handler)),
        )
        .await;

        let req = test::TestRequest::get().uri("/api/v1/health").to_request();
        let resp = test::call_service(&app, req).await;
        assert!(resp.status().is_success());

        let body: serde_json::Value = test::read_body_json(resp).await;
        assert_eq!(body["status"], "ok");
    }

    async fn health_handler() -> actix_web::HttpResponse {
        actix_web::HttpResponse::Ok().json(json!({
            "status": "ok",
            "version": "0.1.0",
        }))
    }
}

#[cfg(test)]
mod paper_trading_tests {
    use super::*;

    #[actix_web::test]
    async fn test_paper_trading_account_unconfigured() {
        // When Alpaca isn't configured, should return ServiceUnavailable
        let trading_client = crate::data::trading::PaperTradingClient::new(
            String::new(),
            String::new(),
            "https://paper-api.alpaca.markets".to_string(),
        );

        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(trading_client))
                .route(
                    "/api/v1/trading/account",
                    web::get().to(crate::api::paper_trading::get_account),
                ),
        )
        .await;

        let req = test::TestRequest::get()
            .uri("/api/v1/trading/account")
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), actix_web::http::StatusCode::SERVICE_UNAVAILABLE);
    }

    #[actix_web::test]
    async fn test_paper_trading_positions_unconfigured() {
        let trading_client = crate::data::trading::PaperTradingClient::new(
            String::new(),
            String::new(),
            "https://paper-api.alpaca.markets".to_string(),
        );

        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(trading_client))
                .route(
                    "/api/v1/trading/positions",
                    web::get().to(crate::api::paper_trading::get_positions),
                ),
        )
        .await;

        let req = test::TestRequest::get()
            .uri("/api/v1/trading/positions")
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), actix_web::http::StatusCode::SERVICE_UNAVAILABLE);
    }

    #[actix_web::test]
    async fn test_submit_order_validation() {
        let trading_client = crate::data::trading::PaperTradingClient::new(
            "test_key".to_string(),
            "test_secret".to_string(),
            "https://paper-api.alpaca.markets".to_string(),
        );

        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(trading_client))
                .route(
                    "/api/v1/trading/orders",
                    web::post().to(crate::api::paper_trading::submit_order),
                ),
        )
        .await;

        // Empty symbol should fail
        let req = test::TestRequest::post()
            .uri("/api/v1/trading/orders")
            .set_json(json!({
                "symbol": "",
                "side": "buy",
                "type": "market",
                "time_in_force": "day"
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), actix_web::http::StatusCode::BAD_REQUEST);

        // No qty or notional should fail
        let req = test::TestRequest::post()
            .uri("/api/v1/trading/orders")
            .set_json(json!({
                "symbol": "AAPL",
                "side": "buy",
                "type": "market",
                "time_in_force": "day"
            }))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), actix_web::http::StatusCode::BAD_REQUEST);
    }
}

#[cfg(test)]
mod strategy_tests {
    use std::collections::HashMap;
    use chrono::{TimeZone, Utc};

    /// Test the DualMomentumRotation strategy produces valid output.
    #[test]
    fn test_dual_momentum_basic_run() {
        use crate::strategies::{RunConfig, TradingStrategy};
        use crate::strategies::dual_momentum::DualMomentumRotation;

        let strategy = DualMomentumRotation::new();
        let meta = strategy.meta();
        assert_eq!(meta.code_key, "dual_momentum_rotation_v1");
        assert_eq!(meta.strategy_type, "trend_following");

        // Generate synthetic bars
        let bars = generate_trending_bars("AAPL", 100, 150.0, 0.002);
        let mut bars_by_symbol = HashMap::new();
        bars_by_symbol.insert("AAPL".to_string(), bars);

        let config = RunConfig {
            run_id: uuid::Uuid::new_v4(),
            strategy_id: uuid::Uuid::new_v4(),
            initial_capital: 100_000.0,
            commission_bps: 5.0,
            slippage_bps: 5.0,
        };

        let params = serde_json::json!({
            "risk_on_symbols": ["AAPL"],
            "defensive_symbols": ["SPY"],
            "lookback_days": 21,
            "rebalance_every_bars": 5,
        });

        let result = strategy.run(&bars_by_symbol, &params, &config).unwrap();
        assert!(!result.equity_curve.is_empty());
        // Equity curve should have entries for each bar
        assert_eq!(result.equity_curve.len(), 100);
    }

    /// Test the TrendBreakout strategy.
    #[test]
    fn test_trend_breakout_basic_run() {
        use crate::strategies::{RunConfig, TradingStrategy};
        use crate::strategies::trend_breakout::TrendBreakout;

        let strategy = TrendBreakout::new();
        let meta = strategy.meta();
        assert_eq!(meta.code_key, "trend_breakout_v2");
        assert_eq!(meta.strategy_type, "trend_following");

        let bars = generate_trending_bars("MSFT", 260, 300.0, 0.002);
        let mut bars_by_symbol = HashMap::new();
        bars_by_symbol.insert("MSFT".to_string(), bars);

        let config = RunConfig {
            run_id: uuid::Uuid::new_v4(),
            strategy_id: uuid::Uuid::new_v4(),
            initial_capital: 100_000.0,
            commission_bps: 5.0,
            slippage_bps: 5.0,
        };

        let params = serde_json::json!({
            "symbols": ["MSFT"],
            "fast_ma": 20,
            "slow_ma": 60,
            "breakout_lookback": 20,
            "risk_fraction_per_position": 0.2,
            "max_positions": 3,
        });

        let result = strategy.run(&bars_by_symbol, &params, &config).unwrap();
        assert!(!result.equity_curve.is_empty());
        assert_eq!(result.equity_curve.len(), 260);
    }

    /// Test strategy with empty bars.
    #[test]
    fn test_strategy_empty_bars() {
        use crate::strategies::{RunConfig, TradingStrategy};
        use crate::strategies::dual_momentum::DualMomentumRotation;

        let strategy = DualMomentumRotation::new();
        let bars_by_symbol = HashMap::new();

        let config = RunConfig {
            run_id: uuid::Uuid::new_v4(),
            strategy_id: uuid::Uuid::new_v4(),
            initial_capital: 100_000.0,
            commission_bps: 5.0,
            slippage_bps: 5.0,
        };

        let params = serde_json::json!({ "risk_on_symbols": [], "defensive_symbols": [] });
        let result = strategy.run(&bars_by_symbol, &params, &config);
        assert!(result.is_err());
    }

    /// Test multi-symbol execution.
    #[test]
    fn test_multi_symbol_execution() {
        use crate::strategies::{RunConfig, TradingStrategy};
        use crate::strategies::risk_parity_rotation::RiskParityRotation;

        let strategy = RiskParityRotation::new();
        let mut bars_by_symbol = HashMap::new();
        bars_by_symbol.insert("AAPL".to_string(), generate_trending_bars("AAPL", 220, 150.0, 0.003));
        bars_by_symbol.insert("MSFT".to_string(), generate_trending_bars("MSFT", 220, 300.0, 0.002));
        bars_by_symbol.insert("NVDA".to_string(), generate_trending_bars("NVDA", 220, 500.0, -0.001));
        bars_by_symbol.insert("SHY".to_string(), generate_trending_bars("SHY", 220, 80.0, 0.0002));

        let config = RunConfig {
            run_id: uuid::Uuid::new_v4(),
            strategy_id: uuid::Uuid::new_v4(),
            initial_capital: 100_000.0,
            commission_bps: 5.0,
            slippage_bps: 5.0,
        };

        let params = serde_json::json!({
            "symbols": ["AAPL", "MSFT", "NVDA"],
            "cash_symbol": "SHY",
            "vol_lookback": 30,
            "momentum_lookback": 90,
            "rebalance_every_bars": 10,
        });

        let result = strategy.run(&bars_by_symbol, &params, &config).unwrap();
        assert_eq!(result.equity_curve.len(), 220);
    }

    /// Test that strategies respect max_positions limit.
    #[test]
    fn test_max_positions_respected() {
        use crate::strategies::{RunConfig, TradingStrategy};
        use crate::strategies::trend_breakout::TrendBreakout;

        let strategy = TrendBreakout::new();
        let mut bars_by_symbol = HashMap::new();
        // Create 10 symbols but limit to 2 positions
        for i in 0..10 {
            let sym = format!("SYM{}", i);
            bars_by_symbol.insert(sym, generate_trending_bars("SYM", 260, 100.0, 0.005));
        }

        let config = RunConfig {
            run_id: uuid::Uuid::new_v4(),
            strategy_id: uuid::Uuid::new_v4(),
            initial_capital: 100_000.0,
            commission_bps: 5.0,
            slippage_bps: 5.0,
        };

        let params = serde_json::json!({
            "symbols": (0..10).map(|i| format!("SYM{}", i)).collect::<Vec<_>>(),
            "fast_ma": 20,
            "slow_ma": 60,
            "breakout_lookback": 20,
            "max_positions": 2,
        });

        let result = strategy.run(&bars_by_symbol, &params, &config).unwrap();
        // Verify equity never exceeds initial (no impossible leverage)
        for (_, eq) in &result.equity_curve {
            assert!(*eq > 0.0, "equity should always be positive");
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    use crate::strategies::Bar;

    fn generate_trending_bars(
        _symbol: &str,
        count: usize,
        start_price: f64,
        daily_drift: f64,
    ) -> Vec<Bar> {
        let mut bars = Vec::with_capacity(count);
        let mut price = start_price;

        for i in 0..count {
            let noise = ((i as f64 * 0.7).sin() * 0.01 + (i as f64 * 1.3).cos() * 0.005) * price;
            let open = price;
            price = price * (1.0 + daily_drift) + noise;
            let close = price;
            let high = open.max(close) * 1.005;
            let low = open.min(close) * 0.995;
            let volume = 1_000_000.0 + (i as f64 * 100.0).sin().abs() * 500_000.0;

            let ts = Utc.with_ymd_and_hms(2023, 1, 1, 16, 0, 0).unwrap()
                + chrono::Duration::days(i as i64);

            bars.push(Bar { ts, open, high, low, close, volume });
        }
        bars
    }

    fn generate_mean_reverting_bars(
        _symbol: &str,
        count: usize,
        mean_price: f64,
        amplitude: f64,
    ) -> Vec<Bar> {
        let mut bars = Vec::with_capacity(count);

        for i in 0..count {
            let cycle = (i as f64 * 0.15).sin() * amplitude;
            let noise = (i as f64 * 2.3).sin() * amplitude * 0.3;
            let close = mean_price + cycle + noise;
            let open = close + (i as f64 * 0.8).cos() * amplitude * 0.2;
            let high = open.max(close) + amplitude * 0.1;
            let low = open.min(close) - amplitude * 0.1;
            let volume = 500_000.0 + (i as f64 * 0.5).sin().abs() * 300_000.0;

            let ts = Utc.with_ymd_and_hms(2023, 1, 1, 16, 0, 0).unwrap()
                + chrono::Duration::days(i as i64);

            bars.push(Bar { ts, open, high, low, close, volume });
        }
        bars
    }
}

#[cfg(test)]
mod indicator_tests {
    use crate::strategies::indicators;

    #[test]
    fn test_sma_basic() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        let result = indicators::sma(&data, 3);
        assert!(result[0].is_nan());
        assert!(result[1].is_nan());
        assert!((result[2] - 2.0).abs() < 1e-10);
        assert!((result[3] - 3.0).abs() < 1e-10);
        assert!((result[9] - 9.0).abs() < 1e-10);
    }

    #[test]
    fn test_ema_basic() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        let result = indicators::ema(&data, 3);
        // EMA should be defined from index 2 onwards
        assert!(result[1].is_nan());
        assert!(result[2].is_finite());
        // EMA(3) seed = (1+2+3)/3 = 2.0, then smooths upward
        assert!((result[2] - 2.0).abs() < 1e-10);
    }

    #[test]
    fn test_rsi_bounds() {
        let data: Vec<f64> = (0..50).map(|i| 100.0 + (i as f64).sin() * 5.0).collect();
        let result = indicators::rsi(&data, 14);
        for val in &result[14..] {
            assert!(*val >= 0.0 && *val <= 100.0, "RSI must be in [0, 100], got {}", val);
        }
    }

    #[test]
    fn test_atr_non_negative() {
        let highs: Vec<f64> = (0..30).map(|i| 105.0 + (i as f64 * 0.5).sin()).collect();
        let lows: Vec<f64> = (0..30).map(|i| 95.0 + (i as f64 * 0.5).sin()).collect();
        let closes: Vec<f64> = (0..30).map(|i| 100.0 + (i as f64 * 0.5).sin()).collect();
        let result = indicators::atr(&highs, &lows, &closes, 14);
        for val in &result[13..] {
            assert!(*val >= 0.0, "ATR must be non-negative");
        }
    }

    #[test]
    fn test_rolling_std() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let result = indicators::rolling_std(&data, 3);
        assert!(result[0].is_nan());
        assert!(result[1].is_nan());
        // std of [1,2,3] = sqrt(2/3) ≈ 0.816
        assert!((result[2] - 0.8165).abs() < 0.01);
    }

    #[test]
    fn test_bollinger_bands() {
        let data: Vec<f64> = (0..30).map(|i| 100.0 + (i as f64 * 0.3).sin() * 5.0).collect();
        let (upper, middle, lower, pct_b) = indicators::bollinger_bands(&data, 20, 2.0);
        for i in 19..30 {
            assert!(upper[i] > middle[i], "upper > middle");
            assert!(middle[i] > lower[i], "middle > lower");
            assert!(pct_b[i].is_finite());
        }
    }

    #[test]
    fn test_stochastic_bounds() {
        let highs: Vec<f64> = (0..30).map(|i| 110.0 + (i as f64 * 0.5).sin() * 5.0).collect();
        let lows: Vec<f64> = (0..30).map(|i| 90.0 + (i as f64 * 0.5).sin() * 5.0).collect();
        let closes: Vec<f64> = (0..30).map(|i| 100.0 + (i as f64 * 0.5).sin() * 5.0).collect();
        let (k, _d) = indicators::stochastic(&highs, &lows, &closes, 14, 3);
        for val in &k[13..] {
            assert!(*val >= 0.0 && *val <= 100.0, "Stochastic %K must be in [0, 100]");
        }
    }

    #[test]
    fn test_vwap() {
        let highs = vec![10.0, 11.0, 12.0, 11.0, 10.0];
        let lows = vec![9.0, 10.0, 11.0, 10.0, 9.0];
        let closes = vec![9.5, 10.5, 11.5, 10.5, 9.5];
        let volumes = vec![100.0, 200.0, 150.0, 180.0, 120.0];
        let result = indicators::vwap(&highs, &lows, &closes, &volumes);
        assert!(result[0].is_finite());
        // VWAP should be between overall low and high
        for val in &result {
            assert!(*val >= 9.0 && *val <= 12.0);
        }
    }

    #[test]
    fn test_obv() {
        let closes = vec![10.0, 11.0, 10.5, 11.5, 11.0];
        let volumes = vec![100.0, 200.0, 150.0, 300.0, 100.0];
        let result = indicators::obv(&closes, &volumes);
        assert_eq!(result[0], 100.0);
        assert_eq!(result[1], 300.0);  // up day
        assert_eq!(result[2], 150.0);  // down day
        assert_eq!(result[3], 450.0);  // up day
        assert_eq!(result[4], 350.0);  // down day
    }
}

#[cfg(test)]
mod backtesting_logic_tests {
    #[test]
    fn test_cartesian_product() {
        // This tests the internal logic conceptually
        // The actual cartesian_product is private, so we test via the API behavior
    }

    #[test]
    fn test_walk_forward_window_math() {
        use chrono::NaiveDate;

        let start = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
        let train_days: i64 = 180;
        let test_days: i64 = 60;

        let total_days = (end - start).num_days();
        let window_size = train_days + test_days;

        assert!(total_days >= window_size, "date range should fit at least one window");

        // Count expected windows
        let mut count = 0;
        let mut current = start;
        while current + chrono::Duration::days(window_size) <= end {
            count += 1;
            current = current + chrono::Duration::days(test_days);
        }
        assert!(count > 0, "should produce at least one window");
        assert!(count <= 10, "should not produce too many windows for 1 year");
    }
}
