"""gRPC server smoke test -- runs without a real model."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest


def test_model_loader_missing_file():
    from services.model_loader import ModelLoader

    loader = ModelLoader(models_dir="/tmp")
    with pytest.raises(FileNotFoundError):
        loader.load("test_model", "nonexistent.zip")


def test_model_loader_get_missing():
    from services.model_loader import ModelLoader

    loader = ModelLoader(models_dir="/tmp")
    assert loader.get("does_not_exist") is None


def test_model_loader_ids_empty():
    from services.model_loader import ModelLoader

    loader = ModelLoader(models_dir="/tmp")
    assert list(loader.loaded_model_ids()) == []
