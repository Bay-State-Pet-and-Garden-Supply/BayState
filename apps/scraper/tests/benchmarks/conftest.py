"""
pytest fixtures for benchmark tests.
"""

import pytest
from pathlib import Path

from benchmarks import BenchmarkConfig, BenchmarkRunner


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
