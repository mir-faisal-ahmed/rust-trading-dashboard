-- Seed the 10 default strategies from the original dashboard design.
-- ON CONFLICT (id) DO NOTHING makes this safe to re-run.

INSERT INTO strategies (id, name, strategy_type, asset_class, status, description, parameters)
VALUES
  (
    'a0000000-0000-4000-8000-000000000001',
    'RSI Mean Reversion',
    'mean_reversion',
    'equity',
    'idle',
    'Mean reversion on RSI oversold/overbought with ATR-based stops',
    '{"rsi_period": 14, "oversold": 30, "overbought": 70, "atr_multiplier": 2.0,
      "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'Dual Momentum Cross',
    'momentum',
    'equity',
    'idle',
    'Absolute and relative momentum using 12-month lookback with 1-month rebalance',
    '{"lookback_months": 12, "rebalance_freq": "monthly", "universe_size": 100,
      "symbols": ["SPY", "QQQ", "IWM", "EFA", "AGG"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000003',
    'Cointegration Pairs',
    'pairs_trading',
    'equity',
    'idle',
    'Johansen cointegration test with Kalman filter hedge ratios on sector ETFs',
    '{"lookback_days": 252, "zscore_entry": 2.0, "zscore_exit": 0.5, "max_pairs": 15,
      "symbols": ["XLK", "XLF", "XLV", "XLC", "XLE", "XLI", "XLB", "XLU", "XLRE"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000004',
    'XGBoost Classifier v3',
    'ml_classifier',
    'equity',
    'idle',
    'Gradient boosted tree classifier on 47 technical features, 5-day forward return target',
    '{"n_estimators": 500, "max_depth": 6, "learning_rate": 0.05, "min_samples": 50,
      "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000005',
    'LSTM Price Forecast',
    'lstm_forecast',
    'crypto',
    'idle',
    '3-layer LSTM with attention mechanism on OHLCV + orderbook imbalance features',
    '{"hidden_size": 128, "num_layers": 3, "dropout": 0.2, "sequence_length": 60,
      "symbols": ["BTC/USD", "ETH/USD", "SOL/USD"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000006',
    'Transformer Alpha',
    'transformer',
    'crypto',
    'idle',
    'Temporal fusion transformer for multi-horizon crypto forecasting with sentiment inputs',
    '{"d_model": 256, "n_heads": 8, "n_layers": 4, "context_window": 120,
      "symbols": ["BTC/USD", "ETH/USD"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000007',
    'PPO Market Maker',
    'reinforcement_learning',
    'crypto',
    'idle',
    'Proximal policy optimization agent for market making with inventory risk penalty',
    '{"gamma": 0.99, "clip_epsilon": 0.2, "lr_actor": 0.0003, "inventory_limit": 100,
      "symbols": ["BTC/USD"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000008',
    'Turtle Breakout',
    'trend_following',
    'equity',
    'idle',
    'Modified turtle trading system with 20/55 day breakout and ATR position sizing',
    '{"fast_period": 20, "slow_period": 55, "atr_period": 20, "risk_per_trade": 0.01,
      "symbols": ["SPY", "QQQ", "GLD", "TLT", "DBC"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000009',
    'Stat Arb Residuals',
    'stat_arb',
    'equity',
    'idle',
    'PCA-based statistical arbitrage on residual returns with daily rebalancing',
    '{"n_components": 5, "lookback": 120, "entry_threshold": 1.5, "exit_threshold": 0.3,
      "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM", "V", "UNH"]}'
  ),
  (
    'a0000000-0000-4000-8000-000000000010',
    'LLM Sentiment Alpha',
    'transformer',
    'equity',
    'idle',
    'Fine-tuned Llama-3 for earnings call sentiment scoring mapped to 5-day forward returns',
    '{"model": "llama-3-8b", "max_tokens": 512, "temperature": 0.1, "top_k": 50,
      "symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "META"]}'
  )
ON CONFLICT (id) DO NOTHING;
