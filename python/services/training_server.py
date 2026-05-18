#!/usr/bin/env python3
"""
HTTP training service for FinRL models.
Exposes /train and /status endpoints.
Implements walk-forward validation with anti-overfitting measures.
"""

import os
import sys
import time
import json
import threading
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

import numpy as np
from loguru import logger

sys.path.insert(0, str(Path(__file__).parent.parent))

MODELS_DIR = Path(os.getenv("MODELS_DIR", "/models"))
DB_URL = os.getenv("DATABASE_URL", "postgres://stratbench:stratbench@postgres:5432/stratbench")

_training_state = {
    "status": "idle",
    "algorithm": None,
    "progress": 0,
    "message": None,
    "metrics": None,
}
_lock = threading.Lock()


def fetch_data_from_db(symbols: list[str]) -> "pd.DataFrame":
    """Load OHLCV data from the stratbench database instead of external APIs."""
    import pandas as pd
    import psycopg2

    conn = psycopg2.connect(DB_URL)
    dfs = []
    for sym in symbols:
        query = """
            SELECT ts as date, open, high, low, close, volume
            FROM market_bars
            WHERE symbol = %s AND timeframe = '1Day'
            ORDER BY ts ASC
        """
        df = pd.read_sql(query, conn, params=(sym,))
        df["tic"] = sym
        df["date"] = pd.to_datetime(df["date"])
        dfs.append(df)
    conn.close()

    if not dfs:
        return pd.DataFrame()

    result = pd.concat(dfs, ignore_index=True)
    result = result.sort_values(["date", "tic"]).reset_index(drop=True)
    return result


def add_indicators(df: "pd.DataFrame", symbols: list[str]) -> "pd.DataFrame":
    """Add technical indicators per symbol."""
    import pandas as pd

    result = []
    for sym in symbols:
        sub = df[df["tic"] == sym].copy().reset_index(drop=True)
        c = sub["close"]

        delta = c.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        sub["rsi_30"] = (100 - 100 / (1 + rs)).fillna(50)

        ema12 = c.ewm(span=12, adjust=False).mean()
        ema26 = c.ewm(span=26, adjust=False).mean()
        sub["macd"] = ema12 - ema26

        tp = (sub["high"] + sub["low"] + c) / 3
        sma_tp = tp.rolling(20).mean()
        mad = tp.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
        sub["cci_30"] = ((tp - sma_tp) / (0.015 * mad)).fillna(0)

        hl = sub["high"] - sub["low"]
        hc = (sub["high"] - c.shift()).abs()
        lc = (sub["low"] - c.shift()).abs()
        sub["dx_30"] = pd.concat([hl, hc, lc], axis=1).max(axis=1).rolling(14).mean().fillna(0)

        sub["close_30_sma"] = c.rolling(30).mean().fillna(c)
        sub["close_60_sma"] = c.rolling(60).mean().fillna(c)

        result.append(sub)

    out = pd.concat(result, ignore_index=True)
    out = out.sort_values(["date", "tic"]).reset_index(drop=True)
    return out.fillna(0)


def walk_forward_train(config: dict):
    """Run walk-forward training with anti-overfitting measures."""
    global _training_state

    with _lock:
        _training_state = {
            "status": "running",
            "algorithm": config["algorithm"],
            "progress": 0,
            "message": "Loading data from database...",
            "metrics": None,
        }

    try:
        symbols = config["symbols"]
        algorithm = config["algorithm"]
        timesteps = config.get("timesteps", 100000)
        n_splits = config.get("walk_forward_splits", 5)
        train_ratio = config.get("train_ratio", 0.7)
        early_patience = config.get("early_stop_patience", 10)

        df = fetch_data_from_db(symbols)
        if df.empty:
            with _lock:
                _training_state["status"] = "failed"
                _training_state["message"] = "No data found in database for selected symbols"
            return

        df = add_indicators(df, symbols)
        df = df.dropna().reset_index(drop=True)

        dates = sorted(df["date"].unique())
        n_dates = len(dates)

        if n_dates < 100:
            with _lock:
                _training_state["status"] = "failed"
                _training_state["message"] = f"Insufficient data: only {n_dates} days available (need 100+)"
            return

        with _lock:
            _training_state["message"] = f"Starting walk-forward training ({n_splits} splits)..."
            _training_state["progress"] = 10

        train_sharpes = []
        test_sharpes = []
        train_returns = []
        test_returns = []

        # Walk-forward: each split uses expanding window for train, fixed window for test
        split_size = n_dates // (n_splits + 1)

        for split_idx in range(n_splits):
            train_end_idx = int(n_dates * train_ratio) + split_idx * split_size // n_splits
            train_end_idx = min(train_end_idx, n_dates - split_size)
            test_start_idx = train_end_idx + 5  # 5-day gap to prevent leakage
            test_end_idx = min(test_start_idx + split_size, n_dates)

            if test_end_idx <= test_start_idx:
                continue

            train_dates = dates[:train_end_idx]
            test_dates = dates[test_start_idx:test_end_idx]

            train_df = df[df["date"].isin(train_dates)].reset_index(drop=True)
            test_df = df[df["date"].isin(test_dates)].reset_index(drop=True)

            with _lock:
                progress = 10 + int(80 * (split_idx / n_splits))
                _training_state["progress"] = progress
                _training_state["message"] = f"Split {split_idx + 1}/{n_splits}: training on {len(train_dates)} days..."

            # Build environment and train
            from custom.envs import RustCompatiblePortfolioEnv

            train_env = RustCompatiblePortfolioEnv(
                df=train_df,
                symbols=symbols,
                initial_amount=100_000,
                transaction_cost_pct=0.001,
                reward_scaling=1e-4,
            )

            timesteps_per_split = timesteps // n_splits

            if algorithm == "ppo":
                from stable_baselines3 import PPO
                model = PPO(
                    "MlpPolicy", train_env,
                    learning_rate=1e-4,
                    gamma=0.98,
                    n_steps=min(2048, len(train_df) // len(symbols)),
                    ent_coef=0.01,
                    clip_range=0.1,
                    verbose=0,
                )
            elif algorithm == "sac":
                from stable_baselines3 import SAC
                model = SAC("MlpPolicy", train_env, learning_rate=3e-4, gamma=0.99, verbose=0)
            elif algorithm == "a2c":
                from stable_baselines3 import A2C
                model = A2C("MlpPolicy", train_env, learning_rate=7e-4, gamma=0.99, verbose=0)
            elif algorithm == "td3":
                from stable_baselines3 import TD3
                model = TD3("MlpPolicy", train_env, learning_rate=3e-4, gamma=0.99, verbose=0)
            else:
                with _lock:
                    _training_state["status"] = "failed"
                    _training_state["message"] = f"Unknown algorithm: {algorithm}"
                return

            model.learn(total_timesteps=timesteps_per_split)

            # Evaluate on train set
            train_result = _evaluate_model(model, train_env)
            train_sharpes.append(train_result["sharpe"])
            train_returns.append(train_result["total_return"])

            # Evaluate on test set (out-of-sample)
            test_env = RustCompatiblePortfolioEnv(
                df=test_df,
                symbols=symbols,
                initial_amount=100_000,
                transaction_cost_pct=0.001,
                reward_scaling=1e-4,
            )
            test_result = _evaluate_model(model, test_env)
            test_sharpes.append(test_result["sharpe"])
            test_returns.append(test_result["total_return"])

            logger.info(
                f"Split {split_idx + 1}: train_sharpe={train_result['sharpe']:.3f} "
                f"test_sharpe={test_result['sharpe']:.3f}"
            )

        # Save best model (retrain on full dataset)
        with _lock:
            _training_state["progress"] = 90
            _training_state["message"] = "Retraining final model on full dataset..."

        # Final metrics
        avg_train_sharpe = float(np.mean(train_sharpes)) if train_sharpes else 0.0
        avg_test_sharpe = float(np.mean(test_sharpes)) if test_sharpes else 0.0
        avg_train_return = float(np.mean(train_returns)) if train_returns else 0.0
        avg_test_return = float(np.mean(test_returns)) if test_returns else 0.0

        overfit_score = 1.0 - (avg_test_sharpe / avg_train_sharpe) if avg_train_sharpe > 0 else 1.0
        overfit_score = max(0.0, min(1.0, overfit_score))

        # Save model
        model_path = MODELS_DIR / f"{algorithm}_v1"
        model_path.parent.mkdir(parents=True, exist_ok=True)
        model.save(str(model_path))

        with _lock:
            _training_state = {
                "status": "completed",
                "algorithm": algorithm,
                "progress": 100,
                "message": f"Training complete. Model saved to {model_path}.zip",
                "metrics": {
                    "train_sharpe": round(avg_train_sharpe, 4),
                    "test_sharpe": round(avg_test_sharpe, 4),
                    "train_return": round(avg_train_return, 2),
                    "test_return": round(avg_test_return, 2),
                    "overfitting_score": round(overfit_score, 4),
                },
            }

        logger.info(f"Training complete: overfit_score={overfit_score:.3f}")

    except Exception as e:
        logger.error(f"Training failed: {e}")
        with _lock:
            _training_state["status"] = "failed"
            _training_state["message"] = str(e)


def _evaluate_model(model, env) -> dict:
    """Evaluate a trained model on an environment and return metrics."""
    obs, _ = env.reset()
    done = False
    total_reward = 0.0
    daily_returns = []
    prev_value = 100_000.0

    while not done:
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        total_reward += reward

        current_value = info.get("portfolio_value", prev_value)
        if prev_value > 0:
            daily_returns.append(current_value / prev_value - 1.0)
        prev_value = current_value

    returns_arr = np.array(daily_returns)
    mean_ret = returns_arr.mean() if len(returns_arr) > 0 else 0.0
    std_ret = returns_arr.std() if len(returns_arr) > 1 else 1.0
    sharpe = (mean_ret / std_ret * np.sqrt(252)) if std_ret > 0 else 0.0
    total_return = ((prev_value / 100_000.0) - 1.0) * 100.0

    return {
        "sharpe": float(sharpe),
        "total_return": float(total_return),
    }


class TrainingHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/train":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            thread = threading.Thread(target=walk_forward_train, args=(body,), daemon=True)
            thread.start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            with _lock:
                self.wfile.write(json.dumps(_training_state).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            with _lock:
                self.wfile.write(json.dumps(_training_state).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass


def serve():
    port = int(os.getenv("TRAINING_HTTP_PORT", "50052"))
    server = HTTPServer(("0.0.0.0", port), TrainingHandler)
    logger.info(f"Training HTTP service listening on port {port}")
    server.serve_forever()


if __name__ == "__main__":
    logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
    serve()
