"""Data models for AI Search Scraper."""

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class AISearchResult:
    """Result from AI search scraping."""

    success: bool
    sku: str
    product_name: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    size_metrics: Optional[str] = None
    images: Optional[list[str]] = None
    categories: Optional[list[str]] = None
    url: Optional[str] = None
    source_website: Optional[str] = None
    confidence: float = 0.0
    cost_usd: float = 0.0
    selection_method: Optional[str] = None  # heuristic or llm
    error: Optional[str] = None

    def __post_init__(self):
        if self.images is None:
            self.images = []
        if self.categories is None:
            self.categories = []


@dataclass
class ResolvedCandidate:
    """Normalized extraction target with provenance and optional family-resolution metadata."""

    url: str
    canonical_url: str
    source_url: str
    source_domain: str
    source_type: str
    resolved_url: str
    resolved_canonical_url: str
    family_url: Optional[str] = None
    resolved_variant: Optional[dict[str, Any]] = None
