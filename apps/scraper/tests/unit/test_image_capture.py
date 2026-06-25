"""Unit tests for authenticated image capture module.

Tests cover:
- is_durable_image_url logic
- capture_image_authenticated with Method 1 (page.evaluate fetch)
- capture_image_authenticated with Method 2 (page.context.request fallback)
- error handling, timeouts, size limits, and status code propagation
- capture_images_authenticated bulk capture
"""

import pytest
from unittest.mock import AsyncMock
from scrapers.approved_sources.image_capture import (
    is_durable_image_url,
    capture_image_authenticated,
    capture_images_authenticated,
)

def test_is_durable_image_url():
    # Base64 data URLs should be recognized as durable
    assert is_durable_image_url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA")
    # Supabase URLs should be recognized as durable
    assert is_durable_image_url("https://example.supabase.co/storage/v1/object/public/product-images/pic.png")
    assert is_durable_image_url("https://example.supabase.co/storage/v1/render/image/public/product-images/pic.png")
    # Standard URLs should not be recognized as durable
    assert not is_durable_image_url("https://www.orgill.com/images/widget.jpg")
    assert not is_durable_image_url("")
    assert not is_durable_image_url(None)


def test_is_durable_image_url_custom_public_base(monkeypatch):
    """When PRODUCT_IMAGE_PUBLIC_BASE_URL is set, matching URLs are durable."""
    monkeypatch.setenv("PRODUCT_IMAGE_PUBLIC_BASE_URL", "https://images.baystate.app")
    assert is_durable_image_url("https://images.baystate.app/product-images/hash.webp")
    assert is_durable_image_url("https://images.baystate.app/product-images/abc.webp")
    # Non-matching URLs (different domain) should still not be durable
    assert not is_durable_image_url("https://images.other.app/product-images/hash.webp")
    assert not is_durable_image_url("https://www.orgill.com/images/widget.jpg")


def test_is_durable_image_url_custom_public_base_unset(monkeypatch):
    """Without PRODUCT_IMAGE_PUBLIC_BASE_URL set, custom base URLs should not be recognized."""
    monkeypatch.delenv("PRODUCT_IMAGE_PUBLIC_BASE_URL", raising=False)
    assert not is_durable_image_url("https://images.baystate.app/product-images/hash.webp")


@pytest.mark.asyncio
async def test_capture_image_durable_url_bypass():
    """Verify that durable URLs are bypassed and returned immediately."""
    page = AsyncMock()
    url = "data:image/png;base64,iVBORw"
    res = await capture_image_authenticated(page, url)
    assert res["status"] == "success"
    assert res["data_url"] == url
    assert res["original_url"] == url
    # page.evaluate shouldn't be called
    page.evaluate.assert_not_called()


@pytest.mark.asyncio
async def test_capture_image_method1_success():
    """Verify Method 1 (in-page JS fetch) success path."""
    page = AsyncMock()
    data_url = "data:image/jpeg;base64,Zm9vYmFy"
    page.evaluate.return_value = {
        "success": True,
        "dataUrl": data_url,
        "statusCode": 200,
    }
    
    url = "https://example.com/image.jpg"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "success"
    assert res["data_url"] == data_url
    assert res["original_url"] == url
    assert res["status_code"] == 200
    page.evaluate.assert_called_once()


@pytest.mark.asyncio
async def test_capture_image_method1_size_limit():
    """Verify Method 1 size limit check."""
    page = AsyncMock()
    # Let's generate a mock data url that is larger than 10 bytes
    large_data_url = "data:image/jpeg;base64," + ("A" * 100)
    page.evaluate.return_value = {
        "success": True,
        "dataUrl": large_data_url,
        "statusCode": 200,
    }
    
    url = "https://example.com/image.jpg"
    # Set max_bytes to a very small number (e.g. 5 bytes)
    res = await capture_image_authenticated(page, url, max_bytes=5)
    
    assert res["status"] == "error"
    assert "exceeds limit" in res["error_message"]
    assert res["original_url"] == url


@pytest.mark.asyncio
async def test_capture_image_method1_http_error():
    """Verify Method 1 HTTP error status code detection."""
    page = AsyncMock()
    page.evaluate.return_value = {
        "success": False,
        "isCors": False,
        "statusCode": 404,
        "errorMessage": "HTTP 404: Not Found",
    }
    
    url = "https://example.com/image.jpg"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "error"
    assert res["error_type"] == "not_found_404"
    assert res["status_code"] == 404
    assert res["original_url"] == url


@pytest.mark.asyncio
async def test_capture_image_method2_fallback_success():
    """Verify Method 2 (context request) fallback success when Method 1 fails/throws."""
    page = AsyncMock()
    # Method 1 raises exception or returns failure
    page.evaluate.side_effect = Exception("CORS blocked or evaluate failed")
    
    # Setup Method 2 response mocks
    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.ok = True
    mock_response.body.return_value = b"binarydata"
    mock_response.headers = {"content-type": "image/png"}
    
    page.context.request.get.return_value = mock_response
    
    url = "https://example.com/image.png"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "success"
    assert res["data_url"].startswith("data:image/png;base64,")
    assert res["original_url"] == url
    assert res["status_code"] == 200
    page.context.request.get.assert_called_once()
    assert page.context.request.get.call_args[0][0] == url


@pytest.mark.asyncio
async def test_capture_image_method2_fallback_http_error():
    """Verify Method 2 fallback HTTP error classification."""
    page = AsyncMock()
    page.evaluate.return_value = {"success": False, "isCors": True, "errorMessage": "CORS error"}
    
    mock_response = AsyncMock()
    mock_response.status = 401
    mock_response.ok = False
    mock_response.status_text = "Unauthorized"
    
    page.context.request.get.return_value = mock_response
    
    url = "https://example.com/image.png"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "error"
    assert res["error_type"] == "auth_401"
    assert res["status_code"] == 401
    assert "HTTP 401" in res["error_message"]


@pytest.mark.asyncio
async def test_capture_image_complete_failure():
    """Verify final error response when both methods fail."""
    page = AsyncMock()
    page.evaluate.side_effect = Exception("Eval failed")
    page.context.request.get.side_effect = Exception("Network timeout")
    
    url = "https://example.com/image.png"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "error"
    assert res["error_type"] == "network_timeout"
    assert "Network timeout" in res["error_message"]


@pytest.mark.asyncio
async def test_capture_image_method2_fallback_to_thumb_success():
    """Verify that if a large image returns 403, we fall back to the thumb variant successfully."""
    page = AsyncMock()
    page.url = "https://shop.phillipspet.com/page"
    page.evaluate.side_effect = Exception("CORS blocked")
    
    # Setup context request get calls.
    # The first call (large image) returns 403.
    # The second call (thumb image fallback) returns 200.
    large_response = AsyncMock()
    large_response.status = 403
    large_response.ok = False
    large_response.status_text = "Forbidden"
    
    thumb_response = AsyncMock()
    thumb_response.status = 200
    thumb_response.ok = True
    thumb_response.body.return_value = b"thumbdata"
    thumb_response.headers = {"content-type": "image/jpeg"}
    
    page.context.request.get.side_effect = [large_response, thumb_response]
    
    url = "https://shop.phillipspet.com/images/large/product.jpg"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "success"
    assert res["data_url"].startswith("data:image/jpeg;base64,")
    assert res["original_url"] == url
    assert res["status_code"] == 200
    
    # Verify that get was called twice: once with the large URL, then with the thumb URL
    assert page.context.request.get.call_count == 2
    calls = page.context.request.get.call_args_list
    assert calls[0][0][0] == "https://shop.phillipspet.com/images/large/product.jpg"
    assert calls[1][0][0] == "https://shop.phillipspet.com/images/thumb/product.jpg"


@pytest.mark.asyncio
async def test_capture_images_bulk():
    """Verify bulk image capture."""
    page = AsyncMock()
    page.evaluate.return_value = {
        "success": True,
        "dataUrl": "data:image/jpeg;base64,Zm9v",
        "statusCode": 200,
    }
    
    urls = [
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
        "",  # Should be ignored
        "https://example.com/img1.jpg",  # Duplicate should be ignored
    ]
    
    res = await capture_images_authenticated(page, urls, max_images=5)
    assert len(res) == 2
    assert res[0]["original_url"] == "https://example.com/img1.jpg"
    assert res[1]["original_url"] == "https://example.com/img2.jpg"


@pytest.mark.asyncio
async def test_capture_image_orgill_fallback_success():
    """Verify that if an Orgill /weblarge/ image returns 404, we fall back to the /websmall/ variant successfully."""
    page = AsyncMock()
    page.url = "https://www.orgill.com/SearchResultN.aspx?ddlhQ=123"
    # Method 1 (in-page JS fetch) returns 404
    page.evaluate.return_value = {
        "success": False,
        "isCors": False,
        "statusCode": 404,
        "errorMessage": "HTTP 404: Not Found",
    }
    
    # Setup eval side effect so the recursive call succeeds
    async def side_effect_eval(js, url_arg):
        if "websmall" in url_arg:
            return {
                "success": True,
                "dataUrl": "data:image/jpeg;base64,orgilldata",
                "statusCode": 200,
            }
        return {
            "success": False,
            "isCors": False,
            "statusCode": 404,
            "errorMessage": "HTTP 404: Not Found",
        }
    page.evaluate.side_effect = side_effect_eval

    url = "https://images1.orgill.com/weblarge/10034/4252318.jpg"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "success"
    assert res["data_url"] == "data:image/jpeg;base64,orgilldata"
    assert res["original_url"] == url
    assert res["status_code"] == 200


@pytest.mark.asyncio
async def test_capture_image_phillips_cdn_fallback_success():
    """Verify that if a Phillips root CDN image fails, we try the /thumb/*_t.jpg variant."""
    page = AsyncMock()
    page.url = "https://shop.phillipspet.com"
    page.evaluate.return_value = {
        "success": False,
        "isCors": False,
        "statusCode": 403,
        "errorMessage": "HTTP 403: Forbidden",
    }

    async def side_effect_eval(js, url_arg):
        if "/thumb/" in url_arg and url_arg.endswith("_t.jpg"):
            return {
                "success": True,
                "dataUrl": "data:image/jpeg;base64,phillipsdata",
                "statusCode": 200,
            }
        return {
            "success": False,
            "isCors": False,
            "statusCode": 403,
            "errorMessage": "HTTP 403: Forbidden",
        }
    page.evaluate.side_effect = side_effect_eval

    url = "https://d56ygyjv466yj.cloudfront.net/115145.jpg"
    res = await capture_image_authenticated(page, url)
    
    assert res["status"] == "success"
    assert res["data_url"] == "data:image/jpeg;base64,phillipsdata"
    assert res["original_url"] == url
    assert res["status_code"] == 200
