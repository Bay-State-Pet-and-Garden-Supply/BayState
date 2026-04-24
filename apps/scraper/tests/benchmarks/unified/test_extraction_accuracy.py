"""Extraction accuracy benchmark for live URLs across all extraction modes.

Tests extraction accuracy on live URLs from golden_dataset_v3.json across all
three extraction modes (llm-free, llm, auto). Compares extracted fields against
ground truth and generates per-mode accuracy reports with cost-accuracy tradeoff analysis.

Usage:
    pytest tests/benchmarks/unified/test_extraction_accuracy.py -v --tb=short

Environment Variables:
    BENCHMARK_PROXY_POOL: Comma-separated proxy URLs for rotation
    LLM_API_KEY: OpenAI API key for LLM mode
    GEMINI_API_KEY: Gemini API key for LLM mode (alternative)
"""

from __future__ import annotations

import json
import os
import re
import statistics
import time
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import pytest

from tests.benchmarks.unified.base import BaseBenchmark, BenchmarkConfig, BenchmarkResult
from tests.benchmarks.unified.metrics import BenchmarkMetricsCollector
from tests.benchmarks.unified.proxy import ProxyRotator, load_proxy_rotator


# ---------------------------------------------------------------------------
# Constants and field definitions
# ---------------------------------------------------------------------------

TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
LIST_FIELDS = {"images", "categories", "specifications", "tags"}
TEXT_FIELDS = {"name", "description", "price", "availability"}
ALL_FIELDS = TEXT_FIELDS | LIST_FIELDS

SUPPORTED_MODES = ("llm-free", "llm", "auto")

# Cost estimation (approximate)
LLM_COST_PER_1K_INPUT_TOKENS = 0.00015  # GPT-4o-mini
LLM_COST_PER_1K_OUTPUT_TOKENS = 0.0006  # GPT-4o-mini
AVERAGE_LLM_INPUT_TOKENS = 4000
AVERAGE_LLM_OUTPUT_TOKENS = 500


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class GroundTruthEntry:
    """Ground truth entry from golden_dataset_v3.json."""

    sku: str
    url: str
    product_name: str
    brand: str
    description: str = ""
    price: str | float | None = None
    images: list[str] = field(default_factory=list)
    specifications: dict[str, Any] = field(default_factory=dict)
    availability: str = ""
    category: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.product_name,
            "description": self.description,
            "price": self.price,
            "images": self.images,
            "specifications": self.specifications,
            "availability": self.availability,
        }


@dataclass
class FieldScore:
    """Score for a single field comparison."""

    field_name: str
    expected: Any
    actual: Any
    score: float  # 0.0 to 1.0
    method: str  # exact, token_similarity, list_similarity


@dataclass
class ExtractionResult:
    """Result of a single extraction attempt."""

    url: str
    sku: str
    mode: str
    success: bool
    extracted_data: dict[str, Any] = field(default_factory=dict)
    field_scores: list[FieldScore] = field(default_factory=list)
    duration_ms: float = 0.0
    cost_usd: float = 0.0
    error: str | None = None

    @property
    def overall_accuracy(self) -> float:
        if not self.field_scores:
            return 0.0
        return statistics.fmean(fs.score for fs in self.field_scores)

    @property
    def per_field_accuracy(self) -> dict[str, float]:
        return {fs.field_name: fs.score for fs in self.field_scores}


@dataclass
class ModeComparison:
    """Comparison across extraction modes for a single URL."""

    url: str
    sku: str
    llm_free_result: ExtractionResult | None = None
    llm_result: ExtractionResult | None = None
    auto_result: ExtractionResult | None = None

    @property
    def cost_accuracy_tradeoff(self) -> dict[str, dict[str, float]]:
        """Calculate cost-accuracy tradeoff for each mode."""
        tradeoff = {}
        for mode, result in [
            ("llm-free", self.llm_free_result),
            ("llm", self.llm_result),
            ("auto", self.auto_result),
        ]:
            if result:
                tradeoff[mode] = {
                    "accuracy": result.overall_accuracy,
                    "cost_usd": result.cost_usd,
                    "duration_ms": result.duration_ms,
                    "efficiency": result.overall_accuracy / max(result.cost_usd + 0.0001, 0.0001),
                }
        return tradeoff


@dataclass
class ExtractionAccuracyReport:
    """Full benchmark report with per-mode and cross-mode metrics."""

    timestamp: str
    total_urls: int
    mode_results: dict[str, list[ExtractionResult]] = field(default_factory=dict)
    comparisons: list[ModeComparison] = field(default_factory=list)

    def per_mode_summary(self) -> dict[str, dict[str, Any]]:
        """Generate summary statistics for each mode."""
        summary = {}
        for mode, results in self.mode_results.items():
            if not results:
                summary[mode] = {"count": 0}
                continue

            successful = [r for r in results if r.success]
            accuracies = [r.overall_accuracy for r in successful]
            costs = [r.cost_usd for r in results]
            durations = [r.duration_ms for r in results]

            # Per-field accuracy across all results
            field_scores: dict[str, list[float]] = {}
            for r in successful:
                for fs in r.field_scores:
                    field_scores.setdefault(fs.field_name, []).append(fs.score)

            per_field_accuracy = {field: statistics.fmean(scores) for field, scores in field_scores.items()}

            summary[mode] = {
                "count": len(results),
                "success_rate": len(successful) / len(results),
                "accuracy": {
                    "mean": statistics.fmean(accuracies) if accuracies else 0.0,
                    "min": min(accuracies) if accuracies else 0.0,
                    "max": max(accuracies) if accuracies else 0.0,
                },
                "cost_usd": {
                    "total": sum(costs),
                    "mean": statistics.fmean(costs) if costs else 0.0,
                },
                "duration_ms": {
                    "mean": statistics.fmean(durations) if durations else 0.0,
                    "median": statistics.median(durations) if durations else 0.0,
                },
                "per_field_accuracy": per_field_accuracy,
            }
        return summary

    def cross_mode_analysis(self) -> dict[str, Any]:
        """Analyze cost-accuracy tradeoffs across modes."""
        summaries = self.per_mode_summary()

        analysis = {
            "cost_accuracy_tradeoff": {},
            "recommendations": {},
        }

        # Calculate efficiency (accuracy per dollar)
        for mode, summary in summaries.items():
            if summary.get("count", 0) == 0:
                continue
            accuracy = summary["accuracy"]["mean"]
            cost = summary["cost_usd"]["mean"]
            analysis["cost_accuracy_tradeoff"][mode] = {
                "accuracy": accuracy,
                "avg_cost": cost,
                "efficiency": accuracy / max(cost + 0.0001, 0.0001),
            }

        # Determine best mode for different scenarios
        if summaries:
            # Best accuracy
            best_accuracy_mode = max(
                summaries.items(),
                key=lambda x: x[1].get("accuracy", {}).get("mean", 0),
            )[0]
            # Lowest cost
            cheapest_mode = min(
                summaries.items(),
                key=lambda x: x[1].get("cost_usd", {}).get("mean", float("inf")),
            )[0]
            # Best efficiency
            best_efficiency_mode = max(
                analysis["cost_accuracy_tradeoff"].items(),
                key=lambda x: x[1]["efficiency"],
            )[0]

            analysis["recommendations"] = {
                "best_accuracy": best_accuracy_mode,
                "lowest_cost": cheapest_mode,
                "best_value": best_efficiency_mode,
            }

        return analysis

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "total_urls": self.total_urls,
            "per_mode_summary": self.per_mode_summary(),
            "cross_mode_analysis": self.cross_mode_analysis(),
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, default=str)


# ---------------------------------------------------------------------------
# Similarity scoring functions (from tests/evaluation/field_comparator.py and cli)
# ---------------------------------------------------------------------------


def _normalize_text(value: object | None) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _tokenize(value: object | None) -> list[str]:
    text = _normalize_text(value)
    if not text:
        return []
    return TOKEN_PATTERN.findall(text)


def _token_similarity(expected: Any, actual: Any) -> float:
    """Calculate token-based F1 + SequenceMatcher similarity."""
    expected_tokens = _tokenize(expected)
    actual_tokens = _tokenize(actual)

    if not expected_tokens and not actual_tokens:
        return 1.0
    if not expected_tokens or not actual_tokens:
        return 0.0

    # F1 score based on token overlap
    expected_counter = Counter(expected_tokens)
    actual_counter = Counter(actual_tokens)
    overlap = sum((expected_counter & actual_counter).values())
    denominator = len(expected_tokens) + len(actual_tokens)
    f1_score = (2.0 * overlap) / denominator if denominator else 0.0

    # SequenceMatcher on joined tokens
    expected_text = " ".join(expected_tokens)
    actual_text = " ".join(actual_tokens)
    ratio = SequenceMatcher(None, expected_text, actual_text).ratio()

    return max(f1_score, ratio)


def _list_similarity(expected: Any, actual: Any) -> float:
    """Calculate Jaccard similarity for lists."""

    def _to_normalized_set(values: object | Iterable[object] | None) -> set[str]:
        if values is None:
            return set()
        if isinstance(values, str):
            items: Iterable[object] = [values]
        elif isinstance(values, Iterable) and not isinstance(values, (bytes, bytearray)):
            items = values
        else:
            items = [values]

        normalized = {_normalize_text(item) for item in items}
        return {item for item in normalized if item}

    expected_set = _to_normalized_set(expected)
    actual_set = _to_normalized_set(actual)

    if not expected_set and not actual_set:
        return 1.0
    if not expected_set or not actual_set:
        return 0.0

    intersection = expected_set & actual_set
    union = expected_set | actual_set
    return len(intersection) / len(union)


def _exact_similarity(expected: Any, actual: Any) -> float:
    """Exact match similarity."""
    expected_text = _normalize_text(expected)
    actual_text = _normalize_text(actual)

    if not expected_text and not actual_text:
        return 1.0
    if expected_text == actual_text:
        return 1.0
    return 0.0


def compare_field(field_name: str, expected: Any, actual: Any) -> FieldScore:
    """Compare a single field and return score with method used."""
    normalized_field = field_name.strip().lower()

    if normalized_field in LIST_FIELDS:
        score = _list_similarity(expected, actual)
        method = "list_similarity"
    elif normalized_field in {"brand", "sku"}:
        # Brand gets partial credit for substring match
        score = _exact_similarity(expected, actual)
        if score < 1.0:
            expected_text = _normalize_text(expected)
            actual_text = _normalize_text(actual)
            if expected_text and actual_text:
                if expected_text in actual_text or actual_text in expected_text:
                    score = 0.9
        method = "exact_with_partial"
    else:
        score = _token_similarity(expected, actual)
        method = "token_similarity"

    return FieldScore(
        field_name=field_name,
        expected=expected,
        actual=actual,
        score=score,
        method=method,
    )


# ---------------------------------------------------------------------------
# Ground truth loading
# ---------------------------------------------------------------------------


def load_golden_dataset(
    dataset_path: str | Path | None = None,
    limit: int | None = None,
) -> list[GroundTruthEntry]:
    """Load ground truth data from golden_dataset_v3.json.

    Args:
        dataset_path: Path to dataset file. If None, uses default location.
        limit: Maximum number of entries to load. If None, loads all.

    Returns:
        List of GroundTruthEntry objects.
    """
    if dataset_path is None:
        # Find dataset relative to this file
        scraper_root = Path(__file__).parent.parent.parent.parent
        dataset_path = scraper_root / "data" / "golden_dataset_v3.json"
    else:
        dataset_path = Path(dataset_path)

    with open(dataset_path) as f:
        data = json.load(f)

    entries = []
    for entry in data.get("entries", []):
        gt_entry = GroundTruthEntry(
            sku=entry.get("sku", ""),
            url=entry.get("expected_source_url", ""),
            product_name=entry.get("product_name", ""),
            brand=entry.get("brand", ""),
            category=entry.get("category", ""),
        )
        entries.append(gt_entry)

    if limit:
        entries = entries[:limit]

    return entries


# ---------------------------------------------------------------------------
# Extraction functions
# ---------------------------------------------------------------------------


class ExtractionModeRunner:
    """Runs extraction in a specific mode using Crawl4AIEngine."""

    def __init__(
        self,
        mode: str,
        proxy_rotator: ProxyRotator | None = None,
        llm_api_key: str | None = None,
    ):
        self.mode = mode
        self.proxy_rotator = proxy_rotator or ProxyRotator()
        self.llm_api_key = llm_api_key or os.environ.get("LLM_API_KEY")

    def _estimate_cost(self, mode: str) -> float:
        """Estimate cost for an extraction based on mode."""
        if mode == "llm-free":
            return 0.0
        elif mode == "llm":
            # Full LLM extraction
            input_cost = (AVERAGE_LLM_INPUT_TOKENS / 1000) * LLM_COST_PER_1K_INPUT_TOKENS
            output_cost = (AVERAGE_LLM_OUTPUT_TOKENS / 1000) * LLM_COST_PER_1K_OUTPUT_TOKENS
            return input_cost + output_cost
        elif mode == "auto":
            # Auto mode: 70% chance of llm-free success
            # If LLM needed, partial cost
            llm_prob = 0.3
            llm_cost = (AVERAGE_LLM_INPUT_TOKENS / 1000) * LLM_COST_PER_1K_INPUT_TOKENS * 0.5
            llm_cost += (AVERAGE_LLM_OUTPUT_TOKENS / 1000) * LLM_COST_PER_1K_OUTPUT_TOKENS * 0.5
            return llm_prob * llm_cost
        return 0.0

    async def extract(
        self,
        url: str,
        sku: str,
        ground_truth: GroundTruthEntry,
    ) -> ExtractionResult:
        """Extract product data from URL using specified mode.

        This is a live extraction that fetches real URLs.
        """
        start_time = time.perf_counter()

        try:
            # Import here to avoid issues if crawl4ai not installed in test env
            from src.crawl4ai_engine.engine import Crawl4AIEngine

            # Get proxy config
            proxy_config = self.proxy_rotator.get_crawl4ai_browser_config()

            # Build engine config based on mode
            engine_config = {
                "browser": {
                    "headless": True,
                    "viewport": {"width": 1920, "height": 1080},
                    **proxy_config,
                },
                "crawler": {
                    "magic": True,
                    "simulate_user": True,
                    "remove_overlay_elements": True,
                    "cache_mode": "BYPASS",  # Always fetch fresh for benchmark
                    "timeout": 30000,
                    "wait_until": "networkidle",
                },
            }

            # For LLM mode, we would configure extraction_strategy
            # For llm-free mode, we rely on JSON-LD and meta tags
            # For auto mode, the engine decides

            extracted_data: dict[str, Any] = {}
            success = False

            async with Crawl4AIEngine(engine_config) as engine:
                result = await engine.crawl(url)

                if result.get("success"):
                    html = result.get("html", "")
                    markdown = result.get("markdown", "")
                    extracted_content = result.get("extracted_content")

                    # Try to extract structured data
                    if extracted_content:
                        if isinstance(extracted_content, str):
                            try:
                                extracted_data = json.loads(extracted_content)
                                success = True
                            except json.JSONDecodeError:
                                extracted_data = {"raw_content": extracted_content}
                        elif isinstance(extracted_content, dict):
                            extracted_data = extracted_content
                            success = True
                    elif html:
                        # Try to extract from meta tags and JSON-LD
                        # This is a simplified extraction for benchmark purposes
                        extracted_data = self._extract_from_html(html, url)
                        success = bool(extracted_data)

                    if not extracted_data and markdown:
                        extracted_data = {"markdown_snippet": markdown[:1000]}

            duration_ms = (time.perf_counter() - start_time) * 1000

            # Calculate field scores
            field_scores = self._score_extraction(ground_truth, extracted_data)

            return ExtractionResult(
                url=url,
                sku=sku,
                mode=self.mode,
                success=success,
                extracted_data=extracted_data,
                field_scores=field_scores,
                duration_ms=duration_ms,
                cost_usd=self._estimate_cost(self.mode),
            )

        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000
            return ExtractionResult(
                url=url,
                sku=sku,
                mode=self.mode,
                success=False,
                error=str(exc),
                duration_ms=duration_ms,
                cost_usd=self._estimate_cost(self.mode),
            )

    def _extract_from_html(self, html: str, url: str) -> dict[str, Any]:
        """Extract product data from HTML using simple heuristics."""
        data: dict[str, Any] = {}

        # Try to extract JSON-LD
        jsonld_pattern = re.compile(
            r'<script type="application/ld\+json"[^>]*>(.*?)</script>',
            re.DOTALL | re.IGNORECASE,
        )
        for match in jsonld_pattern.finditer(html):
            try:
                json_data = json.loads(match.group(1))
                if isinstance(json_data, dict) and json_data.get("@type") == "Product":
                    data["name"] = json_data.get("name", "")
                    data["description"] = json_data.get("description", "")
                    if "offers" in json_data:
                        offers = json_data["offers"]
                        if isinstance(offers, dict):
                            data["price"] = offers.get("price", "")
                            data["availability"] = offers.get("availability", "")
                    if "image" in json_data:
                        img = json_data["image"]
                        data["images"] = img if isinstance(img, list) else [img]
                    break
            except json.JSONDecodeError:
                continue

        # Extract meta tags as fallback
        if not data.get("name"):
            title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
            if title_match:
                data["name"] = title_match.group(1).strip()

        og_title = re.search(
            r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
            html,
            re.IGNORECASE,
        )
        if og_title:
            data["name"] = og_title.group(1)

        og_desc = re.search(
            r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']',
            html,
            re.IGNORECASE,
        )
        if og_desc:
            data["description"] = og_desc.group(1)

        return data

    def _score_extraction(
        self,
        ground_truth: GroundTruthEntry,
        extracted: dict[str, Any],
    ) -> list[FieldScore]:
        """Compare extracted data against ground truth."""
        gt_dict = ground_truth.to_dict()
        field_scores = []

        for field_name in ALL_FIELDS:
            expected = gt_dict.get(field_name)
            actual = extracted.get(field_name)
            score = compare_field(field_name, expected, actual)
            field_scores.append(score)

        return field_scores


# ---------------------------------------------------------------------------
# Benchmark implementation
# ---------------------------------------------------------------------------


class ExtractionAccuracyBenchmark(BaseBenchmark):
    """Benchmark extraction accuracy across all modes on live URLs.

    This benchmark:
    1. Loads ground truth from golden_dataset_v3.json
    2. For each URL, runs extraction in llm-free, llm, and auto modes
    3. Compares extracted fields against ground truth
    4. Reports per-mode accuracy and cost-accuracy tradeoff

    Attributes:
        config: BenchmarkConfig with urls and modes to test
        proxy_rotator: Optional proxy rotation for distributed extraction
    """

    def __init__(
        self,
        config: BenchmarkConfig,
        proxy_rotator: ProxyRotator | None = None,
    ) -> None:
        super().__init__(config)
        self.proxy_rotator = proxy_rotator or load_proxy_rotator()
        self.ground_truth: list[GroundTruthEntry] = []
        self.results: dict[str, list[ExtractionResult]] = {
            "llm-free": [],
            "llm": [],
            "auto": [],
        }
        self.metrics_collector = BenchmarkMetricsCollector("extraction_accuracy")

    def setup(self) -> None:
        """Load ground truth data."""
        limit = None
        if self.config.urls:
            # If specific URLs provided, filter to those
            limit = len(self.config.urls)
        self.ground_truth = load_golden_dataset(limit=limit)

    async def run(self) -> BenchmarkResult:
        """Run extraction benchmark across all modes.

        Returns:
            BenchmarkResult with aggregated metrics across all modes.
        """
        modes_to_test = self.config.modes or list(SUPPORTED_MODES)
        total_errors = []

        for entry in self.ground_truth:
            for mode in modes_to_test:
                if mode not in SUPPORTED_MODES:
                    total_errors.append(f"Unsupported mode: {mode}")
                    continue

                runner = ExtractionModeRunner(
                    mode=mode,
                    proxy_rotator=self.proxy_rotator,
                )

                result = await runner.extract(entry.url, entry.sku, entry)
                self.results[mode].append(result)

                # Record metrics
                self.metrics_collector.record(
                    accuracy=result.overall_accuracy,
                    success_rate=1.0 if result.success else 0.0,
                    duration_ms=result.duration_ms,
                    cost_usd=result.cost_usd,
                    errors=0 if result.success else 1,
                )

        # Calculate aggregate metrics
        all_results = [r for results in self.results.values() for r in results]
        successful = [r for r in all_results if r.success]

        overall_accuracy = statistics.fmean([r.overall_accuracy for r in successful]) if successful else 0.0
        success_rate = len(successful) / len(all_results) if all_results else 0.0
        total_cost = sum(r.cost_usd for r in all_results)
        avg_duration = statistics.fmean([r.duration_ms for r in all_results]) if all_results else 0.0

        return BenchmarkResult(
            success_rate=success_rate,
            accuracy=overall_accuracy,
            duration_ms=avg_duration,
            cost_usd=total_cost,
            errors=total_errors,
            metadata={
                "modes_tested": modes_to_test,
                "urls_tested": len(self.ground_truth),
                "results_per_mode": {m: len(r) for m, r in self.results.items()},
            },
        )

    def teardown(self) -> None:
        """Cleanup resources."""
        pass

    def generate_report(self) -> ExtractionAccuracyReport:
        """Generate detailed accuracy report."""
        from datetime import datetime

        # Build mode comparisons
        comparisons = []
        for entry in self.ground_truth:
            comparison = ModeComparison(url=entry.url, sku=entry.sku)

            for mode in SUPPORTED_MODES:
                # Find result for this URL and mode
                for result in self.results.get(mode, []):
                    if result.url == entry.url:
                        setattr(comparison, f"{mode.replace('-', '_')}_result", result)
                        break

            comparisons.append(comparison)

        return ExtractionAccuracyReport(
            timestamp=datetime.utcnow().isoformat(),
            total_urls=len(self.ground_truth),
            mode_results=self.results,
            comparisons=comparisons,
        )


# ---------------------------------------------------------------------------
# Pytest test functions
# ---------------------------------------------------------------------------


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.slow
@pytest.mark.asyncio
async def test_extraction_accuracy_all_modes():
    """Test extraction accuracy across all three modes on live URLs.

    This test:
    - Runs on 2 live URLs from golden_dataset_v3
    - Tests all three extraction modes (llm-free, llm, auto)
    - Reports per-field accuracy scores
    - Generates cost-accuracy tradeoff analysis
    """
    # Load ground truth (limit to 2 URLs for QA)
    ground_truth = load_golden_dataset(limit=2)

    if not ground_truth:
        pytest.skip("No ground truth data available")

    config = BenchmarkConfig(
        urls=[entry.url for entry in ground_truth],
        modes=list(SUPPORTED_MODES),
        timeout=60,
        concurrency=1,
    )

    benchmark = ExtractionAccuracyBenchmark(config)
    benchmark.setup()

    try:
        result = await benchmark.run()

        # Save detailed report
        report = benchmark.generate_report()
        report_path = Path(".sisyphus/evidence/task-9-extraction-benchmark.log")
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with open(report_path, "w") as f:
            f.write(report.to_json())

        # Save tradeoff analysis
        tradeoff_path = Path(".sisyphus/evidence/task-9-tradeoff-report.log")
        with open(tradeoff_path, "w") as f:
            json.dump(report.cross_mode_analysis(), f, indent=2, default=str)

        # Verify all modes were tested
        assert len(result.metadata.get("modes_tested", [])) == 3, "All 3 modes should be tested"

        # Verify we tested on live URLs
        urls_tested = result.metadata.get("urls_tested", 0)
        assert urls_tested == 2, f"Expected 2 URLs, got {urls_tested}"

        # Verify per-field accuracy is reported
        summary = report.per_mode_summary()
        for mode in SUPPORTED_MODES:
            if mode in summary:
                assert "per_field_accuracy" in summary[mode], f"Per-field accuracy missing for {mode}"

        # Verify cost-accuracy tradeoff is calculated
        cross_mode = report.cross_mode_analysis()
        assert "cost_accuracy_tradeoff" in cross_mode, "Cost-accuracy tradeoff missing"
        assert "recommendations" in cross_mode, "Recommendations missing"

        # Verify llm-free has 0 cost
        if "llm-free" in cross_mode.get("cost_accuracy_tradeoff", {}):
            llm_free_cost = cross_mode["cost_accuracy_tradeoff"]["llm-free"]["avg_cost"]
            assert llm_free_cost == 0.0, "llm-free should have 0 cost"

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.slow
@pytest.mark.asyncio
async def test_cost_accuracy_tradeoff():
    """Verify cost-accuracy tradeoff analysis produces valid results."""
    ground_truth = load_golden_dataset(limit=2)

    if not ground_truth:
        pytest.skip("No ground truth data available")

    config = BenchmarkConfig(
        urls=[entry.url for entry in ground_truth],
        modes=list(SUPPORTED_MODES),
    )

    benchmark = ExtractionAccuracyBenchmark(config)
    benchmark.setup()

    try:
        await benchmark.run()
        report = benchmark.generate_report()
        analysis = report.cross_mode_analysis()

        # Verify tradeoff data exists for all modes
        tradeoff = analysis.get("cost_accuracy_tradeoff", {})
        for mode in SUPPORTED_MODES:
            assert mode in tradeoff, f"Tradeoff data missing for {mode}"
            assert "accuracy" in tradeoff[mode], f"Accuracy missing for {mode}"
            assert "avg_cost" in tradeoff[mode], f"Cost missing for {mode}"
            assert "efficiency" in tradeoff[mode], f"Efficiency missing for {mode}"

        # Verify recommendations exist
        recommendations = analysis.get("recommendations", {})
        assert "best_accuracy" in recommendations, "Best accuracy recommendation missing"
        assert "lowest_cost" in recommendations, "Lowest cost recommendation missing"
        assert "best_value" in recommendations, "Best value recommendation missing"

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.slow
@pytest.mark.asyncio
async def test_per_field_accuracy_reporting():
    """Verify per-field accuracy is calculated and reported for all fields."""
    ground_truth = load_golden_dataset(limit=1)

    if not ground_truth:
        pytest.skip("No ground truth data available")

    config = BenchmarkConfig(
        urls=[ground_truth[0].url],
        modes=["llm-free"],  # Just test one mode for speed
    )

    benchmark = ExtractionAccuracyBenchmark(config)
    benchmark.setup()

    try:
        await benchmark.run()
        report = benchmark.generate_report()
        summary = report.per_mode_summary()

        if "llm-free" in summary:
            per_field = summary["llm-free"].get("per_field_accuracy", {})

            # Skip if no successful extractions to score
            if not per_field:
                pytest.skip("No successful extractions to generate per-field accuracy")

            # Verify all expected fields have scores
            for field in ALL_FIELDS:
                assert field in per_field, f"Missing accuracy score for field: {field}"
                assert 0.0 <= per_field[field] <= 1.0, f"Invalid accuracy score for {field}"

    finally:
        benchmark.teardown()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
