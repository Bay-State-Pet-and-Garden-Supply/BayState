from __future__ import annotations

import inspect
import logging
from typing import Any

from core.api_client import ScraperAPIClient

logger = logging.getLogger(__name__)


class ScraperTestingError(RuntimeError):
    """Raised when local scraper test setup or execution cannot proceed."""


class ScraperTestingClient:
    """Local scraper execution helper for integration tests."""

    def __init__(self, headless: bool = True, **kwargs: Any):
        _ = kwargs
        self.headless = headless
        self.context: dict[str, Any] = {}

    async def __aenter__(self) -> "ScraperTestingClient":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        _ = (exc_type, exc_val, exc_tb)

    async def run_scraper(self, scraper_name: str, skus: list[str], **kwargs: Any) -> dict[str, Any]:
        return await self._run_local_scraper(scraper_name, skus, **kwargs)

    async def _run_local_scraper(self, scraper_name: str, skus: list[str], **kwargs: Any) -> dict[str, Any]:
        import asyncio

        return await asyncio.to_thread(self._run_local_scraper_sync, scraper_name, skus, **kwargs)

    def _run_local_scraper_sync(self, scraper_name: str, skus: list[str], **kwargs: Any) -> dict[str, Any]:
        _ = kwargs

        import asyncio
        import time

        from scrapers.executor.workflow_executor import WorkflowExecutor
        from scrapers.parser.yaml_parser import ScraperConfigParser

        start_time = time.time()
        products: list[dict[str, Any]] = []
        errors: list[str] = []
        overall_success = True

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            parser = ScraperConfigParser()
            api_client = ScraperAPIClient()
            if not api_client.api_url:
                raise ScraperTestingError("SCRAPER_API_URL is required for API-only scraper config loading")
            if not api_client.api_key:
                raise ScraperTestingError("SCRAPER_API_KEY is required for API-only scraper config loading")

            slug = scraper_name.strip().lower().replace("_", "-").replace(" ", "-")
            response = api_client.get_published_config(slug)
            config_dict = response.get("config") if isinstance(response.get("config"), dict) else response
            if not isinstance(config_dict, dict):
                raise ScraperTestingError(f"Invalid published config payload for scraper '{scraper_name}'")

            config = parser.load_from_dict(config_dict)
            logger.info("Loaded config from API for test: %s", scraper_name)

            executor = WorkflowExecutor(config, headless=self.headless, api_client=api_client)

            try:
                loop.run_until_complete(executor.initialize())

                for sku in skus:
                    try:
                        result = loop.run_until_complete(executor.execute_workflow(context={"sku": sku}, quit_browser=False))

                        if result.get("success"):
                            extracted_data = result.get("results", {})
                            if extracted_data.get("no_results_found"):
                                products.append({"SKU": sku, "no_results_found": True})
                            elif extracted_data:
                                data = extracted_data.copy()
                                if "SKU" not in data:
                                    data["SKU"] = sku
                                products.append(data)
                        else:
                            overall_success = False
                            error_msg = result.get("error", "Unknown error")
                            errors.append(f"SKU {sku}: {error_msg}")

                    except Exception as exc:
                        overall_success = False
                        errors.append(f"SKU {sku}: {exc!s}")
            finally:
                if getattr(executor, "browser", None):
                    try:
                        quit_result = executor.browser.quit()
                        if inspect.isawaitable(quit_result):
                            loop.run_until_complete(quit_result)
                    except Exception:
                        pass

            execution_time = time.time() - start_time
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

        except Exception as exc:
            execution_time = time.time() - start_time
            logger.error("Local scraper test failed: %s", exc)
            results = {
                "scraper": scraper_name,
                "skus": skus,
                "mode": "local",
                "success": False,
                "products": [],
                "run_id": None,
                "dataset_id": None,
                "execution_time": execution_time,
                "errors": [str(exc)],
            }

        finally:
            loop.close()

        return results

    def is_local_mode(self) -> bool:
        return True
