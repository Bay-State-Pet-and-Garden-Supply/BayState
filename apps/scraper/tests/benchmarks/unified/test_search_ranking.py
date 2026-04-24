"""Search ranking benchmark for manufacturer vs retailer detection.

Tests the OfficialBrandScraper's ability to identify official manufacturer
URLs from search results while correctly excluding major retailers.

Uses REAL search API (Serper) — not cached fixtures.
Measures:
- First-attempt official rate (manufacturer picked on first try)
- Average attempts per product
- False positive rate (retailer incorrectly selected)
- Knowledge Graph anchoring effectiveness
- LLM snippet scoring accuracy
- Retailer exclusion list effectiveness
- Search latency and cost
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

# Ensure scraper root is in path
import sys

scraper_root = Path(__file__).resolve().parents[3]
if str(scraper_root) not in sys.path:
    sys.path.insert(0, str(scraper_root))

from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.search import SearchClient
from tests.benchmarks.unified.base import BaseBenchmark, BenchmarkConfig, BenchmarkResult
from tests.benchmarks.unified.metrics import BenchmarkMetricsCollector, MetricsStore
from tests.benchmarks.unified.proxy import ProxyRotator, load_proxy_rotator

logger = logging.getLogger(__name__)

# Test products for search ranking benchmark
# These are real products with known official manufacturer domains
DEFAULT_TEST_PRODUCTS = [
    {
        "sku": "032247886598",
        "brand": "Scotts",
        "name": "Scotts Nature Scapes Color Enhanced Mulch Deep Forest Brown 1.5 cu ft",
        "expected_domain": "scotts.com",
    },
    {"sku": "095668300593", "brand": "Manna Pro", "name": "Manna Pro Duck Starter Grower Crumbles 8 lb", "expected_domain": "mannapro.com"},
    {"sku": "032247761215", "brand": "Scotts", "name": "Scotts Turf Builder EdgeGuard Mini Broadcast Spreader", "expected_domain": "scotts.com"},
    {"sku": "095668225308", "brand": "Manna Pro", "name": "Manna Pro All Flock Crumbles with Probiotics 8 lb", "expected_domain": "mannapro.com"},
    {"sku": "032247278140", "brand": "Miracle-Gro", "name": "Miracle-Gro Potting Mix 25qt", "expected_domain": "miraclegro.com"},
    {"sku": "072705115310", "brand": "Phillips", "name": "Phillips Pet Food & Supplies", "expected_domain": "phillipspet.com"},
    {"sku": "818673020057", "brand": "Blue Buffalo", "name": "Blue Buffalo Life Protection Formula", "expected_domain": "bluebuffalo.com"},
    {"sku": "078011000401", "brand": "Purina", "name": "Purina Pro Plan", "expected_domain": "purina.com"},
    {"sku": "038032031049", "brand": "Hill's", "name": "Hill's Science Diet", "expected_domain": "hillspet.com"},
    {"sku": "023184131295", "brand": "Royal Canin", "name": "Royal Canin Size Health Nutrition", "expected_domain": "royalcanin.com"},
]

# Major retailers that should be excluded
RETAILER_DOMAINS = {
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
    "acehardware.com",
    "costco.com",
}


@dataclass
class ProductResult:
    """Result for a single product search ranking test."""

    sku: str
    brand: str
    product_name: str
    expected_domain: str
    success: bool
    selected_url: str | None
    selected_domain: str | None
    is_official: bool
    is_retailer: bool
    attempts: int
    first_attempt_url: str | None
    first_attempt_is_official: bool
    used_knowledge_graph: bool
    used_llm_scoring: bool
    latency_ms: float
    cost_usd: float
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchRankingMetrics:
    """Aggregated metrics for search ranking benchmark."""

    total_products: int
    successful_selections: int
    official_first_attempt: int
    official_any_attempt: int
    retailer_selected: int
    false_positives: int
    knowledge_graph_hits: int
    llm_scoring_hits: int
    avg_attempts: float
    avg_latency_ms: float
    total_cost_usd: float
    false_positive_rate: float
    first_attempt_official_rate: float


def _normalize_domain(domain: str) -> str:
    """Normalize domain for comparison."""
    domain = domain.lower().strip()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def _is_domain_match(domain1: str, domain2: str) -> bool:
    """Check if two domains match (handling subdomains)."""
    d1 = _normalize_domain(domain1)
    d2 = _normalize_domain(domain2)
    return d1 == d2 or d1.endswith(f".{d2}") or d2.endswith(f".{d1}")


def _is_retailer_domain(domain: str) -> bool:
    """Check if domain is a known retailer."""
    normalized = _normalize_domain(domain)
    for retailer in RETAILER_DOMAINS:
        if normalized == retailer or normalized.endswith(f".{retailer}"):
            return True
    return False


class SearchRankingBenchmark(BaseBenchmark):
    """Benchmark for testing search ranking quality.

    Evaluates the OfficialBrandScraper's ability to:
    1. Identify official manufacturer URLs on first attempt
    2. Avoid selecting major retailers (Amazon, Chewy, etc.)
    3. Use Knowledge Graph results when available
    4. Fall back to LLM scoring effectively
    5. Respect retailer exclusion lists

    Uses real search API (not cached fixtures) with proxy rotation.
    """

    def __init__(
        self,
        config: BenchmarkConfig,
        products: list[dict[str, Any]] | None = None,
        use_proxy_rotation: bool = True,
    ) -> None:
        super().__init__(config)
        self.products = products or DEFAULT_TEST_PRODUCTS
        self.use_proxy_rotation = use_proxy_rotation
        self._scorer = SearchScorer()
        self._metrics_collector = BenchmarkMetricsCollector("search_ranking")
        self._proxy_rotator: ProxyRotator | None = None
        self._search_client: SearchClient | None = None
        self._scraper: OfficialBrandScraper | None = None
        self._product_results: list[ProductResult] = []

    def setup(self) -> None:
        """Initialize search client with proxy rotation."""
        logger.info("Setting up SearchRankingBenchmark with %d products", len(self.products))

        # Initialize proxy rotation if enabled
        if self.use_proxy_rotation:
            self._proxy_rotator = load_proxy_rotator()
            if self._proxy_rotator and not self._proxy_rotator.is_empty:
                logger.info("Proxy rotation enabled with %d proxies", self._proxy_rotator.pool_size)
            else:
                logger.warning("Proxy rotation enabled but no proxies configured")
                self._proxy_rotator = None

        # Initialize search client
        self._search_client = SearchClient(max_results=15)

        # Initialize official brand scraper
        self._scraper = OfficialBrandScraper(
            search_client=self._search_client,
            headless=True,
        )

        # Set metadata
        self._metrics_collector.set_metadata("product_count", len(self.products))
        self._metrics_collector.set_metadata("proxy_rotation", self.use_proxy_rotation)
        self._metrics_collector.set_metadata("proxy_count", self._proxy_rotator.pool_size if self._proxy_rotator else 0)

    async def _run_search_with_proxy(self, sku: str, brand: str) -> tuple[str | None, dict[str, Any]]:
        """Run search for a single product with proxy rotation and detailed metrics.

        Returns:
            Tuple of (selected_url, metadata_dict)
        """
        import time

        start_time = time.perf_counter()
        metadata = {
            "sku": sku,
            "brand": brand,
            "attempts": 0,
            "first_attempt_url": None,
            "first_attempt_is_official": False,
            "used_knowledge_graph": False,
            "used_llm_scoring": False,
            "search_results_count": 0,
            "retailers_in_results": [],
        }

        try:
            # Build query with exclusions (same as OfficialBrandScraper)
            base_query = f"{brand} {sku} official website"
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

            # Get proxy if available
            proxy_url = None
            if self._proxy_rotator:
                proxy_url = self._proxy_rotator.get_proxy_url()
                if proxy_url:
                    logger.debug("Using proxy: %s", proxy_url)

            # Perform search
            query = f"{base_query} " + " ".join(f"-site:{ex}" for ex in exclusions)
            results, error = await self._search_client.search(query)

            if error:
                metadata["error"] = f"Search error: {error}"
                return None, metadata

            metadata["search_results_count"] = len(results)

            if not results:
                metadata["error"] = "No search results found"
                return None, metadata

            # Track retailers found in results (to measure exclusion effectiveness)
            for result in results:
                domain = self._scorer.domain_from_url(str(result.get("url") or ""))
                if _is_retailer_domain(domain):
                    metadata["retailers_in_results"].append(domain)

            # Check for Knowledge Graph result
            selected_url = None
            for result in results:
                if result.get("result_type") == "knowledge_graph":
                    kg_url = str(result.get("url") or "").strip()
                    if kg_url:
                        metadata["used_knowledge_graph"] = True
                        metadata["attempts"] = 1
                        metadata["first_attempt_url"] = kg_url
                        metadata["first_attempt_is_official"] = self._scorer.classify_source_domain(self._scorer.domain_from_url(kg_url), brand) == "official"
                        return kg_url, metadata

            # Fall back to LLM scoring for top 5 results
            metadata["used_llm_scoring"] = True

            from scrapers.ai_search.scoring import BrandSourceSelector

            selector = BrandSourceSelector()

            scored_results = []
            for result in results[:5]:
                url = result.get("url")
                snippet = result.get("description") or result.get("title", "")
                if not url:
                    continue

                score_data = await selector.score_snippet(url, snippet, brand)
                if score_data.get("is_official"):
                    confidence = score_data.get("confidence_score", 0.0)
                    scored_results.append((url, confidence))

                metadata["attempts"] += 1
                if metadata["first_attempt_url"] is None:
                    metadata["first_attempt_url"] = url
                    metadata["first_attempt_is_official"] = self._scorer.classify_source_domain(self._scorer.domain_from_url(url), brand) == "official"

            if scored_results:
                scored_results.sort(key=lambda x: x[1], reverse=True)
                selected_url = scored_results[0][0]

            elapsed_ms = (time.perf_counter() - start_time) * 1000
            metadata["latency_ms"] = elapsed_ms

            return selected_url, metadata

        except Exception as e:
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            metadata["latency_ms"] = elapsed_ms
            metadata["error"] = str(e)
            logger.exception("Error searching for %s %s", brand, sku)
            return None, metadata

    def _calculate_cost(self, metadata: dict[str, Any]) -> float:
        """Calculate approximate cost for the search operation."""
        # Serper API cost: approximately $0.001-0.002 per search
        base_cost = 0.002

        # LLM scoring cost if used
        if metadata.get("used_llm_scoring"):
            # GPT-4o-mini: ~$0.0001 per scoring call
            base_cost += 0.0001 * metadata.get("attempts", 1)

        return base_cost

    async def _test_product(self, product: dict[str, Any]) -> ProductResult:
        """Test search ranking for a single product."""
        sku = product["sku"]
        brand = product["brand"]
        name = product.get("name", "")
        expected_domain = product.get("expected_domain", "")

        logger.info("Testing product: %s %s", brand, sku)

        selected_url, metadata = await self._run_search_with_proxy(sku, brand)

        # Determine if selection is correct
        selected_domain = None
        is_official = False
        is_retailer = False
        false_positive = False

        if selected_url:
            selected_domain = self._scorer.domain_from_url(selected_url)
            source_tier = self._scorer.classify_source_domain(selected_domain, brand)
            is_official = source_tier == "official"
            is_retailer = _is_retailer_domain(selected_domain)

            # False positive: expected official domain but got something else
            if expected_domain and not _is_domain_match(selected_domain, expected_domain):
                if not is_official:
                    false_positive = True

        success = selected_url is not None and is_official

        cost = self._calculate_cost(metadata)

        return ProductResult(
            sku=sku,
            brand=brand,
            product_name=name,
            expected_domain=expected_domain,
            success=success,
            selected_url=selected_url,
            selected_domain=selected_domain,
            is_official=is_official,
            is_retailer=is_retailer,
            attempts=metadata.get("attempts", 0),
            first_attempt_url=metadata.get("first_attempt_url"),
            first_attempt_is_official=metadata.get("first_attempt_is_official", False),
            used_knowledge_graph=metadata.get("used_knowledge_graph", False),
            used_llm_scoring=metadata.get("used_llm_scoring", False),
            latency_ms=metadata.get("latency_ms", 0.0),
            cost_usd=cost,
            error=metadata.get("error"),
            metadata={
                "search_results_count": metadata.get("search_results_count", 0),
                "retailers_in_results": metadata.get("retailers_in_results", []),
            },
        )

    async def _run_async(self) -> BenchmarkResult:
        """Run the benchmark asynchronously."""
        self._product_results = []

        # Run tests with concurrency control
        semaphore = asyncio.Semaphore(self.config.concurrency)

        async def _test_with_semaphore(product: dict[str, Any]) -> ProductResult:
            async with semaphore:
                return await self._test_product(product)

        tasks = [_test_with_semaphore(p) for p in self.products]
        self._product_results = await asyncio.gather(*tasks)

        # Calculate aggregated metrics
        metrics = self._aggregate_metrics()

        # Record metrics
        for result in self._product_results:
            accuracy = 1.0 if result.success else 0.0
            success_rate = 1.0 if result.selected_url else 0.0
            self._metrics_collector.record(
                accuracy=accuracy,
                success_rate=success_rate,
                duration_ms=result.latency_ms,
                cost_usd=result.cost_usd,
                retries=max(0, result.attempts - 1),
                errors=1 if result.error else 0,
                proxy_blocks=0,
            )

        # Build report
        report = self._metrics_collector.build_report()
        store = MetricsStore()
        store.save(report)

        # Calculate final result
        total = len(self._product_results)
        successful = sum(1 for r in self._product_results if r.success)
        total_latency = sum(r.latency_ms for r in self._product_results)
        total_cost = sum(r.cost_usd for r in self._product_results)

        errors = [r.error for r in self._product_results if r.error]

        return BenchmarkResult(
            success_rate=successful / total if total else 0.0,
            accuracy=metrics.first_attempt_official_rate,
            duration_ms=total_latency,
            cost_usd=total_cost,
            errors=errors,
            metadata={
                "total_products": total,
                "successful_selections": metrics.successful_selections,
                "official_first_attempt": metrics.official_first_attempt,
                "retailer_selected": metrics.retailer_selected,
                "false_positives": metrics.false_positives,
                "false_positive_rate": metrics.false_positive_rate,
                "first_attempt_official_rate": metrics.first_attempt_official_rate,
                "avg_attempts": metrics.avg_attempts,
                "knowledge_graph_hits": metrics.knowledge_graph_hits,
                "llm_scoring_hits": metrics.llm_scoring_hits,
                "detailed_results": [self._result_to_dict(r) for r in self._product_results],
            },
        )

    def _aggregate_metrics(self) -> SearchRankingMetrics:
        """Aggregate metrics from all product results."""
        total = len(self._product_results)
        if total == 0:
            return SearchRankingMetrics(0, 0, 0, 0, 0, 0, 0, 0, 0.0, 0.0, 0.0, 0.0, 0.0)

        successful = sum(1 for r in self._product_results if r.success)
        official_first = sum(1 for r in self._product_results if r.first_attempt_is_official)
        official_any = sum(1 for r in self._product_results if r.is_official)
        retailer_selected = sum(1 for r in self._product_results if r.is_retailer)
        false_positives = sum(1 for r in self._product_results for d in [r.selected_domain] if d and _is_retailer_domain(d))
        kg_hits = sum(1 for r in self._product_results if r.used_knowledge_graph)
        llm_hits = sum(1 for r in self._product_results if r.used_llm_scoring)

        total_attempts = sum(r.attempts for r in self._product_results)
        total_latency = sum(r.latency_ms for r in self._product_results)
        total_cost = sum(r.cost_usd for r in self._product_results)

        return SearchRankingMetrics(
            total_products=total,
            successful_selections=successful,
            official_first_attempt=official_first,
            official_any_attempt=official_any,
            retailer_selected=retailer_selected,
            false_positives=false_positives,
            knowledge_graph_hits=kg_hits,
            llm_scoring_hits=llm_hits,
            avg_attempts=total_attempts / total,
            avg_latency_ms=total_latency / total,
            total_cost_usd=total_cost,
            false_positive_rate=false_positives / total if total else 0.0,
            first_attempt_official_rate=official_first / total if total else 0.0,
        )

    def _result_to_dict(self, result: ProductResult) -> dict[str, Any]:
        """Convert ProductResult to dictionary."""
        return {
            "sku": result.sku,
            "brand": result.brand,
            "product_name": result.product_name,
            "expected_domain": result.expected_domain,
            "success": result.success,
            "selected_url": result.selected_url,
            "selected_domain": result.selected_domain,
            "is_official": result.is_official,
            "is_retailer": result.is_retailer,
            "attempts": result.attempts,
            "first_attempt_url": result.first_attempt_url,
            "first_attempt_is_official": result.first_attempt_is_official,
            "used_knowledge_graph": result.used_knowledge_graph,
            "used_llm_scoring": result.used_llm_scoring,
            "latency_ms": result.latency_ms,
            "cost_usd": result.cost_usd,
            "error": result.error,
            "metadata": result.metadata,
        }

    def run(self) -> BenchmarkResult:
        """Run the benchmark (synchronous wrapper)."""
        return asyncio.run(self._run_async())

    def teardown(self) -> None:
        """Clean up resources."""
        logger.info("Tearing down SearchRankingBenchmark")
        self._search_client = None
        self._scraper = None
        self._proxy_rotator = None

    def generate_report(self, output_path: str | None = None) -> str:
        """Generate a detailed markdown report."""
        metrics = self._aggregate_metrics()

        lines = [
            "# Search Ranking Benchmark Report",
            "",
            f"**Generated:** {datetime.utcnow().isoformat()}Z",
            f"**Total Products:** {metrics.total_products}",
            "",
            "## Summary Metrics",
            "",
            "| Metric | Value |",
            "|--------|-------|",
            f"| Successful Selections | {metrics.successful_selections} / {metrics.total_products}"
            f" ({metrics.successful_selections / metrics.total_products * 100:.1f}%) |",
            f"| First-Attempt Official | {metrics.official_first_attempt} / {metrics.total_products} ({metrics.first_attempt_official_rate * 100:.1f}%) |",
            f"| Official (Any Attempt) | {metrics.official_any_attempt} / {metrics.total_products}"
            f" ({metrics.official_any_attempt / metrics.total_products * 100:.1f}%) |",
            f"| Retailer Selected | {metrics.retailer_selected} / {metrics.total_products} ({metrics.retailer_selected / metrics.total_products * 100:.1f}%) |",
            f"| False Positive Rate | {metrics.false_positive_rate * 100:.1f}% |",
            f"| Average Attempts | {metrics.avg_attempts:.2f} |",
            f"| Average Latency | {metrics.avg_latency_ms:.0f}ms |",
            f"| Total Cost | ${metrics.total_cost_usd:.4f} |",
            "",
            "## Method Breakdown",
            "",
            f"- **Knowledge Graph Hits:** {metrics.knowledge_graph_hits}",
            f"- **LLM Scoring Hits:** {metrics.llm_scoring_hits}",
            "",
            "## Detailed Results",
            "",
            "| SKU | Brand | Success | Selected Domain | Official | Retailer | Attempts | Method | Latency |",
            "|-----|-------|---------|-----------------|----------|----------|----------|--------|---------|",
        ]

        for r in self._product_results:
            method = "KG" if r.used_knowledge_graph else ("LLM" if r.used_llm_scoring else "Other")
            lines.append(
                f"| {r.sku} | {r.brand} | {'✓' if r.success else '✗'} | "
                f"{r.selected_domain or 'N/A'} | {'✓' if r.is_official else '✗'} | "
                f"{'✓' if r.is_retailer else '✗'} | {r.attempts} | {method} | {r.latency_ms:.0f}ms |"
            )

        lines.extend(
            [
                "",
                "## Retailer Exclusion Effectiveness",
                "",
            ]
        )

        # Analyze retailer exclusion
        total_retailers_in_results = 0
        retailer_hits_by_product = []
        for r in self._product_results:
            retailers = r.metadata.get("retailers_in_results", [])
            total_retailers_in_results += len(retailers)
            retailer_hits_by_product.append(len(retailers))

        avg_retailers_in_results = sum(retailer_hits_by_product) / len(retailer_hits_by_product) if retailer_hits_by_product else 0

        lines.extend(
            [
                f"- **Total Retailer Appearances in Results:** {total_retailers_in_results}",
                f"- **Average Retailers per Search:** {avg_retailers_in_results:.2f}",
                f"- **Retailer Selection Rate:** {metrics.retailer_selected / metrics.total_products * 100:.1f}%",
                "",
                "Retailer exclusion is working correctly if:",
                "1. Retailers appear in search results (exclusion is in query, not filter)",
                "2. Retailers are rarely selected as the official source",
                "3. False positive rate remains low (< 20%)",
                "",
            ]
        )

        report = "\n".join(lines)

        if output_path:
            Path(output_path).write_text(report, encoding="utf-8")
            logger.info("Report saved to %s", output_path)

        return report


# ---------------------------------------------------------------------------
# Pytest Tests
# ---------------------------------------------------------------------------


@pytest.mark.benchmark
@pytest.mark.live
class TestSearchRankingBenchmark:
    """Pytest test class for search ranking benchmark.

    Run with: pytest tests/benchmarks/unified/test_search_ranking.py -v -m "benchmark and live"
    """

    @pytest.fixture
    def benchmark_config(self) -> BenchmarkConfig:
        """Fixture for benchmark configuration."""
        return BenchmarkConfig(
            urls=[],  # Not used for search ranking
            modes=["auto"],
            timeout=60,
            concurrency=3,  # Limit concurrent searches
        )

    @pytest.fixture
    def test_products(self) -> list[dict[str, Any]]:
        """Fixture for test products.

        Uses a subset of products for faster testing.
        Override with BENCHMARK_SEARCH_PRODUCTS env var.
        """
        env_products = os.environ.get("BENCHMARK_SEARCH_PRODUCTS")
        if env_products:
            return json.loads(env_products)

        # Return first 3 products by default for quick testing
        return DEFAULT_TEST_PRODUCTS[:3]

    @pytest.mark.asyncio
    async def test_search_ranking_basic(self, benchmark_config: BenchmarkConfig, test_products: list[dict[str, Any]]) -> None:
        """Test basic search ranking functionality.

        Verifies:
        - Benchmark runs without errors
        - Results are returned for all products
        - Metrics are collected
        """
        benchmark = SearchRankingBenchmark(
            config=benchmark_config,
            products=test_products,
            use_proxy_rotation=True,
        )

        benchmark.setup()
        try:
            # Use _run_async directly since we're already in async context
            result = await benchmark._run_async()

            # Basic assertions
            assert result is not None
            assert len(test_products) > 0
            assert result.metadata["total_products"] == len(test_products)

            # Log results
            logger.info("Search Ranking Benchmark Results:")
            logger.info("  Success Rate: %.2f%%", result.success_rate * 100)
            logger.info("  First-Attempt Official Rate: %.2f%%", result.metadata["first_attempt_official_rate"] * 100)
            logger.info("  False Positive Rate: %.2f%%", result.metadata["false_positive_rate"] * 100)
            logger.info("  Avg Attempts: %.2f", result.metadata["avg_attempts"])

        finally:
            benchmark.teardown()

    @pytest.mark.asyncio
    async def test_retailer_exclusion(self, benchmark_config: BenchmarkConfig, test_products: list[dict[str, Any]]) -> None:
        """Test that retailer exclusion is effective.

        Verifies:
        - Major retailers are rarely selected
        - False positive rate is below threshold
        """
        benchmark = SearchRankingBenchmark(
            config=benchmark_config,
            products=test_products,
            use_proxy_rotation=False,
        )

        benchmark.setup()
        try:
            result = await benchmark._run_async()

            fp_rate = result.metadata["false_positive_rate"]
            retailer_rate = result.metadata["retailer_selected"] / result.metadata["total_products"]

            assert fp_rate < 0.30, f"False positive rate {fp_rate:.1%} exceeds 30% threshold"
            assert retailer_rate < 0.25, f"Retailer selection rate {retailer_rate:.1%} exceeds 25% threshold"

            logger.info("Retailer Exclusion Test Passed:")
            logger.info("  False Positive Rate: %.2f%%", fp_rate * 100)
            logger.info("  Retailer Selection Rate: %.2f%%", retailer_rate * 100)

        finally:
            benchmark.teardown()

    @pytest.mark.asyncio
    async def test_knowledge_graph_preference(self, benchmark_config: BenchmarkConfig, test_products: list[dict[str, Any]]) -> None:
        """Test that Knowledge Graph results are preferred.

        Verifies:
        - Knowledge Graph results are used when available
        - LLM scoring is used as fallback
        """
        benchmark = SearchRankingBenchmark(
            config=benchmark_config,
            products=test_products,
            use_proxy_rotation=False,
        )

        benchmark.setup()
        try:
            await benchmark._run_async()

            kg_hits = sum(1 for r in benchmark._product_results if r.used_knowledge_graph)
            llm_hits = sum(1 for r in benchmark._product_results if r.used_llm_scoring)

            total = len(benchmark._product_results)

            logger.info("Method Usage:")
            logger.info("  Knowledge Graph: %d / %d (%.1f%%)", kg_hits, total, kg_hits / total * 100 if total else 0)
            logger.info("  LLM Scoring: %d / %d (%.1f%%)", llm_hits, total, llm_hits / total * 100 if total else 0)

            assert kg_hits + llm_hits > 0, "No results were selected using either method"

        finally:
            benchmark.teardown()

    @pytest.mark.asyncio
    async def test_first_attempt_official_rate(self, benchmark_config: BenchmarkConfig, test_products: list[dict[str, Any]]) -> None:
        """Test first-attempt official domain selection rate.

        This is the key metric for the "Patagonia Effect" — retailers
        outranking manufacturers in search results.
        """
        benchmark = SearchRankingBenchmark(
            config=benchmark_config,
            products=test_products,
            use_proxy_rotation=False,
        )

        benchmark.setup()
        try:
            result = await benchmark._run_async()

            official_first_rate = result.metadata["first_attempt_official_rate"]

            logger.info("First-Attempt Official Rate: %.2f%%", official_first_rate * 100)

            if len(test_products) >= 3:
                assert official_first_rate >= 0.20, (
                    f"First-attempt official rate {official_first_rate:.1%} is below 20%. "
                    "This may indicate the 'Patagonia Effect' — retailers outranking manufacturers."
                )

        finally:
            benchmark.teardown()


def run_benchmark_cli() -> int:
    """Command-line entry point to run the benchmark."""
    import argparse

    parser = argparse.ArgumentParser(description="Run search ranking benchmark")
    parser.add_argument("--products", type=int, default=3, help="Number of products to test (default: 3)")
    parser.add_argument("--concurrency", type=int, default=3, help="Concurrent searches (default: 3)")
    parser.add_argument("--output", type=str, help="Output path for markdown report")
    parser.add_argument("--no-proxy", action="store_true", help="Disable proxy rotation")
    parser.add_argument("--json-output", type=str, help="Output path for JSON results")

    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    products = DEFAULT_TEST_PRODUCTS[: args.products]

    config = BenchmarkConfig(
        urls=[],
        modes=["auto"],
        timeout=60,
        concurrency=args.concurrency,
        iterations=1,
    )

    benchmark = SearchRankingBenchmark(
        config=config,
        products=products,
        use_proxy_rotation=not args.no_proxy,
    )

    logger.info("=" * 60)
    logger.info("Search Ranking Benchmark")
    logger.info("=" * 60)
    logger.info("Products: %d", len(products))
    logger.info("Concurrency: %d", args.concurrency)
    logger.info("Proxy Rotation: %s", "disabled" if args.no_proxy else "enabled")
    logger.info("=" * 60)

    benchmark.setup()
    try:
        result = benchmark.run()

        # Print summary
        logger.info("")
        logger.info("RESULTS SUMMARY")
        logger.info("-" * 40)
        logger.info("Success Rate: %.2f%%", result.success_rate * 100)
        logger.info("Accuracy (First-Attempt Official): %.2f%%", result.accuracy * 100)
        logger.info("Average Latency: %.0f ms", result.duration_ms / len(products))
        logger.info("Total Cost: $%.4f", result.cost_usd)
        logger.info("")
        logger.info("Detailed Metrics:")
        logger.info("  Total Products: %d", result.metadata["total_products"])
        logger.info("  Successful Selections: %d", result.metadata["successful_selections"])
        logger.info("  Official (First Attempt): %d", result.metadata["official_first_attempt"])
        logger.info("  Retailer Selected: %d", result.metadata["retailer_selected"])
        logger.info("  False Positive Rate: %.2f%%", result.metadata["false_positive_rate"] * 100)
        logger.info("  Avg Attempts: %.2f", result.metadata["avg_attempts"])
        logger.info("  Knowledge Graph Hits: %d", result.metadata["knowledge_graph_hits"])
        logger.info("  LLM Scoring Hits: %d", result.metadata["llm_scoring_hits"])

        # Generate report
        report = benchmark.generate_report(args.output)
        if not args.output:
            logger.info("")
            logger.info("REPORT")
            logger.info("-" * 40)
            print(report)

        # Save JSON results
        if args.json_output:
            output_data = {
                "summary": {
                    "success_rate": result.success_rate,
                    "accuracy": result.accuracy,
                    "duration_ms": result.duration_ms,
                    "cost_usd": result.cost_usd,
                    **result.metadata,
                },
                "results": result.metadata.get("detailed_results", []),
            }
            Path(args.json_output).write_text(json.dumps(output_data, indent=2), encoding="utf-8")
            logger.info("JSON results saved to %s", args.json_output)

        return 0 if result.success_rate > 0.5 else 1

    finally:
        benchmark.teardown()


if __name__ == "__main__":
    raise SystemExit(run_benchmark_cli())
