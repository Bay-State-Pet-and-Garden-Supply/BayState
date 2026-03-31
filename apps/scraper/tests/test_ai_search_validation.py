import pytest

from scrapers.ai_search import AISearchScraper


@pytest.fixture
def scraper():
    return AISearchScraper()


class TestSKUValidation:
    def test_accepts_when_sku_on_page(self, scraper):
        result = scraper._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Test Product",
                "brand": "TestBrand",
                "confidence": 0.9,
                "images": ["http://example.com/products/images/img.jpg"],
            },
            sku="12345",
            product_name=None,
            brand=None,
            source_url="https://example.com/product/12345",
        )
        assert result == (True, "ok")

    def test_accepts_without_sku_when_brand_matches_and_high_confidence(self, scraper):
        result = scraper._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Pro Plan Chicken",
                "brand": "Purina",
                "confidence": 0.9,
                "images": ["http://example.com/products/images/img.jpg"],
            },
            sku="12345",
            product_name="Pro Plan Chicken",
            brand="Purina",
            source_url="https://www.example.com/products/pro-plan-chicken",
        )
        assert result[0]  is True

    def test_rejects_without_sku_when_low_confidence(self, scraper):
        scraper_low = AISearchScraper(confidence_threshold=0.5)
        result = scraper_low._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Some Product",
                "brand": "SomeBrand",
                "confidence": 0.6,
                "images": ["http://example.com/products/images/img.jpg"],
            },
            sku="12345",
            product_name=None,
            brand="SomeBrand",
            source_url="https://example.com/product",
        )
        assert result[0]  is False
        assert "weak match signals" in result[1] or "confidence too low" in result[1].lower()

    def test_rejects_without_sku_brand_mismatch_high_confidence(self, scraper):
        result = scraper._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Premium Dog Food",
                "brand": "BrandA",
                "confidence": 0.85,
                "images": ["http://example.com/products/images/img.jpg"],
            },
            sku="12345",
            product_name=None,
            brand="BrandB",
            source_url="https://example.com/product",
        )
        assert result[0]  is False
        assert "Brand mismatch" in result[1]

    def test_rejects_untrusted_domain_below_elevated_confidence_threshold(self, scraper):
        result = scraper._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Pro Plan Chicken",
                "brand": "Purina",
                "confidence": 0.74,
                "images": ["http://example.com/products/images/img.jpg"],
            },
            sku="12345",
            product_name="Pro Plan Chicken",
            brand="Purina",
            source_url="https://independent.example.com/product/pro-plan",
        )
        assert result[0] is False
        assert "untrusted domain" in result[1].lower()

    def test_accepts_trusted_retailer_without_specific_variant_token_overlap(self, scraper):
        result = scraper._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Purina Pro Plan Adult Formula",
                "brand": "Purina",
                "confidence": 0.82,
                "description": "Chicken recipe dry dog food",
                "images": ["https://chewy.com/products/images/img.jpg"],
            },
            sku="12345",
            product_name="Purina Pro Plan Chicken",
            brand="Purina",
            source_url="https://www.chewy.com/purina-pro-plan-adult-formula/dp/12345",
        )
        assert result == (True, "ok")

    def test_resolves_bigcommerce_size_placeholder_in_images(self, scraper):
        extraction_result = {
            "success": True,
            "product_name": "WEE-WEE LITTER BOX SYSTEM CAT PADS",
            "brand": "FOUR PAWS",
            "confidence": 0.9,
            "images": [
                "https://cdn11.bigcommerce.com/s-rncilydun5/images/stencil/{:size}/products/16199/19476/436322__58796.jpg"
            ],
        }
        result = scraper._validator.validate_extraction_match(
            extraction_result=extraction_result,
            sku="436322",
            product_name="WEE-WEE LITTER BOX SYSTEM CAT PADS",
            brand="FOUR PAWS",
            source_url="https://www.bradleycaldwell.com/wee-wee-litter-box-system-cat-pads-10-pk-436322",
        )
        assert result == (True, "ok")
        assert extraction_result["images"] == [
            "https://cdn11.bigcommerce.com/s-rncilydun5/images/stencil/3840w/products/16199/19476/436322__58796.jpg"
        ]

    def test_rejects_images_with_unknown_template_placeholders(self, scraper):
        result = scraper._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Test Product",
                "brand": "TestBrand",
                "confidence": 0.9,
                "images": [
                    "https://cdn.example.com/images/{unknown_token}/product.jpg"
                ],
            },
            sku="12345",
            product_name="Test Product",
            brand="TestBrand",
            source_url="https://example.com/product/12345",
        )
        assert result[0] is False
        assert "logos or placeholders" in result[1].lower()


class TestQueryVariants:
    def test_sku_only_generates_no_extra_variant(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku="12345", product_name=None, brand=None, category=None)
        assert variants == []

    def test_sku_and_name_generates_name_sku_variant(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku="12345", product_name="PURINA CHKN", brand=None, category=None)
        assert variants == ["PURINA CHKN 12345"]

    def test_all_fields_generates_multiple_variants(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku="12345", product_name="Pro Plan Chicken", brand="Purina", category="Dog Food")
        assert len(variants) >= 2
        assert "Pro Plan Chicken 12345" in variants
        assert "Purina Pro Plan Chicken" in variants

    def test_empty_inputs_returns_empty_list(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku=None, product_name=None, brand=None, category=None)
        assert variants == []

    def test_duplicates_removed(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku="12345 product", product_name="12345", brand=None, category=None)
        assert len(variants) == len(set(variants))


class TestConfidenceThreshold:
    def test_default_threshold_is_070(self, scraper):
        assert scraper.confidence_threshold == 0.7

    def test_custom_threshold_respected(self):
        scraper = AISearchScraper(confidence_threshold=0.8)
        assert scraper.confidence_threshold == 0.8
