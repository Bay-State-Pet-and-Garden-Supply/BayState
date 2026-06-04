"""Unit tests for ProductPageExtractor and ProductUrlExtractor.

These tests mock the Crawl4AIExtractor boundary to avoid launching
Playwright/crawl4ai browsers or making real LLM calls.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from scrapers.product_url_extraction.extractor import ProductPageExtractor, ProductUrlExtractor


@pytest.fixture
def extractor() -> ProductPageExtractor:
    """Create a ProductPageExtractor for testing."""
    return ProductPageExtractor(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
        llm_api_key="test-key",
    )


@pytest.fixture
def scraper() -> ProductUrlExtractor:
    """Create a ProductUrlExtractor for testing."""
    return ProductUrlExtractor(
        llm_provider="openai",
        llm_model="gpt-4o-mini",
        llm_api_key="test-key",
    )


# =============================================================================
# ProductPageExtractor — canonical extractor tests
# =============================================================================


class TestProductPageExtractorExtract:
    """Tests for ProductPageExtractor.extract() robust pipeline."""

    @pytest.mark.asyncio
    async def test_extraction_success_returns_normalized_shape(
        self, extractor: ProductPageExtractor
    ) -> None:
        """Successful extraction returns the canonical output dict."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": True,
                "product_name": "Test Product",
                "brand": "TestBrand",
                "description": "A great product",
                "images": ["https://example.com/img1.jpg"],
                "categories": ["Food"],
                "size_metrics": "30 lb",
                "url": "https://example.com/product/123",
                "confidence": 0.92,
                "method": "json-ld",
                "telemetry": {"fetch_time_ms": 1200},
            }

            result = await extractor.extract(
                url="https://example.com/product/123",
                upc="UPC-001",
                product_name="Test Product",
                brand="TestBrand",
            )

        assert result["success"] is True
        assert result["upc"] == "UPC-001"
        assert result["source"] == "product_page_extraction"
        assert result["url"] == "https://example.com/product/123"
        assert result["final_url"] == "https://example.com/product/123"
        assert result["product_name"] == "Test Product"
        assert result["brand"] == "TestBrand"
        assert result["description"] == "A great product"
        assert result["images"] == ["https://example.com/img1.jpg"]
        assert result["categories"] == ["Food"]
        assert result["size_metrics"] == "30 lb"
        assert result["method"] == "json-ld"
        assert result["confidence"] == 0.92
        assert result["telemetry"]["fetch_time_ms"] == 1200

    @pytest.mark.asyncio
    async def test_extraction_failure_returns_structured_error(
        self, extractor: ProductPageExtractor
    ) -> None:
        """Failed extraction returns a structured error dict."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": False,
                "error": "Soft-404 detected",
            }

            result = await extractor.extract(
                url="https://example.com/missing",
                upc="UPC-001",
            )

        assert result["success"] is False
        assert result["upc"] == "UPC-001"
        assert result["source"] == "product_page_extraction"
        assert result["error"] == "Soft-404 detected"
        assert "url" in result
        assert "final_url" in result

    @pytest.mark.asyncio
    async def test_fallback_urls_tried_in_order(
        self, extractor: ProductPageExtractor
    ) -> None:
        """Primary URL failure triggers fallback URL attempts."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.side_effect = [
                {"success": False, "error": "Primary failed"},
                {"success": False, "error": "Fallback 1 failed"},
                {
                    "success": True,
                    "product_name": "Fallback Product",
                    "brand": "TestBrand",
                    "images": [],
                    "categories": [],
                    "url": "https://fallback2.com/product",
                    "confidence": 0.85,
                    "method": "meta-tags",
                },
            ]

            result = await extractor.extract(
                url="https://primary.com/product",
                upc="UPC-001",
                fallback_urls=[
                    "https://fallback1.com/product",
                    "https://fallback2.com/product",
                ],
                max_fallbacks=3,
            )

        assert result["success"] is True
        assert result["product_name"] == "Fallback Product"
        assert result["final_url"] == "https://fallback2.com/product"
        assert mock_extract.await_count == 3

    @pytest.mark.asyncio
    async def test_fallback_urls_respects_max_fallbacks(
        self, extractor: ProductPageExtractor
    ) -> None:
        """max_fallbacks limits the number of fallback URLs attempted."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {"success": False, "error": "Failed"}

            result = await extractor.extract(
                url="https://primary.com/product",
                upc="UPC-001",
                fallback_urls=[
                    "https://f1.com",
                    "https://f2.com",
                    "https://f3.com",
                    "https://f4.com",
                ],
                max_fallbacks=2,
            )

        assert result["success"] is False
        # primary + 1 fallback = 2 total attempts (max_fallbacks=2 means 1 extra)
        assert mock_extract.await_count == 2

    @pytest.mark.asyncio
    async def test_register_name_used_when_product_name_missing(
        self, extractor: ProductPageExtractor
    ) -> None:
        """register_name is passed as product_name when product_name is None."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": True,
                "product_name": "Register Name Product",
                "brand": "TestBrand",
                "images": [],
                "categories": [],
                "url": "https://example.com/product",
                "confidence": 0.9,
            }

            await extractor.extract(
                url="https://example.com/product",
                upc="UPC-001",
                register_name="Register Name Product",
            )

        # Verify register_name was passed as product_name to the internal extractor
        mock_extract.assert_awaited_once()
        call_kwargs = mock_extract.call_args.kwargs
        assert call_kwargs["product_name"] == "Register Name Product"

    @pytest.mark.asyncio
    async def test_no_domain_verification_during_extraction(
        self, extractor: ProductPageExtractor
    ) -> None:
        """The extractor does not classify or verify domains — it only extracts."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": True,
                "product_name": "Product",
                "brand": "Brand",
                "images": [],
                "categories": [],
                "url": "https://any-domain.com/product",
                "confidence": 0.8,
            }

            result = await extractor.extract(
                url="https://any-domain.com/product",
                upc="UPC-001",
                brand="Brand",
            )

        assert result["success"] is True
        # The internal Crawl4AIExtractor may use SearchScorer for variant resolution,
        # but the public ProductPageExtractor API never exposes domain classification.
        assert "official_domain_match" not in result
        assert "candidate_rank" not in result

    @pytest.mark.asyncio
    async def test_extractor_runs_all_urls_and_aggregates_them(
        self, extractor: ProductPageExtractor
    ) -> None:
        """When multiple URLs/fallbacks are provided, extractor runs all of them and aggregates results."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.side_effect = [
                {
                    "success": True,
                    "product_name": "Primary Product",
                    "brand": "Brand",
                    "images": [],
                    "categories": [],
                    "url": "https://primary.com/product",
                    "confidence": 0.85,
                    "method": "meta-tags",
                },
                {
                    "success": True,
                    "product_name": "Fallback Product",
                    "brand": "Brand",
                    "images": [],
                    "categories": [],
                    "url": "https://fallback.com/product",
                    "confidence": 0.95,
                    "method": "json-ld",
                },
            ]

            result = await extractor.extract(
                url="https://primary.com/product",
                upc="UPC-001",
                fallback_urls=[
                    "https://fallback.com/product",
                ],
                max_fallbacks=2,
            )

        assert result["success"] is True
        # Since fallback has higher confidence, best_result should choose the fallback
        assert result["product_name"] == "Fallback Product"
        assert result["final_url"] == "https://fallback.com/product"
        
        # Verify both results are in source_results
        assert "source_results" in result
        source_slugs = [s["sourceSlug"] for s in result["source_results"]]
        assert "primary_com" in source_slugs
        assert "fallback_com" in source_slugs


class TestProductPageExtractorBatch:
    """Tests for ProductPageExtractor.extract_products_from_urls_batch()."""

    @pytest.mark.asyncio
    async def test_batch_extraction_returns_aisearch_results(
        self, extractor: ProductPageExtractor
    ) -> None:
        """Batch extraction returns a list of AISearchResult objects."""
        with patch.object(
            extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.side_effect = [
                {
                    "success": True,
                    "product_name": "Product A",
                    "brand": "Brand A",
                    "description": "Desc A",
                    "images": ["img-a.jpg"],
                    "categories": ["Cat A"],
                    "size_metrics": "30 lb",
                    "final_url": "https://a.com",
                    "method": "json-ld",
                    "confidence": 0.95,
                },
                {
                    "success": False,
                    "error": "Not found",
                    "final_url": "https://b.com",
                },
            ]

            results = await extractor.extract_products_from_urls_batch(
                [
                    {
                        "upc": "UPC-A",
                        "source_url": "https://a.com",
                        "product_name": "Product A",
                        "brand": "Brand A",
                        "url_source": "manual",
                    },
                    {
                        "upc": "UPC-B",
                        "source_url": "https://b.com",
                        "brand": "Brand B",
                        "url_source": "review_selection",
                    },
                ],
                max_concurrency=2,
            )

        assert len(results) == 2
        assert results[0].success is True
        assert results[0].upc == "UPC-A"
        assert results[0].product_name == "Product A"
        assert results[0].brand == "Brand A"
        assert results[0].selection_method == "manual"

        assert results[1].success is False
        assert results[1].upc == "UPC-B"
        assert results[1].error == "Not found"

    @pytest.mark.asyncio
    async def test_manual_and_review_selected_urls_treated_identically(
        self, extractor: ProductPageExtractor
    ) -> None:
        """URL source should not affect extraction behavior, only selection_method metadata."""
        with patch.object(
            extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": True,
                "product_name": "Product",
                "brand": "Brand",
                "images": [],
                "categories": [],
                "final_url": "https://example.com",
                "method": "json-ld",
                "confidence": 0.9,
            }

            results = await extractor.extract_products_from_urls_batch(
                [
                    {
                        "upc": "UPC-1",
                        "source_url": "https://example.com/1",
                        "url_source": "manual",
                    },
                    {
                        "upc": "UPC-2",
                        "source_url": "https://example.com/2",
                        "url_source": "review_selection",
                    },
                ]
            )

        # Both should succeed with identical extraction behavior
        assert results[0].success is True
        assert results[1].success is True
        # The only difference should be selection_method
        assert results[0].selection_method == "manual"
        assert results[1].selection_method == "review_selection"
        # extract() should have been called with the same kwargs structure
        assert mock_extract.await_count == 2

    @pytest.mark.asyncio
    async def test_canonical_fields_passthrough(self, extractor: ProductPageExtractor) -> None:
        """Canonical facet fields from the extractor should appear in the output."""
        with patch.object(
            extractor._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": True,
                "product_name": "Premium Dog Food",
                "brand": "Premium Brand",
                "description": "High quality grain-free dog food",
                "images": ["https://example.com/img.jpg"],
                "categories": ["Dog Food"],
                "url": "https://example.com/product",
                "confidence": 0.9,
                "method": "llm",
                "animal_type": "Dog",
                "life_stage": "Adult",
                "breed_size": "Large Breed",
                "food_form": "Dry Food",
                "flavor": "Chicken",
                "primary_protein": "Chicken",
                "diet_type": "Grain-Free",
                "package_count": 12,
                "package_weight": "30 lb",
                "dimensions": "24x18x6 in",
            }

            result = await extractor.extract(
                url="https://example.com/product",
                upc="UPC-001",
                product_name="Premium Dog Food",
                brand="Premium Brand",
            )

        assert result["success"] is True
        assert result["animal_type"] == "Dog"
        assert result["breed_size"] == "Large Breed"
        assert result["primary_protein"] == "Chicken"
        assert result["diet_type"] == "Grain-Free"
        assert result["package_count"] == 12
        assert result["package_weight"] == "30 lb"
        assert result["dimensions"] == "24x18x6 in"

    @pytest.mark.asyncio
    async def test_batch_skips_missing_sku(self, extractor: ProductPageExtractor) -> None:
        """Products with missing UPC return an error result immediately."""
        results = await extractor.extract_products_from_urls_batch(
            [
                {
                    "upc": "",
                    "source_url": "https://example.com",
                }
            ]
        )

        assert len(results) == 1
        assert results[0].success is False
        assert results[0].error == "Missing UPC"

    @pytest.mark.asyncio
    async def test_batch_skips_missing_url(self, extractor: ProductPageExtractor) -> None:
        """Products with missing URL return an error result immediately."""
        results = await extractor.extract_products_from_urls_batch(
            [
                {
                    "upc": "UPC-001",
                    "source_url": "",
                }
            ]
        )

        assert len(results) == 1
        assert results[0].success is False
        assert results[0].error == "Missing source URL"


# =============================================================================
# ProductUrlExtractor — backward-compatible wrapper tests
# =============================================================================


class TestProductUrlExtractorBackwardCompat:
    """Tests that ProductUrlExtractor correctly delegates to ProductPageExtractor."""

    @pytest.mark.asyncio
    async def test_extract_data_delegates_to_product_page_extractor(
        self, scraper: ProductUrlExtractor
    ) -> None:
        """extract_data() delegates to ProductPageExtractor and normalizes result."""
        with patch.object(
            scraper._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": True,
                "product_name": "Test Product",
                "brand": "TestBrand",
                "description": "Desc",
                "images": ["img.jpg"],
                "categories": ["Food"],
                "upc": "UPC-001",
                "method": "json-ld",
                "confidence": 0.9,
            }

            result = await scraper.extract_data(
                url="https://example.com/product",
                schema_path="/ignored/schema.json",
            )

        assert result["success"] is True
        assert result["method"] == "json-ld"
        assert result["data"]["name"] == "Test Product"
        assert result["data"]["brand"] == "TestBrand"
        assert result["data"]["description"] == "Desc"
        assert result["data"]["images"] == ["img.jpg"]
        assert result["data"]["categories"] == ["Food"]
        assert result["data"]["upc"] == "UPC-001"
        # schema_path is intentionally ignored
        mock_extract.assert_awaited_once_with(url="https://example.com/product", upc="unknown")

    @pytest.mark.asyncio
    async def test_extract_data_failure_propagates(
        self, scraper: ProductUrlExtractor
    ) -> None:
        """When ProductPageExtractor fails, extract_data returns failure shape."""
        with patch.object(
            scraper._extractor, "extract", new_callable=AsyncMock
        ) as mock_extract:
            mock_extract.return_value = {
                "success": False,
                "error": "Page not found",
            }

            result = await scraper.extract_data(url="https://example.com/missing")

        assert result["success"] is False
        assert result["error"] == "Page not found"

    @pytest.mark.asyncio
    async def test_scrape_products_batch_delegates(
        self, scraper: ProductUrlExtractor
    ) -> None:
        """scrape_products_batch delegates to ProductPageExtractor batch method."""
        with patch.object(
            scraper._extractor,
            "extract_products_from_urls_batch",
            new_callable=AsyncMock,
        ) as mock_batch:
            from scrapers.ai_search.models import AISearchResult

            mock_batch.return_value = [
                AISearchResult(success=True, upc="UPC-001", product_name="Product")
            ]

            results = await scraper.scrape_products_batch(
                [{"upc": "UPC-001", "source_url": "https://example.com"}]
            )

        assert len(results) == 1
        assert results[0].success is True
        mock_batch.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_extract_products_from_urls_batch_delegates(
        self, scraper: ProductUrlExtractor
    ) -> None:
        """extract_products_from_urls_batch delegates to ProductPageExtractor."""
        with patch.object(
            scraper._extractor,
            "extract_products_from_urls_batch",
            new_callable=AsyncMock,
        ) as mock_batch:
            from scrapers.ai_search.models import AISearchResult

            mock_batch.return_value = [
                AISearchResult(success=True, upc="UPC-001", product_name="Product")
            ]

            results = await scraper.extract_products_from_urls_batch(
                [{"upc": "UPC-001", "source_url": "https://example.com"}],
                max_concurrency=2,
            )

        assert len(results) == 1
        assert results[0].success is True
        mock_batch.assert_awaited_once_with(
            [{"upc": "UPC-001", "source_url": "https://example.com"}], 2
        )



