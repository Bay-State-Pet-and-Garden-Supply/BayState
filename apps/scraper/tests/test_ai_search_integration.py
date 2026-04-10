from __future__ import annotations

import importlib
import sys
from types import ModuleType
from collections.abc import Awaitable, Callable
from typing import Any, cast, final
from unittest.mock import AsyncMock

pytest = importlib.import_module("pytest")

from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.scoring import SearchScorer


def _install_validation_shim() -> ModuleType | None:
    original_module = sys.modules.get("scrapers.ai_search.validation")
    validation_module = ModuleType("scrapers.ai_search.validation")

    @final
    class ExtractionValidator:
        confidence_threshold: float
        _matching: MatchingUtils
        _scoring: SearchScorer

        def __init__(self, confidence_threshold: float = 0.7):
            self.confidence_threshold = confidence_threshold
            self._matching = MatchingUtils()
            self._scoring = SearchScorer()

        def validate_extraction_match(
            self,
            extraction_result: dict[str, object],
            sku: str,
            product_name: str | None,
            brand: str | None,
            source_url: str,
        ) -> tuple[bool, str]:
            extracted_name = str(extraction_result.get("product_name") or "").strip()
            extracted_brand = str(extraction_result.get("brand") or "").strip()

            if not extraction_result.get("success"):
                return False, str(extraction_result.get("error") or "Extraction failed")

            images = extraction_result.get("images")
            if not isinstance(images, list):
                return False, "Missing product images"
            typed_images = cast(list[object], images)
            if len(typed_images) == 0:
                return False, "Missing product images"

            raw_confidence = extraction_result.get("confidence", 0)
            if isinstance(raw_confidence, (int, float, str)):
                confidence = float(raw_confidence)
            else:
                confidence = 0.0

            if confidence < self.confidence_threshold:
                return False, f"Confidence below threshold ({confidence:.2f} < {self.confidence_threshold:.2f})"

            minimum_domain_confidence = max(self.confidence_threshold, 0.76)
            source_domain = self._scoring.domain_from_url(source_url)
            is_trusted_domain = bool(source_domain) and (
                self._scoring.is_trusted_retailer(source_domain)
                or (bool(brand) and self._matching.normalize_token_text(str(brand)) in self._matching.normalize_token_text(source_domain))
            )
            if confidence + 0.005 < minimum_domain_confidence and not is_trusted_domain:
                return False, f"Confidence too low for untrusted domain ({confidence:.2f} < {minimum_domain_confidence:.2f})"

            source_domain_normalized = self._matching.normalize_token_text(source_domain)
            if brand and source_domain_normalized and self._matching.normalize_token_text(str(brand)) in source_domain_normalized:
                brand_in_name = self._matching.normalize_token_text(str(brand)) in self._matching.normalize_token_text(extracted_name)
                if not brand_in_name:
                    return False, "Source domain brand does not match extracted product title"

            if not self._matching.is_brand_match(brand, extracted_brand, source_url):
                return False, "Brand mismatch with expected product context"

            if product_name and not self._matching.is_name_match(product_name, extracted_name):
                return False, "Product name mismatch with expected product context"

            if product_name and brand and not self._matching.has_specific_token_overlap(product_name, extracted_name, brand):
                if source_domain and self._scoring.is_trusted_retailer(source_domain):
                    return True, "ok"
                return False, "Product title missing specific expected variant tokens"

            if sku:
                combined = (
                    f"{source_url} {extracted_name} {extracted_brand} "
                    f"{extraction_result.get('description') or ''} {extraction_result.get('size_metrics') or ''}"
                ).lower()
                if sku.lower() not in combined:
                    has_strong_signals = (
                        confidence >= 0.8 and bool(extracted_brand) and bool(brand) and self._matching.is_brand_match(brand, extracted_brand, source_url)
                    )
                    if not has_strong_signals:
                        return False, "SKU not found and weak match signals"

            return True, "ok"

    setattr(validation_module, "ExtractionValidator", ExtractionValidator)
    sys.modules["scrapers.ai_search.validation"] = validation_module
    return original_module


_ORIGINAL_VALIDATION_MODULE = _install_validation_shim()

from scrapers.ai_search import AISearchScraper
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.two_step_refiner import RefinementResult

if _ORIGINAL_VALIDATION_MODULE is not None:
    sys.modules["scrapers.ai_search.validation"] = _ORIGINAL_VALIDATION_MODULE
else:
    sys.modules.pop("scrapers.ai_search.validation", None)


pytestmark = pytest.mark.asyncio

SearchResults = list[dict[str, object]]
ExtractionResult = dict[str, object]
ResultFactory = Callable[[str, str, str | None, str | None], Awaitable[ExtractionResult | None]]


@final
class StubSearchClient:
    _results: SearchResults
    _cost_usd: float

    def __init__(self, results: SearchResults, cost_usd: float = 0.0):
        self._results = results
        self._cost_usd = cost_usd

    async def search(self, query: str) -> tuple[SearchResults, None]:
        _ = query
        return self._results, None

    async def search_with_cost(self, query: str) -> tuple[SearchResults, None, float]:
        _ = query
        return self._results, None, self._cost_usd


@final
class StubExtractor:
    _result_factory: ResultFactory

    def __init__(self, result_factory: ResultFactory):
        self._result_factory = result_factory

    async def extract(self, url: str, sku: str, product_name: str | None, brand: str | None) -> ExtractionResult | None:
        return await self._result_factory(url, sku, product_name, brand)


@final
class IntegrationTestScraper(AISearchScraper):
    _search_client: StubSearchClient
    _crawl4ai_extractor: StubExtractor
    _fallback_extractor: StubExtractor

    def __init__(
        self,
        *,
        search_results: SearchResults,
        search_cost_usd: float,
        crawl4ai_result_factory: ResultFactory,
        fallback_result_factory: ResultFactory,
        confidence_threshold: float,
    ):
        super().__init__(confidence_threshold=confidence_threshold)
        self._search_client = StubSearchClient(search_results, cost_usd=search_cost_usd)
        self._crawl4ai_extractor = StubExtractor(crawl4ai_result_factory)
        self._fallback_extractor = StubExtractor(fallback_result_factory)


def _build_scraper(
    monkeypatch,
    *,
    search_results: SearchResults,
    search_cost_usd: float = 0.0,
    crawl4ai_result_factory: ResultFactory,
    fallback_result_factory: ResultFactory,
    confidence_threshold: float,
) -> IntegrationTestScraper:
    module = ModuleType("scrapers.ai_search.crawl4ai_extractor")

    class FakeCrawl4AIExtractor:
        async def extract(self, url: str, sku: str, product_name: str | None, brand: str | None) -> ExtractionResult | None:
            return await crawl4ai_result_factory(url, sku, product_name, brand)

        def __init__(self, **kwargs: object):
            del kwargs

    class FakeFallbackExtractor:
        async def extract(self, url: str, sku: str, product_name: str | None, brand: str | None) -> ExtractionResult | None:
            return await fallback_result_factory(url, sku, product_name, brand)

        def __init__(self, **kwargs: object):
            del kwargs

    setattr(module, "Crawl4AIExtractor", FakeCrawl4AIExtractor)
    setattr(module, "FallbackExtractor", FakeFallbackExtractor)
    monkeypatch.setitem(sys.modules, "scrapers.ai_search.crawl4ai_extractor", module)

    return IntegrationTestScraper(
        confidence_threshold=confidence_threshold,
        search_results=search_results,
        search_cost_usd=search_cost_usd,
        crawl4ai_result_factory=crawl4ai_result_factory,
        fallback_result_factory=fallback_result_factory,
    )


def _make_extraction_result(
    *,
    product_name: str,
    brand: str,
    confidence: float,
    description: str = "Official product page",
    size_metrics: str = "12 oz",
    images: list[str] | None = None,
    categories: list[str] | None = None,
) -> ExtractionResult:
    return {
        "success": True,
        "product_name": product_name,
        "brand": brand,
        "description": description,
        "size_metrics": size_metrics,
        "images": images or ["https://acmepets.com/images/12345.jpg"],
        "categories": categories or ["Dog Toys"],
        "confidence": confidence,
    }


async def test_ai_search_scrape_product_uses_best_result_and_validates_match(monkeypatch) -> None:
    selected_url = "https://acmepets.com/products/12345-squeaky-ball"

    async def fake_crawl4ai_extract(url: str, sku: str, product_name: str | None, brand: str | None) -> ExtractionResult:
        assert url == selected_url
        assert sku == "12345"
        assert product_name == "Squeaky Ball"
        assert brand == "Acme"
        return _make_extraction_result(
            product_name="Acme Squeaky Ball 12345",
            brand="Acme",
            confidence=0.94,
            description="Official product details for SKU 12345",
        )

    async def unexpected_fallback_extract(_url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult | None:
        raise AssertionError("fallback extractor should not be used on the successful path")

    scraper = _build_scraper(
        monkeypatch,
        confidence_threshold=0.7,
        search_results=[
            {
                "url": "https://example.com/blog/best-dog-toys-2026",
                "title": "Best dog toys 2026 review",
                "description": "Top 10 list",
            },
            {
                "url": selected_url,
                "title": "Acme Squeaky Ball 12345",
                "description": "Official product details with price and add to cart",
            },
        ],
        crawl4ai_result_factory=fake_crawl4ai_extract,
        fallback_result_factory=unexpected_fallback_extract,
    )

    result = await scraper.scrape_product(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert result.success is True
    assert result.url == selected_url
    assert result.brand == "Acme"
    assert result.product_name == "Acme Squeaky Ball 12345"
    assert abs(result.confidence - 0.94) < 1e-9


async def test_ai_search_scrape_product_falls_back_when_crawl4ai_returns_none(monkeypatch) -> None:
    selected_url = "https://acmepets.com/products/12345-squeaky-ball"
    crawl4ai_calls: list[str] = []
    fallback_calls: list[str] = []

    async def fake_crawl4ai_extract(url: str, _sku: str, _product_name: str | None, _brand: str | None) -> None:
        crawl4ai_calls.append(url)
        return None

    async def fake_fallback_extract(url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult:
        fallback_calls.append(url)
        return _make_extraction_result(
            product_name="Acme Squeaky Ball 12345",
            brand="Acme",
            confidence=0.91,
            description="Fallback extraction matched SKU 12345",
        )

    scraper = _build_scraper(
        monkeypatch,
        confidence_threshold=0.7,
        search_results=[
            {
                "url": selected_url,
                "title": "Acme Squeaky Ball 12345",
                "description": "Official product details with price and add to cart",
            }
        ],
        crawl4ai_result_factory=fake_crawl4ai_extract,
        fallback_result_factory=fake_fallback_extract,
    )

    result = await scraper.scrape_product(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert result.success is True
    assert result.url == selected_url
    assert crawl4ai_calls == [selected_url]
    assert fallback_calls == [selected_url]


async def test_ai_search_scrape_product_filters_blocked_domains_before_extraction(monkeypatch) -> None:
    selected_url = "https://acmepets.com/products/12345-squeaky-ball"
    extracted_urls: list[str] = []

    async def fake_crawl4ai_extract(url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult:
        extracted_urls.append(url)
        return _make_extraction_result(
            product_name="Acme Squeaky Ball 12345",
            brand="Acme",
            confidence=0.92,
            description="Official product details for SKU 12345",
        )

    async def unexpected_fallback_extract(_url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult | None:
        raise AssertionError("fallback extractor should not be used when the primary extraction succeeds")

    scraper = _build_scraper(
        monkeypatch,
        confidence_threshold=0.7,
        search_results=[
            {
                "url": "https://www.youtube.com/watch?v=12345",
                "title": "Acme Squeaky Ball 12345 review",
                "description": "Video review of the product",
            },
            {
                "url": selected_url,
                "title": "Acme Squeaky Ball 12345",
                "description": "Official product details with price and add to cart",
            },
        ],
        crawl4ai_result_factory=fake_crawl4ai_extract,
        fallback_result_factory=unexpected_fallback_extract,
    )

    result = await scraper.scrape_product(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert result.success is True
    assert result.url == selected_url
    assert extracted_urls == [selected_url]


async def test_ai_search_scrape_product_rejects_low_confidence_extraction(monkeypatch) -> None:
    selected_url = "https://acmepets.com/products/12345-squeaky-ball"

    async def fake_crawl4ai_extract(_url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult:
        return _make_extraction_result(
            product_name="Acme Squeaky Ball 12345",
            brand="Acme",
            confidence=0.62,
            description="Official product details for SKU 12345",
        )

    async def unexpected_fallback_extract(_url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult | None:
        raise AssertionError("fallback extractor should not be used for validation rejection")

    scraper = _build_scraper(
        monkeypatch,
        confidence_threshold=0.8,
        search_results=[
            {
                "url": selected_url,
                "title": "Acme Squeaky Ball 12345",
                "description": "Official product details with price and add to cart",
            }
        ],
        crawl4ai_result_factory=fake_crawl4ai_extract,
        fallback_result_factory=unexpected_fallback_extract,
    )

    result = await scraper.scrape_product(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert result.success is False
    assert result.error is not None
    assert "Confidence below threshold" in result.error


async def test_ai_search_scrape_product_uses_two_step_refined_results_when_improved(monkeypatch) -> None:
    first_pass_url = "https://example.com/products/12345"
    refined_url = "https://acmepets.com/products/12345-squeaky-ball"
    extracted_urls: list[str] = []

    async def fake_crawl4ai_extract(url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult:
        extracted_urls.append(url)
        return _make_extraction_result(
            product_name="Acme Squeaky Ball 12345",
            brand="Acme",
            confidence=0.94,
            description="Official product details for SKU 12345",
        )

    async def unexpected_fallback_extract(_url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult | None:
        raise AssertionError("fallback extractor should not be used on the two-step success path")

    monkeypatch.setenv("AI_SEARCH_ENABLE_TWO_STEP", "true")
    scraper = _build_scraper(
        monkeypatch,
        confidence_threshold=0.7,
        search_results=[
            {
                "url": first_pass_url,
                "title": "Squeaky Ball 12345",
                "description": "Acme product listing teaser",
                "confidence": 0.42,
            }
        ],
        search_cost_usd=0.01,
        crawl4ai_result_factory=fake_crawl4ai_extract,
        fallback_result_factory=unexpected_fallback_extract,
    )
    assert scraper._two_step_refiner is not None
    refiner = cast(Any, scraper._two_step_refiner)
    refiner.refine = AsyncMock(
        return_value=RefinementResult(
            success=True,
            second_pass_results=[
                AISearchResult(
                    success=True,
                    sku="12345",
                    product_name="Acme Squeaky Ball 12345",
                    brand="Acme",
                    description="Official product details for SKU 12345",
                    url=refined_url,
                    source_website="acmepets.com",
                    confidence=0.93,
                    selection_method="two-step-search",
                )
            ],
            second_pass_confidence=0.93,
            product_name_extracted="Acme Squeaky Ball",
            cost_usd=0.02,
            first_pass_confidence=0.42,
            two_step_triggered=True,
            two_step_improved=True,
        )
    )

    result = await scraper.scrape_product(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert result.success is True
    assert result.url == refined_url
    assert result.cost_usd == pytest.approx(0.04)
    assert extracted_urls == [refined_url]
    refine_call = refiner.refine.await_args
    assert refine_call is not None
    assert isinstance(refine_call.args[0], AISearchResult)
    assert refine_call.args[0].url == first_pass_url
    assert refine_call.args[1][0]["url"] == first_pass_url
    assert refine_call.args[2] == pytest.approx(0.42)


async def test_ai_search_scrape_product_falls_back_to_first_pass_when_two_step_errors(monkeypatch) -> None:
    first_pass_url = "https://acmepets.com/products/12345-squeaky-ball"
    extracted_urls: list[str] = []

    async def fake_crawl4ai_extract(url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult:
        extracted_urls.append(url)
        return _make_extraction_result(
            product_name="Acme Squeaky Ball 12345",
            brand="Acme",
            confidence=0.91,
            description="Official product details for SKU 12345",
        )

    async def unexpected_fallback_extract(_url: str, _sku: str, _product_name: str | None, _brand: str | None) -> ExtractionResult | None:
        raise AssertionError("fallback extractor should not be used when first-pass extraction succeeds")

    monkeypatch.setenv("AI_SEARCH_ENABLE_TWO_STEP", "true")
    scraper = _build_scraper(
        monkeypatch,
        confidence_threshold=0.7,
        search_results=[
            {
                "url": first_pass_url,
                "title": "Acme Squeaky Ball 12345",
                "description": "Official product details with price and add to cart",
                "confidence": 0.42,
            }
        ],
        crawl4ai_result_factory=fake_crawl4ai_extract,
        fallback_result_factory=unexpected_fallback_extract,
    )
    assert scraper._two_step_refiner is not None
    refiner = cast(Any, scraper._two_step_refiner)
    refiner.refine = AsyncMock(side_effect=RuntimeError("two-step unavailable"))

    result = await scraper.scrape_product(
        sku="12345",
        product_name="Squeaky Ball",
        brand="Acme",
        category="Dog Toys",
    )

    assert result.success is True
    assert result.url == first_pass_url
    assert extracted_urls == [first_pass_url]
    refiner.refine.assert_awaited_once()
