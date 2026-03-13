from __future__ import annotations
import asyncio

import logging
import time
from typing import Any

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry
from scrapers.exceptions import TimeoutError, WorkflowExecutionError
from scrapers.utils.locators import convert_to_playwright_locator

logger = logging.getLogger(__name__)


@ActionRegistry.register("wait_for")
class WaitForAction(BaseAction):
    """Action to wait for an element to be present."""

    async def execute(self, params: dict[str, Any]) -> None:
        selector_param = params.get("selector")
        timeout = params.get("timeout", self.ctx.timeout)

        if not selector_param:
            raise WorkflowExecutionError("Wait_for action requires 'selector' parameter")

        selectors = selector_param if isinstance(selector_param, list) else [selector_param]

        logger.debug(f"Waiting for any of elements: {selectors} (timeout: {timeout}s, CI: {self.ctx.is_ci})")

        start_time = time.time()

        try:
            page = self.ctx.browser.page
            
            # Initial quick check for visibility before starting concurrent wait
            found_selector = None
            for sel in selectors:
                try:
                    locator = convert_to_playwright_locator(page, sel)
                    if await locator.first.is_visible():
                        found_selector = sel
                        break
                except Exception:
                    continue
            
            if not found_selector:
                async def wait_for_selector(sel: str):
                    locator = convert_to_playwright_locator(page, sel)
                    await locator.wait_for(state="visible", timeout=timeout * 1000)
                    return sel

                # Use asyncio.wait to return as soon as ANY selector matches
                if len(selectors) > 1:
                    tasks = [asyncio.create_task(wait_for_selector(sel)) for sel in selectors]
                    done, pending = await asyncio.wait(
                        tasks, 
                        timeout=timeout, 
                        return_when=asyncio.FIRST_COMPLETED
                    )
                    
                    # Cancel remaining tasks
                    for task in pending:
                        task.cancel()
                    
                    if not done:
                        raise TimeoutError("Playwright wait timed out (concurrent)")
                    
                    # Await the completed task to get its result (the selector string)
                    found_selector = await list(done)[0]
                else:
                    # Single selector optimization
                    found_selector = await wait_for_selector(selectors[0])

            wait_duration = time.time() - start_time
            logger.info(f"Element found via '{found_selector}' after {wait_duration:.2f}s")

        except (TimeoutError, Exception) as e:
            wait_duration = time.time() - start_time
            logger.warning(f"TIMEOUT: Element not found within {timeout}s (waited {wait_duration:.2f}s): {selectors} - {e}")

            # Log debugging info
            try:
                current_url = self.ctx.browser.page.url
                logger.debug(f"Current page URL: {current_url}")
            except Exception:
                pass

            # Raise specific TimeoutError to ensure proper failure handling
            raise TimeoutError(
                f"Element wait timed out after {timeout}s: {selectors}",
                context=None,  # Context will be added by executor
            )
