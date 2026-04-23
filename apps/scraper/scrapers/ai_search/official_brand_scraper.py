from __future__ import annotations

import json
import logging
import os
from typing import Any

from pydantic import BaseModel, Field

from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient
from scrapers.ai_search.source_selector import LLMSourceSelector
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


class OfficialBrandScraper:
    """Orchestrator for finding official manufacturer domains."""

    def __init__(
        self,
        search_client: SearchClient | None = None,
        query_builder: QueryBuilder | None = None,
        source_selector: LLMSourceSelector | None = None,
        headless: bool = True,
        llm_provider: str = "openai",
        llm_model: str = "gpt-4o-mini",
        llm_api_key: str | None = None,
    ):
        self._search_client = search_client or SearchClient()
        self._query_builder = query_builder or QueryBuilder()
        self._source_selector = source_selector or LLMSourceSelector()
        self.headless = headless
        self._llm_runtime = resolve_llm_runtime(
            provider=llm_provider,
            model=llm_model,
            api_key=llm_api_key,
        )

    async def identify_official_url(self, sku: str, brand: str) -> str | None:
        """Identify the official manufacturer URL for a product.

        Args:
            sku: Product SKU or identifier
            brand: Product brand name

        Returns:
            The official manufacturer URL or None if not found
        """
        # 1. Build query with exclusions
        base_query = f"{brand} {sku} official website"
        # Standard aggregators and retailers to exclude from search results
        exclusions = [
            "amazon.com",
            "ebay.com",
            "walmart.com",
            "target.com",
            "chewy.com",
            "petco.com",
            "petsmart.com",
            "homedepot.com",
            "lowes.com",
            "tractorsupply.com",
        ]
        query = self._query_builder.build_brand_focused_query(base_query, exclusions)

        logger.info("[OfficialBrandScraper] Searching for official URL: %s", query)

        # 2. Search
        results, error = await self._search_client.search(query)
        if error:
            logger.error("[OfficialBrandScraper] Search failed: %s", error)
            return None

        if not results:
            logger.info("[OfficialBrandScraper] No search results found for %s %s", brand, sku)
            return None

        # 3. Check for Knowledge Graph result first
        for result in results:
            if result.get("result_type") == "knowledge_graph":
                kg_url = str(result.get("url") or "").strip()
                if kg_url:
                    logger.info("[OfficialBrandScraper] Found Knowledge Graph result: %s", kg_url)
                    return kg_url

        # 4. Fallback to LLM scoring for top 5 organic results
        # select_best_url takes top 5 internally, but we'll pass the full list
        best_url, cost = await self._source_selector.select_best_url(
            results=results,
            sku=sku,
            product_name=f"{brand} {sku}",
            brand=brand,
        )

        if best_url:
            logger.info(
                "[OfficialBrandScraper] LLM selected official URL: %s (cost: $%s)",
                best_url,
                f"{cost:.4f}",
            )
            return best_url

        logger.info("[OfficialBrandScraper] No official URL identified for %s %s", brand, sku)
        return None

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
                                "[OfficialBrandScraper] Stage 1 (Deterministic) extraction successful for %s",
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
                        "[OfficialBrandScraper] Stage 1 extraction failed: %s. Falling back to Stage 2.",
                        e,
                    )

            # Stage 2: Semantic Fallback (LLM)
            logger.info("[OfficialBrandScraper] Starting Stage 2 (Semantic) extraction for %s", url)
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

                    logger.info("[OfficialBrandScraper] Stage 2 (Semantic) extraction successful for %s", url)
                    return {"success": True, "data": data, "method": "llm"}
                except Exception as e:
                    logger.error("[OfficialBrandScraper] Failed to parse Stage 2 results: %s", e)

            return {"success": False, "error": result.get("error") or "Extraction failed"}
