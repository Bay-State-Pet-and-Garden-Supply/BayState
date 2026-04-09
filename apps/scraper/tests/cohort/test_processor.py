from __future__ import annotations

from scrapers.cohort import CohortProcessor


def test_groups_products_by_upc_prefix() -> None:
    processor = CohortProcessor(prefix_length=8)

    cohorts = processor.group_products(
        [
            {"sku": "123456789012", "brand": "Acme"},
            {"sku": "123456789013", "brand": "Acme"},
            {"sku": "999999999999", "brand": "Other"},
        ]
    )

    assert sorted(cohorts) == ["12345678", "99999999"]
    assert [product["sku"] for product in cohorts["12345678"]] == ["123456789012", "123456789013"]
    assert [product["sku"] for product in cohorts["99999999"]] == ["999999999999"]


def test_returns_full_upc_when_shorter_than_prefix() -> None:
    processor = CohortProcessor(prefix_length=8)

    assert processor.build_cohort_key({"sku": "12345"}) == "12345"


def test_skips_missing_or_non_numeric_upcs() -> None:
    processor = CohortProcessor(prefix_length=8)

    cohorts = processor.group_products(
        [
            {"sku": "12345678"},
            {"sku": ""},
            {"sku": None},
            {"sku": "ABC12345"},
        ]
    )

    assert cohorts == {"12345678": [{"sku": "12345678"}]}


def test_handles_mixed_upc_lengths_in_same_batch() -> None:
    processor = CohortProcessor(prefix_length=8)

    cohorts = processor.group_products(
        [
            {"sku": "123456789012"},
            {"sku": "12345678"},
            {"sku": "1234567"},
        ]
    )

    assert sorted(cohorts) == ["1234567", "12345678"]
    assert [product["sku"] for product in cohorts["12345678"]] == ["123456789012", "12345678"]
    assert [product["sku"] for product in cohorts["1234567"]] == ["1234567"]


def test_returns_shared_metadata_for_upc_cohort() -> None:
    processor = CohortProcessor(prefix_length=8)
    products = [
        {"sku": "123456789012", "brand": "Acme", "category": "Toys"},
        {"sku": "123456789013", "brand": "Acme", "category": "Toys"},
    ]

    metadata = processor.get_cohort_metadata("12345678", products)

    assert metadata == {
        "cohort_key": "12345678",
        "grouping_strategy": "upc_prefix",
        "product_count": 2,
        "common_brands": ["Acme"],
        "common_categories": ["Toys"],
        "upc_prefix": "12345678",
    }


def test_ai_search_family_strategy_matches_existing_logic() -> None:
    processor = CohortProcessor(grouping_strategy="ai_search_family")

    product = {
        "brand": "Four Paws",
        "product_name": "Four Paws Wee-Wee Cat Pads Fresh Scent 11X17 10CT",
        "sku": "045663976866",
    }

    key = processor.build_cohort_key(product)

    brand_key, family_key = key.split("::", maxsplit=1)

    assert brand_key == "fourpaws"
    assert family_key
    assert "fresh" not in family_key
    assert "11" not in family_key
    assert "10" not in family_key


def test_raises_for_unknown_strategy() -> None:
    processor = CohortProcessor(grouping_strategy="mystery")

    try:
        _ = processor.build_cohort_key({"sku": "12345678"})
    except ValueError as exc:
        assert "Unknown strategy" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unknown strategy")


def test_rejects_invalid_prefix_length() -> None:
    try:
        _ = CohortProcessor(prefix_length=0)
    except ValueError as exc:
        assert "prefix_length must be greater than 0" in str(exc)
    else:
        raise AssertionError("Expected ValueError for invalid prefix length")
