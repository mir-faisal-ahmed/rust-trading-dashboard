#!/usr/bin/env python3
"""
Mock FinRL gRPC server for testing the end-to-end pipeline.

Returns softmax-normalised weights derived from momentum signals
computed from the feature vector -- no PyTorch or FinRL required.

Run:  python python/services/mock_server.py
"""

import os
import sys
import time
import math
import random
from concurrent import futures
from pathlib import Path

import grpc
from loguru import logger

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

import finrl_service_pb2 as pb2
import finrl_service_pb2_grpc as pb2_grpc


def _softmax(values: list[float]) -> list[float]:
    m = max(values)
    exps = [math.exp(v - m) for v in values]
    total = sum(exps)
    return [e / total for e in exps]


class MockFinRLServicer(pb2_grpc.FinRLServiceServicer):
    """
    Serves deterministic equal-weight + small momentum tilt weights.
    Feature layout (5 features per symbol):
      [norm_price, rsi/100, price_deviation, atr_pct, volume_ratio]
    The mock strategy tilts allocation toward symbols with:
      - High RSI (momentum)
      - Positive price deviation (trend)
    """

    def __init__(self):
        logger.info("MockFinRLServicer ready (no model required)")

    def PredictWeights(self, request, context):
        start = time.perf_counter()
        symbols = list(request.symbols)
        features = list(request.features)
        n = len(symbols)

        if n == 0:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("symbols list is empty")
            return pb2.PredictResponse()

        n_feats_per_sym = len(features) // n if n > 0 else 5

        # Score each symbol from its features
        scores = []
        for i, sym in enumerate(symbols):
            base = i * n_feats_per_sym
            if base + n_feats_per_sym <= len(features):
                rsi_norm = features[base + 1]           # RSI/100
                price_dev = features[base + 2]          # (close - sma20) / close
                vol_ratio = features[base + 4] if n_feats_per_sym > 4 else 1.0
                # Momentum tilt: higher RSI + positive trend = higher weight
                score = rsi_norm * 0.4 + max(price_dev, 0) * 0.4 + min(vol_ratio / 2.0, 0.5) * 0.2
            else:
                score = 0.5  # neutral
            # Add small noise for realism
            score += random.gauss(0, 0.02)
            scores.append(max(score, 0.01))

        weights = _softmax(scores)
        weights_map = {sym: float(w) for sym, w in zip(symbols, weights)}

        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.debug(f"PredictWeights: {weights_map} ({elapsed_ms:.2f}ms)")
        return pb2.PredictResponse(weights=weights_map, inference_time_ms=elapsed_ms)

    def LoadModel(self, request, context):
        logger.info(f"LoadModel called (mock): model_id={request.model_id}")
        return pb2.LoadModelResponse(success=True, message="mock model loaded")

    def HealthCheck(self, request, context):
        return pb2.HealthCheckResponse(
            healthy=True,
            version="mock-0.1.0",
            loaded_models=["mock_ppo_v1"],
        )


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    pb2_grpc.add_FinRLServiceServicer_to_server(MockFinRLServicer(), server)
    port = os.getenv("FINRL_GRPC_PORT", "50051")
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"Mock FinRL gRPC server listening on port {port}")
    logger.info("Returns momentum-tilted weights (no model required)")
    server.wait_for_termination()


if __name__ == "__main__":
    logger.add(sys.stderr, level="DEBUG")
    serve()
