from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from scrapers.actions.handlers.image import ProcessImagesAction, _normalize_image_urls


def _make_response(
    ok: bool = True,
    status: int = 200,
    content_type: str = "image/jpeg",
    body: bytes = b"fake_image_bytes",
) -> SimpleNamespace:
    """Build a mock Playwright APIResponse."""
    resp = SimpleNamespace()
    resp.ok = ok
    resp.status = status
    resp.headers = {"content-type": content_type}
    resp.body = AsyncMock(return_value=body)
    return resp


def _make_page(
    url: str = "https://supplier.example.com/products/sku-1",
    evaluate_result: list | None = None,
    request_get_response: SimpleNamespace | None = None,
    request_get_exception: Exception | None = None,
) -> SimpleNamespace:
    """Build a mock page with optional request.get and evaluate behavior."""
    request = SimpleNamespace()

    if request_get_exception is not None:
        request.get = AsyncMock(side_effect=request_get_exception)
    elif request_get_response is not None:
        request.get = AsyncMock(return_value=request_get_response)
    else:
        # No request mock — will raise AttributeError, triggering fallback
        request = SimpleNamespace()

    evaluate_result = evaluate_result or []
    page = SimpleNamespace(
        url=url,
        request=request,
        evaluate=AsyncMock(return_value=evaluate_result),
    )
    return page


# ---------------------------------------------------------------------------
# Existing tests (should still pass with new architecture)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_images_upgrades_amazon_thumbnail_urls_to_hires() -> None:
    ctx = SimpleNamespace(
        results={
            "Images": [
                "https://m.media-amazon.com/images/I/51aDm-WuyHL._AC_US100_.jpg",
                "https://m.media-amazon.com/images/I/5144L3LSFSL._SX38_SY50_CR,0,0,38,50_.jpg",
                "https://m.media-amazon.com/images/I/41oIgmabzHL._SS40_.jpg",
            ]
        }
    )
    action = ProcessImagesAction(ctx)

    await action.execute(
        {
            "field": "Images",
            "quality_patterns": [
                {
                    "regex": r"\._[A-Z0-9_,-]+_\.",
                    "replacement": "._AC_SL1500_.",
                }
            ],
            "filters": [{"type": "require_text", "text": "images/I/"}],
            "deduplicate": True,
        }
    )

    assert ctx.results["Images"] == [
        "https://m.media-amazon.com/images/I/51aDm-WuyHL._AC_SL1500_.jpg",
        "https://m.media-amazon.com/images/I/5144L3LSFSL._AC_SL1500_.jpg",
        "https://m.media-amazon.com/images/I/41oIgmabzHL._AC_SL1500_.jpg",
    ]


@pytest.mark.asyncio
async def test_process_images_converts_authenticated_images_to_data_urls_fallback() -> None:
    """When page.request.get is unavailable, fallback to browser fetch should work."""
    page = SimpleNamespace(
        url="https://supplier.example.com/products/sku-1",
        evaluate=AsyncMock(
            return_value=[
                {
                    "original_url": "https://supplier.example.com/images/sku-1.jpg",
                    "data_url": "data:image/jpeg;base64,AAA=",
                    "error": None,
                }
            ]
        )
    )
    ctx = SimpleNamespace(
        results={"Images": ["https://supplier.example.com/images/sku-1.jpg"]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    assert ctx.results["Images"] == ["data:image/jpeg;base64,AAA="]
    page.evaluate.assert_awaited_once()


# ---------------------------------------------------------------------------
# New tests: request-context primary capture
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_authenticated_capture_uses_page_request_primary() -> None:
    """The Playwright request API is the primary capture path; evaluate is not called when it succeeds."""
    mock_response = _make_response(
        ok=True,
        status=200,
        content_type="image/jpeg",
        body=b"\xff\xd8\xff\xe0\x00\x10JFIF",
    )
    page = _make_page(
        url="https://supplier.example.com/products/sku-1",
        request_get_response=mock_response,
    )
    ctx = SimpleNamespace(
        results={"Images": ["https://supplier.example.com/images/sku-1.jpg"]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    # Should have a data URL result
    result_urls = ctx.results["Images"]
    assert len(result_urls) == 1
    assert result_urls[0].startswith("data:image/jpeg;base64,")

    # request.get should have been called with proper headers
    page.request.get.assert_awaited_once()
    call_args, call_kwargs = page.request.get.call_args
    assert call_args[0] == "https://supplier.example.com/images/sku-1.jpg"
    assert "referer" in call_kwargs.get("headers", {})
    assert "accept" in call_kwargs.get("headers", {})

    # evaluate should NOT have been called (no fallback needed)
    page.evaluate.assert_not_called()


@pytest.mark.asyncio
async def test_authenticated_capture_request_api_auth_401_does_not_fallback() -> None:
    """401 from request API is definitive — no fallback to browser fetch."""
    mock_response = _make_response(ok=False, status=401)
    page = _make_page(
        url="https://supplier.example.com/",
        request_get_response=mock_response,
    )
    ctx = SimpleNamespace(
        results={"Images": ["https://supplier.example.com/protected.jpg"]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    # Should produce an error result, not a raw URL
    assert len(ctx.results["Images"]) == 0

    # Capture metadata should have the auth error
    metadata = ctx.results.get("Images_capture_metadata", [])
    assert len(metadata) == 1
    assert metadata[0]["status"] == "error"
    assert metadata[0]["error_type"] == "auth_401"
    assert metadata[0]["original_url"] == "https://supplier.example.com/protected.jpg"

    # evaluate should NOT have been called — 401 is definitive
    page.evaluate.assert_not_called()


@pytest.mark.asyncio
async def test_authenticated_capture_falls_back_to_browser_fetch_on_non_auth_error() -> None:
    """Non-401/404 HTTP errors from request API trigger fallback to browser fetch."""
    mock_response = _make_response(ok=False, status=500)
    evaluate_result = [
        {
            "original_url": "https://supplier.example.com/images/sku-1.jpg",
            "data_url": "data:image/jpeg;base64,BBB=",
            "error": None,
        }
    ]
    page = _make_page(
        url="https://supplier.example.com/",
        request_get_response=mock_response,
        evaluate_result=evaluate_result,
    )
    ctx = SimpleNamespace(
        results={"Images": ["https://supplier.example.com/images/sku-1.jpg"]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    # Fallback should have produced a data URL
    assert ctx.results["Images"] == ["data:image/jpeg;base64,BBB="]
    page.request.get.assert_awaited_once()
    page.evaluate.assert_awaited_once()


@pytest.mark.asyncio
async def test_authenticated_capture_falls_back_on_request_api_exception() -> None:
    """Network/timeout exceptions from request API trigger fallback to browser fetch."""
    page = _make_page(
        url="https://supplier.example.com/",
        request_get_exception=TimeoutError("Request timed out"),
        evaluate_result=[
            {
                "original_url": "https://supplier.example.com/images/sku-1.jpg",
                "data_url": "data:image/png;base64,CCC=",
                "error": None,
            }
        ],
    )
    ctx = SimpleNamespace(
        results={"Images": ["https://supplier.example.com/images/sku-1.jpg"]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    # Fallback should have produced a data URL
    assert ctx.results["Images"] == ["data:image/png;base64,CCC="]
    page.request.get.assert_awaited_once()
    page.evaluate.assert_awaited_once()


# ---------------------------------------------------------------------------
# New tests: no page / missing authentication context
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_authenticated_capture_no_page_returns_error_not_raw_url() -> None:
    """When no authenticated page is available, return structured error, not raw URL."""
    ctx = SimpleNamespace(
        results={"Images": ["https://orders.petfoodexperts.com/protected.jpg"]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=None,
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    # No successful image URLs should be in the result
    assert len(ctx.results["Images"]) == 0

    # Capture metadata should have an auth error
    metadata = ctx.results.get("Images_capture_metadata", [])
    assert len(metadata) == 1
    assert metadata[0]["status"] == "error"
    assert metadata[0]["error_type"] == "auth_401"
    assert "No authenticated browser context" in (metadata[0]["error_message"] or "")
    assert metadata[0]["original_url"] == "https://orders.petfoodexperts.com/protected.jpg"


@pytest.mark.asyncio
async def test_authenticated_capture_no_page_preserves_data_urls() -> None:
    """Data URLs should still pass through even without a page context."""
    ctx = SimpleNamespace(
        results={"Images": ["data:image/png;base64,existing_data_url=="]},
        config=SimpleNamespace(requires_login=lambda: True),
        browser=None,
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    assert ctx.results["Images"] == ["data:image/png;base64,existing_data_url=="]


# ---------------------------------------------------------------------------
# New tests: relative URL normalization
# ---------------------------------------------------------------------------


class TestNormalizeImageUrls:
    """Tests for _normalize_image_urls helper."""

    def test_absolute_urls_preserved(self) -> None:
        result = _normalize_image_urls(
            ["https://example.com/img.jpg", "https://other.com/pic.png"],
            "https://example.com/page",
        )
        assert result == ["https://example.com/img.jpg", "https://other.com/pic.png"]

    def test_relative_urls_made_absolute(self) -> None:
        result = _normalize_image_urls(
            ["/images/sku-1.jpg", "../assets/pic.png"],
            "https://example.com/products/page",
        )
        assert result == [
            "https://example.com/images/sku-1.jpg",
            "https://example.com/assets/pic.png",
        ]

    def test_data_urls_preserved(self) -> None:
        result = _normalize_image_urls(
            ["data:image/png;base64,abc123", "https://example.com/img.jpg"],
            "https://example.com/page",
        )
        assert result == [
            "data:image/png;base64,abc123",
            "https://example.com/img.jpg",
        ]

    def test_empty_base_url_leaves_urls_unchanged(self) -> None:
        result = _normalize_image_urls(
            ["/images/sku-1.jpg", "https://example.com/img.jpg"],
            "",
        )
        assert result == ["/images/sku-1.jpg", "https://example.com/img.jpg"]

    def test_empty_and_whitespace_urls_filtered(self) -> None:
        result = _normalize_image_urls(
            ["https://example.com/img.jpg", "", "  ", None],  # type: ignore[list-item]
            "https://example.com/page",
        )
        assert result == ["https://example.com/img.jpg"]


# ---------------------------------------------------------------------------
# New tests: process_images output contains only data URLs, not raw URLs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_authenticated_capture_no_raw_url_in_final_output() -> None:
    """Login-required process_images output should never contain raw vendor URLs."""
    mock_response = _make_response(
        ok=True,
        status=200,
        content_type="image/jpeg",
        body=b"\xff\xd8\xff\xe0\x00\x10JFIF",
    )
    page = _make_page(
        url="https://supplier.example.com/products/sku-1",
        request_get_response=mock_response,
    )
    ctx = SimpleNamespace(
        results={
            "Images": [
                "https://orders.petfoodexperts.com/images/sku-1.jpg",
            ]
        },
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    # The final image URLs must be data URLs, not raw vendor URLs
    for url in ctx.results["Images"]:
        assert url.startswith("data:image/"), f"Got raw vendor URL: {url}"
        assert "orders.petfoodexperts.com" not in url

    # Capture metadata should have the original URL
    metadata = ctx.results.get("Images_capture_metadata", [])
    assert len(metadata) == 1
    assert metadata[0]["original_url"] == "https://orders.petfoodexperts.com/images/sku-1.jpg"


@pytest.mark.asyncio
async def test_authenticated_capture_mixed_primary_fallback_preserves_order() -> None:
    """When some images use primary request API and others fallback, original order is preserved."""
    # Image A: request API returns 500 (needs fallback)
    # Image B: request API succeeds immediately
    # Expected final order: [A, B] (same as input)
    page = _make_page(
        url="https://supplier.example.com/products/sku-1",
        request_get_response=_make_response(ok=False, status=500),
        evaluate_result=[
            {
                "original_url": "https://supplier.example.com/images/sku-1_A.jpg",
                "data_url": "data:image/jpeg;base64,AAA=",
                "error": None,
            },
            {
                "original_url": "https://supplier.example.com/images/sku-1_B.jpg",
                "data_url": "data:image/jpeg;base64,BBB=",
                "error": None,
            },
        ],
    )
    ctx = SimpleNamespace(
        results={
            "Images": [
                "https://supplier.example.com/images/sku-1_A.jpg",
                "https://supplier.example.com/images/sku-1_B.jpg",
            ]
        },
        config=SimpleNamespace(requires_login=lambda: True),
        browser=SimpleNamespace(page=page),
    )
    action = ProcessImagesAction(ctx)

    await action.execute({"field": "Images", "deduplicate": True})

    # Order must be preserved: A first, B second
    assert ctx.results["Images"] == [
        "data:image/jpeg;base64,AAA=",
        "data:image/jpeg;base64,BBB=",
    ]

    # Verify metadata also preserves order
    metadata = ctx.results.get("Images_capture_metadata", [])
    assert len(metadata) == 2
    assert metadata[0]["original_url"] == "https://supplier.example.com/images/sku-1_A.jpg"
    assert metadata[1]["original_url"] == "https://supplier.example.com/images/sku-1_B.jpg"
