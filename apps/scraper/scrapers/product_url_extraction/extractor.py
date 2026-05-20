from __future__ import annotations

import asyncio
import logging
from typing import Any

from scrapers.ai_search.models import AISearchResult


logger = logging.getLogger(__name__)


class ProductPageExtractor:
    """Canonical product page extractor using the robust Crawl4AI pipeline.

    This is an extraction-only class. It does NOT perform URL discovery,
    domain verification, or candidate ranking. It receives a known URL
    and extracts product data using JSON-LD, meta tags, fallback HTTP,
    and LLM extraction as needed.

    The extraction pipeline follows this order:
      1. Fetch with Crawl4AIEngine (relaxed-wait retry if needed)
      2. Detect soft-404 / wrong landing page
      3. Resolve variant-specific payload if page is a family page (Demandware)
      4. Extract JSON-LD
      5. If incomplete, extract meta tags
      6. If incomplete, run fallback extraction (HTTP GET + JSON-LD + meta)
      7. If still incomplete, run LLM extraction
      8. Normalize into one result shape
      9. Return evidence with method/confidence/telemetry

    The same pipeline is used regardless of URL source (manual paste, URL Review
    selection, bulk import, supplier feed, or future sources).
    """

    def __init__(
        self,
        headless: bool = True,
        llm_provider: str | None = None,
        llm_model: str = "deepseek-chat",
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
        cache_enabled: bool = True,
        extraction_strategy: str = "llm",
        prompt_version: str = "v1",
    ):
        self.headless = headless
        self.cache_enabled = cache_enabled
        self.extraction_strategy = extraction_strategy
        self.prompt_version = prompt_version

        from scrapers.ai_search.matching import MatchingUtils
        from scrapers.ai_search.scoring import SearchScorer
        from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor

        scoring = SearchScorer()
        matching = MatchingUtils()

        self._extractor = Crawl4AIExtractor(
            headless=headless,
            llm_model=llm_model,
            scoring=scoring,
            matching=matching,
            cache_enabled=cache_enabled,
            extraction_strategy=extraction_strategy,
            prompt_version=prompt_version,
            llm_provider=llm_provider,
            llm_base_url=llm_base_url,
            llm_api_key=llm_api_key,
        )

    async def extract(
        self,
        *,
        url: str,
        sku: str,
        product_name: str | None = None,
        register_name: str | None = None,
        brand: str | None = None,
        fallback_urls: list[str] | None = None,
        max_fallbacks: int = 3,
    ) -> dict[str, Any]:
        """Extract product data from a known URL using the robust pipeline.

        Tries the primary URL first, then fallback URLs if provided.
        Returns a standardized dict regardless of which extraction method succeeded.

        Args:
            url: Primary URL to extract from.
            sku: Product SKU for context.
            product_name: Expected product name (used for validation and variant resolution).
            register_name: Alternate name for the product (e.g., register/brand name).
            brand: Expected brand name.
            fallback_urls: Optional list of fallback URLs to try if the primary fails.
            max_fallbacks: Maximum number of fallback URLs to attempt (default 3).

        Returns:
            Dict with keys: success, sku, source, url, final_url, product_name,
            brand, description, images, categories, size_metrics, method,
            confidence, telemetry, and error (on failure).
        """
        # Build URLs to try
        urls_to_try: list[str] = []
        if url:
            urls_to_try.append(url)
        if fallback_urls:
            urls_to_try.extend(fallback_urls[:max(max_fallbacks - 1, 0)])

        last_error: str | None = None
        final_url = url
        effective_name = product_name or register_name
        success_results: list[dict[str, Any]] = []
        source_results: list[dict[str, Any]] = []

        def clean_slug_from_url(url_str: str) -> str:
            from urllib.parse import urlparse
            import re
            try:
                hostname = urlparse(url_str).hostname or ""
                slug = hostname.lower()
                if slug.startswith("www."):
                    slug = slug[4:]
                slug = re.sub(r'[^a-z0-9_]', '_', slug)
                return slug or "standard_url"
            except Exception:
                return "standard_url"

        for attempt_url in urls_to_try:
            if not attempt_url:
                continue
            
            logger.info("[ProductPageExtractor] Extracting from URL: %s", attempt_url)
            
            try:
                result = await self._extractor.extract(
                    url=attempt_url,
                    sku=sku,
                    product_name=effective_name,
                    brand=brand,
                )
            except Exception as e:
                logger.error(
                    "[ProductPageExtractor] Extraction failed for URL %s: %s",
                    attempt_url,
                    e
                )
                result = {"success": False, "error": str(e)}

            source_slug = clean_slug_from_url(attempt_url)

            if result and result.get("success"):
                model = result.get("model", getattr(self._extractor, "llm_model", "deepseek-chat"))
                method = result.get("method", "unknown")

                normalized: dict[str, Any] = {
                    "success": True,
                    "sku": sku,
                    "source": "product_page_extraction",
                    "url": url,
                    "final_url": result.get("url") or attempt_url,
                    "product_name": result.get("product_name"),
                    "brand": result.get("brand"),
                    "description": result.get("description"),
                    "images": result.get("images") or [],
                    "categories": result.get("categories") or [],
                    "size_metrics": result.get("size_metrics"),
                    # v1 contract fields
                    "weight": result.get("weight") or result.get("size_metrics"),
                    "dimensions": result.get("dimensions"),
                    "shipping_weight": result.get("shipping_weight"),
                    "features": result.get("features", []),
                    "ingredients": result.get("ingredients"),
                    "pet_type": result.get("pet_type"),
                    "life_stage": result.get("life_stage"),
                    "food_form": result.get("food_form"),
                    "flavor": result.get("flavor"),
                    "method": method,
                    "confidence": result.get("confidence", 0.0),
                    "model": model,
                    "mode": "llm" if "llm" in method.lower() else "mixed",
                    "token_usage": result.get("token_usage", {}),
                    "telemetry": result.get("telemetry", {}),
                }

                # Construct EnrichedProductFacts structure
                product_facts = {
                    "name": result.get("product_name"),
                    "brand": result.get("brand"),
                    "description": result.get("description"),
                    "category": result.get("categories")[0] if isinstance(result.get("categories"), list) and result.get("categories") else None,
                    "sku": sku,
                    "weight": result.get("weight") or result.get("size_metrics"),
                    "dimensions": result.get("dimensions"),
                    "shipping_weight": result.get("shipping_weight"),
                    "image_urls": result.get("images") or [],
                    "ingredients": result.get("ingredients"),
                    "features": result.get("features", []),
                    "pet_type": result.get("pet_type"),
                    "life_stage": result.get("life_stage"),
                    "food_form": result.get("food_form"),
                    "flavor": result.get("flavor"),
                }

                source_results.append({
                    "sourceSlug": source_slug,
                    "sourceType": "standard_url",
                    "confidence": float(result.get("confidence", 0.0) or 0.0),
                    "matchedFields": [k for k, v in product_facts.items() if v],
                    "evidenceUrl": attempt_url,
                    "product": product_facts,
                })
                success_results.append(normalized)
            else:
                last_error = (result.get("error") if result else None) or "Extraction failed"
                final_url = attempt_url
                
                source_results.append({
                    "sourceSlug": source_slug,
                    "sourceType": "standard_url",
                    "confidence": 0.0,
                    "matchedFields": [],
                    "evidenceUrl": attempt_url,
                    "product": None,
                })

        if success_results:
            # Sort successes by confidence descending and select the best one
            success_results.sort(key=lambda x: x.get("confidence", 0.0) or 0.0, reverse=True)
            best_result = success_results[0]
            best_result["source_results"] = source_results
            return best_result

        return {
            "success": False,
            "sku": sku,
            "source": "product_page_extraction",
            "url": url,
            "final_url": final_url,
            "error": last_error or "All extraction attempts failed",
            "source_results": source_results,
        }


    async def extract_products_from_urls_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Batch extraction from known URLs.

        Accepts products with source_url, known_url, or url fields and
        optional fallback_urls for resilience.

        Args:
            products: List of product dicts. Each should have at minimum
                ``sku`` and one of ``source_url``, ``known_url``, or ``url``.
                Optional fields: product_name, register_name, brand,
                fallback_urls, max_fallbacks, url_source.
            max_concurrency: Maximum parallel extractions (default 4).

        Returns:
            List of AISearchResult objects.
        """
        if not products:
            return []

        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _extract_single(product: dict[str, Any]) -> AISearchResult:
            async with semaphore:
                sku = str(product.get("sku") or "").strip()
                brand = str(product.get("brand") or "").strip()
                primary_url = str(
                    product.get("source_url")
                    or product.get("known_url")
                    or product.get("url")
                    or ""
                ).strip()
                fallback_urls = [
                    str(u).strip()
                    for u in (product.get("fallback_urls") or [])
                    if str(u).strip()
                ]
                raw_max = product.get("max_fallbacks")
                try:
                    max_fallbacks = int(raw_max) if raw_max is not None else 3
                except (ValueError, TypeError):
                    max_fallbacks = 3

                if not sku:
                    return AISearchResult(success=False, sku=sku, error="Missing SKU")

                if not primary_url:
                    return AISearchResult(
                        success=False,
                        sku=sku,
                        error="Missing source URL",
                    )

                result = await self.extract(
                    url=primary_url,
                    sku=sku,
                    product_name=product.get("product_name"),
                    register_name=product.get("register_name"),
                    brand=brand or product.get("brand"),
                    fallback_urls=fallback_urls,
                    max_fallbacks=max_fallbacks,
                )

                if result.get("success"):
                    return AISearchResult(
                        success=True,
                        sku=sku,
                        product_name=result.get("product_name"),
                        brand=result.get("brand") or brand,
                        description=result.get("description"),
                        size_metrics=result.get("size_metrics"),
                        images=result.get("images"),
                        categories=result.get("categories"),
                        url=result.get("final_url") or primary_url,
                        source_website=primary_url,
                        confidence=result.get("confidence", 0.0),
                        cost_usd=0.05,
                        selection_method=str(product.get("url_source") or "known_url"),
                    )

                return AISearchResult(
                    success=False,
                    sku=sku,
                    error=result.get("error") or "Extraction failed",
                    url=primary_url,
                    source_website=primary_url,
                    selection_method=str(product.get("url_source") or "known_url"),
                )

        return list(await asyncio.gather(*(_extract_single(p) for p in products)))


class ProductUrlExtractor:
    """Backward-compatible wrapper around ProductPageExtractor.

    Deprecated: use ProductPageExtractor directly for new code.
    """

    def __init__(
        self,
        headless: bool = True,
        llm_provider: str = "deepseek",
        llm_model: str = "deepseek-chat",
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
    ):
        self._extractor = ProductPageExtractor(
            headless=headless,
            llm_provider=llm_provider,
            llm_model=llm_model,
            llm_api_key=llm_api_key,
            llm_base_url=llm_base_url,
        )

    async def extract_data(self, url: str, schema_path: str | None = None) -> dict[str, Any]:
        """Backward-compatible single-URL extraction.

        ``schema_path`` is intentionally ignored — the robust pipeline
        handles extraction automatically without requiring a manually-
        maintained JSON-CSS schema.

        Returns the same shape as the old method:
        ``{"success": True/False, "data": ..., "method": ..., "error": ...}``
        """
        # schema_path is ignored — the robust pipeline does not need it
        result = await self._extractor.extract(url=url, sku="unknown")
        if result.get("success"):
            return {
                "success": True,
                "data": {
                    "name": result.get("product_name"),
                    "brand": result.get("brand"),
                    "description": result.get("description"),
                    "images": result.get("images"),
                    "categories": result.get("categories"),
                    "sku": result.get("sku"),
                },
                "method": result.get("method", "unknown"),
            }
        return {"success": False, "error": result.get("error", "Extraction failed")}

    async def scrape_products_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Legacy batch path — delegates to ProductPageExtractor."""
        return await self._extractor.extract_products_from_urls_batch(products, max_concurrency)

    async def extract_products_from_urls_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Batch extraction from known URLs — delegates to ProductPageExtractor."""
        return await self._extractor.extract_products_from_urls_batch(products, max_concurrency)


__all__ = ["ProductPageExtractor", "ProductUrlExtractor"]
