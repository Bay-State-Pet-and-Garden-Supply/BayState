"""Unit tests for ExtractionValidator.

Ported from: test_cohort_validation.py (archived in T13)
Rationale: ExtractionValidator is still used by current scoring pipeline.
"""

from __future__ import annotations

from scrapers.ai_search.validation import ExtractionValidator


VALID_IMAGE_URL = "https://example.com/products/images/product-main.jpg"


class TestExtractionValidatorAcceptance:
    """Tests for validator acceptance criteria."""

    def test_validator_accepts_matching_brand_and_name(self) -> None:
        """Test that validator accepts when brand and name match.

        Ported from: test_cohort_validation.py::TestExtractionValidatorIntegration
        """
        validator = ExtractionValidator(confidence_threshold=0.7)

        extraction_result = {
            "success": True,
            "product_name": "Advantage Large Breed Cat Food",
            "brand": "Advantage",
            "description": "Premium cat food for large breeds",
            "images": [VALID_IMAGE_URL],
            "confidence": 0.85,
        }

        is_acceptable, reason = validator.validate_extraction_match(
            extraction_result=extraction_result,
            sku="12345",
            product_name="Advantage Large Breed Cat Food",
            brand="Advantage",
            source_url="https://www.chewy.com/product/12345",
        )

        assert is_acceptable is True
        assert reason == "ok"

    def test_validator_accepts_partial_name_match(self) -> None:
        """Test that validator accepts partial name matches (fuzzy matching).

        Ported from: test_cohort_validation.py::TestExtractionValidatorIntegration
        """
        validator = ExtractionValidator(confidence_threshold=0.7)

        extraction_result = {
            "success": True,
            "product_name": "Advantage Large Breed Cat Food",
            "brand": "Advantage",
            "description": "Premium cat food",
            "images": [VALID_IMAGE_URL],
            "confidence": 0.85,
        }

        # Partial name - "Advantage Large Breed" is subset of full name
        is_acceptable, reason = validator.validate_extraction_match(
            extraction_result=extraction_result,
            sku="12345",
            product_name="Advantage Large Breed",
            brand="Advantage",
            source_url="https://www.chewy.com/product/12345",
        )

        assert is_acceptable is True


class TestExtractionValidatorRejection:
    """Tests for validator rejection criteria."""

    def test_validator_rejects_brand_mismatch(self) -> None:
        """Test that validator rejects when brand doesn't match.

        Ported from: test_cohort_validation.py::TestExtractionValidatorIntegration
        """
        validator = ExtractionValidator(confidence_threshold=0.7)

        extraction_result = {
            "success": True,
            "product_name": "Some Brand Cat Food",
            "brand": "WrongBrand",
            "description": "Cat food product",
            "images": [VALID_IMAGE_URL],
            "confidence": 0.85,
        }

        is_acceptable, reason = validator.validate_extraction_match(
            extraction_result=extraction_result,
            sku="12345",
            product_name="Some Brand Cat Food",
            brand="ExpectedBrand",
            source_url="https://www.chewy.com/product/12345",
        )

        assert is_acceptable is False
        assert "Brand mismatch" in reason

    def test_validator_rejects_name_mismatch(self) -> None:
        """Test that validator rejects when product name doesn't match.

        Ported from: test_cohort_validation.py::TestExtractionValidatorIntegration
        """
        validator = ExtractionValidator(confidence_threshold=0.7)

        extraction_result = {
            "success": True,
            "product_name": "Lavender Dog Shampoo",
            "brand": "SomeBrand",
            "description": "Product description",
            "images": [VALID_IMAGE_URL],
            "confidence": 0.85,
        }

        is_acceptable, reason = validator.validate_extraction_match(
            extraction_result=extraction_result,
            sku="12345",
            product_name="Salmon Cat Kibble",
            brand="SomeBrand",
            source_url="https://www.example.com/product",
        )

        assert is_acceptable is False
        assert "Product name mismatch" in reason

    def test_validator_rejects_low_confidence(self) -> None:
        """Test that validator rejects extractions with low confidence.

        Ported from: test_cohort_validation.py::TestExtractionValidatorIntegration
        """
        validator = ExtractionValidator(confidence_threshold=0.7)

        extraction_result = {
            "success": True,
            "product_name": "Advantage Cat Food",
            "brand": "Advantage",
            "description": "Cat food",
            "images": [VALID_IMAGE_URL],
            "confidence": 0.5,  # Low confidence
        }

        is_acceptable, reason = validator.validate_extraction_match(
            extraction_result=extraction_result,
            sku="12345",
            product_name="Advantage Cat Food",
            brand="Advantage",
            source_url="https://www.unknownsite.com/product",
        )

        assert is_acceptable is False
        assert "Confidence" in reason

    def test_validator_rejects_missing_images(self) -> None:
        """Test that validator rejects extractions without product images.

        Ported from: test_cohort_validation.py::TestExtractionValidatorIntegration
        """
        validator = ExtractionValidator(confidence_threshold=0.7)

        extraction_result = {
            "success": True,
            "product_name": "Advantage Cat Food",
            "brand": "Advantage",
            "description": "Cat food",
            "images": [],  # No images
            "confidence": 0.85,
        }

        is_acceptable, reason = validator.validate_extraction_match(
            extraction_result=extraction_result,
            sku="12345",
            product_name="Advantage Cat Food",
            brand="Advantage",
            source_url="https://www.chewy.com/product/12345",
        )

        assert is_acceptable is False
        assert "Missing product images" in reason

    def test_validator_filters_logo_images(self) -> None:
        """Test that validator filters out logo/placeholder images.

        Ported from: test_cohort_validation.py::TestExtractionValidatorIntegration
        """
        validator = ExtractionValidator(confidence_threshold=0.7)

        extraction_result = {
            "success": True,
            "product_name": "Advantage Cat Food",
            "brand": "Advantage",
            "description": "Cat food",
            "images": [
                "https://example.com/images/logo.png",  # Should be filtered
                VALID_IMAGE_URL,
            ],
            "confidence": 0.85,
        }

        extraction_copy = extraction_result.copy()
        extraction_copy["images"] = extraction_result["images"].copy()

        is_acceptable, reason = validator.validate_extraction_match(
            extraction_result=extraction_copy,
            sku="12345",
            product_name="Advantage Cat Food",
            brand="Advantage",
            source_url="https://www.chewy.com/product/12345",
        )

        assert is_acceptable is True
        # Logo should be filtered out
        assert VALID_IMAGE_URL in extraction_copy["images"]
        assert "https://example.com/images/logo.png" not in extraction_copy["images"]


class TestBrandMatching:
    """Tests for brand matching logic in ExtractionValidator."""

    def test_brand_match_exact(self) -> None:
        """Test exact brand matching.

        Ported from: test_cohort_validation.py::TestBrandMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_brand_match(
            expected_brand="Advantage",
            actual_brand="Advantage",
            source_url="https://www.chewy.com/product",
        )
        assert result is True

    def test_brand_match_fuzzy(self) -> None:
        """Test fuzzy brand matching (substring).

        Ported from: test_cohort_validation.py::TestBrandMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_brand_match(
            expected_brand="Advantage",
            actual_brand="Advantage Plus",
            source_url="https://www.chewy.com/product",
        )
        assert result is True

    def test_brand_match_mismatch(self) -> None:
        """Test brand mismatch detection.

        Ported from: test_cohort_validation.py::TestBrandMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_brand_match(
            expected_brand="Advantage",
            actual_brand="Frontline",
            source_url="https://www.chewy.com/product",
        )
        assert result is False

    def test_brand_match_domain_fallback(self) -> None:
        """Test that brand can be inferred from domain.

        Ported from: test_cohort_validation.py::TestBrandMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_brand_match(
            expected_brand="Chewy",
            actual_brand="",
            source_url="https://www.chewy.com/product",
        )
        assert result is True

    def test_brand_match_none_expected(self) -> None:
        """Test that None expected brand always passes.

        Ported from: test_cohort_validation.py::TestBrandMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_brand_match(
            expected_brand=None,
            actual_brand="AnyBrand",
            source_url="https://www.example.com/product",
        )
        assert result is True


class TestNameMatching:
    """Tests for name matching logic in ExtractionValidator."""

    def test_name_match_exact(self) -> None:
        """Test exact name matching.

        Ported from: test_cohort_validation.py::TestNameMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_name_match(
            expected_name="Advantage Large Breed Cat Food",
            actual_name="Advantage Large Breed Cat Food",
        )
        assert result is True

    def test_name_match_partial(self) -> None:
        """Test partial name matching.

        Ported from: test_cohort_validation.py::TestNameMatching
        """
        validator = ExtractionValidator()

        # Actual name contains expected name
        result = validator._matching.is_name_match(
            expected_name="Advantage Cat Food",
            actual_name="Advantage Large Breed Cat Food",
        )
        assert result is True

    def test_name_match_fuzzy(self) -> None:
        """Test fuzzy name matching with token overlap.

        Ported from: test_cohort_validation.py::TestNameMatching
        """
        validator = ExtractionValidator()

        # Tokens overlap enough for fuzzy match
        result = validator._matching.is_name_match(
            expected_name="Advantage Chicken Flavor",
            actual_name="Advantage Cat Food Chicken",
        )
        assert result is True

    def test_name_match_mismatch(self) -> None:
        """Test name mismatch detection.

        Ported from: test_cohort_validation.py::TestNameMatching
        """
        validator = ExtractionValidator()

        # Completely different names
        result = validator._matching.is_name_match(
            expected_name="Cat Food",
            actual_name="Dog Shampoo",
        )
        assert result is False

    def test_name_match_none_expected(self) -> None:
        """Test that None expected name always passes.

        Ported from: test_cohort_validation.py::TestNameMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_name_match(
            expected_name=None,
            actual_name="Any Product Name",
        )
        assert result is True

    def test_name_match_none_actual(self) -> None:
        """Test that None actual name fails when expected is provided.

        Ported from: test_cohort_validation.py::TestNameMatching
        """
        validator = ExtractionValidator()

        result = validator._matching.is_name_match(
            expected_name="Cat Food",
            actual_name=None,
        )
        assert result is False
