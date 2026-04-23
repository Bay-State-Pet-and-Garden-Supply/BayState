from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from statistics import mean, median, stdev
from typing import Any

from tests.benchmarks.legacy.utils import Timer, MemoryProfiler


@dataclass(frozen=True)
class BenchmarkResult:
    success_rate: float
    accuracy: float
    duration_ms: float
    cost_usd: float
    errors: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)


@dataclass(frozen=True)
class BenchmarkConfig:
    urls: list[str] = field(default_factory=list)
    modes: list[str] = field(default_factory=lambda: ["auto"])
    proxy_config: dict[str, Any] | None = None
    timeout: int = 30
    concurrency: int = 1


@dataclass
class _AggregatedResult:
    results: list[BenchmarkResult] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        if not self.results:
            return {"total": 0}

        durations = [r.duration_ms for r in self.results]
        success_rates = [r.success_rate for r in self.results]
        accuracies = [r.accuracy for r in self.results]
        costs = [r.cost_usd for r in self.results]
        all_errors = [e for r in self.results for e in r.errors]

        return {
            "total": len(self.results),
            "success_rate": {
                "mean": mean(success_rates),
                "min": min(success_rates),
                "max": max(success_rates),
            },
            "accuracy": {
                "mean": mean(accuracies),
                "min": min(accuracies),
                "max": max(accuracies),
            },
            "duration_ms": {
                "mean": mean(durations),
                "median": median(durations),
                "stdev": stdev(durations) if len(durations) > 1 else 0.0,
                "min": min(durations),
                "max": max(durations),
            },
            "cost_usd": {
                "total": sum(costs),
                "mean": mean(costs),
            },
            "errors": {
                "count": len(all_errors),
                "unique": list(set(all_errors)),
            },
        }


class BaseBenchmark(ABC):
    config: BenchmarkConfig
    _timer: Timer
    _memory: MemoryProfiler

    def __init__(self, config: BenchmarkConfig) -> None:
        self.config = config
        self._timer = Timer()
        self._memory = MemoryProfiler()

    @abstractmethod
    def setup(self) -> None: ...

    @abstractmethod
    def run(self) -> BenchmarkResult: ...

    @abstractmethod
    def teardown(self) -> None: ...

    def execute(self) -> BenchmarkResult:
        self.setup()
        try:
            return self.run()
        finally:
            self.teardown()


class BenchmarkSuite:
    config: BenchmarkConfig
    _benchmarks: list[BaseBenchmark]

    def __init__(self, config: BenchmarkConfig) -> None:
        self.config = config
        self._benchmarks = []

    def add(self, benchmark: BaseBenchmark) -> None:
        self._benchmarks.append(benchmark)

    def run_all(self) -> _AggregatedResult:
        aggregated = _AggregatedResult()
        for benchmark in self._benchmarks:
            result = benchmark.execute()
            aggregated.results.append(result)
        return aggregated
