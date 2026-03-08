"""
AI Search Scraper - Universal product extraction.

This module provides a standalone AI scraper that:
1. Searches for products using Brave Search API
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
from scrapers.ai_search.scraper import AISearchScraper

__all__ = ["AISearchScraper", "AISearchResult"]
