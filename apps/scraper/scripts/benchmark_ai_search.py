#!/usr/bin/env python3
"""Benchmark AI Search source selection against a golden dataset."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections.abc import Mapping
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
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
    duration_ms: float
    result_count: int
    mode: str
    selection_method: str
    selection_cost_usd: float
    category: str
    difficulty: str
    rationale: str
    error: str | None


class BenchmarkSummary(TypedDict):
    """Summary metrics for the benchmark run."""

    total_examples: int
    matched_examples: int
    accuracy_exact_match_pct: float
    total_duration_ms: float
    average_duration_ms: float
    total_selection_cost_usd: float
    selection_breakdown: dict[str, int]
    error_count: int


class BenchmarkReport(TypedDict):
    """Top-level benchmark report."""

    report_version: str
    generated_at: str
    dataset_path: str
    mode: str
    cache_dir: str
    dataset_validation: dict[str, object]
    summary: BenchmarkSummary
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

        started = time.perf_counter()
        results: list[BenchmarkResultRow] = []
        selection_breakdown: Counter[str] = Counter()
        total_selection_cost_usd = 0.0

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

            duration_ms = (time.perf_counter() - example_started) * 1000.0
            exact_match = selection.url == example.expected_source_url
            selection_breakdown[selection.selection_method] += 1
            total_selection_cost_usd += selection.selection_cost_usd

            results.append(
                BenchmarkResultRow(
                    index=example.index,
                    query=example.query,
                    expected_source_url=example.expected_source_url,
                    predicted_source_url=selection.url,
                    exact_match=exact_match,
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
        total_examples = len(results)
        matched_examples = sum(1 for result in results if result["exact_match"])
        average_duration_ms = total_duration_ms / total_examples if total_examples else 0.0
        accuracy_pct = (matched_examples / total_examples) * 100.0 if total_examples else 0.0
        error_count = sum(1 for result in results if result["error"])

        return BenchmarkReport(
            report_version="1.0",
            generated_at=datetime.now(timezone.utc).isoformat(),
            dataset_path=str(self.dataset_path),
            mode=self.mode,
            cache_dir=str(self.cache_dir or DEFAULT_CACHE_DIR),
            dataset_validation=cast(dict[str, object], validation.to_dict()),
            summary=BenchmarkSummary(
                total_examples=total_examples,
                matched_examples=matched_examples,
                accuracy_exact_match_pct=round(accuracy_pct, 3),
                total_duration_ms=round(total_duration_ms, 3),
                average_duration_ms=round(average_duration_ms, 3),
                total_selection_cost_usd=round(total_selection_cost_usd, 6),
                selection_breakdown=dict(selection_breakdown),
                error_count=error_count,
            ),
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

    if args.output is not None:
        write_report(report, args.output)
    print(json.dumps(report, indent=2))
    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint."""
    return run_cli(argv)


if __name__ == "__main__":
    raise SystemExit(main())
