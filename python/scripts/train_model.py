#!/usr/bin/env python3
"""
Training pipeline for FinRL RL portfolio strategies.

Usage
-----
python scripts/train_model.py --algorithm ppo --symbols AAPL,MSFT,GOOGL \
    --start 2018-01-01 --end 2023-12-31 --timesteps 50000 --output models/ppo_v1
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from loguru import logger

sys.path.insert(0, str(Path(__file__).parent.parent))


def download_data(symbols: list[str], start: str, end: str) -> "pd.DataFrame":
    """Download OHLCV data via yfinance and format for FinRL."""
    import pandas as pd
    import yfinance as yf

    dfs = []
    for sym in symbols:
        raw = yf.download(sym, start=start, end=end, auto_adjust=True, progress=False)
        raw = raw.reset_index()
        raw.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in raw.columns]
        raw["tic"] = sym
        dfs.append(raw)

    df = pd.concat(dfs, ignore_index=True)
    df = df.rename(columns={"date": "date"})
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values(["date", "tic"]).reset_index(drop=True)
    return df


def add_technical_indicators(df: "pd.DataFrame", symbols: list[str]) -> "pd.DataFrame":
    """Add RSI, MACD, and volatility features per symbol."""
    import pandas as pd
    import numpy as np

    result = []
    for sym in symbols:
        sub = df[df["tic"] == sym].copy().reset_index(drop=True)
        c = sub["close"]

        # RSI-14
        delta = c.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        sub["rsi_30"] = (100 - 100 / (1 + rs)).fillna(50)

        # MACD
        ema12 = c.ewm(span=12, adjust=False).mean()
        ema26 = c.ewm(span=26, adjust=False).mean()
        sub["macd"] = ema12 - ema26

        # CCI-20
        tp = (sub["high"] + sub["low"] + c) / 3
        sma_tp = tp.rolling(20).mean()
        mad = tp.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
        sub["cci_30"] = ((tp - sma_tp) / (0.015 * mad)).fillna(0)

        # ATR-14
        hl = sub["high"] - sub["low"]
        hc = (sub["high"] - c.shift()).abs()
        lc = (sub["low"] - c.shift()).abs()
        sub["dx_30"] = pd.concat([hl, hc, lc], axis=1).max(axis=1).rolling(14).mean().fillna(0)

        # SMA
        sub["close_30_sma"] = c.rolling(30).mean().fillna(c)
        sub["close_60_sma"] = c.rolling(60).mean().fillna(c)

        result.append(sub)

    out = pd.concat(result, ignore_index=True)
    out = out.sort_values(["date", "tic"]).reset_index(drop=True)
    return out.fillna(0)


def build_env(symbols: list[str], df: "pd.DataFrame", initial_capital: float):
    """Build a RustCompatiblePortfolioEnv -- obs matches finrl_grpc.rs extract_features()."""
    from custom.envs import RustCompatiblePortfolioEnv
    return RustCompatiblePortfolioEnv(
        df=df,
        symbols=symbols,
        initial_amount=initial_capital,
        transaction_cost_pct=0.001,
        reward_scaling=1e-4,
    )


def train(args):
    symbols = [s.strip().upper() for s in args.symbols.split(",")]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    logger.info(f"Training {args.algorithm.upper()} on {symbols}")
    logger.info(f"Date range: {args.start} → {args.end}  |  Timesteps: {args.timesteps:,}")

    df = download_data(symbols, args.start, args.end)
    df = add_technical_indicators(df, symbols)

    # Drop rows with any NaN indicator (warmup period)
    df = df.dropna().reset_index(drop=True)

    logger.info(f"Dataset: {len(df)} rows across {len(symbols)} symbols")

    env = build_env(symbols, df, args.initial_capital)

    if args.algorithm == "ppo":
        from stable_baselines3 import PPO
        model = PPO(
            "MlpPolicy", env,
            learning_rate=1e-4,
            gamma=0.98,
            n_steps=min(2048, len(df) // len(symbols)),
            ent_coef=0.01,
            clip_range=0.1,
            verbose=1,
        )
    elif args.algorithm == "sac":
        from stable_baselines3 import SAC
        model = SAC("MlpPolicy", env, learning_rate=3e-4, gamma=0.99, verbose=1)
    elif args.algorithm == "a2c":
        from stable_baselines3 import A2C
        model = A2C("MlpPolicy", env, learning_rate=7e-4, gamma=0.99, verbose=1)
    else:
        logger.error(f"Unknown algorithm: {args.algorithm}")
        sys.exit(1)

    model.learn(total_timesteps=args.timesteps)
    model.save(str(output))

    logger.info(f"Model saved → {output}.zip")
    logger.info("Start gRPC server: python services/finrl_server.py")
    logger.info("Or export ONNX:    python scripts/export_onnx.py --checkpoint {output}.zip")


def main():
    parser = argparse.ArgumentParser(description="Train a FinRL RL portfolio strategy")
    parser.add_argument("--algorithm", choices=["ppo", "sac", "a2c"], default="ppo")
    parser.add_argument("--symbols", required=True, help="Comma-separated, e.g. AAPL,MSFT,GOOGL")
    parser.add_argument("--start", default="2018-01-01")
    parser.add_argument("--end", default="2023-12-31")
    parser.add_argument("--timesteps", type=int, default=50_000)
    parser.add_argument("--initial-capital", type=float, default=100_000)
    parser.add_argument("--output", default="models/ppo_v1")
    args = parser.parse_args()

    logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
    train(args)


if __name__ == "__main__":
    main()
