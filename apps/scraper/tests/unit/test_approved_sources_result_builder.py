"""Tests for the approved source result builder.

Verifies that all builder functions return valid EnrichmentResultV1 objects
with proper provenance, decision, llm_used, and source_results fields.
"""
from __future__ import annotations

from scrapers.approved_sources.result_builder import (
    build_success_result,
    build_partial_result,
    build_auth_required_result,
    build_no_match_result,
    build_policy_blocked_result,
    build_failed_result,
)


class TestBuildSuccessResult:
    def test_returns_valid_result(self):
        result = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL", "upc": "001135"},
            matched_fields=["name", "brand", "upc"],
            overall_confidence=0.85,
        )
        assert result.schema_version == "v1"
        assert result.upc == "001135"
        assert result.status == "success"
        assert result.decision == "deterministic_success"
        assert result.llm_used is False
        assert len(result.source_results) == 1
        assert result.source_results[0].sourceSlug == "bradley"
        assert result.source_results[0].confidence == 0.85
        assert result.product.name == "E-Z HANG SCALE"
        assert result.product.brand == "KERBL"
        assert result.validation.upc_match is True

    def test_success_capture_preserves_data_url_in_media(self):
        """Successful authenticated capture dicts preserve data_url, not original_url."""
        result = build_success_result(
            upc="072705115310",
            source_slug="phillips",
            source_type="distributor",
            evidence_url="approved_source_extraction",
            product_fields={
                "name": "Test Product",
                "image_urls": [
                    {
                        "status": "success",
                        "data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
                        "original_url": "https://shop.phillipspet.com/images/private/product.jpg",
                        "status_code": 200,
                    }
                ],
            },
            matched_fields=["name"],
            overall_confidence=0.9,
        )
        assert len(result.product.media) == 1
        media_url = result.product.media[0].url
        assert media_url.startswith("data:image/png;base64,"), \
            f"Expected data URL in media, got: {media_url}"
        assert "shop.phillipspet.com" not in media_url, \
            f"Private vendor URL leaked into media: {media_url}"
        assert len(result.product.evidence.selected_images) == 1
        assert result.product.evidence.selected_images[0].startswith("data:image/png;base64,")

    def test_error_capture_does_not_leak_original_url(self):
        """Errored capture dicts do not leak private vendor URLs into media."""
        result = build_success_result(
            upc="072705115310",
            source_slug="phillips",
            source_type="distributor",
            evidence_url="approved_source_extraction",
            product_fields={
                "name": "Test Product",
                "image_urls": [
                    {
                        "status": "error",
                        "error_type": "auth_401",
                        "error_message": "HTTP 403: Forbidden",
                        "original_url": "https://shop.phillipspet.com/images/private/product.jpg",
                        "status_code": 403,
                    },
                    {
                        "status": "success",
                        "data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
                        "original_url": "https://shop.phillipspet.com/images/private/product2.jpg",
                        "status_code": 200,
                    },
                ],
            },
            matched_fields=["name"],
            overall_confidence=0.9,
        )
        # The errored entry should be skipped entirely; only the success entry should appear
        assert len(result.product.media) == 1, \
            f"Expected 1 media entry (skipping errored capture), got {len(result.product.media)}"
        assert result.product.media[0].role == "primary"
        media_url = result.product.media[0].url
        assert media_url.startswith("data:image/png;base64,"), \
            f"Expected data URL from success capture, got: {media_url}"
        # Evidence selected_images must only contain the success image, not the protected URL
        assert len(result.product.evidence.selected_images) == 1
        assert result.product.evidence.selected_images[0].startswith("data:image/png;base64,")

    def test_capture_like_success_without_data_url_is_skipped(self):
        """Capture-shaped dicts without a usable data_url must not fall back to original_url."""
        result = build_success_result(
            upc="072705115310",
            source_slug="phillips",
            source_type="distributor",
            evidence_url="approved_source_extraction",
            product_fields={
                "name": "Test Product",
                "image_urls": [
                    {
                        "status": "success",
                        "original_url": "https://shop.phillipspet.com/images/private/product.jpg",
                        "status_code": 200,
                    },
                ],
            },
            matched_fields=["name"],
            overall_confidence=0.9,
        )

        assert result.product.media == []
        assert result.product.evidence.selected_images == []

    def test_plain_metadata_dict_can_still_use_original_url(self):
        """Non-capture metadata dicts keep backward-compatible original_url behavior."""
        result = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={
                "name": "Plain Metadata Product",
                "image_urls": [
                    {
                        "original_url": "https://cdn.example.com/product.jpg",
                    },
                ],
            },
            matched_fields=["name"],
            overall_confidence=0.85,
        )

        assert len(result.product.media) == 1
        assert result.product.media[0].url == "https://cdn.example.com/product.jpg"
        assert result.product.media[0].role == "primary"
        assert result.product.evidence.selected_images == ["https://cdn.example.com/product.jpg"]

    def test_llm_fallback_decision(self):
        result = build_success_result(
            upc="001135",
            source_slug="official_brand",
            source_type="official_brand",
            evidence_url="https://frommfamily.com/products/test",
            product_fields={"name": "Test Product", "brand": "Fromm"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
            llm_used=True,
        )
        assert result.decision == "llm_fallback"
        assert result.llm_used is True

    def test_preserves_requested_extraction_mode(self):
        result = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.9,
            requested_extraction_mode="distributor_only",
        )

        assert result.requested_extraction_mode == "distributor_only"
        assert result.mode == "mixed"

    def test_includes_source_provenance(self):
        result = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE"},
            matched_fields=["name"],
            overall_confidence=0.75,
        )
        assert result.source.url == "https://www.bradleycaldwell.com/search?term=001135"
        assert result.source.domain == "www.bradleycaldwell.com"
        assert result.source.source_slug == "bradley"
        assert result.source.source_type == "distributor"
        assert result.source.evidence is not None


class TestBuildPartialResult:
    def test_returns_partial(self):
        result = build_partial_result(
            upc="010199",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=010199",
            product_fields={"name": "Some Product", "upc": "010199"},
            matched_fields=["name"],
            overall_confidence=0.45,
            missing_required=["brand", "image_urls"],
        )
        assert result.status == "partial"
        assert result.decision == "deterministic_partial"
        assert result.confidence.overall == 0.45
        assert "brand" in result.validation.missing_required

    def test_llm_fallback_partial(self):
        result = build_partial_result(
            upc="010199",
            source_slug="official_brand",
            source_type="official_brand",
            evidence_url="https://example.com/product",
            product_fields={"name": "Partial Product"},
            matched_fields=["name"],
            overall_confidence=0.5,
            llm_used=True,
        )
        assert result.decision == "llm_fallback"
        assert result.llm_used is True

    def test_partial_can_record_missing_sku_match(self):
        result = build_partial_result(
            upc="010199",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=010199",
            product_fields={"name": "Some Product"},
            matched_fields=["name"],
            overall_confidence=0.42,
            sku_match=False,
            missing_required=["sku_match"],
        )
        assert result.validation.upc_match is False
        assert "sku_match" in result.validation.missing_required


class TestBuildAuthRequiredResult:
    def test_returns_failed_with_auth_warning(self):
        result = build_auth_required_result(
            upc="072705115310",
            source_slug="phillips",
            message="No credentials available for phillips",
        )
        assert result.status == "failed"
        assert result.decision == "failed"
        assert result.llm_used is False
        assert any("credentials" in w.lower() for w in result.validation.warnings)
        assert result.source.source_slug == "phillips"
        assert len(result.source_results) == 1
        assert result.source_results[0].sourceSlug == "phillips"
        assert result.source_results[0].confidence == 0.0
        assert result.source.url == "approved_source_extraction"
        assert result.product.name is None  # No product data

    def test_custom_message(self):
        result = build_auth_required_result(
            upc="33011808",
            source_slug="pet_food_experts",
            message="Pet Food Experts login required",
        )
        assert any("Pet Food Experts" in w for w in result.validation.warnings)


class TestBuildNoMatchResult:
    def test_returns_failed_no_match(self):
        result = build_no_match_result(
            upc="999999",
            source_slug="bradley",
            evidence_url="https://www.bradleycaldwell.com/search?term=999999",
        )
        assert result.status == "failed"
        assert result.decision == "failed"
        assert result.validation.upc_match is False
        assert result.source_results[0].confidence == 0.0
        assert any("No match" in w for w in result.validation.warnings)


class TestBuildPolicyBlockedResult:
    def test_returns_failed_blocked(self):
        result = build_policy_blocked_result(
            upc="001135",
            source_slug="bradley",
            blocked_url="https://www.amazon.com/dp/B0012ABCDE",
            reason="Amazon is disallowed",
        )
        assert result.status == "failed"
        assert result.decision == "failed"
        assert any("Amazon" in w or "disallowed" in w.lower() for w in result.validation.warnings)
        assert result.source.url == "https://www.amazon.com/dp/B0012ABCDE"


class TestBuildFailedResult:
    def test_returns_generic_failure(self):
        result = build_failed_result(
            upc="001135",
            source_slug="bradley",
            error_message="All sources failed",
        )
        assert result.status == "failed"
        assert result.decision == "failed"
        assert result.llm_used is False
        assert result.source.url == "approved_source_extraction"
        # When source_slug is provided, build_failed_result emits a source_error result
        assert len(result.source_results) == 1, "build_failed_result with source_slug should emit a source_error result"
        assert result.source_results[0].outcome == "source_error"
        assert result.source_results[0].errorCode == "extraction_failed"
        assert any("All sources failed" in w for w in result.validation.warnings)

    def test_prefers_evidence_url_when_available(self):
        result = build_failed_result(
            upc="001135",
            source_slug="bradley",
            error_message="All sources failed",
            evidence_url="https://frommfamily.com/products/gold-large-breed-adult",
        )
        assert result.source.url == "https://frommfamily.com/products/gold-large-breed-adult"

    def test_rejects_none(self):
        """Builder functions never return None."""
        result = build_failed_result(
            upc="test",
            error_message="Something went wrong",
        )
        assert result is not None
        assert result.status == "failed"
        assert result.source.url == "approved_source_extraction"

    def test_failed_result_preserves_requested_extraction_mode(self):
        result = build_failed_result(
            upc="test",
            error_message="Something went wrong",
            requested_extraction_mode="distributor_only",
        )

        assert result.requested_extraction_mode == "distributor_only"
        assert result.mode == "mixed"


class TestSourceResultOutcomes:
    """Verify every builder function emits the correct outcome on source_results."""

    def test_success_emits_found_outcome(self):
        result = build_success_result(
            upc="001135",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=001135",
            product_fields={"name": "E-Z HANG SCALE", "brand": "KERBL"},
            matched_fields=["name", "brand"],
            overall_confidence=0.85,
        )
        assert len(result.source_results) == 1
        sr = result.source_results[0]
        assert sr.outcome == "found"
        assert sr.sourceSlug == "bradley"
        assert sr.confidence == 0.85
        assert len(sr.matchedFields) == 2

    def test_partial_emits_found_outcome(self):
        result = build_partial_result(
            upc="010199",
            source_slug="bradley",
            source_type="distributor",
            evidence_url="https://www.bradleycaldwell.com/search?term=010199",
            product_fields={"name": "Some Product"},
            matched_fields=["name"],
            overall_confidence=0.45,
        )
        assert len(result.source_results) == 1
        sr = result.source_results[0]
        assert sr.outcome == "found"

    def test_no_match_emits_not_stocked_outcome(self):
        result = build_no_match_result(
            upc="999999",
            source_slug="bradley",
            evidence_url="https://www.bradleycaldwell.com/search?term=999999",
        )
        assert len(result.source_results) == 1
        sr = result.source_results[0]
        assert sr.outcome == "not_stocked"

    def test_auth_required_emits_source_error_outcome(self):
        result = build_auth_required_result(
            upc="072705115310",
            source_slug="phillips",
        )
        assert len(result.source_results) == 1
        sr = result.source_results[0]
        assert sr.outcome == "source_error"

    def test_failed_with_source_slug_emits_source_error_outcome(self):
        result = build_failed_result(
            upc="001135",
            source_slug="bradley",
            error_message="All sources failed",
        )
        # build_failed_result with source_slug should emit source_error
        assert len(result.source_results) == 1
        sr = result.source_results[0]
        assert sr.outcome == "source_error"
        assert sr.errorCode == "extraction_failed"
        assert sr.errorMessage == "All sources failed"
