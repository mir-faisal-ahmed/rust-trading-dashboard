"""
ModelLoader -- loads and caches trained RL model checkpoints.
Supports Stable-Baselines3 (PPO/SAC) and ONNX Runtime.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Iterator, Optional

from loguru import logger


class _SB3Model:
    """Wrapper around a Stable-Baselines3 policy."""

    def __init__(self, sb3_model: Any):
        self._model = sb3_model

    def predict(self, features):
        import numpy as np
        obs = features.reshape(1, -1)
        action, _ = self._model.predict(obs, deterministic=True)
        # Softmax so weights sum to 1
        exp = np.exp(action - action.max())
        return (exp / exp.sum()).flatten()


class _OnnxModel:
    """Wrapper around an ONNX Runtime session."""

    def __init__(self, session: Any):
        self._session = session
        self._input_name = session.get_inputs()[0].name

    def predict(self, features):
        import numpy as np
        obs = features.reshape(1, -1).astype(np.float32)
        outputs = self._session.run(None, {self._input_name: obs})
        raw = outputs[0].flatten()
        exp = np.exp(raw - raw.max())
        return exp / exp.sum()


class ModelLoader:
    """Thread-safe model registry."""

    def __init__(self, models_dir: Optional[str] = None):
        self._models: Dict[str, Any] = {}
        self._models_dir = Path(models_dir or os.getenv("MODELS_DIR", "/models"))

    def load(self, model_id: str, checkpoint_path: str) -> None:
        path = Path(checkpoint_path)

        if not path.is_absolute():
            path = self._models_dir / path

        if not path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {path}")

        suffix = path.suffix.lower()

        if suffix == ".onnx":
            self._models[model_id] = self._load_onnx(path)
        elif suffix in (".zip", ""):
            self._models[model_id] = self._load_sb3(path, model_id)
        else:
            raise ValueError(f"Unknown checkpoint format: {suffix}")

        logger.info(f"Registered model '{model_id}' ({suffix})")

    def get(self, model_id: str) -> Optional[Any]:
        return self._models.get(model_id)

    def loaded_model_ids(self) -> Iterator[str]:
        return iter(self._models.keys())

    # ── Loaders ──────────────────────────────────────────────────────────────

    @staticmethod
    def _load_onnx(path: Path) -> _OnnxModel:
        import onnxruntime as ort
        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        return _OnnxModel(session)

    @staticmethod
    def _load_sb3(path: Path, model_id: str) -> _SB3Model:
        # Determine algorithm from model_id prefix (ppo_*, sac_*, a2c_*)
        prefix = model_id.split("_")[0].lower()
        if prefix == "ppo":
            from stable_baselines3 import PPO as Algo
        elif prefix == "sac":
            from stable_baselines3 import SAC as Algo
        elif prefix == "a2c":
            from stable_baselines3 import A2C as Algo
        else:
            # Default: try PPO
            from stable_baselines3 import PPO as Algo
            logger.warning(f"Unknown prefix '{prefix}', defaulting to PPO")

        model = Algo.load(str(path))
        return _SB3Model(model)
