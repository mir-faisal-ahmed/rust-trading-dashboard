#!/usr/bin/env python3
"""
Export a trained Stable-Baselines3 PPO/SAC policy to ONNX.

The exported graph: obs (float32[1, n_features]) → weights (float32[1, n_actions])
Weights are softmax-normalised -- ready to drop into model_loader._OnnxModel.

Usage
-----
python scripts/export_onnx.py \
    --checkpoint ../models/ppo_v1.zip \
    --output     ../models/ppo_v1.onnx \
    --algorithm  ppo          # ppo | sac | a2c
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import numpy as np
from loguru import logger


class _SoftmaxPolicyWrapper(object):
    """Wraps the SB3 policy action network and applies softmax."""

    def __init__(self, policy):
        import torch
        import torch.nn as nn

        class _Net(nn.Module):
            def __init__(self, inner):
                super().__init__()
                self._policy = inner

            def forward(self, obs: "torch.Tensor") -> "torch.Tensor":
                import torch.nn.functional as F
                with torch.no_grad():
                    # PPO: policy.actor extracts features + action logits
                    # SAC: policy.actor extracts latent → mean action
                    features = self._policy.extract_features(obs)
                    if hasattr(self._policy, "mlp_extractor"):
                        latent, _ = self._policy.mlp_extractor(features)
                    else:
                        latent = features
                    if hasattr(self._policy, "action_net"):
                        logits = self._policy.action_net(latent)
                    elif hasattr(self._policy, "actor"):
                        logits = self._policy.actor(latent)
                    else:
                        logits = latent
                    return F.softmax(logits, dim=-1)

        self.net = _Net(policy)

    def to_onnx(self, dummy, out_path: str):
        import torch
        torch.onnx.export(
            self.net,
            dummy,
            out_path,
            opset_version=14,
            input_names=["obs"],
            output_names=["weights"],
            dynamic_axes={"obs": {0: "batch"}, "weights": {0: "batch"}},
        )


def export(checkpoint: str, output: str, algorithm: str):
    import torch

    if algorithm == "ppo":
        from stable_baselines3 import PPO as Algo
    elif algorithm == "sac":
        from stable_baselines3 import SAC as Algo
    elif algorithm == "a2c":
        from stable_baselines3 import A2C as Algo
    else:
        logger.error(f"Unknown algorithm: {algorithm}")
        sys.exit(1)

    logger.info(f"Loading checkpoint: {checkpoint}")
    model = Algo.load(checkpoint)
    policy = model.policy.eval()

    obs_space = model.observation_space
    n_features = int(np.prod(obs_space.shape))
    logger.info(f"Observation space: {obs_space.shape}  ({n_features} features)")

    dummy = torch.zeros((1, n_features), dtype=torch.float32)
    out_path = str(Path(output).with_suffix(".onnx"))
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    wrapper = _SoftmaxPolicyWrapper(policy)
    logger.info(f"Exporting to ONNX: {out_path}")
    wrapper.to_onnx(dummy, out_path)

    # Validate with onnx checker
    try:
        import onnx
        proto = onnx.load(out_path)
        onnx.checker.check_model(proto)
        logger.info("ONNX model check passed")
    except ImportError:
        logger.warning("onnx package not installed, skipping structural check")

    # Parity check: compare softmax(torch) vs ONNX Runtime
    try:
        import onnxruntime as ort
        import torch.nn.functional as F

        sess = ort.InferenceSession(out_path, providers=["CPUExecutionProvider"])
        with torch.no_grad():
            features = policy.extract_features(dummy)
            if hasattr(policy, "mlp_extractor"):
                latent, _ = policy.mlp_extractor(features)
            else:
                latent = features
            if hasattr(policy, "action_net"):
                logits = policy.action_net(latent)
            elif hasattr(policy, "actor"):
                logits = policy.actor(latent)
            else:
                logits = latent
            torch_weights = F.softmax(logits, dim=-1).numpy()

        ort_weights = sess.run(None, {"obs": dummy.numpy()})[0]
        max_diff = float(np.abs(torch_weights - ort_weights).max())
        if max_diff < 1e-4:
            logger.info(f"Parity check passed (max diff {max_diff:.2e})")
        else:
            logger.warning(f"Parity check: max diff {max_diff:.2e} -- investigate")

        logger.info(f"Sample weights: {ort_weights.flatten()}")
        logger.info(f"Sum: {ort_weights.sum():.6f}")
    except ImportError:
        logger.warning("onnxruntime not installed, skipping parity check")

    size_kb = Path(out_path).stat().st_size / 1024
    logger.info(f"Export complete: {out_path} ({size_kb:.1f} KB)")


def main():
    parser = argparse.ArgumentParser(description="Export SB3 policy to ONNX")
    parser.add_argument("--checkpoint", required=True, help="Path to .zip checkpoint")
    parser.add_argument("--output", required=True, help="Output .onnx path (or dir)")
    parser.add_argument("--algorithm", choices=["ppo", "sac", "a2c"], default="ppo")
    args = parser.parse_args()

    logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "INFO"))
    export(args.checkpoint, args.output, args.algorithm)


if __name__ == "__main__":
    main()
