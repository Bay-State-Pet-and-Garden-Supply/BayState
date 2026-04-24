"""
Legacy benchmark suite for crawl4ai vs legacy scraper comparison.

.. deprecated::
    Use ``tests.benchmarks.unified`` for new benchmarks.
    This package will be removed in a future release.
"""

import warnings

warnings.warn(
    "tests.benchmarks.legacy is deprecated. Use tests.benchmarks.unified for new benchmarks.",
    DeprecationWarning,
    stacklevel=2,
)

from .benchmark_runner import BenchmarkRunner, BenchmarkConfig
from .utils import BenchmarkResults, Timer, MemoryProfiler

__all__ = [
    "BenchmarkRunner",
    "BenchmarkConfig",
    "BenchmarkResults",
    "Timer",
    "MemoryProfiler",
]
