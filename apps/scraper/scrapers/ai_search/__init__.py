"""AI Search module.

URL discovery is server-side in the web app.
Product page extraction lives in `scrapers.product_url_extraction`.
"""

from scrapers.ai_search.models import AISearchResult


def __getattr__(name: str):
    """Lazy imports to avoid circular imports."""
    if name == "ProductPageExtractor":
        from scrapers.product_url_extraction.extractor import ProductPageExtractor
        return ProductPageExtractor

    if name == "ProductUrlExtractor":
        from scrapers.product_url_extraction.extractor import ProductUrlExtractor
        return ProductUrlExtractor

    if name == "OfficialBrandScraper":
        from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper
        return OfficialBrandScraper

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["OfficialBrandScraper", "ProductPageExtractor", "ProductUrlExtractor", "AISearchResult"]
