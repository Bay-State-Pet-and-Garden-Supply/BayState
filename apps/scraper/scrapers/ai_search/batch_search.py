"""Batch search architecture for cohort-wide product discovery."""

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlparse

from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.query_builder import QueryBuilder


@dataclass
class ProductInput:
    """Input for a single product in batch search."""

    sku: str
    name: str
    brand: Optional[str] = None


@dataclass
class SearchResult:
    """Represents a search result."""

    url: str
    title: Optional[str] = None
    description: Optional[str] = None


@dataclass
class DomainFrequency:
    """Tracks how many SKUs a domain appears for."""

    domain: str
    sku_count: int
    skus: set[str] = field(default_factory=set)


@dataclass
class RankedResult:
    """A search result with ranking score."""

    result: SearchResult
    score: float


@dataclass
class BatchSearchResult:
    """Results from a batch search operation."""

    results: dict[str, list[RankedResult]] = field(default_factory=dict)
    extractions: dict[str, Any] = field(default_factory=dict)

    def to_search_results(self) -> list["AISearchResult"]:
        """Convert to list of AISearchResult objects."""
        from scrapers.ai_search.models import AISearchResult

        output: list[AISearchResult] = []
        for sku, ranked_list in self.results.items():
            extraction = self.extractions.get(sku, {})
            if extraction and extraction.get("success"):
                # Use extracted data
                url = extraction.get("url", "")
                domain = urlparse(url).netloc if url else ""
                output.append(
                    AISearchResult(
                        success=True,
                        sku=sku,
                        product_name=extraction.get("product_name"),
                        brand=extraction.get("brand"),
                        description=extraction.get("description"),
                        images=extraction.get("images", []),
                        url=url,
                        source_website=domain,
                        confidence=extraction.get("confidence", 0.5),
                    )
                )
            elif ranked_list:
                # Use top-ranked result without extraction
                top = ranked_list[0]
                url = top.result.url
                domain = urlparse(url).netloc if url else ""
                output.append(
                    AISearchResult(
                        success=False,
                        sku=sku,
                        url=url,
                        source_website=domain,
                        confidence=min(top.score / 10.0, 1.0),
                        error="Extraction failed",
                    )
                )
            else:
                output.append(
                    AISearchResult(
                        success=False,
                        sku=sku,
                        error="No results found",
                    )
                )

        return output


class BatchSearchOrchestrator:
    """Orchestrates cohort-wide search and URL selection."""

    def __init__(
        self,
        search_client: Any,
        extractor: Any,
        scorer: Any,
        name_consolidator: Any = None,
    ):
        self._search_client = search_client
        self._extractor = extractor
        self._scorer = scorer
        self._name_consolidator = name_consolidator

    async def search_cohort(self, products: list[ProductInput]) -> BatchSearchResult:
        """Search all SKUs in a cohort."""
        # Step 1: Search all SKUs in parallel
        search_results = await self.search_all_skus(products, max_concurrent=5)

        # Step 2: Analyze domain frequency
        domain_frequency = self.analyze_domain_frequency(search_results)

        # Step 3: Rank URLs for each SKU
        ranked_results = {}
        for product in products:
            sku = product.sku
            if sku in search_results:
                ranked = self.rank_urls_for_sku(sku, search_results[sku], domain_frequency)
                ranked_results[sku] = ranked

        # Step 4: Batch extraction from top URLs
        selections = {sku: ranked[:3] for sku, ranked in ranked_results.items()}
        extractions = await self.extract_batch(selections, max_concurrent=3)

        # Step 5: Build final results
        final_ranked = {}
        for sku, ranked_list in ranked_results.items():
            # Mark which URL was successfully extracted
            if sku in extractions and extractions[sku].get("success"):
                final_ranked[sku] = ranked_list
            else:
                final_ranked[sku] = ranked_list

        return BatchSearchResult(results=final_ranked, extractions=extractions)

    async def search_all_skus(
        self,
        products: list[ProductInput],
        max_concurrent: int = 5,
    ) -> dict[str, list[SearchResult]]:
        """Search all SKUs in parallel with concurrency limit."""
        semaphore = asyncio.Semaphore(max_concurrent)
        query_builder = QueryBuilder()

        async def search_one(product: ProductInput) -> tuple[str, list[SearchResult]]:
            async with semaphore:
                # Build search query using QueryBuilder with available data
                query = query_builder.build_search_query(
                    sku=product.sku,
                    product_name=product.name,
                    brand=product.brand,
                    category=None,
                )
                raw_results, error = await self._search_client.search(query)
                if error:
                    return product.sku, []
                results = [
                    SearchResult(
                        url=r.get("url", ""),
                        title=r.get("title"),
                        description=r.get("description"),
                    )
                    for r in raw_results
                ]
                return product.sku, results

        tasks = [search_one(p) for p in products]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, list[SearchResult]] = {}
        for result in results:
            if not isinstance(result, Exception):
                sku, res = result
                output[sku] = res
        return output

    async def search_sku_first(
        self,
        products: list[ProductInput],
        max_concurrent: int = 5,
    ) -> dict[str, list[SearchResult]]:
        """Proactive SKU-first search strategy with three-phase refinement.",

        Phase 1: Search by SKU only (identifier query)
        Phase 2: Consolidate names using NameConsolidator
        Phase 3: Search with consolidated names
        Phase 4: Merge and deduplicate results
        """
        # Phase 1: SKU-only searches (parallel)
        sku_results = await self._search_by_sku_only(products, max_concurrent)

        # Phase 2: Name consolidation (parallel)
        consolidated_names = await self._consolidate_names(sku_results, max_concurrent)

        # Phase 3: Manufacturer searches with consolidated names (parallel)
        manufacturer_results = await self._search_with_names(
            products, consolidated_names, max_concurrent
        )

        # Phase 4: Merge and deduplicate
        merged = self._merge_search_results(sku_results, manufacturer_results)

        return merged

    async def _search_by_sku_only(
        self,
        products: list[ProductInput],
        max_concurrent: int,
    ) -> dict[str, list[SearchResult]]:
        """Phase 1: Search by SKU only using identifier queries."""
        semaphore = asyncio.Semaphore(max_concurrent)
        query_builder = QueryBuilder()

        async def search_one(product: ProductInput) -> tuple[str, list[SearchResult]]:
            async with semaphore:
                query = query_builder.build_identifier_query(product.sku)
                if not query:
                    return product.sku, []

                raw_results, error = await self._search_client.search(query)
                if error:
                    return product.sku, []

                results = [
                    SearchResult(
                        url=r.get("url", ""),
                        title=r.get("title"),
                        description=r.get("description"),
                    )
                    for r in raw_results
                ]
                return product.sku, results

        tasks = [search_one(p) for p in products]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, list[SearchResult]] = {}
        for result in results:
            if not isinstance(result, Exception):
                sku, res = result
                output[sku] = res
        return output

    async def _consolidate_names(
        self,
        sku_results: dict[str, list[SearchResult]],
        max_concurrent: int,
    ) -> dict[str, tuple[str, list[dict[str, Any]]]]:
        """Phase 2: Consolidate product names from SKU search results."""
        if not self._name_consolidator:
            # No consolidator - return empty for all SKUs
            return {sku: ("", []) for sku in sku_results.keys()}

        semaphore = asyncio.Semaphore(max_concurrent)

        async def consolidate_one(
            sku: str, product_name: str, results: list[SearchResult],
        ) -> tuple[str, tuple[str, list[dict[str, Any]]]]:
            async with semaphore:
                snippets = [
                    {"title": r.title or "", "description": r.description or ""}
                    for r in results
                ]
                try:
                    consolidated_name, _ = await self._name_consolidator.consolidate_name(
                        sku=sku,
                        abbreviated_name=product_name,
                        search_snippets=snippets,
                    )
                except Exception:
                    consolidated_name = product_name

                return sku, (consolidated_name, snippets)

        tasks = [
            consolidate_one(sku, "", results)
            for sku, results in sku_results.items()
        ]

        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, tuple[str, list[dict[str, Any]]]] = {}
        for result in results_list:
            if not isinstance(result, Exception):
                sku, consolidated = result
                output[sku] = consolidated
        return output

    async def _search_with_names(
        self,
        products: list[ProductInput],
        consolidated_names: dict[str, tuple[str, list[dict[str, Any]]]],
        max_concurrent: int,
    ) -> dict[str, list[SearchResult]]:
        """Phase 3: Search using consolidated names."""
        semaphore = asyncio.Semaphore(max_concurrent)
        query_builder = QueryBuilder()

        # Build product lookup
        product_map = {p.sku: p for p in products}

        async def search_one(sku: str) -> tuple[str, list[SearchResult]]:
            async with semaphore:
                product = product_map.get(sku)
                if not product:
                    return sku, []

                consolidated_name, _ = consolidated_names.get(sku, (product.name, []))
                if not consolidated_name:
                    consolidated_name = product.name

                query = query_builder.build_search_query(
                    sku=product.sku,
                    product_name=consolidated_name,
                    brand=product.brand,
                    category=None,
                )

                raw_results, error = await self._search_client.search(query)
                if error:
                    return sku, []

                results = [
                    SearchResult(
                        url=r.get("url", ""),
                        title=r.get("title"),
                        description=r.get("description"),
                    )
                    for r in raw_results
                ]
                return sku, results

        tasks = [search_one(sku) for sku in consolidated_names.keys()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, list[SearchResult]] = {}
        for result in results:
            if not isinstance(result, Exception):
                sku, res = result
                output[sku] = res
        return output

    def _merge_search_results(
        self,
        sku_results: dict[str, list[SearchResult]],
        manufacturer_results: dict[str, list[SearchResult]],
    ) -> dict[str, list[SearchResult]]:
        """Phase 4: Merge results from Phase 1 and Phase 3, deduplicate by URL."""
        merged: dict[str, list[SearchResult]] = {}

        for sku in set(sku_results.keys()) | set(manufacturer_results.keys()):
            phase1 = sku_results.get(sku, [])
            phase3 = manufacturer_results.get(sku, [])

            # Deduplicate by URL
            seen_urls: set[str] = set()
            combined: list[SearchResult] = []

            # Add Phase 3 results first (higher quality)
            for result in phase3:
                if result.url and result.url not in seen_urls:
                    seen_urls.add(result.url)
                    combined.append(result)

            # Add Phase 1 results that aren't duplicates
            for result in phase1:
                if result.url and result.url not in seen_urls:
                    seen_urls.add(result.url)
                    combined.append(result)

            merged[sku] = combined

        return merged

    def analyze_domain_frequency(
        self,
        all_results: dict[str, list[SearchResult]],
    ) -> dict[str, DomainFrequency]:
        """Count how many SKUs each domain appears for."""
        domain_counts: dict[str, set[str]] = defaultdict(set)

        for sku, results in all_results.items():
            for result in results:
                domain = self._extract_domain(result.url)
                domain_counts[domain].add(sku)

        return {domain: DomainFrequency(domain=domain, sku_count=len(skus), skus=skus) for domain, skus in domain_counts.items()}

    @staticmethod
    def _extract_domain(url: str) -> str:
        """Extract domain from URL."""
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            if domain.startswith("www."):
                domain = domain[4:]
            return domain
        except Exception:
            return ""

    def rank_urls_for_sku(
        self,
        sku: str,
        search_results: list[SearchResult],
        domain_frequency: dict[str, DomainFrequency],
    ) -> list[RankedResult]:
        """Rank URLs considering cohort-wide signals."""
        ranked = []

        for result in search_results:
            domain = self._extract_domain(result.url)

            result_dict = {
                "url": result.url,
                "title": result.title or "",
                "description": result.description or "",
            }
            base_score = self._scorer.score_search_result(
                result=result_dict,
                sku=sku,
                brand=None,
                product_name=None,
                category=None,
            )

            freq = domain_frequency.get(domain)
            if freq and freq.sku_count > 3:
                base_score += 5.0
            elif freq and freq.sku_count > 1:
                base_score += 2.0

            from scrapers.ai_search.scoring import get_domain_success_rate

            success_rate = get_domain_success_rate(domain)
            if success_rate > 0.8:
                base_score += 3.0
            elif success_rate < 0.3:
                base_score -= 3.0

            ranked.append(RankedResult(result=result, score=base_score))

        ranked.sort(key=lambda x: x.score, reverse=True)
        return ranked

    async def extract_batch(
        self,
        selections: dict[str, list[RankedResult]],
        max_concurrent: int = 3,
    ) -> dict[str, Any]:
        """Extract from selected URLs in parallel batches."""
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_sku(sku: str, urls: list[RankedResult]) -> tuple[str, Any]:
            async with semaphore:
                for ranked in urls:
                    try:
                        result = await self._extractor.extract(
                            ranked.result.url,
                            sku,
                            ranked.result.title,
                            None,
                        )
                        if result.get("success"):
                            return sku, result
                    except Exception:
                        continue
            return sku, {"success": False, "error": "All URLs failed"}

        tasks = [extract_sku(sku, urls) for sku, urls in selections.items()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        return {sku: res for sku, res in results if not isinstance(res, Exception)}
