import asyncio
from types import SimpleNamespace

import pytest

from apps.scraper.utils.scraping.playwright_browser import PlaywrightScraperBrowser


class MockRoute:
    def __init__(self, url):
        self.request = SimpleNamespace(url=url)
        self.aborted = False
        self.continued = False

    async def abort(self):
        self.aborted = True

    async def continue_(self):
        self.continued = True


class MockPage:
    def __init__(self):
        self.routes = []
        self.events = {}

    async def route(self, pattern, handler):
        # store pattern and handler for inspection
        self.routes.append((pattern, handler))

    def on(self, event, handler):
        self.events[event] = handler


@pytest.mark.asyncio
async def test_blocking_registers_routes_and_events():
    browser = PlaywrightScraperBrowser(site_name="test", block_resources=True)
    mock_page = MockPage()
    browser.page = mock_page

    # Call the method under test
    await browser.block_unnecessary_resources()

    # Ensure routes registered: ext pattern and catch-all
    patterns = [p for p, _ in mock_page.routes]
    assert any("*.{png" in p or "png" in p for p in patterns)
    assert "**/*" in patterns

    # Find handlers
    ext_handler = None
    catch_handler = None
    for p, h in mock_page.routes:
        if p == "**/*":
            catch_handler = h
        elif "png" in p:
            ext_handler = h

    assert ext_handler is not None
    assert catch_handler is not None

    # Test ext_handler aborts
    route_img = MockRoute("https://example.com/image.png")
    await ext_handler(route_img)
    assert route_img.aborted

    # Test catch-all allows API calls
    route_api = MockRoute("https://example.com/api/data")
    await catch_handler(route_api)
    assert route_api.continued

    # Test catch-all aborts analytics
    route_analytics = MockRoute("https://google-analytics.com/collect")
    await catch_handler(route_analytics)
    assert route_analytics.aborted

    # Ensure event handlers registered
    assert "request" in mock_page.events
    assert "requestfinished" in mock_page.events
    assert "requestfailed" in mock_page.events

    # Simulate request events for metrics
    # request
    mock_req = SimpleNamespace()
    mock_page.events["request"](mock_req)

    # requestfinished
    mock_page.events["requestfinished"](mock_req)

    # requestfailed with aborted error
    class FailedRequest:
        def failure(self):
            return {"errorText": "net::ERR_ABORTED"}

    failed = FailedRequest()
    mock_page.events["requestfailed"](failed)

    # Metrics should reflect one allowed and one blocked (approx)
    assert browser.allowed_count >= 1
    assert browser.blocked_count >= 1
