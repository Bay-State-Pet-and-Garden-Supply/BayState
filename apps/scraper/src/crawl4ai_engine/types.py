"""Type definitions for Crawl4AI Engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CrawlConfig:
    """Configuration for a crawl job."""

    name: str
    url: str
    timeout: int = 30
    wait_for: str | None = None
    css_selector: str | None = None
    js_enabled: bool = True
    headless: bool = True
    user_agent: str | None = None
    proxy: str | None = None
    wait_until: str = "networkidle"  # Options: load, domcontentloaded, networkidle, commit

    # Extraction settings
    extract_text: bool = True
    extract_html: bool = False
    extract_links: bool = False

    # Extraction schema for structured data
    schema: dict[str, str] | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for crawl4ai config."""
        return {
            "urls": [self.url],
            "timeout": self.timeout,
            "wait_for": self.wait_for,
            "css_selector": self.css_selector,
            "js_enabled": self.js_enabled,
            "headless": self.headless,
            "user_agent": self.user_agent,
            "proxy": self.proxy,
            "wait_until": self.wait_until,
            "extraction_config": {
                "extract_text": self.extract_text,
                "extract_html": self.extract_html,
                "extract_links": self.extract_links,
                "schema": self.schema,
            }
            if self.schema
            else None,
        }


@dataclass
class CrawlResult:
    """Result of a crawl operation."""

    url: str
    success: bool
    content: str | None = None
    html: str | None = None
    extracted_data: dict[str, Any] | None = None
    error: str | None = None
    status_code: int | None = None
    response_time: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "url": self.url,
            "success": self.success,
            "content": self.content,
            "html": self.html,
            "extracted_data": self.extracted_data,
            "error": self.error,
            "status_code": self.status_code,
            "response_time": self.response_time,
            "metadata": self.metadata,
        }


@dataclass
class EngineConfig:
    """Configuration for the Crawl4AI Engine."""

    # Browser settings
    headless: bool = True
    browser_type: str = "chromium"  # chromium, firefox, webkit
    timeout: int = 30
    max_concurrent_crawls: int = 5

    # Retry settings
    enable_retry: bool = False
    max_retries: int = 3
    retry_delay: float = 1.0

    # Performance settings
    memory_limit_mb: int | None = None
    cpu_limit_percent: int | None = None

    # Logging
    verbose: bool = False
    log_requests: bool = False

    # Advanced
    user_agent: str | None = None
    proxy: str | None = None
    extra_browser_args: list[str] = field(default_factory=list)


# Re-export commonly used types
__all__ = [
    "CrawlConfig",
    "CrawlResult",
    "EngineConfig",
]
