"""Unit tests for QueryBuilder discovery query methods.

Tests build_sku_discovery_query and build_name_discovery_query for
edge cases including short numeric SKUs, long SKUs, missing brand,
exclusions, and empty inputs.
"""

from __future__ import annotations

from scrapers.ai_search.query_builder import QueryBuilder


# =============================================================================
# build_sku_discovery_query Tests
# =============================================================================


class TestBuildSkuDiscoveryQuery:
    """Tests for QueryBuilder.build_sku_discovery_query."""

    def test_short_numeric_sku_with_brand(self) -> None:
        """A short numeric SKU (<5 digits) with brand should prepend brand."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("123", "TestBrand")
        assert result == "TestBrand 123"

    def test_long_numeric_sku_without_brand(self) -> None:
        """A long numeric SKU (>=5 digits) should not get brand prefix even if brand absent."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("123456789012", None)
        assert result == "123456789012"

    def test_long_numeric_sku_with_brand(self) -> None:
        """A long numeric SKU with brand should still return just the SKU (not ambiguous)."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("123456789012", "TestBrand")
        assert result == "123456789012"

    def test_missing_brand_with_short_sku(self) -> None:
        """A short numeric SKU without brand should return just the SKU (no brand to prepend)."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("123")
        assert result == "123"

    def test_empty_sku_returns_empty_string(self) -> None:
        """An empty SKU should return an empty string."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("")
        assert result == ""

    def test_sku_with_none_value(self) -> None:
        """A None SKU should return an empty string."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query(None)
        assert result == ""

    def test_alphanumeric_sku_not_ambiguous(self) -> None:
        """An alphanumeric SKU is not considered ambiguous, so no brand prefix."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("ABC-123", "TestBrand")
        assert result == "ABC-123"

    def test_boundary_sku_length_four_is_ambiguous(self) -> None:
        """A 4-digit SKU is still ambiguous (len < 5), so brand prefix is added."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("1234", "TestBrand")
        assert result == "TestBrand 1234"

    def test_boundary_sku_length_five_is_not_ambiguous(self) -> None:
        """A 5-digit SKU is not ambiguous (len == 5), so no brand prefix."""
        qb = QueryBuilder()
        result = qb.build_sku_discovery_query("12345", "TestBrand")
        assert result == "12345"


# =============================================================================
# build_name_discovery_query Tests
# =============================================================================


class TestBuildNameDiscoveryQuery:
    """Tests for QueryBuilder.build_name_discovery_query."""

    def test_name_and_brand(self) -> None:
        """Name and brand should be combined with a space."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query(
            "Miracle-Gro Potting Mix", "Miracle-Gro", []
        )
        assert result == "Miracle-Gro Potting Mix Miracle-Gro"

    def test_name_only_no_brand(self) -> None:
        """With only a name and no brand, just the name should be returned."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query("Potting Mix", None, [])
        assert result == "Potting Mix"

    def test_brand_only_no_name(self) -> None:
        """With only a brand and no name, just the brand should be returned."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query(None, "Miracle-Gro", [])
        assert result == "Miracle-Gro"

    def test_with_exclusions(self) -> None:
        """Exclusions should be appended as -site: filters."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query(
            "Potting Mix",
            "Miracle-Gro",
            ["amazon.com", "walmart.com"],
        )
        assert "-site:amazon.com" in result
        assert "-site:walmart.com" in result
        assert result.startswith("Potting Mix Miracle-Gro")

    def test_empty_name_and_brand(self) -> None:
        """When both name and brand are empty, return empty string."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query("", None, [])
        assert result == ""

    def test_empty_name_with_exclusions_only(self) -> None:
        """When name is empty and no brand, exclusions alone should not create a query."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query("", "", ["amazon.com"])
        assert result == " -site:amazon.com"
        # The leading space is a side effect of joining empty parts; acceptable

    def test_exclusions_empty_list(self) -> None:
        """An empty exclusions list should not add any site filters."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query("Product Name", "Brand", [])
        assert "-site:" not in result
        assert result == "Product Name Brand"

    def test_name_and_brand_with_special_chars(self) -> None:
        """Special characters in name/brand should be cleaned."""
        qb = QueryBuilder()
        result = qb.build_name_discovery_query(
            'Product "Name"', 'Brand-Name', []
        )
        # Quotes should be stripped by _clean_text
        assert '"' not in result
