from __future__ import annotations

import asyncio
import statistics
import time
import tracemalloc
from concurrent.futures import ThreadPoolExecutor
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import TypeAlias

import pytest
from typing_extensions import override

from core.performance_profiler import OperationType, PerformanceProfiler
from core.performance_profiler import OperationStats
from scrapers.ai_discovery import AIDiscoveryScraper

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | Mapping[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]


def _patch_metrics_recording(monkeypatch: pytest.MonkeyPatch) -> None:
    def _record_ai_extraction_stub(
        *,
        scraper_name: str,
        success: bool,
        cost_usd: float,
        duration_seconds: float,
        anti_bot_detected: bool = False,
    ) -> None:
        _ = (scraper_name, success, cost_usd, duration_seconds, anti_bot_detected)

    monkeypatch.setattr("scrapers.ai_discovery.record_ai_extraction", _record_ai_extraction_stub)


@pytest.fixture
def profiler() -> PerformanceProfiler:
    instance = PerformanceProfiler(session_id="t18-benchmark")
    instance.start_session()
    return instance


def _build_payload(sku: str, index: int) -> JsonObject:
    return {
        "success": True,
        "product_name": f"Benchmark Product {index}",
        "brand": "Benchmark Brand",
        "description": f"Benchmark description for {sku}",
        "size_metrics": "8 oz",
        "images": [f"https://benchmark.example.com/images/{sku}.jpg"],
        "categories": ["Benchmark Category", "Pets"],
        "confidence": 0.94,
    }


class _StubAIDiscoveryScraper(AIDiscoveryScraper):
    delay_seconds: float

    def __init__(self, delay_seconds: float = 0.003) -> None:
        super().__init__(headless=True, confidence_threshold=0.6)
        self.delay_seconds = delay_seconds

    @override
    async def _search_product(self, query: str) -> tuple[list[JsonObject], str | None]:
        sku = query.split()[0] if query else "SKU"
        return (
            [
                {
                    "url": f"https://benchmark.example.com/products/{sku}",
                    "title": f"Benchmark Product {sku}",
                    "description": "Benchmark PDP",
                    "extra_snippets": [f"SKU {sku}", "In stock"],
                }
            ],
            None,
        )

    @override
    async def _extract_product_data(
        self,
        url: str,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> JsonObject:
        _ = (url, product_name, brand)
        await asyncio.sleep(self.delay_seconds)
        return _build_payload(sku=sku, index=0)


class TestCrawl4AIPerformance:
    _single_durations_ms: list[float] = []
    _concurrent_durations_ms: list[float] = []
    _concurrent_throughput_skus_per_minute: float = 0.0
    _memory_peak_mb: float = 0.0

    @pytest.mark.benchmark
    def test_single_sku_extraction_time(self, profiler: PerformanceProfiler, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_metrics_recording(monkeypatch)
        runs = 25
        scraper = _StubAIDiscoveryScraper(delay_seconds=0.002)
        durations_ms: list[float] = []

        for idx in range(runs):
            sku = f"SKU-S-{idx:03d}"
            start = time.perf_counter()
            result = asyncio.run(
                scraper.scrape_product(
                    sku=sku,
                    product_name=f"Benchmark Product {idx}",
                    brand="Benchmark Brand",
                    category="Benchmark Category",
                )
            )
            duration_ms = (time.perf_counter() - start) * 1000
            profiler.record(
                OperationType.EXTRACTION,
                duration_ms,
                operation_name="single_sku_extraction",
                metadata={"sku": sku, "run": idx},
                success=result.success,
            )
            durations_ms.append(duration_ms)

        self.__class__._single_durations_ms = durations_ms
        assert len(durations_ms) == runs
        assert all(duration > 0 for duration in durations_ms)

    @pytest.mark.benchmark
    def test_concurrent_extraction_throughput(self, profiler: PerformanceProfiler, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_metrics_recording(monkeypatch)
        workers = 5
        total_skus = 50

        def _run_one(index: int) -> tuple[float, bool]:
            scraper = _StubAIDiscoveryScraper(delay_seconds=0.004)
            sku = f"SKU-C-{index:03d}"
            start = time.perf_counter()
            result = asyncio.run(
                scraper.scrape_product(
                    sku=sku,
                    product_name=f"Concurrent Product {index}",
                    brand="Benchmark Brand",
                    category="Benchmark Category",
                )
            )
            return (time.perf_counter() - start) * 1000, result.success

        start_total = time.perf_counter()
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_run_one, range(total_skus)))
        total_elapsed_seconds = time.perf_counter() - start_total

        durations_ms = [entry[0] for entry in results]
        successes = [entry[1] for entry in results]
        throughput = (total_skus / total_elapsed_seconds) * 60 if total_elapsed_seconds > 0 else 0.0

        profiler.record(
            OperationType.TOTAL_WORKFLOW,
            total_elapsed_seconds * 1000,
            operation_name="concurrent_extraction_batch",
            metadata={"workers": workers, "total_skus": total_skus},
            success=all(successes),
        )

        for idx, (duration, success) in enumerate(results):
            profiler.record(
                OperationType.EXTRACTION,
                duration,
                operation_name="concurrent_sku_extraction",
                metadata={"run": idx},
                success=success,
            )

        self.__class__._concurrent_durations_ms = durations_ms
        self.__class__._concurrent_throughput_skus_per_minute = throughput

        assert len(durations_ms) == total_skus
        assert throughput > 0

    @pytest.mark.benchmark
    def test_memory_usage(
        self,
        profiler: PerformanceProfiler,
        monkeypatch: pytest.MonkeyPatch,
        benchmark_report_writer: Callable[[Mapping[str, JsonValue]], Path],
        timing_summary_builder: Callable[[list[float]], dict[str, float]],
        operation_stats_serializer: Callable[[dict[OperationType, OperationStats]], dict[str, JsonObject]],
    ) -> None:
        _patch_metrics_recording(monkeypatch)
        runs = 20
        scraper = _StubAIDiscoveryScraper(delay_seconds=0.003)

        tracemalloc.start()
        start = time.perf_counter()
        for idx in range(runs):
            sku = f"SKU-M-{idx:03d}"
            result = asyncio.run(
                scraper.scrape_product(
                    sku=sku,
                    product_name=f"Memory Product {idx}",
                    brand="Benchmark Brand",
                    category="Benchmark Category",
                )
            )
            profiler.record(
                OperationType.EXTRACTION,
                scraper.delay_seconds * 1000,
                operation_name="memory_profiled_extraction",
                metadata={"sku": sku},
                success=result.success,
            )

        current_bytes, peak_bytes = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        elapsed_ms = (time.perf_counter() - start) * 1000
        peak_mb = peak_bytes / (1024 * 1024)
        current_mb = current_bytes / (1024 * 1024)

        self.__class__._memory_peak_mb = peak_mb

        profiler.record(
            OperationType.TOTAL_SKU,
            elapsed_ms,
            operation_name="memory_usage_batch",
            metadata={"runs": runs},
            success=True,
        )
        profiler.end_session()

        single_summary = timing_summary_builder(self.__class__._single_durations_ms)
        concurrent_summary = timing_summary_builder(self.__class__._concurrent_durations_ms)
        all_durations = self.__class__._single_durations_ms + self.__class__._concurrent_durations_ms
        aggregate_summary = timing_summary_builder(all_durations)
        operation_stats = profiler.get_stats()

        report_payload = {
            "task": "T18 Performance Benchmarking",
            "metrics": {
                "timing": {
                    "single_sku": single_summary,
                    "concurrent": concurrent_summary,
                    "aggregate": aggregate_summary,
                },
                "throughput": {
                    "workers": 5,
                    "skus_per_minute": round(self.__class__._concurrent_throughput_skus_per_minute, 3),
                    "sample_size": len(self.__class__._concurrent_durations_ms),
                },
                "memory": {
                    "peak_mb": round(peak_mb, 3),
                    "current_mb": round(current_mb, 3),
                },
            },
            "operation_stats": operation_stats_serializer(operation_stats),
            "raw": {
                "single_run_count": len(self.__class__._single_durations_ms),
                "concurrent_run_count": len(self.__class__._concurrent_durations_ms),
                "single_mean_ms": round(statistics.mean(self.__class__._single_durations_ms), 3) if self.__class__._single_durations_ms else 0.0,
                "concurrent_mean_ms": round(statistics.mean(self.__class__._concurrent_durations_ms), 3) if self.__class__._concurrent_durations_ms else 0.0,
            },
        }

        output_path = benchmark_report_writer(report_payload)

        assert Path(output_path).exists()
        assert peak_mb > 0
        assert self.__class__._concurrent_throughput_skus_per_minute > 0
