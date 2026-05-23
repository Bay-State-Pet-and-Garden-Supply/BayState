"""Pure scoring functions for the URL extraction benchmark.

All functions are pure: no I/O, no network, no scraper imports.
Only uses stdlib (dataclasses, urllib.parse, statistics, typing).
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROTEIN_ONLY_VALUES: set[str] = {
    "poultry", "chicken", "beef", "salmon", "turkey", "fish", "lamb", "duck",
}

DIRTY_HTML_MARKERS: list[str] = [
    "virtual_list", "bottomspacer", "data-qa=", "aria-setsize",
]

FORBIDDEN_IMAGE_DOMAINS: set[str] = {"images.unsplash.com"}

FORBIDDEN_PATH_HINTS: list[str] = [
    "recycle", "transparency-map", "logo", "footer",
]

WEIGHT_ALIASES: dict[str, str] = {
    "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
    "oz": "oz", "ounce": "oz", "ounces": "oz",
    "kg": "kg", "kilogram": "kg", "kilograms": "kg",
    "g": "g", "gram": "g", "grams": "g",
}


# ---------------------------------------------------------------------------
# ExtractionScore
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ExtractionScore:
    """Per-entry scoring result for the extraction benchmark."""

    entry_id: str
    success: bool
    brand_score: float = 0.0
    name_score: float = 0.0
    description_score: float = 0.0
    weight_match: bool = False
    species_match: bool = False
    food_form_match: bool = False
    flavor_score: float = 0.0
    category_sane: bool = True
    category_sane_reason: str | None = None
    approved_image_count: int = 0
    image_count_in_bounds: bool = True
    image_count_reason: str | None = None
    forbidden_domain_hits: list[str] = field(default_factory=list)
    forbidden_path_hint_hits: list[str] = field(default_factory=list)
    dirty_html_hits: list[str] = field(default_factory=list)
    duplicate_ratio: float = 0.0
    hard_fails: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    overall_score: float = 0.0
    duration_ms: float | None = None
    token_usage: dict[str, int] | None = None
    method: str = "unknown"
    image_diagnostics: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _normalize(value: str | None) -> str:
    return " ".join(str(value or "").strip().split()).lower()


def _is_token_match(value: str, token: str) -> bool:
    """Case-insensitive substring match on normalized text."""
    return _normalize(token) in _normalize(value)


# ---------------------------------------------------------------------------
# Scoring functions
# ---------------------------------------------------------------------------


def score_brand(extracted: str | None, expected: str) -> float:
    """Score brand match between extracted and expected."""
    extracted_norm = _normalize(extracted)
    expected_norm = _normalize(expected)
    if not extracted_norm:
        return 0.0
    if extracted_norm == expected_norm:
        return 1.0
    # Substring containment in either direction
    if expected_norm in extracted_norm or extracted_norm in expected_norm:
        return 0.85
    return 0.0


def score_name_contains(extracted: str | None, tokens: list[str]) -> float:
    """Fraction of required name tokens present in extracted product name."""
    if not tokens:
        return 1.0
    extracted_norm = _normalize(extracted)
    if not extracted_norm:
        return 0.0
    found = sum(1 for t in tokens if _is_token_match(extracted_norm, t))
    return found / len(tokens)


def score_description_contains(extracted: str | None, phrases: list[str]) -> float:
    """Fraction of required description phrases present."""
    if not phrases:
        return 1.0
    extracted_norm = _normalize(extracted)
    if not extracted_norm:
        return 0.0
    found = sum(1 for p in phrases if _is_token_match(extracted_norm, p))
    return found / len(phrases)


def score_weight(extracted: str | None, expected: str) -> bool:
    """Check if expected weight is present in extracted weight/size_metrics.

    Handles unit aliases (lb↔pounds↔lbs, etc.).
    """
    extracted_norm = _normalize(extracted)
    expected_norm = _normalize(expected)
    if not extracted_norm or not expected_norm:
        return False

    # Direct containment
    if expected_norm in extracted_norm or extracted_norm in expected_norm:
        return True

    # Try normalizing unit aliases
    def _resolve_aliases(text: str) -> str:
        result = text
        for alias, canonical in WEIGHT_ALIASES.items():
            result = result.replace(alias, canonical)
        return result

    extracted_aliased = _resolve_aliases(extracted_norm)
    expected_aliased = _resolve_aliases(expected_norm)
    if expected_aliased in extracted_aliased or extracted_aliased in expected_aliased:
        return True

    return False


def score_species(extracted: str | None, expected: str) -> bool:
    """Check if extracted species/pet_type matches expected."""
    extracted_norm = _normalize(extracted)
    expected_norm = _normalize(expected)
    if not extracted_norm:
        return False
    return extracted_norm == expected_norm


def score_food_form(extracted: str | None, expected: str) -> bool:
    """Check if extracted food_form matches expected."""
    extracted_norm = _normalize(extracted)
    expected_norm = _normalize(expected)
    if not extracted_norm:
        return False
    return extracted_norm == expected_norm


def score_flavor_contains(extracted: str | None, tokens: list[str]) -> float:
    """Fraction of required flavor tokens present."""
    if not tokens:
        return 1.0
    extracted_norm = _normalize(extracted)
    if not extracted_norm:
        return 0.0
    found = sum(1 for t in tokens if _is_token_match(extracted_norm, t))
    return found / len(tokens)


def check_category_not_protein_only(
    categories: list[str] | None,
    tags: list[str],
) -> tuple[bool, str | None]:
    """Hard fail if any category is a protein value in pet-food context.

    Only triggers when ``"pet-food"`` is in *tags*.
    Returns ``(True, None)`` if clean, ``(False, reason)`` if protein-only.
    """
    if "pet-food" not in tags:
        return True, None
    if not categories:
        return True, None
    for cat in categories:
        cat_clean = cat.strip().lower()
        if cat_clean in PROTEIN_ONLY_VALUES:
            return False, f"Category '{cat}' appears to be a protein/facet, not a valid taxonomy category (pet-food context)"
    return True, None


def check_approved_image_bounds(
    images: list[str] | None,
    min_: int,
    max_: int,
) -> tuple[bool, int, str | None]:
    """Check that image count is within [min_, max_].

    Returns ``(in_bounds, count, reason_or_None)``.
    """
    count = len(images) if isinstance(images, list) else 0
    if count < min_:
        return False, count, f"Too few approved images: {count} < {min_}"
    if count > max_:
        return False, count, f"Too many approved images: {count} > {max_}"
    return True, count, None


def check_forbidden_image_domains(
    images: list[str] | None,
    domains: set[str] | None = None,
) -> tuple[bool, list[str]]:
    """Hard fail if any image URL's hostname matches a forbidden domain.

    Returns ``(passed, matching_urls)``.
    """
    if not images:
        return True, []
    blocked = domains or FORBIDDEN_IMAGE_DOMAINS
    hits: list[str] = []
    for url in images:
        if not isinstance(url, str):
            continue
        try:
            hostname = urlparse(url).hostname or ""
        except Exception:
            hostname = ""
        lower_host = hostname.lower()
        for domain in blocked:
            if lower_host == domain or lower_host.endswith("." + domain):
                hits.append(url)
                break
    return len(hits) == 0, hits


def check_forbidden_image_path_hints(
    images: list[str] | None,
    hints: list[str] | None = None,
) -> tuple[bool, list[str]]:
    """Hard fail if any image URL path contains a forbidden hint.

    Returns ``(clean, matching_urls_with_hints)``.
    """
    if not images:
        return True, []
    hints_list = hints or FORBIDDEN_PATH_HINTS
    hits: list[str] = []
    for url in images:
        if not isinstance(url, str):
            continue
        try:
            path = urlparse(url).path.lower()
        except Exception:
            path = ""
        for hint in hints_list:
            if hint.lower() in path:
                hits.append(url)
                break
    return len(hits) == 0, hits


def check_dirty_html_markers(
    description: str | None,
) -> tuple[bool, list[str]]:
    """Check if description contains dirty HTML/DOM markers.

    Returns ``(clean, matching_markers)``.
    """
    if not description:
        return True, []
    desc_lower = description.lower()
    hits: list[str] = []
    for marker in DIRTY_HTML_MARKERS:
        # data-qa= is a prefix pattern — check for presence
        if marker in desc_lower:
            hits.append(marker)
    return len(hits) == 0, hits


def compute_canonical_duplicate_ratio(images: list[str]) -> float:
    """Compute ratio of image URLs that are query-param duplicates.

    Strips all query params from each URL. Dedupes by the canonical
    (scheme + netloc + path) form. Returns 1 - (unique / total), or
    0.0 if fewer than 2 images.
    """
    if not isinstance(images, list) or len(images) < 2:
        return 0.0

    canonical_set: set[str] = set()
    raw_count = 0
    for url in images:
        if not isinstance(url, str) or not url.strip():
            continue
        try:
            parsed = urlparse(url.strip())
            canonical = f"{parsed.scheme}://{parsed.netloc}{parsed.path}".lower()
        except Exception:
            canonical = url.strip().lower()
        canonical_set.add(canonical)
        raw_count += 1

    if raw_count < 2:
        return 0.0
    return 1.0 - (len(canonical_set) / raw_count)


# ---------------------------------------------------------------------------
# Aggregate scorer
# ---------------------------------------------------------------------------


def score_extraction(
    result: dict[str, Any],
    expected: dict[str, Any],
    tags: list[str],
    entry_id: str = "",
) -> ExtractionScore:
    """Score an extraction result against expected values.

    Args:
        result: Dict from ``ProductPageExtractor.extract()``.
        expected: ``expected`` dict from a dataset entry.
        tags: ``tags`` list from a dataset entry.
        entry_id: Benchmark entry ID for identification.

    Returns:
        Filled ``ExtractionScore``.
    """
    success = bool(result.get("success", False))

    # Extract fields from result
    brand = result.get("brand")
    product_name = result.get("product_name") or result.get("name")
    description = result.get("description")
    images = result.get("images")
    if not isinstance(images, list):
        images = []
    categories = result.get("categories")
    if not isinstance(categories, list):
        categories = []
    weight = result.get("weight") or result.get("size_metrics")
    species = result.get("pet_type") or result.get("species")
    food_form = result.get("food_form")
    flavor = result.get("flavor")
    token_usage = result.get("token_usage")
    duration_ms = result.get("duration_ms") or result.get("telemetry", {}).get("total_ms")
    method = result.get("method", "unknown")
    image_diagnostics = result.get("telemetry", {}).get("image_diagnostics")

    # Token usage normalization
    token_usage_dict: dict[str, int] | None = None
    if isinstance(token_usage, dict):
        token_usage_dict = {str(k): int(v) for k, v in token_usage.items()}
    elif isinstance(token_usage, int):
        token_usage_dict = {"total": token_usage}

    # Duration
    duration: float | None = None
    if duration_ms is not None:
        try:
            duration = float(duration_ms)
        except (ValueError, TypeError):
            duration = None

    # --- Score each field ---

    brand_score_val = score_brand(
        brand, expected.get("brand", ""),
    )

    name_score_val = score_name_contains(
        product_name, expected.get("name_contains", []),
    )

    description_score_val = score_description_contains(
        description, expected.get("description_contains", []),
    )

    weight_match = score_weight(
        weight, expected.get("weight", ""),
    )

    species_match = score_species(
        species, expected.get("species", ""),
    )

    food_form_match = score_food_form(
        food_form, expected.get("food_form", ""),
    )

    flavor_score_val = score_flavor_contains(
        flavor, expected.get("flavor_contains", []),
    )

    # Category sanity
    category_sane, category_reason = check_category_not_protein_only(
        categories, tags,
    )

    # Image bounds
    image_in_bounds, image_count, image_reason = check_approved_image_bounds(
        images,
        expected.get("min_approved_images", 1),
        expected.get("max_approved_images", 12),
    )

    # Forbidden domains
    forbidden_domains = expected.get("forbidden_image_domains", FORBIDDEN_IMAGE_DOMAINS)
    domain_clean, domain_hits = check_forbidden_image_domains(
        images, set(forbidden_domains) if isinstance(forbidden_domains, list) else FORBIDDEN_IMAGE_DOMAINS,
    )

    # Forbidden path hints
    path_hints = expected.get("forbidden_image_path_hints", FORBIDDEN_PATH_HINTS)
    path_clean, path_hits = check_forbidden_image_path_hints(
        images, path_hints if isinstance(path_hints, list) else FORBIDDEN_PATH_HINTS,
    )

    # Dirty HTML
    html_clean, html_hits = check_dirty_html_markers(description)

    # Duplicate ratio
    dup_ratio = compute_canonical_duplicate_ratio(images)

    # --- Build hard fails ---
    hard_fails: list[str] = []

    if not category_sane:
        hard_fails.append(f"category_protein_only: {category_reason}")
    if not domain_clean:
        urls = ", ".join(domain_hits[:3])
        hard_fails.append(f"forbidden_image_domain: {urls}")
    if not path_clean:
        urls = ", ".join(path_hits[:3])
        hard_fails.append(f"forbidden_image_path_hint: {urls}")
    if not html_clean:
        markers = ", ".join(html_hits)
        hard_fails.append(f"dirty_html_markers: {markers}")
    if not image_in_bounds:
        hard_fails.append(f"image_count_out_of_bounds: {image_reason}")

    # --- Build warnings ---
    warnings_list: list[str] = []

    if dup_ratio > 0.25:
        warnings_list.append(f"high_duplicate_ratio: {dup_ratio:.2f}")
    if duration is not None and duration > 30000:
        warnings_list.append(f"high_duration: {duration:.0f}ms")
    if token_usage_dict is None:
        warnings_list.append("token_usage_unavailable")
    if len(images) > 25:
        warnings_list.append(f"high_raw_image_count: {len(images)}")

    # --- Overall score ---
    # Weights
    weights = {
        "success_bonus": 0.10,
        "brand": 0.15,
        "name": 0.20,
        "description": 0.10,
        "weight": 0.10,
        "species": 0.10,
        "food_form": 0.10,
        "flavor": 0.05,
        "category": 0.05,
        "image_bounds": 0.05,
    }

    overall = 0.0
    overall += weights["success_bonus"] if success else 0.0
    overall += weights["brand"] * brand_score_val
    overall += weights["name"] * name_score_val
    overall += weights["description"] * description_score_val
    overall += weights["weight"] * (1.0 if weight_match else 0.0)
    overall += weights["species"] * (1.0 if species_match else 0.0)
    overall += weights["food_form"] * (1.0 if food_form_match else 0.0)
    overall += weights["flavor"] * flavor_score_val
    overall += weights["category"] * (1.0 if category_sane else 0.0)
    overall += weights["image_bounds"] * (1.0 if image_in_bounds else 0.0)

    # Cap if hard fails present
    if hard_fails:
        overall = min(overall, 0.49)

    return ExtractionScore(
        entry_id=entry_id,
        success=success,
        brand_score=brand_score_val,
        name_score=name_score_val,
        description_score=description_score_val,
        weight_match=weight_match,
        species_match=species_match,
        food_form_match=food_form_match,
        flavor_score=flavor_score_val,
        category_sane=category_sane,
        category_sane_reason=category_reason,
        approved_image_count=image_count,
        image_count_in_bounds=image_in_bounds,
        image_count_reason=image_reason,
        forbidden_domain_hits=domain_hits,
        forbidden_path_hint_hits=path_hits,
        dirty_html_hits=html_hits,
        duplicate_ratio=dup_ratio,
        hard_fails=hard_fails,
        warnings=warnings_list,
        overall_score=round(overall, 4),
        duration_ms=duration,
        token_usage=token_usage_dict,
        method=method,
        image_diagnostics=image_diagnostics,
    )


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


def summarize_scores(scores: list[ExtractionScore]) -> dict[str, Any]:
    """Aggregate per-entry scores into a benchmark summary."""
    total = len(scores)
    if not total:
        return {
            "total_entries": 0,
            "overall_pass_rate": 0.0,
            "average_overall_score": 0.0,
        }

    # Pass = no hard fails
    passed = [s for s in scores if not s.hard_fails]
    pass_rate = len(passed) / total

    avg_overall = statistics.mean(s.overall_score for s in scores)
    avg_brand = statistics.mean(s.brand_score for s in scores)
    avg_name = statistics.mean(s.name_score for s in scores)
    avg_desc = statistics.mean(s.description_score for s in scores)
    weight_rate = sum(1 for s in scores if s.weight_match) / total
    species_rate = sum(1 for s in scores if s.species_match) / total
    food_form_rate = sum(1 for s in scores if s.food_form_match) / total
    category_sane_rate = sum(1 for s in scores if s.category_sane) / total
    image_bounds_rate = sum(1 for s in scores if s.image_count_in_bounds) / total
    avg_flavor = statistics.mean(s.flavor_score for s in scores)
    avg_dup_ratio = statistics.mean(s.duplicate_ratio for s in scores) if scores else 0.0
    avg_duration = statistics.mean(s.duration_ms for s in scores if s.duration_ms is not None) if any(s.duration_ms is not None for s in scores) else 0.0

    # Hard fail breakdown
    hard_fail_breakdown: dict[str, int] = {}
    for s in scores:
        for fail in s.hard_fails:
            fail_type = fail.split(":")[0]
            hard_fail_breakdown[fail_type] = hard_fail_breakdown.get(fail_type, 0) + 1

    # Warning breakdown
    warning_breakdown: dict[str, int] = {}
    for s in scores:
        for w in s.warnings:
            warning_type = w.split(":")[0]
            warning_breakdown[warning_type] = warning_breakdown.get(warning_type, 0) + 1

    return {
        "total_entries": total,
        "overall_pass_rate": round(pass_rate, 4),
        "average_overall_score": round(avg_overall, 4),
        "average_brand_score": round(avg_brand, 4),
        "average_name_score": round(avg_name, 4),
        "average_description_score": round(avg_desc, 4),
        "weight_match_rate": round(weight_rate, 4),
        "species_match_rate": round(species_rate, 4),
        "food_form_match_rate": round(food_form_rate, 4),
        "category_sane_rate": round(category_sane_rate, 4),
        "image_bounds_rate": round(image_bounds_rate, 4),
        "average_flavor_score": round(avg_flavor, 4),
        "average_duplicate_ratio": round(avg_dup_ratio, 4),
        "average_duration_ms": round(avg_duration, 2) if avg_duration else 0.0,
        "hard_fail_breakdown": hard_fail_breakdown,
        "warning_breakdown": warning_breakdown,
    }
