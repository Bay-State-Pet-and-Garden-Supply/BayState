#!/usr/bin/env python3
"""Strict product image selection/scoring helpers for the sandbox.

Important semantic: product fields images are selected desired-product images only.
All page images remain diagnostic evidence under extraction.media.all_page_images.
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from common import tokenize

NOISE_PATTERNS = [
    "logo",
    "menu",
    "nav",
    "header",
    "footer",
    "social",
    "facebook",
    "instagram",
    "twitter",
    "tracking",
    "pixel",
    "sprite",
    "icon",
    "favicon",
    "banner",
    "hero",
    "store-locator",
]


def dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if not isinstance(value, str) or not value:
            continue
        key = value.strip()
        if key and key not in seen:
            seen.add(key)
            out.append(key)
    return out


def image_tokens(url: str) -> set[str]:
    parsed = urlparse(url)
    text = " ".join([parsed.path, parsed.query]).replace("-", " ").replace("_", " ").replace("%20", " ")
    return set(tokenize(text))


def is_noise_image(url: str) -> str | None:
    low = url.lower()
    if re.search(r"/(1x1|pixel|spacer|transparent)\.(gif|png|jpg|jpeg|webp)(\?|$)", low):
        return "tracking_pixel"
    for pattern in NOISE_PATTERNS:
        if pattern in low:
            return pattern
    return None


def expected_product_tokens(input_name: str, fixture_row: dict[str, Any] | None = None) -> set[str]:
    expected = (fixture_row or {}).get("expected", {}) if fixture_row else {}
    parts = [input_name or ""]
    for key in ("product_name", "brand", "species", "size"):
        value = expected.get(key)
        if isinstance(value, str):
            parts.append(value)
    parts.extend(expected.get("expected_tokens") or [])
    return set(tokenize(" ".join(parts)))


def url_matches_expected(url: str, expected_urls: list[str]) -> bool:
    if not expected_urls:
        return False
    low = url.lower()
    for expected in expected_urls:
        if not isinstance(expected, str) or not expected:
            continue
        exp = expected.lower()
        if exp == low or exp in low:
            return True
    return False


def select_product_images(
    *,
    page_type: str,
    input_name: str,
    fixture_row: dict[str, Any] | None,
    default_images: list[str],
    rendered_images: list[str],
    llm_images: list[str],
    product_cards: list[dict[str, Any]],
    has_product_jsonld: bool,
) -> dict[str, Any]:
    """Bucket images and select only desired-product images.

    The conservative default is to reject page-wide images unless PDP evidence or a
    matched product card binds them to the desired product.
    """
    # Do not use benchmark truth (`expected.carousel_image_urls`) for selection.
    # Selection may use only runtime/input evidence such as input name, page type,
    # JSON-LD/meta images, and matched product-card subtrees.
    expected = (fixture_row or {}).get("expected", {}) if fixture_row else {}
    tokens = set(tokenize(input_name or ""))

    all_page_images = dedupe(default_images + rendered_images)
    source_images = set(default_images + rendered_images)
    llm_supported = [url for url in llm_images if url in source_images]
    all_page_images = dedupe(all_page_images + llm_supported)

    candidate: list[dict[str, Any]] = []
    rejected: list[dict[str, str]] = []

    def reject_or_candidate(url: str, reason: str, score: float) -> None:
        low = url.lower()
        noise = is_noise_image(url)
        if noise:
            rejected.append({"url": url, "reason": noise})
            return
        candidate.append({"url": url, "reason": reason, "score": round(score, 3)})

    # PDP with Product JSON-LD/meta images can select default source images.
    if page_type == "pdp" and has_product_jsonld:
        for url in default_images:
            reject_or_candidate(url, "pdp_product_image", 1.0)

    # Product-card images: only from strong matched cards.
    for card in product_cards or []:
        if float(card.get("score") or 0) < 0.5:
            continue
        for url in card.get("image_urls") or []:
            reject_or_candidate(url, "matched_product_card", float(card.get("score") or 0))

    # PDP/token-bound URL fallback. Not allowed for collection/category unless
    # fixture explicitly allows collection review and there is no card truth.
    allow_token_fallback = page_type == "pdp" or bool(expected.get("allow_collection_review") and product_cards)
    if allow_token_fallback:
        for url in all_page_images:
            if any(c["url"] == url for c in candidate):
                continue
            toks = image_tokens(url)
            if tokens and len(tokens & toks) >= min(2, len(tokens)):
                reject_or_candidate(url, "url_token_match", len(tokens & toks) / max(len(tokens), 1))

    selected = dedupe([c["url"] for c in sorted(candidate, key=lambda c: c["score"], reverse=True)])
    for url in all_page_images:
        if url not in selected and not any(r["url"] == url for r in rejected):
            rejected.append({"url": url, "reason": "not_bound_to_desired_product"})

    return {
        "all_page_images": all_page_images,
        "candidate_product_images": dedupe([c["url"] for c in candidate]),
        "selected_product_images": selected,
        "rejected_images": rejected,
        "llm_supported_images": llm_supported,
    }


def score_selected_product_images(selected_images: list[str], fixture_row: dict[str, Any] | None, page_type: str) -> dict[str, Any]:
    expected = (fixture_row or {}).get("expected", {}) if fixture_row else {}
    expected_urls = expected.get("carousel_image_urls") or []
    expected_count = len(expected_urls)
    selected = dedupe(selected_images)

    true_positive = sum(1 for url in selected if url_matches_expected(url, expected_urls)) if expected_urls else 0
    false_positive = 0 if expected_count == 0 and not selected else max(0, len(selected) - true_positive)
    false_negative = max(0, expected_count - true_positive)

    if expected_count == 0:
        precision = 1.0 if not selected else 0.0
        recall = 1.0 if not selected else 0.0
        passed = not selected
        reason = "no product images expected; none selected" if passed else "selected images despite no expected product images"
    else:
        precision = true_positive / len(selected) if selected else 0.0
        recall = true_positive / expected_count if expected_count else 0.0
        min_precision = float(expected.get("min_product_image_precision") or (0.8 if page_type in {"collection", "category"} else 0.9))
        min_recall = float(expected.get("min_product_image_recall") or (0.5 if page_type in {"collection", "category"} else 0.7))
        passed = precision >= min_precision and recall >= min_recall
        reason = f"precision={precision:.2f}, recall={recall:.2f}, thresholds={min_precision:.2f}/{min_recall:.2f}"

    return {
        "expected_carousel_images": expected_count,
        "selected_images": len(selected),
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "passed": passed,
        "reason": reason,
        "expected": expected_urls,
        "actual": selected,
    }
