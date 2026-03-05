"""Crawl4AI Engine - Main async crawler engine."""

from typing import Any

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig


class Crawl4AIEngine:
    """Async context manager for Crawl4AI web scraping.

    Matches existing executor interface patterns in the scraper framework.
    """

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialize the engine with configuration.

        Args:
            config: Configuration dictionary containing crawler settings.
        """
        self.config = config
        self._crawler: AsyncWebCrawler | None = None
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
            headless=browser_settings.get("headless", True),
            timeout=browser_settings.get("timeout", 30000),
            user_agent=browser_settings.get("user_agent"),
            viewport=browser_settings.get("viewport"),
            ignore_https_errors=browser_settings.get("ignore_https_errors", False),
        )

    def _build_run_config(self) -> CrawlerRunConfig:
        """Build crawler run configuration from config dict."""
        browser_settings = self.config.get("browser", {})
        run_settings = self.config.get("crawler", {})
        return CrawlerRunConfig(
            js=browser_settings.get("js", run_settings.get("js_enabled", True)),
            wait_for=run_settings.get("wait_for"),
            timeout=run_settings.get("timeout", 30000),
            scan_parallel_links=run_settings.get("scan_parallel_links", True),
            max_retries=run_settings.get("max_retries", 3),
            extraction_strategy=run_settings.get("extraction_strategy"),
            markdown=run_settings.get("markdown", True),
        )

    async def __aenter__(self) -> "Crawl4AIEngine":
        """Enter async context manager."""
        self._crawler = AsyncWebCrawler()
        await self._crawler.__aenter__()
        return self

    async def __aexit__(self, exc_type: type, exc_val: BaseException, exc_tb: Any) -> None:
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

        result = await self._crawler.arun(url=url, config=self._run_config)
        return {
            "url": url,
            "success": result.success,
            "html": result.html if result.success else None,
            "markdown": result.markdown if result.success else None,
            "error": result.error if not result.success else None,
        }

    async def crawl_many(self, urls: list[str]) -> list[dict[str, Any]]:
        """Crawl multiple URLs.

        Args:
            urls: List of URLs to crawl.

        Returns:
            List of crawl results.
        """
        if not self._crawler:
            raise RuntimeError("Crawler not initialized. Use async context manager.")

        results = []
        for url in urls:
            result = await self.crawl(url)
            results.append(result)
        return results
