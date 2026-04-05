from __future__ import annotations

import re
from typing import Any

PLACEHOLDER_IMAGE_MARKERS = (
    "placeholder",
    "noimage",
    "no-image",
    "spacer",
    "sprite",
    "transparent",
    "blank.gif",
)

FIELD_ALIASES = {
    "name": "title",
    "title": "title",
    "sku": "sku",
    "brand": "brand",
    "image_urls": "images",
    "images": "images",
    "image_url": "images",
    "description": "description",
    "weight": "weight",
    "category": "category",
    "item_number": "item_number",
    "manufacturer_part_number": "manufacturer_part_number",
    "unit_of_measure": "unit_of_measure",
    "upc": "upc",
    "size": "size",
    "size_options": "size_options",
    "features": "features",
    "ingredients": "ingredients",
    "dimensions": "dimensions",
    "specifications": "specifications",
    "case_pack": "case_pack",
    "ratings": "ratings",
    "reviews_count": "reviews_count",
    "url": "url",
    "scraped_at": "scraped_at",
    "availability": "availability",
}


def _to_snake_case(value: str) -> str:
    normalized = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", normalized)
    return normalized.strip("_").lower()


def canonicalize_product_payload(payload: dict[str, Any]) -> dict[str, Any]:
    canonical: dict[str, Any] = {}

    for key, value in payload.items():
        normalized_key = FIELD_ALIASES.get(_to_snake_case(str(key)), _to_snake_case(str(key)))
        canonical[normalized_key] = value

    if not canonical.get("title") and canonical.get("name"):
        canonical["title"] = canonical.get("name")

    return canonical


def _unique_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []

    for value in values:
        if value not in seen:
            unique.append(value)
            seen.add(value)

    return unique


def _collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _extract_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        collapsed = value.strip()
        return collapsed or None
    return str(value).strip() or None


def _looks_like_blob(value: str, *, max_length: int = 80) -> bool:
    if len(value) > max_length:
        return True
    if value.count("\n") >= 2:
        return True
    if len(re.findall(r"(?:item\s*#|upc#|add to cart|attributes|ingredients)", value, flags=re.IGNORECASE)) >= 2:
        return True
    return False


def _normalize_short_identifier(
    field_name: str,
    value: Any,
    warnings: list[str],
    *,
    max_length: int = 40,
    direct_pattern: str = r"[A-Za-z0-9._/-]+",
    extraction_patterns: list[str] | None = None,
) -> str | None:
    raw = _extract_text(value)
    if not raw:
        return None

    if not _looks_like_blob(raw, max_length=max_length) and re.fullmatch(direct_pattern, raw):
        return raw

    for pattern in extraction_patterns or []:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match:
            extracted = match.group(1).strip()
            if re.fullmatch(direct_pattern, extracted):
                warnings.append(f"Normalized {field_name} from noisy extracted text")
                return extracted

    warnings.append(f"Discarded suspicious {field_name} value")
    return None


def _normalize_upc(value: Any, warnings: list[str]) -> str | None:
    raw = _extract_text(value)
    if not raw:
        return None

    digits_only = re.sub(r"\D", "", raw)
    if not _looks_like_blob(raw, max_length=24) and 8 <= len(digits_only) <= 14:
        return digits_only

    labeled_patterns = [
        r"UPC[#:\sA-Z-]{0,20}(\d{8,14})\b",
        r"EA[#:\sA-Z-]{0,20}(\d{8,14})\b",
    ]
    for pattern in labeled_patterns:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match:
            warnings.append("Normalized upc from noisy extracted text")
            return match.group(1)

    candidates = _unique_preserve_order(re.findall(r"\b\d{8,14}\b", raw))
    if len(candidates) == 1:
        warnings.append("Normalized upc from noisy extracted text")
        return candidates[0]

    warnings.append("Discarded suspicious upc value")
    return None


def _normalize_images(value: Any, warnings: list[str]) -> list[str]:
    if not value:
        return []

    raw_values = value if isinstance(value, list) else [value]
    urls: list[str] = []
    dropped = 0

    for item in raw_values:
        candidate = _extract_text(item)
        if not candidate:
            continue
        if not candidate.startswith(("http://", "https://")):
            dropped += 1
            continue
        lowered = candidate.lower()
        if any(marker in lowered for marker in PLACEHOLDER_IMAGE_MARKERS):
            dropped += 1
            continue
        urls.append(candidate)

    if dropped:
        warnings.append(f"Dropped {dropped} invalid or placeholder image URLs")

    return _unique_preserve_order(urls)


def _normalize_rating(value: Any, warnings: list[str]) -> float | None:
    if value is None or value == "":
        return None

    if isinstance(value, (int, float)):
        rating = float(value)
        if 0 <= rating <= 5:
            return rating
        warnings.append("Discarded out-of-range rating value")
        return None

    raw = _extract_text(value)
    if not raw:
        return None

    match = re.search(r"(\d+(?:\.\d+)?)", raw)
    if not match:
        warnings.append("Discarded unparseable rating value")
        return None

    rating = float(match.group(1))
    if 0 <= rating <= 5:
        if raw != match.group(1):
            warnings.append("Normalized rating from formatted text")
        return rating

    warnings.append("Discarded out-of-range rating value")
    return None


def _normalize_reviews_count(value: Any, warnings: list[str]) -> int | None:
    if value is None or value == "":
        return None

    if isinstance(value, int):
        return value if value >= 0 else None

    raw = _extract_text(value)
    if not raw:
        return None

    match = re.search(r"(\d[\d,]*)", raw)
    if not match:
        warnings.append("Discarded unparseable reviews_count value")
        return None

    normalized = int(match.group(1).replace(",", ""))
    if raw != match.group(1):
        warnings.append("Normalized reviews_count from formatted text")
    return normalized


def _normalize_text(value: Any, *, max_length: int | None = None) -> str | None:
    raw = _extract_text(value)
    if not raw:
        return None

    collapsed = _collapse_whitespace(raw)
    if max_length is not None and len(collapsed) > max_length:
        return None
    return collapsed


def sanitize_product_payload(payload: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    canonical = canonicalize_product_payload(payload)
    sanitized = dict(canonical)
    warnings: list[str] = []

    sanitized["title"] = _normalize_text(canonical.get("title"), max_length=300)
    sanitized["brand"] = _normalize_text(canonical.get("brand"), max_length=120)
    sanitized["description"] = _normalize_text(canonical.get("description"))
    sanitized["unit_of_measure"] = _normalize_short_identifier(
        "unit_of_measure",
        canonical.get("unit_of_measure"),
        warnings,
        max_length=24,
        direct_pattern=r"[A-Za-z][A-Za-z0-9 /-]{0,23}",
        extraction_patterns=[
            r"/\s*([A-Za-z][A-Za-z0-9 -]{0,23})",
        ],
    )
    sanitized["item_number"] = _normalize_short_identifier(
        "item_number",
        canonical.get("item_number"),
        warnings,
        extraction_patterns=[
            r"Item\s*#\s*([A-Z0-9-]+)\b",
            r"Product\s*#\s*([A-Z0-9-]+)\b",
        ],
    )
    sanitized["manufacturer_part_number"] = _normalize_short_identifier(
        "manufacturer_part_number",
        canonical.get("manufacturer_part_number"),
        warnings,
        max_length=60,
        extraction_patterns=[
            r"(?:Mfg(?:\.| Part)?\s*#|Manufacturer\s*#|Model(?: Number)?)\s*([A-Z0-9._/-]+)\b",
        ],
    )
    sanitized["upc"] = _normalize_upc(canonical.get("upc"), warnings)
    sanitized["images"] = _normalize_images(canonical.get("images"), warnings)
    sanitized["ratings"] = _normalize_rating(canonical.get("ratings"), warnings)
    sanitized["reviews_count"] = _normalize_reviews_count(canonical.get("reviews_count"), warnings)

    return sanitized, warnings
