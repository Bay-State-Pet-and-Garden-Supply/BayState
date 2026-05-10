from __future__ import annotations

"""Deprecated compatibility wrapper for OfficialBrandScraper.

Official Brand URL discovery is now server-side in the web app.
Use `ProductUrlExtractor` from `scrapers.product_url_extraction.extractor` for
known-URL product extraction.

The `OfficialBrandScraper` name is kept only for backward compatibility with
existing import paths (runner, benchmarks, tests). It delegates entirely to
`ProductUrlExtractor`.

New imports should use::

    from scrapers.product_url_extraction import ProductUrlExtractor
"""

import warnings

from scrapers.product_url_extraction.extractor import ProductUrlExtractor


class OfficialBrandScraper(ProductUrlExtractor):
    """Deprecated compatibility wrapper.

    URL discovery is server-side.
    Use `ProductUrlExtractor` for known-URL extraction.

    This class exists only so that existing imports like::

        from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper

    continue to work without changes.  All behaviour is inherited from
    `ProductUrlExtractor`.
    """

    def __init__(
        self,
        headless: bool = True,
        llm_provider: str = "deepseek",
        llm_model: str = "deepseek-chat",
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
    ):
        warnings.warn(
            "OfficialBrandScraper is deprecated. Use ProductUrlExtractor instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        super().__init__(
            headless=headless,
            llm_provider=llm_provider,
            llm_model=llm_model,
            llm_api_key=llm_api_key,
            llm_base_url=llm_base_url,
        )


__all__ = ["OfficialBrandScraper"]
