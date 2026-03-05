"""Data models for AI Discovery Scraper."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class DiscoveryResult:
    """Result from AI discovery scraping."""

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
    error: Optional[str] = None

    def __post_init__(self):
        if self.images is None:
            self.images = []
        if self.categories is None:
            self.categories = []
