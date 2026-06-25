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
)


def _make_plan(
    upc: str = "001135",
    brand_name: str = "KERBL",
    selected_distributor: str | None = "bradley",
    name: str = "E-Z HANG SCALE",
    brand_slug: str = "kerbl",
) -> ApprovedSourcePlan:
    return ApprovedSourcePlan(
        upc=upc,
        input={"name": name, "price": None},
        brand=ApprovedSourceBrand(id="brand-1", name=brand_name, slug=brand_slug),
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
                allowedFields=["name", "brand", "upc", "image_urls"],
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
        allowedFields=["name", "brand", "upc", "image_urls"],
        priority=10,
        runFirst=True,
    )


class TestBradleyAdapter:
    """Tests for Bradley Caldwell adapter."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.bradley import BradleyAdapter

        entry = _make_entry()
        plan = _make_plan(upc="001135")
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
        plan = _make_plan(upc="38777520")
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
        plan = _make_plan(upc="037193347322")
        adapter = OrgillAdapter(entry, plan)

        url = adapter.build_search_url("037193347322")
        assert "orgill.com" in url
        assert "037193347322" in url

    def test_build_search_url_encodes_special_chars(self):
        from scrapers.approved_sources.adapters.orgill import OrgillAdapter

        entry = _make_entry(slug="orgill", adapter="orgill_crawl4ai", domains=["orgill.com"], auth=True)
        plan = _make_plan(upc="A B/C#1")
        adapter = OrgillAdapter(entry, plan)

        url = adapter.build_search_url("A B/C#1")
        assert "A%20B%2FC%231" in url

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
        plan = _make_plan(upc="037193347322")
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
        assert "/weblarge/" in normalized[0]
        assert "thumb" not in normalized[1]

    def test_extract_accepts_upc_match_even_when_item_number_differs(self):
        from scrapers.approved_sources.adapters.orgill import OrgillAdapter

        entry = _make_entry(slug="orgill", adapter="orgill_crawl4ai", domains=["orgill.com"], auth=True)
        plan = _make_plan(upc="037193347322")
        adapter = OrgillAdapter(entry, plan)

        html = """
        <html><body>
          <span id="cphMainContent_ctl00_lblDescription">Steel Hammer</span>
          <span id="cphMainContent_ctl00_lblVendorName">ACME</span>
          <span id="cphMainContent_ctl00_lblOrgillItemNumber">1234567</span>
          <span id="cphMainContent_ctl00_lblRetailUpc">037193347322</span>
        </body></html>
        """
        result = adapter.extract_from_html(html, "037193347322", "https://www.orgill.com/SearchResultN.aspx?ddlhQ=037193347322")
        assert result.success is True
        assert result.sku_match is True


class TestPhillipsAdapter:
    """Tests for Phillips adapter (login required)."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan(upc="072705115310")
        adapter = PhillipsAdapter(entry, plan)

        url = adapter.build_search_url("072705115310")
        assert "shop.phillipspet.com" in url
        assert "072705115310" in url

    def test_build_search_url_encodes_special_chars(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan(upc="A B/C#1")
        adapter = PhillipsAdapter(entry, plan)

        url = adapter.build_search_url("A B/C#1")
        assert "A%20B%2FC%231" in url

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

    def test_normalize_images_keeps_phillips_cloudfront_cdn(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan()
        adapter = PhillipsAdapter(entry, plan)

        normalized = adapter.normalize_images([
            "http://d56ygyjv466yj.cloudfront.net/thumb/727222_t.jpg",
        ])

        assert normalized == ["https://d56ygyjv466yj.cloudfront.net/727222.jpg"]

    def test_extract_ignores_hidden_scanner_template_identifiers(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan(upc="072705115310", name="Fromm Gold Large Breed Dog 30 lb", brand_name="FROMM FAMILY FOODS LLC")
        adapter = PhillipsAdapter(entry, plan)

        html = """
        <html><body>
          <div class="scanner-results-product-container scanner-results-product-container-desktop">
            <div class="product-item-number"><span class="cc_value">100122</span></div>
            <div class="product-upc"><span class="cc_value">128937128937</span></div>
            <img src="http://d56ygyjv466yj.cloudfront.net/thumb/100122_t.jpg" />
          </div>
          <div class="cc_row_product_info">
            <div class="cc_product_name"><a href="/ccrz__ProductDetails?sku=727222"><strong>Fromm Gold Large Breed Dog 30 lb</strong></a></div>
            <div class="product-brand"><span class="branded">FROMM FAMILY FOODS LLC</span></div>
            <div class="product-item-number"><span class="cc_value">727222</span></div>
            <div class="product-upc"><span class="cc_value">072705115310</span></div>
            <div class="cc_product_image"><img src="http://d56ygyjv466yj.cloudfront.net/thumb/727222_t.jpg" /></div>
          </div>
        </body></html>
        """

        result = adapter.extract_from_html(html, "072705115310", "https://shop.phillipspet.com/ccrz__ProductList?searchText=072705115310")

        assert result.success is True
        assert result.product["item_number"] == "727222"
        assert adapter._product_page_url and "sku=727222" in adapter._product_page_url
        assert "100122" not in adapter._product_page_url

    def test_pdp_enrichment_extracts_main_cloudfront_image(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter
        from scrapers.approved_sources.types import ApprovedSourceExtractionResult, ApprovedSourcePolicy

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan(upc="072705115310", name="Fromm Gold Large Breed Dog 30 lb", brand_name="FROMM FAMILY FOODS LLC")
        adapter = PhillipsAdapter(entry, plan)
        det_result = ApprovedSourceExtractionResult(
            success=True,
            source_slug="phillips",
            product={"name": "Fromm Gold Large Breed Dog 30 lb", "item_number": "727222", "upc": "072705115310"},
            matched_fields=["name", "item_number", "upc"],
        )
        html = """
        <html><body>
          <div class="scanner-results-product-container">
            <img src="http://d56ygyjv466yj.cloudfront.net/thumb/100122_t.jpg" />
          </div>
          <img class="mainProdImage prodDetail img-responsive" src="http://d56ygyjv466yj.cloudfront.net/727222.jpg" />
        </body></html>
        """
        policy = ApprovedSourcePolicy(
            allowedDomains=["shop.phillipspet.com"],
            allowedAssetDomains=["d56ygyjv466yj.cloudfront.net"],
            approvedSourcesOnly=True,
        )

        enriched = adapter._enrich_from_pdp_html(
            det_result,
            html,
            "https://shop.phillipspet.com/ccrz__ProductDetails?sku=727222",
            policy,
        )

        assert enriched.product["image_urls"] == ["https://d56ygyjv466yj.cloudfront.net/727222.jpg"]
        assert "image_urls" in enriched.matched_fields

    def test_extract_supports_legacy_plp_desktop_row(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan(upc="072705115310")
        adapter = PhillipsAdapter(entry, plan)

        html = """
        <html><body>
          <div id="plp-desktop-row">
            <div class="cc_product_name"><strong>Fromm Gold Large Breed Adult Dog Food 30lb</strong></div>
            <div class="product-brand"><span class="branded">FROMM PET FOOD</span></div>
            <div class="product-item-number"><span class="cc_value">FG123</span></div>
            <div class="product-upc"><span class="cc_value">072705115310</span></div>
            <div class="cc_product_image"><img src="https://shop.phillipspet.com/images/thumb/product.jpg" /></div>
          </div>
        </body></html>
        """

        result = adapter.extract_from_html(html, "072705115310", "https://shop.phillipspet.com/ccrz__ProductList?searchText=072705115310")
        assert result.success is True
        assert result.product["name"] == "Fromm Gold Large Breed Adult Dog Food 30lb"
        assert result.sku_match is True

    def test_extract_prefers_best_matching_result_card(self):
        from scrapers.approved_sources.adapters.phillips import PhillipsAdapter

        entry = _make_entry(slug="phillips", adapter="phillips_crawl4ai", domains=["shop.phillipspet.com"], auth=True)
        plan = _make_plan(
            upc="840243156412",
            name="BLUE TRUE CHEWS MEAT BALLS BEEF 12OZ",
            brand_name="Blue Buffalo",
            brand_slug="blue-buffalo",
        )
        adapter = PhillipsAdapter(entry, plan)

        html = """
        <html><body>
          <div class="scanner-results-product-container">
            <div class="cc_product_name"><strong>TEST PROD NAME TEST BRAND NAME</strong></div>
            <div class="product-brand"><span class="branded">TEST BRAND NAME</span></div>
            <div class="product-item-number"><span class="cc_value">100122</span></div>
            <div class="product-upc"><span class="cc_value">128937128937</span></div>
          </div>
          <div class="cc_row_product_info">
            <div class="cc_product_name"><strong>Blue Buffalo True Chews Meatball Dog Beef Treat 12 oz C=6</strong></div>
            <div class="product-brand"><span class="branded">BLUE BUFFALO</span></div>
            <div class="product-item-number"><span class="cc_value">113065</span></div>
            <div class="product-upc"><span class="cc_value">10840243156419</span></div>
          </div>
        </body></html>
        """

        result = adapter.extract_from_html(html, "840243156412", "https://shop.phillipspet.com/ccrz__ProductList?searchText=840243156412")
        assert result.success is True
        assert result.product["name"].startswith("Blue Buffalo True Chews")
        assert result.product["brand"] == "BLUE BUFFALO"
        assert result.sku_match is False
        assert any("brand/name heuristic" in warning for warning in result.warnings)


class TestPetFoodExpertsAdapter:
    """Tests for Pet Food Experts adapter (login required)."""

    def test_build_search_url(self):
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter

        entry = _make_entry(
            slug="pet_food_experts", adapter="pet_food_experts_crawl4ai",
            domains=["orders.petfoodexperts.com"], auth=True
        )
        plan = _make_plan(upc="33011808")
        adapter = PetFoodExpertsAdapter(entry, plan)

        url = adapter.build_search_url("33011808")
        assert "orders.petfoodexperts.com" in url
        assert "33011808" in url

    def test_build_search_url_encodes_special_chars(self):
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter

        entry = _make_entry(
            slug="pet_food_experts", adapter="pet_food_experts_crawl4ai",
            domains=["orders.petfoodexperts.com"], auth=True
        )
        plan = _make_plan(upc="A B/C#1")
        adapter = PetFoodExpertsAdapter(entry, plan)

        url = adapter.build_search_url("A B/C#1")
        assert "A%20B%2FC%231" in url

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
        plan = _make_plan(upc="33011808")
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

    def test_extract_brand_stops_at_next_attribute_label(self):
        from scrapers.approved_sources.adapters.pet_food_experts import PetFoodExpertsAdapter

        entry = _make_entry(
            slug="pet_food_experts", adapter="pet_food_experts_crawl4ai",
            domains=["orders.petfoodexperts.com"], auth=True
        )
        plan = _make_plan(upc="33011808")
        adapter = PetFoodExpertsAdapter(entry, plan)

        html = """
        <html><body>
          <h1>DAVE'S PET FOOD DOG RESTRICTED BLAND DIET CHICKEN &amp; RICE 13.2OZ - 12 PACK</h1>
          <div data-test-selector="productDetails_specifications">
            Attributes Brand: Daves Pet Food Flavor: Chicken Animal: Dog Diet: Sensitive
          </div>
          <div data-test-selector="productDetails_productId_1">
            Item #33011808 UPC#: CAS: 685038118097, EA: 685038118080
          </div>
        </body></html>
        """
        result = adapter.extract_from_html(html, "33011808", "https://orders.petfoodexperts.com/Search?query=33011808")
        assert result.success is True
        assert result.product["brand"] == "Daves Pet Food"


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
