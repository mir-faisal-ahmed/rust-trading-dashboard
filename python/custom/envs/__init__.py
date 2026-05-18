"""
RustCompatibleEnv -- A portfolio gym environment whose observation space
matches the 5-feature-per-symbol vector produced by extract_features()
in backend/src/strategies/finrl_grpc.rs.

Feature layout (per symbol):
  [0] norm_price   -- close / close[0]  (price relative to start)
  [1] rsi/100      -- RSI(14) / 100
  [2] price_dev    -- (close - SMA20) / close
  [3] atr_pct      -- ATR(14) / close
  [4] vol_ratio    -- volume / vol_SMA20, capped at 5.0

Actions: softmax-normalised portfolio weights in [0, 1] summing to 1.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces


class RustCompatiblePortfolioEnv(gym.Env):
    """Portfolio env whose obs matches finrl_grpc.rs extract_features()."""

    FEATURES_PER_SYMBOL = 5

    def __init__(
        self,
        df: pd.DataFrame,
        symbols: list[str],
        initial_amount: float = 100_000.0,
        transaction_cost_pct: float = 0.001,
        reward_scaling: float = 1e-4,
    ):
        super().__init__()
        self.df = df.copy()
        self.symbols = symbols
        self.n_stocks = len(symbols)
        self.initial_amount = initial_amount
        self.transaction_cost_pct = transaction_cost_pct
        self.reward_scaling = reward_scaling

        # All unique dates (sorted)
        self.dates = sorted(df["date"].unique())
        self.n_dates = len(self.dates)

        obs_dim = self.n_stocks * self.FEATURES_PER_SYMBOL
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(obs_dim,), dtype=np.float32
        )
        self.action_space = spaces.Box(
            low=0, high=1, shape=(self.n_stocks,), dtype=np.float32
        )

        self._precompute_features()
        self.reset()

    # ── Preprocessing ──────────────────────────────────────────────────────

    def _precompute_features(self):
        """Pre-compute the feature matrix [n_dates, n_stocks * 5]."""
        features = np.zeros((self.n_dates, self.n_stocks, self.FEATURES_PER_SYMBOL), dtype=np.float32)
        prices_matrix = np.zeros((self.n_dates, self.n_stocks), dtype=np.float32)

        for j, sym in enumerate(self.symbols):
            sub = self.df[self.df["tic"] == sym].copy()
            sub = sub.set_index("date").reindex(self.dates).ffill().bfill()

            closes = sub["close"].values.astype(float)
            highs  = sub["high"].values.astype(float)
            lows   = sub["low"].values.astype(float)
            vols   = sub["volume"].values.astype(float)
            n      = len(closes)

            prices_matrix[:, j] = closes
            first  = closes[0] if closes[0] != 0 else 1.0

            # Compute rolling indicators
            rsi  = _rsi(closes, 14)
            sma20 = _sma(closes, 20)
            atr   = _atr(highs, lows, closes, 14)
            vsma  = _sma(vols, 20)

            for i in range(n):
                c  = closes[i]
                norm_price = c / first if first != 0 else 1.0
                rsi_v      = np.clip(rsi[i], 0, 100) / 100.0
                dev        = (c - sma20[i]) / c if c != 0 else 0.0
                atr_v      = atr[i] / c if c != 0 else 0.0
                vol_r      = min(vols[i] / vsma[i], 5.0) if vsma[i] != 0 else 1.0
                features[i, j] = [norm_price, rsi_v, dev, atr_v, vol_r]

        self._features = features  # [n_dates, n_stocks, 5]
        self._prices   = prices_matrix  # [n_dates, n_stocks]

    # ── Gym interface ───────────────────────────────────────────────────────

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self._day        = 0
        self._portfolio  = np.ones(self.n_stocks) / self.n_stocks  # equal weight
        self._equity     = self.initial_amount
        self._prev_prices = self._prices[0].copy()
        return self._obs(), {}

    def step(self, action: np.ndarray):
        # Softmax normalise action → weights
        action = np.clip(action, 0, 1)
        weights = _softmax(action)

        self._day += 1
        done = self._day >= self.n_dates - 1

        cur_prices  = self._prices[self._day]
        prev_prices = self._prev_prices

        # Portfolio return from price changes
        price_returns = np.where(prev_prices != 0, cur_prices / prev_prices - 1.0, 0.0)
        port_return   = float(np.dot(self._portfolio, price_returns))

        # Transaction cost proportional to weight change
        weight_delta  = np.abs(weights - self._portfolio).sum()
        cost          = self.transaction_cost_pct * weight_delta

        self._equity    *= (1.0 + port_return - cost)
        self._portfolio  = weights
        self._prev_prices = cur_prices.copy()

        reward = (port_return - cost) * self.reward_scaling
        info = {"portfolio_value": self._equity}
        return self._obs(), reward, done, False, info

    def _obs(self) -> np.ndarray:
        return self._features[self._day].flatten()

    # Compatibility helpers used by finrl_server
    def get_obs_dim(self) -> int:
        return self.n_stocks * self.FEATURES_PER_SYMBOL


# ── Indicator helpers (mirror finrl_grpc.rs) ────────────────────────────────

def _sma(values: np.ndarray, period: int) -> np.ndarray:
    out = np.zeros_like(values)
    for i in range(len(values)):
        start = max(0, i - period + 1)
        out[i] = values[start : i + 1].mean()
    return out


def _rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    delta = np.diff(closes, prepend=closes[0])
    gain  = np.where(delta > 0, delta, 0.0)
    loss  = np.where(delta < 0, -delta, 0.0)
    avg_g = _ema(gain, period)
    avg_l = _ema(loss, period)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = np.where(avg_l != 0, avg_g / avg_l, 100.0)
    return 100.0 - 100.0 / (1.0 + rs)


def _ema(values: np.ndarray, period: int) -> np.ndarray:
    out = np.zeros_like(values, dtype=float)
    alpha = 1.0 / period
    out[0] = values[0]
    for i in range(1, len(values)):
        out[i] = alpha * values[i] + (1 - alpha) * out[i - 1]
    return out


def _atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> np.ndarray:
    tr = np.maximum.reduce([
        highs - lows,
        np.abs(highs - np.roll(closes, 1)),
        np.abs(lows  - np.roll(closes, 1)),
    ])
    tr[0] = highs[0] - lows[0]
    return _ema(tr, period)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()
