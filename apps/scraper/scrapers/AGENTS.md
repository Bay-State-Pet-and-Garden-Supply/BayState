# Scrapers Module Agent Context (scrapers/)

## Overview
This module contains the domain-specific scraping logic, discovery pipelines, and cohort management. It has transitioned away from a purely selector-based engine to an AI-driven discovery and extraction system.

## Key Sub-modules
- `ai_search/`: Handles search-based discovery using providers like Serper. Includes logic for scoring and ranking search results.
- `cohort/`: Manages groups of products (cohorts) for batch processing and search frequency analysis.
- `product_url_extraction/`: Specialized logic for finding the correct manufacturer URL for a product before extraction.
- `config/`: Contains YAML templates and sample configurations for scrapers. Note: Production configs are fetched via API.
- `models/`: Pydantic schemas for scraper configurations and validation rules.

## Phase 10 Context
The legacy `actions/`, `executor/`, and `parser/` sub-directories have been removed or deactivated as part of Phase 10. The system now favors the **enrichment path** using `src/crawl4ai_engine/`.

## Where to look
| Task | Path |
| :--- | :--- |
| **Search Ranking** | `ai_search/scoring.py` |
| **Batch Search** | `ai_search/batch_search.py` |
| **Cohort Logic** | `cohort/` |
| **URL Extraction** | `product_url_extraction/` |

## Related AGENTS.md
- `../AGENTS.md`: Root scraper context.
- `../src/crawl4ai_engine/AGENTS.md`: Extraction engine details.
