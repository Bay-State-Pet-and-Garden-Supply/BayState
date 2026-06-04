from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from scrapers.product_url_extraction.known_url_wrapper import (
    KnownUrlExtractionRequest,
    run_known_url_extraction,
)


class TestKnownUrlExtractionRequest:
    def test_from_dict_requires_url_and_upc(self) -> None:
        with pytest.raises(ValueError, match="url"):
            KnownUrlExtractionRequest.from_dict({"upc": "123"})

        with pytest.raises(ValueError, match="upc"):
            KnownUrlExtractionRequest.from_dict({"url": "https://example.com/product"})

    def test_from_dict_normalizes_optional_fields(self) -> None:
        request = KnownUrlExtractionRequest.from_dict(
            {
                "url": "https://example.com/product",
                "upc": "123",
                "product_name": " Test Product ",
                "fallback_urls": ["https://example.com/one", "", None],
            }
        )

        assert request.product_name == "Test Product"
        assert request.fallback_urls == ["https://example.com/one"]


class TestRunKnownUrlExtraction:
    @pytest.mark.asyncio
    async def test_success_maps_normalized_result(self) -> None:
        request = KnownUrlExtractionRequest(
            url="https://example.com/product",
            upc="123",
            product_name="Test Product",
            brand="Test Brand",
        )

        with patch(
            "scrapers.product_url_extraction.known_url_wrapper.ProductPageExtractor"
        ) as mock_extractor_cls:
            mock_extractor = mock_extractor_cls.return_value
            mock_extractor.extract = AsyncMock(
                return_value={
                    "success": True,
                    "product_name": "Test Product",
                    "brand": "Test Brand",
                    "description": "A great product",
                    "images": ["https://example.com/image.jpg"],
                    "categories": ["Cat Food"],
                    "method": "json-ld",
                    "confidence": 0.91,
                    "final_url": "https://example.com/product",
                    "telemetry": {"fetch_time_ms": 1200},
                }
            )

            response = await run_known_url_extraction(request)

        assert response["status"] == "success"
        assert response["extracted"]["description"] == "A great product"
        assert response["extracted"]["images"] == ["https://example.com/image.jpg"]
        assert response["extracted"]["categories"] == ["Cat Food"]
        assert response["extracted"]["attributes"]["method"] == "json-ld"
        assert response["warnings"] == []

    @pytest.mark.asyncio
    async def test_failure_returns_error_payload(self) -> None:
        request = KnownUrlExtractionRequest(
            url="https://example.com/missing",
            upc="123",
        )

        with patch(
            "scrapers.product_url_extraction.known_url_wrapper.ProductPageExtractor"
        ) as mock_extractor_cls:
            mock_extractor = mock_extractor_cls.return_value
            mock_extractor.extract = AsyncMock(
                return_value={
                    "success": False,
                    "error": "Soft-404 detected",
                }
            )

            response = await run_known_url_extraction(request)

        assert response["status"] == "failed"
        assert response["error"] == "Soft-404 detected"
        assert response["warnings"] == ["Soft-404 detected"]

    @pytest.mark.asyncio
    async def test_success_adds_warnings_for_missing_content(self) -> None:
        request = KnownUrlExtractionRequest(
            url="https://example.com/product",
            upc="123",
        )

        with patch(
            "scrapers.product_url_extraction.known_url_wrapper.ProductPageExtractor"
        ) as mock_extractor_cls:
            mock_extractor = mock_extractor_cls.return_value
            mock_extractor.extract = AsyncMock(
                return_value={
                    "success": True,
                    "product_name": "Test Product",
                    "brand": "Test Brand",
                    "images": [],
                    "categories": [],
                    "description": None,
                    "confidence": 0.42,
                }
            )

            response = await run_known_url_extraction(request)

        assert response["status"] == "success"
        assert "Extractor returned no product images." in response["warnings"]
        assert "Extractor returned no product description." in response["warnings"]
        assert any("preferred threshold" in warning for warning in response["warnings"])

    @pytest.mark.asyncio
    async def test_canonical_fields_in_extracted_payload(self) -> None:
        """Canonical facet fields from the extractor should appear in the extracted payload."""
        request = KnownUrlExtractionRequest(
            url="https://example.com/product",
            upc="123",
            product_name="Premium Dog Food",
            brand="Premium Brand",
        )

        with patch(
            "scrapers.product_url_extraction.known_url_wrapper.ProductPageExtractor"
        ) as mock_extractor_cls:
            mock_extractor = mock_extractor_cls.return_value
            mock_extractor.extract = AsyncMock(
                return_value={
                    "success": True,
                    "product_name": "Premium Dog Food",
                    "brand": "Premium Brand",
                    "description": "Grain-free dog food",
                    "images": ["https://example.com/img.jpg"],
                    "categories": ["Dog Food"],
                    "size_metrics": "30 lb",
                    "confidence": 0.95,
                    "method": "llm",
                    "animal_type": "Dog",
                    "life_stage": "Adult",
                    "breed_size": "Large Breed",
                    "primary_protein": "Chicken",
                    "diet_type": "Grain-Free",
                    "package_count": 12,
                    "package_weight": "30 lb",
                    "dimensions": "24x18x6 in",
                    "packaging_type": "Bag",
                    "material": "Plastic",
                    "color": "Red",
                }
            )

            response = await run_known_url_extraction(request)

        assert response["status"] == "success"
        attrs = response["extracted"]["attributes"]
        assert attrs["animal_type"] == "Dog"
        assert attrs["life_stage"] == "Adult"
        assert attrs["breed_size"] == "Large Breed"
        assert attrs["primary_protein"] == "Chicken"
        assert attrs["diet_type"] == "Grain-Free"
        assert attrs["package_count"] == 12
        assert attrs["package_weight"] == "30 lb"
        assert attrs["dimensions"] == "24x18x6 in"
        assert attrs["packaging_type"] == "Bag"
        assert attrs["material"] == "Plastic"
        assert attrs["color"] == "Red"
