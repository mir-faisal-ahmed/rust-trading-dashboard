"""
Multi-tier Redis cache optimised for RL training speed.

Tier 1 -- raw OHLCV bars        (24 h TTL, rarely changes)
Tier 2 -- computed features     (1 h TTL, recomputed on new indicators)
Tier 3 -- model predictions     (5 min TTL, invalidated on retrain)

Key design decisions:
- Uses pickle (not JSON) for numpy arrays -- 10x faster serialisation
- Batch pipeline writes for prefetch operations
- Hash-based keys so feature-config changes auto-invalidate

Usage
-----
cache = RedisCache()
bars  = cache.get_bars("AAPL", "2023-01-01", "2024-01-01", fetch_fn)
feats = cache.get_features("AAPL", "2024-01-15", config, compute_fn)
cache.prefetch_features(symbols, start, end, config, compute_fn)
cache.invalidate_model("ppo_v1")
"""

from __future__ import annotations

import hashlib
import pickle
from datetime import date
from typing import Any, Callable, Dict, List, Optional

from loguru import logger


def _make_key(*parts: Any) -> str:
    return ":".join(str(p) for p in parts)


def _hash_config(config: Any) -> str:
    return hashlib.md5(str(config).encode()).hexdigest()[:8]


class RedisCache:
    TTL_BARS = 86_400      # 24 h
    TTL_FEATURES = 3_600   # 1 h
    TTL_WEIGHTS = 300      # 5 min

    def __init__(self, url: Optional[str] = None):
        import os
        import redis

        redis_url = url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self._r = redis.from_url(redis_url, decode_responses=False)
        logger.info(f"RedisCache connected to {redis_url}")

    # ── Tier 1: Raw bars ─────────────────────────────────────────────────────

    def get_bars(
        self,
        symbol: str,
        start: str,
        end: str,
        fetch_fn: Callable,
    ) -> Any:
        key = _make_key("bars", symbol, start, end)
        hit = self._r.get(key)
        if hit:
            logger.debug(f"Cache HIT bars:{symbol}")
            return pickle.loads(hit)

        data = fetch_fn(symbol, start, end)
        self._r.setex(key, self.TTL_BARS, pickle.dumps(data))
        return data

    # ── Tier 2: Computed features ─────────────────────────────────────────────

    def get_features(
        self,
        symbol: str,
        as_of: date,
        feature_config: Any,
        compute_fn: Callable,
    ) -> Any:
        key = _make_key("features", symbol, as_of.isoformat(), _hash_config(feature_config))
        hit = self._r.get(key)
        if hit:
            logger.debug(f"Cache HIT features:{symbol}:{as_of}")
            return pickle.loads(hit)

        feats = compute_fn(symbol, as_of, feature_config)
        self._r.setex(key, self.TTL_FEATURES, pickle.dumps(feats))
        return feats

    # ── Tier 3: Model weight predictions ─────────────────────────────────────

    def get_weights(
        self,
        model_id: str,
        state_hash: str,
        predict_fn: Callable,
        state: Any,
    ) -> Any:
        key = _make_key("weights", model_id, state_hash)
        hit = self._r.get(key)
        if hit:
            return pickle.loads(hit)

        weights = predict_fn(state)
        self._r.setex(key, self.TTL_WEIGHTS, pickle.dumps(weights))
        return weights

    # ── Bulk prefetch ─────────────────────────────────────────────────────────

    def prefetch_features(
        self,
        symbols: List[str],
        start: date,
        end: date,
        feature_config: Any,
        compute_fn: Callable,
    ) -> int:
        """Pre-populate feature cache for a date range.  Returns entries written."""
        import pandas as pd

        dates = pd.date_range(start, end, freq="B").date  # business days only
        cfg_hash = _hash_config(feature_config)
        written = 0

        with self._r.pipeline() as pipe:
            for symbol in symbols:
                for d in dates:
                    key = _make_key("features", symbol, d.isoformat(), cfg_hash)
                    if self._r.exists(key):
                        continue
                    try:
                        feats = compute_fn(symbol, d, feature_config)
                        pipe.setex(key, self.TTL_FEATURES, pickle.dumps(feats))
                        written += 1
                    except Exception as e:
                        logger.warning(f"prefetch failed {symbol}:{d}: {e}")
            pipe.execute()

        logger.info(f"Prefetched {written} feature entries for {len(symbols)} symbols")
        return written

    # ── Cache invalidation ────────────────────────────────────────────────────

    def invalidate_model(self, model_id: str) -> int:
        pattern = f"weights:{model_id}:*"
        keys = list(self._r.scan_iter(match=pattern))
        if keys:
            self._r.delete(*keys)
        logger.info(f"Invalidated {len(keys)} weight entries for model '{model_id}'")
        return len(keys)

    def invalidate_features(self, symbol: str) -> int:
        pattern = f"features:{symbol}:*"
        keys = list(self._r.scan_iter(match=pattern))
        if keys:
            self._r.delete(*keys)
        logger.info(f"Invalidated {len(keys)} feature entries for '{symbol}'")
        return len(keys)
