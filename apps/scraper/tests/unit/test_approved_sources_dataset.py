"""Tests for approved source benchmark datasets.

Validates:
- Dataset files match expected schemas
- No positive extraction entry uses disallowed retailer domains
- Retailer rows are only in negative_source_dataset
- Every distributor has required minimum entries
- Every dataset row has required fields
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

# Path to benchmark fixtures
BENCHMARK_DIR = Path(__file__).parent.parent.parent / "benchmarks" / "approved_sources" / "fixtures"

DISALLOWED_DOMAINS = [
    "amazon.com", "amzn.to", "chewy.com", "walmart.com",
    "petco.com", "petsmart.com", "ebay.com", "etsy.com",
    "target.com", "instacart.com",
]

APPROVED_DISTRIBUTOR_DOMAINS = {
    "bradley": ["bradleycaldwell.com"],
    "central_pet": ["centralpet.com"],
    "orgill": ["orgill.com"],
    "phillips": ["shop.phillipspet.com"],
    "pet_food_experts": ["orders.petfoodexperts.com", "petfoodexperts.com"],
}


def _load_json(path: str) -> dict:
    full_path = BENCHMARK_DIR / path
    if not full_path.exists():
        pytest.skip(f"Dataset file not found: {full_path}")
    with open(full_path) as f:
        return json.load(f)


# =============================================================================
# Approved Source Dataset
# =============================================================================


class TestApprovedSourceDataset:
    """Validate approved_source_dataset.json."""

    @pytest.fixture
    def data(self):
        return _load_json("approved_source_dataset.json")

    def test_schema_version(self, data):
        assert data["schema_version"] == "approved-source-dataset-v1"

    def test_entries_exist(self, data):
        assert len(data["entries"]) > 0

    def test_every_entry_has_required_fields(self, data):
        required = [
            "dataset_kind", "source_slug", "adapter_slug", "source_type",
            "upc", "search_input", "allowed_domains", "allowed_asset_domains",
            "expected", "difficulty", "tags",
        ]
        for entry in data["entries"]:
            for field in required:
                assert field in entry, f"Entry UPC={entry.get("upc")} missing {field}"

    def test_no_retailer_positive_entries(self, data):
        """No positive extraction entry should have a disallowed domain."""
        for entry in data["entries"]:
            for domain in entry.get("allowed_domains", []):
                for bad in DISALLOWED_DOMAINS:
                    assert bad not in domain, (
                        f"Entry UPC={entry["upc"]} has disallowed domain: {domain}"
                    )

    def test_distributor_domain_matches(self, data):
        """Each distributor's allowed domains should match expectations."""
        for entry in data["entries"]:
            slug = entry["source_slug"]
            if slug in APPROVED_DISTRIBUTOR_DOMAINS:
                expected = APPROVED_DISTRIBUTOR_DOMAINS[slug]
                for domain in entry["allowed_domains"]:
                    assert any(d in domain for d in expected), (
                        f"UPC={entry["upc"]}: {domain} not in expected domains for {slug}"
                    )

    def test_bradley_minimum_entries(self, data):
        bradley = [e for e in data["entries"] if e["source_slug"] == "bradley"]
        assert len(bradley) >= 3, f"Expected >= 3 Bradley entries, got {len(bradley)}"

    def test_central_pet_minimum_entries(self, data):
        central = [e for e in data["entries"] if e["source_slug"] == "central_pet"]
        assert len(central) >= 3, f"Expected >= 3 Central Pet entries, got {len(central)}"

    def test_orgill_minimum_entries(self, data):
        orgill = [e for e in data["entries"] if e["source_slug"] == "orgill"]
        assert len(orgill) >= 2, f"Expected >= 2 Orgill entries, got {len(orgill)}"

    def test_phillips_minimum_entries(self, data):
        phillips = [e for e in data["entries"] if e["source_slug"] == "phillips"]
        assert len(phillips) >= 2, f"Expected >= 2 Phillips entries, got {len(phillips)}"

    def test_pet_food_experts_minimum_entries(self, data):
        pfe = [e for e in data["entries"] if e["source_slug"] == "pet_food_experts"]
        assert len(pfe) >= 2, f"Expected >= 2 Pet Food Experts entries, got {len(pfe)}"

    def test_legacy_reference_present(self, data):
        """Every entry should reference legacy config or document why not."""
        for entry in data["entries"]:
            assert "legacy_reference" in entry or entry.get("notes"), (
                f"Entry UPC={entry.get("upc")} missing legacy_reference"
            )


# =============================================================================
# SERP Discovery Dataset
# =============================================================================


class TestSERPDataset:
    """Validate serp_discovery_dataset.json."""

    @pytest.fixture
    def data(self):
        return _load_json("serp_discovery_dataset.json")

    def test_schema_version(self, data):
        assert data["schema_version"] == "official-brand-benchmark-dataset-v1"

    def test_minimum_entries(self, data):
        assert len(data["entries"]) >= 50, (
            f"Expected >= 50 SERP entries, got {len(data['entries'])}"
        )

    def test_every_entry_has_required_fields(self, data):
        required = [
            "upc", "brand", "product_name", "expected_official_domains",
            "source_legality", "expected_behavior",
        ]
        for entry in data["entries"]:
            for field in required:
                assert field in entry, f"Entry UPC={entry.get("upc")} missing {field}"

    def test_every_entry_has_source_legality(self, data):
        for entry in data["entries"]:
            assert "approved_positive_domains" in entry["source_legality"]
            assert "disallowed_negative_domains" in entry["source_legality"]

    def test_hard_cases_exist(self, data):
        hard = [e for e in data["entries"] if e.get("difficulty") == "hard"]
        assert len(hard) >= 8

    def test_negative_cases_exist(self, data):
        negative = [e for e in data["entries"] if "negative" in e.get("tags", [])]
        assert len(negative) >= 10

    def test_garden_cases_exist(self, data):
        garden = [e for e in data["entries"] if "garden" in e.get("tags", []) or "lawn" in e["category"].lower()]
        assert len(garden) >= 8

    def test_pet_food_cases_exist(self, data):
        pet_food = [e for e in data["entries"] if "pet-food" in e.get("tags", [])]
        assert len(pet_food) >= 8

    def test_toy_accessory_cases_exist(self, data):
        toy = [e for e in data["entries"] if "toy" in e.get("tags", []) or "accessory" in e.get("tags", [])]
        assert len(toy) >= 4

    def test_no_retailer_positive_domains(self, data):
        """Approved domains must not contain disallowed retailers."""
        for entry in data["entries"]:
            for domain in entry["source_legality"]["approved_positive_domains"]:
                for bad in DISALLOWED_DOMAINS:
                    assert bad not in domain, (
                        f"UPC={entry["upc"]}: disallowed domain in approved_positive_domains: {domain}"
                    )


# =============================================================================
# Official Extraction Dataset
# =============================================================================


class TestOfficialExtractionDataset:
    """Validate official_extraction_dataset.json."""

    @pytest.fixture
    def data(self):
        return _load_json("official_extraction_dataset.json")

    def test_schema_version(self, data):
        assert data["schema_version"] == "official-brand-extraction-dataset-v1"

    def test_no_retailer_source_type(self, data):
        for entry in data["entries"]:
            assert entry.get("source_type") != "retailer", (
                f"UPC={entry["upc"]}: retailer source_type not allowed in official extraction dataset"
            )

    def test_all_entries_are_official(self, data):
        for entry in data["entries"]:
            assert entry.get("source_type") == "official", (
                f"UPC={entry["upc"]}: source_type must be 'official'"
            )

    def test_every_entry_has_required_fields(self, data):
        required = [
            "upc", "product_name", "brand", "source_url", "source_type",
            "approved_domains", "ground_truth", "expected",
        ]
        for entry in data["entries"]:
            for field in required:
                assert field in entry, f"Entry UPC={entry.get("upc")} missing {field}"

    def test_ground_truth_has_required_fields(self, data):
        for entry in data["entries"]:
            gt = entry["ground_truth"]
            for field in ["brand", "name", "image_required"]:
                assert field in gt, f"Entry UPC={entry["upc"]} ground_truth missing {field}"


# =============================================================================
# Negative Source Dataset
# =============================================================================


class TestNegativeSourceDataset:
    """Validate negative_source_dataset.json."""

    @pytest.fixture
    def data(self):
        return _load_json("negative_source_dataset.json")

    def test_schema_version(self, data):
        assert data["schema_version"] in (
            "negative-source-dataset-v1",
        )

    def test_entries_exist(self, data):
        assert len(data["entries"]) >= 10

    def test_all_entries_reject_extraction(self, data):
        for entry in data["entries"]:
            assert entry["expected_behavior"]["may_extract"] is False, (
                f"UPC={entry['upc']}: negative source must not allow extraction"
            )
            assert entry["expected_behavior"]["may_use_images"] is False, (
                f"UPC={entry['upc']}: negative source must not allow images"
            )

    def test_retailer_domains_present(self, data):
        domains = [e["candidate_domain"] for e in data["entries"]]
        important_retailers = ["amazon.com", "chewy.com", "walmart.com", "petco.com", "petsmart.com"]
        for r in important_retailers:
            assert r in domains, f"Negative dataset missing {r}"

    def test_marketplace_domains_present(self, data):
        domains = [e["candidate_domain"] for e in data["entries"]]
        assert "ebay.com" in domains
        assert "etsy.com" in domains

    def test_quarantined_rows_present(self, data):
        """Previously quarantined extraction_seed retailer rows must be here."""
        tags = [t for e in data["entries"] for t in e.get("tags", [])]
        assert "quarantined-from-extraction-seed" in tags

    def test_every_entry_has_required_fields(self, data):
        required = [
            "dataset_kind", "upc", "product_name", "brand",
            "candidate_url", "candidate_domain", "source_type",
            "reason", "expected_behavior",
        ]
        for entry in data["entries"]:
            for field in required:
                assert field in entry, f"Entry UPC={entry.get('upc')} missing {field}"
