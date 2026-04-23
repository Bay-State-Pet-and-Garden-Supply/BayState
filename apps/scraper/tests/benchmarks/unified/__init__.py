"""
Unified benchmark infrastructure for BayState scraper.

Provides base classes, result dataclasses, and suite orchestration
for running extraction benchmarks across multiple modes and URLs.
"""

from tests.benchmarks.unified.base import (
    BaseBenchmark,
    BenchmarkConfig,
    BenchmarkResult,
    BenchmarkSuite,
)
from tests.benchmarks.unified.metrics import (
    BenchmarkMetrics,
    BenchmarkMetricsCollector,
    BenchmarkReport,
    MetricsStore,
    RegressionResult,
    TrendAnalyzer,
    TrendComparison,
)

__all__ = [
    "BaseBenchmark",
    "BenchmarkConfig",
    "BenchmarkResult",
    "BenchmarkSuite",
    "BenchmarkMetrics",
    "BenchmarkMetricsCollector",
    "BenchmarkReport",
    "MetricsStore",
    "RegressionResult",
    "TrendAnalyzer",
    "TrendComparison",
]
