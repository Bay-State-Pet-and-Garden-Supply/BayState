"""T18 performance benchmarking for crawl4ai migration.

Goals covered:
- extraction time per SKU (>=50 samples)
- concurrency limits (1/5/10/20)
- memory profiling (memory_profiler)
- error-path benchmarking
- JSON evidence output to .sisyphus/evidence/t18-benchmark.json
"""

from __future__ import annotations

import asyncio
import itertools
import json
import os
import platform
import random
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

memory_usage = pytest.importorskip("memory_profiler").memory_usage

from tests.t17_ab_test_harness import ABTestHarness, ExtractionResult

MIN_SKU_SAMPLES = 50
CONCURRENCY_LEVELS: tuple[int, ...] = (1, 5, 10, 20)
MEMORY_LEAK_THRESHOLD_MB = 64.0
BENCHMARK_SEED = 1754

SCRAPER_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = SCRAPER_ROOT.parent


def _resolve_evidence_path() -> Path:
    workspace_plan = WORKSPACE_ROOT / ".sisyphus" / "plans" / "crawl4ai-migration.md"
    if workspace_plan.exists():
        return WORKSPACE_ROOT / ".sisyphus" / "evidence" / "t18-benchmark.json"
    return SCRAPER_ROOT / ".sisyphus" / "evidence" / "t18-benchmark.json"


EVIDENCE_PATH = _resolve_evidence_path()

REPORT_STATE: dict[str, Any] = {
    "per_sku_timing": {},
    "concurrency": {"levels": {}},
    "memory_profile": {},
    "error_path": {},
}


def _round(value: float, digits: int = 3) -> float:
    return round(value, digits)


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int((len(ordered) - 1) * ratio)
    return float(ordered[index])


def _expand_samples(harness: ABTestHarness, minimum: int) -> list[dict[str, Any]]:
    base = harness.load_test_skus()
    if not base:
        raise AssertionError("No samples loaded from T17 harness")

    expanded: list[dict[str, Any]] = []
    for idx, sku_data in enumerate(
        itertools.islice(itertools.cycle(base), minimum),
        start=1,
    ):
        row = dict(sku_data)
        row["sample_id"] = f"{row.get('sku', 'unknown')}::{idx:03d}"
        expanded.append(row)
    return expanded


def _expected_fields(sample: dict[str, Any]) -> list[str]:
    expected = sample.get("expected", [])
    return [str(field) for field in expected]


async def _extract(
    harness: ABTestHarness,
    system: str,
    sample: dict[str, Any],
) -> tuple[ExtractionResult, float]:
    sku = str(sample.get("sku", ""))
    config = str(sample.get("config", "unknown"))
    fields = _expected_fields(sample)

    start = time.perf_counter()
    if system == "crawl4ai":
        result = await harness.simulate_crawl4ai_extraction(
            sku=sku,
            config=config,
            expected_fields=fields,
        )
    else:
        result = await harness.simulate_browser_use_extraction(
            sku=sku,
            config=config,
            expected_fields=fields,
        )
    elapsed_ms = (time.perf_counter() - start) * 1000
    return result, elapsed_ms


def _build_per_sku_timing() -> dict[str, Any]:
    random.seed(BENCHMARK_SEED)
    harness = ABTestHarness()
    samples = _expand_samples(harness, MIN_SKU_SAMPLES)

    async def _run() -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for sample in samples:
            c4a, c4a_ms = await _extract(harness, "crawl4ai", sample)
            legacy, legacy_ms = await _extract(harness, "browser-use", sample)
            rows.append(
                {
                    "sample_id": str(sample["sample_id"]),
                    "sku": str(sample.get("sku", "")),
                    "config": str(sample.get("config", "unknown")),
                    "expected_failure": bool(sample.get("expect_failure", False)),
                    "edge_case": bool(sample.get("edge_case", False)),
                    "crawl4ai_ms": _round(c4a_ms),
                    "legacy_ms": _round(legacy_ms),
                    "speedup_factor": _round((legacy_ms / c4a_ms) if c4a_ms else 0.0),
                    "crawl4ai_success": bool(c4a.success),
                    "legacy_success": bool(legacy.success),
                    "crawl4ai_error_count": len(c4a.errors),
                    "legacy_error_count": len(legacy.errors),
                }
            )
        return rows

    rows = asyncio.run(_run())
    c4a_times = [float(row["crawl4ai_ms"]) for row in rows]
    legacy_times = [float(row["legacy_ms"]) for row in rows]

    sample_count = len(rows)
    c4a_success_count = sum(1 for row in rows if row["crawl4ai_success"])
    legacy_success_count = sum(1 for row in rows if row["legacy_success"])

    summary = {
        "sample_size": sample_count,
        "unique_skus": len({str(row["sku"]) for row in rows}),
        "crawl4ai_avg_ms": _round(statistics.fmean(c4a_times)),
        "legacy_avg_ms": _round(statistics.fmean(legacy_times)),
        "crawl4ai_p95_ms": _round(_percentile(c4a_times, 0.95)),
        "legacy_p95_ms": _round(_percentile(legacy_times, 0.95)),
        "crawl4ai_success_rate": _round(c4a_success_count / sample_count, 4),
        "legacy_success_rate": _round(legacy_success_count / sample_count, 4),
        "overall_speedup_factor": _round(statistics.fmean(legacy_times) / statistics.fmean(c4a_times)),
    }
    return {"summary": summary, "timings": rows}


async def _run_concurrent_batch(
    harness: ABTestHarness,
    system: str,
    samples: list[dict[str, Any]],
) -> dict[str, Any]:
    tasks = [_extract(harness, system, sample) for sample in samples]
    start = time.perf_counter()
    results = await asyncio.gather(*tasks)
    elapsed_ms = (time.perf_counter() - start) * 1000

    req_times = [elapsed for _, elapsed in results]
    success_count = sum(1 for result, _ in results if result.success)
    total = len(results)

    return {
        "total_elapsed_ms": _round(elapsed_ms),
        "per_request_wall_ms": _round(elapsed_ms / total),
        "mean_single_request_ms": _round(statistics.fmean(req_times)),
        "p95_single_request_ms": _round(_percentile(req_times, 0.95)),
        "throughput_req_per_sec": _round(total / (elapsed_ms / 1000.0)),
        "success_rate": _round(success_count / total, 4),
    }


def _measure_concurrency_level(level: int) -> dict[str, Any]:
    random.seed(BENCHMARK_SEED + level)
    harness = ABTestHarness()
    samples = _expand_samples(harness, level)

    async def _run() -> dict[str, Any]:
        c4a = await _run_concurrent_batch(harness, "crawl4ai", samples)
        legacy = await _run_concurrent_batch(harness, "browser-use", samples)
        speedup = (legacy["total_elapsed_ms"] / c4a["total_elapsed_ms"]) if c4a["total_elapsed_ms"] else 0.0
        return {
            "concurrency": level,
            "crawl4ai": c4a,
            "browser_use": legacy,
            "speedup_factor": _round(speedup),
        }

    return asyncio.run(_run())


def _run_memory_batch(system: str, sample_size: int) -> dict[str, Any]:
    random.seed(BENCHMARK_SEED + sample_size)
    harness = ABTestHarness()
    samples = _expand_samples(harness, sample_size)

    async def _run() -> dict[str, Any]:
        success_count = 0
        for sample in samples:
            result, _ = await _extract(harness, system, sample)
            if result.success:
                success_count += 1
        return {
            "sample_size": sample_size,
            "success_rate": _round(success_count / sample_size, 4),
        }

    return asyncio.run(_run())


def _profile_memory(system: str, sample_size: int = 10) -> dict[str, Any]:
    usage_trace, batch_payload = memory_usage(
        (_run_memory_batch, (system, sample_size), {}),
        interval=0.05,
        include_children=True,
        retval=True,
        max_usage=False,
    )

    trace = [float(point) for point in usage_trace]
    baseline = trace[0] if trace else 0.0
    ending = trace[-1] if trace else 0.0
    peak = max(trace) if trace else 0.0

    return {
        "system": system,
        "batch": batch_payload,
        "baseline_mb": _round(baseline, 4),
        "ending_mb": _round(ending, 4),
        "peak_mb": _round(peak, 4),
        "delta_mb": _round(ending - baseline, 4),
        "trace_samples_mb": [_round(point, 4) for point in trace],
    }


def _build_memory_profile() -> dict[str, Any]:
    c4a = _profile_memory("crawl4ai")
    legacy = _profile_memory("browser-use")
    savings_mb = legacy["peak_mb"] - c4a["peak_mb"]
    savings_pct = (savings_mb / legacy["peak_mb"] * 100.0) if legacy["peak_mb"] else 0.0

    return {
        "crawl4ai": c4a,
        "browser_use": legacy,
        "comparison": {
            "crawl4ai_peak_mb": c4a["peak_mb"],
            "legacy_peak_mb": legacy["peak_mb"],
            "memory_savings_mb": _round(savings_mb, 4),
            "memory_savings_pct": _round(savings_pct, 3),
            "crawl4ai_growth_mb": c4a["delta_mb"],
            "leak_detection_threshold_mb": MEMORY_LEAK_THRESHOLD_MB,
            "leak_detected": c4a["delta_mb"] > MEMORY_LEAK_THRESHOLD_MB,
        },
    }


def _build_error_path_benchmark() -> dict[str, Any]:
    random.seed(BENCHMARK_SEED)
    harness = ABTestHarness()
    candidates = harness.load_test_skus()
    error_samples = [sample for sample in candidates if sample.get("expect_failure") or sample.get("edge_case")]
    if not error_samples:
        raise AssertionError("No error-path SKUs from T17 harness")

    async def _run() -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for sample in error_samples:
            c4a, c4a_ms = await _extract(harness, "crawl4ai", sample)
            legacy, legacy_ms = await _extract(harness, "browser-use", sample)
            rows.append(
                {
                    "sku": str(sample.get("sku", "")),
                    "config": str(sample.get("config", "unknown")),
                    "crawl4ai_ms": _round(c4a_ms),
                    "legacy_ms": _round(legacy_ms),
                    "crawl4ai_success": bool(c4a.success),
                    "legacy_success": bool(legacy.success),
                    "crawl4ai_errors": list(c4a.errors),
                    "legacy_errors": list(legacy.errors),
                }
            )
        return rows

    rows = asyncio.run(_run())
    c4a_times = [float(row["crawl4ai_ms"]) for row in rows]
    legacy_times = [float(row["legacy_ms"]) for row in rows]

    summary = {
        "sample_size": len(rows),
        "crawl4ai_avg_ms": _round(statistics.fmean(c4a_times)),
        "legacy_avg_ms": _round(statistics.fmean(legacy_times)),
        "speedup_factor": _round(statistics.fmean(legacy_times) / statistics.fmean(c4a_times)),
        "crawl4ai_success_rate": _round(sum(1 for row in rows if row["crawl4ai_success"]) / len(rows), 4),
        "legacy_success_rate": _round(sum(1 for row in rows if row["legacy_success"]) / len(rows), 4),
    }
    return {"summary": summary, "timings": rows}


def _recommended_concurrency(levels: dict[str, Any], system_key: str) -> int:
    recommendation = 1
    for level in sorted(int(key) for key in levels):
        metrics = levels[str(level)][system_key]
        if metrics["success_rate"] >= 0.75:
            recommendation = level
    return recommendation


def _finalize_report() -> str:
    if not REPORT_STATE["per_sku_timing"]:
        REPORT_STATE["per_sku_timing"] = _build_per_sku_timing()
    if not REPORT_STATE["concurrency"]["levels"]:
        for level in CONCURRENCY_LEVELS:
            REPORT_STATE["concurrency"]["levels"][str(level)] = _measure_concurrency_level(level)
    if not REPORT_STATE["memory_profile"]:
        REPORT_STATE["memory_profile"] = _build_memory_profile()
    if not REPORT_STATE["error_path"]:
        REPORT_STATE["error_path"] = _build_error_path_benchmark()

    levels = REPORT_STATE["concurrency"]["levels"]
    per_sku = REPORT_STATE["per_sku_timing"]["summary"]
    memory_cmp = REPORT_STATE["memory_profile"]["comparison"]
    error_summary = REPORT_STATE["error_path"]["summary"]

    report: dict[str, Any] = {
        "task": "T18",
        "timestamp_utc": datetime.now(tz=timezone.utc).isoformat(),
        "environment": {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "processor": platform.processor(),
            "hostname": platform.node(),
            "pid": os.getpid(),
        },
        "data_sources": {
            "t17_harness": "tests/t17_ab_test_harness.py",
            "fixtures": "tests/fixtures/test_skus_ground_truth.json",
            "crawl4ai_docs": [
                "https://docs.crawl4ai.com/advanced/multi-url-crawling/",
                "https://docs.crawl4ai.com/api/arun_many/",
            ],
        },
        "per_sku_timing": REPORT_STATE["per_sku_timing"],
        "concurrency": {
            "levels": levels,
            "recommended": {
                "crawl4ai": _recommended_concurrency(levels, "crawl4ai"),
                "browser_use": _recommended_concurrency(levels, "browser_use"),
            },
        },
        "memory_profile": REPORT_STATE["memory_profile"],
        "error_path": REPORT_STATE["error_path"],
        "performance_characteristics": [
            (
                "Per-SKU extraction: "
                f"crawl4ai avg {per_sku['crawl4ai_avg_ms']}ms vs "
                f"legacy {per_sku['legacy_avg_ms']}ms across "
                f"{per_sku['sample_size']} SKU samples."
            ),
            (
                "Concurrency: recommended crawl4ai limit "
                f"{_recommended_concurrency(levels, 'crawl4ai')} vs legacy "
                f"{_recommended_concurrency(levels, 'browser_use')} in this harness."
            ),
            (
                "Memory profile: crawl4ai peak "
                f"{memory_cmp['crawl4ai_peak_mb']}MB, legacy peak "
                f"{memory_cmp['legacy_peak_mb']}MB, savings "
                f"{memory_cmp['memory_savings_pct']}%."
            ),
            (
                "Error-path benchmark: crawl4ai avg "
                f"{error_summary['crawl4ai_avg_ms']}ms vs legacy "
                f"{error_summary['legacy_avg_ms']}ms on "
                f"{error_summary['sample_size']} invalid/edge SKUs."
            ),
        ],
        "acceptance": {
            "minimum_sku_samples_met": per_sku["sample_size"] >= MIN_SKU_SAMPLES,
            "concurrency_levels_tested": sorted(int(level) for level in levels.keys()),
            "memory_profile_completed": bool(REPORT_STATE["memory_profile"]),
            "error_path_benchmarked": error_summary["sample_size"] > 0,
        },
    }

    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return str(EVIDENCE_PATH)


@pytest.mark.benchmark
def test_per_sku_timing_data_collected(benchmark: Any) -> None:
    result = benchmark.pedantic(_build_per_sku_timing, rounds=1, iterations=1, warmup_rounds=0)
    REPORT_STATE["per_sku_timing"] = result
    assert result["summary"]["sample_size"] >= MIN_SKU_SAMPLES
    assert result["summary"]["crawl4ai_avg_ms"] > 0
    assert result["summary"]["legacy_avg_ms"] > 0


@pytest.mark.benchmark
@pytest.mark.parametrize("concurrency_level", CONCURRENCY_LEVELS)
def test_concurrent_extraction_limits(benchmark: Any, concurrency_level: int) -> None:
    result = benchmark.pedantic(
        _measure_concurrency_level,
        args=(concurrency_level,),
        rounds=1,
        iterations=1,
        warmup_rounds=0,
    )
    REPORT_STATE["concurrency"]["levels"][str(concurrency_level)] = result
    assert result["concurrency"] == concurrency_level
    assert result["crawl4ai"]["total_elapsed_ms"] > 0
    assert result["browser_use"]["total_elapsed_ms"] > 0


@pytest.mark.benchmark
def test_memory_profile_during_extraction(benchmark: Any) -> None:
    result = benchmark.pedantic(_build_memory_profile, rounds=1, iterations=1, warmup_rounds=0)
    REPORT_STATE["memory_profile"] = result
    assert result["comparison"]["crawl4ai_peak_mb"] > 0
    assert result["comparison"]["legacy_peak_mb"] > 0
    assert not result["comparison"]["leak_detected"]


@pytest.mark.benchmark
def test_error_path_benchmarking(benchmark: Any) -> None:
    result = benchmark.pedantic(_build_error_path_benchmark, rounds=1, iterations=1, warmup_rounds=0)
    REPORT_STATE["error_path"] = result
    assert result["summary"]["sample_size"] > 0
    assert result["summary"]["crawl4ai_avg_ms"] > 0


@pytest.mark.benchmark
def test_generate_t18_benchmark_report(benchmark: Any) -> None:
    report_path = Path(benchmark.pedantic(_finalize_report, rounds=1, iterations=1, warmup_rounds=0))
    assert report_path.exists()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert payload["per_sku_timing"]["summary"]["sample_size"] >= MIN_SKU_SAMPLES
    assert sorted(payload["concurrency"]["levels"].keys()) == sorted(str(level) for level in CONCURRENCY_LEVELS)
    assert payload["acceptance"]["memory_profile_completed"] is True
