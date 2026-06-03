"""HTML and JSON-LD extraction utilities."""

import html as html_module
import json
import re
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from .matching import MatchingUtils


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
        "test shop",
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
    _DEMANDWARE_VARIATION_URL_PATTERN = re.compile(
        r"(?:data-url|value)=[\"']([^\"']*Product-Variation[^\"']+)[\"']",
        flags=re.IGNORECASE,
    )
    _DEMANDWARE_VARIATION_ATTR_PATTERN = re.compile(
        r"data-attr-value=[\"']([^\"']+)[\"'][^>]*data-attr-id=[\"']([^\"']+)[\"']"
        r"|data-attr-id=[\"']([^\"']+)[\"'][^>]*data-attr-value=[\"']([^\"']+)[\"']",
        flags=re.IGNORECASE,
    )
    _DISPLAY_VALUE_PATTERN = re.compile(r"aria-label=[\"']Select\s+([^\"']+)[\"']", flags=re.IGNORECASE)
    _DEMANDWARE_VARIATION_ID_PATTERN = re.compile(r'"variant"\s*:\s*"([^"]+)"', flags=re.IGNORECASE)

    # Image scoring heuristics
    _NAV_KEYWORDS = {"logo", "icon", "nav", "menu", "category", "banner", "social", "footer", "cart", "account", "search", "screenshot"}
    _GALLERY_KEYWORDS = {"product", "gallery", "carousel", "pdp", "main", "hero", "detail", "item", "thumb"}
    _BADGE_KEYWORDS = {"free", "shipping", "guarantee", "badge", "icon", "feature", "made-in", "usa", "natural", "organic"}
    _NON_PRODUCT_SECTION_MARKERS = [
        "related products", "related-products", "customers also bought", "you may also like",
        "you might also like", "people also viewed", "recommended products", "others also bought"
    ]

    def __init__(self, scoring_module):
        """Initialize with scoring module for domain utilities."""
        self._scoring = scoring_module
        self._matching = MatchingUtils()

    # DOM/markup artifact markers that leak into extracted text
    _DIRTY_HTML_MARKERS: list[str] = [
        "virtual_list",
        "bottomspacer",
        "data-qa=",
        "aria-setsize",
    ]

    def clean_text(self, value: Any) -> str:
        """Normalize arbitrary text extracted from HTML/JSON-LD."""
        return self._MULTISPACE_PATTERN.sub(" ", html_module.unescape(str(value or ""))).strip()

    def clean_description_text(self, text: str) -> str:
        """Sanitize product description by removing DOM/markup artifacts.

        Known artifacts: virtual_list, bottomSpacer, data-qa=, aria-setsize.
        If artifacts appear AFTER valid product copy, truncate at first artifact marker.
        """
        cleaned = self.clean_text(text)
        if not cleaned:
            return cleaned

        # Step 1: Remove standalone HTML attribute sequences like data-qa="value"
        cleaned = re.sub(
            r'\s*(?:data-qa|aria-[a-z]+)\s*=\s*"[^"]*"',
            "",
            cleaned,
            flags=re.IGNORECASE,
        )

        # Step 2: Find the earliest artifact marker position
        lower = cleaned.lower()
        first_pos: int | None = None
        for marker in self._DIRTY_HTML_MARKERS:
            pos = lower.find(marker.lower())
            if pos != -1 and (first_pos is None or pos < first_pos):
                first_pos = pos

        if first_pos is not None:
            cleaned = cleaned[:first_pos].strip()

        # Step 3: Final whitespace normalization
        cleaned = self._MULTISPACE_PATTERN.sub(" ", cleaned).strip()
        return cleaned

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

                if re.search(r"\b(?:in|inch|inches|cm|mm)\b", value_lower) and not any(marker in context for marker in self._DIMENSION_CONTEXT_MARKERS):
                    continue

                score = 0
                if match.start() < 140:
                    score += 2
                if any(marker in context for marker in self._POSITIVE_SIZE_CONTEXT_MARKERS):
                    score += 3
                if re.search(r"\b(?:lb|lbs|oz|kg|g|qt|gal|pack|pk|ct|count)\b", value_lower):
                    score += 2

                matches.append((score, match.start(), value))

        # Heuristic for unitless numbers labeled as weight in HTML tables/context
        if not matches:
            # Look for "Weight" followed by a number, potentially separated by tags or whitespace
            # Example: <th>Weight</th><td>0.283</td>
            # We strip tags for this check to make it more reliable across different HTML structures
            text_no_tags = re.sub(r"<[^>]+>", " ", normalized)
            unitless_weight_pattern = re.compile(r"\bweight\b[^0-9]{1,64}(\d+(?:\.\d+)?)\b", flags=re.IGNORECASE)
            for match in unitless_weight_pattern.finditer(text_no_tags):
                val = match.group(1)
                try:
                    num = float(val)
                    if num > 0:
                        matches.append((4, match.start(1), val))
                except ValueError:
                    continue

        if matches:
            matches.sort(key=lambda item: (-item[0], item[1]))
            return matches[0][2]
        return None

    # BigCommerce stencil template placeholder pattern
    _BIGCOMMERCE_SIZE_PLACEHOLDER = re.compile(r"\{:size\}", re.IGNORECASE)
    _BIGCOMMERCE_SIZE_DEFAULT = "3840w"
    _PAGE_RESOURCE_SEGMENTS = {"products", "collections", "pages", "blogs", "search", "account"}

    def _resolve_template_placeholders(self, url: str) -> str | None:
        """Resolve known CDN template placeholders in image URLs.

        Returns the resolved URL, or None if the URL contains unresolvable
        template tokens.
        """
        if "{" not in url:
            return url

        if self._BIGCOMMERCE_SIZE_PLACEHOLDER.search(url):
            return self._BIGCOMMERCE_SIZE_PLACEHOLDER.sub(self._BIGCOMMERCE_SIZE_DEFAULT, url)

        # Reject URLs with unknown/unresolved template placeholders
        if re.search(r"\{[^}]+\}", url):
            return None

        return url

    def _is_page_relative_path_artifact(self, raw: str, source_url: str, resolved_url: str) -> bool:
        """Detect malformed relative image paths resolved under page routes.

        Some extractors/LLMs return bare relative paths like `files/<name>.jpg`
        or `products/<name>.jpg`.  Resolving those against a PDP like
        `/products/<slug>` produces broken URLs such as
        `/products/files/<name>.jpg` or `/products/products/<name>.jpg`.

        This guard catches any bare relative path whose leading segment is
        either ``files`` or any member of ``_PAGE_RESOURCE_SEGMENTS`` and that
        resolved under a page-route source URL produces a doubled/misplaced
        segment.
        """
        value = str(raw or "").strip()
        if not value or value.startswith(("//", "./", "../")):
            return False

        raw_path = urlparse(value).path.lower()
        # Strip leading slashes so split() gets the actual first segment
        stripped_path = raw_path.lstrip("/")
        raw_leading = stripped_path.split("/", 1)[0] if "/" in stripped_path else stripped_path

        if not raw_leading:
            return False

        # Only flag paths whose leading segment is a known page-route or `files`
        flagged_segments = self._PAGE_RESOURCE_SEGMENTS | {"files"}
        if raw_leading not in flagged_segments:
            return False

        source_segments = [seg for seg in urlparse(source_url).path.lower().split("/") if seg]
        if not source_segments or source_segments[0] not in self._PAGE_RESOURCE_SEGMENTS:
            return False

        resolved_path = urlparse(resolved_url).path.lower()
        # Doubled: /products/products/... or /products/files/... etc.
        return resolved_path.startswith(f"/{source_segments[0]}/{raw_leading}/")

    def normalize_images(self, images: list[str], source_url: str) -> list[str]:
        """Normalize and dedupe image URLs."""
        normalized: list[str] = []
        seen: set[str] = set()

        for raw in images:
            value = str(raw or "").strip()
            if not value:
                continue
            absolute = urljoin(source_url, value)
            if self._is_page_relative_path_artifact(value, source_url, absolute):
                continue
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

    def merge_product_images(
        self,
        *,
        source_url: str,
        html: str,
        markdown: str,
        crawl_media: dict[str, Any],
        jsonld_images: list[str],
        meta_images: list[str],
        expected_product_name: Optional[str] = None,
        expected_brand: Optional[str] = None,
    ) -> tuple[list[str], dict[str, Any]]:
        """Perform deterministic image enrichment with scoring and diagnostics.
        
        Returns (sorted_images, diagnostics).
        """
        all_candidates: dict[str, dict[str, Any]] = {}
        
        def add_candidate(url: str, source: str, score_bonus: int = 0, media_info: Optional[dict[str, Any]] = None):
            normalized = self.normalize_images([url], source_url)
            if not normalized:
                return
            target = normalized[0]
            if target not in all_candidates:
                all_candidates[target] = {
                    "url": target,
                    "sources": {source},
                    "score": 0.0,
                    "media_info": media_info or {},
                    "bonuses": []
                }
            else:
                all_candidates[target]["sources"].add(source)
            
            if score_bonus:
                all_candidates[target]["score"] += score_bonus

        # 1. Collect from all sources
        for img in jsonld_images:
            add_candidate(img, "json-ld", score_bonus=3)
        for img in meta_images:
            add_candidate(img, "meta", score_bonus=2)
        
        # Crawl4AI media
        crawl_imgs = crawl_media.get("images", [])
        for img_obj in crawl_imgs:
            if isinstance(img_obj, dict) and img_obj.get("src"):
                add_candidate(img_obj["src"], "crawl4ai-media", media_info=img_obj)
        
        # Injected script candidates (from our upgraded JS)
        injected_match = re.search(r'<script[^>]+id=["\']bsp-image-candidates["\'][^>]*>(.*?)</script>', html, flags=re.DOTALL)
        if injected_match:
            try:
                injected_urls = json.loads(injected_match.group(1))
                for url in injected_urls:
                    add_candidate(url, "injected-script", score_bonus=1)
            except Exception:
                pass

        # 2. Scoring loop
        product_slug = self._normalize_lookup_token(expected_product_name)
        brand_slug = self._normalize_lookup_token(expected_brand)
        domain = self._scoring.domain_from_url(source_url)
        
        # Section markers for DOM position scoring
        html_lower = html.lower()
        section_offsets = {marker: html_lower.find(marker) for marker in self._NON_PRODUCT_SECTION_MARKERS if html_lower.find(marker) != -1}
        first_bad_section_offset = min(section_offsets.values()) if section_offsets else len(html_lower)

        for target, data in all_candidates.items():
            score = data["score"]
            url_lower = target.lower()
            filename = urlparse(target).path.split("/")[-1].lower()
            
            # Filename matching
            if product_slug and any(token in filename for token in product_slug.split() if len(token) > 2):
                score += 5.0
            
            # Domain matching
            if domain and domain in url_lower:
                score += 3.0
            
            # Media info (Crawl4AI)
            media = data["media_info"]
            if media:
                score += float(media.get("score", 0)) * 2.0
                if self._coerce_int(media.get("width"), 0) > 600:
                    score += 2.0
                if self._coerce_int(media.get("height"), 0) > 600:
                    score += 2.0
                      
            # Semantic Content Boundary Detection
            # We try to identify where the "Main Content" starts to avoid header/nav noise
            content_start_offset = html_lower.find("<h1")
            if content_start_offset == -1:
                content_start_offset = html_lower.find("<main")
            if content_start_offset == -1:
                content_start_offset = 0
            
            # DOM Position (rough via offset in HTML)
            img_offset = html_lower.find(target.lower())
            if img_offset == -1:
                # Try finding just the filename part to catch relative paths or CDN variants
                path_part = urlparse(target).path.split("/")[-1].lower()
                filename_no_ext = path_part.rsplit(".", 1)[0] if "." in path_part else path_part
                if len(filename_no_ext) > 5:
                    img_offset = html_lower.find(filename_no_ext)

            if img_offset != -1:
                # 1. Header/Navigation Zone: Neutral or slight penalty if way before H1
                if img_offset < content_start_offset:
                    score -= 2.0
                
                # 2. Main Product Area vs. Related/Footer Sections
                if first_bad_section_offset < len(html_lower):
                    if img_offset > first_bad_section_offset:
                        score -= 25.0 # Massive penalty for related products/footer
                    elif img_offset >= content_start_offset:
                        score += 5.0 # High confidence main product area

            # Keywords in URL/Alt
            alt = str(media.get("alt", "")).lower()
            if any(kw in url_lower or kw in alt for kw in self._GALLERY_KEYWORDS):
                score += 4.0
            if any(kw in url_lower or kw in alt for kw in self._NAV_KEYWORDS):
                score -= 6.0
            if any(kw in url_lower or kw in alt for kw in self._BADGE_KEYWORDS):
                score -= 4.0
                
            data["score"] = score

        # 3. Filter and sort
        final_list = [d for d in all_candidates.values() if d["score"] > 0]
        final_list.sort(key=lambda x: x["score"], reverse=True)
        
        sorted_urls = [d["url"] for d in final_list]
        
        # Convert sets to lists for JSON serialization
        candidate_details = []
        for d in final_list[:15]: # Only log top 15 for brevity
            detail = d.copy()
            detail["sources"] = list(d["sources"])
            candidate_details.append(detail)

        diagnostics = {
            "jsonld_count": len(jsonld_images),
            "meta_count": len(meta_images),
            "crawl4ai_media_count": len(crawl_imgs),
            "total_candidates": len(all_candidates),
            "selected_count": len(sorted_urls),
            "rejected_count": len(all_candidates) - len(sorted_urls),
            "top_score": final_list[0]["score"] if final_list else 0,
            "sample_candidates": candidate_details
        }
        
        return sorted_urls, diagnostics

    def _coerce_int(self, value: Any, default: int) -> int:
        try:
            return int(float(value))
        except Exception:
            return default

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

    def normalized_variant_keywords(self, value: Optional[str]) -> set[str]:
        """Extract human-readable variant tokens such as colors and flavors."""
        tokens = self._matching.tokenize_keywords(value)
        variant_measure_tokens = self._matching.extract_variant_tokens(value)
        normalized_measure_roots = {re.sub(r"[^a-z]", "", token.lower()) for token in variant_measure_tokens if token}
        return {token for token in tokens if token not in self._matching.STOP_WORDS and token not in normalized_measure_roots}

    @staticmethod
    def canonicalize_url(url: Optional[str]) -> str:
        raw_url = str(url or "").strip()
        if not raw_url:
            return ""

        parsed = urlparse(raw_url)
        filtered_query = [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
            if not key.lower().startswith("utm_") and key.lower() not in {"bvstate", "bvrrp", "srsltid", "gclid", "fbclid"}
        ]
        normalized_path = parsed.path.rstrip("/") or "/"
        normalized_query = urlencode(sorted(filtered_query))
        return urlunparse((parsed.scheme.lower() or "https", parsed.netloc.lower(), normalized_path, "", normalized_query, ""))

    def _merge_variant_url(self, variation_url: str, attr_values: dict[str, str]) -> str:
        parsed = urlparse(variation_url)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        updated_pairs: list[tuple[str, str]] = []
        for key, value in query_pairs:
            updated_value = value
            key_lower = key.lower()
            if "_color" in key_lower and attr_values.get("color"):
                updated_value = attr_values["color"]
            elif "_size" in key_lower and attr_values.get("size"):
                updated_value = attr_values["size"]
            updated_pairs.append((key, updated_value))

        normalized_query = urlencode(updated_pairs)
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, normalized_query, parsed.fragment))

    def _demandware_attr_display_values(self, html_text: str) -> dict[str, dict[str, str]]:
        attr_display_values: dict[str, dict[str, str]] = {"color": {}, "size": {}}

        color_buttons = re.findall(
            r"<button[^>]+aria-label=[\"']Select Color ([^\"']+)[\"'][^>]*>(.*?)</button>",
            html_text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        for display_value, button_html in color_buttons:
            attr_value_match = re.search(r"data-attr-value=[\"']([^\"']+)[\"']", button_html, flags=re.IGNORECASE)
            if attr_value_match:
                attr_display_values["color"][attr_value_match.group(1)] = self.clean_text(display_value)

        size_buttons = re.findall(
            r"<button[^>]+data-attr-id=[\"']size[\"'][^>]*data-attr-value=[\"']([^\"']+)[\"'][^>]*>(.*?)</button>",
            html_text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        for attr_value, button_html in size_buttons:
            display_value = self.clean_text(re.sub(r"<[^>]+>", " ", button_html))
            if display_value:
                attr_display_values["size"][attr_value] = display_value

        return attr_display_values

    def extract_demandware_variant_candidates(
        self,
        html_text: str,
        source_url: str,
        expected_name: Optional[str],
    ) -> list[dict[str, Any]]:
        """Extract Demandware variation endpoint candidates from a family page."""
        if not isinstance(html_text, str) or "Product-Variation" not in html_text:
            return []

        expected_variant_keywords = self.normalized_variant_keywords(expected_name)
        expected_measure_tokens = self._matching.extract_variant_tokens(expected_name)
        display_values = self._demandware_attr_display_values(html_text)

        candidates: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for raw_variation_url in self._DEMANDWARE_VARIATION_URL_PATTERN.findall(html_text):
            resolved_url = html_module.unescape(raw_variation_url)
            if resolved_url.startswith("/"):
                resolved_url = urljoin(source_url, resolved_url)

            parsed = urlparse(resolved_url)
            params = dict(parse_qsl(parsed.query, keep_blank_values=True))
            attr_values: dict[str, str] = {}
            for key, value in params.items():
                key_lower = key.lower()
                if "_color" in key_lower and value:
                    attr_values["color"] = value
                elif "_size" in key_lower and value:
                    attr_values["size"] = value

            if not attr_values:
                continue

            candidate_url = self._merge_variant_url(resolved_url, attr_values)
            canonical_candidate_url = self.canonicalize_url(candidate_url)
            if not canonical_candidate_url or canonical_candidate_url in seen_urls:
                continue
            seen_urls.add(canonical_candidate_url)

            color_value = display_values["color"].get(attr_values.get("color", ""), "")
            size_value = display_values["size"].get(attr_values.get("size", ""), attr_values.get("size", ""))
            variant_text = " ".join(value for value in [color_value, size_value] if value)
            variant_keywords = self.normalized_variant_keywords(variant_text)
            measure_tokens = self._matching.extract_variant_tokens(variant_text)

            score = 0.0
            if variant_keywords and expected_variant_keywords:
                score += float(len(expected_variant_keywords.intersection(variant_keywords))) * 5.0
            if expected_measure_tokens and measure_tokens:
                score += float(len(expected_measure_tokens.intersection(measure_tokens))) * 4.0
            if self._matching.has_conflicting_variant_tokens(expected_name, variant_text):
                score -= 8.0

            candidates.append(
                {
                    "url": candidate_url,
                    "variant_text": variant_text,
                    "score": score,
                    "attr_values": attr_values,
                }
            )

        candidates.sort(key=lambda candidate: float(candidate.get("score", 0.0)), reverse=True)
        return candidates

    def selected_demandware_variant_id(self, payload: dict[str, Any]) -> str:
        product = payload.get("product") if isinstance(payload, dict) else None
        if not isinstance(product, dict):
            return ""

        for candidate in [
            product.get("upc"),
            product.get("id"),
            product.get("productForUrl"),
            product.get("gtmData", {}).get("variant") if isinstance(product.get("gtmData"), dict) else None,
            product.get("gtmGA4Data", {}).get("item_variant") if isinstance(product.get("gtmGA4Data"), dict) else None,
        ]:
            normalized = self.clean_text(candidate)
            if normalized:
                return normalized
        return ""

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
            self._matching.normalize_token_text(product_name) if hasattr(self, "_matching") else self._normalize_lookup_token(product_name)
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

        combined = " ".join(part for part in [candidate_name or "", description or "", expected_name or "", source_url or ""] if part).lower()
        if "lake valley" in combined or "lkvll" in combined:
            return "Lake Valley Seed"
        if "lv seed" in combined:
            return "Lake Valley Seed"
        if (" seed pack lv" in combined or " seed herb lv" in combined or " seed vegetable lv" in combined) and "lake valley" not in combined:
            return "Lake Valley Seed"
        inferred_prefix_brand = self._matching.infer_brand_prefix(candidate_name or description, expected_name, source_url)
        if inferred_prefix_brand:
            return inferred_prefix_brand
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

        # Protein/flavor tokens that are valid categories for livestock/feed
        # but must NOT be used as categories in pet-food context.
        PROTEIN_AS_CATEGORY_TOKENS = {"poultry", "chicken", "beef", "salmon", "turkey", "fish", "lamb", "duck"}
        _PET_FOOD_SIGNALS = {"dog", "cat", "puppy", "kitten", "canine", "feline", "pet", "cats", "dogs"}
        _FOOD_PRODUCT_TOKENS = {"food", "kibble", "meal", "recipe", "formula", "diet", "broth", "treat", "treats", "nutrition", "pate", "pâté", "stew"}
        _is_pet_food = bool(_PET_FOOD_SIGNALS.intersection(combined_tokens))
        # Broader food-context: protein token + food token = food product (not category)
        _is_food_product = bool(
            PROTEIN_AS_CATEGORY_TOKENS.intersection(combined_tokens)
            and _FOOD_PRODUCT_TOKENS.intersection(combined_tokens)
        )

        poultry_tokens = {"hen", "duck", "chicken", "poultry", "goose", "geese"}
        if poultry_tokens.intersection(combined_tokens):
            # In pet-food or food-product context, poultry tokens indicate protein/flavor, not category.
            if not _is_pet_food and not _is_food_product:
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

    # ------------------------------------------------------------------
    # Deterministic field derivation from product name / context
    # ------------------------------------------------------------------

    _WEIGHT_PATTERN = re.compile(
        r"\b(\d+(?:\.\d+)?)\s*(lb|lbs|pound|pounds|oz|ounce|ounces|kg|g|gram|grams)\b",
        flags=re.IGNORECASE,
    )

    _SPECIES_KEYWORDS: dict[tuple[str, ...], str] = {
        ("dog", "dogs", "puppy", "puppies", "canine"): "Dog",
        ("cat", "cats", "kitten", "kittens", "feline"): "Cat",
    }

    _FOOD_FORM_KEYWORDS: dict[tuple[str, ...], str] = {
        ("kibble", "dry food", "dry dog food", "dry cat food", "dry kibble"): "Dry Food",
        ("p\u00e2t\u00e9", "pate", "wet food", "canned", "stew", "gravy", "shreds", "flaked", "loaf"): "Wet Food",
        ("freeze-dried", "freeze dried", "raw food", "dehydrated", "air-dried"): "Raw",
        ("treat", "treats", "biscuit", "biscuits", "chew", "chews", "bone", "bones"): "Treat",
    }

    _FLAVOR_TOKENS: dict[str, str] = {
        "chicken": "Chicken",
        "salmon": "Salmon",
        "beef": "Beef",
        "turkey": "Turkey",
        "lamb": "Lamb",
        "duck": "Duck",
        "pork": "Pork",
        "venison": "Venison",
        "whitefish": "Whitefish",
        "tuna": "Tuna",
        "fish": "Whitefish",
        "bison": "Bison",
        "rabbit": "Rabbit",
        "kangaroo": "Kangaroo",
        "mackerel": "Mackerel",
        "sardine": "Sardine",
        "herring": "Herring",
    }

    def derive_product_context_fields(
        self,
        *,
        product_name: str | None,
        expected_name: str | None,
        categories: list[str] | None,
        source_url: str,
        brand: str | None = None,
    ) -> dict[str, Any]:
        """Derive product fields from name/title heuristics.

        Only fills fields that can be confidently determined from the
        product name, categories, or URL. Never guesses.

        Returns a dict with keys: ``weight``, ``species``, ``food_form``,
        ``flavor``, ``field_sources`` (provenance tracking per field).
        """
        result: dict[str, Any] = {}
        field_sources: dict[str, str] = {}

        # Consider both the extracted product_name and the expected_name
        # (which may come from the caller / dataset). Prefer expected_name
        # if product_name is very short, but both are checked.
        name = str(product_name or expected_name or "")
        alt_name = str(expected_name or product_name or "")
        combined_names = f"{name} {alt_name}"

        lower_combined = combined_names.lower()

        # ---- weight ----
        for candidate in (name, alt_name, combined_names):
            match = self._WEIGHT_PATTERN.search(candidate)
            if match:
                val, unit = match.group(1), match.group(2).lower()
                # Normalize unit
                if unit in ("pounds", "pound"):
                    unit = "lb"
                elif unit in ("ounce", "ounces"):
                    unit = "oz"
                elif unit in ("gram", "grams"):
                    unit = "g"
                elif unit in ("kilogram", "kilograms"):
                    unit = "kg"
                result["weight"] = f"{val} {unit}"
                field_sources["weight"] = "derived_from_product_name"
                break

        # ---- species ----
        species_source = None
        for tokens, species_val in self._SPECIES_KEYWORDS.items():
            if any(t in lower_combined for t in tokens):
                result["species"] = species_val
                species_source = "derived_from_product_name"
                break
        if "species" not in result and categories:
            cat_combined = " ".join(c.lower() for c in categories if c)
            for tokens, species_val in self._SPECIES_KEYWORDS.items():
                if any(t in cat_combined for t in tokens):
                    result["species"] = species_val
                    species_source = "derived_from_categories"
                    break
        if species_source:
            field_sources["species"] = species_source

        # ---- food_form ----
        form_source = None
        # Search in combined names first
        for tokens, form_val in self._FOOD_FORM_KEYWORDS.items():
            if any(t in lower_combined for t in tokens):
                result["food_form"] = form_val
                form_source = "derived_from_product_name"
                break
        if "food_form" not in result and categories:
            cat_combined = " ".join(c.lower() for c in categories if c)
            for tokens, form_val in self._FOOD_FORM_KEYWORDS.items():
                if any(t in cat_combined for t in tokens):
                    result["food_form"] = form_val
                    form_source = "derived_from_categories"
                    break
        if form_source:
            field_sources["food_form"] = form_source

        # ---- flavor / primary_protein ----
        flavor_tokens_found: list[str] = []
        if brand:
            brand_norm = brand.strip().lower()
        else:
            brand_norm = None

        for token_key, flavor_val in self._FLAVOR_TOKENS.items():
            if token_key in lower_combined:
                # Skip flavor tokens that appear in the brand name
                if brand_norm and token_key in brand_norm:
                    continue
                if flavor_val not in flavor_tokens_found:
                    flavor_tokens_found.append(flavor_val)

        if flavor_tokens_found:
            flavor_str = " & ".join(flavor_tokens_found)
            result["flavor"] = flavor_str
            result["primary_protein"] = flavor_tokens_found[0]
            field_sources["flavor"] = "derived_from_product_name"
            field_sources["primary_protein"] = "derived_from_product_name"

        if field_sources:
            result["field_sources"] = field_sources

        return result

    def extract_product_from_html_jsonld(
        self,
        html_text: str,
        source_url: str,
        upc: str,
        product_name: Optional[str],
        brand: Optional[str],
        matching_utils,
    ) -> Optional[dict[str, Any]]:
        """Extract product data from JSON-LD structured data."""
        if not isinstance(html_text, str):
            return None

        stripped = html_text.strip()
        if stripped.startswith("{") and '"product"' in stripped:
            try:
                demandware_payload = json.loads(stripped)
            except json.JSONDecodeError:
                demandware_payload = None
            if isinstance(demandware_payload, dict):
                demandware_product = demandware_payload.get("product")
                if isinstance(demandware_product, dict):
                    product_name_value = self.normalize_product_title(demandware_product.get("productName") or demandware_product.get("productDisplayName"))
                    short_description = self.clean_description_text(demandware_product.get("shortDescription"))
                    if not short_description:
                        short_description = self.clean_description_text(demandware_product.get("pageDescription"))

                    resolved_brand = self.infer_brand(
                        explicit_brand=demandware_product.get("brand") or brand,
                        candidate_name=product_name_value,
                        description=short_description,
                        source_url=source_url,
                        expected_name=product_name,
                    )
                    image_values = []
                    images_payload = demandware_product.get("images")
                    if isinstance(images_payload, dict):
                        for bucket in ("large", "small"):
                            image_values.extend(self.extract_image_urls(images_payload.get(bucket)))
                    normalized_images = self.normalize_images(image_values, source_url)

                    variation_attributes = demandware_product.get("variationAttributes")
                    explicit_categories = None
                    if isinstance(variation_attributes, list):
                        explicit_categories = []

                    size_source = " ".join(
                        part
                        for part in [
                            product_name_value,
                            short_description,
                            self.clean_text(demandware_product.get("selectedProductUrl")),
                        ]
                        if part
                    )
                    size_metrics = self.extract_size_metrics(size_source)

                    categories = self.infer_categories(
                        html_text="",
                        source_url=source_url,
                        candidate_name=product_name_value,
                        expected_name=product_name,
                        explicit_categories=explicit_categories,
                        explicit_brand=resolved_brand or brand,
                    )

                    sku_value = self.clean_text(
                        demandware_product.get("upc")
                        or demandware_product.get("id")
                        or demandware_product.get("productForUrl")
                        or demandware_product.get("gtmData", {}).get("variant")
                        if isinstance(demandware_product.get("gtmData"), dict)
                        else ""
                    )

                    score = 0.0
                    combined = " ".join(
                        [
                            product_name_value,
                            short_description,
                            sku_value,
                            self.clean_text(demandware_product.get("selectedProductUrl")),
                        ]
                    )
                    if upc and upc.lower() in combined.lower():
                        score += 5.0
                    if brand and matching_utils.is_brand_match(brand, resolved_brand, source_url):
                        score += 3.0
                    if product_name and matching_utils.is_name_match(product_name, product_name_value):
                        score += 3.0
                    if product_name and matching_utils.has_variant_token_overlap(product_name, combined):
                        score += 3.0

                    filled_fields = sum(
                        1
                        for value in [
                            product_name_value,
                            resolved_brand,
                            short_description,
                            size_metrics,
                            normalized_images,
                            categories,
                        ]
                        if value
                    )
                    confidence = max(0.7, min(0.99, (filled_fields / 6.0) + (score / 14.0)))

                    return {
                        "success": True,
                        "product_name": product_name_value,
                        "brand": resolved_brand,
                        "description": short_description,
                        "size_metrics": size_metrics,
                        "images": normalized_images,
                        "categories": categories,
                        "confidence": confidence,
                        "url": urljoin(source_url, str(demandware_product.get("selectedProductUrl") or "").strip()) or source_url,
                        "resolved_variant": {
                            "resolver": "demandware_product_variation",
                            "variant_id": sku_value,
                        },
                    }

        candidates: list[dict[str, Any]] = []
        for current in self._iter_jsonld_nodes(html_text):
            node_type = current.get("@type")
            node_types = node_type if isinstance(node_type, list) else [node_type]
            normalized_types = {str(item).lower() for item in node_types if item}
            if "product" not in normalized_types:
                continue

            name_value = self.normalize_product_title(current.get("name"))
            description_value = self.clean_description_text(current.get("description"))
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
            sku_value = self.clean_text(current.get("upc") or current.get("mpn") or current.get("productId") or current.get("gtin12"))

            score = 0.0
            if upc and upc.lower() in f"{sku_value} {description_value} {name_value}".lower():
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

    # Microdata tag-name pattern: captures names of HTML elements and closing tags
    _MICRODATA_TAG_PATTERN = re.compile(r'</?([a-zA-Z][a-zA-Z0-9]*)\b', flags=re.IGNORECASE)
    _MICRODATA_PRODUCT_TYPE = re.compile(
        r'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*itemtype=["\'](?:https?://)?schema\.org/Product["\'][^>]*>',
        flags=re.IGNORECASE,
    )

    @classmethod
    def _extract_microdata_scope(cls, html_text: str, start_pos: int, tag_name: str) -> str:
        """Extract the full HTML of an itemscope element by tracking tag-nesting depth.

        Starts just after the opening tag at ``start_pos`` and walks forward
        counting ``<tag_name`` opens vs ``</tag_name>`` closes until the
        matching close is found.  Self-closing tags (<tag ... />) count as
        one open + one close.
        """
        depth = 1
        pos = start_pos
        tag_lower = tag_name.lower()
        # Avoid matching shorter tag names by accident (e.g. <div> vs <divider>)
        open_re = re.compile(rf'<{re.escape(tag_name)}\b', flags=re.IGNORECASE)
        close_re = re.compile(rf'</{re.escape(tag_name)}\b', flags=re.IGNORECASE)
        self_close_re = re.compile(rf'<{re.escape(tag_name)}\b[^>]*/>', flags=re.IGNORECASE)

        while depth > 0 and pos < len(html_text):
            next_open = open_re.search(html_text, pos)
            next_close = close_re.search(html_text, pos)
            next_self_close = self_close_re.search(html_text, pos)

            # Choose the earliest match
            candidates: list[tuple[int, int]] = []
            if next_open:
                candidates.append((next_open.start(), 1))   # open
            if next_close:
                candidates.append((next_close.start(), -1))  # close
            if next_self_close:
                candidates.append((next_self_close.start(), 0))  # self-close (net zero)

            if not candidates:
                break  # No more matches — return what we have

            candidates.sort(key=lambda x: x[0])
            match_pos, delta = candidates[0]

            if delta == 0:
                # Self-closing: depth unchanged, advance past it
                pos = match_pos + len(next_self_close.group(0)) if next_self_close else match_pos + 1
            elif delta == 1:
                depth += 1
                pos = match_pos + len(next_open.group(0)) if next_open else match_pos + 1
            else:
                depth -= 1
                pos = next_close.end() if next_close else match_pos + 1

        return html_text[start_pos:pos]

    def extract_product_from_html_microdata(
        self,
        html_text: str,
        source_url: str,
        upc: str,
        product_name: Optional[str],
        brand: Optional[str],
        matching_utils,
    ) -> Optional[dict[str, Any]]:
        """Extract product data from Schema.org microdata (itemscope/itemtype).

        Complements JSON-LD parsing for sites that use microdata instead of
        JSON-LD.  Handles nested itemscope elements correctly by tracking
        tag-nesting depth.

        Returns None when no Product microdata is found or extraction fails.
        """
        if not isinstance(html_text, str) or not html_text.strip():
            return None

        # ---- Locate Product itemscope elements ----
        product_scopes: list[tuple[int, int, str, str]] = []
        # (start, end, tag_name, full_scope_html)

        for match in self._MICRODATA_PRODUCT_TYPE.finditer(html_text):
            tag_name = match.group(1)
            # match.start() is the start of the opening tag;
            # match.end() is right after the closing > of the opening tag
            scope_start = match.end()
            scope_html_body = self._extract_microdata_scope(html_text, scope_start, tag_name)
            # Reconstruct full element including opening tag for attribute lookups
            full_scope = html_text[match.start():scope_start] + scope_html_body
            product_scopes.append((match.start(), scope_start + len(scope_html_body), tag_name, full_scope))

        # Extract the text content of an itemprop element, handling nested tags
        # by tracking tag-nesting depth so we find the matching close.
        def _itemprop_text(scope: str, prop: str) -> str:
            open_m = re.search(
                rf'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*itemprop=["\']{re.escape(prop)}["\'][^>]*>',
                scope, flags=re.IGNORECASE,
            )
            if not open_m:
                return ""
            tag_name = open_m.group(1)
            body_start = open_m.end()
            depth = 1
            pos = body_start
            open_re = re.compile(rf'<{re.escape(tag_name)}\b', flags=re.IGNORECASE)
            close_re = re.compile(rf'</{re.escape(tag_name)}\b', flags=re.IGNORECASE)
            while depth > 0 and pos < len(scope):
                no = open_re.search(scope, pos)
                nc = close_re.search(scope, pos)
                if nc is None:
                    break
                if no and no.start() < nc.start():
                    depth += 1
                    pos = no.end()
                else:
                    depth -= 1
                    if depth == 0:
                        return scope[body_start:nc.start()]
                    pos = nc.end()
            return ""

        # Extract the raw HTML subtree of an itemprop element (for nested itemscope
        # lookups like itemprop="brand" containing itemprop="name").
        def _itemprop_subtree(scope: str, prop: str) -> str:
            open_m = re.search(
                rf'<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*itemprop=["\']{re.escape(prop)}["\'][^>]*>',
                scope, flags=re.IGNORECASE,
            )
            if not open_m:
                return ""
            tag_name = open_m.group(1)
            body_start = open_m.end()
            depth = 1
            pos = body_start
            open_re = re.compile(rf'<{re.escape(tag_name)}\b', flags=re.IGNORECASE)
            close_re = re.compile(rf'</{re.escape(tag_name)}\b', flags=re.IGNORECASE)
            while depth > 0 and pos < len(scope):
                no = open_re.search(scope, pos)
                nc = close_re.search(scope, pos)
                if nc is None:
                    break
                if no and no.start() < nc.start():
                    depth += 1
                    pos = no.end()
                else:
                    depth -= 1
                    if depth == 0:
                        return scope[open_m.start():nc.end()]
                    pos = nc.end()
            return ""

        def _itemprop_attr(scope: str, prop: str, attr: str) -> Optional[str]:
            m = re.search(
                rf'<[^>]*itemprop=["\']{re.escape(prop)}["\'][^>]+{re.escape(attr)}=["\']([^"\']+)["\']',
                scope, flags=re.IGNORECASE,
            )
            return m.group(1) if m else None

        def _itemprop_content(scope: str, prop: str) -> Optional[str]:
            return _itemprop_attr(scope, prop, "content")

        def _itemprop_src(scope: str, prop: str) -> Optional[str]:
            return _itemprop_attr(scope, prop, "src")

        def _itemprop_href(scope: str, prop: str) -> Optional[str]:
            return _itemprop_attr(scope, prop, "href")

        candidates: list[dict[str, Any]] = []
        for _, _, _, scope_html in product_scopes:
            if not scope_html or not scope_html.strip():
                continue

            # ---- itemprop="name" ----
            name_raw = _itemprop_text(scope_html, "name")
            name_value = self.normalize_product_title(name_raw)
            if not name_value:
                continue

            # ---- itemprop="brand" ----
            brand_value = ""
            # Check content attribute first (e.g. <meta itemprop="brand" content="Acme">)
            brand_content = _itemprop_content(scope_html, "brand")
            if brand_content:
                brand_value = self.clean_text(brand_content)
            if not brand_value:
                # Brand may be inline text or in a nested itemscope:
                # <div itemprop="brand">Acme</div>
                # <div itemprop="brand" itemscope><span itemprop="name">Acme</span></div>
                brand_subtree = _itemprop_subtree(scope_html, "brand")
                if brand_subtree:
                    # First try to find itemprop="name" within the brand subtree
                    inner_name = _itemprop_text(brand_subtree, "name")
                    if inner_name:
                        brand_value = self.clean_text(inner_name)
                    else:
                        # Fall back to the direct text within the brand element
                        brand_value = self.clean_text(_itemprop_text(scope_html, "brand"))

            # ---- itemprop="description" ----
            desc_raw = _itemprop_text(scope_html, "description")
            description_value = self.clean_description_text(desc_raw) if desc_raw else ""

            # ---- itemprop="image" ----
            image_value: str | None = None
            for extractor in (_itemprop_content, _itemprop_src, _itemprop_href):
                image_value = extractor(scope_html, "image")
                if image_value:
                    break

            # ---- Validation: name match against expected product ----
            if product_name and not matching_utils.is_contextual_product_name_match(
                product_name, name_value, brand, source_url
            ):
                continue

            resolved_brand = self.infer_brand(
                explicit_brand=brand_value or brand,
                candidate_name=name_value,
                description=description_value,
                source_url=source_url,
                expected_name=product_name,
            )

            if brand and not matching_utils.is_brand_match(brand, resolved_brand or name_value, source_url):
                continue

            images = self.normalize_images([image_value], source_url) if image_value else []
            if not images:
                continue

            categories = self.infer_categories(
                html_text=html_text,
                source_url=source_url,
                candidate_name=name_value,
                expected_name=product_name,
                explicit_brand=resolved_brand or brand,
            )
            size_source = f"{name_value} {self.strip_instructional_copy(description_value)}"
            size_metrics = self.extract_size_metrics(size_source)

            # ---- Scoring ----
            score = 0.0
            combined = f"{name_value} {description_value} {scope_html[:500]}".lower()
            if upc and upc.lower() in combined:
                score += 4.0
            if brand and matching_utils.is_brand_match(brand, resolved_brand, source_url):
                score += 3.0
            if product_name and matching_utils.is_name_match(product_name, name_value):
                score += 3.0
            if categories:
                score += 1.0

            filled_fields = sum(
                1
                for value in [
                    name_value,
                    resolved_brand,
                    description_value,
                    size_metrics,
                    images,
                    categories,
                ]
                if value
            )
            confidence = max(0.55, min(0.98, (filled_fields / 6.0) + (score / 12.0)))

            candidates.append(
                {
                    "success": True,
                    "product_name": name_value,
                    "brand": resolved_brand or "",
                    "description": description_value,
                    "size_metrics": size_metrics,
                    "images": images,
                    "categories": categories,
                    "confidence": confidence,
                    "url": source_url,
                    "source": "microdata",
                    "_score": score,
                }
            )

        if not candidates:
            return None

        candidates.sort(key=lambda c: float(c.get("_score", 0)), reverse=True)
        best = dict(candidates[0])
        best.pop("_score", None)
        return best
