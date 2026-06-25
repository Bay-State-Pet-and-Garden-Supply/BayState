import base64
import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

def is_durable_image_url(url: str) -> bool:
    """Check if the URL is already a base64 inline URL or a durable
    Supabase Storage URL (or an R2 / custom public base URL if configured).

    Uses PRODUCT_IMAGE_PUBLIC_BASE_URL env var to recognize custom CDN or
    R2 delivered image URLs as durable, preventing re-capture attempts.
    """
    if not url:
        return False
    normalized = url.strip()
    if (
        normalized.startswith("data:") or
        "/storage/v1/object/public/product-images/" in normalized or
        "/storage/v1/render/image/public/product-images/" in normalized
    ):
        return True

    # Optional: recognize configured custom public base URL (R2 / CDN)
    import os
    configured_base = os.environ.get("PRODUCT_IMAGE_PUBLIC_BASE_URL", "").strip()
    if configured_base and normalized.startswith(configured_base.rstrip("/") + "/"):
        return True

    return False

async def capture_image_authenticated(page: Any, url: str, max_bytes: int = 5 * 1024 * 1024) -> Dict[str, Any]:
    """Capture a single image by downloading it through the authenticated Playwright page session."""
    if is_durable_image_url(url):
        return {
            "status": "success",
            "data_url": url,
            "original_url": url,
        }

    logger.info(f"[Image Capture] Capturing image: {url}")

    # Determine fallback URL if applicable
    fallback_url = None
    if "/large/" in url:
        fallback_url = url.replace("/large/", "/thumb/")
    elif "_large" in url:
        fallback_url = url.replace("_large", "_thumb")
    elif "_lg" in url:
        fallback_url = url.replace("_lg", "_md")
    elif "/weblarge/" in url and "orgill.com" in url:
        fallback_url = url.replace("/weblarge/", "/websmall/")
    elif "/web/" in url and "orgill.com" in url:
        fallback_url = url.replace("/web/", "/websmall/")
    elif "cloudfront.net" in url and not url.endswith("_t.jpg") and "/thumb/" not in url:
        parts = url.split("/")
        if len(parts) >= 4:
            import os
            filename = parts[-1]
            base_filename, ext = os.path.splitext(filename)
            fallback_url = "/".join(parts[:-1]) + f"/thumb/{base_filename}_t{ext}"

    async def try_fallback(error_res: Dict[str, Any]) -> Dict[str, Any]:
        if fallback_url:
            logger.info(f"[Image Capture] Primary image failed, trying fallback: {fallback_url}")
            fb_res = await capture_image_authenticated(page, fallback_url, max_bytes)
            if fb_res.get("status") == "success":
                fb_res["original_url"] = url  # maintain original mapping
                return fb_res
        return error_res

    # Method 1: Evaluate fetch in-page
    try:
        js_code = """
        async (url) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    return { success: false, statusCode: response.status, errorMessage: `HTTP ${response.status}: ${response.statusText}` };
                }
                const blob = await response.blob();
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error("FileReader failed"));
                    reader.readAsDataURL(blob);
                });
                return { success: true, dataUrl, contentType: blob.type, statusCode: response.status };
            } catch (e) {
                return { success: false, isCors: true, errorMessage: e.message };
            }
        }
        """
        # Execute JS in page
        res = await page.evaluate(js_code, url)
        if res and res.get("success"):
            data_url = res.get("dataUrl")
            if data_url:
                # Base64 string length is approx 4/3 of byte size
                estimated_bytes = len(data_url) * 3 / 4
                if estimated_bytes > max_bytes:
                    logger.warning(f"[Image Capture] Image exceeds max size {max_bytes} bytes: {url}")
                    err_res = {
                        "status": "error",
                        "error_type": "unknown",
                        "error_message": f"Image size exceeds limit of {max_bytes} bytes",
                        "original_url": url,
                        "status_code": res.get("statusCode"),
                    }
                    return await try_fallback(err_res)
                return {
                    "status": "success",
                    "data_url": data_url,
                    "original_url": url,
                    "status_code": res.get("statusCode"),
                }
            
        elif res and res.get("errorMessage"):
            logger.debug(f"[Image Capture] Page fetch reported error for {url}: {res.get('errorMessage')}")
            # If not a CORS error and it returned a status code, we can process it directly
            if not res.get("isCors") and res.get("statusCode"):
                status_code = res.get("statusCode")
                error_type = "unknown"
                if status_code in (401, 403):
                    error_type = "auth_401"
                elif status_code == 404:
                    error_type = "not_found_404"
                
                err_res = {
                    "status": "error",
                    "error_type": error_type,
                    "error_message": res.get("errorMessage"),
                    "original_url": url,
                    "status_code": status_code,
                }
                return await try_fallback(err_res)
    except Exception as e:
        logger.debug(f"[Image Capture] Page fetch evaluated error for {url}: {e}")

    # Method 2: Request context fallback (bypasses CORS, shares cookies)
    try:
        logger.debug(f"[Image Capture] Trying context request fallback for {url}")
        
        # Build headers to mimic browser request
        headers = {}
        try:
            page_url = page.url
            if page_url:
                headers["Referer"] = page_url
        except Exception:
            pass
            
        try:
            user_agent = await page.evaluate("navigator.userAgent")
            if user_agent:
                headers["User-Agent"] = user_agent
        except Exception:
            pass
            
        response = await page.context.request.get(url, headers=headers)
        status_code = response.status
        if response.ok:
            body = await response.body()
            if len(body) > max_bytes:
                logger.warning(f"[Image Capture] Image context download exceeds max size {max_bytes} bytes: {url}")
                err_res = {
                    "status": "error",
                    "error_type": "unknown",
                    "error_message": f"Image size exceeds limit of {max_bytes} bytes",
                    "original_url": url,
                    "status_code": status_code,
                }
                return await try_fallback(err_res)
            content_type = response.headers.get("content-type", "image/jpeg")
            base64_data = base64.b64encode(body).decode("utf-8")
            data_url = f"data:{content_type};base64,{base64_data}"
            return {
                "status": "success",
                "data_url": data_url,
                "original_url": url,
                "status_code": status_code,
            }
        else:
            error_msg = f"HTTP {status_code}: {response.status_text}"
            logger.warning(f"[Image Capture] Context request failed for {url}: {error_msg}")
            
            error_type = "unknown"
            if status_code in (401, 403):
                error_type = "auth_401"
            elif status_code == 404:
                error_type = "not_found_404"
                
            err_res = {
                "status": "error",
                "error_type": error_type,
                "error_message": error_msg,
                "original_url": url,
                "status_code": status_code,
            }
            return await try_fallback(err_res)
    except Exception as e:
        logger.error(f"[Image Capture] Image download failed completely for {url}: {e}")
        err_res = {
            "status": "error",
            "error_type": "network_timeout",
            "error_message": str(e),
            "original_url": url,
            "status_code": 0,
        }
        return await try_fallback(err_res)

async def capture_images_authenticated(
    page: Any,
    image_urls: List[str],
    max_images: int = 10,
    max_bytes: int = 5 * 1024 * 1024
) -> List[Dict[str, Any]]:
    """Capture multiple images through the authenticated Playwright page context."""
    results = []
    # Filter unique non-empty URLs
    unique_urls = []
    seen = set()
    for u in image_urls:
        if u and u.strip() and u not in seen:
            unique_urls.append(u.strip())
            seen.add(u)
            
    # Limit number of images
    targets = unique_urls[:max_images]
    for url in targets:
        res = await capture_image_authenticated(page, url, max_bytes)
        results.append(res)
        
    return results
