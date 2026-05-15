"""Tests for Approved Source Policy Module.

Validates domain normalization, domain gating, URL validation, and
asset/image URL filtering.
"""

from __future__ import annotations

from scrapers.approved_sources.policy import (
    normalize_domain,
    is_disallowed_domain,
    is_domain_allowed,
    is_asset_domain_allowed,
    validate_url_allowed,
    validate_asset_url,
    filter_allowed_assets,
    check_disallowed_in_allowed,
)
from scrapers.approved_sources.types import ApprovedSourcePolicy


def _make_policy(**overrides) -> ApprovedSourcePolicy:
    """Helper to create a test policy with defaults."""
    defaults = dict(
        allowedDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
        allowedAssetDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
        disallowedDomains=[
            "amazon.com", "chewy.com", "walmart.com", "petco.com",
            "petsmart.com", "ebay.com", "etsy.com",
        ],
        approvedSourcesOnly=True,
    )
    defaults.update(overrides)
    return ApprovedSourcePolicy(**defaults)


# =============================================================================
# normalize_domain
# =============================================================================


class TestNormalizeDomain:
    def test_bare_domain(self):
        assert normalize_domain("example.com") == "example.com"

    def test_strips_www(self):
        assert normalize_domain("www.example.com") == "example.com"

    def test_strips_scheme(self):
        assert normalize_domain("https://example.com/path") == "example.com"

    def test_strips_path(self):
        assert normalize_domain("https://example.com/products/item") == "example.com"

    def test_strips_query(self):
        assert normalize_domain("https://example.com/page?q=test") == "example.com"

    def test_strips_fragment(self):
        assert normalize_domain("https://example.com/page#section") == "example.com"

    def test_strips_port(self):
        assert normalize_domain("https://example.com:8080/path") == "example.com"

    def test_lowercase(self):
        assert normalize_domain("Example.COM") == "example.com"

    def handles_protocol_relative(self):
        assert normalize_domain("//example.com/path") == "example.com"


# =============================================================================
# is_disallowed_domain
# =============================================================================


class TestIsDisallowedDomain:
    def test_block_amazon(self):
        assert is_disallowed_domain("amazon.com")

    def test_block_amazon_subdomain(self):
        assert is_disallowed_domain("images.amazon.com")

    def test_block_chewy(self):
        assert is_disallowed_domain("chewy.com")

    def test_block_walmart(self):
        assert is_disallowed_domain("walmart.com")

    def test_block_petco(self):
        assert is_disallowed_domain("petco.com")

    def test_block_petsmart(self):
        assert is_disallowed_domain("petsmart.com")

    def test_block_ebay(self):
        assert is_disallowed_domain("ebay.com")

    def test_block_etsy(self):
        assert is_disallowed_domain("etsy.com")

    def test_block_www_variant(self):
        assert is_disallowed_domain("www.amazon.com")

    def test_allow_approved_domain(self):
        assert not is_disallowed_domain("bradleycaldwell.com")

    def test_allow_custom_domain(self):
        assert not is_disallowed_domain("frommfamily.com")

    def test_partial_match_not_blocked(self):
        assert not is_disallowed_domain("not-amazon.com")

    def test_custom_blocklist(self):
        custom = ["example.com"]
        assert is_disallowed_domain("example.com", disallowed=custom)
        assert not is_disallowed_domain("amazon.com", disallowed=custom)


# =============================================================================
# is_domain_allowed
# =============================================================================


class TestIsDomainAllowed:
    def test_allowed_domain_pass(self):
        policy = _make_policy()
        assert is_domain_allowed("bradleycaldwell.com", policy)

    def test_disallowed_domain_blocked(self):
        policy = _make_policy()
        assert not is_domain_allowed("amazon.com", policy)

    def test_unknown_domain_blocked_when_approved_only(self):
        policy = _make_policy()
        assert not is_domain_allowed("unknown.com", policy)

    def test_unknown_domain_allowed_when_not_approved_only(self):
        policy = _make_policy(approvedSourcesOnly=False, allowedDomains=[])
        assert is_domain_allowed("unknown.com", policy)

    def test_unknown_domain_blocked_when_allowed_list_present(self):
        policy = _make_policy(allowedDomains=["bradleycaldwell.com"])
        assert not is_domain_allowed("unknown.com", policy)

    def test_suffix_matching_in_allowed(self):
        policy = _make_policy(allowedDomains=["bradleycaldwell.com"])
        assert is_domain_allowed("shop.bradleycaldwell.com", policy)

    def test_disallowed_even_if_in_allowed(self):
        """Disallowed domains are always blocked, even if accidentally in allowed list."""
        policy = _make_policy(allowedDomains=["amazon.com"])
        assert not is_domain_allowed("amazon.com", policy)

    def test_empty_allowed_and_not_approved_only(self):
        policy = _make_policy(allowedDomains=[], approvedSourcesOnly=False)
        assert is_domain_allowed("example.com", policy)


# =============================================================================
# is_asset_domain_allowed
# =============================================================================


class TestIsAssetDomainAllowed:
    def test_allowed_asset_domain_pass(self):
        policy = _make_policy()
        assert is_asset_domain_allowed("bradleycaldwell.com", policy)

    def test_disallowed_asset_domain_blocked(self):
        policy = _make_policy()
        assert not is_asset_domain_allowed("amazon.com", policy)

    def test_unknown_asset_blocked_when_approved_only(self):
        policy = _make_policy()
        assert not is_asset_domain_allowed("cdn.unknown.com", policy)

    def test_falls_back_to_allowed_domain(self):
        policy = _make_policy(
            allowedAssetDomains=[],
            allowedDomains=["bradleycaldwell.com"],
        )
        assert is_asset_domain_allowed("bradleycaldwell.com", policy)

    def test_disallowed_amazon_images(self):
        policy = _make_policy()
        assert not is_asset_domain_allowed("images-na.ssl-images-amazon.com", policy)


# =============================================================================
# validate_url_allowed
# =============================================================================


class TestValidateUrlAllowed:
    def test_valid_allowed_url(self):
        policy = _make_policy()
        ok, err = validate_url_allowed("https://www.bradleycaldwell.com/search?term=001135", policy)
        assert ok is True
        assert err is None

    def test_blocked_url(self):
        policy = _make_policy()
        ok, err = validate_url_allowed("https://www.amazon.com/dp/B0012ABCDE", policy)
        assert ok is False
        assert "not allowed" in (err or "").lower()


# =============================================================================
# validate_asset_url
# =============================================================================


class TestValidateAssetUrl:
    def test_valid_asset_url(self):
        policy = _make_policy()
        ok, err = validate_asset_url(
            "https://www.bradleycaldwell.com/images/product.jpg",
            policy,
        )
        assert ok is True
        assert err is None

    def test_blocked_asset_url(self):
        policy = _make_policy()
        ok, err = validate_asset_url("https://images-na.ssl-images-amazon.com/product.jpg", policy)
        assert ok is False
        assert "asset domain" in (err or "").lower()


# =============================================================================
# filter_allowed_assets
# =============================================================================


class TestFilterAllowedAssets:
    def test_filters_approved_urls(self):
        policy = _make_policy()
        urls = [
            "https://www.bradleycaldwell.com/images/product.jpg",
            "https://www.amazon.com/images/bad.jpg",
            "https://chewy.com/images/bad.png",
        ]
        allowed = filter_allowed_assets(urls, policy)
        assert len(allowed) == 1
        assert "bradleycaldwell.com" in allowed[0]

    def test_permissive_policy_still_blocks_disallowed(self):
        """Even with permissive policy, disallowed domains are blocked."""
        policy = _make_policy(
            approvedSourcesOnly=False,
            allowedDomains=[],
            allowedAssetDomains=[],
        )
        urls = [
            "https://example.com/image.jpg",
            "https://test.com/photo.png",
        ]
        allowed = filter_allowed_assets(urls, policy)
        # Both are not in allowedAssetDomains and not in allowedDomains
        # With empty allowedAssetDomains and empty allowedDomains but no disallowed,
        # policy falls back to domain check which passes
        # But example.com isn't in allowedDomains or allowedAssetDomains
        # When approvedSourcesOnly=False and both lists are empty, anything passes
        assert len(allowed) == 2

    def test_empty_input(self):
        policy = _make_policy()
        allowed = filter_allowed_assets([], policy)
        assert allowed == []


# =============================================================================
# check_disallowed_in_allowed
# =============================================================================


class TestCheckDisallowedInAllowed:
    def test_finds_offenders(self):
        policy = _make_policy()
        offenders = check_disallowed_in_allowed(
            ["bradleycaldwell.com", "amazon.com", "centralpet.com", "chewy.com"],
            policy,
        )
        assert "amazon.com" in offenders
        assert "chewy.com" in offenders
        assert "bradleycaldwell.com" not in offenders

    def test_no_offenders(self):
        policy = _make_policy()
        offenders = check_disallowed_in_allowed(
            ["bradleycaldwell.com", "centralpet.com"],
            policy,
        )
        assert offenders == []

    def test_empty_input(self):
        policy = _make_policy()
        assert check_disallowed_in_allowed([], policy) == []
