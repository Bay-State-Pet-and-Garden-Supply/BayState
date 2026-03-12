"""Crawl4AI Engine - Main async crawler engine."""

from typing import Any, Optional, Union, Sequence
import logging
from urllib.parse import urlparse

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

logger = logging.getLogger(__name__)


class Crawl4AIEngine:
    """Async context manager for Crawl4AI web scraping.

    Matches existing executor interface patterns in the scraper framework.
    AI/Agentic features are deprecated for static scrapers.
    """

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialize the engine with configuration.

        Args:
            config: Configuration dictionary containing crawler settings.
        """
        self.config = config
        self._crawler: Optional[AsyncWebCrawler] = None
        self._browser_config = self._build_browser_config()
        self._run_config = self._build_run_config()

    @property
    def crawler(self) -> AsyncWebCrawler:
        """Get the crawler instance."""
        if self._crawler is None:
            raise RuntimeError("Crawler not initialized. Use async context manager.")
        return self._crawler

    def _build_browser_config(self) -> BrowserConfig:
        """Build browser configuration from config dict."""
        browser_settings = self.config.get("browser", {})
        return BrowserConfig(
            browser_type=browser_settings.get("browser_type", "chromium"),
            headless=browser_settings.get("headless", True),
            user_agent=browser_settings.get("user_agent", ""),
            viewport=browser_settings.get("viewport"),
            ignore_https_errors=browser_settings.get("ignore_https_errors", False),
            enable_stealth=browser_settings.get("enable_stealth", False),
            use_persistent_context=browser_settings.get("use_persistent_context", False),
        )

    def _build_run_config(self, session_id: Optional[str] = None) -> CrawlerRunConfig:
        """Build crawler run configuration from config dict.
        
        Args:
            session_id: Optional override for session ID.
        """
        run_settings = self.config.get("crawler", {})
        
        # Map string cache mode to Enum
        cache_mode_str = run_settings.get("cache_mode", "ENABLED").upper()
        try:
            cache_mode = CacheMode[cache_mode_str]
        except KeyError:
            logger.warning(f"Invalid cache mode '{cache_mode_str}', defaulting to ENABLED")
            cache_mode = CacheMode.ENABLED

        # Extraction strategy handling - exclusively static for the engine
        extraction_strategy = run_settings.get("extraction_strategy")

        return CrawlerRunConfig(
            # v0.4+ advanced features
            magic=run_settings.get("magic", True),
            simulate_user=run_settings.get("simulate_user", True),
            remove_overlay_elements=run_settings.get("remove_overlay_elements", True),
            session_id=session_id or run_settings.get("session_id"),
            cache_mode=cache_mode,
            
            # Content filtering
            css_selector=run_settings.get("css_selector"),
            excluded_tags=run_settings.get("excluded_tags", ["nav", "footer", "header", "aside"]),
            
            # Standard settings
            js_code=run_settings.get("js_code"),
            wait_for=run_settings.get("wait_for"),
            page_timeout=run_settings.get("timeout", 30000),
            extraction_strategy=extraction_strategy,
        )

    def _get_domain_session_id(self, url: str) -> str:
        """Extract domain from URL to use as session ID."""
        parsed = urlparse(url)
        domain = parsed.netloc or "default"
        return f"session_{domain.replace('.', '_')}"

    async def __aenter__(self) -> "Crawl4AIEngine":
        """Enter async context manager."""
        self._crawler = AsyncWebCrawler(config=self._browser_config)
        await self._crawler.__aenter__()
        return self

    async def __aexit__(self, exc_type: Optional[type], exc_val: Optional[BaseException], exc_tb: Any) -> None:
        """Exit async context manager."""
        if self._crawler:
            await self._crawler.__aexit__(exc_type, exc_val, exc_tb)
            self._crawler = None

    async def crawl(self, url: str) -> dict[str, Any]:
        """Crawl a single URL.

        Args:
            url: The URL to crawl.

        Returns:
            Dictionary containing crawl results.
        """
        if not self._crawler:
            raise RuntimeError("Crawler not initialized. Use async context manager.")

        # Use domain-persistent session ID if not explicitly provided
        session_id = self.config.get("crawler", {}).get("session_id")
        if not session_id:
            session_id = self._get_domain_session_id(url)
            
        run_config = self._build_run_config(session_id=session_id)

        result = await self._crawler.arun(url=url, config=run_config)
        return {
            "url": url,
            "success": result.success,
            "html": result.html if result.success else None,
            "markdown": result.markdown if result.success else None,
            "extracted_content": result.extracted_content if result.success else None,
            "error": result.error if not result.success else None,
            "metadata": result.metadata if hasattr(result, "metadata") else {},
        }

    async def crawl_many(self, urls: list[str]) -> list[dict[str, Any]]:
        """Crawl multiple URLs concurrently using arun_many.

        Args:
            urls: List of URLs to crawl.

        Returns:
            List of crawl results.
        """
        if not self._crawler:
            raise RuntimeError("Crawler not initialized. Use async context manager.")

        run_settings = self.config.get("crawler", {})
        concurrency_limit = run_settings.get("concurrency_limit", 3)
        global_session_id = run_settings.get("session_id")

        if global_session_id:
            results = await self._crawler.arun_many(
                urls=urls,
                config=self._run_config,
                concurrency_limit=concurrency_limit
            )
        else:
            configs = [
                self._build_run_config(session_id=self._get_domain_session_id(url))
                for url in urls
            ]
            results = await self._crawler.arun_many(
                urls=urls,
                configs=configs,
                concurrency_limit=concurrency_limit
            )
        
        return [
            {
                "url": r.url,
                "success": r.success,
                "html": r.html if r.success else None,
                "markdown": r.markdown if r.success else None,
                "extracted_content": r.extracted_content if r.success else None,
                "error": r.error if not r.success else None,
            }
            for r in results
        ]
