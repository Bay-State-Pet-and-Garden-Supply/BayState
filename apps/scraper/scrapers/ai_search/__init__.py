"""
AI Search Scraper - Universal product extraction.

This module provides a standalone AI scraper that:
1. Searches for products using SerpAPI/Google search with provider fallbacks
2. Identifies manufacturer websites intelligently
3. Navigates and extracts product data
4. Returns structured results

Usage:
    from scrapers.ai_search import AISearchScraper, AISearchResult

    scraper = AISearchScraper()
    result = await scraper.scrape_product(
        sku="12345",
        product_name="Purina Pro Plan",
        brand="Purina"
    )
"""

from scrapers.ai_search.models import AISearchResult

AISearchScraper = None
try:
    from scrapers.ai_search.scraper import AISearchScraper as _AISearchScraper
except ModuleNotFoundError:
    pass
else:
    AISearchScraper = _AISearchScraper

OfficialBrandScraper = None
try:
    from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper as _OfficialBrandScraper
except ModuleNotFoundError:
    pass
else:
    OfficialBrandScraper = _OfficialBrandScraper

__all__ = ["AISearchScraper", "OfficialBrandScraper", "AISearchResult"]
