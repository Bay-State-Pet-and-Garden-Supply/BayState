"""Crawl4AI Engine - Async web crawling engine using crawl4ai library."""

from __future__ import annotations

import logging
import time
from typing import Any

from crawl4ai_engine.config import ConfigLoader
from crawl4ai_engine.types import CrawlConfig, CrawlResult, EngineConfig

logger = logging.getLogger(__name__)


class Crawl4AIEngine:
    """Async web crawler engine using crawl4ai library.

    This engine provides a clean async context manager interface for crawling
    web pages, matching the pattern of the existing WorkflowExecutor while
    using crawl4ai's AsyncWebCrawler under the hood.

    Example:
        >>> from crawl4ai_engine import Crawl4AIEngine
        >>> config = EngineConfig(headless=True, timeout=30)
        >>> async with Crawl4AIEngine(config) as engine:
        ...     result = await engine.crawl("https://example.com")
        ...     print(result.content)
    """

    def __init__(
        self,
        config: EngineConfig | None = None,
        crawl_config: CrawlConfig | None = None,
    ) -> None:
        """Initialize the Crawl4AI Engine.

        Args:
            config: Engine configuration settings.
            crawl_config: Default crawl configuration for this engine.
        """
        self.config = config or EngineConfig()
        self.crawl_config = crawl_config
        self._crawler: Any = None
        self._initialized = False

    async def __aenter__(self) -> "Crawl4AIEngine":
        """Enter async context manager, initializing the crawler.

        Returns:
            Self for context chaining.
        """
        await self.initialize()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Exit async context manager, cleaning up resources."""
        await self.cleanup()

    async def initialize(self) -> None:
        """Initialize the crawl4ai crawler.

        This sets up the AsyncWebCrawler instance with the configured
        browser settings.
        """
        if self._initialized:
            logger.warning("Engine already initialized")
            return

        try:
            # Import here to allow optional dependency
            from crawl4ai import AsyncWebCrawler
            from crawl4ai.config import BrowserConfig, CrawlerRunConfig

            # Build browser config from engine settings
            browser_config = BrowserConfig(
                headless=self.config.headless,
                browser_type=self.config.browser_type,
                timeout=self.config.timeout * 1000,  # crawl4ai uses ms
                user_agent=self.config.user_agent,
                proxy=self.config.proxy,
                args=self.config.extra_browser_args,
                verbose=self.config.verbose,
            )

            # Create the crawler instance
            self._crawler = AsyncWebCrawler(config=browser_config)
            self._run_config = CrawlerRunConfig()

            await self._crawler.start()
            self._initialized = True
            logger.info(f"Crawl4AI Engine initialized (headless={self.config.headless}, browser={self.config.browser_type})")

        except ImportError as e:
            logger.error("crawl4ai not installed. Install with: pip install crawl4ai")
            raise RuntimeError("crawl4ai is required. Install with: pip install crawl4ai") from e
        except Exception as e:
            logger.error(f"Failed to initialize crawler: {e}")
            raise

    async def cleanup(self) -> None:
        """Clean up crawler resources."""
        if self._crawler is not None:
            try:
                await self._crawler.close()
                logger.info("Crawl4AI Engine cleaned up")
            except Exception as e:
                logger.warning(f"Error during cleanup: {e}")
            finally:
                self._crawler = None
                self._initialized = False

    async def crawl(
        self,
        url: str,
        config: CrawlConfig | None = None,
        wait_for: str | None = None,
        css_selector: str | None = None,
    ) -> CrawlResult:
        """Crawl a single URL and return the result.

        Args:
            url: URL to crawl.
            config: Optional crawl configuration (overrides default).
            wait_for: Optional CSS selector to wait for.
            css_selector: Optional CSS selector to extract.

        Returns:
            CrawlResult with extracted content and metadata.
        """
        if not self._initialized:
            await self.initialize()

        # Use provided config or fall back to default
        crawl_cfg = config or self.crawl_config or CrawlConfig(name="default", url=url)

        start_time = time.time()

        try:
            from crawl4ai import CrawlerRunConfig

            # Build run config
            run_config = CrawlerRunConfig(
                css_selector=css_selector or crawl_cfg.css_selector,
                wait_for=wait_for or crawl_cfg.wait_for,
                js_enabled=crawl_cfg.js_enabled,
                wait_until=crawl_cfg.wait_until,
            )

            # Execute crawl
            result = await self._crawler.arun(url=url, config=run_config)

            # Calculate response time
            response_time = time.time() - start_time

            # Extract content from result
            content = result.markdown if result else None
            html = result.html if result else None
            extracted_data = None

            # If schema was provided, try to extract structured data
            if crawl_cfg.schema and result:
                extracted_data = self._extract_with_schema(result, crawl_cfg.schema)

            return CrawlResult(
                url=url,
                success=result.success if result else False,
                content=content,
                html=html,
                extracted_data=extracted_data,
                error=result.error if result and result.error else None,
                status_code=getattr(result, "status_code", None),
                response_time=response_time,
                metadata={
                    "crawler": "crawl4ai",
                    "browser_type": self.config.browser_type,
                    "timeout": crawl_cfg.timeout,
                },
            )

        except Exception as e:
            logger.error(f"Crawl failed for {url}: {e}")
            return CrawlResult(
                url=url,
                success=False,
                error=str(e),
                response_time=time.time() - start_time,
            )

    async def crawl_multiple(
        self,
        urls: list[str],
        config: CrawlConfig | None = None,
    ) -> list[CrawlResult]:
        """Crawl multiple URLs concurrently.

        Args:
            urls: List of URLs to crawl.
            config: Optional crawl configuration.

        Returns:
            List of CrawlResult objects in the same order as URLs.
        """
        import asyncio

        crawl_cfg = config or self.crawl_config or CrawlConfig(name="default", url="")

        # Create tasks for concurrent crawling
        tasks = [self.crawl(url, crawl_cfg) for url in urls]

        # Execute concurrently with limit
        results: list[CrawlResult] = []
        for i in range(0, len(tasks), self.config.max_concurrent_crawls):
            batch = tasks[i : i + self.config.max_concurrent_crawls]
            batch_results = await asyncio.gather(*batch, return_exceptions=True)

            for result in batch_results:
                if isinstance(result, Exception):
                    # Handle exceptions as failed results
                    results.append(
                        CrawlResult(
                            url="",
                            success=False,
                            error=str(result),
                        )
                    )
                else:
                    results.append(result)

        return results

    def _extract_with_schema(self, result: Any, schema: dict[str, str]) -> dict[str, Any]:
        """Extract structured data using a schema.

        Args:
            result: Crawl result object.
            schema: Dictionary mapping field names to extraction paths.

        Returns:
            Dictionary of extracted data.
        """
        extracted: dict[str, Any] = {}

        if not result or not hasattr(result, "markdown"):
            return extracted

        # Simple extraction - in production this would use more sophisticated parsing
        content = result.markdown or ""

        for field, path in schema.items():
            # Simple CSS selector-like extraction
            # In a real implementation, this would parse the content
            extracted[field] = f"[{field} from {path}]"

        return extracted

    @property
    def is_initialized(self) -> bool:
        """Check if the engine is initialized.

        Returns:
            True if the crawler is initialized and ready.
        """
        return self._initialized


# Convenience function for simple one-off crawls
async def quick_crawl(
    url: str,
    timeout: int = 30,
    headless: bool = True,
) -> CrawlResult:
    """Quick crawl a URL without context manager.

    Args:
        url: URL to crawl.
        timeout: Request timeout in seconds.
        headless: Whether to run browser in headless mode.

    Returns:
        CrawlResult with extracted content.
    """
    config = EngineConfig(timeout=timeout, headless=headless)
    crawl_cfg = CrawlConfig(name="quick", url=url, timeout=timeout)

    async with Crawl4AIEngine(config, crawl_cfg) as engine:
        return await engine.crawl(url)


__all__ = ["Crawl4AIEngine", "quick_crawl", "CrawlConfig", "EngineConfig"]
