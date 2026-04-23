from __future__ import annotations

import logging
from typing import Any

from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient
from scrapers.ai_search.source_selector import LLMSourceSelector

logger = logging.getLogger(__name__)


class OfficialBrandScraper:
    """Orchestrator for finding official manufacturer domains."""

    def __init__(
        self,
        search_client: SearchClient | None = None,
        query_builder: QueryBuilder | None = None,
        source_selector: LLMSourceSelector | None = None,
    ):
        self._search_client = search_client or SearchClient()
        self._query_builder = query_builder or QueryBuilder()
        self._source_selector = source_selector or LLMSourceSelector()

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

    async def extract_data(self, url: str) -> dict[str, Any]:
        """Stub for data extraction. To be implemented in a later task.

        Args:
            url: The URL to extract data from

        Returns:
            Dictionary of extracted product data
        """
        del url
        return {}
