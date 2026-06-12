from __future__ import annotations

import pytest

from scrapers.ai_search.enrichment_models import build_nested_product_facts, parse_weight_lbs


class TestParseWeightLbs:
    def test_parses_pounds(self):
        assert parse_weight_lbs("44 pounds") == pytest.approx(44.0)

    def test_converts_ounces_to_pounds(self):
        assert parse_weight_lbs("5 Ounces") == pytest.approx(5.0 / 16.0)

    def test_converts_kilograms_to_pounds(self):
        assert parse_weight_lbs("2 kg") == pytest.approx(4.4092452436)

    def test_build_nested_product_facts_uses_normalized_weight(self):
        facts = build_nested_product_facts(
            {
                "name": "Sample Product",
                "weight": "5 Ounces",
            },
            evidence_url="https://example.com/product",
        )

        assert facts.core is not None
        assert facts.core.weight_lbs == pytest.approx(5.0 / 16.0)

    def test_upc_survives_as_facet(self):
        """upc should survive as a facet, not be silently dropped."""
        facts = build_nested_product_facts(
            {
                "name": "Test Product",
                "brand": "Test Brand",
                "upc": "035585775203",
            },
            evidence_url="https://example.com/product",
        )
        assert facts._get_facet("upc") == "035585775203"
        assert facts.upc == "035585775203"

    def test_identity_fields_preserved_through_full_build(self):
        """item_number and upc survive. product_number is silently dropped (distributor-internal SKU)."""
        facts = build_nested_product_facts(
            {
                "name": "Test",
                "brand": "Brand",
                "product_number": "PN001",
                "item_number": "IN001",
                "upc": "123456789012",
            },
            evidence_url="https://example.com/product",
        )
        # product_number is a distributor-internal SKU — not mapped to item_number
        assert facts._get_facet("product_number") is None
        # explicit item_number should be preserved
        assert facts._get_facet("item_number") == "IN001"
        # upc should survive as a facet
        assert facts._get_facet("upc") == "123456789012"
