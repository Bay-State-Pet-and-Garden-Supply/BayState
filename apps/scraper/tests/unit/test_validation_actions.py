from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scrapers.actions.handlers.validation import CheckNoResultsAction
from scrapers.exceptions import AccessDeniedError, CaptchaError


def _make_context(*, body_text: str = "", title: str = "", html: str = "", status_code: int | None = None) -> MagicMock:
    page = MagicMock()
    page.url = "https://www.amazon.com/s?k=test"
    page.title = AsyncMock(return_value=title)
    page.inner_text = AsyncMock(return_value=body_text)
    page.content = AsyncMock(return_value=html)

    ctx = MagicMock()
    ctx.browser = SimpleNamespace(page=page, check_http_status=AsyncMock(return_value=status_code))
    ctx.config = SimpleNamespace(
        name="amazon",
        validation=SimpleNamespace(
            no_results_selectors=["#noResultsTitle"],
            no_results_text_patterns=["No results for your search query", "no results for"],
        ),
    )
    ctx.results = {}
    ctx.context = {"sku": "TEST-SKU"}
    ctx.worker_id = "worker-1"
    ctx.event_emitter = None
    return ctx


@pytest.mark.asyncio
async def test_check_no_results_detects_amazon_automated_access_block() -> None:
    ctx = _make_context(
        body_text="Please go back and try again or go to Amazon's home page.",
        title="Sorry! Something went wrong!",
        html="<!-- To discuss automated access to Amazon data please contact api-services-support@amazon.com. -->",
        status_code=503,
    )

    action = CheckNoResultsAction(ctx)

    with pytest.raises(AccessDeniedError, match="automated-access block"):
        await action.execute({})

    assert ctx.results["anti_bot_blocked"] is True
    assert ctx.results["validated_http_status"] == 503
    assert ctx.results["validated_http_url"] == ctx.browser.page.url


@pytest.mark.asyncio
async def test_check_no_results_detects_captcha_pages() -> None:
    ctx = _make_context(
        body_text="Enter the characters you see below before continuing.",
        title="Robot Check",
    )

    action = CheckNoResultsAction(ctx)

    with pytest.raises(CaptchaError, match="CAPTCHA page detected"):
        await action.execute({})

    assert ctx.results["captcha_detected"] is True


@pytest.mark.asyncio
async def test_check_no_results_preserves_no_results_detection() -> None:
    ctx = _make_context(
        body_text="No results for your search query",
        title="Search Results",
    )

    locator_first = MagicMock()
    locator_first.is_visible = AsyncMock(return_value=True)
    locator_first.inner_text = AsyncMock(return_value="No results for your search query")

    locator = MagicMock()
    locator.count = AsyncMock(return_value=1)
    locator.first = locator_first

    action = CheckNoResultsAction(ctx)
    action._has_visible_search_results = AsyncMock(return_value=False)

    with patch("scrapers.actions.handlers.validation.convert_to_playwright_locator", return_value=locator), patch(
        "scrapers.actions.handlers.validation.asyncio.sleep",
        new=AsyncMock(return_value=None),
    ):
        await action.execute({})

    assert ctx.results["no_results_found"] is True


@pytest.mark.asyncio
async def test_check_no_results_can_fallback_to_empty_search_pages() -> None:
    ctx = _make_context(
        body_text="Skip to Main content Delivering to Attleboro 02703",
        title="Amazon.com : B00ZZZZZZZ",
    )

    zero_locator = MagicMock()
    zero_locator.count = AsyncMock(return_value=0)
    zero_locator.first = MagicMock()

    action = CheckNoResultsAction(ctx)

    with patch("scrapers.actions.handlers.validation.convert_to_playwright_locator", return_value=zero_locator), patch(
        "scrapers.actions.handlers.validation.asyncio.sleep",
        new=AsyncMock(return_value=None),
    ):
        await action.execute(
            {
                "fallback_empty_search_selector": "div[data-component-type='s-search-result']:not(.AdHolder) a:has(h2)",
                "search_page_indicators": ["s?k=", "amazon.com :"],
                "pdp_selectors": ["#productTitle", "#title"],
            }
        )

    assert ctx.results["no_results_found"] is True
    assert ctx.results["no_results_reason"] == "empty_search_fallback"
