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
