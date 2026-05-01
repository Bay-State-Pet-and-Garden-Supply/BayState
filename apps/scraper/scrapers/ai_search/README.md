# Official Brand Scraper

This package contains the official manufacturer enrichment scraper used by BayState runner jobs.

## Runtime Flow

1. `OfficialBrandScraper` builds official-domain search queries from SKU, product name, brand, and cohort domain hints.
2. `SearchClient` fetches search results through the configured provider.
3. `BrandSourceSelector` and scoring helpers select an official manufacturer URL.
4. `Crawl4AIExtractor` extracts product data from the selected URL.
5. The runner returns results under the `official_brand` source key for pipeline persistence.

## Key Files

- `official_brand_scraper.py` - main scraper orchestration
- `query_builder.py` - official-domain query construction
- `search.py` - search provider client wrapper
- `scoring.py` - official-domain scoring and selection
- `crawl4ai_extractor.py` - extraction from selected source pages
- `models.py` - scraper result models

Generic AI Search, discovery, and cache-management experiments have been removed. New manufacturer enrichment work should extend `OfficialBrandScraper` rather than adding parallel AI scraper paths.
