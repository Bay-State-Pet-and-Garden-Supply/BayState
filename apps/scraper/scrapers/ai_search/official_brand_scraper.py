from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, Field

from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient
from scrapers.ai_search.scoring import BrandSourceSelector
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
        source_selector: BrandSourceSelector | None = None,
        headless: bool = True,
        llm_provider: str = "openai",
        llm_model: str = "gpt-4o-mini",
        llm_api_key: str | None = None,
    ):
        self._search_client = search_client or SearchClient()
        self._query_builder = query_builder or QueryBuilder()
        self.headless = headless
        self._llm_runtime = resolve_llm_runtime(
            provider=llm_provider,
            model=llm_model,
            api_key=llm_api_key,
        )
        self._source_selector = source_selector or BrandSourceSelector(
            api_key=self._llm_runtime.api_key,
            model=self._llm_runtime.model
        )

    @staticmethod
    def _normalize_domain(value: str) -> str | None:
        trimmed = value.strip().lower()
        if not trimmed:
            return None

        with_protocol = trimmed if "://" in trimmed else f"https://{trimmed}"

        try:
            hostname = urlparse(with_protocol).netloc.lower() or urlparse(with_protocol).path.lower()
        except Exception:
            hostname = trimmed

        hostname = hostname.replace("www.", "", 1).split("/", 1)[0].strip()
        return hostname or None

    @classmethod
    def _url_matches_domain_list(cls, url: str, domains: list[str] | None) -> bool:
        if not domains:
            return False

        normalized_url_domain = cls._normalize_domain(url)
        if not normalized_url_domain:
            return False

        normalized_domains = [domain for domain in (cls._normalize_domain(candidate) for candidate in domains) if domain]
        return any(
            normalized_url_domain == domain or normalized_url_domain.endswith(f".{domain}")
            for domain in normalized_domains
        )

    async def _search_queries_until_match(
        self,
        queries: list[str],
        target_domains: list[str] | None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        merged_results: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        for query in queries:
            logger.info("[OfficialBrandScraper] Searching for official URL: %s", query)
            results, error = await self._search_client.search(query)
            if error:
                logger.error("[OfficialBrandScraper] Search failed: %s", error)
                return [], error

            if not results:
                continue

            for result in results:
                url = str(result.get("url") or "").strip()
                if url:
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)
                merged_results.append(result)

            if target_domains:
                matched = next(
                    (
                        str(result.get("url") or "").strip()
                        for result in results
                        if str(result.get("url") or "").strip()
                        and self._url_matches_domain_list(str(result.get("url") or "").strip(), target_domains)
                    ),
                    None,
                )
                if matched:
                    return merged_results, None

        return merged_results, None

    async def identify_official_url(
        self,
        sku: str,
        brand: str,
        product_name: str | None = None,
        official_domains: list[str] | None = None,
        preferred_domains: list[str] | None = None,
    ) -> str | None:
        """Identify the official manufacturer URL for a product.

        Args:
            sku: Product SKU or identifier
            brand: Product brand name
            product_name: Optional product name fallback when brand is missing
            official_domains: Optional list of known official domains to prioritize
            preferred_domains: Optional list of domains to score highly

        Returns:
            The official manufacturer URL or None if not found
        """
        normalized_official_domains = [
            domain for domain in (self._normalize_domain(candidate) for candidate in (official_domains or [])) if domain
        ]
        normalized_preferred_domains = [
            domain for domain in (self._normalize_domain(candidate) for candidate in (preferred_domains or [])) if domain
        ]
        targeted_domains = normalized_official_domains or normalized_preferred_domains

        # 1. Build query with exclusions
        effective_brand = brand.strip() if brand and brand.lower() != "none" else ""
        if effective_brand:
            base_query = f"{effective_brand} {sku} official website"
        elif product_name:
            base_query = f"{product_name} {sku} official website"
        else:
            logger.info(
                "[OfficialBrandScraper] No brand or product_name available for %s", sku
            )
            return None
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

        site_queries = self._query_builder.build_site_query_variants(
            targeted_domains,
            sku,
            product_name,
            effective_brand or None,
            None,
        )

        queries = [*site_queries, query]

        # 2. Search
        results, error = await self._search_queries_until_match(queries, normalized_official_domains or normalized_preferred_domains)
        if error:
            return None

        if not results:
            logger.info(
                "[OfficialBrandScraper] No search results found for %s %s",
                effective_brand or product_name or "",
                sku,
            )
            return None

        # 3. Check against official_domains if provided
        if normalized_official_domains:
            for result in results[:5]:
                url = str(result.get("url") or "").strip()
                if not url:
                    continue

                if self._url_matches_domain_list(url, normalized_official_domains):
                    logger.info(
                        "[OfficialBrandScraper] Found matching official domain: %s", url
                    )
                    return url

        # 4. Check against preferred_domains if provided
        if normalized_preferred_domains:
            for result in results[:5]:
                url = str(result.get("url") or "").strip()
                if not url:
                    continue

                if self._url_matches_domain_list(url, normalized_preferred_domains):
                    logger.info(
                        "[OfficialBrandScraper] Found matching preferred domain: %s", url
                    )
                    return url

        # 5. Check for Knowledge Graph result after configured domain checks
        for result in results:
            if result.get("result_type") == "knowledge_graph":
                kg_url = str(result.get("url") or "").strip()
                if not kg_url:
                    continue

                if targeted_domains and not self._url_matches_domain_list(kg_url, targeted_domains):
                    continue

                logger.info(
                    "[OfficialBrandScraper] Found Knowledge Graph result: %s", kg_url
                )
                return kg_url

        # 6. Fallback to LLM scoring for top 5 organic results
        scored_results = []
        scoring_context = effective_brand or product_name or ""
        for result in results[:5]:
            url = result.get("url")
            snippet = result.get("description") or result.get("title", "")
            if not url:
                continue

            # Prioritize preferred_domains in LLM context if they exist
            context_with_domains = scoring_context
            if preferred_domains:
                context_with_domains += f" (Preferred domains: {', '.join(preferred_domains)})"

            score_data = await self._source_selector.score_snippet(url, snippet, context_with_domains)
            if score_data.get("is_official"):
                confidence = score_data.get("confidence_score", 0.0)
                scored_results.append((url, confidence))
                logger.debug(
                    "[OfficialBrandScraper] Scored URL %s: official=%s, confidence=%s",
                    url,
                    True,
                    confidence,
                )

        if scored_results:
            # Sort by confidence
            scored_results.sort(key=lambda x: x[1], reverse=True)
            best_url = scored_results[0][0]
            logger.info(
                "[OfficialBrandScraper] Identified official URL via LLM: %s (confidence: %s)",
                best_url,
                scored_results[0][1],
            )
            return best_url

        logger.info(
            "[OfficialBrandScraper] No official URL identified for %s %s",
            effective_brand or product_name or "",
            sku,
        )
        return None

    async def discover_official_url_candidates(
        self,
        sku: str,
        brand: str,
        product_name: str | None = None,
        official_domains: list[str] | None = None,
        preferred_domains: list[str] | None = None,
    ) -> dict[str, Any]:
        """Discover and rank Official Brand URL candidates without extracting product data."""
        normalized_official_domains = [
            domain for domain in (self._normalize_domain(candidate) for candidate in (official_domains or [])) if domain
        ]
        normalized_preferred_domains = [
            domain for domain in (self._normalize_domain(candidate) for candidate in (preferred_domains or [])) if domain
        ]
        targeted_domains = normalized_official_domains or normalized_preferred_domains

        effective_brand = brand.strip() if brand and brand.lower() != "none" else ""
        if effective_brand:
            base_query = f"{effective_brand} {sku} official website"
        elif product_name:
            base_query = f"{product_name} {sku} official website"
        else:
            return {
                "success": False,
                "sku": sku,
                "status": "error",
                "error": "Missing Brand and Product Name",
                "candidates": [],
            }

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
        site_queries = self._query_builder.build_site_query_variants(
            targeted_domains,
            sku,
            product_name,
            effective_brand or None,
            None,
        )

        results, error = await self._search_queries_until_match(
            [*site_queries, query],
            normalized_official_domains or normalized_preferred_domains,
        )
        if error:
            return {
                "success": False,
                "sku": sku,
                "status": "error",
                "error": error,
                "candidates": [],
            }

        if not results:
            return {
                "success": False,
                "sku": sku,
                "status": "not_found",
                "error": "No search results found",
                "candidates": [],
            }

        selected_url: str | None = None
        selection_method: str | None = None
        selected_confidence = 0.0
        confidence_by_url: dict[str, float] = {}

        if normalized_official_domains:
            for result in results[:5]:
                url = str(result.get("url") or "").strip()
                if url and self._url_matches_domain_list(url, normalized_official_domains):
                    selected_url = url
                    selection_method = "official_domain"
                    selected_confidence = 1.0
                    break

        if not selected_url and normalized_preferred_domains:
            for result in results[:5]:
                url = str(result.get("url") or "").strip()
                if url and self._url_matches_domain_list(url, normalized_preferred_domains):
                    selected_url = url
                    selection_method = "preferred_domain"
                    selected_confidence = 0.95
                    break

        if not selected_url:
            for result in results:
                if result.get("result_type") != "knowledge_graph":
                    continue
                kg_url = str(result.get("url") or "").strip()
                if not kg_url:
                    continue
                if targeted_domains and not self._url_matches_domain_list(kg_url, targeted_domains):
                    continue
                selected_url = kg_url
                selection_method = "knowledge_graph"
                selected_confidence = 0.9
                break

        if not selected_url:
            scored_results = []
            scoring_context = effective_brand or product_name or ""
            for result in results[:5]:
                url = str(result.get("url") or "").strip()
                snippet = str(result.get("description") or result.get("title") or "")
                if not url:
                    continue

                context_with_domains = scoring_context
                if preferred_domains:
                    context_with_domains += f" (Preferred domains: {', '.join(preferred_domains)})"

                score_data = await self._source_selector.score_snippet(url, snippet, context_with_domains)
                confidence = float(score_data.get("confidence_score", 0.0) or 0.0)
                confidence_by_url[url] = confidence
                if score_data.get("is_official"):
                    scored_results.append((url, confidence))

            if scored_results:
                scored_results.sort(key=lambda x: x[1], reverse=True)
                selected_url = scored_results[0][0]
                selection_method = "llm"
                selected_confidence = scored_results[0][1]

        candidates: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        for index, result in enumerate(results[:10], start=1):
            url = str(result.get("url") or "").strip()
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            candidate_confidence = confidence_by_url.get(url)
            if selected_url and url == selected_url and selected_confidence:
                candidate_confidence = selected_confidence

            candidates.append(
                {
                    "url": url,
                    "domain": self._normalize_domain(url),
                    "title": result.get("title"),
                    "snippet": result.get("description"),
                    "result_type": result.get("result_type"),
                    "rank": index,
                    "confidence": candidate_confidence,
                    "selection_method": selection_method if selected_url and url == selected_url else None,
                }
            )

        if not selected_url:
            return {
                "success": False,
                "sku": sku,
                "status": "not_found",
                "error": "Could not identify official brand URL",
                "candidates": candidates,
            }

        return {
            "success": True,
            "sku": sku,
            "status": "found",
            "selected_url": selected_url,
            "confidence": selected_confidence,
            "selection_method": selection_method,
            "candidates": candidates,
        }


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

    async def scrape_products_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Scrape multiple products in batch (Compatibility for Runner)."""
        if not products:
            return []

        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _scrape_single(product: dict[str, Any]) -> AISearchResult:
            async with semaphore:
                sku = str(product.get("sku") or "").strip()
                brand = str(product.get("brand") or "").strip()
                product_name = str(product.get("product_name") or "").strip()
                official_domains = product.get("official_domains")
                preferred_domains = product.get("preferred_domains")

                if not sku:
                    return AISearchResult(success=False, sku=sku, error="Missing SKU")
                if not brand and not product_name:
                    return AISearchResult(
                        success=False, sku=sku, error="Missing Brand and Product Name"
                    )

                # 1. Discovery
                url = await self.identify_official_url(
                    sku,
                    brand,
                    product_name,
                    official_domains=official_domains,
                    preferred_domains=preferred_domains,
                )
                if not url:
                    return AISearchResult(
                        success=False, sku=sku, error="Could not identify official brand URL"
                    )

                # 2. Extraction
                res = await self.extract_data(url)

                if res.get("success"):
                    data = res["data"]
                    return AISearchResult(
                        success=True,
                        sku=sku,
                        product_name=data.get("name"),
                        brand=data.get("brand") or brand,
                        description=data.get("description"),
                        images=data.get("images"),
                        categories=data.get("categories"),
                        url=url,
                        source_website=url,
                        confidence=1.0 if res["method"] == "json_css" else 0.8,
                        cost_usd=0.05,  # Nominal cost
                    )
                else:
                    return AISearchResult(success=False, sku=sku, error=res.get("error", "Extraction failed"))

        tasks = [_scrape_single(p) for p in products]
        return list(await asyncio.gather(*tasks))

    async def discover_product_urls_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[dict[str, Any]]:
        """Discover Official Brand URLs for products without running Crawl4AI extraction."""
        if not products:
            return []

        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _discover_single(product: dict[str, Any]) -> dict[str, Any]:
            async with semaphore:
                sku = str(product.get("sku") or "").strip()
                brand = str(product.get("brand") or "").strip()
                product_name = str(product.get("product_name") or "").strip()
                official_domains = product.get("official_domains")
                preferred_domains = product.get("preferred_domains")

                if not sku:
                    return {"success": False, "sku": sku, "status": "error", "error": "Missing SKU", "candidates": []}

                return await self.discover_official_url_candidates(
                    sku,
                    brand,
                    product_name,
                    official_domains=official_domains,
                    preferred_domains=preferred_domains,
                )

        return list(await asyncio.gather(*(_discover_single(p) for p in products)))

    async def extract_products_from_urls_batch(
        self,
        products: list[dict[str, Any]],
        max_concurrency: int = 4,
    ) -> list[AISearchResult]:
        """Extract Official Brand product data from known URLs."""
        if not products:
            return []

        semaphore = asyncio.Semaphore(max(1, max_concurrency))

        async def _extract_single(product: dict[str, Any]) -> AISearchResult:
            async with semaphore:
                sku = str(product.get("sku") or "").strip()
                brand = str(product.get("brand") or "").strip()
                url = str(product.get("source_url") or product.get("known_url") or product.get("url") or "").strip()

                if not sku:
                    return AISearchResult(success=False, sku=sku, error="Missing SKU")
                if not url:
                    return AISearchResult(success=False, sku=sku, error="Missing source URL")

                res = await self.extract_data(url)
                if not res.get("success"):
                    return AISearchResult(success=False, sku=sku, error=res.get("error", "Extraction failed"), url=url, source_website=url)

                data = res.get("data")
                if isinstance(data, list) and data and isinstance(data[0], dict):
                    data = data[0]
                if not isinstance(data, dict):
                    return AISearchResult(success=False, sku=sku, error="Extraction returned unsupported payload", url=url, source_website=url)

                return AISearchResult(
                    success=True,
                    sku=sku,
                    product_name=data.get("name"),
                    brand=data.get("brand") or brand,
                    description=data.get("description"),
                    images=data.get("images"),
                    categories=data.get("categories"),
                    url=url,
                    source_website=url,
                    confidence=1.0 if res.get("method") == "json_css" else 0.8,
                    cost_usd=0.05,
                    selection_method=str(product.get("url_source") or "known_url"),
                )

        return list(await asyncio.gather(*(_extract_single(p) for p in products)))
