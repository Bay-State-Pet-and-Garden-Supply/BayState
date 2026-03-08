"""HTML and JSON-LD extraction utilities."""

import html as html_module
import json
import re
from typing import Any, Optional
from urllib.parse import urljoin, urlparse


class ExtractionUtils:
    """Utilities for extracting product data from HTML."""

    # Size metric patterns
    SIZE_PATTERNS = [
        r"\b\d+(?:\.\d+)?\s?(?:lb|lbs|pound|pounds)\b",
        r"\b\d+(?:\.\d+)?\s?(?:oz|ounce|ounces)\b",
        r"\b\d+(?:\.\d+)?\s?(?:kg|kilogram|kilograms|g|gram|grams)\b",
        r"\b\d+(?:\.\d+)?\s?(?:qt|quart|quarts|gal|gallon|gallons|ml|l|liter|liters)\b",
        r"\b\d+\s?(?:pack|pk|ct|count)\b",
        r"\b\d+(?:\.\d+)?\s?(?:in|inch|inches|cm|mm)\b",
    ]

    def __init__(self, scoring_module):
        """Initialize with scoring module for domain utilities."""
        self._scoring = scoring_module

    def extract_size_metrics(self, text: str) -> Optional[str]:
        """Extract size/weight metrics from text."""
        normalized = " ".join((text or "").split())
        for pattern in self.SIZE_PATTERNS:
            match = re.search(pattern, normalized, flags=re.IGNORECASE)
            if match:
                return match.group(0)
        return None

    def normalize_images(self, images: list[str], source_url: str) -> list[str]:
        """Normalize and dedupe image URLs."""
        normalized: list[str] = []
        seen: set[str] = set()
        source_domain = self._scoring.domain_from_url(source_url)

        for raw in images:
            value = str(raw or "").strip()
            if not value:
                continue
            absolute = urljoin(source_url, value)
            parsed = urlparse(absolute)
            if parsed.scheme not in {"http", "https"}:
                continue
            if source_domain and self._scoring.domain_from_url(absolute) != source_domain:
                continue
            if absolute in seen:
                continue
            seen.add(absolute)
            normalized.append(absolute)
        return normalized

    def coerce_string_list(self, value: Any) -> list[str]:
        """Convert value to list of strings."""
        if isinstance(value, str):
            return [value]
        if isinstance(value, list):
            output: list[str] = []
            for item in value:
                if isinstance(item, str):
                    output.append(item)
            return output
        return []

    def extract_meta_content(self, html_text: str, key: str, *, property_attr: bool = True) -> Optional[str]:
        """Extract meta tag content."""
        attribute_name = "property" if property_attr else "name"
        pattern = rf"<meta[^>]+{attribute_name}=[\"']{re.escape(key)}[\"'][^>]+content=[\"']([^\"']+)[\"']"
        match = re.search(pattern, html_text, flags=re.IGNORECASE)
        if not match:
            return None
        return html_module.unescape(match.group(1)).strip()

    def extract_product_from_html_jsonld(
        self,
        html_text: str,
        source_url: str,
        sku: str,
        product_name: Optional[str],
        brand: Optional[str],
        matching_utils,
    ) -> Optional[dict[str, Any]]:
        """Extract product data from JSON-LD structured data."""
        script_matches = re.findall(
            r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
            html_text,
            flags=re.IGNORECASE | re.DOTALL,
        )

        candidates: list[dict[str, Any]] = []
        for block in script_matches:
            content = html_module.unescape(block).strip()
            if not content:
                continue
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError:
                continue

            queue: list[Any] = [parsed]
            while queue:
                current = queue.pop(0)
                if isinstance(current, list):
                    queue.extend(current)
                    continue
                if not isinstance(current, dict):
                    continue
                if "@graph" in current and isinstance(current["@graph"], list):
                    queue.extend(current["@graph"])

                node_type = current.get("@type")
                node_types = node_type if isinstance(node_type, list) else [node_type]
                normalized_types = {str(item).lower() for item in node_types if item}
                if "product" not in normalized_types:
                    continue

                name_value = str(current.get("name") or "").strip()
                brand_value_raw = current.get("brand")
                if isinstance(brand_value_raw, dict):
                    brand_value = str(brand_value_raw.get("name") or "").strip()
                else:
                    brand_value = str(brand_value_raw or "").strip()

                image_values = self.coerce_string_list(current.get("image"))
                normalized_images = self.normalize_images(image_values, source_url)
                if not normalized_images:
                    continue

                categories = self.coerce_string_list(current.get("category"))
                description_value = str(current.get("description") or "").strip()
                sku_value = str(current.get("sku") or current.get("mpn") or "").strip()

                score = 0.0
                if sku and sku.lower() in f"{sku_value} {description_value} {name_value}".lower():
                    score += 4.0
                if brand and matching_utils.is_brand_match(brand, brand_value, source_url):
                    score += 3.0
                if product_name and matching_utils.is_name_match(product_name, name_value):
                    score += 3.0
                if categories:
                    score += 1.0

                size_metrics = self.extract_size_metrics(f"{name_value} {description_value}")

                filled_fields = sum(
                    1
                    for value in [
                        name_value,
                        brand_value or brand,
                        description_value,
                        size_metrics,
                        normalized_images,
                        categories,
                    ]
                    if value
                )
                confidence = max(0.55, min(0.98, (filled_fields / 6.0) + (score / 12.0)))

                candidates.append(
                    {
                        "success": True,
                        "product_name": name_value,
                        "brand": brand_value or brand,
                        "description": description_value,
                        "size_metrics": size_metrics,
                        "images": normalized_images,
                        "categories": categories,
                        "confidence": confidence,
                        "_score": score,
                    }
                )

        if not candidates:
            return None

        candidates.sort(key=lambda candidate: float(candidate.get("_score", 0)), reverse=True)
        best = dict(candidates[0])
        best.pop("_score", None)
        return best
