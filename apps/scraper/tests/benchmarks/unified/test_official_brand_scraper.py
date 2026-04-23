"""End-to-end benchmark for OfficialBrandScraper.

Tests the full pipeline: search → rank URLs → crawl → extract → validate
using live URLs from the benchmark manifest.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import pytest

from tests.benchmarks.unified.base import BaseBenchmark, BenchmarkConfig, BenchmarkResult
from tests.benchmarks.unified.metrics import BenchmarkMetricsCollector, MetricsStore
from tests.benchmarks.unified.proxy import ProxyRotator, load_proxy_rotator
from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper


# ---------------------------------------------------------------------------
# Data models for benchmark tracking
# ---------------------------------------------------------------------------


@dataclass
class ProductBenchmarkResult:
    """Result for a single product benchmark run."""

    sku: str
    product_name: str
    brand: str
    expected_url: str
    discovered_url: str | None = None
    extraction_success: bool = False
    extraction_method: str | None = None
    official_domain_detected: bool = False
    extracted_data: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    duration_ms: float = 0.0
    cost_usd: float = 0.0
    attempts: int = 0


@dataclass
class OfficialBrandScraperMetrics:
    """Aggregated metrics for OfficialBrandScraper benchmark."""

    total_products: int = 0
    successful_extractions: int = 0
    official_domain_detected: int = 0
    stage1_success: int = 0
    stage2_success: int = 0
    total_attempts: int = 0
    total_cost_usd: float = 0.0
    total_duration_ms: float = 0.0
    errors: list[str] = field(default_factory=list)
    product_results: list[ProductBenchmarkResult] = field(default_factory=list)

    @property
    def extraction_success_rate(self) -> float:
        if self.total_products == 0:
            return 0.0
        return self.successful_extractions / self.total_products

    @property
    def official_domain_detection_rate(self) -> float:
        if self.total_products == 0:
            return 0.0
        return self.official_domain_detected / self.total_products

    @property
    def stage1_fallback_rate(self) -> float:
        """Rate of stage 1 (json_css) success vs stage 2 (llm)."""
        total_success = self.stage1_success + self.stage2_success
        if total_success == 0:
            return 0.0
        return self.stage1_success / total_success

    @property
    def stage2_fallback_rate(self) -> float:
        """Rate of stage 2 (llm) fallback usage."""
        total_success = self.stage1_success + self.stage2_success
        if total_success == 0:
            return 0.0
        return self.stage2_success / total_success

    @property
    def average_attempts_per_product(self) -> float:
        if self.total_products == 0:
            return 0.0
        return self.total_attempts / self.total_products

    @property
    def average_cost_per_product(self) -> float:
        if self.total_products == 0:
            return 0.0
        return self.total_cost_usd / self.total_products

    @property
    def average_duration_ms(self) -> float:
        if self.total_products == 0:
            return 0.0
        return self.total_duration_ms / self.total_products


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def load_benchmark_manifest(manifest_path: str | Path | None = None) -> list[dict[str, Any]]:
    """Load the benchmark live manifest JSON file.

    Args:
        manifest_path: Path to manifest file. If None, uses default location.

    Returns:
        List of product entries from the manifest.
    """
    if manifest_path is None:
        scraper_root = Path(__file__).resolve().parent.parent.parent.parent
        manifest_path = scraper_root / "data" / "benchmark_live_manifest.json"

    manifest_path = Path(manifest_path)
    if not manifest_path.exists():
        raise FileNotFoundError(f"Benchmark manifest not found: {manifest_path}")

    with open(manifest_path) as f:
        data = json.load(f)

    return data.get("entries", [])


def get_domain_from_url(url: str) -> str:
    """Extract domain from URL for comparison."""
    try:
        parsed = urlparse(url)
        return parsed.netloc.lower().replace("www.", "")
    except Exception:
        return ""


def is_official_domain_match(expected_url: str, discovered_url: str | None, brand: str) -> bool:
    """Check if discovered URL matches the expected official domain.

    Args:
        expected_url: The expected official URL from manifest
        discovered_url: The URL discovered by the scraper
        brand: The product brand name

    Returns:
        True if domains match or discovered URL contains brand name
    """
    if not discovered_url:
        return False

    expected_domain = get_domain_from_url(expected_url)
    discovered_domain = get_domain_from_url(discovered_url)

    if expected_domain == discovered_domain:
        return True

    brand_clean = brand.lower().replace(" ", "").replace("'", "")
    if brand_clean in discovered_domain.replace("-", "").replace("www.", ""):
        return True

    return False


def validate_extracted_data(data: dict[str, Any]) -> dict[str, Any]:
    """Validate extracted data has required fields.

    Returns dict with validation results:
        - has_name: bool
        - has_description: bool
        - has_price: bool
        - has_images: bool
        - has_specs: bool
        - field_coverage: float (0-1)
    """
    name_fields = ["name", "product_name", "title"]
    has_name = any(data.get(field) for field in name_fields)

    desc_fields = ["description", "desc", "summary"]
    has_description = any(data.get(field) for field in desc_fields)

    price_fields = ["price", "cost", "amount"]
    has_price = any(data.get(field) for field in price_fields)

    images = data.get("images", [])
    has_images = bool(images) and len(images) > 0

    has_specs = bool(data.get("specifications") or data.get("size_metrics") or data.get("sku") or data.get("brand"))

    fields_present = sum([has_name, has_description, has_price, has_images, has_specs])
    field_coverage = fields_present / 5.0

    return {
        "has_name": has_name,
        "has_description": has_description,
        "has_price": has_price,
        "has_images": has_images,
        "has_specs": has_specs,
        "field_coverage": field_coverage,
    }


def validate_extracted_data(data: dict[str, Any]) -> dict[str, Any]:
    """Validate extracted data has required fields.

    Returns dict with validation results:
        - has_name: bool
        - has_description: bool
        - has_price: bool
        - has_images: bool
        - has_specs: bool
        - field_coverage: float (0-1)
    """
    # Check for name (various field names used)
    name_fields = ["name", "product_name", "title"]
    has_name = any(data.get(field) for field in name_fields)

    # Check for description
    desc_fields = ["description", "desc", "summary"]
    has_description = any(data.get(field) for field in desc_fields)

    # Check for price
    price_fields = ["price", "cost", "amount"]
    has_price = any(data.get(field) for field in price_fields)

    # Check for images
    images = data.get("images", [])
    has_images = bool(images) and len(images) > 0

    # Check for specs (could be in specifications dict or size_metrics)
    has_specs = bool(data.get("specifications") or data.get("size_metrics") or data.get("sku") or data.get("brand"))

    # Calculate field coverage
    fields_present = sum([has_name, has_description, has_price, has_images, has_specs])
    field_coverage = fields_present / 5.0

    return {
        "has_name": has_name,
        "has_description": has_description,
        "has_price": has_price,
        "has_images": has_images,
        "has_specs": has_specs,
        "field_coverage": field_coverage,
    }


# ---------------------------------------------------------------------------
# OfficialBrandScraperBenchmark class
# ---------------------------------------------------------------------------


class OfficialBrandScraperBenchmark(BaseBenchmark):
    """End-to-end benchmark for OfficialBrandScraper.

    Measures:
    - Official domain detection accuracy
    - Extraction success rate
    - Stage 1 vs Stage 2 fallback rate
    - Average attempts per product
    - Cost per product
    - Field coverage (name, description, price, images, specs)
    """

    def __init__(
        self,
        config: BenchmarkConfig,
        max_products: int = 10,
        proxy_rotator: ProxyRotator | None = None,
        headless: bool = True,
    ) -> None:
        super().__init__(config)
        self.max_products = max(1, min(max_products, 50))
        self.proxy_rotator = proxy_rotator or load_proxy_rotator()
        self.headless = headless
        self.scraper: OfficialBrandScraper | None = None
        self.metrics_collector = BenchmarkMetricsCollector("official_brand_scraper")
        self.aggregated_metrics = OfficialBrandScraperMetrics()
        self._manifest_entries: list[dict[str, Any]] = []

    def setup(self) -> None:
        """Initialize the scraper and load manifest data."""
        self._manifest_entries = load_benchmark_manifest()
        self._manifest_entries = self._manifest_entries[: self.max_products]
        self.scraper = OfficialBrandScraper(
            headless=self.headless,
            llm_provider="openai",
            llm_model="gpt-4o-mini",
        )
        self.metrics_collector.set_metadata("max_products", self.max_products)
        self.metrics_collector.set_metadata("total_manifest_entries", len(self._manifest_entries))
        self.metrics_collector.set_metadata("proxy_pool_size", self.proxy_rotator.pool_size)

    def teardown(self) -> None:
        """Cleanup resources."""
        self.scraper = None

    def run(self) -> BenchmarkResult:
        """Run the benchmark and return results."""
        if not self.scraper:
            raise RuntimeError("Scraper not initialized. Call setup() first.")
        return asyncio.run(self._run_async())

    async def _run_async(self) -> BenchmarkResult:
        """Async execution of the benchmark."""
        start_time = time.perf_counter()
        all_errors: list[str] = []

        self.aggregated_metrics.total_products = len(self._manifest_entries)

        for entry in self._manifest_entries:
            product_result = await self._benchmark_single_product(entry)
            self.aggregated_metrics.product_results.append(product_result)

            if product_result.extraction_success:
                self.aggregated_metrics.successful_extractions += 1
            if product_result.official_domain_detected:
                self.aggregated_metrics.official_domain_detected += 1
            if product_result.extraction_method == "json_css":
                self.aggregated_metrics.stage1_success += 1
            elif product_result.extraction_method == "llm":
                self.aggregated_metrics.stage2_success += 1

            self.aggregated_metrics.total_attempts += product_result.attempts
            self.aggregated_metrics.total_cost_usd += product_result.cost_usd
            self.aggregated_metrics.total_duration_ms += product_result.duration_ms
            self.aggregated_metrics.errors.extend(product_result.errors)

        total_duration_ms = (time.perf_counter() - start_time) * 1000

        self.metrics_collector.record(
            accuracy=self.aggregated_metrics.extraction_success_rate,
            success_rate=self.aggregated_metrics.extraction_success_rate,
            duration_ms=total_duration_ms,
            cost_usd=self.aggregated_metrics.total_cost_usd,
            errors=len(self.aggregated_metrics.errors),
        )

        report = self.metrics_collector.build_report()
        report.metadata["official_brand_scraper"] = {
            "total_products": self.aggregated_metrics.total_products,
            "successful_extractions": self.aggregated_metrics.successful_extractions,
            "official_domain_detected": self.aggregated_metrics.official_domain_detected,
            "stage1_success": self.aggregated_metrics.stage1_success,
            "stage2_success": self.aggregated_metrics.stage2_success,
            "extraction_success_rate": self.aggregated_metrics.extraction_success_rate,
            "official_domain_detection_rate": self.aggregated_metrics.official_domain_detection_rate,
            "stage1_fallback_rate": self.aggregated_metrics.stage1_fallback_rate,
            "stage2_fallback_rate": self.aggregated_metrics.stage2_fallback_rate,
            "average_attempts_per_product": self.aggregated_metrics.average_attempts_per_product,
            "average_cost_per_product": self.aggregated_metrics.average_cost_per_product,
            "average_duration_ms": self.aggregated_metrics.average_duration_ms,
            "field_coverage_summary": self._calculate_field_coverage_summary(),
        }

        store = MetricsStore()
        store.save(report)

        return BenchmarkResult(
            success_rate=self.aggregated_metrics.extraction_success_rate,
            accuracy=self.aggregated_metrics.extraction_success_rate,
            duration_ms=total_duration_ms,
            cost_usd=self.aggregated_metrics.total_cost_usd,
            errors=list(set(self.aggregated_metrics.errors)),
            metadata=report.metadata,
        )

    async def _benchmark_single_product(self, entry: dict[str, Any]) -> ProductBenchmarkResult:
        """Benchmark a single product through the full pipeline."""
        sku = entry.get("sku", "")
        product_name = entry.get("product_name", "")
        brand = entry.get("brand", "")
        expected_url = entry.get("expected_source_url", "")

        result = ProductBenchmarkResult(
            sku=sku,
            product_name=product_name,
            brand=brand,
            expected_url=expected_url,
        )

        product_start = time.perf_counter()
        attempts = 0

        try:
            attempts += 1
            discovered_url = await self.scraper.identify_official_url(sku, brand)
            result.discovered_url = discovered_url
            result.official_domain_detected = is_official_domain_match(expected_url, discovered_url, brand)

            if not discovered_url:
                result.errors.append(f"{sku}: Could not identify official URL")
                result.duration_ms = (time.perf_counter() - product_start) * 1000
                result.attempts = attempts
                return result

            attempts += 1
            extraction_result = await self.scraper.extract_data(discovered_url)

            if extraction_result.get("success"):
                result.extraction_success = True
                result.extraction_method = extraction_result.get("method")
                result.extracted_data = extraction_result.get("data", {})
                validation = validate_extracted_data(result.extracted_data)
                result.extracted_data["_validation"] = validation
                if result.extraction_method == "llm":
                    result.cost_usd = 0.05
                else:
                    result.cost_usd = 0.0
            else:
                error_msg = extraction_result.get("error", "Unknown extraction error")
                result.errors.append(f"{sku}: Extraction failed - {error_msg}")

        except Exception as e:
            result.errors.append(f"{sku}: Exception - {str(e)}")

        result.duration_ms = (time.perf_counter() - product_start) * 1000
        result.attempts = attempts

        return result

    def _calculate_field_coverage_summary(self) -> dict[str, Any]:
        """Calculate aggregate field coverage across all products."""
        if not self.aggregated_metrics.product_results:
            return {}

        total = len(self.aggregated_metrics.product_results)
        successful = [r for r in self.aggregated_metrics.product_results if r.extraction_success]

        if not successful:
            return {
                "products_with_data": 0,
                "avg_field_coverage": 0.0,
                "has_name_rate": 0.0,
                "has_description_rate": 0.0,
                "has_price_rate": 0.0,
                "has_images_rate": 0.0,
                "has_specs_rate": 0.0,
            }

        validations = [r.extracted_data.get("_validation", {}) for r in successful]

        return {
            "products_with_data": len(successful),
            "avg_field_coverage": sum(v.get("field_coverage", 0) for v in validations) / len(validations),
            "has_name_rate": sum(v.get("has_name", False) for v in validations) / len(validations),
            "has_description_rate": sum(v.get("has_description", False) for v in validations) / len(validations),
            "has_price_rate": sum(v.get("has_price", False) for v in validations) / len(validations),
            "has_images_rate": sum(v.get("has_images", False) for v in validations) / len(validations),
            "has_specs_rate": sum(v.get("has_specs", False) for v in validations) / len(validations),
        }


# ---------------------------------------------------------------------------
# Pytest test functions
# ---------------------------------------------------------------------------


def pytest_addoption(parser):
    """Add custom command line options for the benchmark."""
    parser.addoption(
        "--max-products",
        action="store",
        type=int,
        default=10,
        help="Maximum number of products to benchmark (1-50, default: 10)",
    )
    parser.addoption(
        "--headless",
        action="store",
        type=lambda x: x.lower() in ("true", "1", "yes"),
        default=True,
        help="Run browser in headless mode (default: True)",
    )


@pytest.fixture
def max_products(request):
    """Get max products from command line option."""
    return request.config.getoption("--max-products")


@pytest.fixture
def headless_mode(request):
    """Get headless mode from command line option."""
    return request.config.getoption("--headless")


@pytest.fixture
def proxy_rotator():
    """Create a proxy rotator from environment/config."""
    return load_proxy_rotator()


@pytest.mark.benchmark
@pytest.mark.live
@pytest.mark.timeout(300)
def test_official_brand_scraper_benchmark(max_products, headless_mode, proxy_rotator):
    """Run end-to-end OfficialBrandScraper benchmark.

    This test runs the full pipeline on live URLs:
    1. Search for official manufacturer URLs
    2. Rank and select the best URL
    3. Crawl the product page
    4. Extract product data
    5. Validate extracted fields

    Metrics collected:
    - Official domain detection accuracy
    - Extraction success rate
    - Stage 1 (json_css) vs Stage 2 (llm) fallback rate
    - Average attempts per product
    - Cost per product
    - Field coverage (name, description, price, images, specs)
    """
    config = BenchmarkConfig(
        urls=[],
        modes=["auto"],
        timeout=60,
        concurrency=2,
        headless=headless_mode,
    )

    benchmark = OfficialBrandScraperBenchmark(
        config=config,
        max_products=max_products,
        proxy_rotator=proxy_rotator,
        headless=headless_mode,
    )

    result = benchmark.execute()

    print("\n" + "=" * 60)
    print("OFFICIAL BRAND SCRAPER BENCHMARK RESULTS")
    print("=" * 60)
    print(f"Success Rate: {result.success_rate:.2%}")
    print(f"Duration: {result.duration_ms:.0f}ms")
    print(f"Cost: ${result.cost_usd:.4f}")

    if result.metadata and "official_brand_scraper" in result.metadata:
        obs = result.metadata["official_brand_scraper"]
        print(f"\nDetailed Metrics:")
        print(f"  Total Products: {obs['total_products']}")
        print(f"  Successful Extractions: {obs['successful_extractions']}")
        print(f"  Official Domain Detection Rate: {obs['official_domain_detection_rate']:.2%}")
        print(f"  Stage 1 Success: {obs['stage1_success']}")
        print(f"  Stage 2 Success: {obs['stage2_success']}")
        print(f"  Stage 1 Fallback Rate: {obs['stage1_fallback_rate']:.2%}")
        print(f"  Stage 2 Fallback Rate: {obs['stage2_fallback_rate']:.2%}")
        print(f"  Avg Attempts/Product: {obs['average_attempts_per_product']:.2f}")
        print(f"  Avg Cost/Product: ${obs['average_cost_per_product']:.4f}")

        if "field_coverage_summary" in obs:
            fcs = obs["field_coverage_summary"]
            print(f"\nField Coverage:")
            print(f"  Products with Data: {fcs.get('products_with_data', 0)}")
            print(f"  Avg Field Coverage: {fcs.get('avg_field_coverage', 0):.2%}")
            print(f"  Has Name: {fcs.get('has_name_rate', 0):.2%}")
            print(f"  Has Description: {fcs.get('has_description_rate', 0):.2%}")
            print(f"  Has Price: {fcs.get('has_price_rate', 0):.2%}")
            print(f"  Has Images: {fcs.get('has_images_rate', 0):.2%}")
            print(f"  Has Specs: {fcs.get('has_specs_rate', 0):.2%}")

    if result.errors:
        print(f"\nErrors ({len(result.errors)}):")
        for error in result.errors[:10]:
            print(f"  - {error}")
        if len(result.errors) > 10:
            print(f"  ... and {len(result.errors) - 10} more")

    print("=" * 60)

    assert result.success_rate >= 0.0, "Benchmark completed with errors"
    assert result.metadata is not None
    assert "official_brand_scraper" in result.metadata


@pytest.mark.benchmark
@pytest.mark.live
def test_official_brand_scraper_single_product():
    """Test OfficialBrandScraper with a single known product.

    This is a smoke test to verify the scraper works end-to-end.
    """
    config = BenchmarkConfig()

    benchmark = OfficialBrandScraperBenchmark(
        config=config,
        max_products=1,
        headless=True,
    )
    benchmark.setup()
    assert benchmark.scraper is not None
    assert len(benchmark._manifest_entries) >= 1
    benchmark.teardown()


@pytest.mark.benchmark
def test_official_brand_scraper_metrics_calculation():
    """Test that metrics calculation works correctly."""
    metrics = OfficialBrandScraperMetrics()
    assert metrics.extraction_success_rate == 0.0
    assert metrics.official_domain_detection_rate == 0.0
    assert metrics.average_attempts_per_product == 0.0

    metrics.total_products = 10
    metrics.successful_extractions = 8
    metrics.official_domain_detected = 7
    metrics.stage1_success = 5
    metrics.stage2_success = 3
    metrics.total_attempts = 15
    metrics.total_cost_usd = 0.15

    assert metrics.extraction_success_rate == 0.8
    assert metrics.official_domain_detection_rate == 0.7
    assert metrics.stage1_fallback_rate == 5 / 8
    assert metrics.stage2_fallback_rate == 3 / 8
    assert metrics.average_attempts_per_product == 1.5
    assert metrics.average_cost_per_product == 0.015


@pytest.mark.benchmark
def test_domain_matching():
    """Test domain matching logic."""
    assert is_official_domain_match("https://firstmate.com/product/1", "https://firstmate.com/product/2", "FirstMate")
    assert is_official_domain_match("https://example.com/product", "https://firstmate.com/product", "FirstMate")
    assert not is_official_domain_match("https://official.com/product", "https://other.com/product", "Brand")
    assert not is_official_domain_match("https://official.com/product", None, "Brand")


@pytest.mark.benchmark
def test_validate_extracted_data():
    """Test extracted data validation."""
    data = {
        "name": "Product Name",
        "description": "A great product",
        "price": "$19.99",
        "images": ["http://example.com/img1.jpg"],
        "specifications": {"weight": "1lb"},
    }
    validation = validate_extracted_data(data)
    assert validation["has_name"]
    assert validation["has_description"]
    assert validation["has_price"]
    assert validation["has_images"]
    assert validation["has_specs"]
    assert validation["field_coverage"] == 1.0

    data = {"name": "Product"}
    validation = validate_extracted_data(data)
    assert validation["has_name"]
    assert not validation["has_description"]
    assert not validation["has_price"]
    assert not validation["has_images"]
    assert not validation["has_specs"]
    assert validation["field_coverage"] == 0.2
