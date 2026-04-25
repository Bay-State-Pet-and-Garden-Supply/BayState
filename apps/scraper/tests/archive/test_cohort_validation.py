"""Unit tests for cohort validation integration in BatchSearchOrchestrator."""

# pyright: reportPrivateUsage=false, reportUnusedVariable=false, reportUnknownParameterType=false, reportMissingParameterType=false, reportMissingTypeArgument=false, reportUnknownVariableType=false, reportUnknownArgumentType=false, reportUnknownMemberType=false, reportAttributeAccessIssue=false, reportUnannotatedClassAttribute=false, reportUnusedParameter=false, reportExplicitAny=false

from __future__ import annotations

import asyncio
from typing import Any

from scrapers.ai_search.batch_search import (
    BatchSearchOrchestrator,
    SearchResult,
)
from scrapers.ai_search.cohort_state import _BatchCohortState
from scrapers.ai_search.validation import ExtractionValidator


VALID_IMAGE_URL = "https://example.com/products/images/product-main.jpg"


class MockSearchClient:
    """Mock search client for testing."""

    def __init__(self, results_map: dict[str, list[dict]] | None = None):
        self.results_map = results_map or {}
        self.search_calls: list[str] = []

    async def search(self, query: str) -> tuple[list[dict], str | None]:
        self.search_calls.append(query)
        if query in self.results_map:
            return self.results_map[query], None
        return [], None


class MockExtractor:
    """Mock extractor that returns configurable results."""

    def __init__(self, results_map: dict[str, dict[str, Any]] | None = None):
        self.results_map = results_map or {}
        self.extract_calls: list[tuple[str, str, str | None, str | None]] = []

    async def extract(
        self,
        url: str,
        sku: str,
        product_name: str | None,
        brand: str | None,
    ) -> dict[str, Any]:
        self.extract_calls.append((url, sku, product_name, brand))
        if url in self.results_map:
            result = self.results_map[url].copy()
            result["url"] = url
            return result
        return {"success": False, "error": "Not found"}


class MockScorer:
    """Mock scorer that returns configurable scores."""

    def __init__(self, scores: dict[str, float] | None = None):
        self.scores = scores or {}
        self.BLOCKED_DOMAINS = {"blocked-site.com", "malicious.net"}

    def score_search_result(self, **kwargs) -> float:
        url = kwargs.get("result", {}).get("url", "")
        return self.scores.get(url, 5.0)

    @staticmethod
    def domain_from_url(url: str) -> str:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain

    def _domain_matches_candidates(self, domain: str, candidates: set[str]) -> bool:
        return domain in candidates

    @staticmethod
    def classify_source_domain(domain: str, brand: str | None) -> str:
        del brand
        return "official" if domain == "chewy.com" else "unknown"

    @staticmethod
    def is_category_like_url(url: str) -> bool:
        return "/category/" in url or "/collections/" in url


class TestExtractionValidatorIntegration:
    """Tests for ExtractionValidator integration in BatchSearchOrchestrator."""

    def test_validator_accepts_matching_brand_and_name(self) -> None:
        """Test that validator accepts when brand and name match."""
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

    def test_validator_rejects_brand_mismatch(self) -> None:
        """Test that validator rejects when brand doesn't match."""
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
        """Test that validator rejects when product name doesn't match."""
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

    def test_validator_accepts_partial_name_match(self) -> None:
        """Test that validator accepts partial name matches (fuzzy matching)."""
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

    def test_validator_rejects_low_confidence(self) -> None:
        """Test that validator rejects extractions with low confidence."""
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
        """Test that validator rejects extractions without product images."""
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
        """Test that validator filters out logo/placeholder images."""
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

        # Modify images in place
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


class TestBlockedUrlFiltering:
    """Tests for blocked URL filtering in BatchSearchOrchestrator."""

    def test_blocked_domain_is_filtered(self) -> None:
        """Test that URLs from blocked domains are filtered out."""
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=MockExtractor(),
            scorer=MockScorer(),
        )

        blocked_url = "https://blocked-site.com/product/12345"

        assert orchestrator._is_blocked_url(blocked_url) is True

    def test_category_url_is_filtered(self) -> None:
        """Test that category/collection URLs are filtered out."""
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=MockExtractor(),
            scorer=MockScorer(),
        )

        category_url = "https://example.com/category/cat-food"

        assert orchestrator._is_blocked_url(category_url) is True

    def test_valid_product_url_passes_filter(self) -> None:
        """Test that valid product URLs pass through."""
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=MockExtractor(),
            scorer=MockScorer(),
        )

        valid_url = "https://www.chewy.com/advantage-cat-food/product/12345"

        assert orchestrator._is_blocked_url(valid_url) is False


class TestCohortStateDomainTracking:
    """Tests for cohort state domain tracking."""

    def test_remember_domain_increments_count(self) -> None:
        """Test that remember_domain increments the domain count."""
        state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        state.remember_domain("chewy.com")
        state.remember_domain("chewy.com")
        state.remember_domain("amazon.com")

        assert state.preferred_domain_counts["chewy.com"] == 2
        assert state.preferred_domain_counts["amazon.com"] == 1

    def test_ranked_domains_returns_sorted_list(self) -> None:
        """Test that ranked_domains returns domains sorted by frequency."""
        state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        state.remember_domain("amazon.com")
        state.remember_domain("chewy.com")
        state.remember_domain("chewy.com")
        state.remember_domain("chewy.com")

        ranked = state.ranked_domains()

        # chewy.com should be first (3 counts vs 1)
        assert ranked[0] == "chewy.com"
        assert ranked[1] == "amazon.com"

    def test_dominant_domain_returns_most_frequent(self) -> None:
        """Test that dominant_domain returns the most frequent domain."""
        state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        state.remember_domain("amazon.com")
        state.remember_domain("chewy.com")
        state.remember_domain("chewy.com")
        state.remember_domain("chewy.com")

        dominant = state.dominant_domain(minimum_count=2)

        assert dominant == "chewy.com"

    def test_dominant_domain_respects_minimum_count(self) -> None:
        """Test that dominant_domain respects minimum_count threshold."""
        state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        state.remember_domain("amazon.com")  # Only 1 occurrence

        dominant = state.dominant_domain(minimum_count=2)

        assert dominant is None  # Does not meet minimum

    def test_ranked_domains_with_alphabetical_tiebreaker(self) -> None:
        """Test that domains with same count are sorted alphabetically."""
        state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        state.remember_domain("zoo.com")
        state.remember_domain("amazon.com")
        state.remember_domain("chewy.com")

        ranked = state.ranked_domains()

        # All have count 1, should be alphabetical
        assert ranked == ["amazon.com", "chewy.com", "zoo.com"]

    def test_remember_successful_domain_updates_cohort_state(self) -> None:
        """Test that successful extractions update cohort state."""
        cohort_state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=MockExtractor(),
            scorer=MockScorer(),
            cohort_state=cohort_state,
        )

        orchestrator._remember_successful_domain("https://www.chewy.com/product/12345")
        orchestrator._remember_successful_domain("https://www.chewy.com/product/67890")

        assert cohort_state.preferred_domain_counts["chewy.com"] == 2

    def test_remember_domain_handles_empty_domain(self) -> None:
        """Test that remember_domain handles empty domain gracefully."""
        state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        state.remember_domain("")
        state.remember_domain("valid.com")

        # Empty domain should not be recorded
        assert "" not in state.preferred_domain_counts
        assert state.preferred_domain_counts["valid.com"] == 1


class TestBatchSearchOrchestratorValidation:
    """Integration tests for validation in BatchSearchOrchestrator."""

    def test_extraction_and_validate_integration(self) -> None:
        """Test the full extraction and validation flow."""
        extract_results = {
            "https://www.chewy.com/product/12345": {
                "success": True,
                "product_name": "Advantage Cat Food",
                "brand": "Advantage",
                "description": "Premium cat food",
                "images": [VALID_IMAGE_URL],
                "confidence": 0.85,
            }
        }

        extractor = MockExtractor(results_map=extract_results)
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=extractor,
            scorer=MockScorer(),
        )

        candidate = SearchResult(
            url="https://www.chewy.com/product/12345",
            title="Advantage Cat Food",
            description="Premium cat food for cats",
        )

        result, error = asyncio.run(
            orchestrator._extract_and_validate(
                sku="12345",
                candidate=candidate,
                product_name="Advantage Cat Food",
                brand="Advantage",
            )
        )

        assert result is not None
        assert result["success"] is True
        assert error == ""
        assert extractor.extract_calls == [
            (
                "https://www.chewy.com/product/12345",
                "12345",
                "Advantage Cat Food",
                "Advantage",
            )
        ]

    def test_extract_and_validate_passes_expected_product_context_to_extractor(self) -> None:
        """Test that extraction uses the requested product context, not candidate text."""
        extract_results = {
            "https://www.example.com/product/12345": {
                "success": True,
                "product_name": "Expected Product Deluxe",
                "brand": "ExpectedBrand",
                "description": "Expected Product Deluxe for SKU 12345",
                "images": [VALID_IMAGE_URL],
                "confidence": 0.9,
            }
        }

        extractor = MockExtractor(results_map=extract_results)
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=extractor,
            scorer=MockScorer(),
        )

        candidate = SearchResult(
            url="https://www.example.com/product/12345",
            title="Candidate Title That Should Not Override Context",
            description="Candidate description",
        )

        result, error = asyncio.run(
            orchestrator._extract_and_validate(
                sku="12345",
                candidate=candidate,
                product_name="Expected Product Deluxe",
                brand="ExpectedBrand",
            )
        )

        assert result is not None
        assert error == ""
        assert extractor.extract_calls == [
            (
                "https://www.example.com/product/12345",
                "12345",
                "Expected Product Deluxe",
                "ExpectedBrand",
            )
        ]

    def test_extraction_validation_rejects_mismatch(self) -> None:
        """Test that validation rejects brand mismatch during extraction."""
        extract_results = {
            "https://www.example.com/product": {
                "success": True,
                "product_name": "Wrong Brand Product",
                "brand": "WrongBrand",
                "description": "Product description",
                "images": [VALID_IMAGE_URL],
                "confidence": 0.85,
            }
        }

        extractor = MockExtractor(results_map=extract_results)
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=extractor,
            scorer=MockScorer(),
        )

        candidate = SearchResult(
            url="https://www.example.com/product",
            title="Wrong Brand Product",
            description="Product description",
        )

        result, error = asyncio.run(
            orchestrator._extract_and_validate(
                sku="12345",
                candidate=candidate,
                product_name="Wrong Brand Product",
                brand="ExpectedBrand",  # Different brand
            )
        )

        assert result is None
        assert "Brand mismatch" in error

    def test_extraction_validation_handles_failure(self) -> None:
        """Test that extraction failures are handled gracefully."""
        extractor = MockExtractor(results_map={})
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=extractor,
            scorer=MockScorer(),
        )

        candidate = SearchResult(
            url="https://www.example.com/product",
            title="Product",
            description="Product description",
        )

        result, error = asyncio.run(
            orchestrator._extract_and_validate(
                sku="12345",
                candidate=candidate,
                product_name="Product",
                brand=None,
            )
        )

        assert result is None
        assert error != ""

    def test_remember_successful_domain_called_on_valid_extraction(self) -> None:
        """Test that successful validations update cohort state."""
        cohort_state = _BatchCohortState(
            key="test-cohort",
            preferred_domain_counts={},
            preferred_brand_counts={},
        )

        extract_results = {
            "https://www.chewy.com/product/12345": {
                "success": True,
                "product_name": "Advantage Cat Food",
                "brand": "Advantage",
                "description": "Premium cat food",
                "images": [VALID_IMAGE_URL],
                "confidence": 0.85,
            }
        }

        extractor = MockExtractor(results_map=extract_results)
        orchestrator = BatchSearchOrchestrator(
            search_client=MockSearchClient(),
            extractor=extractor,
            scorer=MockScorer(),
            cohort_state=cohort_state,
        )

        candidate = SearchResult(
            url="https://www.chewy.com/product/12345",
            title="Advantage Cat Food",
            description="Premium cat food",
        )

        result, error = asyncio.run(
            orchestrator._extract_and_validate(
                sku="12345",
                candidate=candidate,
                product_name="Advantage Cat Food",
                brand="Advantage",
            )
        )

        assert result is not None
        # Cohort state should have been updated
        assert "chewy.com" in cohort_state.preferred_domain_counts


class TestBrandMatching:
    """Tests for brand matching logic in ExtractionValidator."""

    def test_brand_match_exact(self) -> None:
        """Test exact brand matching."""
        validator = ExtractionValidator()

        # Exact match should pass
        result = validator._matching.is_brand_match(
            expected_brand="Advantage",
            actual_brand="Advantage",
            source_url="https://www.chewy.com/product",
        )
        assert result is True

    def test_brand_match_fuzzy(self) -> None:
        """Test fuzzy brand matching (substring)."""
        validator = ExtractionValidator()

        # Substring match should pass
        result = validator._matching.is_brand_match(
            expected_brand="Advantage",
            actual_brand="Advantage Plus",
            source_url="https://www.chewy.com/product",
        )
        assert result is True

    def test_brand_match_mismatch(self) -> None:
        """Test brand mismatch detection."""
        validator = ExtractionValidator()

        # Different brands should not match
        result = validator._matching.is_brand_match(
            expected_brand="Advantage",
            actual_brand="Frontline",
            source_url="https://www.chewy.com/product",
        )
        assert result is False

    def test_brand_match_domain_fallback(self) -> None:
        """Test that brand can be inferred from domain."""
        validator = ExtractionValidator()

        # No actual brand, but expected brand appears in domain
        result = validator._matching.is_brand_match(
            expected_brand="Chewy",
            actual_brand="",
            source_url="https://www.chewy.com/product",
        )
        assert result is True

    def test_brand_match_none_expected(self) -> None:
        """Test that None expected brand always passes."""
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
        """Test exact name matching."""
        validator = ExtractionValidator()

        result = validator._matching.is_name_match(
            expected_name="Advantage Large Breed Cat Food",
            actual_name="Advantage Large Breed Cat Food",
        )
        assert result is True

    def test_name_match_partial(self) -> None:
        """Test partial name matching."""
        validator = ExtractionValidator()

        # Actual name contains expected name
        result = validator._matching.is_name_match(
            expected_name="Advantage Cat Food",
            actual_name="Advantage Large Breed Cat Food",
        )
        assert result is True

    def test_name_match_fuzzy(self) -> None:
        """Test fuzzy name matching with token overlap."""
        validator = ExtractionValidator()

        # Tokens overlap enough for fuzzy match
        result = validator._matching.is_name_match(
            expected_name="Advantage Chicken Flavor",
            actual_name="Advantage Cat Food Chicken",
        )
        assert result is True

    def test_name_match_mismatch(self) -> None:
        """Test name mismatch detection."""
        validator = ExtractionValidator()

        # Completely different names
        result = validator._matching.is_name_match(
            expected_name="Cat Food",
            actual_name="Dog Shampoo",
        )
        assert result is False

    def test_name_match_none_expected(self) -> None:
        """Test that None expected name always passes."""
        validator = ExtractionValidator()

        result = validator._matching.is_name_match(
            expected_name=None,
            actual_name="Any Product Name",
        )
        assert result is True

    def test_name_match_none_actual(self) -> None:
        """Test that None actual name fails when expected is provided."""
        validator = ExtractionValidator()

        result = validator._matching.is_name_match(
            expected_name="Cat Food",
            actual_name=None,
        )
        assert result is False
