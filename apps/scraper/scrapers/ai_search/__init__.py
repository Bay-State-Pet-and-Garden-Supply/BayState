"""
Official Brand Scraper — Manufacturer domain discovery and extraction.

**Discovery** (server-side): URL candidate search, LLM name consolidation,
candidate ranking, and persistence now live in the BayState web app at
``apps/web/lib/official-brand-discovery.ts``.

**Extraction** (runner-side): Known-URL product data extraction is handled by
`ProductUrlExtractor` in `scrapers.product_url_extraction.extractor`.

`OfficialBrandScraper` remains as a deprecated compatibility wrapper
inheriting from `ProductUrlExtractor`.
"""

from scrapers.ai_search.models import AISearchResult


def __getattr__(name: str):
    """Lazy imports to avoid circular import with scrapers.product_url_extraction.extractor."""
    if name == "ProductUrlExtractor":
        from scrapers.product_url_extraction.extractor import ProductUrlExtractor

        return ProductUrlExtractor

    if name == "OfficialBrandScraper":
        from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper

        return OfficialBrandScraper

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["OfficialBrandScraper", "ProductUrlExtractor", "AISearchResult"]
