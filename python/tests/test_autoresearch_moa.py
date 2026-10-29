from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


def load_module():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "autoresearch_moa.py"
    spec = importlib.util.spec_from_file_location("autoresearch_moa", module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class AutoresearchMoATests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_safe_extract_python_code_prefers_python_block(self) -> None:
        text = "before```python\nprint('ok')\n```after"
        self.assertEqual(self.module.safe_extract_python_code(text), "print('ok')")

    def test_truncate_text_adds_marker_when_needed(self) -> None:
        text = "a" * 200
        truncated = self.module.truncate_text(text, 50)
        self.assertTrue(truncated.endswith("...[truncated]..."))
        self.assertLessEqual(len(truncated), 50)

    def test_summarize_strategies_includes_key_fields(self) -> None:
        summary = self.module.summarize_strategies(
            [
                {
                    "name": "RL Market Maker",
                    "code_key": "rl_market_maker_v1",
                    "status": "retired",
                    "is_active": False,
                    "source_path": "backend/src/strategies/rl_market_maker.rs",
                    "parameters": {"threshold": 0.6},
                }
            ]
        )
        self.assertIn("RL Market Maker", summary)
        self.assertIn("rl_market_maker_v1", summary)
        self.assertIn("retired", summary)


if __name__ == "__main__":
    unittest.main()
