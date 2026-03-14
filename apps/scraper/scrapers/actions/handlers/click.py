from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry
from scrapers.ai_search.matching import MatchingUtils
from scrapers.exceptions import WorkflowExecutionError

logger = logging.getLogger(__name__)


@ActionRegistry.register("click")
class ClickAction(BaseAction):
    """Action to click on an element with robust strategies and retry logic."""

    async def execute(self, params: dict[str, Any]) -> None:
        selector_identifier = params.get("selector")
        filter_text = params.get("filter_text")
        filter_text_exclude = params.get("filter_text_exclude")
        match_context_field = params.get("match_context_field")
        require_context_match = params.get("require_context_match", False)
        index = params.get("index", 0)
        wait_after = params.get("wait_after", 0)

        if not selector_identifier:
            raise WorkflowExecutionError("Click action requires 'selector' parameter")

        # Resolve selector config if possible
        selector_config = self.ctx.resolve_selector(selector_identifier)
        target_selector = selector_config if selector_config else selector_identifier

        # Define the click operation for the retry executor
        async def _perform_click():
            # 1. Find elements
            elements = await self.ctx.find_elements_safe(target_selector)
            if not elements:
                raise WorkflowExecutionError(f"No elements found for selector: {selector_identifier}")

            # 2. Filter elements
            filtered_elements = elements
            expected_match_value = None
            if match_context_field and hasattr(self.ctx, "context"):
                expected_match_value = self.ctx.context.get(match_context_field)

            if filter_text or filter_text_exclude or expected_match_value:
                new_filtered = []
                context_matched = []
                matcher = MatchingUtils() if isinstance(expected_match_value, str) and expected_match_value.strip() else None

                for el in elements:
                    txt = await self.ctx.extract_value_from_element(el, "text") or ""
                    
                    include_match = True
                    if filter_text and not re.search(filter_text, txt, re.IGNORECASE):
                        include_match = False
                    
                    exclude_match = False
                    if filter_text_exclude and re.search(filter_text_exclude, txt, re.IGNORECASE):
                        exclude_match = True
                        
                    if include_match and not exclude_match:
                        new_filtered.append(el)
                        if matcher and matcher.is_name_match(expected_match_value, txt):
                            context_matched.append(el)

                if context_matched:
                    filtered_elements = context_matched
                else:
                    filtered_elements = new_filtered
                    if matcher and require_context_match:
                        raise WorkflowExecutionError(
                            f"No elements matched context field '{match_context_field}' for selector: {selector_identifier}"
                        )

            if not filtered_elements:
                raise WorkflowExecutionError(f"No elements remaining after filtering for selector: {selector_identifier}")

            if index >= len(filtered_elements):
                raise WorkflowExecutionError(f"Index {index} out of bounds for filtered elements (count: {len(filtered_elements)})")

            element = filtered_elements[index]

            # 3. Robust click strategy
            try:
                # Ensure visibility and scroll into view
                await element.scroll_into_view_if_needed()
                
                # Strategy A: Standard click
                try:
                    await element.click(timeout=5000)
                    logger.debug(f"Standard click successful for {selector_identifier}")
                    return True
                except Exception as e:
                    logger.debug(f"Standard click failed: {e}. Trying force click.")
                
                # Strategy B: Force click (bypasses pointer-events check)
                try:
                    await element.click(force=True, timeout=2000)
                    logger.debug(f"Force click successful for {selector_identifier}")
                    return True
                except Exception as e:
                    logger.debug(f"Force click failed: {e}. Trying JS dispatch.")

                # Strategy C: JavaScript dispatch (last resort, bypasses all visibility/interception)
                await element.dispatch_event("click")
                logger.debug(f"JS dispatch click successful for {selector_identifier}")
                return True

            except Exception as e:
                logger.warning(f"All click strategies failed for {selector_identifier}: {e}")
                raise

        # Access the executor from the context
        if hasattr(self.ctx, "retry_executor") and self.ctx.retry_executor:
            retry_result = await self.ctx.retry_executor.execute_with_retry(
                operation=_perform_click,
                site_name=self.ctx.config_name,
                action_name="click",
                max_retries=params.get("max_retries", 2)
            )
            if not retry_result.success:
                if isinstance(retry_result.error, WorkflowExecutionError):
                    raise retry_result.error
                raise WorkflowExecutionError(f"Failed to click '{selector_identifier}' after retries", cause=retry_result.error)
        else:
            # Fallback for simple contexts without retry executor
            await _perform_click()

        # Optional wait after successful click
        if wait_after > 0:
            await asyncio.sleep(wait_after)
