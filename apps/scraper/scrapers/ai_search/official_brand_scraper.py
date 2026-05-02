from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any
from urllib.parse import urlparse

from dataclasses import dataclass

from pydantic import BaseModel, Field

from scrapers.ai_search.llm_runtime import resolve_llm_runtime
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient
from scrapers.ai_search.scoring import BrandSourceSelector
from src.crawl4ai_engine.engine import Crawl4AIEngine


@dataclass
class RankedUrlCandidate:
    url: str
    domain: str
    rank: int
    score: float
    selection_tier: str  # "official_domain", "preferred_domain", "knowledge_graph", "llm_scored", "organic"
    appeared_in_phases: list[int]
    title: str | None
    snippet: str | None
    confidence: float
    result_type: str = "organic"


@dataclass
class DiscoveryResult:
    sku: str
    predicted_name: str
    ranked_candidates: list[RankedUrlCandidate]
    selected_url: str | None
    selection_method: str
    fallback_urls: list[str]
    phase1_result_count: int
    phase2_result_count: int

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

    async def _search_sku_for_names(
        self,
        sku: str,
        brand: str | None,
        register_name: str | None,
    ) -> list[dict[str, Any]]:
        """Phase 1: Search by SKU to discover candidate URLs and product names."""
        query = self._query_builder.build_sku_discovery_query(sku, brand)
        if not query:
            return []
        results, error = await self._search_client.search(query)
        if error:
            logger.error("[Phase 1] SKU search error for %s: %s", sku, error)
            return []
        return results or []

    async def _consolidate_product_name(
        self,
        register_name: str | None,
        brand: str | None,
        search_titles: list[str],
    ) -> str:
        """Phase 1.5: Use LLM to consolidate the most accurate product name from search titles."""
        if not register_name and not brand:
            return ""

        from scrapers.providers.factory import create_llm_provider

        provider = create_llm_provider(
            provider="openai",
            model="gpt-4o-mini",
            api_key=self._llm_runtime.api_key,
        )
        if not provider:
            logger.warning("[Phase 1.5] No LLM provider available, falling back to register_name")
            return register_name or ""

        titles_block = "\n".join(f"- {t}" for t in search_titles[:8] if t)
        prompt = f"""Given the raw product name and search result titles, predict the most accurate full product name.

Raw name: {register_name or "N/A"}
Brand: {brand or "N/A"}
Search titles:
{titles_block}

Return valid JSON ONLY:
{{"predicted_name": "string"}}"""

        try:
            response = await provider.generate_text(
                system_prompt=None,
                user_prompt=prompt,
                temperature=0.0,
                response_schema={
                    "type": "object",
                    "properties": {"predicted_name": {"type": "string"}},
                    "required": ["predicted_name"],
                },
            )
            data = json.loads(response.text)
            predicted = str(data.get("predicted_name") or "").strip()
            return predicted if predicted else (register_name or "")
        except Exception as e:
            logger.warning("[Phase 1.5] Name consolidation failed: %s", e)
            return register_name or ""

    async def _search_by_predicted_name(
        self,
        predicted_name: str,
        brand: str | None,
        official_domains: list[str] | None,
        preferred_domains: list[str] | None,
    ) -> list[dict[str, Any]]:
        """Phase 2: Search by consolidated product name with site exclusions."""
        exclusions = [
            "amazon.com", "ebay.com", "walmart.com", "target.com",
            "chewy.com", "petco.com", "petsmart.com",
            "homedepot.com", "lowes.com", "tractorsupply.com",
        ]
        query = self._query_builder.build_name_discovery_query(predicted_name, brand, exclusions)

        # Also build site-constrained variants using predicted name
        site_queries = self._query_builder.build_site_query_variants(
            official_domains or preferred_domains,
            None,
            predicted_name,
            brand,
            None,
        )

        merged: list[dict[str, Any]] = []
        seen: set[str] = set()
        for q in [*site_queries, query]:
            if not q:
                continue
            results, error = await self._search_client.search(q)
            if error:
                continue
            for r in results or []:
                url = str(r.get("url") or "").strip()
                if url and url not in seen:
                    seen.add(url)
                    merged.append(r)
        return merged

    def _rank_url_candidates(
        self,
        sku: str,
        phase1_results: list[dict[str, Any]],
        phase2_results: list[dict[str, Any]],
        official_domains: list[str] | None,
        preferred_domains: list[str] | None,
        predicted_name: str,
    ) -> DiscoveryResult:
        """Phase 3: Tiered ranking of merged URL candidates from Phase 1 and Phase 2."""
        from scrapers.ai_search.scoring import SearchScorer, get_domain_success_rate

        scorer = SearchScorer()
        normalized_official = [self._normalize_domain(d) for d in (official_domains or []) if d]
        normalized_preferred = [self._normalize_domain(d) for d in (preferred_domains or []) if d]

        # Merge and tag by phase
        by_url: dict[str, dict[str, Any]] = {}
        for r in phase1_results:
            url = str(r.get("url") or "").strip()
            if not url:
                continue
            by_url.setdefault(url, {**r, "phases": set()})
            by_url[url]["phases"].add(1)
        for r in phase2_results:
            url = str(r.get("url") or "").strip()
            if not url:
                continue
            by_url.setdefault(url, {**r, "phases": set()})
            by_url[url]["phases"].add(2)

        candidates: list[RankedUrlCandidate] = []
        for url, data in by_url.items():
            domain = self._normalize_domain(url) or ""
            phases = sorted(data["phases"])
            appeared = list(phases)

            # Base score from existing scorer (organic relevance)
            base_score = scorer.score_search_result(
                data, sku, None, predicted_name, None,
                prefer_manufacturer=True, preferred_domains=preferred_domains
            )

            # Detect positive signals before computing tier/score
            has_sku_in_content = sku and sku.lower() in f"{url} {data.get('title','')} {data.get('description','')}".lower()
            has_predicted_overlap = bool(
                predicted_name
                and (
                    len(set(predicted_name.lower().split()) & set(str(data.get("title") or "").lower().split())) >= 2
                )
            )
            has_cross_confirmation = len(phases) > 1
            original_result_type = str(data.get("result_type", "organic") or "organic")

            # Tiered boosts
            tier = "organic"
            score = base_score
            in_official = any(domain == d or domain.endswith(f".{d}") for d in normalized_official)
            in_preferred = any(domain == d or domain.endswith(f".{d}") for d in normalized_preferred)

            if in_official and 2 in phases:
                score += 100
                tier = "official_domain"
            elif in_official and 1 in phases:
                score += 80
                tier = "official_domain"
            elif in_preferred and 2 in phases:
                score += 60
                tier = "preferred_domain"
            elif in_preferred and 1 in phases:
                score += 50
                tier = "preferred_domain"
            elif original_result_type == "knowledge_graph":
                score += 40
                tier = "knowledge_graph"
            elif has_sku_in_content or has_predicted_overlap:
                score += 20
                tier = "llm_scored"

            # Additive bonuses
            if has_sku_in_content:
                score += 5
            if has_predicted_overlap:
                score += 3
            if has_cross_confirmation:
                score += 10
            success_rate = get_domain_success_rate(domain)
            score += success_rate * 5  # 0..5

            candidates.append(RankedUrlCandidate(
                url=url,
                domain=domain,
                rank=0,  # assigned after sort
                score=round(score, 2),
                selection_tier=tier,
                appeared_in_phases=appeared,
                title=data.get("title"),
                snippet=data.get("description"),
                confidence=min(1.0, max(0.0, score / 200)),  # rough normalization
                result_type=original_result_type,
            ))

        candidates.sort(key=lambda c: c.score, reverse=True)
        for i, c in enumerate(candidates, start=1):
            c.rank = i

        selected = candidates[0] if candidates else None
        fallback = [c.url for c in candidates[1:4]]  # next 3 URLs

        return DiscoveryResult(
            sku=sku,
            predicted_name=predicted_name,
            ranked_candidates=candidates,
            selected_url=selected.url if selected else None,
            selection_method=selected.selection_tier if selected else "none",
            fallback_urls=fallback,
            phase1_result_count=len(phase1_results),
            phase2_result_count=len(phase2_results),
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
        register_name: str | None = None,
    ) -> str | None:
        """Identify the official manufacturer URL for a product.

        Args:
            sku: Product SKU or identifier
            brand: Product brand name
            product_name: Optional product name fallback when brand is missing
            official_domains: Optional list of known official domains to prioritize
            preferred_domains: Optional list of domains to score highly
            register_name: Raw import name used as fallback when brand and product_name are missing

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
        elif register_name:
            base_query = f"{register_name} {sku} official website"
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
        register_name: str | None = None,
    ) -> dict[str, Any]:
        """Discover and rank Official Brand URL candidates without extracting product data.

        Uses a two-phase pipeline:
          Phase 1: SKU-based search
          Phase 1.5: LLM name consolidation
          Phase 2: Predicted-name search
          Phase 3: Tiered ranking
        """
        effective_brand = brand.strip() if brand and brand.lower() != "none" else ""
        if not sku or (not effective_brand and not product_name and not register_name):
            return {"success": False, "sku": sku, "status": "error", "error": "Missing context", "candidates": []}

        # Phase 1
        phase1 = await self._search_sku_for_names(sku, effective_brand or product_name, register_name)
        titles = [str(r.get("title") or "") for r in phase1]

        # Phase 1.5
        raw_name = register_name or product_name or ""
        predicted = await self._consolidate_product_name(raw_name, effective_brand, titles)
        if not predicted:
            predicted = raw_name

        # Phase 2 — skip if no meaningful predicted name exists
        phase2: list[dict[str, Any]] = []
        if predicted:
            phase2 = await self._search_by_predicted_name(
                predicted, effective_brand, official_domains, preferred_domains
            )

        # Phase 3
        discovery = self._rank_url_candidates(
            sku, phase1, phase2, official_domains, preferred_domains, predicted
        )

        # Build backward-compatible candidate list
        candidates = [
            {
                "url": c.url,
                "domain": c.domain,
                "title": c.title,
                "snippet": c.snippet,
                "result_type": c.result_type,
                "rank": c.rank,
                "confidence": c.confidence,
                "selection_method": discovery.selection_method if c.url == discovery.selected_url else None,
                "selection_tier": c.selection_tier,
                "appeared_in_phases": c.appeared_in_phases,
                "composite_score": c.score,
            }
            for c in discovery.ranked_candidates[:10]
        ]

        if not discovery.selected_url:
            return {
                "success": False,
                "sku": sku,
                "status": "not_found",
                "error": "Could not identify official brand URL",
                "predicted_name": discovery.predicted_name,
                "candidates": candidates,
                "phase1_result_count": discovery.phase1_result_count,
                "phase2_result_count": discovery.phase2_result_count,
            }

        return {
            "success": True,
            "sku": sku,
            "status": "found",
            "selected_url": discovery.selected_url,
            "confidence": discovery.ranked_candidates[0].confidence if discovery.ranked_candidates else 0.0,
            "selection_method": discovery.selection_method,
            "predicted_name": discovery.predicted_name,
            "fallback_urls": discovery.fallback_urls,
            "candidates": candidates,
            "phase1_result_count": discovery.phase1_result_count,
            "phase2_result_count": discovery.phase2_result_count,
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
                register_name = str(product.get("register_name") or "").strip() or None
                official_domains = product.get("official_domains")
                preferred_domains = product.get("preferred_domains")

                if not sku:
                    return AISearchResult(success=False, sku=sku, error="Missing SKU")
                if not brand and not product_name and not register_name:
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
                    register_name=register_name,
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
                register_name = str(product.get("register_name") or "").strip() or None
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
                    register_name=register_name,
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
