"""Batch search architecture for cohort-wide product discovery."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

from scrapers.ai_search.cohort_state import _BatchCohortState
from scrapers.ai_search.name_consolidator import NameConsolidator
from scrapers.ai_search.query_builder import QueryBuilder
from scrapers.ai_search.search import SearchClient

from .validation import ExtractionValidator

if TYPE_CHECKING:
    from scrapers.ai_search.models import AISearchResult


@dataclass
class ProductInput:
    """Input for a single product in batch search."""

    sku: str
    name: str
    brand: str | None = None
    category: str | None = None


@dataclass
class SearchResult:
    """Represents a search result."""

    url: str
    title: str | None = None
    description: str | None = None


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

    _MAX_DOMINANT_RETRIES: int = 2
    _MAX_SITE_SEARCH_QUERIES: int = 3
    _MAX_SITE_SEARCH_RESULTS: int = 5

    def __init__(
        self,
        search_client: Any,
        extractor: Any,
        scorer: Any,
        name_consolidator: NameConsolidator | None = None,
        cohort_state: _BatchCohortState | None = None,
        validator: ExtractionValidator | None = None,
    ):
        self._search_client = search_client
        self._extractor = extractor
        self._scorer = scorer
        self._name_consolidator = name_consolidator
        self._validator = validator or ExtractionValidator()
        self._product_context: dict[str, ProductInput] = {}
        self._consolidated_names: dict[str, str] = {}
        self._cohort_state = cohort_state

    @staticmethod
    def _to_search_results(raw_results: list[dict[str, Any]]) -> list[SearchResult]:
        return [
            SearchResult(
                url=result.get("url", ""),
                title=result.get("title"),
                description=result.get("description"),
            )
            for result in raw_results
        ]

    async def _run_query_batch(
        self,
        query_pairs: list[tuple[str, str]],
        *,
        max_concurrent: int,
    ) -> dict[str, list[SearchResult]]:
        output: dict[str, list[SearchResult]] = {key: [] for key, _ in query_pairs}
        pending = [(key, query) for key, query in query_pairs if query]
        if not pending:
            return output

        if isinstance(self._search_client, SearchClient):
            batch_results = await self._search_client.search_many(
                [query for _, query in pending],
                max_concurrent=max_concurrent,
            )
            for (key, _), (raw_results, error) in zip(pending, batch_results):
                output[key] = [] if error else self._to_search_results(raw_results)
            return output

        search_many = getattr(self._search_client, "search_many", None)
        if callable(search_many):
            batch_results = await search_many([query for _, query in pending])
            for (key, _), (raw_results, error) in zip(pending, batch_results):
                output[key] = [] if error else self._to_search_results(raw_results)
            return output

        semaphore = asyncio.Semaphore(max_concurrent)

        async def search_one(key: str, query: str) -> tuple[str, list[SearchResult]]:
            async with semaphore:
                raw_results, error = await self._search_client.search(query)
                if error:
                    return key, []
                return key, self._to_search_results(raw_results)

        results = await asyncio.gather(*(search_one(key, query) for key, query in pending), return_exceptions=True)
        for result in results:
            if isinstance(result, BaseException):
                continue
            key, search_results = result
            output[key] = search_results
        return output

    async def search_cohort(
        self,
        products: list[ProductInput],
        *,
        max_search_concurrent: int = 5,
        max_extract_concurrent: int = 3,
    ) -> BatchSearchResult:
        """Search all SKUs in a cohort."""
        self._product_context = {product.sku: product for product in products}
        self._consolidated_names = {}

        # Step 1: Search all SKUs using the shared two-step SKU-first flow.
        search_results = await self.search_sku_first(products, max_concurrent=max_search_concurrent)

        # Step 2: Analyze domain frequency
        domain_frequency = self.analyze_domain_frequency(search_results)

        # Step 3: Rank URLs for each SKU
        ranked_results: dict[str, list[RankedResult]] = {}
        for product in products:
            sku = product.sku
            if sku in search_results:
                ranked = self.rank_urls_for_sku(
                    sku,
                    search_results[sku],
                    domain_frequency,
                    brand=product.brand,
                    product_name=self._consolidated_names.get(product.sku) or product.name,
                    category=product.category,
                )
                ranked_results[sku] = ranked

        # Step 4: Batch extraction from top URLs
        selections = {sku: ranked[:3] for sku, ranked in ranked_results.items()}
        extractions = await self.extract_batch(selections, max_concurrent=max_extract_concurrent)

        # Step 5: Build final results
        final_ranked: dict[str, list[RankedResult]] = {}
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
        query_builder = QueryBuilder()
        query_pairs = [(product.sku, query_builder.build_identifier_query(product.sku)) for product in products]
        return await self._run_query_batch(query_pairs, max_concurrent=max_concurrent)

    async def search_sku_first(
        self,
        products: list[ProductInput],
        max_concurrent: int = 5,
    ) -> dict[str, list[SearchResult]]:
        """Run the cohort-wide two-step SKU-first discovery flow."""
        sku_results = await self._search_by_sku_only(products, max_concurrent)
        consolidated_names = await self._consolidate_names(products, sku_results, max_concurrent)
        self._consolidated_names = {
            sku: consolidated_name
            for sku, (consolidated_name, _) in consolidated_names.items()
            if str(consolidated_name or "").strip()
        }
        name_results = await self._search_with_names(products, consolidated_names, max_concurrent)
        return self._merge_search_results(sku_results, name_results)

    async def _search_by_sku_only(
        self,
        products: list[ProductInput],
        max_concurrent: int,
    ) -> dict[str, list[SearchResult]]:
        """Phase 1: Search by SKU only using identifier queries."""
        query_builder = QueryBuilder()
        query_pairs = [(product.sku, query_builder.build_identifier_query(product.sku)) for product in products]
        return await self._run_query_batch(query_pairs, max_concurrent=max_concurrent)

    async def _consolidate_names(
        self,
        products: list[ProductInput],
        sku_results: dict[str, list[SearchResult]],
        max_concurrent: int,
    ) -> dict[str, tuple[str, list[dict[str, Any]]]]:
        """Phase 2: Consolidate product names from SKU search results."""
        if not self._name_consolidator:
            # No consolidator - return empty for all SKUs
            return {sku: ("", []) for sku in sku_results.keys()}

        name_consolidator = self._name_consolidator
        semaphore = asyncio.Semaphore(max_concurrent)
        product_map = {product.sku: product for product in products}

        async def consolidate_one(
            sku: str,
            product_name: str,
            results: list[SearchResult],
        ) -> tuple[str, tuple[str, list[dict[str, Any]]]]:
            async with semaphore:
                snippets = [{"title": r.title or "", "description": r.description or ""} for r in results]
                try:
                    consolidated_name, _ = await name_consolidator.consolidate_name(
                        sku=sku,
                        abbreviated_name=product_name,
                        search_snippets=snippets,
                    )
                except Exception:
                    consolidated_name = product_name

                return sku, (consolidated_name, snippets)

        tasks = [
            consolidate_one(
                sku,
                (product_map.get(sku).name if product_map.get(sku) is not None else ""),
                results,
            )
            for sku, results in sku_results.items()
        ]

        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, tuple[str, list[dict[str, Any]]]] = {}
        for result in results_list:
            if isinstance(result, BaseException):
                continue
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
        query_builder = QueryBuilder()

        # Build product lookup
        product_map = {p.sku: p for p in products}
        query_pairs: list[tuple[str, str]] = []
        for sku in consolidated_names.keys():
            product = product_map.get(sku)
            if not product:
                query_pairs.append((sku, ""))
                continue

            consolidated_name, _ = consolidated_names.get(sku, (product.name, []))
            if not consolidated_name:
                consolidated_name = product.name

            query_pairs.append((sku, query_builder.build_name_query(consolidated_name)))

        return await self._run_query_batch(query_pairs, max_concurrent=max_concurrent)

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

    @staticmethod
    def _normalize_domain(value: str) -> str:
        """Normalize a bare domain or URL into a comparable domain string."""
        normalized = str(value or "").strip().lower().strip("/")
        if normalized.startswith("http://"):
            normalized = normalized[len("http://") :]
        elif normalized.startswith("https://"):
            normalized = normalized[len("https://") :]
        if normalized.startswith("www."):
            normalized = normalized[4:]
        return normalized.split("/", 1)[0].strip()

    def _remember_successful_domain(self, url: str) -> None:
        """Record a successful extraction domain for cohort ranking."""
        if not self._cohort_state:
            return
        domain = self._extract_domain(url)
        self._cohort_state.remember_domain(domain)

    def _should_use_sku_first(self, products: list[ProductInput]) -> bool:
        """Use SKU-first discovery when product context is too thin for direct ranking."""
        if self._name_consolidator is None:
            return False

        return any(not str(product.brand or "").strip() for product in products)

    async def _extract_and_validate(
        self,
        sku: str,
        candidate: SearchResult,
        product_name: str | None,
        brand: str | None,
    ) -> tuple[dict[str, Any] | None, str]:
        """Extract and validate a single candidate URL."""
        source_url = candidate.url

        try:
            result = await self._extractor.extract(
                source_url,
                sku,
                product_name,
                brand,
            )
        except Exception as exc:
            error_message = str(exc).strip()
            return None, error_message or "Extraction failed"

        result.setdefault("url", source_url)

        if not result.get("success"):
            return None, str(result.get("error") or "Extraction failed")

        is_acceptable, rejection_reason = self._validator.validate_extraction_match(
            extraction_result=result,
            sku=sku,
            product_name=product_name,
            brand=brand,
            source_url=source_url,
        )
        if not is_acceptable:
            return None, rejection_reason

        self._remember_successful_domain(str(result.get("url") or source_url))
        return result, ""

    async def _extract_ranked_results(
        self,
        sku: str,
        ranked_results: list[RankedResult],
        product_name: str | None,
        brand: str | None,
        attempted_urls: set[str],
    ) -> tuple[dict[str, Any] | None, str]:
        """Try extracting a ranked list until one result validates."""
        last_error = "All URLs failed"

        for ranked in ranked_results:
            source_url = ranked.result.url
            if not source_url or source_url in attempted_urls:
                continue
            if self._is_blocked_url(source_url):
                continue

            attempted_urls.add(source_url)
            result, error = await self._extract_and_validate(
                sku=sku,
                candidate=ranked.result,
                product_name=product_name,
                brand=brand,
            )
            if result:
                return result, ""
            if error:
                last_error = error

        return None, last_error

    async def _search_site_specific(
        self,
        domain: str,
        product: ProductInput | None,
    ) -> list[RankedResult]:
        """Run a targeted site search for the dominant cohort domain."""
        if not product:
            return []

        normalized_domain = self._normalize_domain(domain)
        if not normalized_domain:
            return []

        query_builder = QueryBuilder()
        search_name = self._consolidated_names.get(product.sku) or product.name
        queries = query_builder.build_site_query_variants(
            domains=[normalized_domain],
            sku=product.sku,
            product_name=search_name,
            brand=product.brand,
            category=None,
        )
        if not queries:
            return []

        site_results: dict[str, SearchResult] = {}
        for query in queries[: self._MAX_SITE_SEARCH_QUERIES]:
            try:
                raw_results, error = await self._search_client.search(query)
            except Exception:
                continue

            if error:
                continue

            for raw_result in raw_results:
                candidate = SearchResult(
                    url=raw_result.get("url", ""),
                    title=raw_result.get("title"),
                    description=raw_result.get("description"),
                )
                if not candidate.url:
                    continue
                if self._extract_domain(candidate.url) != normalized_domain:
                    continue
                _ = site_results.setdefault(candidate.url, candidate)

            if len(site_results) >= self._MAX_SITE_SEARCH_RESULTS:
                break

        return self.rank_urls_for_sku(
            sku=product.sku,
            search_results=list(site_results.values()),
            domain_frequency={},
            brand=product.brand,
            product_name=search_name,
            category=product.category,
        )

    def rank_urls_for_sku(
        self,
        sku: str,
        search_results: list[SearchResult],
        domain_frequency: dict[str, DomainFrequency],
        brand: str | None = None,
        product_name: str | None = None,
        category: str | None = None,
    ) -> list[RankedResult]:
        """Rank URLs considering cohort-wide signals."""
        ranked: list[RankedResult] = []

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
                brand=brand,
                product_name=product_name,
                category=category,
                prefer_manufacturer=True,
            )

            freq = domain_frequency.get(domain)
            if freq and freq.sku_count > 3:
                base_score += 5.0
            elif freq and freq.sku_count > 1:
                base_score += 2.0

            # Boost score for domains preferred by cohort
            if self._cohort_state:
                ranked_domains = self._cohort_state.ranked_domains()
                if domain in ranked_domains:
                    # Higher boost for more preferred domains
                    domain_rank = ranked_domains.index(domain)
                    base_score += max(3.0 - domain_rank * 0.5, 0.5)

            # Boost for dominant domain
            if self._cohort_state:
                dominant = self._cohort_state.dominant_domain(minimum_count=2)
                if dominant and domain == dominant:
                    base_score += 2.0

            ranked.append(RankedResult(result=result, score=base_score))

        ranked.sort(key=lambda x: x.score, reverse=True)
        return ranked

    def _is_blocked_url(self, url: str) -> bool:
        """Check if URL should be skipped before extraction."""
        domain = self._scorer.domain_from_url(url)
        if not domain:
            return True

        if self._scorer._domain_matches_candidates(domain, self._scorer.BLOCKED_DOMAINS):
            return True

        if self._scorer.is_category_like_url(url):
            return True

        return False

    async def extract_batch(
        self,
        selections: dict[str, list[RankedResult]],
        max_concurrent: int = 3,
    ) -> dict[str, Any]:
        """Extract from selected URLs in parallel batches."""
        semaphore = asyncio.Semaphore(max_concurrent)

        async def extract_sku(sku: str, urls: list[RankedResult]) -> tuple[str, Any]:
            async with semaphore:
                product = self._product_context.get(sku)
                product_name = product.name if product else None
                brand = product.brand if product else None
                last_error = "All URLs failed"
                attempted_urls: set[str] = set()

                for ranked in urls:
                    source_url = ranked.result.url
                    if not source_url or source_url in attempted_urls:
                        continue
                    if self._is_blocked_url(source_url):
                        continue

                    attempted_urls.add(source_url)

                    result, error = await self._extract_and_validate(
                        sku=sku,
                        candidate=ranked.result,
                        product_name=product_name,
                        brand=brand,
                    )
                    if result:
                        return sku, result
                    if error:
                        last_error = error

            return sku, {"success": False, "error": last_error}

        tasks = [extract_sku(sku, urls) for sku, urls in selections.items()]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, Any] = {}
        for result in results:
            if isinstance(result, BaseException):
                continue
            sku, res = result
            output[sku] = res

        return output
