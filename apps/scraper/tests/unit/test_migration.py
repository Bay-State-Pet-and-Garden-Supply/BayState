from __future__ import annotations

import sys
import importlib.util
from pathlib import Path

import pytest


_tools_path = Path(__file__).resolve().parent.parent.parent / "tools"
if str(_tools_path) not in sys.path:
    sys.path.insert(0, str(_tools_path))


def test_migration_tool_is_deprecated() -> None:
    module_path = _tools_path / "migrate_configs.py"
    spec = importlib.util.spec_from_file_location("migrate_configs", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    with pytest.raises(RuntimeError, match="deprecated"):
        module.ConfigNormalizer(None)
