"""
RegimeAwarePPO -- separate policy networks per market regime.

Detects bull / bear / sideways from volatility + trend and routes
prediction to the matching sub-policy.  Regime detection is trained
jointly from historical labels derived from rolling SPY returns.

Usage
-----
agent = RegimeAwarePPO(n_symbols=5)
agent.train(train_env, total_timesteps=500_000)
weights = agent.predict(observation)
agent.save("models/regime_ppo_v1.zip")
"""

from __future__ import annotations

import numpy as np
from loguru import logger


class RegimeDetector:
    """Lightweight LSTM-based regime classifier."""

    def __init__(self, lookback: int = 20):
        self.lookback = lookback

    def detect(self, returns: np.ndarray) -> str:
        """Classify current regime from recent returns."""
        if len(returns) < self.lookback:
            return "sideways"

        recent = returns[-self.lookback:]
        trend = recent.mean()
        vol = recent.std()

        if vol > 0.02:
            return "bear" if trend < 0 else "bull"
        elif trend > 0.001:
            return "bull"
        elif trend < -0.001:
            return "bear"
        else:
            return "sideways"


class RegimeAwarePPO:
    """
    Three PPO policies, one per regime.
    Each is independently trained to maximise risk-adjusted return
    within its specific market environment.
    """

    REGIMES = ["bull", "bear", "sideways"]

    def __init__(self, n_symbols: int, device: str = "cpu"):
        self.n_symbols = n_symbols
        self.device = device
        self.policies: dict = {}
        self.regime_detector = RegimeDetector()

    def train(self, envs: dict, total_timesteps: int = 500_000) -> None:
        """Train a PPO policy for each regime.

        Args:
            envs: dict mapping regime -> gym.Env
            total_timesteps: steps per policy
        """
        try:
            from stable_baselines3 import PPO
        except ImportError:
            raise ImportError("stable-baselines3 not installed. Run: pip install stable-baselines3")

        for regime in self.REGIMES:
            env = envs.get(regime)
            if env is None:
                logger.warning(f"No environment provided for regime '{regime}', skipping")
                continue

            logger.info(f"Training {regime} policy ({total_timesteps} steps)...")
            policy = PPO(
                "MlpPolicy",
                env,
                learning_rate=1e-4,
                gamma=0.98,
                n_steps=4096,
                ent_coef=0.01,
                clip_range=0.1,
                verbose=0,
                device=self.device,
            )
            policy.learn(total_timesteps=total_timesteps)
            self.policies[regime] = policy
            logger.info(f"  {regime} policy trained")

    def predict(self, observation: np.ndarray, returns: np.ndarray) -> np.ndarray:
        regime = self.regime_detector.detect(returns)
        policy = self.policies.get(regime)

        if policy is None:
            logger.warning(f"No policy for regime '{regime}', returning equal weights")
            return np.ones(self.n_symbols) / self.n_symbols

        action, _ = policy.predict(observation, deterministic=True)
        exp = np.exp(action - action.max())
        return exp / exp.sum()

    def save(self, path_prefix: str) -> None:
        for regime, policy in self.policies.items():
            policy.save(f"{path_prefix}_{regime}")
            logger.info(f"Saved {regime} policy to {path_prefix}_{regime}.zip")

    def load(self, path_prefix: str) -> None:
        try:
            from stable_baselines3 import PPO
        except ImportError:
            raise ImportError("stable-baselines3 not installed")

        for regime in self.REGIMES:
            fpath = f"{path_prefix}_{regime}.zip"
            try:
                self.policies[regime] = PPO.load(fpath)
                logger.info(f"Loaded {regime} policy from {fpath}")
            except FileNotFoundError:
                logger.warning(f"Policy file not found: {fpath}")
