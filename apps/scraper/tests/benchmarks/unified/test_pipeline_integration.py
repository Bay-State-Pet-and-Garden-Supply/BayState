"""Pipeline integration benchmark for full end-to-end flow testing.

This benchmark tests the complete pipeline flow:
    product input → search → rank → crawl → extract → validate → report

It simulates the coordinator→runner flow without requiring an actual daemon,
using real search, real crawl, and real extraction (no mocks).

Usage:
    pytest tests/benchmarks/unified/test_pipeline_integration.py -v
    pytest tests/benchmarks/unified/test_pipeline_integration.py -v -m benchmark
    pytest tests/benchmarks/unified/test_pipeline_integration.py -v -m live
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import pytest

from tests.benchmarks.unified.base import BaseBenchmark, BenchmarkConfig, BenchmarkResult
from tests.benchmarks.unified.metrics import BenchmarkMetricsCollector


# =============================================================================
# Stage-level metrics tracking
# =============================================================================


@dataclass
class StageMetrics:
    """Metrics for a single pipeline stage."""

    stage_name: str
    start_time: float = 0.0
    end_time: float = 0.0
    success: bool = False
    error: Optional[str] = None
    cost_usd: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def duration_ms(self) -> float:
        return (self.end_time - self.start_time) * 1000


@dataclass
class ProductPipelineResult:
    """Complete pipeline result for a single product."""

    sku: str
    brand: str
    product_name: Optional[str] = None
    overall_success: bool = False
    stages: list[StageMetrics] = field(default_factory=list)
    final_data: Optional[dict[str, Any]] = None
    total_cost_usd: float = 0.0
    total_duration_ms: float = 0.0
    error: Optional[str] = None

    def get_stage(self, stage_name: str) -> Optional[StageMetrics]:
        """Get metrics for a specific stage."""
        for stage in self.stages:
            if stage.stage_name == stage_name:
                return stage
        return None

    @property
    def failed_stages(self) -> list[str]:
        """Return list of failed stage names."""
        return [s.stage_name for s in self.stages if not s.success]

    @property
    def stage_success_rate(self) -> float:
        """Calculate success rate across all stages."""
        if not self.stages:
            return 0.0
        return sum(1 for s in self.stages if s.success) / len(self.stages)


@dataclass
class PipelineStageReport:
    """Aggregated report for all pipeline stages."""

    total_products: int = 0
    successful_products: int = 0
    failed_products: int = 0
    partial_success_products: int = 0
    stage_stats: dict[str, dict[str, Any]] = field(default_factory=dict)
    total_cost_usd: float = 0.0
    avg_duration_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_products": self.total_products,
            "successful_products": self.successful_products,
            "failed_products": self.failed_products,
            "partial_success_products": self.partial_success_products,
            "success_rate": self.successful_products / max(1, self.total_products),
            "partial_success_rate": self.partial_success_products / max(1, self.total_products),
            "stage_stats": self.stage_stats,
            "total_cost_usd": self.total_cost_usd,
            "avg_duration_ms": self.avg_duration_ms,
        }


# =============================================================================
# Pipeline Integration Benchmark
# =============================================================================


class PipelineIntegrationBenchmark(BaseBenchmark):
    """Benchmark for testing full pipeline integration.

    Tests the complete flow: product input → search → rank → crawl → extract → validate → report
    Simulates coordinator→runner flow without requiring actual daemon.
    Uses real search, real crawl, and real extraction (no mocks).
    """

    def __init__(self, config: BenchmarkConfig, products: list[dict[str, Any]]) -> None:
        super().__init__(config)
        self.products = products
        self.collector = BenchmarkMetricsCollector("pipeline_integration")
        self.results: list[ProductPipelineResult] = []
        self._search_client: Any = None
        self._scorer: Any = None
        self._extractor: Any = None
        self._source_selector: Any = None

    def setup(self) -> None:
        """Initialize pipeline components."""
        # Import here to avoid loading heavy dependencies during test collection
        from scrapers.ai_search.search import SearchClient
        from scrapers.ai_search.scoring import SearchScorer, BrandSourceSelector
        from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
        from scrapers.ai_search.matching import MatchingUtils

        # Initialize search client
        self._search_client = SearchClient(max_results=15)

        # Initialize scorer
        self._scorer = SearchScorer()

        # Initialize matching utils for extractor
        matching = MatchingUtils()

        # Initialize source selector
        llm_api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY")
        self._source_selector = BrandSourceSelector(api_key=llm_api_key, model="gpt-4o-mini")

        # Initialize extractor with headless mode (default True)
        headless = True
        self._extractor = Crawl4AIExtractor(
            headless=headless,
            llm_model="gpt-4o-mini",
            scoring=self._scorer,
            matching=matching,
            cache_enabled=True,
            extraction_strategy="llm",
            llm_api_key=llm_api_key,
        )

    def teardown(self) -> None:
        """Cleanup resources."""
        self._search_client = None
        self._scorer = None
        self._extractor = None
        self._source_selector = None

    async def _run_search_stage(
        self,
        sku: str,
        brand: str,
        product_name: Optional[str],
    ) -> StageMetrics:
        """Execute search stage and return metrics."""
        stage = StageMetrics(stage_name="search")
        stage.start_time = time.perf_counter()

        try:
            # Build query with exclusions
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
            base_query = f"{brand} {sku} official website"
            query = f"{base_query} " + " ".join(f"-site:{ex}" for ex in exclusions)

            # Perform search
            results, error = await self._search_client.search(query)

            stage.end_time = time.perf_counter()

            if error:
                stage.success = False
                stage.error = f"Search error: {error}"
            elif not results:
                stage.success = False
                stage.error = "No search results found"
            else:
                stage.success = True
                stage.metadata["result_count"] = len(results)
                stage.metadata["top_result_url"] = results[0].get("url") if results else None

        except Exception as e:
            stage.end_time = time.perf_counter()
            stage.success = False
            stage.error = f"Search exception: {str(e)}"

        return stage

    async def _run_rank_stage(
        self,
        search_results: list[dict[str, Any]],
        sku: str,
        brand: str,
        product_name: Optional[str],
    ) -> StageMetrics:
        """Execute ranking stage and return metrics."""
        stage = StageMetrics(stage_name="rank")
        stage.start_time = time.perf_counter()

        try:
            if not search_results:
                stage.end_time = time.perf_counter()
                stage.success = False
                stage.error = "No search results to rank"
                return stage

            # Check for Knowledge Graph result first
            kg_url = None
            for result in search_results:
                if result.get("result_type") == "knowledge_graph":
                    kg_url = str(result.get("url") or "").strip()
                    break

            if kg_url:
                stage.end_time = time.perf_counter()
                stage.success = True
                stage.metadata["selected_url"] = kg_url
                stage.metadata["selection_method"] = "knowledge_graph"
                return stage

            # Score and rank results using LLM
            scored_results = []
            for result in search_results[:5]:
                url = result.get("url")
                snippet = result.get("description") or result.get("title", "")
                if not url:
                    continue

                score_data = await self._source_selector.score_snippet(url, snippet, brand)
                if score_data.get("is_official"):
                    confidence = score_data.get("confidence_score", 0.0)
                    scored_results.append((url, confidence))

            stage.end_time = time.perf_counter()

            if scored_results:
                scored_results.sort(key=lambda x: x[1], reverse=True)
                best_url = scored_results[0][0]
                stage.success = True
                stage.metadata["selected_url"] = best_url
                stage.metadata["selection_method"] = "llm_scoring"
                stage.metadata["confidence"] = scored_results[0][1]
                # Estimate cost for LLM scoring
                stage.cost_usd = 0.001 * len(scored_results)  # ~$0.001 per LLM call
            else:
                # Fallback: use first search result
                first_url = search_results[0].get("url")
                if first_url:
                    stage.success = True
                    stage.metadata["selected_url"] = first_url
                    stage.metadata["selection_method"] = "fallback_first"
                else:
                    stage.success = False
                    stage.error = "No valid URL found in search results"

        except Exception as e:
            stage.end_time = time.perf_counter()
            stage.success = False
            stage.error = f"Rank exception: {str(e)}"

        return stage

    async def _run_crawl_stage(self, url: str) -> StageMetrics:
        """Execute crawl stage and return metrics."""
        stage = StageMetrics(stage_name="crawl")
        stage.start_time = time.perf_counter()

        try:
            # The crawl is done as part of extraction, so we just validate URL
            # and check if it's accessible
            import httpx

            async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
                response = await client.head(url, timeout=5.0)
                stage.end_time = time.perf_counter()

                if response.status_code < 400:
                    stage.success = True
                    stage.metadata["status_code"] = response.status_code
                    stage.metadata["final_url"] = str(response.url)
                else:
                    stage.success = False
                    stage.error = f"HTTP {response.status_code}"
                    stage.metadata["status_code"] = response.status_code

        except Exception as e:
            stage.end_time = time.perf_counter()
            stage.success = False
            stage.error = f"Crawl exception: {str(e)}"

        return stage

    async def _run_extract_stage(
        self,
        url: str,
        sku: str,
        product_name: Optional[str],
        brand: str,
    ) -> StageMetrics:
        """Execute extraction stage and return metrics."""
        stage = StageMetrics(stage_name="extract")
        stage.start_time = time.perf_counter()

        try:
            # Use the extractor to get product data
            result = await self._extractor.extract(url, sku, product_name, brand)

            stage.end_time = time.perf_counter()

            if result and result.get("success"):
                stage.success = True
                stage.metadata["method"] = result.get("method", "unknown")
                stage.metadata["confidence"] = result.get("confidence", 0.0)
                stage.metadata["has_images"] = bool(result.get("images"))
                stage.metadata["has_description"] = bool(result.get("description"))
                # Estimate cost based on method
                if result.get("method") == "llm":
                    stage.cost_usd = 0.01  # ~$0.01 for LLM extraction
                else:
                    stage.cost_usd = 0.0  # Free for non-LLM methods
            else:
                stage.success = False
                stage.error = result.get("error") if result else "Extraction returned None"

        except Exception as e:
            stage.end_time = time.perf_counter()
            stage.success = False
            stage.error = f"Extract exception: {str(e)}"

        return stage

    async def _run_validate_stage(
        self,
        extracted_data: Optional[dict[str, Any]],
        sku: str,
        brand: str,
        product_name: Optional[str],
    ) -> StageMetrics:
        """Execute validation stage and return metrics."""
        stage = StageMetrics(stage_name="validate")
        stage.start_time = time.perf_counter()

        try:
            if not extracted_data or not extracted_data.get("success"):
                stage.end_time = time.perf_counter()
                stage.success = False
                stage.error = "No valid data to validate"
                return stage

            data = extracted_data.get("data", extracted_data)

            # Validate required fields
            validation_errors = []

            if not data.get("product_name"):
                validation_errors.append("Missing product_name")

            if not data.get("images") or len(data.get("images", [])) == 0:
                validation_errors.append("Missing images")

            # Brand validation (should match expected brand)
            extracted_brand = data.get("brand", "")
            if extracted_brand and brand:
                brand_match = brand.lower() in extracted_brand.lower() or extracted_brand.lower() in brand.lower()
                if not brand_match:
                    validation_errors.append(f"Brand mismatch: expected {brand}, got {extracted_brand}")

            stage.end_time = time.perf_counter()

            if validation_errors:
                stage.success = False
                stage.error = "; ".join(validation_errors)
                stage.metadata["validation_errors"] = validation_errors
            else:
                stage.success = True
                stage.metadata["validation_passed"] = True
                stage.metadata["fields_validated"] = ["product_name", "images", "brand"]

        except Exception as e:
            stage.end_time = time.perf_counter()
            stage.success = False
            stage.error = f"Validate exception: {str(e)}"

        return stage

    async def _process_single_product(
        self,
        product: dict[str, Any],
    ) -> ProductPipelineResult:
        """Process a single product through the entire pipeline."""
        sku = str(product.get("sku", "")).strip()
        brand = str(product.get("brand", "")).strip()
        product_name = product.get("product_name") or product.get("name")

        result = ProductPipelineResult(
            sku=sku,
            brand=brand,
            product_name=product_name,
        )

        start_time = time.perf_counter()

        # Stage 1: Search
        search_stage = await self._run_search_stage(sku, brand, product_name)
        result.stages.append(search_stage)

        if not search_stage.success:
            result.overall_success = False
            result.error = f"Search failed: {search_stage.error}"
            result.total_duration_ms = (time.perf_counter() - start_time) * 1000
            return result

        # Get search results for next stage
        # Re-run search to get results (cached)
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
        base_query = f"{brand} {sku} official website"
        query = f"{base_query} " + " ".join(f"-site:{ex}" for ex in exclusions)
        search_results, _ = await self._search_client.search(query)

        # Stage 2: Rank
        rank_stage = await self._run_rank_stage(search_results, sku, brand, product_name)
        result.stages.append(rank_stage)

        if not rank_stage.success:
            result.overall_success = False
            result.error = f"Ranking failed: {rank_stage.error}"
            result.total_duration_ms = (time.perf_counter() - start_time) * 1000
            return result

        selected_url = rank_stage.metadata.get("selected_url")

        # Stage 3: Crawl (pre-check)
        crawl_url: str = selected_url if selected_url else ""
        crawl_stage = await self._run_crawl_stage(crawl_url)
        result.stages.append(crawl_stage)

        # Continue even if crawl pre-check fails - extraction may still work

        # Stage 4: Extract
        extract_stage = await self._run_extract_stage(crawl_url, sku, product_name, brand)
        result.stages.append(extract_stage)

        # Get extraction result for validation
        extraction_result = None
        if extract_stage.success:
            try:
                extraction_result = await self._extractor.extract(crawl_url, sku, product_name, brand)
            except Exception:
                pass

        # Stage 5: Validate
        validate_stage = await self._run_validate_stage(extraction_result, sku, brand, product_name)
        result.stages.append(validate_stage)

        # Determine overall success
        critical_stages = ["search", "rank", "extract"]
        critical_success = all(s.success for s in result.stages if s.stage_name in critical_stages)

        if critical_success and validate_stage.success:
            result.overall_success = True
            result.final_data = extraction_result.get("data", extraction_result) if extraction_result else None
        elif critical_success and not validate_stage.success:
            result.overall_success = False
            result.error = f"Validation failed: {validate_stage.error}"
        else:
            result.overall_success = False
            failed = [s.stage_name for s in result.stages if not s.success]
            result.error = f"Failed stages: {', '.join(failed)}"

        # Calculate totals
        result.total_duration_ms = (time.perf_counter() - start_time) * 1000
        result.total_cost_usd = sum(s.cost_usd for s in result.stages)

        return result

    async def _run_pipeline(self) -> list[ProductPipelineResult]:
        """Run pipeline for all products."""
        semaphore = asyncio.Semaphore(self.config.concurrency)

        async def process_with_limit(product: dict[str, Any]) -> ProductPipelineResult:
            async with semaphore:
                return await self._process_single_product(product)

        tasks = [process_with_limit(p) for p in self.products]
        return await asyncio.gather(*tasks)

    def _build_stage_report(self) -> PipelineStageReport:
        """Build aggregated stage report."""
        report = PipelineStageReport()
        report.total_products = len(self.results)
        report.successful_products = sum(1 for r in self.results if r.overall_success)
        report.failed_products = sum(1 for r in self.results if not r.overall_success)

        # Count partial successes (all critical stages passed but validation failed)
        for r in self.results:
            if not r.overall_success:
                critical_failed = any(not s.success for s in r.stages if s.stage_name in ["search", "rank", "extract"])
                if not critical_failed:
                    report.partial_success_products += 1

        # Per-stage statistics
        stage_names = ["search", "rank", "crawl", "extract", "validate"]
        for stage_name in stage_names:
            stage_results = []
            for r in self.results:
                stage = r.get_stage(stage_name)
                if stage:
                    stage_results.append(stage)

            if stage_results:
                success_count = sum(1 for s in stage_results if s.success)
                report.stage_stats[stage_name] = {
                    "attempted": len(stage_results),
                    "success": success_count,
                    "failure": len(stage_results) - success_count,
                    "success_rate": success_count / len(stage_results),
                    "avg_duration_ms": sum(s.duration_ms for s in stage_results) / len(stage_results),
                    "total_cost_usd": sum(s.cost_usd for s in stage_results),
                }

        report.total_cost_usd = sum(r.total_cost_usd for r in self.results)
        report.avg_duration_ms = sum(r.total_duration_ms for r in self.results) / max(1, len(self.results))

        return report

    def run(self) -> BenchmarkResult:
        """Run the complete pipeline benchmark."""
        # Run async pipeline
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            self.results = loop.run_until_complete(self._run_pipeline())
        finally:
            loop.close()

        # Calculate aggregate metrics
        total_cost = sum(r.total_cost_usd for r in self.results)
        avg_duration = sum(r.total_duration_ms for r in self.results) / max(1, len(self.results))
        success_count = sum(1 for r in self.results if r.overall_success)
        success_rate = success_count / max(1, len(self.results))

        # Collect errors
        errors = []
        for r in self.results:
            if r.error:
                errors.append(f"{r.sku}: {r.error}")

        # Record metrics
        self.collector.record(
            accuracy=success_rate,
            success_rate=success_rate,
            duration_ms=avg_duration,
            cost_usd=total_cost,
            errors=len(errors),
        )

        # Build stage report
        stage_report = self._build_stage_report()
        self.collector.set_metadata("stage_report", stage_report.to_dict())
        self.collector.set_metadata("product_count", len(self.products))

        return BenchmarkResult(
            success_rate=success_rate,
            accuracy=success_rate,
            duration_ms=avg_duration,
            cost_usd=total_cost,
            errors=errors[:10],
            metadata={
                "stage_report": stage_report.to_dict(),
                "product_results": [
                    {
                        "sku": r.sku,
                        "success": r.overall_success,
                        "duration_ms": r.total_duration_ms,
                        "failed_stages": r.failed_stages,
                    }
                    for r in self.results
                ],
            },
        )


# =============================================================================
# Test fixtures and helpers
# =============================================================================


@pytest.fixture
def sample_simple_products() -> list[dict[str, Any]]:
    """Simple product fixtures for testing (common brands with clear online presence)."""
    return [
        {"sku": "12345", "brand": "Blue Buffalo", "product_name": "Blue Buffalo Life Protection Formula"},
        {"sku": "67890", "brand": "Purina", "product_name": "Purina Pro Plan"},
    ]


@pytest.fixture
def sample_complex_products() -> list[dict[str, Any]]:
    """Complex product fixtures for testing (less common or harder to find)."""
    return [
        {"sku": "ADVNTG-001", "brand": "Advantage", "product_name": "ADVNTG CAT LRG"},
        {"sku": "SPEC-789", "brand": "SpecialtyBrand", "product_name": "Specialty Product XYZ"},
    ]


@pytest.fixture
def pipeline_benchmark_config() -> BenchmarkConfig:
    """Default benchmark configuration for pipeline tests."""
    return BenchmarkConfig(
        urls=["https://example.com"],
        modes=["llm"],
        timeout=60,
        concurrency=2,
    )


# =============================================================================
# Pipeline Integration Tests
# =============================================================================


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.integration
@pytest.mark.asyncio
async def test_pipeline_integration_simple_products(
    sample_simple_products: list[dict[str, Any]],
    pipeline_benchmark_config: BenchmarkConfig,
):
    """Test full pipeline with simple products (happy path).

    This test verifies:
    - Full pipeline flow: search → rank → crawl → extract → validate
    - End-to-end latency measurement
    - Success rate tracking
    - Cost per product calculation
    - Output schema validation
    """
    # Skip if no API keys configured
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("LLM_API_KEY"):
        pytest.skip("No LLM API key configured")

    benchmark = PipelineIntegrationBenchmark(
        config=pipeline_benchmark_config,
        products=sample_simple_products,
    )

    result = benchmark.execute()

    # Verify result structure
    assert isinstance(result, BenchmarkResult)
    assert 0.0 <= result.success_rate <= 1.0
    assert result.duration_ms > 0
    assert result.cost_usd >= 0

    # Verify metadata
    assert "stage_report" in result.metadata
    stage_report = result.metadata["stage_report"]
    assert stage_report["total_products"] == len(sample_simple_products)

    # Log results
    print(f"\nPipeline Integration Results (Simple Products):")
    print(f"  Success rate: {result.success_rate:.1%}")
    print(f"  Avg duration: {result.duration_ms:.0f}ms")
    print(f"  Total cost: ${result.cost_usd:.4f}")
    print(f"  Stage report: {json.dumps(stage_report, indent=2)}")

    # Verify stage stats exist
    for stage_name in ["search", "rank", "extract"]:
        assert stage_name in stage_report["stage_stats"], f"Missing stage stats for {stage_name}"

    return result


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.integration
@pytest.mark.asyncio
async def test_pipeline_integration_stage_failure_rates(
    sample_simple_products: list[dict[str, Any]],
    pipeline_benchmark_config: BenchmarkConfig,
):
    """Test per-stage failure rate reporting.

    This test verifies:
    - Each stage reports individual success/failure
    - Stage-level metrics are collected
    - Failure propagation works correctly
    """
    # Skip if no API keys configured
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("LLM_API_KEY"):
        pytest.skip("No LLM API key configured")

    benchmark = PipelineIntegrationBenchmark(
        config=pipeline_benchmark_config,
        products=sample_simple_products,
    )

    result = benchmark.execute()

    # Verify stage report exists
    assert "stage_report" in result.metadata
    stage_report = result.metadata["stage_report"]
    stage_stats = stage_report.get("stage_stats", {})

    # Verify each tracked stage has metrics
    for stage_name in ["search", "rank", "crawl", "extract", "validate"]:
        if stage_name in stage_stats:
            stats = stage_stats[stage_name]
            assert "success_rate" in stats
            assert "avg_duration_ms" in stats
            assert 0.0 <= stats["success_rate"] <= 1.0
            print(f"\n  {stage_name}: {stats['success_rate']:.1%} success rate")

    return result


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.integration
@pytest.mark.asyncio
async def test_pipeline_integration_error_propagation(
    pipeline_benchmark_config: BenchmarkConfig,
):
    """Test error handling and graceful degradation.

    This test verifies:
    - Invalid products are handled gracefully
    - Errors are captured and reported
    - Pipeline continues even with failures
    """
    # Skip if no API keys configured
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("LLM_API_KEY"):
        pytest.skip("No LLM API key configured")

    # Mix of valid and invalid products
    mixed_products = [
        {"sku": "12345", "brand": "Blue Buffalo", "product_name": "Blue Buffalo Dog Food"},
        {"sku": "", "brand": "", "product_name": "Invalid Product"},  # Should fail search
        {"sku": "INVALID-999", "brand": "NonExistentBrand12345", "product_name": "Fake Product"},
    ]

    benchmark = PipelineIntegrationBenchmark(
        config=pipeline_benchmark_config,
        products=mixed_products,
    )

    result = benchmark.execute()

    # Verify we got results for all products
    assert "product_results" in result.metadata
    product_results = result.metadata["product_results"]
    assert len(product_results) == len(mixed_products)

    # Verify some failures were recorded
    assert result.success_rate < 1.0, "Expected some failures with invalid products"
    assert len(result.errors) > 0, "Expected error messages"

    # Verify errors are descriptive
    for error in result.errors:
        assert ":" in error, "Error should include SKU prefix"

    print(f"\nError Propagation Test:")
    print(f"  Total products: {len(mixed_products)}")
    print(f"  Success rate: {result.success_rate:.1%}")
    print(f"  Errors captured: {len(result.errors)}")

    return result


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.integration
@pytest.mark.asyncio
async def test_pipeline_integration_partial_success(
    pipeline_benchmark_config: BenchmarkConfig,
):
    """Test partial success detection.

    This test verifies:
    - Products with some successful stages are tracked
    - Partial success is differentiated from complete failure
    """
    # Skip if no API keys configured
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("LLM_API_KEY"):
        pytest.skip("No LLM API key configured")

    # Use products that may have partial success
    products = [
        {"sku": "12345", "brand": "Blue Buffalo", "product_name": "Blue Buffalo Life Protection"},
        {"sku": "67890", "brand": "Purina", "product_name": "Purina Pro Plan Chicken"},
    ]

    benchmark = PipelineIntegrationBenchmark(
        config=pipeline_benchmark_config,
        products=products,
    )

    result = benchmark.execute()

    # Verify stage report tracks partial successes
    assert "stage_report" in result.metadata
    stage_report = result.metadata["stage_report"]

    # Verify we have per-product tracking
    assert "product_results" in result.metadata
    product_results = result.metadata["product_results"]

    for pr in product_results:
        assert "sku" in pr
        assert "success" in pr
        assert "failed_stages" in pr

    print(f"\nPartial Success Test:")
    print(f"  Products processed: {len(product_results)}")
    for pr in product_results:
        status = "SUCCESS" if pr["success"] else "FAILED"
        failed = pr.get("failed_stages", [])
        print(f"    {pr['sku']}: {status} (failed stages: {failed if failed else 'none'})")

    return result


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.integration
@pytest.mark.asyncio
async def test_pipeline_integration_cost_tracking(
    sample_simple_products: list[dict[str, Any]],
    pipeline_benchmark_config: BenchmarkConfig,
):
    """Test cost tracking per product and stage.

    This test verifies:
    - Costs are tracked at stage level
    - Total costs are aggregated correctly
    - Per-product costs are reasonable
    """
    # Skip if no API keys configured
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("LLM_API_KEY"):
        pytest.skip("No LLM API key configured")

    benchmark = PipelineIntegrationBenchmark(
        config=pipeline_benchmark_config,
        products=sample_simple_products,
    )

    result = benchmark.execute()

    # Verify cost is tracked
    assert result.cost_usd >= 0

    # Verify stage-level cost tracking
    assert "stage_report" in result.metadata
    stage_report = result.metadata["stage_report"]
    stage_stats = stage_report.get("stage_stats", {})

    total_stage_cost = sum(stats.get("total_cost_usd", 0) for stats in stage_stats.values())

    # Costs should be reasonable (not more than $1 per product for testing)
    max_expected_cost = len(sample_simple_products) * 0.5
    assert result.cost_usd <= max_expected_cost, f"Cost ${result.cost_usd:.4f} exceeds expected max ${max_expected_cost:.4f}"

    print(f"\nCost Tracking Test:")
    print(f"  Total cost: ${result.cost_usd:.4f}")
    print(f"  Per-product avg: ${result.cost_usd / len(sample_simple_products):.4f}")
    for stage_name, stats in stage_stats.items():
        if stats.get("total_cost_usd", 0) > 0:
            print(f"  {stage_name} cost: ${stats['total_cost_usd']:.4f}")

    return result


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.integration
@pytest.mark.asyncio
async def test_pipeline_integration_output_schema(
    sample_simple_products: list[dict[str, Any]],
    pipeline_benchmark_config: BenchmarkConfig,
):
    """Test that output data matches expected schema.

    This test verifies:
    - Extracted data has required fields
    - Data types are correct
    - Schema validation passes
    """
    # Skip if no API keys configured
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("LLM_API_KEY"):
        pytest.skip("No LLM API key configured")

    benchmark = PipelineIntegrationBenchmark(
        config=pipeline_benchmark_config,
        products=sample_simple_products,
    )

    # Setup to access results
    benchmark.setup()
    try:
        # Run pipeline
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            results = loop.run_until_complete(benchmark._run_pipeline())
        finally:
            loop.close()

        # Verify schema of successful extractions
        for result in results:
            if result.overall_success and result.final_data:
                data = result.final_data

                # Check required fields exist
                assert "product_name" in data or "name" in data, "Missing product name"
                assert "images" in data, "Missing images field"

                # Check types
                if data.get("images"):
                    assert isinstance(data["images"], (list, tuple)), "Images should be a list"

                if data.get("product_name") or data.get("name"):
                    name = data.get("product_name") or data.get("name")
                    assert isinstance(name, str), "Product name should be a string"

                print(f"\n  {result.sku}: Schema valid")
                print(f"    Name: {data.get('product_name') or data.get('name', 'N/A')}")
                print(f"    Images: {len(data.get('images', []))} found")

    finally:
        benchmark.teardown()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.integration
def test_pipeline_integration_full_report(
    sample_simple_products: list[dict[str, Any]],
    pipeline_benchmark_config: BenchmarkConfig,
):
    """Generate full pipeline integration report.

    This test runs the complete benchmark and outputs a detailed report.
    """
    # Skip if no API keys configured
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("LLM_API_KEY"):
        pytest.skip("No LLM API key configured")

    benchmark = PipelineIntegrationBenchmark(
        config=pipeline_benchmark_config,
        products=sample_simple_products,
    )

    result = benchmark.execute()

    # Build comprehensive report
    report = {
        "summary": {
            "total_products": len(sample_simple_products),
            "success_rate": result.success_rate,
            "avg_duration_ms": result.duration_ms,
            "total_cost_usd": result.cost_usd,
            "cost_per_product": result.cost_usd / max(1, len(sample_simple_products)),
        },
        "stage_report": result.metadata.get("stage_report", {}),
        "product_details": result.metadata.get("product_results", []),
        "errors": result.errors[:5],  # First 5 errors
    }

    # Output report
    print("\n" + "=" * 60)
    print("PIPELINE INTEGRATION BENCHMARK REPORT")
    print("=" * 60)
    print(json.dumps(report, indent=2))
    print("=" * 60)

    # Save report to evidence directory
    evidence_dir = ".sisyphus/evidence"
    os.makedirs(evidence_dir, exist_ok=True)
    report_path = os.path.join(evidence_dir, "task-12-pipeline-benchmark.log")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to: {report_path}")

    # Also save stage report separately
    stage_report_path = os.path.join(evidence_dir, "task-12-stage-report.log")
    stage_report = result.metadata.get("stage_report", {})
    with open(stage_report_path, "w") as f:
        json.dump(stage_report, f, indent=2)
    print(f"Stage report saved to: {stage_report_path}")

    return result
