"""
pytest fixtures for benchmark tests.

.. deprecated::
    This module is part of the legacy benchmark suite.
    Use ``tests.benchmarks.unified`` for new benchmarks.
    This file will be removed in a future release.
"""

import pytest
from pathlib import Path

from tests.benchmarks.legacy import BenchmarkConfig, BenchmarkRunner


@pytest.fixture
def benchmark_config():
    """Default benchmark configuration."""
    return BenchmarkConfig(
        iterations=5,  # Reduced for CI
        warmup_iterations=1,
        concurrent_levels=[1, 2, 3],
        output_dir=Path(".sisyphus/evidence"),
    )


@pytest.fixture
def benchmark_runner(benchmark_config):
    """Configured benchmark runner."""
    return BenchmarkRunner(benchmark_config)


@pytest.fixture
def test_urls():
    """Test URLs for benchmarking."""
    return [
        "https://httpbin.org/html",
        "https://example.com",
    ]
