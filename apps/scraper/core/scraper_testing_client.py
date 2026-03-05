"""
Scraper Testing Client
Provides interface for local scraper testing only.
"""

from __future__ import annotations


import logging
from enum import Enum
from typing import Any, Callable

from infra.api_client import $$$

logger = logging.getLogger(__name__)


class TestingMode(Enum):
    """Testing mode enumeration."""

    LOCAL = "local"


class ScraperTestingError(Exception):
    """Base exception for scraper testing errors."""

    pass


class ScraperTestingAuthError(ScraperTestingError):
    """Authentication error."""

    pass


class ScraperTestingTimeoutError(ScraperTestingError):
    """Timeout error."""

    pass


class ScraperTestingJobError(ScraperTestingError):
    """Job execution error."""

    pass


class ScraperTestingClient:
    """
    Local scraper testing client.
    Provides interface for local scraper testing only.
    """

    def __init__(self, mode: TestingMode = TestingMode.LOCAL, headless: bool = True, **kwargs):
        """
        Initialize the testing client.

        Args:
            mode: Testing mode (only LOCAL supported)
            headless: Whether to run browser in headless mode
            **kwargs: Additional arguments (ignored)
        """
        if mode != TestingMode.LOCAL:
            raise ValueError("Only LOCAL testing mode is supported")

        self.mode = mode
        self.headless = headless
        self.event_emitter: Callable[..., Any] | None = None
        self.context: dict[str, Any] = {}

    async def __aenter__(self):
        """Enter async context."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit async context."""
        pass

    async def run_scraper(self, scraper_name: str, skus: list[str], **kwargs) -> dict[str, Any]:
        """
        Run a scraper locally with the specified SKUs.

        Args:
            scraper_name: Name of the scraper to run
            skus: List of SKUs to scrape
            **kwargs: Additional arguments

        Returns:
            Dict with run results
        """
        return await self._run_local_scraper(scraper_name, skus, **kwargs)

    async def _run_local_scraper(self, scraper_name: str, skus: list[str], **kwargs) -> dict[str, Any]:
        """
        Run scraper locally.
        """
        import asyncio

        return await asyncio.to_thread(self._run_local_scraper_sync, scraper_name, skus, **kwargs)

    def _run_local_scraper_sync(self, scraper_name: str, skus: list[str], **kwargs) -> dict[str, Any]:
        """
        Synchronous implementation of local scraper run.
        """
        import asyncio
        import time

        from scrapers.executor.workflow_executor import WorkflowExecutor
        from scrapers.parser.yaml_parser import ScraperConfigParser

        start_time = time.time()
        products = []
        errors = []
        overall_success = True

        # Create a new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            # Load configuration
            parser = ScraperConfigParser()
            api_client = ScraperAPIClient()
            if not api_client.api_url:
                raise ScraperTestingError("SCRAPER_API_URL is required for API-only scraper config loading")
            if not api_client.api_key:
                raise ScraperTestingError("SCRAPER_API_KEY is required for API-only scraper config loading")

            slug = scraper_name.strip().lower().replace("_", "-").replace(" ", "-")
            response = api_client.get_published_config(slug)
            config_dict = response.get("config")
            if not isinstance(config_dict, dict):
                raise ScraperTestingError(f"Invalid published config payload for scraper '{scraper_name}'")

            config = parser.load_from_dict(config_dict)
            logger.info(f"Loaded config from API for test: {scraper_name}")

            # Initialize executor
            executor = WorkflowExecutor(config, headless=self.headless)

            try:
                # Initialize the executor (async initialization)
                loop.run_until_complete(executor.initialize())

                for sku in skus:
                    try:
                        # Use execute_workflow API (returns dict) - must await since it's async
                        result = loop.run_until_complete(executor.execute_workflow(context={"sku": sku}, quit_browser=False))

                        if result.get("success"):
                            if result.get("no_results_found"):
                                # Track no results as a valid outcome but no product data
                                # But we MUST include the no_results_found flag in the products list
                                # for tests to verify it.
                                products.append({"SKU": sku, "no_results_found": True})
                            else:
                                # Add product data
                                extracted_data = result.get("results", {})
                                if extracted_data:
                                    # Ensure SKU is in the data
                                    data = extracted_data.copy()
                                    if "SKU" not in data:
                                        data["SKU"] = sku
                                    products.append(data)
                        else:
                            overall_success = False
                            error_msg = result.get("error", "Unknown error")
                            errors.append(f"SKU {sku}: {error_msg}")

                    except Exception as e:
                        overall_success = False
                        errors.append(f"SKU {sku}: {e!s}")
            finally:
                if getattr(executor, "browser", None):
                    try:
                        executor.browser.quit()
                    except Exception:
                        pass

            execution_time = time.time() - start_time

            # Convert to unified format
            results = {
                "scraper": scraper_name,
                "skus": skus,
                "mode": "local",
                "success": overall_success,
                "products": products,
                "run_id": None,
                "dataset_id": None,
                "execution_time": execution_time,
                "errors": errors,
            }

        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"Local scraper test failed: {e}")

            results = {
                "scraper": scraper_name,
                "skus": skus,
                "mode": "local",
                "success": False,
                "products": [],
                "run_id": None,
                "dataset_id": None,
                "execution_time": execution_time,
                "errors": [str(e)],
            }

        finally:
            # Clean up the event loop
            loop.close()

        return results

    @property
    def testing_mode(self) -> TestingMode:
        """Get current testing mode."""
        return self.mode

    def is_local_mode(self) -> bool:
        """Check if running in local mode."""
        return True
