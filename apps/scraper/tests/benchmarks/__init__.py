"""
Performance Benchmark Suite for crawl4ai vs Legacy Scraper

Benchmarks:
- Per-SKU extraction time
- Concurrent extraction limits
- Memory usage per page
- Browser startup time
"""

from .benchmark_runner import BenchmarkRunner, BenchmarkConfig
from .utils import BenchmarkResults, Timer, MemoryProfiler

__all__ = [
    "BenchmarkRunner",
    "BenchmarkConfig",
    "BenchmarkResults",
    "Timer",
    "MemoryProfiler",
]
