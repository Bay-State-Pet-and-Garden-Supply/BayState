"""Unit tests for SKU-first extraction mode."""

# pyright: reportPrivateUsage=false, reportAttributeAccessIssue=false, reportUnknownMemberType=false

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from scrapers.ai_search.batch_search import SearchResult
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scraper import AISearchScraper


def _build_scraper() -> AISearchScraper:
    scraper = object.__new__(AISearchScraper)
    scraper.prefer_manufacturer = True
    scraper._scoring = MagicMock()
    scraper._validator = MagicMock()
    scraper._heuristic_source_selection = MagicMock()
    scraper._is_blocked_url = MagicMock(return_value=False)
    scraper._should_skip_url = AsyncMock(return_value=False)
    scraper._extract_product_data = AsyncMock()
    scraper._build_discovery_result = MagicMock()
    return scraper


@pytest.fixture
def scraper() -> AISearchScraper:
    return _build_scraper()


@pytest.fixture
def search_results() -> list[SearchResult]:
    return [
        SearchResult(
            url="https://brand.example/products/sku-123",
            title="Brand Example Product",
            description="Official product page",
        ),
        SearchResult(
            url="https://retailer.example/products/sku-123",
            title="Retailer Product",
            description="Retailer listing",
        ),
    ]


def _ranked_candidates(*urls: str) -> list[dict[str, str]]:
    return [{"url": url, "title": url, "description": url} for url in urls]


@pytest.mark.asyncio
async def test_sku_first_extraction_success(
    scraper: AISearchScraper,
    search_results: list[SearchResult],
) -> None:
    scraper._scoring.prepare_search_results.return_value = _ranked_candidates(
        "https://brand.example/products/sku-123",
        "https://retailer.example/products/sku-123",
    )
    scraper._scoring.is_low_quality_result.return_value = False
    scraper._heuristic_source_selection.return_value = "https://brand.example/products/sku-123"
    scraper._extract_product_data.return_value = {
        "success": True,
        "product_name": "Ultra Kibble",
        "brand": "Acme",
        "confidence": 0.91,
    }
    scraper._validator.validate_extraction_match.return_value = (True, None)
    scraper._build_discovery_result.return_value = AISearchResult(
        success=True,
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        url="https://brand.example/products/sku-123",
        confidence=0.91,
    )

    result = await scraper._extract_sku_first_batch_result(
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        search_results=search_results,
    )

    assert result.success is True
    assert result.product_name == "Ultra Kibble"
    assert result.brand == "Acme"
    scraper._extract_product_data.assert_awaited_once_with(
        "https://brand.example/products/sku-123",
        "SKU-123",
        "Ultra Kibble",
        "Acme",
    )


@pytest.mark.asyncio
async def test_sku_first_extraction_failure_for_missing_results(scraper: AISearchScraper) -> None:
    result = await scraper._extract_sku_first_batch_result(
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        search_results=[],
    )

    assert result.success is False
    assert result.error == "No results found"


@pytest.mark.asyncio
async def test_sku_first_extraction_failure_for_invalid_products(
    scraper: AISearchScraper,
    search_results: list[SearchResult],
) -> None:
    scraper._scoring.prepare_search_results.return_value = _ranked_candidates(
        "https://brand.example/products/sku-123",
        "https://retailer.example/products/sku-123",
    )
    scraper._scoring.is_low_quality_result.return_value = False
    scraper._heuristic_source_selection.return_value = None
    scraper._extract_product_data.return_value = {
        "success": True,
        "product_name": "Wrong Product",
        "brand": "Wrong Brand",
    }
    scraper._validator.validate_extraction_match.return_value = (False, "Brand mismatch")

    result = await scraper._extract_sku_first_batch_result(
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        search_results=search_results,
    )

    assert result.success is False
    assert result.error == "Brand mismatch"
    assert scraper._extract_product_data.await_count == 2


@pytest.mark.asyncio
async def test_sku_first_uses_url_fallback_when_primary_fails(
    scraper: AISearchScraper,
    search_results: list[SearchResult],
) -> None:
    scraper._scoring.prepare_search_results.return_value = _ranked_candidates(
        "https://brand.example/products/sku-123",
        "https://retailer.example/products/sku-123",
    )
    scraper._scoring.is_low_quality_result.return_value = False
    scraper._heuristic_source_selection.return_value = "https://brand.example/products/sku-123"
    scraper._extract_product_data.side_effect = [
        {"success": False, "error": "timeout"},
        {"success": True, "product_name": "Ultra Kibble", "brand": "Acme", "confidence": 0.8},
    ]
    scraper._validator.validate_extraction_match.side_effect = [
        (False, "timeout"),
        (True, None),
    ]
    scraper._build_discovery_result.return_value = AISearchResult(
        success=True,
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        url="https://retailer.example/products/sku-123",
        confidence=0.8,
    )

    result = await scraper._extract_sku_first_batch_result(
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        search_results=search_results,
    )

    assert result.success is True
    assert scraper._extract_product_data.await_count == 2
    assert scraper._validator.validate_extraction_match.call_count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("brand", "product_name", "rejection_reason"),
    [
        ("Acme", "Ultra Kibble", "Brand mismatch"),
        (None, "Ultra Kibble", "Name mismatch"),
        ("Acme", None, "Brand mismatch"),
    ],
)
async def test_sku_first_passes_brand_and_name_context_to_validation(
    scraper: AISearchScraper,
    search_results: list[SearchResult],
    brand: str | None,
    product_name: str | None,
    rejection_reason: str,
) -> None:
    scraper._scoring.prepare_search_results.return_value = _ranked_candidates(
        "https://brand.example/products/sku-123",
    )
    scraper._scoring.is_low_quality_result.return_value = False
    scraper._heuristic_source_selection.return_value = None
    scraper._extract_product_data.return_value = {
        "success": True,
        "product_name": "Candidate Name",
        "brand": "Candidate Brand",
    }
    scraper._validator.validate_extraction_match.return_value = (False, rejection_reason)

    result = await scraper._extract_sku_first_batch_result(
        sku="SKU-123",
        product_name=product_name,
        brand=brand,
        search_results=search_results,
    )

    assert result.success is False
    assert result.error == rejection_reason
    scraper._validator.validate_extraction_match.assert_called_with(
        extraction_result={
            "success": True,
            "product_name": "Candidate Name",
            "brand": "Candidate Brand",
            "url": "https://brand.example/products/sku-123",
        },
        sku="SKU-123",
        product_name=product_name,
        brand=brand,
        source_url="https://brand.example/products/sku-123",
    )


@pytest.mark.asyncio
async def test_sku_first_skips_primary_and_succeeds_on_unblocked_candidate(
    scraper: AISearchScraper,
    search_results: list[SearchResult],
) -> None:
    scraper._scoring.prepare_search_results.return_value = _ranked_candidates(
        "https://brand.example/products/sku-123",
        "https://retailer.example/products/sku-123",
    )
    scraper._scoring.is_low_quality_result.return_value = False
    scraper._heuristic_source_selection.return_value = None
    scraper._is_blocked_url.side_effect = [True, False]
    scraper._extract_product_data.return_value = {
        "success": True,
        "product_name": "Ultra Kibble",
        "brand": "Acme",
        "confidence": 0.83,
    }
    scraper._validator.validate_extraction_match.return_value = (True, None)
    scraper._build_discovery_result.return_value = AISearchResult(
        success=True,
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        url="https://retailer.example/products/sku-123",
        confidence=0.83,
    )

    result = await scraper._extract_sku_first_batch_result(
        sku="SKU-123",
        product_name="Ultra Kibble",
        brand="Acme",
        search_results=search_results,
    )

    assert result.success is True
    scraper._extract_product_data.assert_awaited_once_with(
        "https://retailer.example/products/sku-123",
        "SKU-123",
        "Ultra Kibble",
        "Acme",
    )
