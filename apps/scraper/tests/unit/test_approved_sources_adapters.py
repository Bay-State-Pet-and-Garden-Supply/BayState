"""Tests for approved source distributor adapters.

These tests validate that adapters can:
- Build correct search URLs
- Extract product data from HTML fixtures
- Handle no-match cases
- Filter images through policy
- Report auth-required for login-gated distributors
"""
from __future__ import annotations



from scrapers.approved_sources.types import (
    ApprovedSourcePlan,
    ApprovedSourcePlanEntry,
    ApprovedSourceBrand,
    ApprovedSourcePolicy,
    ApprovedSourceLLMPolicy,
)


def _make_plan(
    sku: str = "001135",
    brand_name: str = "KERBL",
    selected_distributor: str | None = "bradley",
) -> ApprovedSourcePlan:
    return ApprovedSourcePlan(
        sku=sku,
        input={"name": "E-Z HANG SCALE", "price": None},
        brand=ApprovedSourceBrand(id="brand-1", name=brand_name, slug="kerbl"),
        selectedDistributorSlug=selected_distributor,
        priority=[
            ApprovedSourcePlanEntry(
                sourceType="distributor",
                sourceSlug="bradley",
                displayName="Bradley Caldwell",
                domains=["bradleycaldwell.com"],
                assetDomains=["bradleycaldwell.com"],
                adapterSlug="bradley_crawl4ai",
                requiresAuth=False,
                searchMode="sku_search",
                allowedFields=["name", "brand", "sku", "image_urls"],
                priority=10,
                runFirst=True,
            )
        ],
        sourcePolicy=ApprovedSourcePolicy(
            allowedDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
            allowedAssetDomains=["bradleycaldwell.com", "centralpet.com", "orgill.com", "shop.phillipspet.com", "petfoodexperts.com"],
            disallowedDomains=["amazon.com", "chewy.com", "walmart.com", "petco.com", "petsmart.com"],
            approvedSourcesOnly=True,
        ),
        llmPolicy=ApprovedSourceLLMPolicy(enabled=True),
    )


def _make_entry(
    slug: str = "bradley",
    adapter: str = "bradley_crawl4ai",
    domains: list[str] | None = None,
    auth: bool = False,
) -> ApprovedSourcePlanEntry:
    return ApprovedSourcePlanEntry(
        sourceType="distributor",
        sourceSlug=slug,
        displayName=slug.replace("_", " ").title(),
        domains=domains or ["bradleycaldwell.com"],
        assetDomains=domains or ["bradleycaldwell.com"],
        adapterSlug=adapter,
        requiresAuth=auth,
        searchMode="sku_search",
        allowedFields=["name", "brand", "sku", "image_urls"],
        priority=10,
        runFirst=True,
    )


class TestBradleyAdapter:
    """Tests for Bradley Caldwell adapter."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.bradley import BradleyAdapter

        entry = _make_entry()
        plan = _make_plan(sku="001135")
        adapter = BradleyAdapter(entry, plan)

        url = adapter.build_search_url("001135")
        assert "bradleycaldwell.com" in url
        assert "001135" in url

    def test_normalize_images(self):
        from scrapers.approved_sources.adapters.bradley import BradleyAdapter

        entry = _make_entry()
        plan = _make_plan()
        adapter = BradleyAdapter(entry, plan)

        urls = [
            "https://www.bradleycaldwell.com/images/small/product.jpg",
            "https://www.bradleycaldwell.com/images/product_small.jpg",
            "https://www.bradleycaldwell.com/images/product_thumbnail.jpg",
        ]
        normalized = adapter.normalize_images(urls)
        assert "/large/" in normalized[0]
        assert "_large" in normalized[1]
        assert "_large" in normalized[2]
        assert "small" not in normalized[0]
        assert "_small" not in normalized[1]
        assert "_thumbnail" not in normalized[2]


class TestCentralPetAdapter:
    """Tests for Central Pet adapter."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.central_pet import CentralPetAdapter

        entry = _make_entry(slug="central_pet", adapter="central_pet_crawl4ai", domains=["centralpet.com"])
        plan = _make_plan(sku="38777520")
        adapter = CentralPetAdapter(entry, plan)

        url = adapter.build_search_url("38777520")
        assert "centralpet.com" in url
        assert "38777520" in url

    def test_normalize_images(self):
        from scrapers.approved_sources.adapters.central_pet import CentralPetAdapter

        entry = _make_entry(slug="central_pet", adapter="central_pet_crawl4ai", domains=["centralpet.com"])
        plan = _make_plan()
        adapter = CentralPetAdapter(entry, plan)

        urls = [
            "https://www.centralpet.com/images/w_200/product.jpg",
            "https://www.centralpet.com/images/h_200/product.jpg",
        ]
        normalized = adapter.normalize_images(urls)
        assert "/w_1500/" in normalized[0]
        assert "/h_1500/" in normalized[1]


class TestOrgillAdapter:
    """Tests for Orgill adapter (login required)."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.orgill import OrgillAdapter

        entry = _make_entry(slug="orgill", adapter="orgill_crawl4ai", domains=["orgill.com"], auth=True)
        plan = _make_plan(sku="037193347322")
        adapter = OrgillAdapter(entry, plan)

        url = adapter.build_search_url("037193347322")
        assert "orgill.com" in url
        assert "037193347322" in url

    def test_requires_auth(self):
        from scrapers.approved_sources.adapters.orgill import OrgillAdapter

        entry = _make_entry(slug="orgill", adapter="orgill_crawl4ai", domains=["orgill.com"], auth=True)
        plan = _make_plan()
        adapter = OrgillAdapter(entry, plan)
        assert adapter.requires_auth is True

    def test_detects_login_page(self):
        from scrapers.approved_sources.adapters.orgill import OrgillAdapter
        from scrapers.approved_sources.types import FailureCode

        entry = _make_entry(slug="orgill", adapter="orgill_crawl4ai", domains=["orgill.com"], auth=True)
        plan = _make_plan(sku="037193347322")
        adapter = OrgillAdapter(entry, plan)

        # Simulate login page HTML
        html = """
        <html>
        <head><title>Sign In</title></head>
        <body>
            <form>
                <input id="cphMainContent_ctl00_loginOrgillxs_UserName" />
                <input id="cphMainContent_ctl00_loginOrgillxs_Password" />
                <input id="cphMainContent_ctl00_loginOrgillxs_LoginButton" type="submit" />
            </form>
        </body>
        </html>
        """
        result = adapter.extract_from_html(html, "037193347322", "https://www.orgill.com/SearchResultN.aspx?ddlhQ=037193347322")
        assert result.success is False
        assert result.failure_code == FailureCode.AUTH_REQUIRED
        assert result.auth_required is True

    def test_normalize_images(self):
        from scrapers.approved_sources.adapters.orgill import OrgillAdapter

        entry = _make_entry(slug="orgill", adapter="orgill_crawl4ai", domains=["orgill.com"], auth=True)
        plan = _make_plan()
        adapter = OrgillAdapter(entry, plan)

        urls = [
            "https://www.orgill.com/images/websmall/product.jpg",
            "https://www.orgill.com/images/product_thumb.jpg",
        ]
        normalized = adapter.normalize_images(urls)
        assert "/web/" in normalized[0]
        assert "thumb" not in normalized[1]


class TestPhillipsAdapter:
    """Tests for Phillips adapter (login required)."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan(sku="072705115310")
        adapter = PhillipsAdapter(entry, plan)

        url = adapter.build_search_url("072705115310")
        assert "shop.phillipspet.com" in url
        assert "072705115310" in url

    def test_requires_auth(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan()
        adapter = PhillipsAdapter(entry, plan)
        assert adapter.requires_auth is True

    def test_normalize_images(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan()
        adapter = PhillipsAdapter(entry, plan)

        urls = [
            "https://shop.phillipspet.com/images/thumb/product.jpg",
            "https://shop.phillipspet.com/images/product_thumb.jpg",
        ]
        normalized = adapter.normalize_images(urls)
        assert "/large/" in normalized[0]
        assert "_large" in normalized[1]


class TestPetFoodExpertsAdapter:
    """Tests for Pet Food Experts adapter (login required)."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter

        entry = _make_entry(
            slug="pet_food_experts", adapter="pet_food_experts_crawl4ai",
            domains=["orders.petfoodexperts.com"], auth=True
        )
        plan = _make_plan(sku="33011808")
        adapter = PetFoodExpertsAdapter(entry, plan)

        url = adapter.build_search_url("33011808")
        assert "orders.petfoodexperts.com" in url
        assert "33011808" in url

    def test_requires_auth(self):
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter

        entry = _make_entry(
            slug="pet_food_experts", adapter="pet_food_experts_crawl4ai",
            domains=["orders.petfoodexperts.com"], auth=True
        )
        plan = _make_plan()
        adapter = PetFoodExpertsAdapter(entry, plan)
        assert adapter.requires_auth is True

    def test_detects_signin_page(self):
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter
        from scrapers.approved_sources.types import FailureCode

        entry = _make_entry(
            slug="pet_food_experts", adapter="pet_food_experts_crawl4ai",
            domains=["orders.petfoodexperts.com"], auth=True
        )
        plan = _make_plan(sku="33011808")
        adapter = PetFoodExpertsAdapter(entry, plan)

        html = """
        <html>
        <head><title>Sign In</title></head>
        <body>
            <form>
                <input id="userName" name="userName" />
                <input id="password" name="password" type="password" />
                <button data-test-selector="signIn_submit">Sign In</button>
            </form>
        </body>
        </html>
        """
        result = adapter.extract_from_html(html, "33011808", "https://orders.petfoodexperts.com/Search?query=33011808")
        assert result.success is False
        assert result.failure_code == FailureCode.AUTH_REQUIRED
        assert result.auth_required is True

    def test_normalize_images(self):
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter

        entry = _make_entry(
            slug="pet_food_experts", adapter="pet_food_experts_crawl4ai",
            domains=["orders.petfoodexperts.com"], auth=True
        )
        plan = _make_plan()
        adapter = PetFoodExpertsAdapter(entry, plan)

        urls = [
            "https://orders.petfoodexperts.com/images/product_md.jpg",
            "https://orders.petfoodexperts.com/images/product_sm.jpg",
            "https://orders.petfoodexperts.com/images/product_thumbnail.jpg",
        ]
        normalized = adapter.normalize_images(urls)
        assert "_lg" in normalized[0]
        assert "_lg" in normalized[1]
        assert "_lg" in normalized[2]
        assert "_md" not in normalized[0]
        assert "_sm" not in normalized[1]
        assert "_thumbnail" not in normalized[2]


class TestImageFiltering:
    """Verify adapters filter images through policy."""

    def test_bradley_removes_disallowed_images(self):
        from scrapers.approved_sources.adapters.bradley import BradleyAdapter

        entry = _make_entry()
        plan = _make_plan()
        adapter = BradleyAdapter(entry, plan)

        policy = plan.sourcePolicy
        urls = [
            "https://www.bradleycaldwell.com/images/product.jpg",
            "https://www.amazon.com/images/bad.jpg",
            "https://chewy.com/images/bad.png",
        ]
        filtered = adapter.filter_images(urls, policy)
        assert len(filtered) == 1
        assert "bradleycaldwell.com" in filtered[0]
