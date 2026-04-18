from __future__ import annotations

import json
import math
import statistics
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeAlias

import pytest

from core.performance_profiler import *


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_PATH = PROJECT_ROOT / ".sisyphus" / "evidence" / "t18-benchmark.json"
JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | Mapping[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]
JsonMapping: TypeAlias = Mapping[str, JsonValue]


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "benchmark: performance benchmark tests")


def _percentile(sorted_values: list[float], ratio: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])

    bounded_ratio = min(max(ratio, 0.0), 1.0)
    index = (len(sorted_values) - 1) * bounded_ratio
    lower = math.floor(index)
    upper = math.ceil(index)

    if lower == upper:
        return float(sorted_values[lower])

    weight = index - lower
    lower_value = float(sorted_values[lower])
    upper_value = float(sorted_values[upper])
    return lower_value + (upper_value - lower_value) * weight


def _build_summary(values: list[float]) -> dict[str, float]:
    if not values:
        return {
            "min_ms": 0.0,
            "max_ms": 0.0,
            "mean_ms": 0.0,
            "p95_ms": 0.0,
            "p99_ms": 0.0,
        }

    ordered = sorted(values)
    return {
        "min_ms": round(float(min(ordered)), 3),
        "max_ms": round(float(max(ordered)), 3),
        "mean_ms": round(float(statistics.mean(ordered)), 3),
        "p95_ms": round(_percentile(ordered, 0.95), 3),
        "p99_ms": round(_percentile(ordered, 0.99), 3),
    }


def _operation_stats_to_dict(stats: OperationStats) -> JsonObject:
    return {
        "operation_type": stats.operation_type.value,
        "count": stats.count,
        "total_ms": round(stats.total_ms, 3),
        "min_ms": round(stats.min_ms, 3),
        "max_ms": round(stats.max_ms, 3),
        "avg_ms": round(stats.avg_ms, 3),
        "std_dev_ms": round(stats.std_dev_ms, 3),
        "p50_ms": round(stats.p50_ms, 3),
        "p95_ms": round(stats.p95_ms, 3),
        "p99_ms": round(stats.p99_ms, 3),
        "success_rate": round(stats.success_rate, 4),
    }


@pytest.fixture
def benchmark_report_path() -> Path:
    return EVIDENCE_PATH


@pytest.fixture
def benchmark_report_writer(benchmark_report_path: Path) -> Callable[[JsonMapping], Path]:
    def _write(payload: JsonMapping) -> Path:
        benchmark_report_path.parent.mkdir(parents=True, exist_ok=True)
        output: JsonObject = {"generated_at": datetime.now(tz=timezone.utc).isoformat()}
        for key, value in payload.items():
            output[key] = value
        _ = benchmark_report_path.write_text(
            json.dumps(output, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return benchmark_report_path

    return _write


@pytest.fixture
def timing_summary_builder() -> Callable[[list[float]], dict[str, float]]:
    return _build_summary


@pytest.fixture
def operation_stats_serializer() -> Callable[[dict[OperationType, OperationStats]], dict[str, JsonObject]]:
    def _serialize(stats_map: dict[OperationType, OperationStats]) -> dict[str, JsonObject]:
        return {operation_type.value: _operation_stats_to_dict(stats) for operation_type, stats in stats_map.items()}

    return _serialize
