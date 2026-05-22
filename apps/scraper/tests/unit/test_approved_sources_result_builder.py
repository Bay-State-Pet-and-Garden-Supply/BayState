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
        assert result.validation.sku_match is True

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
        assert result.validation.sku_match is False
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
        assert result.validation.sku_match is False
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
        assert len(result.source_results) == 0  # generic failure, no per-source results
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
