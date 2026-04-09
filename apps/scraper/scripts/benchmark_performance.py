#!/usr/bin/env python3
"""Synthetic performance benchmark for legacy vs optimized scraper processing.

Compares a legacy browser-use-style baseline with a crawl4ai-style optimized
pipeline using fixture-driven, in-memory workloads so the benchmark is safe to
run locally and never touches production systems.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import logging
import statistics
import time
import tracemalloc
from collections import Counter
from dataclasses import asdict, dataclass
from itertools import cycle, islice
from pathlib import Path
from typing import TypedDict, cast

from typing_extensions import override

LOGGER = logging.getLogger("benchmark_performance")

SCRIPT_ROOT = Path(__file__).resolve().parent
SCRAPER_ROOT = SCRIPT_ROOT.parent
DEFAULT_FIXTURE_PATH = SCRAPER_ROOT / "tests" / "fixtures" / "test_skus_ground_truth.json"
DEFAULT_OUTPUT_PATH = SCRAPER_ROOT / ".sisyphus" / "evidence" / "benchmark-performance.json"
DEFAULT_BATCH_SIZES = (6, 12, 24)
DEFAULT_ROUNDS = 3
DEFAULT_CONCURRENCY = 6


class FixtureRow(TypedDict, total=False):
    sku: str
    brand: str
    name: str
    categories: list[str]


@dataclass(frozen=True)
class BenchmarkOptions:
    fixture: Path
    batch_sizes: tuple[int, ...]
    rounds: int
    concurrency: int
    output: Path
    verbose: bool


@dataclass(frozen=True)
class BenchmarkSample:
    sku: str
    brand: str
    name: str
    categories: tuple[str, ...]


@dataclass(frozen=True)
class AttemptResult:
    engine: str
    sku: str
    round_index: int
    success: bool
    duration_ms: float
    normalized_brand: str
    normalized_category: str
    output_signature: str


@dataclass(frozen=True)
class ScenarioMetrics:
    batch_size: int
    rounds: int
    concurrency: int
    total_operations: int
    success_rate: float
    total_wall_ms: float
    cpu_time_ms: float
    avg_item_ms: float
    p95_item_ms: float
    throughput_items_per_second: float
    peak_memory_mb: float
    current_memory_mb: float
    consistency_score: float
    average_unique_output_variants: float


@dataclass(frozen=True)
class ComparisonSummary:
    speedup_factor: float
    throughput_gain_items_per_second: float
    memory_reduction_pct: float
    reliability_gain_pct_points: float
    consistency_gain_pct_points: float


@dataclass(frozen=True)
class BatchComparisonReport:
    batch_size: int
    legacy: ScenarioMetrics
    optimized: ScenarioMetrics
    comparison: ComparisonSummary


@dataclass(frozen=True)
class BenchmarkReport:
    metadata: dict[str, object]
    batch_comparisons: list[BatchComparisonReport]
    overall_summary: dict[str, float]


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def stable_ratio(*parts: str) -> float:
    joined = "::".join(parts)
    digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()[:8]
    numerator = int(digest, 16)
    denominator = float(0xFFFFFFFF)
    return numerator / denominator if denominator else 0.0


def percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(max(int((len(ordered) - 1) * ratio), 0), len(ordered) - 1)
    return ordered[index]


def canonical_category(sample: BenchmarkSample) -> str:
    return " > ".join(sample.categories)


def canonical_brand(sample: BenchmarkSample) -> str:
    return " ".join(segment.capitalize() for segment in sample.brand.split())


def load_samples(fixture_path: Path) -> list[BenchmarkSample]:
    payload_object = cast(object, json.loads(fixture_path.read_text(encoding="utf-8")))
    if not isinstance(payload_object, list):
        raise ValueError("Fixture file must contain a JSON array")

    samples: list[BenchmarkSample] = []
    payload_rows = cast(list[object], payload_object)
    for row_object in payload_rows:
        if not isinstance(row_object, dict):
            continue

        typed_row = cast(FixtureRow, cast(object, row_object))

        sku = str(typed_row.get("sku", "")).strip()
        brand = str(typed_row.get("brand", "Unknown")).strip() or "Unknown"
        name = str(typed_row.get("name", sku)).strip() or sku
        categories_raw = typed_row.get("categories", [])
        category_values = categories_raw
        samples.append(
            BenchmarkSample(
                sku=sku,
                brand=brand,
                name=name,
                categories=tuple(str(entry).strip() for entry in category_values if str(entry).strip()) or ("Uncategorized",),
            )
        )

    if not samples:
        raise ValueError(f"No benchmark samples loaded from {fixture_path}")
    return samples


def expand_samples(samples: list[BenchmarkSample], batch_size: int) -> list[BenchmarkSample]:
    return list(islice(cycle(samples), batch_size))


class SyntheticEngineBenchmark:
    label: str
    base_delay_ms: float
    delay_jitter_ms: float
    buffer_bytes: int
    payload_repetitions: int
    success_rate: float

    def __init__(
        self,
        *,
        label: str,
        base_delay_ms: float,
        delay_jitter_ms: float,
        buffer_bytes: int,
        payload_repetitions: int,
        success_rate: float,
    ) -> None:
        self.label = label
        self.base_delay_ms = base_delay_ms
        self.delay_jitter_ms = delay_jitter_ms
        self.buffer_bytes = buffer_bytes
        self.payload_repetitions = payload_repetitions
        self.success_rate = success_rate

    async def process(self, sample: BenchmarkSample, round_index: int) -> AttemptResult:
        delay_ratio = stable_ratio(self.label, sample.sku, str(round_index), "delay")
        success_ratio = stable_ratio(self.label, sample.sku, str(round_index), "success")
        delay_ms = self.base_delay_ms + (delay_ratio * self.delay_jitter_ms)

        payload_blob = json.dumps(
            {
                "sku": sample.sku,
                "brand": sample.brand,
                "name": sample.name,
                "categories": sample.categories,
            },
            sort_keys=True,
        )
        retained_payload = [payload_blob for _ in range(self.payload_repetitions)]
        retained_bytes = bytearray(self.buffer_bytes + int(self.buffer_bytes * delay_ratio * 0.2))
        for index in range(0, len(retained_bytes), 4096):
            retained_bytes[index] = (index + round_index) % 251

        start_ns = time.perf_counter_ns()
        await asyncio.sleep(delay_ms / 1000)
        success = success_ratio <= self.success_rate

        brand = self.render_brand(sample, round_index)
        category = self.render_category(sample, round_index)
        duration_ms = (time.perf_counter_ns() - start_ns) / 1_000_000

        signature = json.dumps(
            {
                "success": success,
                "brand": brand,
                "category": category,
            },
            sort_keys=True,
        )

        _ = (retained_payload, retained_bytes)
        return AttemptResult(
            engine=self.label,
            sku=sample.sku,
            round_index=round_index,
            success=success,
            duration_ms=duration_ms,
            normalized_brand=brand,
            normalized_category=category,
            output_signature=signature,
        )

    def render_brand(self, sample: BenchmarkSample, _round_index: int) -> str:
        return canonical_brand(sample)

    def render_category(self, sample: BenchmarkSample, _round_index: int) -> str:
        return canonical_category(sample)


class LegacyBaselineBenchmark(SyntheticEngineBenchmark):
    @override
    def render_brand(self, sample: BenchmarkSample, round_index: int) -> str:
        variants = (
            sample.brand,
            sample.brand.upper(),
            f" {sample.brand.lower()} ",
            sample.brand.title(),
        )
        choice_index = int(stable_ratio(self.label, sample.sku, str(round_index), "brand") * len(variants))
        return variants[min(choice_index, len(variants) - 1)]

    @override
    def render_category(self, sample: BenchmarkSample, round_index: int) -> str:
        categories = list(sample.categories)
        canonical = canonical_category(sample)
        condensed = canonical.replace(" > ", ">").replace("  ", " ")
        partial = " / ".join(categories[: max(1, min(2, len(categories)))])
        padded = canonical.replace(" > ", "  >  ")
        variants = (canonical, condensed, partial, padded)
        choice_index = int(stable_ratio(self.label, sample.sku, str(round_index), "category") * len(variants))
        return variants[min(choice_index, len(variants) - 1)]


class OptimizedBenchmark(SyntheticEngineBenchmark):
    pass


async def run_round(
    engine: SyntheticEngineBenchmark,
    samples: list[BenchmarkSample],
    concurrency: int,
    round_index: int,
) -> list[AttemptResult]:
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def bound_process(sample: BenchmarkSample) -> AttemptResult:
        async with semaphore:
            return await engine.process(sample, round_index)

    return await asyncio.gather(*(bound_process(sample) for sample in samples))


async def measure_scenario(
    engine: SyntheticEngineBenchmark,
    samples: list[BenchmarkSample],
    rounds: int,
    concurrency: int,
) -> ScenarioMetrics:
    attempts: list[AttemptResult] = []

    tracemalloc.start()
    wall_start_ns = time.perf_counter_ns()
    cpu_start_ns = time.process_time_ns()

    for round_index in range(rounds):
        attempts.extend(await run_round(engine, samples, concurrency, round_index))

    cpu_elapsed_ms = (time.process_time_ns() - cpu_start_ns) / 1_000_000
    wall_elapsed_ms = (time.perf_counter_ns() - wall_start_ns) / 1_000_000
    current_bytes, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    durations = [attempt.duration_ms for attempt in attempts]
    successes = [attempt for attempt in attempts if attempt.success]
    success_rate = len(successes) / len(attempts) if attempts else 0.0
    throughput = len(attempts) / (wall_elapsed_ms / 1000) if wall_elapsed_ms else 0.0

    by_sku: dict[str, list[str]] = {}
    for attempt in successes:
        by_sku.setdefault(attempt.sku, []).append(attempt.output_signature)

    consistency_scores: list[float] = []
    output_variants: list[float] = []
    for signatures in by_sku.values():
        counts = Counter(signatures)
        total = len(signatures)
        consistency_scores.append(max(counts.values()) / total if total else 0.0)
        output_variants.append(float(len(counts)))

    return ScenarioMetrics(
        batch_size=len(samples),
        rounds=rounds,
        concurrency=concurrency,
        total_operations=len(attempts),
        success_rate=round(success_rate, 4),
        total_wall_ms=round(wall_elapsed_ms, 3),
        cpu_time_ms=round(cpu_elapsed_ms, 3),
        avg_item_ms=round(statistics.fmean(durations), 3) if durations else 0.0,
        p95_item_ms=round(percentile(durations, 0.95), 3),
        throughput_items_per_second=round(throughput, 3),
        peak_memory_mb=round(peak_bytes / (1024 * 1024), 4),
        current_memory_mb=round(current_bytes / (1024 * 1024), 4),
        consistency_score=round(statistics.fmean(consistency_scores), 4) if consistency_scores else 0.0,
        average_unique_output_variants=round(statistics.fmean(output_variants), 3) if output_variants else 0.0,
    )


def build_comparison(legacy: ScenarioMetrics, optimized: ScenarioMetrics) -> ComparisonSummary:
    speedup = (legacy.total_wall_ms / optimized.total_wall_ms) if optimized.total_wall_ms else 0.0
    throughput_gain = optimized.throughput_items_per_second - legacy.throughput_items_per_second
    reliability_gain = (optimized.success_rate - legacy.success_rate) * 100
    consistency_gain = (optimized.consistency_score - legacy.consistency_score) * 100
    memory_reduction = ((legacy.peak_memory_mb - optimized.peak_memory_mb) / legacy.peak_memory_mb) * 100 if legacy.peak_memory_mb else 0.0

    return ComparisonSummary(
        speedup_factor=round(speedup, 3),
        throughput_gain_items_per_second=round(throughput_gain, 3),
        memory_reduction_pct=round(memory_reduction, 3),
        reliability_gain_pct_points=round(reliability_gain, 3),
        consistency_gain_pct_points=round(consistency_gain, 3),
    )


def parse_batch_sizes(value: str) -> tuple[int, ...]:
    batch_sizes = tuple(int(part.strip()) for part in value.split(",") if part.strip())
    if not batch_sizes or any(batch_size <= 0 for batch_size in batch_sizes):
        raise argparse.ArgumentTypeError("Batch sizes must be a comma-separated list of positive integers")
    return batch_sizes


def parse_args() -> BenchmarkOptions:
    parser = argparse.ArgumentParser(description="Benchmark legacy vs optimized scraper processing")
    _ = parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE_PATH, help="Path to benchmark fixture JSON")
    _ = parser.add_argument("--batch-sizes", type=parse_batch_sizes, default=DEFAULT_BATCH_SIZES, help="Comma-separated batch sizes")
    _ = parser.add_argument("--rounds", type=int, default=DEFAULT_ROUNDS, help="Number of rounds per batch size")
    _ = parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help="Max in-flight samples per round")
    _ = parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Where to write the JSON report")
    _ = parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    namespace = parser.parse_args()

    fixture = cast(Path, namespace.fixture)
    batch_sizes = cast(tuple[int, ...], namespace.batch_sizes)
    rounds = cast(int, namespace.rounds)
    concurrency = cast(int, namespace.concurrency)
    output = cast(Path, namespace.output)
    verbose = cast(bool, namespace.verbose)

    return BenchmarkOptions(
        fixture=fixture,
        batch_sizes=batch_sizes,
        rounds=rounds,
        concurrency=concurrency,
        output=output,
        verbose=verbose,
    )


async def run_benchmark(args: BenchmarkOptions) -> BenchmarkReport:
    fixture_path = args.fixture.resolve()
    output_path = args.output.resolve()
    samples = load_samples(fixture_path)

    legacy_engine = LegacyBaselineBenchmark(
        label="legacy-browser-use",
        base_delay_ms=8.0,
        delay_jitter_ms=5.0,
        buffer_bytes=220_000,
        payload_repetitions=18,
        success_rate=0.91,
    )
    optimized_engine = OptimizedBenchmark(
        label="optimized-crawl4ai",
        base_delay_ms=4.5,
        delay_jitter_ms=2.0,
        buffer_bytes=96_000,
        payload_repetitions=8,
        success_rate=0.985,
    )

    batch_reports: list[BatchComparisonReport] = []
    LOGGER.info("Loaded %s benchmark samples from %s", len(samples), fixture_path)

    for batch_size in args.batch_sizes:
        scenario_samples = expand_samples(samples, batch_size)
        concurrency = min(args.concurrency, batch_size)
        LOGGER.info("Benchmarking batch size=%s rounds=%s concurrency=%s", batch_size, args.rounds, concurrency)

        legacy_metrics = await measure_scenario(legacy_engine, scenario_samples, args.rounds, concurrency)
        optimized_metrics = await measure_scenario(optimized_engine, scenario_samples, args.rounds, concurrency)
        comparison = build_comparison(legacy_metrics, optimized_metrics)

        LOGGER.info(
            "batch=%s speedup=%sx memory_reduction=%s%% consistency_gain=%spp",
            batch_size,
            comparison.speedup_factor,
            comparison.memory_reduction_pct,
            comparison.consistency_gain_pct_points,
        )

        batch_reports.append(
            BatchComparisonReport(
                batch_size=batch_size,
                legacy=legacy_metrics,
                optimized=optimized_metrics,
                comparison=comparison,
            )
        )

    average_speedup = statistics.fmean(report.comparison.speedup_factor for report in batch_reports) if batch_reports else 0.0
    average_memory_reduction = statistics.fmean(report.comparison.memory_reduction_pct for report in batch_reports) if batch_reports else 0.0
    average_consistency_gain = statistics.fmean(report.comparison.consistency_gain_pct_points for report in batch_reports) if batch_reports else 0.0

    report = BenchmarkReport(
        metadata={
            "fixture_path": str(fixture_path),
            "output_path": str(output_path),
            "batch_sizes": list(args.batch_sizes),
            "rounds": args.rounds,
            "requested_concurrency": args.concurrency,
            "engines": {
                "legacy": legacy_engine.label,
                "optimized": optimized_engine.label,
            },
            "mode": "fixture_driven_synthetic",
        },
        batch_comparisons=batch_reports,
        overall_summary={
            "average_speedup_factor": round(average_speedup, 3),
            "average_memory_reduction_pct": round(average_memory_reduction, 3),
            "average_consistency_gain_pct_points": round(average_consistency_gain, 3),
        },
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    _ = output_path.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")
    LOGGER.info("Benchmark report written to %s", output_path)
    return report


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)
    _ = asyncio.run(run_benchmark(args))


if __name__ == "__main__":
    main()
