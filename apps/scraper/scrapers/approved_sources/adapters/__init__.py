"""Approved source adapters for source-specific Crawl4AI extraction.

Adapters implement the ApprovedSourceAdapter interface for each source type:
- Bradley (bradley_crawl4ai)
- Central Pet (central_pet_crawl4ai)
- Orgill (orgill_crawl4ai)
- Phillips (phillips_crawl4ai)
- Pet Food Experts (pet_food_experts_crawl4ai)
- Official Brand (crawl4ai_direct)
"""

from scrapers.approved_sources.adapters.registry import (
    ADAPTER_ALIASES,
    normalize_adapter_slug,
    get_adapter_class,
    list_adapters,
    list_aliases,
)

__all__ = [
    "ADAPTER_ALIASES",
    "normalize_adapter_slug",
    "get_adapter_class",
    "list_adapters",
    "list_aliases",
]
