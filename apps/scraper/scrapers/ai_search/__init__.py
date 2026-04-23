"""
Official Brand Scraper - Manufacturer domain discovery.

This module provides a standalone scraper that:
1. Searches for official manufacturer websites
2. Identifies the best candidate URL
3. Extracts product data from the official source
4. Returns structured results
"""

from scrapers.ai_search.models import AISearchResult

OfficialBrandScraper = None
try:
    from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper as _OfficialBrandScraper
except ModuleNotFoundError:
    pass
else:
    OfficialBrandScraper = _OfficialBrandScraper

__all__ = ["OfficialBrandScraper", "AISearchResult"]
