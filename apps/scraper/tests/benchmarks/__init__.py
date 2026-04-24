"""
Performance Benchmark Suite for crawl4ai vs Legacy Scraper

Benchmarks:
- Per-SKU extraction time
- Concurrent extraction limits
- Memory usage per page
- Browser startup time

Legacy benchmarks have been moved to ``tests.benchmarks.legacy``.
Use ``tests.benchmarks.unified`` for new benchmarks.
"""

import warnings

warnings.warn(
    "Legacy benchmarks are deprecated. Import from tests.benchmarks.legacy explicitly, or use tests.benchmarks.unified for new benchmarks.",
    DeprecationWarning,
    stacklevel=2,
)

from tests.benchmarks.legacy.benchmark_runner import BenchmarkRunner, BenchmarkConfig
from tests.benchmarks.legacy.utils import BenchmarkResults, Timer, MemoryProfiler

__all__ = [
    "BenchmarkRunner",
    "BenchmarkConfig",
    "BenchmarkResults",
    "Timer",
    "MemoryProfiler",
]
