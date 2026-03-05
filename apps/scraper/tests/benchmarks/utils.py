"""
Benchmark utilities for performance testing.
"""

from __future__ import annotations

import json
import time
import tracemalloc
from contextlib import contextmanager
from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class BenchmarkResults:
    """Container for benchmark results."""

    name: str
    iterations: int
    total_time_ms: float
    avg_time_ms: float
    min_time_ms: float
    max_time_ms: float
    median_time_ms: float
    std_dev_ms: float
    p95_time_ms: float
    p99_time_ms: float
    memory_before_mb: float
    memory_after_mb: float
    memory_delta_mb: float
    peak_memory_mb: float
    success_count: int
    failure_count: int
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=indent, default=str)


class Timer:
    """High-precision timer for benchmarking."""

    def __init__(self):
        self._start_time: float | None = None
        self._elapsed_times: list[float] = []

    def start(self) -> None:
        """Start the timer."""
        self._start_time = time.perf_counter()

    def stop(self) -> float:
        """Stop the timer and return elapsed time in ms."""
        if self._start_time is None:
            raise RuntimeError("Timer not started")
        elapsed = (time.perf_counter() - self._start_time) * 1000
        self._elapsed_times.append(elapsed)
        self._start_time = None
        return elapsed

    @contextmanager
    def measure(self):
        """Context manager for timing."""
        self.start()
        try:
            yield
        finally:
            self.stop()

    def get_stats(self) -> dict[str, float]:
        """Get timing statistics."""
        if not self._elapsed_times:
            return {}

        import statistics

        times = self._elapsed_times
        times_sorted = sorted(times)
        n = len(times)

        return {
            "count": n,
            "total_ms": sum(times),
            "avg_ms": statistics.mean(times),
            "min_ms": min(times),
            "max_ms": max(times),
            "median_ms": times_sorted[n // 2],
            "std_dev_ms": statistics.stdev(times) if n > 1 else 0.0,
            "p95_ms": times_sorted[int(n * 0.95)] if n >= 20 else times_sorted[-1],
            "p99_ms": times_sorted[int(n * 0.99)] if n >= 100 else times_sorted[-1],
        }


class MemoryProfiler:
    """Memory profiling utility."""

    def __init__(self):
        self._tracing = False
        self._baseline: int = 0
        self._peak: int = 0

    def start(self) -> None:
        """Start memory tracing."""
        tracemalloc.start()
        self._tracing = True
        self._baseline, self._peak = tracemalloc.get_traced_memory()

    def stop(self) -> dict[str, float]:
        """Stop memory tracing and return stats."""
        if not self._tracing:
            return {}

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        self._tracing = False

        def to_mb(b: int) -> float:
            return b / (1024 * 1024)

        return {
            "baseline_mb": to_mb(self._baseline),
            "current_mb": to_mb(current),
            "peak_mb": to_mb(peak),
            "delta_mb": to_mb(current - self._baseline),
        }

    @contextmanager
    def profile(self):
        """Context manager for memory profiling."""
        self.start()
        try:
            yield self
        finally:
            stats = self.stop()
            self._last_stats = stats

    def get_stats(self) -> dict[str, float]:
        """Get last memory stats."""
        return getattr(self, "_last_stats", {})


@contextmanager
def benchmark_context(name: str):
    """Combined timing and memory benchmark context."""
    timer = Timer()
    memory = MemoryProfiler()

    memory.start()
    timer.start()

    result = {
        "name": name,
        "success": True,
        "error": None,
    }

    try:
        with timer.measure():
            yield result
    except Exception as e:
        result["success"] = False
        result["error"] = str(e)
        raise
    finally:
        elapsed = timer.stop() if timer._start_time else 0
        mem_stats = memory.stop()

        result.update(
            {
                "elapsed_ms": elapsed,
                **mem_stats,
            }
        )


def calculate_percentiles(values: list[float]) -> dict[str, float]:
    """Calculate percentile statistics."""
    if not values:
        return {}

    sorted_vals = sorted(values)
    n = len(sorted_vals)

    def percentile(p: float) -> float:
        idx = int(n * p)
        return sorted_vals[min(idx, n - 1)]

    return {
        "p50": percentile(0.50),
        "p90": percentile(0.90),
        "p95": percentile(0.95),
        "p99": percentile(0.99),
    }
