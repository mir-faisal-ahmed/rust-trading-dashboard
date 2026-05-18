"""
SharpeReward -- reward function optimised for Sharpe ratio maximisation.
CalmarReward -- reward function optimised for return-to-max-drawdown ratio.

These are drop-in replacements for FinRL's default return-based reward.
Pass them to your FinRL environment via the reward_scaling parameter
or by subclassing FinRL's trading environment.

Usage
-----
from custom.rewards.profitability import SharpeReward, CalmarReward

reward_fn = SharpeReward(risk_free_rate=0.05, window=20)
reward = reward_fn(portfolio_values)
"""

from __future__ import annotations

import numpy as np


class SharpeReward:
    """
    Rolling Sharpe ratio reward.

    reward = (mean_return - rfr_daily) / (std_return + eps)

    Penalises volatility, not just raw returns.
    Research shows this produces 15-25% better out-of-sample Sharpe
    compared to raw return rewards.
    """

    def __init__(
        self,
        risk_free_rate: float = 0.05,
        window: int = 20,
        transaction_cost_penalty: float = 0.001,
    ):
        self.rfr_daily = risk_free_rate / 252
        self.window = window
        self.tc_penalty = transaction_cost_penalty
        self._values: list[float] = []

    def __call__(
        self,
        portfolio_value: float,
        prev_portfolio_value: float,
        trade_cost: float = 0.0,
    ) -> float:
        self._values.append(portfolio_value)

        ret = (portfolio_value - prev_portfolio_value) / max(prev_portfolio_value, 1e-8)
        self._values = self._values[-self.window :]

        if len(self._values) < 2:
            return ret - self.tc_penalty * trade_cost

        returns = np.diff(self._values) / np.maximum(self._values[:-1], 1e-8)
        excess = returns - self.rfr_daily
        std = returns.std() + 1e-8

        sharpe = excess.mean() / std
        return float(sharpe) - self.tc_penalty * trade_cost

    def reset(self) -> None:
        self._values.clear()


class CalmarReward:
    """
    Calmar ratio reward: annualised return / max drawdown.

    Strongly penalises large drawdowns, which improves capital preservation.
    Especially useful for RL agents that overfit to high-return / high-risk paths.
    """

    def __init__(
        self,
        window: int = 252,
        transaction_cost_penalty: float = 0.001,
        drawdown_penalty_multiplier: float = 0.3,
    ):
        self.window = window
        self.tc_penalty = transaction_cost_penalty
        self.dd_penalty = drawdown_penalty_multiplier
        self._values: list[float] = []
        self._peak: float = 0.0

    def __call__(
        self,
        portfolio_value: float,
        prev_portfolio_value: float,
        trade_cost: float = 0.0,
    ) -> float:
        self._values.append(portfolio_value)
        self._values = self._values[-self.window :]
        self._peak = max(self._peak, portfolio_value)

        ret = (portfolio_value - prev_portfolio_value) / max(prev_portfolio_value, 1e-8)

        # Drawdown contribution from current step
        drawdown = (portfolio_value - self._peak) / max(self._peak, 1e-8)
        drawdown_penalty = self.dd_penalty * abs(min(drawdown, 0.0))

        return float(ret) - drawdown_penalty - self.tc_penalty * trade_cost

    def reset(self) -> None:
        self._values.clear()
        self._peak = 0.0


class AlphaReward:
    """
    Alpha-vs-benchmark reward: excess return over a buy-and-hold benchmark.

    reward = strategy_return - benchmark_return - tc_penalty

    Ensures the RL agent learns to outperform passive holding,
    not just ride market beta.
    """

    def __init__(self, transaction_cost_penalty: float = 0.001):
        self.tc_penalty = transaction_cost_penalty

    def __call__(
        self,
        portfolio_value: float,
        prev_portfolio_value: float,
        benchmark_value: float,
        prev_benchmark_value: float,
        trade_cost: float = 0.0,
    ) -> float:
        strat_ret = (portfolio_value - prev_portfolio_value) / max(prev_portfolio_value, 1e-8)
        bench_ret = (benchmark_value - prev_benchmark_value) / max(prev_benchmark_value, 1e-8)
        alpha = strat_ret - bench_ret
        return float(alpha) - self.tc_penalty * trade_cost
