"""Metrics computation for the end-to-end AI Search benchmark."""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import mean
from typing import Any

from scrapers.ai_search.matching import MatchingUtils


@dataclass(frozen=True)
class PipelineStageMetrics:
    """Success/failure tracking for each pipeline stage."""

    search_success: bool = False
    url_selection_success: bool = False
    domain_match: bool = False
    url_match: bool = False
    crawl_success: bool = False
    extraction_success: bool = False
    validation_passed: bool = False
    data_quality_passed: bool = False
    end_to_end_success: bool = False


@dataclass(frozen=True)
class FieldQualityMetrics:
    """Field-level extraction quality scores (0.0-1.0)."""

    brand_score: float = 0.0
    name_score: float = 0.0
    description_score: float = 0.0
    size_metrics_score: float = 0.0
    image_score: float = 0.0
    categories_score: float = 0.0
    overall_score: float = 0.0


@dataclass(frozen=True)
class TimingMetrics:
    """Timing breakdown for a single benchmark entry."""

    search_ms: float = 0.0
    url_selection_ms: float = 0.0
    crawl_ms: float = 0.0
    extraction_ms: float = 0.0
    validation_ms: float = 0.0
    total_ms: float = 0.0


@dataclass(frozen=True)
class ExtractionMetadata:
    """Metadata about how extraction was performed."""

    method: str = "unknown"  # json-ld, meta-tags, llm, fallback, fixture, etc.
    confidence: float = 0.0
    fetch_time_ms: float = 0.0
    parse_time_ms: float = 0.0
    llm_time_ms: float = 0.0
    fallback_triggered: bool = False
    extraction_error: str | None = None
    estimated_cost_usd: float = 0.0


@dataclass(frozen=True)
class EndToEndResultRow:
    """Complete result for a single benchmark entry."""

    sku: str
    brand: str
    product_name: str
    expected_source_url: str
    expected_official_domains: list[str]
    source_type: str
    category: str | None = None
    difficulty: str | None = None

    # Pipeline outcomes
    stages: PipelineStageMetrics = field(default_factory=PipelineStageMetrics)
    failure_stage: str | None = None  # search, url_selection, crawl, extraction, validation, data_quality
    failure_reason: str | None = None

    # What we actually got
    discovered_url: str | None = None
    selected_domain: str | None = None
    extraction_result: dict[str, Any] = field(default_factory=dict)

    # Quality metrics
    field_quality: FieldQualityMetrics = field(default_factory=FieldQualityMetrics)
    extraction_metadata: ExtractionMetadata = field(default_factory=ExtractionMetadata)
    timing: TimingMetrics = field(default_factory=TimingMetrics)
    cost_usd: float = 0.0


# ---------------------------------------------------------------------------
# Field quality scoring
# ---------------------------------------------------------------------------

_matching = MatchingUtils()


def _normalize_text(value: str | None) -> str:
    return " ".join(str(value or "").split()).lower()


def score_brand(extracted: str | None, expected: str) -> float:
    """Score brand match between extracted and expected."""
    extracted_norm = _normalize_text(extracted)
    expected_norm = _normalize_text(expected)
    if not extracted_norm:
        return 0.0
    if extracted_norm == expected_norm:
        return 1.0
    if _matching.is_brand_match(expected, extracted or "", ""):
        return 0.85
    # Token overlap
    extracted_tokens = _matching.tokenize_keywords(extracted)
    expected_tokens = _matching.tokenize_keywords(expected)
    if not expected_tokens:
        return 0.0
    overlap = len(extracted_tokens.intersection(expected_tokens))
    return min(1.0, overlap / len(expected_tokens)) * 0.7


def score_name(extracted: str | None, expected: str) -> float:
    """Score product name match between extracted and expected."""
    extracted_norm = _normalize_text(extracted)
    expected_norm = _normalize_text(expected)
    if not extracted_norm:
        return 0.0
    if extracted_norm == expected_norm:
        return 1.0
    if _matching.is_name_match(expected, extracted or ""):
        return 0.9
    # Token overlap
    extracted_tokens = _matching.tokenize_keywords(extracted)
    expected_tokens = _matching.tokenize_keywords(expected)
    if not expected_tokens:
        return 0.0
    overlap = len(extracted_tokens.intersection(expected_tokens))
    return min(1.0, overlap / len(expected_tokens)) * 0.8


def score_description(extracted: str | None, expected_substrings: list[str]) -> float:
    """Score description by checking for expected substring presence."""
    if not expected_substrings:
        return 1.0  # No expectations means automatic pass
    extracted_norm = _normalize_text(extracted)
    if not extracted_norm:
        return 0.0
    found = sum(1 for sub in expected_substrings if _normalize_text(sub) in extracted_norm)
    return found / len(expected_substrings)


def score_size_metrics(extracted: str | None, expected: str | None) -> float:
    """Score size metrics match."""
    if expected is None:
        return 1.0  # No expectation = automatic pass
    extracted_norm = _normalize_text(extracted)
    expected_norm = _normalize_text(expected)
    if not extracted_norm:
        return 0.0
    if extracted_norm == expected_norm:
        return 1.0
    # Check for substring containment
    if expected_norm in extracted_norm or extracted_norm in expected_norm:
        return 0.9
    # Check for variant token overlap (handles "10 oz" vs "10oz")
    extracted_tokens = _matching.extract_variant_tokens(extracted)
    expected_tokens = _matching.extract_variant_tokens(expected)
    if not expected_tokens:
        # Fallback: simple token overlap for non-variant size strings
        extracted_tokens = _matching.tokenize_keywords(extracted)
        expected_tokens = _matching.tokenize_keywords(expected)
    if not expected_tokens:
        return 0.0
    overlap = len(extracted_tokens.intersection(expected_tokens))
    return min(1.0, overlap / len(expected_tokens)) * 0.85


def score_images(extracted: list[str] | None, image_required: bool) -> float:
    """Score image presence."""
    if not image_required:
        return 1.0
    count = len(extracted) if isinstance(extracted, list) else 0
    if count >= 1:
        return 1.0
    return 0.0


def score_categories(extracted: list[str] | None, expected: list[str]) -> float:
    """Score category overlap (0.0-1.0)."""
    if not expected:
        return 1.0
    extracted_list = extracted if isinstance(extracted, list) else []
    extracted_norms = {_normalize_text(c) for c in extracted_list}
    expected_norms = {_normalize_text(c) for c in expected}
    if not expected_norms:
        return 0.0
    overlap = len(extracted_norms.intersection(expected_norms))
    base_score = min(1.0, overlap / len(expected_norms)) * 0.9
    extra_bonus = min(1.0, len(extracted_norms) / max(len(expected_norms), 1)) * 0.1
    return min(1.0, base_score + extra_bonus)


def compute_field_quality(
    extraction_result: dict[str, Any],
    ground_truth: Any,
) -> FieldQualityMetrics:
    """Compute field-level quality scores from extraction result and ground truth."""
    from benchmarks.ai_search.dataset import ExtractionGroundTruth

    if not isinstance(ground_truth, ExtractionGroundTruth):
        return FieldQualityMetrics()

    brand = extraction_result.get("brand") or extraction_result.get("product_brand")
    name = extraction_result.get("product_name") or extraction_result.get("name")
    description = extraction_result.get("description")
    size_metrics = extraction_result.get("size_metrics")
    images = extraction_result.get("images")
    categories = extraction_result.get("categories")

    brand_score = score_brand(brand, ground_truth.brand)
    name_score = score_name(name, ground_truth.name)
    description_score = score_description(description, ground_truth.description_contains)
    size_metrics_score = score_size_metrics(size_metrics, ground_truth.size_metrics)
    image_score = score_images(images, ground_truth.image_required)
    categories_score = score_categories(categories, ground_truth.categories)

    # Weighted overall: name and brand matter most
    overall = (
        brand_score * 0.20
        + name_score * 0.25
        + description_score * 0.15
        + size_metrics_score * 0.15
        + image_score * 0.15
        + categories_score * 0.10
    )

    return FieldQualityMetrics(
        brand_score=brand_score,
        name_score=name_score,
        description_score=description_score,
        size_metrics_score=size_metrics_score,
        image_score=image_score,
        categories_score=categories_score,
        overall_score=overall,
    )


def determine_failure_stage(
    stages: PipelineStageMetrics,
    field_quality: FieldQualityMetrics,
    validation_reason: str | None,
) -> tuple[str | None, str | None]:
    """Determine which pipeline stage caused the failure and why."""
    if not stages.search_success:
        return "search", "No search results returned"
    if not stages.url_selection_success:
        return "url_selection", "Could not identify an official URL"
    if not stages.domain_match:
        return "url_selection", f"Selected URL domain does not match expected domains"
    if not stages.crawl_success:
        return "crawl", "Page crawl failed"
    if not stages.extraction_success:
        return "extraction", "No structured data extracted"
    if not stages.validation_passed:
        return "validation", validation_reason or "Validation rejected extraction"
    if not stages.data_quality_passed:
        return "data_quality", f"Data quality too low (score={field_quality.overall_score:.2f})"
    return None, None


# ---------------------------------------------------------------------------
# Summary computation
# ---------------------------------------------------------------------------


def summarize(rows: list[EndToEndResultRow]) -> dict[str, object]:
    """Summarize benchmark results into aggregate statistics."""
    total = len(rows)
    if not total:
        return {
            "total_entries": 0,
            "end_to_end_success_rate": 0.0,
            "search_success_rate": 0.0,
            "url_selection_success_rate": 0.0,
            "domain_match_rate": 0.0,
            "crawl_success_rate": 0.0,
            "extraction_success_rate": 0.0,
            "validation_pass_rate": 0.0,
            "data_quality_pass_rate": 0.0,
            "average_brand_score": 0.0,
            "average_name_score": 0.0,
            "average_description_score": 0.0,
            "average_size_metrics_score": 0.0,
            "average_image_score": 0.0,
            "average_categories_score": 0.0,
            "average_overall_quality_score": 0.0,
            "average_total_duration_ms": 0.0,
            "total_cost_usd": 0.0,
            "failure_breakdown": {},
        }

    def _rate(attr: str) -> float:
        return sum(1 for r in rows if getattr(r.stages, attr)) / total

    quality_rows = [r.field_quality for r in rows if r.stages.extraction_success]

    def _avg_score(attr: str) -> float:
        scores = [getattr(q, attr) for q in quality_rows]
        return mean(scores) if scores else 0.0

    # Failure breakdown
    failure_breakdown: dict[str, int] = {}
    for row in rows:
        if row.failure_stage:
            failure_breakdown[row.failure_stage] = failure_breakdown.get(row.failure_stage, 0) + 1

    durations = [r.timing.total_ms for r in rows]

    return {
        "total_entries": total,
        "end_to_end_success_rate": _rate("end_to_end_success"),
        "search_success_rate": _rate("search_success"),
        "url_selection_success_rate": _rate("url_selection_success"),
        "domain_match_rate": _rate("domain_match"),
        "crawl_success_rate": _rate("crawl_success"),
        "extraction_success_rate": _rate("extraction_success"),
        "validation_pass_rate": _rate("validation_passed"),
        "data_quality_pass_rate": _rate("data_quality_passed"),
        "average_brand_score": _avg_score("brand_score"),
        "average_name_score": _avg_score("name_score"),
        "average_description_score": _avg_score("description_score"),
        "average_size_metrics_score": _avg_score("size_metrics_score"),
        "average_image_score": _avg_score("image_score"),
        "average_categories_score": _avg_score("categories_score"),
        "average_overall_quality_score": _avg_score("overall_score"),
        "average_total_duration_ms": mean(durations) if durations else 0.0,
        "p50_total_duration_ms": _percentile(durations, 0.50),
        "p95_total_duration_ms": _percentile(durations, 0.95),
        "total_cost_usd": round(sum(r.cost_usd for r in rows), 6),
        "failure_breakdown": failure_breakdown,
    }


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = int((len(ordered) - 1) * ratio)
    return float(ordered[index])
