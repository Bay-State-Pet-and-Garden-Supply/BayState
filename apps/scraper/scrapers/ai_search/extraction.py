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
        r"\b\d+\s?seeds?\b",
        r"\b\d+(?:\.\d+)?\s?(?:in|inch|inches|cm|mm)\b",
    ]
    BRAND_ALIASES = {
        "lkvll": "Lake Valley Seed",
        "lvseed": "Lake Valley Seed",
    }
    _IMAGE_URL_KEYS = ("url", "image", "contentUrl", "content_url", "src")
    _GENERIC_CATEGORY_NAMES = {
        "home",
        "product",
        "products",
        "shop",
        "catalog",
        "all products",
        "brands",
        "brand",
        "departments",
        "department",
        "shop all",
        "all categories",
        "all departments",
        "all brands",
        "garden center",
    }
    _CATEGORY_CANONICAL_NAMES = {
        "seed": "Seeds",
        "seeds": "Seeds",
        "vegetableseed": "Vegetable Seeds",
        "vegetableseeds": "Vegetable Seeds",
        "herb": "Herbs",
        "herbs": "Herbs",
        "treat": "Treats",
        "treats": "Treats",
        "supplement": "Supplements",
        "supplements": "Supplements",
    }
    _CATEGORY_KEYWORDS = (
        ("seed", "Seeds"),
        ("bulb", "Bulbs"),
        ("herb", "Herbs"),
        ("vegetable", "Vegetables"),
        ("pepper", "Vegetables"),
        ("corn", "Vegetables"),
        ("beet", "Vegetables"),
        ("kale", "Vegetables"),
        ("eggplant", "Vegetables"),
        ("tomato", "Vegetables"),
        ("lettuce", "Vegetables"),
        ("cucumber", "Vegetables"),
    )
    _INSTRUCTIONAL_SECTION_MARKERS = (
        "planting",
        "harvest",
        "seed depth",
        "plant space",
        "row space",
        "sprouts in",
        "matures in",
        "scientific name",
        "culture",
        "avg. seeding rate",
        "days to maturity",
    )
    _NEGATIVE_SIZE_CONTEXT_MARKERS = (
        "seed depth",
        "plant space",
        "row space",
        "sprouts in",
        "matures in",
        "scientific name",
        "culture",
        "soil temperature",
        "germination",
        "scoville",
    )
    _DIMENSION_CONTEXT_MARKERS = (
        "dimension",
        "dimensions",
        "measures",
        "size",
        "sized",
        "diameter",
        "length",
        "width",
        "height",
        "deep",
        "tall",
        "long",
        "wide",
        "capacity",
    )
    _POSITIVE_SIZE_CONTEXT_MARKERS = (
        "packet",
        "pack",
        "bag",
        "bottle",
        "container",
        "capacity",
        "weighs",
        "weight",
        "size",
        "volume",
        "quart",
        "gallon",
        "ounces",
        "lbs",
        "lb",
        "oz",
        "kg",
        "gram",
        "grams",
        "count",
    )
    _SLUG_TITLE_PATTERN = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)+$")
    _PRICE_SUFFIX_PATTERN = re.compile(r"\s*[-–|]\s*\$?\d[\d,]*(?:\.\d{2})\s*$")
    _SITE_SUFFIX_PATTERN = re.compile(r"\s*[|–]\s*[^|–]+$")
    _MULTISPACE_PATTERN = re.compile(r"\s+")

    def __init__(self, scoring_module):
        """Initialize with scoring module for domain utilities."""
        self._scoring = scoring_module

    def clean_text(self, value: Any) -> str:
        """Normalize arbitrary text extracted from HTML/JSON-LD."""
        return self._MULTISPACE_PATTERN.sub(" ", html_module.unescape(str(value or ""))).strip()

    @staticmethod
    def _normalize_lookup_token(value: Optional[str]) -> str:
        return re.sub(r"[^a-z0-9]", "", (value or "").lower())

    def _is_generic_category_name(self, value: Optional[str]) -> bool:
        normalized = self._normalize_lookup_token(value)
        return normalized in {self._normalize_lookup_token(item) for item in self._GENERIC_CATEGORY_NAMES}

    def normalize_category_name(self, value: Any) -> str:
        """Normalize category labels and collapse obvious aliases."""
        text = self.normalize_product_title(value)
        if not text:
            return ""

        canonical = self._CATEGORY_CANONICAL_NAMES.get(self._normalize_lookup_token(text))
        return canonical or text

    def normalize_brand_name(self, value: Any) -> Optional[str]:
        """Normalize a raw brand value and expand known aliases."""
        text = self.clean_text(value)
        if not text:
            return None

        alias = self.BRAND_ALIASES.get(self._normalize_lookup_token(text))
        return alias or text

    def normalize_product_title(self, value: Any) -> str:
        """Normalize product titles from slugs, meta tags, and JSON-LD."""
        text = self.clean_text(value)
        if not text:
            return ""

        text = self._PRICE_SUFFIX_PATTERN.sub("", text).strip()
        if "|" in text or "–" in text:
            stripped = self._SITE_SUFFIX_PATTERN.sub("", text).strip()
            if stripped:
                text = stripped

        if self._SLUG_TITLE_PATTERN.fullmatch(text):
            slug_words = text.replace("_", " ").replace("-", " ").split()
            return " ".join(word.upper() if word.isupper() and len(word) <= 4 else word.capitalize() for word in slug_words)

        return text

    def strip_instructional_copy(self, text: str) -> str:
        """Trim gardening or instructional sections that pollute product summaries."""
        normalized = self.clean_text(text)
        if not normalized:
            return ""

        lowered = normalized.lower()
        cut_positions = [lowered.find(marker) for marker in self._INSTRUCTIONAL_SECTION_MARKERS if lowered.find(marker) >= 0]
        if not cut_positions:
            return normalized

        return normalized[: min(cut_positions)].strip(" -:;,.")

    def extract_size_metrics(self, text: str) -> Optional[str]:
        """Extract size/weight metrics from text."""
        normalized = self.clean_text(text)
        if not normalized:
            return None

        matches: list[tuple[int, int, str]] = []
        for pattern in self.SIZE_PATTERNS:
            for match in re.finditer(pattern, normalized, flags=re.IGNORECASE):
                value = match.group(0)
                context = normalized[max(0, match.start() - 48) : min(len(normalized), match.end() + 48)].lower()
                value_lower = value.lower()

                if any(marker in context for marker in self._NEGATIVE_SIZE_CONTEXT_MARKERS):
                    continue

                if re.search(r"\b(?:in|inch|inches|cm|mm)\b", value_lower) and not any(
                    marker in context for marker in self._DIMENSION_CONTEXT_MARKERS
                ):
                    continue

                score = 0
                if match.start() < 140:
                    score += 2
                if any(marker in context for marker in self._POSITIVE_SIZE_CONTEXT_MARKERS):
                    score += 3
                if re.search(r"\b(?:lb|lbs|oz|kg|g|qt|gal|pack|pk|ct|count)\b", value_lower):
                    score += 2

                matches.append((score, match.start(), value))

        if matches:
            matches.sort(key=lambda item: (-item[0], item[1]))
            return matches[0][2]
        return None

    # BigCommerce stencil template placeholder pattern
    _BIGCOMMERCE_SIZE_PLACEHOLDER = re.compile(r"\{:size\}", re.IGNORECASE)
    _BIGCOMMERCE_SIZE_DEFAULT = "3840w"

    def _resolve_template_placeholders(self, url: str) -> str | None:
        """Resolve known CDN template placeholders in image URLs.

        Returns the resolved URL, or None if the URL contains unresolvable
        template tokens.
        """
        if "{" not in url:
            return url

        if self._BIGCOMMERCE_SIZE_PLACEHOLDER.search(url):
            return self._BIGCOMMERCE_SIZE_PLACEHOLDER.sub(
                self._BIGCOMMERCE_SIZE_DEFAULT, url
            )

        # Reject URLs with unknown/unresolved template placeholders
        if re.search(r"\{[^}]+\}", url):
            return None

        return url

    def normalize_images(self, images: list[str], source_url: str) -> list[str]:
        """Normalize and dedupe image URLs."""
        normalized: list[str] = []
        seen: set[str] = set()

        for raw in images:
            value = str(raw or "").strip()
            if not value:
                continue
            absolute = urljoin(source_url, value)
            resolved = self._resolve_template_placeholders(absolute)
            if resolved is None:
                continue
            parsed = urlparse(resolved)
            if parsed.scheme not in {"http", "https"}:
                continue
            if resolved in seen:
                continue
            seen.add(resolved)
            normalized.append(resolved)
        return normalized

    def coerce_string_list(self, value: Any) -> list[str]:
        """Convert value to list of strings."""
        if isinstance(value, str):
            parts = [self.clean_text(part) for part in re.split(r"\s*[>|]\s*", value)]
            return [part for part in parts if part]
        if isinstance(value, list):
            output: list[str] = []
            for item in value:
                if isinstance(item, str):
                    output.extend(self.coerce_string_list(item))
            return output
        return []

    def extract_image_urls(self, value: Any) -> list[str]:
        """Extract image URLs from JSON-LD string/list/dict shapes."""
        queue: list[Any] = [value]
        output: list[str] = []

        while queue:
            current = queue.pop(0)
            if isinstance(current, str):
                candidate = current.strip()
                if candidate:
                    output.append(candidate)
                continue

            if isinstance(current, list):
                queue.extend(current)
                continue

            if isinstance(current, dict):
                for key in self._IMAGE_URL_KEYS:
                    nested = current.get(key)
                    if nested is not None:
                        queue.append(nested)

        return output

    def extract_meta_content(self, html_text: str, key: str, *, property_attr: bool = True) -> Optional[str]:
        """Extract meta tag content."""
        if not isinstance(html_text, str):
            return None
        attribute_name = "property" if property_attr else "name"
        pattern = rf"<meta[^>]+{attribute_name}=[\"']{re.escape(key)}[\"'][^>]+content=[\"']([^\"']+)[\"']"
        match = re.search(pattern, html_text, flags=re.IGNORECASE)
        if not match:
            return None
        return html_module.unescape(match.group(1)).strip()

    def _iter_jsonld_nodes(self, html_text: str) -> list[dict[str, Any]]:
        """Parse JSON-LD blocks into a flat list of dict nodes."""
        if not isinstance(html_text, str):
            return []

        script_matches = re.findall(
            r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
            html_text,
            flags=re.IGNORECASE | re.DOTALL,
        )

        nodes: list[dict[str, Any]] = []
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
                nodes.append(current)
                if "@graph" in current and isinstance(current["@graph"], list):
                    queue.extend(current["@graph"])

        return nodes

    def extract_breadcrumb_categories(self, html_text: str, product_name: Optional[str] = None) -> list[str]:
        """Extract category-like breadcrumb names from JSON-LD breadcrumb lists."""
        categories: list[str] = []
        product_name_normalized = (
            self._scoring._matching.normalize_token_text(product_name)
            if hasattr(self._scoring, "_matching")
            else self._normalize_lookup_token(product_name)
        )

        for node in self._iter_jsonld_nodes(html_text):
            node_type = node.get("@type")
            node_types = node_type if isinstance(node_type, list) else [node_type]
            normalized_types = {str(item).lower() for item in node_types if item}
            if "breadcrumblist" not in normalized_types:
                continue

            item_list = node.get("itemListElement")
            if not isinstance(item_list, list):
                continue

            for item in item_list:
                if not isinstance(item, dict):
                    continue
                item_data = item.get("item")
                if isinstance(item_data, dict):
                    name = self.normalize_product_title(item_data.get("name"))
                else:
                    name = self.normalize_product_title(item.get("name"))
                if not name:
                    continue
                normalized_name = self._normalize_lookup_token(name)
                if self._is_generic_category_name(name):
                    continue
                if product_name_normalized and normalized_name == product_name_normalized:
                    continue
                categories.append(name)

        deduped: list[str] = []
        seen: set[str] = set()
        for category in categories:
            normalized = self._normalize_lookup_token(category)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(category)

        return deduped

    def infer_brand(
        self,
        *,
        explicit_brand: Optional[str],
        candidate_name: Optional[str],
        description: Optional[str],
        source_url: str,
        expected_name: Optional[str],
    ) -> Optional[str]:
        """Infer a canonical brand when the page only exposes shorthand signals."""
        normalized_explicit = self.normalize_brand_name(explicit_brand)
        if normalized_explicit:
            return normalized_explicit

        combined = " ".join(
            part for part in [candidate_name or "", description or "", expected_name or "", source_url or ""] if part
        ).lower()
        if "lake valley" in combined or "lkvll" in combined:
            return "Lake Valley Seed"
        if "lv seed" in combined:
            return "Lake Valley Seed"
        if (" seed pack lv" in combined or " seed herb lv" in combined or " seed vegetable lv" in combined) and "lake valley" not in combined:
            return "Lake Valley Seed"
        return None

    def infer_categories(
        self,
        *,
        html_text: str,
        source_url: str,
        candidate_name: Optional[str],
        expected_name: Optional[str],
        explicit_categories: Any = None,
        explicit_brand: Optional[str] = None,
    ) -> list[str]:
        """Combine explicit categories, breadcrumbs, and safe keyword heuristics."""
        categories: list[str] = []
        seen: set[str] = set()
        normalized_brand = self._normalize_lookup_token(self.normalize_brand_name(explicit_brand))

        def add_category(value: str) -> None:
            normalized_value = self.normalize_category_name(value)
            normalized = self._normalize_lookup_token(normalized_value)
            if not normalized or self._is_generic_category_name(normalized_value) or normalized in seen:
                return
            if normalized_brand and normalized == normalized_brand:
                return
            seen.add(normalized)
            categories.append(normalized_value)

        for raw_category in self.coerce_string_list(explicit_categories):
            normalized = self.normalize_product_title(raw_category)
            if normalized:
                add_category(normalized)

        for breadcrumb_category in self.extract_breadcrumb_categories(html_text, product_name=candidate_name or expected_name):
            add_category(breadcrumb_category)

        combined = " ".join(part for part in [candidate_name or "", expected_name or "", source_url or ""] if part).lower()
        combined_tokens = set(re.findall(r"[a-z0-9]+", combined))
        for needle, category in self._CATEGORY_KEYWORDS:
            if needle in combined_tokens:
                add_category(category)

        poultry_tokens = {"hen", "duck", "chicken", "poultry", "goose", "geese"}
        if poultry_tokens.intersection(combined_tokens):
            add_category("Poultry")
            if {"feed", "starter", "grower", "crumbles", "ration", "layer"}.intersection(combined_tokens):
                add_category("Poultry Feed")

        if {"treat", "treats", "grasshopper", "grasshoppers", "mealworm", "mealworms", "snack", "snacks"}.intersection(combined_tokens):
            add_category("Treats")

        if {"supplement", "supplements"}.intersection(combined_tokens):
            add_category("Supplements")

        if {"fuel", "spout", "gas", "motorsport"}.intersection(combined_tokens):
            add_category("Automotive")

        return categories

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
        if not isinstance(html_text, str):
            return None

        candidates: list[dict[str, Any]] = []
        for current in self._iter_jsonld_nodes(html_text):
            node_type = current.get("@type")
            node_types = node_type if isinstance(node_type, list) else [node_type]
            normalized_types = {str(item).lower() for item in node_types if item}
            if "product" not in normalized_types:
                continue

            name_value = self.normalize_product_title(current.get("name"))
            description_value = self.clean_text(current.get("description"))
            brand_value_raw = current.get("brand")
            if isinstance(brand_value_raw, dict):
                brand_value = brand_value_raw.get("name") or brand_value_raw.get("brand") or ""
            else:
                brand_value = brand_value_raw

            resolved_brand = self.infer_brand(
                explicit_brand=str(brand_value or "").strip() or brand,
                candidate_name=name_value,
                description=description_value,
                source_url=source_url,
                expected_name=product_name,
            )

            image_values = self.extract_image_urls(current.get("image"))
            normalized_images = self.normalize_images(image_values, source_url)
            if not normalized_images:
                continue

            categories = self.infer_categories(
                html_text=html_text,
                source_url=source_url,
                candidate_name=name_value,
                expected_name=product_name,
                explicit_categories=current.get("category"),
                explicit_brand=resolved_brand or brand,
            )
            sku_value = self.clean_text(current.get("sku") or current.get("mpn") or current.get("productId") or current.get("gtin12"))

            score = 0.0
            if sku and sku.lower() in f"{sku_value} {description_value} {name_value}".lower():
                score += 4.0
            if brand and matching_utils.is_brand_match(brand, resolved_brand, source_url):
                score += 3.0
            if product_name and matching_utils.is_name_match(product_name, name_value):
                score += 3.0
            if categories:
                score += 1.0

            size_source = f"{name_value} {self.strip_instructional_copy(description_value)}"
            size_metrics = self.extract_size_metrics(size_source)

            filled_fields = sum(
                1
                for value in [
                    name_value,
                    resolved_brand,
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
                    "brand": resolved_brand,
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
