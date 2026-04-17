#!/usr/bin/env python3
"""Benchmark AI Search source selection against a golden dataset."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time
from collections import Counter, defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import NormalDist
from tempfile import TemporaryDirectory
from typing import Protocol, TypedDict, cast

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scrapers.ai_search.dataset_validator import DatasetValidator, ValidationResult
from scrapers.ai_search.fixture_search_client import CacheMissError, FixtureSearchClient
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.source_selector import LLMSourceSelector

DEFAULT_CACHE_DIR = ROOT / ".cache" / "ai_search"
REPORTS_DIR = ROOT / "reports"
BASELINE_REPORT_PATH = REPORTS_DIR / "baseline.json"
REPORT_VERSION = "2.0"


@dataclass(frozen=True)
class BenchmarkArgs:
    """Typed CLI arguments."""

    dataset: Path
    output: Path | None
    mode: str
    cache_dir: Path | None
    llm_model: str
    llm_provider: str
    llm_base_url: str | None
    llm_api_key: str | None


class DatasetEntryPayload(TypedDict):
    """Typed dataset entry payload."""

    query: str
    expected_source_url: str
    category: str
    difficulty: str
    rationale: str


class DatasetPayload(TypedDict):
    """Typed dataset payload."""

    version: str
    created_at: str
    provenance: dict[str, object]
    entries: list[DatasetEntryPayload]


class FixtureManifestEntry(TypedDict):
    """Typed companion fixture entry."""

    query: str
    results: list[dict[str, object]]


class FixtureManifestPayload(TypedDict):
    """Typed companion fixture payload."""

    schema_version: int
    entries: list[FixtureManifestEntry]


class BenchmarkResultRow(TypedDict):
    """Per-entry benchmark report row."""

    index: int
    query: str
    expected_source_url: str
    predicted_source_url: str | None
    exact_match: bool
    score: float
    correct_rank: int | None
    reciprocal_rank: float
    precision_at_1: float
    recall_at_1: float
    duration_ms: float
    result_count: int
    mode: str
    selection_method: str
    selection_cost_usd: float
    category: str
    difficulty: str
    rationale: str
    error: str | None


class AccuracyConfidenceInterval(TypedDict):
    """Confidence interval for exact-match accuracy."""

    confidence_level: float
    lower_bound_pct: float
    upper_bound_pct: float
    margin_of_error_pct: float
    sample_size: int
    method: str


class BenchmarkBreakdown(TypedDict):
    """Grouped benchmark metrics for one cohort."""

    sample_size: int
    matched_examples: int
    accuracy_exact_match_pct: float
    mean_reciprocal_rank: float
    precision_at_1: float
    recall_at_1: float
    average_duration_ms: float
    error_count: int


class BenchmarkSummary(TypedDict):
    """Summary metrics for the benchmark run."""

    total_examples: int
    matched_examples: int
    accuracy_exact_match_pct: float
    mean_reciprocal_rank: float
    precision_at_1: float
    recall_at_1: float
    accuracy_confidence_interval_95: AccuracyConfidenceInterval
    total_duration_ms: float
    average_duration_ms: float
    total_selection_cost_usd: float
    selection_breakdown: dict[str, int]
    error_count: int


class ExecutionConfig(TypedDict):
    """Execution config recorded in the report."""

    mode: str
    cache_dir: str
    llm_model: str
    llm_provider: str
    llm_base_url: str | None


class ExecutionMetadata(TypedDict):
    """Execution metadata recorded in the report."""

    started_at: str
    completed_at: str
    duration_ms: float
    config: ExecutionConfig


class BenchmarkMetricComparison(TypedDict):
    """Comparison of one summary metric against a baseline run."""

    baseline: float
    current: float
    delta: float


class BenchmarkBaselineComparison(TypedDict):
    """Summary comparison against a baseline report."""

    baseline_path: str
    compared_at: str
    metrics: dict[str, BenchmarkMetricComparison]


class BenchmarkReport(TypedDict):
    """Top-level benchmark report."""

    report_version: str
    generated_at: str
    dataset_path: str
    mode: str
    cache_dir: str
    dataset_validation: dict[str, object]
    metadata: ExecutionMetadata
    summary: BenchmarkSummary
    category_breakdown: dict[str, BenchmarkBreakdown]
    difficulty_breakdown: dict[str, BenchmarkBreakdown]
    baseline_comparison: BenchmarkBaselineComparison | None
    results: list[BenchmarkResultRow]


class SourceSelector(Protocol):
    """Protocol for LLM-backed source selection."""

    async def select_best_url(
        self,
        results: list[dict[str, object]],
        sku: str,
        product_name: str,
        brand: str | None = None,
        preferred_domains: list[str] | None = None,
    ) -> tuple[str | None, float]: ...


@dataclass(frozen=True)
class BenchmarkExample:
    """One golden-dataset example."""

    index: int
    query: str
    expected_source_url: str
    category: str
    difficulty: str
    rationale: str


@dataclass(frozen=True)
class BenchmarkSelection:
    """Selected URL and selection metadata."""

    url: str | None
    selection_method: str
    selection_cost_usd: float


class MetricsCalculator:
    """Calculate benchmark metrics and grouped breakdowns."""

    _Z_SCORE: float = NormalDist().inv_cdf(0.975)

    def calculate_metrics(self, results: Sequence[BenchmarkResultRow], *, execution_duration_ms: float | None = None) -> BenchmarkSummary:
        """Calculate top-level summary metrics for benchmark results."""
        total_examples = len(results)
        matched_examples = sum(1 for result in results if result["exact_match"])
        total_duration_ms = execution_duration_ms if execution_duration_ms is not None else sum(float(result["duration_ms"]) for result in results)
        average_duration_ms = total_duration_ms / total_examples if total_examples else 0.0
        total_selection_cost_usd = sum(float(result["selection_cost_usd"]) for result in results)
        selection_breakdown = Counter(str(result["selection_method"]) for result in results)
        error_count = sum(1 for result in results if result["error"])

        accuracy_pct = self._calculate_accuracy_pct(results)
        mean_reciprocal_rank = self._calculate_mean_reciprocal_rank(results)
        precision_at_1 = self._calculate_precision_at_1(results)
        recall_at_1 = self._calculate_recall_at_1(results)

        return BenchmarkSummary(
            total_examples=total_examples,
            matched_examples=matched_examples,
            accuracy_exact_match_pct=round(accuracy_pct, 3),
            mean_reciprocal_rank=round(mean_reciprocal_rank, 6),
            precision_at_1=round(precision_at_1, 6),
            recall_at_1=round(recall_at_1, 6),
            accuracy_confidence_interval_95=self.calculate_accuracy_confidence_interval(results),
            total_duration_ms=round(total_duration_ms, 3),
            average_duration_ms=round(average_duration_ms, 3),
            total_selection_cost_usd=round(total_selection_cost_usd, 6),
            selection_breakdown=dict(selection_breakdown),
            error_count=error_count,
        )

    def calculate_breakdown(self, results: Sequence[BenchmarkResultRow], field: str) -> dict[str, BenchmarkBreakdown]:
        """Calculate grouped metrics for category or difficulty fields."""
        grouped: dict[str, list[BenchmarkResultRow]] = defaultdict(list)
        for result in results:
            group_value = str(result.get(field) or "unknown")
            grouped[group_value].append(result)

        return {group_name: self._calculate_breakdown_metrics(group_results) for group_name, group_results in sorted(grouped.items())}

    def calculate_accuracy_confidence_interval(self, results: Sequence[BenchmarkResultRow]) -> AccuracyConfidenceInterval:
        """Calculate a 95% confidence interval for exact-match accuracy."""
        sample_size = len(results)
        if sample_size == 0:
            return AccuracyConfidenceInterval(
                confidence_level=0.95,
                lower_bound_pct=0.0,
                upper_bound_pct=0.0,
                margin_of_error_pct=0.0,
                sample_size=0,
                method="normal_approximation_binary_mean",
            )

        exact_match_values = [1.0 if result["exact_match"] else 0.0 for result in results]
        accuracy = sum(exact_match_values) / sample_size
        margin: float = 0.0
        if sample_size > 1:
            sample_variance: float = sum((value - accuracy) ** 2 for value in exact_match_values) / (sample_size - 1)
            sample_standard_deviation: float = math.sqrt(sample_variance)
            margin = self._Z_SCORE * (sample_standard_deviation / math.sqrt(sample_size))

        lower_bound = max(0.0, (accuracy - margin) * 100.0)
        upper_bound = min(100.0, (accuracy + margin) * 100.0)
        return AccuracyConfidenceInterval(
            confidence_level=0.95,
            lower_bound_pct=round(lower_bound, 3),
            upper_bound_pct=round(upper_bound, 3),
            margin_of_error_pct=round(margin * 100.0, 3),
            sample_size=sample_size,
            method="normal_approximation_binary_mean",
        )

    def _calculate_breakdown_metrics(self, results: Sequence[BenchmarkResultRow]) -> BenchmarkBreakdown:
        sample_size = len(results)
        matched_examples = sum(1 for result in results if result["exact_match"])
        average_duration_ms = sum(float(result["duration_ms"]) for result in results) / sample_size if sample_size else 0.0
        error_count = sum(1 for result in results if result["error"])
        return BenchmarkBreakdown(
            sample_size=sample_size,
            matched_examples=matched_examples,
            accuracy_exact_match_pct=round(self._calculate_accuracy_pct(results), 3),
            mean_reciprocal_rank=round(self._calculate_mean_reciprocal_rank(results), 6),
            precision_at_1=round(self._calculate_precision_at_1(results), 6),
            recall_at_1=round(self._calculate_recall_at_1(results), 6),
            average_duration_ms=round(average_duration_ms, 3),
            error_count=error_count,
        )

    @staticmethod
    def _calculate_accuracy_pct(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        return (sum(1 for result in results if result["exact_match"]) / total_examples) * 100.0

    @staticmethod
    def _calculate_mean_reciprocal_rank(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        return sum(float(result["reciprocal_rank"]) for result in results) / total_examples

    @staticmethod
    def _calculate_precision_at_1(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        true_positives = sum(1 for result in results if float(result["precision_at_1"]) > 0.0)
        false_positives = total_examples - true_positives
        denominator = true_positives + false_positives
        return true_positives / denominator if denominator else 0.0

    @staticmethod
    def _calculate_recall_at_1(results: Sequence[BenchmarkResultRow]) -> float:
        total_examples = len(results)
        if total_examples == 0:
            return 0.0
        true_positives = sum(1 for result in results if float(result["recall_at_1"]) > 0.0)
        false_negatives = total_examples - true_positives
        denominator = true_positives + false_negatives
        return true_positives / denominator if denominator else 0.0


def parse_args(argv: list[str] | None = None) -> BenchmarkArgs:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Benchmark AI Search source selection against a golden dataset")
    _ = parser.add_argument("--dataset", type=Path, required=True, help="Path to the golden dataset JSON file")
    _ = parser.add_argument("--output", type=Path, default=None, help="Optional path to write the JSON report")
    _ = parser.add_argument("--mode", choices=("heuristic", "llm"), default="heuristic", help="Source selection mode to benchmark")
    _ = parser.add_argument("--cache-dir", type=Path, default=None, help="Optional FixtureSearchClient cache directory")
    _ = parser.add_argument("--llm-model", default="gpt-4o-mini", help="LLM model to use for --mode llm")
    _ = parser.add_argument("--llm-provider", default="openai", help="LLM provider to use for --mode llm")
    _ = parser.add_argument("--llm-base-url", default=None, help="Optional LLM base URL override")
    _ = parser.add_argument("--llm-api-key", default=None, help="Optional LLM API key override")

    args = parser.parse_args(argv)
    return BenchmarkArgs(
        dataset=cast(Path, args.dataset),
        output=cast(Path | None, args.output),
        mode=cast(str, args.mode),
        cache_dir=cast(Path | None, args.cache_dir),
        llm_model=cast(str, args.llm_model),
        llm_provider=cast(str, args.llm_provider),
        llm_base_url=cast(str | None, args.llm_base_url),
        llm_api_key=cast(str | None, args.llm_api_key),
    )


class BenchmarkRunner:
    """Run fixture-backed source-selection benchmarks."""

    def __init__(
        self,
        dataset_path: Path,
        *,
        mode: str = "heuristic",
        cache_dir: Path | None = None,
        validator: DatasetValidator | None = None,
        scorer: SearchScorer | None = None,
        search_client: FixtureSearchClient | None = None,
        selector: SourceSelector | None = None,
        metrics_calculator: MetricsCalculator | None = None,
        llm_model: str = "gpt-4o-mini",
        llm_provider: str = "openai",
        llm_base_url: str | None = None,
        llm_api_key: str | None = None,
    ) -> None:
        self.dataset_path: Path = dataset_path
        self.mode: str = mode
        self.cache_dir: Path | None = cache_dir
        self._validator: DatasetValidator = validator or DatasetValidator()
        self._scorer: SearchScorer = scorer or SearchScorer()
        self._search_client: FixtureSearchClient | None = search_client
        self._selector: SourceSelector | None = selector
        self._metrics_calculator: MetricsCalculator = metrics_calculator or MetricsCalculator()
        self._llm_model: str = llm_model
        self._llm_provider: str = llm_provider
        self._llm_base_url: str | None = llm_base_url
        self._llm_api_key: str | None = llm_api_key
        self._temp_cache_dir: TemporaryDirectory[str] | None = None

    def validate_dataset(self) -> ValidationResult:
        """Validate the dataset file using the shared validator."""
        return self._validator.validate_file(self.dataset_path)

    def load_dataset(self) -> tuple[list[BenchmarkExample], ValidationResult]:
        """Load and validate benchmark examples."""
        validation = self.validate_dataset()
        if not validation.valid:
            error_messages = "; ".join(error.message for error in validation.errors) or "Dataset validation failed"
            raise ValueError(error_messages)

        with open(self.dataset_path, encoding="utf-8") as handle:
            payload = cast(DatasetPayload, json.load(handle))

        entries = payload["entries"]
        examples = [
            BenchmarkExample(
                index=index,
                query=entry["query"],
                expected_source_url=entry["expected_source_url"],
                category=entry["category"],
                difficulty=entry["difficulty"],
                rationale=entry["rationale"],
            )
            for index, entry in enumerate(entries)
        ]
        return examples, validation

    async def run(self) -> BenchmarkReport:
        """Execute the benchmark and return a JSON-serializable report."""
        examples, validation = self.load_dataset()
        search_client = self._resolve_search_client()

        started_at = datetime.now(timezone.utc)
        started = time.perf_counter()
        results: list[BenchmarkResultRow] = []

        for example in examples:
            example_started = time.perf_counter()
            search_results: list[dict[str, object]] = []
            error: str | None = None
            selection = BenchmarkSelection(url=None, selection_method="none", selection_cost_usd=0.0)

            try:
                search_results, search_error = await search_client.search(example.query)
                if search_error:
                    error = search_error
                else:
                    selection = await self._select_source(example, search_results)
            except CacheMissError as exc:
                error = str(exc)
            except Exception as exc:  # pragma: no cover - defensive guardrail for CLI runs
                error = str(exc)

            ranked_candidates = self._build_ranked_candidates(example, search_results, selection)
            duration_ms = (time.perf_counter() - example_started) * 1000.0
            exact_match = selection.url == example.expected_source_url
            correct_rank = self._find_rank(example.expected_source_url, ranked_candidates)
            reciprocal_rank = 1.0 / correct_rank if correct_rank else 0.0
            score = self._score_prediction(example, selection.url, search_results)
            precision_at_1 = 1.0 if exact_match else 0.0
            recall_at_1 = 1.0 if correct_rank == 1 else 0.0

            results.append(
                BenchmarkResultRow(
                    index=example.index,
                    query=example.query,
                    expected_source_url=example.expected_source_url,
                    predicted_source_url=selection.url,
                    exact_match=exact_match,
                    score=round(score, 3),
                    correct_rank=correct_rank,
                    reciprocal_rank=round(reciprocal_rank, 6),
                    precision_at_1=round(precision_at_1, 6),
                    recall_at_1=round(recall_at_1, 6),
                    duration_ms=round(duration_ms, 3),
                    result_count=len(search_results),
                    mode=self.mode,
                    selection_method=selection.selection_method,
                    selection_cost_usd=round(selection.selection_cost_usd, 6),
                    category=example.category,
                    difficulty=example.difficulty,
                    rationale=example.rationale,
                    error=error,
                )
            )

        total_duration_ms = (time.perf_counter() - started) * 1000.0
        completed_at = datetime.now(timezone.utc)
        summary = self._metrics_calculator.calculate_metrics(results, execution_duration_ms=total_duration_ms)
        category_breakdown = self._metrics_calculator.calculate_breakdown(results, field="category")
        difficulty_breakdown = self._metrics_calculator.calculate_breakdown(results, field="difficulty")
        metadata = ExecutionMetadata(
            started_at=started_at.isoformat(),
            completed_at=completed_at.isoformat(),
            duration_ms=round(total_duration_ms, 3),
            config=ExecutionConfig(
                mode=self.mode,
                cache_dir=str(self.cache_dir or DEFAULT_CACHE_DIR),
                llm_model=self._llm_model,
                llm_provider=self._llm_provider,
                llm_base_url=self._llm_base_url,
            ),
        )

        return BenchmarkReport(
            report_version=REPORT_VERSION,
            generated_at=completed_at.isoformat(),
            dataset_path=str(self.dataset_path),
            mode=self.mode,
            cache_dir=str(self.cache_dir or DEFAULT_CACHE_DIR),
            dataset_validation=cast(dict[str, object], validation.to_dict()),
            metadata=metadata,
            summary=summary,
            category_breakdown=category_breakdown,
            difficulty_breakdown=difficulty_breakdown,
            baseline_comparison=load_baseline_comparison(summary),
            results=results,
        )

    async def _select_source(self, example: BenchmarkExample, search_results: list[dict[str, object]]) -> BenchmarkSelection:
        """Select the top source for one dataset example."""
        heuristic_url = self._select_with_heuristics(example, search_results)
        if self.mode == "heuristic":
            return BenchmarkSelection(url=heuristic_url, selection_method="heuristic", selection_cost_usd=0.0)

        selector = self._resolve_selector()
        llm_url, llm_cost = await selector.select_best_url(
            results=search_results,
            sku=self._infer_sku(example.query),
            product_name=example.query,
            brand=None,
            preferred_domains=None,
        )
        if llm_url:
            return BenchmarkSelection(url=llm_url, selection_method="llm", selection_cost_usd=float(llm_cost or 0.0))
        return BenchmarkSelection(url=heuristic_url, selection_method="heuristic_fallback", selection_cost_usd=float(llm_cost or 0.0))

    def _select_with_heuristics(self, example: BenchmarkExample, search_results: list[dict[str, object]]) -> str | None:
        """Mirror AISearchScraper heuristic source selection."""
        if not search_results:
            return None

        sku = self._infer_sku(example.query)
        strong_url = self._scorer.pick_strong_candidate_url(
            search_results=search_results,
            sku=sku,
            brand=None,
            product_name=example.query,
            category=example.category,
            prefer_manufacturer=True,
            preferred_domains=None,
        )
        if strong_url:
            return strong_url

        ranked_results = self._scorer.prepare_search_results(
            search_results=search_results,
            sku=sku,
            brand=None,
            product_name=example.query,
            category=example.category,
            prefer_manufacturer=True,
            preferred_domains=None,
        )
        if not ranked_results:
            return None
        return str(ranked_results[0].get("url") or "") or None

    def _build_ranked_candidates(
        self,
        example: BenchmarkExample,
        search_results: list[dict[str, object]],
        selection: BenchmarkSelection,
    ) -> list[dict[str, object]]:
        """Build the evaluated ranking order for metrics like MRR and Recall@1."""
        if not search_results:
            return []

        if self.mode == "heuristic" or selection.selection_method == "heuristic_fallback":
            ranked = self._scorer.prepare_search_results(
                search_results=search_results,
                sku=self._infer_sku(example.query),
                brand=None,
                product_name=example.query,
                category=example.category,
                prefer_manufacturer=True,
                preferred_domains=None,
            )
            return self._move_url_to_front(selection.url, ranked)

        deduped_results = self._dedupe_search_results(search_results)
        return self._move_url_to_front(selection.url, deduped_results)

    def _score_prediction(self, example: BenchmarkExample, predicted_url: str | None, search_results: list[dict[str, object]]) -> float:
        """Score the predicted URL using the shared heuristic scorer."""
        if not predicted_url:
            return 0.0

        for result in search_results:
            if str(result.get("url") or "") != predicted_url:
                continue
            return float(
                self._scorer.score_search_result(
                    result=result,
                    sku=self._infer_sku(example.query),
                    brand=None,
                    product_name=example.query,
                    category=example.category,
                    prefer_manufacturer=True,
                    preferred_domains=None,
                )
            )
        return 0.0

    @staticmethod
    def _find_rank(expected_url: str, ranked_candidates: Sequence[Mapping[str, object]]) -> int | None:
        """Find the 1-based rank of the expected URL in a ranked result list."""
        for index, result in enumerate(ranked_candidates, start=1):
            if str(result.get("url") or "") == expected_url:
                return index
        return None

    @staticmethod
    def _move_url_to_front(url: str | None, results: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
        """Promote the selected URL to rank 1 while preserving remaining order."""
        promoted: list[dict[str, object]] = []
        remaining: list[dict[str, object]] = []
        for result in results:
            copied = dict(result)
            if url and str(result.get("url") or "") == url and not promoted:
                promoted.append(copied)
                continue
            remaining.append(copied)
        return promoted + remaining

    @staticmethod
    def _dedupe_search_results(search_results: Sequence[Mapping[str, object]]) -> list[dict[str, object]]:
        """Deduplicate raw search results by URL while preserving order."""
        deduped: list[dict[str, object]] = []
        seen_urls: set[str] = set()
        for result in search_results:
            url = str(result.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            deduped.append(dict(result))
        return deduped

    def _resolve_search_client(self) -> FixtureSearchClient:
        """Create or reuse the fixture-backed search client."""
        if self._search_client is not None:
            return self._search_client

        if self.cache_dir is not None:
            self._search_client = FixtureSearchClient(cache_dir=self.cache_dir, allow_real_api=False)
            return self._search_client

        companion_path = self.dataset_path.with_suffix(".search_results.json")
        if companion_path.exists():
            self._search_client = self._build_search_client_from_fixture_file(companion_path)
            return self._search_client

        self._search_client = FixtureSearchClient(cache_dir=DEFAULT_CACHE_DIR, allow_real_api=False)
        return self._search_client

    def _build_search_client_from_fixture_file(self, fixture_path: Path) -> FixtureSearchClient:
        """Materialize a temporary cache directory from a fixture manifest."""
        with open(fixture_path, encoding="utf-8") as handle:
            payload = cast(FixtureManifestPayload, json.load(handle))

        entries = payload["entries"]

        self._temp_cache_dir = TemporaryDirectory(prefix="ai_search_benchmark_cache_")
        client = FixtureSearchClient(cache_dir=Path(self._temp_cache_dir.name), allow_real_api=False)
        for entry in entries:
            query = entry["query"].strip()
            results = entry["results"]
            if not query:
                raise ValueError(f"Fixture manifest entry missing query/results: {fixture_path}")
            _ = client.write_cache_entry(query, [dict(result) for result in results])
        return client

    def _resolve_selector(self) -> SourceSelector:
        """Create or reuse the LLM selector."""
        if self._selector is None:
            self._selector = LLMSourceSelector(
                model=self._llm_model,
                provider=self._llm_provider,
                base_url=self._llm_base_url,
                api_key=self._llm_api_key,
            )
        return self._selector

    @staticmethod
    def _infer_sku(query: str) -> str:
        """Best-effort SKU extraction from SKU-first benchmark queries."""
        for token in str(query or "").split():
            normalized = token.strip().strip(",;:()[]{}")
            if any(character.isdigit() for character in normalized) and len(normalized) >= 5:
                return normalized
        return ""


def write_report(report: Mapping[str, object], output_path: Path) -> None:
    """Persist the JSON report to disk."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(dict(report), handle, indent=2)
        _ = handle.write("\n")


def write_markdown_report(markdown: str, output_path: Path) -> None:
    """Persist the Markdown report to disk."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _ = output_path.write_text(markdown.rstrip() + "\n", encoding="utf-8")


def resolve_report_paths(output_path: Path | None = None) -> tuple[Path, Path]:
    """Resolve JSON and Markdown output paths for a benchmark run."""
    if output_path is None:
        output_path = REPORTS_DIR / f"benchmark_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return output_path, output_path.with_suffix(".md")


def load_baseline_comparison(
    summary: BenchmarkSummary,
    baseline_path: Path | None = None,
) -> BenchmarkBaselineComparison | None:
    """Compare the current summary against a saved baseline report when available."""
    baseline_path = baseline_path or BASELINE_REPORT_PATH
    if not baseline_path.exists():
        return None

    try:
        baseline_payload = cast(dict[str, object], json.loads(baseline_path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return None

    baseline_summary = baseline_payload.get("summary")
    if not isinstance(baseline_summary, dict):
        return None
    baseline_summary = cast(dict[str, object], baseline_summary)

    comparisons: dict[str, BenchmarkMetricComparison] = {}
    metric_names = (
        "accuracy_exact_match_pct",
        "mean_reciprocal_rank",
        "precision_at_1",
        "recall_at_1",
    )
    for metric_name in metric_names:
        current_value = _coerce_float(summary.get(metric_name))
        baseline_value = _coerce_float(baseline_summary.get(metric_name))
        comparisons[metric_name] = BenchmarkMetricComparison(
            baseline=round(baseline_value, 6),
            current=round(current_value, 6),
            delta=round(current_value - baseline_value, 6),
        )

    return BenchmarkBaselineComparison(
        baseline_path=str(baseline_path),
        compared_at=datetime.now(timezone.utc).isoformat(),
        metrics=comparisons,
    )


def generate_markdown_report(report: BenchmarkReport) -> str:
    """Render a human-readable Markdown benchmark report."""
    summary = report["summary"]
    confidence_interval = summary["accuracy_confidence_interval_95"]
    metadata = report["metadata"]

    lines = [
        "# AI Search Benchmark Report",
        "",
        "## Execution Metadata",
        "",
        f"- Generated: {report['generated_at']}",
        f"- Dataset: `{report['dataset_path']}`",
        f"- Mode: `{report['mode']}`",
        f"- Duration: {summary['total_duration_ms']:.3f} ms",
        f"- Cache Dir: `{report['cache_dir']}`",
        f"- LLM Config: `{metadata['config']['llm_provider']}/{metadata['config']['llm_model']}`",
        "",
        "## Summary Metrics",
        "",
        "| Metric | Value |",
        "| --- | --- |",
        f"| Total Examples | {summary['total_examples']} |",
        f"| Matched Examples | {summary['matched_examples']} |",
        f"| Accuracy (Exact Match %) | {summary['accuracy_exact_match_pct']:.3f} |",
        f"| Mean Reciprocal Rank | {summary['mean_reciprocal_rank']:.6f} |",
        f"| Precision@1 | {summary['precision_at_1']:.6f} |",
        f"| Recall@1 | {summary['recall_at_1']:.6f} |",
        f"| Accuracy 95% CI | {confidence_interval['lower_bound_pct']:.3f}% - {confidence_interval['upper_bound_pct']:.3f}% |",
        f"| Average Duration (ms) | {summary['average_duration_ms']:.3f} |",
        f"| Error Count | {summary['error_count']} |",
        "",
    ]

    baseline_comparison = report.get("baseline_comparison")
    if baseline_comparison:
        lines.extend(
            [
                "## Baseline Comparison",
                "",
                f"Baseline: `{baseline_comparison['baseline_path']}`",
                "",
                "| Metric | Baseline | Current | Delta |",
                "| --- | --- | --- | --- |",
            ]
        )
        for metric_name, values in baseline_comparison["metrics"].items():
            lines.append(f"| {metric_name} | {values['baseline']:.6f} | {values['current']:.6f} | {values['delta']:+.6f} |")
        lines.append("")

    lines.extend(_render_breakdown_section("Category Breakdown", report["category_breakdown"]))
    lines.extend(_render_breakdown_section("Difficulty Breakdown", report["difficulty_breakdown"]))
    lines.extend(
        [
            "## Per-Example Results",
            "",
            "| # | Query | Expected | Actual | Score | Rank | Time (ms) | Match |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for result in report["results"]:
        lines.append(
            "| {index} | {query} | {expected} | {actual} | {score:.3f} | {rank} | {duration:.3f} | {match} |".format(
                index=result["index"],
                query=_truncate_markdown(str(result["query"]), 48),
                expected=_truncate_markdown(str(result["expected_source_url"]), 56),
                actual=_truncate_markdown(str(result["predicted_source_url"] or "—"), 56),
                score=float(result["score"]),
                rank=result["correct_rank"] if result["correct_rank"] is not None else "—",
                duration=float(result["duration_ms"]),
                match="✅" if result["exact_match"] else "❌",
            )
        )

    return "\n".join(lines).rstrip() + "\n"


def _render_breakdown_section(title: str, breakdown: Mapping[str, BenchmarkBreakdown]) -> list[str]:
    lines = [
        f"## {title}",
        "",
        "| Group | Samples | Accuracy % | MRR | Precision@1 | Recall@1 | Avg Time (ms) | Errors |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for group_name, metrics in breakdown.items():
        lines.append(
            "| {group} | {samples} | {accuracy:.3f} | {mrr:.6f} | {precision:.6f} | {recall:.6f} | {duration:.3f} | {errors} |".format(
                group=_truncate_markdown(group_name, 32),
                samples=metrics["sample_size"],
                accuracy=float(metrics["accuracy_exact_match_pct"]),
                mrr=float(metrics["mean_reciprocal_rank"]),
                precision=float(metrics["precision_at_1"]),
                recall=float(metrics["recall_at_1"]),
                duration=float(metrics["average_duration_ms"]),
                errors=metrics["error_count"],
            )
        )
    lines.append("")
    return lines


def _truncate_markdown(value: str, limit: int) -> str:
    """Trim Markdown cell content to keep generated tables readable."""
    normalized = " ".join(str(value or "").split()).replace("|", "\\|")
    if len(normalized) <= limit:
        return normalized
    return normalized[: limit - 1].rstrip() + "…"


def _coerce_float(value: object) -> float:
    """Best-effort float coercion for baseline comparisons."""
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return 0.0
    return 0.0


def run_cli(argv: list[str] | None = None) -> int:
    """Run the benchmark CLI."""
    try:
        args = parse_args(argv)
        runner = BenchmarkRunner(
            dataset_path=args.dataset,
            mode=args.mode,
            cache_dir=args.cache_dir,
            llm_model=args.llm_model,
            llm_provider=args.llm_provider,
            llm_base_url=args.llm_base_url,
            llm_api_key=args.llm_api_key,
        )
        report = asyncio.run(runner.run())
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    json_output_path, markdown_output_path = resolve_report_paths(args.output)
    markdown_report = generate_markdown_report(report)

    write_report(report, json_output_path)
    write_markdown_report(markdown_report, markdown_output_path)

    print(markdown_report)
    print(f"JSON report: {json_output_path}")
    print(f"Markdown report: {markdown_output_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    return run_cli(argv)


if __name__ == "__main__":
    raise SystemExit(main())
