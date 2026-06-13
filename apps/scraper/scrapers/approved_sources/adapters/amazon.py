"""Amazon Adapter for direct headless scraping.

This adapter searches Amazon directly using Crawl4AI, parses the search results
for the first organic PDP link, and extracts the product data from the rendered
PDP HTML.

Amazon's current PDP markup stores gallery images and many detail fields on
wrapper elements instead of only on the visible <img> tags, so relying on a
simple CSS extraction strategy tends to return only the primary image and the
first bullet. Parsing the rendered HTML directly lets us recover the full image
set, bullet-based description, and weight/dimensions metadata.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import urllib.parse
from html import unescape
from typing import Any, Iterable

from bs4 import BeautifulSoup
from crawl4ai import CacheMode, CrawlerRunConfig

from scrapers.approved_sources.adapters.base import ApprovedSourceAdapter, get_shared_browser_engine
from scrapers.approved_sources.anti_bot import (
    detect_bot_block,
    retry_with_backoff,
)
from scrapers.ai_search.enrichment_models import (
    EnrichmentResultV1,
    build_v1_from_extraction_result,
)

logger = logging.getLogger(__name__)

_DETAIL_ROW_SELECTORS = (
    "#detailBullets_feature_div li",
    "#detailBulletsWrapper_feature_div li",
    "#productDetails_detailBullets_sections1 tr",
    "#productDetails_techSpec_section_1 tr",
    "#prodDetails tr",
    "table.a-keyvalue tr",
)

_IMAGE_NODE_SELECTORS = (
    "#landingImage",
    "#imageBlock_feature_div [data-old-hires]",
    "#imageBlock_feature_div [hires]",
    "#imageBlock_feature_div [data-a-dynamic-image]",
    "#imageBlock_feature_div img",
    "#imageBlock [data-old-hires]",
    "#imageBlock [hires]",
    "#imageBlock [data-a-dynamic-image]",
    "#imageBlock img",
    "#altImages [data-old-hires]",
    "#altImages [hires]",
    "#altImages [data-a-dynamic-image]",
    "#altImages img",
)


def _collapse_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _unique_nonempty(values: Iterable[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()

    for value in values:
        normalized = _collapse_text(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)

    return deduped


class AmazonAdapter(ApprovedSourceAdapter):
    """Amazon search and extraction adapter."""

    adapter_slug = "amazon"
    source_slug = "amazon"
    source_type = "marketplace"

    @staticmethod
    def _clean_brand(raw_brand: str) -> str:
        brand = _collapse_text(raw_brand)
        if not brand:
            return ""

        if "visit the" in brand.lower():
            match = re.search(r"(?i)visit the\s+(.+?)\s+store", brand)
            if match:
                return _collapse_text(match.group(1))
        if "brand:" in brand.lower():
            match = re.search(r"(?i)brand:\s+(.+)", brand)
            if match:
                return _collapse_text(match.group(1))

        return brand

    @staticmethod
    def _first_text(soup: BeautifulSoup, selectors: Iterable[str]) -> str:
        for selector in selectors:
            for element in soup.select(selector):
                text = _collapse_text(element.get_text(" ", strip=True))
                if text:
                    return text
        return ""

    @staticmethod
    def _text_list(soup: BeautifulSoup, selectors: Iterable[str]) -> list[str]:
        values: list[str] = []
        for selector in selectors:
            for element in soup.select(selector):
                text = _collapse_text(element.get_text(" ", strip=True))
                if text:
                    values.append(text)
        return _unique_nonempty(values)

    @staticmethod
    def _iter_detail_rows(soup: BeautifulSoup) -> list[tuple[str, str]]:
        rows: list[tuple[str, str]] = []

        for selector in _DETAIL_ROW_SELECTORS:
            for row in soup.select(selector):
                cells = row.find_all(["th", "td"])
                if len(cells) >= 2:
                    label = _collapse_text(cells[0].get_text(" ", strip=True))
                    value = _collapse_text(cells[1].get_text(" ", strip=True))
                    if label and value:
                        rows.append((label, value))
                    continue

                text = _collapse_text(row.get_text(" ", strip=True))
                if not text:
                    continue

                text = re.sub(r"[\u200e\u200f]+", " ", text)
                text = _collapse_text(text)
                if ":" in text:
                    label, value = text.split(":", 1)
                    label = _collapse_text(label)
                    value = _collapse_text(value)
                    if label and value:
                        rows.append((label, value))

        return rows

    @classmethod
    def _find_detail_value(cls, soup: BeautifulSoup, labels: Iterable[str]) -> str:
        normalized_labels = [label.lower() for label in labels]

        for label_text, value in cls._iter_detail_rows(soup):
            normalized_label = label_text.lower()
            if any(label in normalized_label for label in normalized_labels):
                return value

        return ""

    @staticmethod
    def _normalize_image_url(img_url: str | None) -> str | None:
        if not isinstance(img_url, str):
            return None

        cleaned = unescape(img_url).strip()
        if not cleaned:
            return None
        if not cleaned.startswith(("http://", "https://")):
            return None

        lowered = cleaned.lower()
        if any(token in lowered for token in (
            "grey-pixel",
            "transparent-pixel",
            "play-icon-overlay",
            "sprite",
            "nav-sprite",
            "/sash/",
            "fls-na.amazon.com",
            "uedata",
            "analytics",
        )):
            return None
        if lowered.endswith(".svg") or lowered.endswith(".gif"):
            return None

        # Ensure we only match links with valid image file extensions
        parsed_url = urllib.parse.urlparse(lowered)
        path = parsed_url.path
        if not any(path.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
            return None

        # Only normalize images from Amazon domains
        if any(domain in lowered for domain in ("media-amazon.com", "images-amazon.com")):
            # 1. Strip any existing resolution tokens (case-insensitive)
            base = re.sub(r"\._[a-zA-Z0-9+_,-]+_", "", cleaned)
            # 2. Consistently apply the high-resolution token
            return re.sub(r"\.([a-zA-Z0-9]+)$", r"._AC_SL1500_.\1", base)

        return cleaned

    @staticmethod
    def _extract_balanced_json_array(text: str, start: int) -> str | None:
        """Extract a balanced JSON array starting at text[start] == '['."""
        if start >= len(text) or text[start] != "[":
            return None
        depth = 0
        in_string = False
        escape_next = False
        for i in range(start, len(text)):
            ch = text[i]
            if escape_next:
                escape_next = False
                continue
            if ch == "\\":
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        return None

    @classmethod
    def _extract_colorimages_from_scripts(cls, soup: BeautifulSoup) -> list[str]:
        """Extract image URLs from Amazon's embedded colorImages JavaScript data.

        Amazon PDP pages embed the complete image gallery (including images only
        visible after clicking the "4+ more" modal) in a JavaScript variable:

            'colorImages': { 'initial': [
                {"hiRes": "https://...", "large": "https://...", ...},
                ...
            ]}

        Parsing this gives us every product image without any browser
        interaction or modal clicking.
        """
        image_urls: list[str] = []
        seen: set[str] = set()

        def add(candidate: str | None) -> None:
            normalized = cls._normalize_image_url(candidate)
            if not normalized or normalized in seen:
                return
            seen.add(normalized)
            image_urls.append(normalized)

        # Find the 'initial' array start after colorImages
        initial_re = re.compile(
            r"""['"]colorImages['"]"""
            r"""\s*:\s*\{\s*['"]initial['"]"""
            r"""\s*:\s*""",
        )

        for script in soup.find_all("script"):
            text = script.string
            if not text or "colorImages" not in text:
                continue

            match = initial_re.search(text)
            if not match:
                continue

            # Use bracket counting to extract the balanced JSON array
            array_str = cls._extract_balanced_json_array(text, match.end())
            if not array_str:
                continue

            try:
                entries = json.loads(array_str)
            except json.JSONDecodeError:
                continue

            if not isinstance(entries, list):
                continue

            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                # Prefer hiRes, then large, then main (skip main dicts)
                for key in ("hiRes", "large"):
                    url = entry.get(key)
                    if isinstance(url, str) and url:
                        add(url)
                        break  # one URL per entry, best resolution first

        return image_urls

    @classmethod
    def _extract_image_urls(cls, soup: BeautifulSoup) -> list[str]:
        """Extract product image URLs, preferring the JS gallery data.

        First attempts to extract from the embedded colorImages JavaScript
        data (complete gallery). Falls back to DOM element attributes if the
        script data is not found (e.g. bot-mitigated pages that strip JS).
        """
        # Try the comprehensive JS gallery first
        js_images = cls._extract_colorimages_from_scripts(soup)
        if js_images:
            logger.debug(
                "[AmazonAdapter] Extracted %d images from colorImages JS data",
                len(js_images),
            )
            return js_images

        # Fallback: extract from DOM element attributes
        image_urls: list[str] = []
        seen: set[str] = set()

        def add(candidate: str | None) -> None:
            normalized = cls._normalize_image_url(candidate)
            if not normalized or normalized in seen:
                return
            seen.add(normalized)
            image_urls.append(normalized)

        for selector in _IMAGE_NODE_SELECTORS:
            for element in soup.select(selector):
                add(element.get("data-old-hires"))
                add(element.get("hires"))
                add(element.get("src"))

                dynamic_payload = element.get("data-a-dynamic-image")
                if isinstance(dynamic_payload, str):
                    decoded = dynamic_payload.strip()
                    if decoded and decoded != "{}":
                        try:
                            parsed = json.loads(unescape(decoded))
                        except json.JSONDecodeError:
                            parsed = None
                        if isinstance(parsed, dict):
                            for dynamic_url in parsed.keys():
                                if isinstance(dynamic_url, str):
                                    add(dynamic_url)

        return image_urls

    @classmethod
    def _extract_bullets(cls, soup: BeautifulSoup) -> list[str]:
        bullets = cls._text_list(
            soup,
            [
                "#feature-bullets li span",
                "#feature-bullets ul li span",
            ],
        )
        return [
            bullet
            for bullet in bullets
            if bullet.lower() not in {"about this item", "report an issue with this product or seller"}
        ]

    @classmethod
    def _extract_description(cls, soup: BeautifulSoup) -> tuple[str, list[str]]:
        description_blocks = cls._text_list(
            soup,
            [
                "#productDescription p",
                "#productDescription",
                "#productDescription_feature_div p",
                "#productDescription_feature_div",
            ],
        )
        bullets = cls._extract_bullets(soup)

        if not description_blocks and not bullets:
            description_blocks = cls._text_list(soup, ["#aplus p"])[:3]

        description_parts = list(description_blocks)
        if bullets:
            description_parts.append("\n".join(bullets))

        return "\n\n".join(description_parts).strip(), bullets

    def _apply_allowed_fields(self, product_fields: dict[str, Any]) -> dict[str, Any]:
        if not self.entry.allowedFields:
            return product_fields

        allowed = set(self.entry.allowedFields)
        if "images" in allowed:
            allowed.add("image_urls")

        return {
            key: value
            for key, value in product_fields.items()
            if key in allowed
        }

    def _extract_product_fields_from_html(self, html: str, upc: str) -> dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")

        name = self._first_text(
            soup,
            [
                "#productTitle",
                "#title",
                "#productTitle_feature_div h1",
            ],
        )
        raw_brand = self._first_text(
            soup,
            [
                "#bylineInfo",
                "#brand",
                "#bylineInfo_feature_div",
            ],
        )
        brand = self._clean_brand(raw_brand)
        description, bullets = self._extract_description(soup)
        image_urls = self._extract_image_urls(soup)
        weight = self._find_detail_value(
            soup,
            [
                "item weight",
                "shipping weight",
                "product weight",
            ],
        )
        dimensions = self._find_detail_value(
            soup,
            [
                "product dimensions",
                "package dimensions",
            ],
        )

        return {
            key: value
            for key, value in {
                "name": name,
                "brand": brand,
                "description": description,
                "image_urls": image_urls,
                "upc": upc,
                "weight": weight,
                "dimensions": dimensions,
                "features": bullets,
            }.items()
            if value not in (None, "", [], {})
        }

    # Module-level lock to serialize Amazon search requests and avoid
    # concurrent crawls triggering bot detection.
    _search_lock = asyncio.Lock()

    async def _crawl_search_with_retry(
        self, engine: Any, search_url: str, config: CrawlerRunConfig, max_retries: int = 2,
    ) -> Any:
        """Crawl a search URL with retry + exponential backoff.

        Amazon aggressively blocks concurrent headless requests. This method
        serialises search requests through a class-level lock and retries on
        failure with jittered backoff to recover from transient bot blocks.

        Uses the shared retry_with_backoff utility from anti_bot module.
        """

        async def _single_attempt() -> Any:
            async with self._search_lock:
                result = await engine.crawler.arun(url=search_url, config=config)
            if not result or not result.success or not result.html:
                raise RuntimeError(f"Crawl failed for {search_url}")
            return result

        try:
            return await retry_with_backoff(
                _single_attempt,
                max_retries=max_retries,
                base_delay=2.0,
                label=f"AmazonAdapter search {search_url}",
            )
        except Exception:
            # Return None on exhausted retries instead of raising
            return None

    async def extract(self, extractor: Any) -> EnrichmentResultV1 | None:
        upc = self._get_sku()
        if not upc:
            logger.warning("[AmazonAdapter] No UPC provided for extraction.")
            return None

        # Phase 1: Direct Crawl4AI Search with domcontentloaded
        engine = await get_shared_browser_engine()
        search_url = f"https://www.amazon.com/s?k={upc}"

        logger.info("[AmazonAdapter] Searching Amazon for UPC: %s", search_url)
        search_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            wait_until="domcontentloaded",
            page_timeout=20000,
            magic=True,
            simulate_user=True,
            override_navigator=True,
        )

        crawl_result = await self._crawl_search_with_retry(engine, search_url, search_config)

        if not crawl_result or not crawl_result.success or not crawl_result.html:
            logger.warning("[AmazonAdapter] Crawl failed for search URL after retries: %s", search_url)
            return None

        html = crawl_result.html

        # Phase 2: Link Parsing
        soup = BeautifulSoup(html, "html.parser")
        pdp_url = None

        # If the loaded page is already a product detail page, use it directly
        if soup.select_one("#productTitle"):
            pdp_url = search_url
            logger.info("[AmazonAdapter] Search URL is already a PDP page: %s", pdp_url)
        else:
            # Find candidate search result items, filtering out sponsored placements
            result_items = soup.select('div[data-component-type="s-search-result"]')
            if not result_items:
                result_items = [
                    el for el in soup.select('div[data-asin]')
                    if el.get("data-asin")
                ]
            if not result_items:
                result_items = soup.select('.s-result-item')

            for item in result_items:
                classes = [c.lower() for c in item.get("class", [])]

                # Check for sponsored indicators using structural selectors
                is_sponsored = (
                    "adholder" in classes or
                    item.select_one('.puis-sponsored-label-text') is not None or
                    item.select_one('.s-sponsored-label-info-icon') is not None or
                    item.select_one('[data-component-type="sp-sponsored-result"]') is not None
                )
                if is_sponsored:
                    continue

                # Collect product detail page links inside this organic item
                candidate_links = []
                for a_tag in item.find_all("a", href=True):
                    href = a_tag["href"]
                    if (
                        ("/dp/" in href or "/gp/product/" in href)
                        and "/slredirect/" not in href
                        and "customer-reviews" not in href
                    ):
                        score = 0
                        # Prioritize links containing product title headings
                        if a_tag.find(["h2", "h3"]):
                            score += 10
                        if any(c in a_tag.get("class", []) for c in ["a-link-normal", "a-text-normal"]):
                            score += 5
                        candidate_links.append((score, a_tag))

                if candidate_links:
                    # Sort candidates by score descending
                    candidate_links.sort(key=lambda x: x[0], reverse=True)
                    best_a = candidate_links[0][1]
                    href = best_a["href"]

                    if href.startswith("/"):
                        pdp_url = f"https://www.amazon.com{href}"
                    else:
                        pdp_url = href

                    parsed = urllib.parse.urlparse(pdp_url)
                    path_parts = parsed.path.split("/")
                    clean_path = []
                    for part in path_parts:
                        if part.startswith("ref="):
                            break
                        clean_path.append(part)

                    clean_pdp_url = f"https://www.amazon.com{'/'.join(clean_path)}"
                    logger.info("[AmazonAdapter] Found organic PDP URL: %s", clean_pdp_url)
                    pdp_url = clean_pdp_url
                    break

        if not pdp_url:
            # Check for bot block/captcha indicators using shared detection
            block = detect_bot_block(html)

            if block.is_blocked:
                logger.warning(
                    "[AmazonAdapter] Search for UPC %s failed: %s (%s)",
                    upc, block.message, block.block_type,
                )
            else:
                body_text = soup.body.get_text(" ", strip=True).lower() if soup.body else ""
                no_results_patterns = ["no results for", "try checking your spelling", "did not match any products"]
                found_no_results = any(p in body_text for p in no_results_patterns)

                if found_no_results:
                    logger.info(
                        "[AmazonAdapter] Search for UPC %s failed: Genuinely NO RESULTS found on Amazon (product is not listed).",
                        upc,
                    )
                else:
                    logger.warning(
                        "[AmazonAdapter] Search for UPC %s failed: No valid PDP URL found in search results.",
                        upc,
                    )
            return None

        # Phase 3: Crawl PDP and extract from rendered HTML
        logger.info("[AmazonAdapter] Crawling PDP HTML for extraction: %s", pdp_url)

        pdp_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            wait_until="domcontentloaded",
            page_timeout=25000,
            magic=True,
            simulate_user=True,
            override_navigator=True,
        )

        try:
            pdp_result = await engine.crawler.arun(url=pdp_url, config=pdp_config)
            if pdp_result and pdp_result.success and pdp_result.html:
                raw_product_fields = self._extract_product_fields_from_html(pdp_result.html, upc)
                product_fields = self._apply_allowed_fields(raw_product_fields)
                matched_fields = list(product_fields.keys())

                required_fields = ["name", "brand", "description", "image_urls"]
                missing_required = [
                    field
                    for field in required_fields
                    if not raw_product_fields.get(field)
                ]

                if not missing_required:
                    extraction_payload = {
                        "success": True,
                        "product": product_fields,
                        "confidence": 0.95,
                    }

                    logger.info(
                        "[AmazonAdapter] DOM extraction succeeded for UPC: %s (images=%d, weight=%s, dimensions=%s)",
                        upc,
                        len(raw_product_fields.get("image_urls", [])),
                        raw_product_fields.get("weight"),
                        raw_product_fields.get("dimensions"),
                    )

                    return build_v1_from_extraction_result(
                        result=extraction_payload,
                        upc=upc,
                        url=pdp_url,
                        domain="www.amazon.com",
                        model="crawl4ai-dom",
                        mode="structured",
                        decision="deterministic_success",
                        llm_used=False,
                        source_results=[
                            {
                                "sourceSlug": self.source_slug,
                                "sourceType": self.source_type,
                                "confidence": 0.95,
                                "matchedFields": matched_fields,
                                "evidenceUrl": pdp_url,
                            }
                        ],
                    )

                pdp_soup = BeautifulSoup(pdp_result.html, "html.parser")
                pdp_block = detect_bot_block(pdp_result.html)
                if pdp_block.is_blocked:
                    logger.warning(
                        "[AmazonAdapter] PDP crawl for UPC %s failed: %s (%s)",
                        upc, pdp_block.message, pdp_block.block_type,
                    )
                else:
                    logger.warning(
                        "[AmazonAdapter] DOM extraction missing required fields for UPC %s: %s. Falling back to LLM.",
                        upc,
                        ", ".join(missing_required),
                    )
        except Exception as exc:
            logger.warning("[AmazonAdapter] DOM extraction failed with error: %s. Falling back to LLM...", exc)

        # Fallback: Original extraction via generic LLM extractor
        if extractor is not None:
            logger.info("[AmazonAdapter] Falling back to generic LLM extractor for: %s", pdp_url)
            extraction_result = await extractor.extract(
                url=pdp_url,
                upc=upc,
                product_name=self._get_product_name(),
                brand=self._get_brand(),
            )

            if extraction_result and extraction_result.get("success"):
                raw_confidence = extraction_result.get("confidence", 0.0)
                confidence_val = raw_confidence.get("overall", 0.0) if isinstance(raw_confidence, dict) else float(raw_confidence)
                product_data = extraction_result.get("product", extraction_result)
                matched_keys = list(product_data.keys()) if isinstance(product_data, dict) else []

                return build_v1_from_extraction_result(
                    result=extraction_result,
                    upc=upc,
                    url=pdp_url,
                    domain="www.amazon.com",
                    model="deepseek-chat",
                    mode="mixed",
                    decision="llm_fallback",
                    llm_used=True,
                    source_results=[
                        {
                            "sourceSlug": self.source_slug,
                            "sourceType": self.source_type,
                            "confidence": confidence_val,
                            "matchedFields": matched_keys,
                            "evidenceUrl": pdp_url,
                        }
                    ],
                )

        logger.warning("[AmazonAdapter] Extraction failed for PDP URL: %s", pdp_url)
        return None
