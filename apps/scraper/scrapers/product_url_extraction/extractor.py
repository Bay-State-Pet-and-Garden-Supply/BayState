from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from pydantic import BaseModel, Field

from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.ai_search.models import AISearchResult
from src.crawl4ai_engine.engine import Crawl4AIEngine


logger = logging.getLogger(__name__)


class ProductSpecs(BaseModel):
    """Pydantic model for product specifications."""

    name: str = Field(..., description="Product name")
    price: str = Field(None, description="Product price")
    description: str = Field(None, description="Product description")
    sku: str = Field(None, description="Product SKU or model number")
    brand: str = Field(None, description="Product brand")
    specifications: dict = Field(default_factory=dict, description="Technical specifications")
    images: list[str] = Field(default_factory=list, description="Product image URLs")


class ProductUrlExtractor:
    """Extract product data from known/approved URLs.

    This is an extraction-only class. URL discovery (finding the right URL
    for a product) is handled server-side by the web app's official-brand
    discovery pipeline.

    Products MUST have a ``source_url``, ``known_url``, or ``url`` field.
    If no URL is provided, the extraction will fail with a descriptive
    message pointing to the server-side discovery endpoint.
    """

    def __init__(
        self,
        headless: bool = True,
        llm_provider: str = "deepseek",
        llm_model: str = "deepseek-chat",
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
    ):
        self.headless = headless
        self._llm_runtime = resolve_llm_runtime(
            provider=llm_provider,
            model=llm_model,
            base_url=llm_base_url,
            api_key=llm_api_key,
        )

    async def extract_data(self, url: str, schema_path: str | None = None) -> dict[str, Any]:
        """Extract product data using a two-stage process.

        Stage 1: Deterministic extraction using JsonCssExtractionStrategy if schema_path provided.
        Stage 2: Semantic fallback using LLMExtractionStrategy if Stage 1 is skipped or fails.

        Args:
            url: The URL to extract data from
            schema_path: Optional path to a JSON CSS extraction schema

        Returns:
            Dictionary of extracted product data
        """
        engine_config = {
            "browser": {
                "headless": self.headless,
            },
            "crawler": {
                "timeout": 60000,
            },
        }

        async with Crawl4AIEngine(engine_config) as engine:
            # Stage 1: Deterministic (JSON CSS)
            if schema_path and os.path.exists(schema_path):
                try:
                    with open(schema_path, "r") as f:
                        schema = json.load(f)

                    from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

                    strategy = JsonCssExtractionStrategy(schema=schema)

                    engine.config.setdefault("crawler", {})["extraction_strategy"] = strategy
                    result = await engine.crawl(url)

                    if result.get("success") and result.get("extracted_content"):
                        content = result["extracted_content"]
                        if content:
                            logger.info(
                                "[ProductUrlExtractor] Stage 1 (Deterministic) extraction successful for %s",
                                url,
                            )
                            # JsonCssExtractionStrategy content might be stringified JSON
                            if isinstance(content, str):
                                try:
                                    content = json.loads(content)
                                except json.JSONDecodeError:
                                    pass

                            return {"success": True, "data": content, "method": "json_css"}
                except Exception as e:
                    logger.warning(
                        "[ProductUrlExtractor] Stage 1 extraction failed: %s. Falling back to Stage 2.",
                        e,
                    )

            # Stage 2: Semantic Fallback (LLM)
            logger.info("[ProductUrlExtractor] Starting Stage 2 (Semantic) extraction for %s", url)
            from crawl4ai import LLMConfig
            from crawl4ai.extraction_strategy import LLMExtractionStrategy

            # Use LLM with Pydantic schema
            strategy = LLMExtractionStrategy(
                llm_config=LLMConfig(
                    provider=self._llm_runtime.crawl4ai_provider,
                    api_token=self._llm_runtime.api_key,
                ),
                schema=ProductSpecs.model_json_schema(),
                extraction_type="schema",
                instruction=(
                    "Extract product name, price, description, sku, brand, specifications, "
                    "and images from the content."
                ),
                input_format="markdown",
            )

            engine.config.setdefault("crawler", {})["extraction_strategy"] = strategy
            # Ensure we don't use cached result without extraction
            engine.config.setdefault("crawler", {})["cache_mode"] = "BYPASS"

            result = await engine.crawl(url)
            if result.get("success") and result.get("extracted_content"):
                try:
                    content = result["extracted_content"]
                    if isinstance(content, str):
                        data = json.loads(content)
                        # LLMExtractionStrategy often returns a list of objects
                        if isinstance(data, list) and data:
                            data = data[0]
                    else:
                        data = content

                    logger.info("[ProductUrlExtractor] Stage 2 (Semantic) extraction successful for %s", url)
                    return {"success": True, "data": data, "method": "llm"}
                except Exception as e:
                    logger.error("[ProductUrlExtractor] Failed to parse Stage 2 results: %s", e)

            return {"success": False, "error": result.get("error") or "Extraction failed"}

    async def scrape_products_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Extract products from known URLs. URL discovery is now server-side.

        This is the legacy combined path — it now delegates directly to
        extraction only. Products MUST have a source_url or known_url;
        if not, the job fails with a message pointing to the server-side
        discovery endpoint.
        """
        # Extract only what we need: products with pre-discovered URLs
        url_provided_products = []
        for product in products:
            url = str(product.get("source_url") or product.get("known_url") or "").strip()
            if url:
                url_provided_products.append(product)
            else:
                sku = str(product.get("sku") or "").strip()
                logger.warning(
                    "[ProductUrlExtractor] Skipping SKU %s — URL discovery is now server-side. "
                    "Use POST /api/admin/pipeline/official-brand/discover instead.",
                    sku,
                )

        if not url_provided_products:
            return [
                AISearchResult(
                    success=False,
                    sku="",
                    error=(
                        "URL discovery is now server-side. "
                        "Use POST /api/admin/pipeline/official-brand/discover to discover URLs, "
                        "then submit extraction jobs with urls_by_sku."
                    ),
                )
            ]

        return await self.extract_products_from_urls_batch(
            url_provided_products, max_concurrency=max_concurrency
        )

    async def extract_products_from_urls_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Extract product data from known URLs.

        Accepts products with source_url, known_url, or url fields and
        optional fallback_urls for resilience.
        """
        if not products:
            return []

        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _extract_single(product: dict[str, Any]) -> AISearchResult:
            async with semaphore:
                sku = str(product.get("sku") or "").strip()
                brand = str(product.get("brand") or "").strip()
                primary_url = str(product.get("source_url") or product.get("known_url") or product.get("url") or "").strip()
                fallback_urls = [str(u).strip() for u in (product.get("fallback_urls") or []) if str(u).strip()]
                raw_max = product.get("max_fallbacks")
                try:
                    max_fallbacks = int(raw_max) if raw_max is not None else 3
                except (ValueError, TypeError):
                    max_fallbacks = 3

                if not sku:
                    return AISearchResult(success=False, sku=sku, error="Missing SKU")

                urls_to_try = [primary_url, *fallback_urls][:max_fallbacks]
                last_error = "Missing source URL"

                for attempt_url in urls_to_try:
                    if not attempt_url:
                        continue
                    res = await self.extract_data(attempt_url)
                    if res.get("success"):
                        data = res.get("data")
                        if isinstance(data, list) and data and isinstance(data[0], dict):
                            data = data[0]
                        if isinstance(data, dict):
                            return AISearchResult(
                                success=True,
                                sku=sku,
                                product_name=data.get("name"),
                                brand=data.get("brand") or brand,
                                description=data.get("description"),
                                images=data.get("images"),
                                categories=data.get("categories"),
                                url=attempt_url,
                                source_website=attempt_url,
                                confidence=1.0 if res.get("method") == "json_css" else 0.8,
                                cost_usd=0.05,
                                selection_method=str(product.get("url_source") or "known_url"),
                            )
                    last_error = res.get("error") or "Extraction failed"

                return AISearchResult(
                    success=False,
                    sku=sku,
                    error=last_error,
                    url=primary_url or (fallback_urls[0] if fallback_urls else None),
                    source_website=primary_url or (fallback_urls[0] if fallback_urls else None),
                )

        return list(await asyncio.gather(*(_extract_single(p) for p in products)))
