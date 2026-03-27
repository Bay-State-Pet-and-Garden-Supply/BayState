"""Pytest configuration and fixtures."""

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest



def pytest_configure(config):
    """Configure pytest with required path modifications."""
    project_root = Path(__file__).resolve().parent.parent

    # Add tools directory to path for migration imports
    tools_path = project_root / "tools"
    if str(tools_path) not in sys.path:
        sys.path.insert(0, str(tools_path))

    # Add src directory to path for crawl4ai_engine and other modules
    src_path = project_root / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

# Ensure src is in path for all tests
project_root = Path(__file__).resolve().parent.parent
src_path = project_root / "src"
if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))


@dataclass(slots=True)
class _LocalBenchmark:
    """Minimal benchmark fixture fallback for suites that use benchmark.pedantic."""

    def pedantic(
        self,
        target,
        *,
        iterations: int = 1,
        rounds: int = 1,
        warmup_rounds: int = 0,
    ) -> Any:
        for _ in range(max(warmup_rounds, 0)):
            for _ in range(max(iterations, 1)):
                target()

        result: Any = None
        for _ in range(max(rounds, 1)):
            for _ in range(max(iterations, 1)):
                result = target()

        return result


@pytest.fixture
def benchmark() -> _LocalBenchmark:
    return _LocalBenchmark()
