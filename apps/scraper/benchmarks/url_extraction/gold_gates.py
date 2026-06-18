"""Hard-gate evaluator for human-reviewed URL extraction gold rows.

The legacy benchmark score is useful for trend analysis. Gold gates are stricter:
they evaluate the public ``ProductPageExtractor.extract()`` result against
human-reviewed accept/reject assertions and return explicit pass/fail reasons.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from benchmarks.url_extraction.metrics import (
    FORBIDDEN_IMAGE_DOMAINS,
    FORBIDDEN_PATH_HINTS,
    check_category_not_protein_only,
    check_dirty_html_markers,
    check_forbidden_image_domains,
    check_forbidden_image_path_hints,
)


@dataclass(slots=True)
class GoldGateResult:
    """Result of evaluating one extractor output against one gold row."""

    entry_id: str
    expected_outcome: str
    passed: bool
    hard_fails: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


def evaluate_gold_row(row: dict[str, Any], result: dict[str, Any]) -> GoldGateResult:
    """Evaluate a normalized ``ProductPageExtractor`` result against a gold row."""
    entry_id = str(row.get("id") or "unknown")
    expected_outcome = str(row.get("expected_outcome") or "accept")
    hard_fails: list[str] = []
    warnings: list[str] = []
    details: dict[str, Any] = {}

    if expected_outcome == "reject":
        _evaluate_reject_row(row, result, hard_fails, warnings)
    else:
        _evaluate_accept_row(row, result, hard_fails, warnings, details)

    return GoldGateResult(
        entry_id=entry_id,
        expected_outcome=expected_outcome,
        passed=not hard_fails,
        hard_fails=hard_fails,
        warnings=warnings,
        details=details,
    )


def _evaluate_accept_row(
    row: dict[str, Any],
    result: dict[str, Any],
    hard_fails: list[str],
    warnings: list[str],
    details: dict[str, Any],
) -> None:
    if not result.get("success"):
        error_text = _result_error_text(result).lower()
        transient_keywords = ["cloudflare", "access denied", "security check", "forbidden", "http 502", "502 bad gateway", "attention required"]
        if any(kw in error_text for kw in transient_keywords):
            warnings.append(f"extraction_failed_transient: {_result_error_text(result)}")
        else:
            hard_fails.append(f"extraction_failed: {_result_error_text(result) or 'no error'}")
        return

    _check_same_domain(row, result, hard_fails)

    assertions = row.get("field_assertions") or {}
    if not isinstance(assertions, dict):
        hard_fails.append("missing_field_assertions")
        return

    for field_name, assertion in assertions.items():
        if not isinstance(assertion, dict):
            hard_fails.append(f"malformed_assertion:{field_name}")
            continue
        _evaluate_field_assertion(field_name, assertion, result, hard_fails, warnings, details)

    description = _field_value(result, "description")
    html_clean, html_hits = check_dirty_html_markers(str(description) if description is not None else None)
    if not html_clean:
        hard_fails.append(f"dirty_description_html: {html_hits}")

    categories = _field_value(result, "categories")
    if not isinstance(categories, list):
        categories = []
    category_clean, category_reason = check_category_not_protein_only(categories, row.get("tags") or [])
    if not category_clean:
        hard_fails.append(f"category_is_flavor_or_protein: {category_reason}")


def _evaluate_reject_row(
    row: dict[str, Any],
    result: dict[str, Any],
    hard_fails: list[str],
    warnings: list[str],
) -> None:
    if result.get("success"):
        hard_fails.append("expected_reject_but_extraction_succeeded")
        return

    reason_contains = (row.get("reject_assertions") or {}).get("reason_contains") or []
    if reason_contains:
        error_text = _result_error_text(result).lower()
        if not any(str(fragment).lower() in error_text for fragment in reason_contains):
            hard_fails.append(
                "reject_reason_mismatch: expected one of "
                f"{reason_contains!r}, got {error_text!r}"
            )
    elif not _result_error_text(result):
        warnings.append("reject_without_error_reason")


def _evaluate_field_assertion(
    field_name: str,
    assertion: dict[str, Any],
    result: dict[str, Any],
    hard_fails: list[str],
    warnings: list[str],
    details: dict[str, Any],
) -> None:
    mode = assertion.get("mode")
    if mode == "ignored":
        return

    if field_name == "images":
        _evaluate_image_assertion(assertion, result, hard_fails, warnings, details)
        return

    actual = _field_value(result, field_name)
    if mode == "forbidden":
        if _has_value(actual):
            hard_fails.append(f"forbidden_field_present:{field_name}={actual!r}")
        return

    if mode == "soft":
        if not _matches_assertion(actual, assertion):
            warnings.append(f"soft_field_mismatch:{field_name}")
        return

    if not _matches_assertion(actual, assertion):
        hard_fails.append(_format_field_failure(field_name, assertion, actual))


def _evaluate_image_assertion(
    assertion: dict[str, Any],
    result: dict[str, Any],
    hard_fails: list[str],
    warnings: list[str],
    details: dict[str, Any],
) -> None:
    images = _field_value(result, "images")
    if not isinstance(images, list):
        images = []

    count = len([img for img in images if isinstance(img, str) and img.strip()])
    details["approved_image_count"] = count

    min_count = assertion.get("min_count", 1 if assertion.get("mode") == "required" else 0)
    max_count = assertion.get("max_count")
    if isinstance(min_count, int) and count < min_count:
        hard_fails.append(f"missing_required_product_image: {count} < {min_count}")
    if isinstance(max_count, int) and count > max_count:
        hard_fails.append(f"too_many_product_images: {count} > {max_count}")

    strictness = assertion.get("count_strictness", "range")
    reviewed_count = assertion.get("reviewed_product_image_count")
    if isinstance(reviewed_count, int):
        if strictness == "exact" and count != reviewed_count:
            hard_fails.append(f"image_count_exact_mismatch: {count} != {reviewed_count}")
        elif strictness != "exact" and count != reviewed_count:
            warnings.append(f"image_count_differs_from_reviewed: {count} != {reviewed_count}")

    blocked_domains = assertion.get("forbidden_domains") or assertion.get("forbidden_image_domains")
    if not isinstance(blocked_domains, list):
        blocked_domains = list(FORBIDDEN_IMAGE_DOMAINS)
    domain_clean, domain_hits = check_forbidden_image_domains(images, set(blocked_domains))
    if not domain_clean:
        hard_fails.append(f"forbidden_image_asset_domain: {domain_hits}")

    path_hints = assertion.get("forbidden_path_hints") or assertion.get("forbidden_image_path_hints")
    if not isinstance(path_hints, list):
        path_hints = list(FORBIDDEN_PATH_HINTS)
    path_clean, path_hits = check_forbidden_image_path_hints(images, path_hints)
    if not path_clean:
        hard_fails.append(f"forbidden_image_asset_path: {path_hits}")


def _matches_assertion(actual: Any, assertion: dict[str, Any]) -> bool:
    match = assertion.get("match") or "exact"

    if match == "present":
        return _has_value(actual)

    if match == "exact":
        return _normalize_text(actual) == _normalize_text(assertion.get("expected"))

    if match == "contains":
        expected = _normalize_text(assertion.get("expected"))
        return bool(expected) and expected in _normalize_text(actual)

    if match == "contains_all":
        actual_norm = _normalize_text(actual)
        tokens = assertion.get("tokens") or []
        return bool(tokens) and all(_normalize_text(token) in actual_norm for token in tokens)

    if match == "any_of":
        actual_norm = _normalize_text(actual)
        tokens = assertion.get("tokens") or []
        return bool(tokens) and any(_normalize_text(token) in actual_norm for token in tokens)

    if match == "same_domain":
        return _normalize_domain(str(actual or "")) == _normalize_domain(str(assertion.get("expected") or ""))

    return False


def _format_field_failure(field_name: str, assertion: dict[str, Any], actual: Any) -> str:
    match = assertion.get("match") or "exact"
    expected = assertion.get("expected", assertion.get("tokens"))
    code = "field_mismatch"
    if field_name == "brand":
        code = "brand_mismatch"
    elif field_name == "product_name":
        code = "name_identity_mismatch"
    elif field_name in {"size_metrics", "weight", "package_weight"}:
        code = "size_mismatch_when_required"
    return f"{code}:{field_name}: expected {match} {expected!r}, got {actual!r}"


def _field_value(result: dict[str, Any], field_name: str) -> Any:
    if field_name == "size_metrics":
        val = result.get("size_metrics") or result.get("weight")
        if val is not None:
            return val
    if field_name in result and result.get(field_name) is not None:
        return result.get(field_name)
    product = result.get("product")
    if isinstance(product, dict) and field_name in product:
        return product.get(field_name)
    if field_name == "product_name" and "name" in result:
        return result.get("name")
    if field_name == "images" and "image_urls" in result:
        return result.get("image_urls")
    return None


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        value = " ".join(str(item) for item in value)
    return " ".join(str(value).lower().strip().split())


def _check_same_domain(row: dict[str, Any], result: dict[str, Any], hard_fails: list[str]) -> None:
    expected_url = str(row.get("source_url") or row.get("evidence_url") or "")
    actual_url = str(result.get("final_url") or result.get("url") or "")
    expected_domain = _normalize_domain(expected_url)
    actual_domain = _normalize_domain(actual_url)
    if expected_domain and actual_domain and expected_domain != actual_domain:
        hard_fails.append(
            f"wrong_domain_or_non_official_url: expected {expected_domain}, got {actual_domain}"
        )


def _normalize_domain(url_or_domain: str) -> str:
    value = (url_or_domain or "").strip().lower()
    if not value:
        return ""
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = parsed.hostname or ""
    if host.startswith("www."):
        host = host[4:]
    return host


def _result_error_text(result: dict[str, Any]) -> str:
    parts = [
        result.get("error"),
        result.get("error_message"),
        result.get("failure_message"),
        result.get("reason"),
    ]
    return " ".join(str(part) for part in parts if part)
