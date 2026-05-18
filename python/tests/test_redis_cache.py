"""Redis cache unit tests -- uses fakeredis so no real Redis needed."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest


@pytest.fixture
def cache():
    import fakeredis
    from custom.cache.redis_optimized import RedisCache

    c = RedisCache.__new__(RedisCache)
    c._r = fakeredis.FakeRedis()
    return c


def test_get_bars_calls_fetch_on_miss(cache):
    called = []

    def fetch_fn(symbol, start, end):
        called.append(symbol)
        return [{"t": "2024-01-02", "c": 185.0}]

    result = cache.get_bars("AAPL", "2024-01-01", "2024-12-31", fetch_fn)
    assert called == ["AAPL"]
    assert result[0]["c"] == 185.0


def test_get_bars_uses_cache_on_hit(cache):
    called = []

    def fetch_fn(symbol, start, end):
        called.append(symbol)
        return [{"t": "2024-01-02", "c": 185.0}]

    cache.get_bars("AAPL", "2024-01-01", "2024-12-31", fetch_fn)
    cache.get_bars("AAPL", "2024-01-01", "2024-12-31", fetch_fn)
    # fetch_fn should only be called once
    assert len(called) == 1


def test_invalidate_model(cache):
    import pickle

    cache._r.setex("weights:ppo_v1:abc123", 300, pickle.dumps({"AAPL": 0.5}))
    cache._r.setex("weights:ppo_v1:def456", 300, pickle.dumps({"AAPL": 0.4}))

    deleted = cache.invalidate_model("ppo_v1")
    assert deleted == 2
    assert cache._r.get("weights:ppo_v1:abc123") is None
