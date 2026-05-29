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

import json
import logging
import re
import urllib.parse
from html import unescape
from typing import Any, Iterable

from bs4 import BeautifulSoup
from crawl4ai import CacheMode, CrawlerRunConfig

from scrapers.approved_sources.adapters.base import ApprovedSourceAdapter, get_shared_browser_engine
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
        )):
            return None
        if lowered.endswith(".svg") or lowered.endswith(".gif"):
            return None

        return re.sub(r"\._[A-Z0-9+_,-]+_\.", "._AC_SL1500_.", cleaned)

    @classmethod
    def _extract_image_urls(cls, soup: BeautifulSoup) -> list[str]:
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

        try:
            crawl_result = await engine.crawler.arun(url=search_url, config=search_config)
        except Exception as e:
            logger.error("[AmazonAdapter] Crawl search threw exception: %s", e)
            return None

        if not crawl_result or not crawl_result.success or not crawl_result.html:
            logger.warning("[AmazonAdapter] Crawl failed for search URL: %s", search_url)
            return None

        html = crawl_result.html

        # Phase 2: Link Parsing
        soup = BeautifulSoup(html, "html.parser")
        pdp_url = None

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if (
                ("/dp/" in href or "/gp/product/" in href)
                and "/slredirect/" not in href
                and "customer-reviews" not in href
            ):
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
            logger.warning(
                "[AmazonAdapter] No valid PDP URL found in search results for UPC: %s. (Possible bot block)",
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
