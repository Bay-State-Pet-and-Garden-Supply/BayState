from __future__ import annotations
import asyncio
import inspect

import logging
from typing import Any

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry
from scrapers.exceptions import AccessDeniedError, CaptchaError, RateLimitError, WorkflowExecutionError
from scrapers.utils.locators import convert_to_playwright_locator

logger = logging.getLogger(__name__)

CAPTCHA_TEXT_PATTERNS = (
    "captcha",
    "enter the characters you see below",
    "type the characters you see in this image",
    "verify you are a human",
    "not a robot",
)
RATE_LIMIT_TEXT_PATTERNS = (
    "too many requests",
    "rate limit",
    "temporarily blocked",
    "unusual traffic",
    "please wait before trying again",
)
ACCESS_DENIED_TEXT_PATTERNS = (
    "access denied",
    "blocked",
    "forbidden",
    "automated access",
    "robot check",
    "request could not be satisfied",
)


@ActionRegistry.register("validate_http_status")
class ValidateHttpStatusAction(BaseAction):
    """Action to validate HTTP status of current page."""

    async def execute(self, params: dict[str, Any]) -> None:
        expected_status = params.get("expected_status")
        fail_on_error = params.get("fail_on_error", True)
        error_codes = params.get("error_codes", [400, 401, 403, 404, 500, 502, 503, 504])

        status_code = self.ctx.browser.check_http_status()
        current_url = self.ctx.browser.page.url

        if status_code is None:
            if fail_on_error:
                logger.error(f"Could not determine HTTP status for {current_url}")
                raise WorkflowExecutionError(f"Failed to determine HTTP status for {current_url}")
            else:
                logger.warning(f"Could not determine HTTP status for {current_url}")
                return

        logger.debug(f"Validated HTTP status for {current_url}: {status_code}")

        # Store status in results
        self.ctx.results["validated_http_status"] = status_code
        self.ctx.results["validated_http_url"] = current_url

        # Check expected status if specified
        if expected_status is not None:
            if status_code != expected_status:
                error_msg = f"HTTP status mismatch: expected {expected_status}, got {status_code} for {current_url}"
                if fail_on_error:
                    logger.error(error_msg)
                    raise WorkflowExecutionError(error_msg)
                else:
                    logger.warning(error_msg)

        # Check for error status codes
        if status_code in error_codes:
            error_msg = f"HTTP error status {status_code} detected for {current_url}"
            if fail_on_error:
                logger.error(error_msg)
                raise WorkflowExecutionError(error_msg)
            else:
                logger.warning(error_msg)


@ActionRegistry.register("check_no_results")
class CheckNoResultsAction(BaseAction):
    """
    Action to explicitly check if the current page indicates a 'no results' scenario.
    Sets 'no_results_found' in results to True if detected.
    Uses fast selector and text pattern matching only (no slow classifier).
    """

    async def execute(self, params: dict[str, Any]) -> None:
        # Get config validation patterns if available
        if self.ctx.config.validation:
            config_no_results = self.ctx.config.validation.no_results_selectors or []
            config_text_patterns = self.ctx.config.validation.no_results_text_patterns or []
            logger.info(f"DEBUG: check_no_results using selectors: {config_no_results}")
        else:
            logger.warning("DEBUG: check_no_results - No validation config found!")
            config_no_results = []
            config_text_patterns = []

        await self._detect_blocking_or_captcha()
        await self._execute_playwright(config_no_results, config_text_patterns, params)

    def _emit_no_results_event(self) -> None:
        """Helper to emit sku.no_results event if possible."""
        if hasattr(self.ctx, "event_emitter") and self.ctx.event_emitter:
            sku = self.ctx.context.get("sku") if hasattr(self.ctx, "context") else None
            # If SKU not in context, try results
            if not sku:
                sku = self.ctx.results.get("sku")

            if sku:
                self.ctx.event_emitter.sku_no_results(scraper=self.ctx.config.name, worker_id=self.ctx.worker_id or "unknown", sku=sku)

    async def _has_visible_search_results(self, page: Any) -> bool:
        """Return True when a visible product card exists on search results pages."""
        try:
            results = page.locator("main article")
            count = await results.count()
            if count <= 0:
                return False

            check_limit = min(count, 3)
            for idx in range(check_limit):
                try:
                    if await results.nth(idx).is_visible():
                        return True
                except Exception:
                    continue
        except Exception:
            return False

        return False

    async def _get_http_status(self) -> int | None:
        """Read the current HTTP status when the browser exposes it."""
        check_http_status = getattr(self.ctx.browser, "check_http_status", None)
        if not callable(check_http_status):
            return None

        try:
            status = check_http_status()
            if inspect.isawaitable(status):
                status = await status
        except Exception as exc:
            logger.debug(f"Unable to read HTTP status during validation: {exc}")
            return None

        if isinstance(status, dict):
            status = status.get("status")

        return status if isinstance(status, int) else None

    async def _detect_blocking_or_captcha(self) -> None:
        """Fail fast on anti-bot, CAPTCHA, and rate-limit pages before no-results checks."""
        page = self.ctx.browser.page
        status_code = await self._get_http_status()
        if status_code is not None:
            self.ctx.results["validated_http_status"] = status_code
            self.ctx.results["validated_http_url"] = page.url

        title = ""
        visible_text = ""
        try:
            title = (await page.title()).lower()
        except Exception as exc:
            logger.debug(f"Unable to read page title during validation: {exc}")

        try:
            visible_text = (await page.inner_text("body")).lower()
        except Exception as exc:
            logger.debug(f"Unable to read page body during validation: {exc}")

        combined_text = f"{title}\n{visible_text}"

        if any(pattern in combined_text for pattern in CAPTCHA_TEXT_PATTERNS):
            self.ctx.results["captcha_detected"] = True
            raise CaptchaError("CAPTCHA page detected during validation")

        if status_code == 429 or any(pattern in combined_text for pattern in RATE_LIMIT_TEXT_PATTERNS):
            self.ctx.results["rate_limited"] = True
            raise RateLimitError("Rate limiting detected during validation")

        if status_code in {401, 403} or any(pattern in combined_text for pattern in ACCESS_DENIED_TEXT_PATTERNS):
            self.ctx.results["anti_bot_blocked"] = True
            raise AccessDeniedError("Blocking page detected during validation")

        if status_code == 503 and "something went wrong" in combined_text:
            try:
                page_html = (await page.content()).lower()
            except Exception as exc:
                logger.debug(f"Unable to read page HTML during validation: {exc}")
                page_html = ""

            if "automated access to amazon data" in page_html:
                self.ctx.results["anti_bot_blocked"] = True
                raise AccessDeniedError("Amazon automated-access block detected during validation")

    async def _count_selector_matches(self, page: Any, selector: str) -> int:
        """Return the number of nodes matched by a selector, defaulting to zero on lookup errors."""
        try:
            locator = convert_to_playwright_locator(page, selector)
            return await locator.count()
        except Exception as exc:
            logger.debug(f"Error counting selector {selector}: {exc}")
            return 0

    async def _apply_empty_search_fallback(self, params: dict[str, Any]) -> bool:
        """
        Mark no-results when a known search page contains zero valid product cards.

        Some vendors now render empty search shells without a dedicated no-results banner.
        This fallback is opt-in per workflow so we only use it on sites where zero valid
        search cards is a reliable signal.
        """
        fallback_selector = params.get("fallback_empty_search_selector")
        if not fallback_selector:
            return False

        page = self.ctx.browser.page
        current_url = page.url.lower()

        try:
            page_title = (await page.title()).lower()
        except Exception as exc:
            logger.debug(f"Unable to read page title for empty-search fallback: {exc}")
            page_title = ""

        search_page_indicators = [indicator.lower() for indicator in params.get("search_page_indicators", [])]
        if search_page_indicators and not any(indicator in current_url or indicator in page_title for indicator in search_page_indicators):
            return False

        for pdp_selector in params.get("pdp_selectors", []):
            if await self._count_selector_matches(page, pdp_selector) > 0:
                return False

        result_count = await self._count_selector_matches(page, fallback_selector)
        if result_count > 0:
            return False

        logger.info(f"Empty-search fallback candidate detected for {fallback_selector}, verifying persistence...")
        await asyncio.sleep(2)

        if await self._count_selector_matches(page, fallback_selector) == 0:
            logger.info(f"No results confirmed via empty-search fallback: {fallback_selector}")
            self.ctx.results["no_results_found"] = True
            self.ctx.results["no_results_reason"] = "empty_search_fallback"
            self._emit_no_results_event()
            return True

        return False

    async def _execute_playwright(self, config_no_results: list[str], config_text_patterns: list[str], params: dict[str, Any]) -> None:
        """Execute no-results check using Playwright."""
        import time

        page = self.ctx.browser.page

        try:
            # Fast selector check - only use config selectors (limit to first 5 for speed)
            for selector in config_no_results[:5]:
                try:
                    # Convert selector to proper Playwright locator using best practices
                    locator = convert_to_playwright_locator(page, selector)

                    # Quick check with short timeout
                    count = await locator.count()
                    logger.info(f"DEBUG: Checking selector '{selector}' - found {count} elements")

                    if count > 0:
                        # Check if visible
                        try:
                            # Use is_visible() which is non-blocking status check
                            is_vis = await locator.first.is_visible()
                            logger.info(f"DEBUG: Selector '{selector}' visibility: {is_vis}")

                            if is_vis:
                                # Potential match found - check if it contains no-results text patterns
                                if config_text_patterns:
                                    try:
                                        # Extract text from this specific element to see if it's the no-results message
                                        element_text = await locator.first.inner_text()
                                        element_text = element_text.lower()
                                        if any(p.lower() in element_text for p in config_text_patterns):
                                            logger.info(f"No results detected via selector '{selector}' and text pattern match within element")
                                            self.ctx.results["no_results_found"] = True
                                            self._emit_no_results_event()
                                            return
                                        else:
                                            logger.info(f"Selector '{selector}' found but its text does not match no-results patterns. Continuing.")
                                            continue
                                    except Exception as e:
                                        logger.debug(f"Error checking text pattern in element {selector}: {e}")
                                        # Fallback to persistence check if text check fails
                                        pass

                                # If no patterns defined or text check failed, fallback to persistence check
                                logger.info(f"Potential no-results detected via {selector}, verifying persistence...")

                                await asyncio.sleep(2)

                                # Re-check
                                if await locator.count() > 0 and await locator.first.is_visible():
                                    if await self._has_visible_search_results(page):
                                        logger.info(f"Ignoring no-results indicator {selector} because visible search results exist.")
                                        continue

                                    logger.info(f"No results CONFIRMED via selector: {selector}")
                                    self.ctx.results["no_results_found"] = True
                                    self._emit_no_results_event()
                                    return
                                else:
                                    logger.info(f"No results indicator {selector} disappeared - likely false positive.")
                                    continue

                        except Exception:
                            continue
                except Exception as e:
                    logger.debug(f"Error checking selector {selector}: {e}")
                    continue

            # Fast text pattern check in page content (visible text only)
            if config_text_patterns:
                try:
                    # Use inner_text('body') to get only visible text, not hidden templates
                    page_content = await page.inner_text("body")
                    page_content = page_content.lower()
                    logger.info(f"DEBUG: Checking text patterns in visible page text (length: {len(page_content)})")

                    for pattern in config_text_patterns:
                        if pattern.lower() in page_content:
                            if await self._has_visible_search_results(page):
                                logger.info(f"Ignoring no-results text pattern '{pattern}' because visible search results exist.")
                                continue

                            logger.info(f"No results detected via text pattern: {pattern}")
                            self.ctx.results["no_results_found"] = True
                            self._emit_no_results_event()
                            return
                        else:
                            logger.info(f"DEBUG: Pattern '{pattern}' NOT found in page content")
                except Exception as e:
                    logger.debug(f"Error checking text patterns: {e}")

            if await self._apply_empty_search_fallback(params):
                return

            self.ctx.results["no_results_found"] = False

        except Exception as e:
            logger.debug(f"Error during Playwright no-results check: {e}")
            self.ctx.results["no_results_found"] = False


@ActionRegistry.register("conditional_skip")
class ConditionalSkipAction(BaseAction):
    """
    Action to conditionally skip the rest of the workflow based on a flag in results.
    """

    async def execute(self, params: dict[str, Any]) -> None:
        if_flag = params.get("if_flag")
        if not if_flag:
            raise WorkflowExecutionError("conditional_skip action requires 'if_flag' parameter")

        if self.ctx.results.get(if_flag):
            logger.info(f"Condition '{if_flag}' is true, stopping workflow execution.")
            self.ctx.workflow_stopped = True


@ActionRegistry.register("scroll")
class ScrollAction(BaseAction):
    """Action to scroll the page."""

    async def execute(self, params: dict[str, Any]) -> None:
        direction = params.get("direction", "down")
        amount = params.get("amount")
        selector = params.get("selector")

        page = self.ctx.browser.page
        if selector:
            try:
                if selector.startswith("//") or selector.startswith("(//"):
                    locator = page.locator(f"xpath={selector}")
                else:
                    locator = page.locator(selector)
                locator.first.scroll_into_view_if_needed()
                logger.debug(f"Scrolled to element: {selector}")
            except Exception:
                raise WorkflowExecutionError(f"Scroll target element not found: {selector}")
        elif direction == "to_bottom":
            page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
            logger.debug("Scrolled to bottom of page")
        elif direction == "to_top":
            page.evaluate("window.scrollTo(0, 0);")
            logger.debug("Scrolled to top of page")
        else:
            scroll_amount = amount if amount is not None else "window.innerHeight"
            if direction == "down":
                page.evaluate(f"window.scrollBy(0, {scroll_amount});")
                logger.debug(f"Scrolled down by {scroll_amount} pixels")
            elif direction == "up":
                page.evaluate(f"window.scrollBy(0, -{scroll_amount});")
                logger.debug(f"Scrolled up by {scroll_amount} pixels")


@ActionRegistry.register("conditional_click")
class ConditionalClickAction(BaseAction):
    """Action to click on an element only if it exists, without failing the workflow."""

    async def execute(self, params: dict[str, Any]) -> None:
        selector = params.get("selector")
        if not selector:
            raise WorkflowExecutionError("conditional_click requires 'selector' parameter")

        timeout = params.get("timeout", 2)

        try:
            from playwright.async_api import TimeoutError as PlaywrightTimeoutError

            page = self.ctx.browser.page
            
            # Smart splitting: don't split if it looks like an XPath or complex selector with commas inside parentheses
            if isinstance(selector, str):
                if selector.startswith("//") or selector.startswith(".//") or "(" in selector:
                    selectors_to_try = [selector]
                else:
                    selectors_to_try = [s.strip() for s in selector.split(",")]
            else:
                selectors_to_try = selector if isinstance(selector, list) else [selector]
                
            element_found = False

            for sel in selectors_to_try:
                try:
                    if sel.startswith("//") or sel.startswith("(//"):
                        locator = page.locator(f"xpath={sel}")
                    else:
                        locator = page.locator(sel)

                    await locator.first.wait_for(state="attached", timeout=timeout * 1000)
                    element_found = True
                    logger.info(f"Conditional element '{sel}' found. Attempting to click.")
                    await locator.first.click(timeout=5000)
                    logger.info(f"Conditional click succeeded on '{sel}'")
                    break
                except PlaywrightTimeoutError:
                    continue
                except Exception as click_err:
                    logger.debug(f"Conditional click on '{sel}' failed: {click_err}")
                    continue

            if not element_found:
                logger.info(f"Conditional element '{selector}' not found. Skipping click.")

        except Exception as e:
            logger.warning(f"Conditional click on '{selector}' failed with an unexpected error: {e}")


@ActionRegistry.register("verify")
class VerifyAction(BaseAction):
    """Action to verify a value on the page against an expected value."""

    async def execute(self, params: dict[str, Any]) -> None:
        selector = params.get("selector")
        attribute = params.get("attribute", "text")
        expected_value = params.get("expected_value")
        match_mode = params.get("match_mode", "exact")
        on_failure = params.get("on_failure", "fail_workflow")

        if not all([selector, expected_value]):
            raise WorkflowExecutionError("Verify action requires 'selector' and 'expected_value' parameters")

        # Type narrowing after validation
        assert selector is not None

        try:
            elements = await self.ctx.find_elements_safe(selector)
            if not elements:
                raise ValueError(f"No element found for selector: {selector}")
            element = elements[0]
            actual_value = await self.ctx.extract_value_from_element(element, attribute)

            if actual_value is None:
                raise ValueError("Could not extract actual value from element")

            match = False
            if match_mode == "exact":
                match = str(actual_value) == str(expected_value)
            elif match_mode == "contains":
                match = str(expected_value) in str(actual_value)
            elif match_mode == "fuzzy_number":
                import re

                expected_digits = re.sub(r"\D", "", str(expected_value))
                actual_digits = re.sub(r"\D", "", str(actual_value))
                if expected_digits and actual_digits:
                    match = int(expected_digits) == int(actual_digits)
            else:
                raise WorkflowExecutionError(f"Unknown match_mode: {match_mode}")

            if match:
                logger.info(f"Verification successful for selector '{selector}'. Found '{actual_value}', expected '{expected_value}' (mode: {match_mode}).")
            else:
                error_msg = f"Verification failed for selector '{selector}'. Found '{actual_value}', expected '{expected_value}' (mode: {match_mode})."
                if on_failure == "fail_workflow":
                    raise WorkflowExecutionError(error_msg)
                else:
                    logger.warning(error_msg)

        except Exception as e:
            # Handle both Selenium NoSuchElementException and other errors
            error_msg = f"Verification failed: could not find or extract value from selector '{selector}'. Reason: {e}"
            if on_failure == "fail_workflow":
                raise WorkflowExecutionError(error_msg)
            else:
                logger.warning(error_msg)


@ActionRegistry.register("validate_search_result")
class ValidateSearchResultAction(BaseAction):
    """
    Action to validate that the first search result matches the searched SKU.

    Compares the BCI# and UPC Code from the first article in search results
    against the searched SKU. This prevents false positives where the search
    returns a product because its title or manufacturer part number contains
    the search term (not an exact identifier match).

    Sets 'no_results_found' to True if neither BCI# nor UPC matches the searched SKU.
    """

    async def execute(self, params: dict[str, Any]) -> None:
        # Get the searched SKU from context
        searched_sku = None
        if hasattr(self.ctx, "context") and self.ctx.context:
            searched_sku = self.ctx.context.get("sku")
        if not searched_sku:
            searched_sku = self.ctx.results.get("sku")

        if not searched_sku:
            logger.warning("validate_search_result: No SKU found in context/results. Skipping.")
            return

        target_sku = str(searched_sku).strip()
        logger.info(f"validate_search_result: Validating match for SKU: {target_sku}")

        page = self.ctx.browser.page

        try:
            # Check for direct product page landing if required_selectors are provided
            required_selectors = params.get("required_selectors", [])
            if isinstance(required_selectors, str):
                required_selectors = [required_selectors]
            
            for sel in required_selectors:
                try:
                    locator = convert_to_playwright_locator(page, sel)
                    if await locator.first.is_visible():
                        logger.info(f"validate_search_result: Direct product page detected via required_selector '{sel}'")
                        self.ctx.results["no_results_found"] = False
                        self.ctx.results["search_result_validated"] = True
                        return
                except Exception:
                    continue

            # 1. Get first article
            articles = page.locator("main article")
            # Use a short timeout for the initial count to avoid hanging on rate-limited pages
            articles_count = await articles.count()

            if articles_count == 0:
                logger.info("validate_search_result: No articles found in search results.")
                self.ctx.results["no_results_found"] = True
                return

            first_article = articles.first
            found_match = False
            match_details = []

            # 2. Check BCI#
            # We use a short timeout for text_content to prevent hanging
            bci_locator = first_article.locator("span:has-text('BCI#:')")
            if await bci_locator.count() > 0:
                try:
                    text = await bci_locator.first.text_content(timeout=2000)
                    if text:
                        # Parse "BCI#: 010199"
                        val = text.split(":")[-1].strip()
                        match_details.append(f"BCI:{val}")
                        if val == target_sku or val.lstrip("0") == target_sku.lstrip("0"):
                            found_match = True
                except Exception:
                    pass

            # 3. Check UPC Code (If BCI didn't match)
            if not found_match:
                upc_locator = first_article.locator("span:has-text('UPC Code:')")
                if await upc_locator.count() > 0:
                    try:
                        text = await upc_locator.first.text_content(timeout=2000)
                        if text:
                            # Parse "UPC Code: 015905003391"
                            val = text.split(":")[-1].strip()
                            match_details.append(f"UPC:{val}")
                            if val == target_sku or val.lstrip("0") == target_sku.lstrip("0"):
                                found_match = True
                    except Exception:
                        pass

            # 4. Result Handling
            if found_match:
                logger.info(f"validate_search_result: Verified match ({', '.join(match_details)})")
                self.ctx.results["no_results_found"] = False
                self.ctx.results["search_result_validated"] = True
            else:
                logger.warning(f"validate_search_result: MISMATCH! Searched '{target_sku}', found {match_details}. Failing fast.")
                self.ctx.results["no_results_found"] = True
                self.ctx.results["search_result_validated"] = False

        except Exception as e:
            logger.error(f"validate_search_result: Error: {e}")
            # Fail safe: if validation crashes, assume no results
            self.ctx.results["no_results_found"] = True
