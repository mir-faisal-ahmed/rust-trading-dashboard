#!/usr/bin/env python3
"""
FinRL gRPC Server

Serves trained RL models for portfolio weight predictions.
Called by Rust execution engine via gRPC.
"""

import os
import sys
import time
from concurrent import futures
from pathlib import Path

import grpc
from loguru import logger

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from services import finrl_service_pb2 as finrl_pb2
    from services import finrl_service_pb2_grpc as finrl_pb2_grpc
    PROTO_COMPILED = True
except ImportError:
    try:
        import finrl_service_pb2 as finrl_pb2
        import finrl_service_pb2_grpc as finrl_pb2_grpc
        PROTO_COMPILED = True
    except ImportError:
        PROTO_COMPILED = False
        logger.warning("Proto stubs not found. Run: python -m grpc_tools.protoc ...")


class FinRLServicer:
    """gRPC servicer -- wraps loaded RL models."""

    def __init__(self):
        from services.model_loader import ModelLoader
        self.loader = ModelLoader()
        logger.info("FinRLServicer ready")

    def PredictWeights(self, request, context):
        start = time.perf_counter()

        model = self.loader.get(request.model_id)
        if model is None:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"Model '{request.model_id}' not loaded")
            return finrl_pb2.PredictResponse()

        import numpy as np
        features = np.array(request.features, dtype=np.float32)
        raw_weights = model.predict(features)

        symbols = list(request.symbols)
        if len(raw_weights) != len(symbols):
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details(
                f"Model output size {len(raw_weights)} != symbols {len(symbols)}"
            )
            return finrl_pb2.PredictResponse()

        weights = {sym: float(raw_weights[i]) for i, sym in enumerate(symbols)}
        elapsed_ms = (time.perf_counter() - start) * 1000

        logger.debug(f"PredictWeights model={request.model_id} latency={elapsed_ms:.2f}ms")
        return finrl_pb2.PredictResponse(weights=weights, inference_time_ms=elapsed_ms)

    def LoadModel(self, request, context):
        try:
            self.loader.load(request.model_id, request.checkpoint_path)
            logger.info(f"Loaded model '{request.model_id}' from {request.checkpoint_path}")
            return finrl_pb2.LoadModelResponse(success=True, message="OK")
        except Exception as e:
            logger.error(f"LoadModel failed: {e}")
            return finrl_pb2.LoadModelResponse(success=False, message=str(e))

    def HealthCheck(self, request, context):
        return finrl_pb2.HealthCheckResponse(
            healthy=True,
            version="0.1.0",
            loaded_models=list(self.loader.loaded_model_ids()),
        )


def _autoload_models(servicer: "FinRLServicer") -> None:
    """Load all .zip and .onnx files from MODELS_DIR at startup."""
    models_dir = Path(os.getenv("MODELS_DIR", "/models"))
    if not models_dir.exists():
        return
    for path in sorted(models_dir.iterdir()):
        if path.suffix.lower() in (".zip", ".onnx"):
            model_id = path.stem  # filename without extension
            try:
                servicer.loader.load(model_id, str(path))
                logger.info(f"Auto-loaded model '{model_id}' from {path}")
            except Exception as e:
                logger.warning(f"Failed to auto-load '{model_id}': {e}")


def serve():
    if not PROTO_COMPILED:
        logger.error(
            "Proto stubs not found. Compile first:\n"
            "  python -m grpc_tools.protoc -I./protos "
            "--python_out=./services --grpc_python_out=./services "
            "./protos/finrl_service.proto"
        )
        sys.exit(1)

    servicer = FinRLServicer()
    _autoload_models(servicer)

    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=int(os.getenv("GRPC_WORKERS", "4")))
    )
    finrl_pb2_grpc.add_FinRLServiceServicer_to_server(servicer, server)

    port = os.getenv("FINRL_GRPC_PORT", "50051")
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"FinRL gRPC server listening on port {port}")
    server.wait_for_termination()


if __name__ == "__main__":
    logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
    serve()
