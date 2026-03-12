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
                "images": ["http://example.com/img.jpg"],
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
                "images": ["http://example.com/img.jpg"],
            },
            sku="12345",
            product_name="Pro Plan Chicken",
            brand="Purina",
            source_url="https://www.example.com/products/pro-plan-chicken",
        )
        assert result[0] == True

    def test_rejects_without_sku_when_low_confidence(self, scraper):
        scraper_low = AISearchScraper(confidence_threshold=0.5)
        result = scraper_low._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Some Product",
                "brand": "SomeBrand",
                "confidence": 0.6,
                "images": ["http://example.com/img.jpg"],
            },
            sku="12345",
            product_name=None,
            brand="SomeBrand",
            source_url="https://example.com/product",
        )
        assert result[0] == False
        assert "weak match signals" in result[1] or "confidence too low" in result[1].lower()

    def test_rejects_without_sku_brand_mismatch_high_confidence(self, scraper):
        result = scraper._validator.validate_extraction_match(
            extraction_result={
                "success": True,
                "product_name": "Premium Dog Food",
                "brand": "BrandA",
                "confidence": 0.85,
                "images": ["http://example.com/img.jpg"],
            },
            sku="12345",
            product_name=None,
            brand="BrandB",
            source_url="https://example.com/product",
        )
        assert result[0] == False
        assert "Brand mismatch" in result[1]


class TestQueryVariants:
    def test_sku_only_generates_single_variant(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku="12345", product_name=None, brand=None, category=None)
        assert variants == ["12345 product"]

    def test_sku_and_name_generates_two_variants(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku="12345", product_name="PURINA CHKN", brand=None, category=None)
        assert len(variants) == 2
        assert "12345 product" in variants
        assert "PURINA CHKN 12345" in variants

    def test_all_fields_generates_multiple_variants(self, scraper):
        variants = scraper._query_builder.build_query_variants(sku="12345", product_name="Pro Plan Chicken", brand="Purina", category="Dog Food")
        assert len(variants) >= 2
        assert "12345 product" in variants

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
