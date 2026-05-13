from __future__ import annotations

"""Deprecated compatibility alias.

OfficialBrandScraper is now an alias for ProductPageExtractor.
URL discovery is server-side in the web app.
"""

from scrapers.product_url_extraction.extractor import ProductPageExtractor

OfficialBrandScraper = ProductPageExtractor

__all__ = ["OfficialBrandScraper"]
