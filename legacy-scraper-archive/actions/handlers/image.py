from __future__ import annotations

import asyncio
import base64
import logging
import re
from typing import Any, Literal, TypedDict
from urllib.parse import urljoin

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry
from scrapers.exceptions import WorkflowExecutionError

logger = logging.getLogger(__name__)

SCROLL_STEP_PX = 500
SCROLL_WAIT_MS = 100
POST_SCROLL_SETTLE_SECONDS = 0.5
FETCH_TIMEOUT_MS = 15_000
MAX_CAPTURE_RETRIES = 2
INITIAL_RETRY_DELAY_SECONDS = 1

ERROR_AUTH_401 = "auth_401"
ERROR_NOT_FOUND_404 = "not_found_404"
ERROR_NETWORK_TIMEOUT = "network_timeout"
ERROR_CORS_BLOCKED = "cors_blocked"
ERROR_UNKNOWN = "unknown"


class ImageCaptureResult(TypedDict):
    status: Literal["success", "error"]
    data_url: str | None
    error_type: Literal["auth_401", "not_found_404", "network_timeout", "cors_blocked", "unknown"] | None
    error_message: str | None
    original_url: str


def _build_success_result(url: str) -> ImageCaptureResult:
    return {
        "status": "success",
        "data_url": url,
        "error_type": None,
        "error_message": None,
        "original_url": url,
    }


def _build_error_result(url: str, error_type: str, error_message: str) -> ImageCaptureResult:
    """Build a structured error result for a failed image capture."""
    return {
        "status": "error",
        "data_url": None,
        "error_type": error_type,
        "error_message": error_message,
        "original_url": url,
    }


def _normalize_image_urls(image_urls: list[str], base_url: str) -> list[str]:
    """Normalize image URLs to absolute URLs using the page base URL.
    Preserves data: URLs as-is.
    """
    normalized: list[str] = []
    for raw_url in image_urls:
        if not isinstance(raw_url, str) or not raw_url.strip():
            continue
        trimmed = raw_url.strip()
        if trimmed.startswith("data:image/"):
            normalized.append(trimmed)
        elif base_url and not trimmed.startswith(("http://", "https://", "data:")):
            try:
                normalized.append(urljoin(base_url, trimmed))
            except Exception:
                normalized.append(trimmed)
        else:
            normalized.append(trimmed)
    return normalized


async def _capture_via_page_request(page, url: str) -> ImageCaptureResult | None:
    """Capture an image using the Playwright request API (shares authenticated session).

    Returns an ImageCaptureResult on definitive success or failure,
    or None to signal the caller should fall back to browser-side fetch.
    """
    try:
        response = await page.request.get(
            url,
            headers={
                "referer": page.url,
                "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout=FETCH_TIMEOUT_MS,
            fail_on_status_code=False,
        )

        if not response.ok:
            status = response.status
            if status in (401, 403):
                return _build_error_result(url, ERROR_AUTH_401, f"HTTP {status}")
            if status == 404:
                return _build_error_result(url, ERROR_NOT_FOUND_404, f"HTTP {status}")
            # Other HTTP error — browser fetch might handle it (e.g. CORS quirks)
            return None

        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            # Unexpected content type — try browser fetch as fallback
            return None

        body = await response.body()
        data_url = f"data:{content_type};base64,{base64.b64encode(body).decode('ascii')}"
        return {
            "status": "success",
            "data_url": data_url,
            "error_type": None,
            "error_message": None,
            "original_url": url,
        }
    except Exception:
        # Network error / timeout / CORS — try browser fetch fallback
        return None


BROWSER_FETCH_SCRIPT = """
async ([urls, fetchTimeoutMs, maxAttempts, initialRetryDelayMs, scrollStep, scrollWaitMs]) => {
    for (let y = 0; y < document.body.scrollHeight; y += scrollStep) {
        window.scrollTo(0, y);
        await new Promise(resolve => setTimeout(resolve, scrollWaitMs));
    }

    const toDataUrl = async (response) => {
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                    return;
                }
                reject(new Error('FileReader did not produce a string result.'));
            };
            reader.onerror = () => reject(reader.error || new Error('Failed to read image blob.'));
            reader.readAsDataURL(blob);
        });
    };

    const classifyHttpError = (statusCode) => {
        if (statusCode === 401) {
            return 'auth_401';
        }
        if (statusCode === 404) {
            return 'not_found_404';
        }
        return 'network_timeout';
    };

    const classifyFetchError = (message) => {
        const lower = String(message || '').toLowerCase();
        if (lower.includes('cors')) {
            return 'cors_blocked';
        }
        if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('failed to fetch')) {
            return 'network_timeout';
        }
        return 'network_timeout';
    };

    const shouldRetry = (errorType) => errorType === 'network_timeout';

    const results = [];

    for (const url of urls) {
        if (typeof url !== 'string') {
            continue;
        }

        const trimmed = url.trim();
        if (!trimmed) {
            continue;
        }

        if (trimmed.startsWith('data:image/')) {
            results.push({
                status: 'success',
                data_url: trimmed,
                error_type: null,
                error_message: null,
                original_url: trimmed,
            });
            continue;
        }

        let finalResult = {
            status: 'error',
            data_url: null,
            error_type: 'network_timeout',
            error_message: 'Unknown capture error',
            original_url: trimmed,
        };

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);

            try {
                const response = await fetch(trimmed, {
                    credentials: 'include',
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const errorType = classifyHttpError(response.status);
                    finalResult = {
                        status: 'error',
                        data_url: null,
                        error_type: errorType,
                        error_message: `HTTP ${response.status}`,
                        original_url: trimmed,
                    };
                    break;
                }

                const contentType = response.headers.get('content-type') || '';
                if (!contentType.toLowerCase().startsWith('image/')) {
                    finalResult = {
                        status: 'error',
                        data_url: null,
                        error_type: 'cors_blocked',
                        error_message: `Unexpected content type: ${contentType || 'unknown'}`,
                        original_url: trimmed,
                    };
                    break;
                }

                finalResult = {
                    status: 'success',
                    data_url: await toDataUrl(response),
                    error_type: null,
                    error_message: null,
                    original_url: trimmed,
                };
                break;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
                const errorType = classifyFetchError(message);

                finalResult = {
                    status: 'error',
                    data_url: null,
                    error_type: errorType,
                    error_message: message,
                    original_url: trimmed,
                };

                if (!shouldRetry(errorType) || attempt === maxAttempts - 1) {
                    break;
                }

                const backoffMs = initialRetryDelayMs * (2 ** attempt);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            } finally {
                clearTimeout(timeoutId);
            }
        }

        results.push(finalResult);
    }

    return results;
}
"""


async def _run_browser_fetch_fallback(page, urls: list[str]) -> list[ImageCaptureResult]:
    """Fallback: capture images via browser-side fetch with credentials include."""
    if not urls:
        return []

    max_attempts = MAX_CAPTURE_RETRIES + 1
    captured_images = await page.evaluate(
        BROWSER_FETCH_SCRIPT,
        [
            urls,
            FETCH_TIMEOUT_MS,
            max_attempts,
            INITIAL_RETRY_DELAY_SECONDS * 1000,
            SCROLL_STEP_PX,
            SCROLL_WAIT_MS,
        ],
    )

    if hasattr(page, "wait_for_load_state"):
        await page.wait_for_load_state("networkidle")
    await asyncio.sleep(POST_SCROLL_SETTLE_SECONDS)

    return _process_evaluate_results(captured_images)


def _process_evaluate_results(captured_images: list[dict]) -> list[ImageCaptureResult]:
    """Process results from browser-side evaluate into ImageCaptureResult list."""
    processed_results: list[ImageCaptureResult] = []
    for entry in captured_images:
        data_url = entry.get("data_url") if isinstance(entry, dict) else None
        status = entry.get("status") if isinstance(entry, dict) else None
        error_type = entry.get("error_type") if isinstance(entry, dict) else None
        error_message = entry.get("error_message") if isinstance(entry, dict) else None
        legacy_error = entry.get("error") if isinstance(entry, dict) else None
        original_url = entry.get("original_url") if isinstance(entry, dict) else None

        if status is None:
            status = "success" if not legacy_error else "error"
            if error_message is None and isinstance(legacy_error, str):
                error_message = legacy_error

        if status == "success" and isinstance(data_url, str) and data_url.strip():
            processed_results.append(
                {
                    "status": "success",
                    "data_url": data_url,
                    "error_type": None,
                    "error_message": None,
                    "original_url": str(original_url or data_url),
                }
            )
            continue

        normalized_error_type: ImageCaptureResult["error_type"]
        if error_type == ERROR_AUTH_401:
            normalized_error_type = ERROR_AUTH_401
        elif error_type == ERROR_NOT_FOUND_404:
            normalized_error_type = ERROR_NOT_FOUND_404
        elif error_type == ERROR_CORS_BLOCKED:
            normalized_error_type = ERROR_CORS_BLOCKED
        elif error_type == ERROR_UNKNOWN:
            normalized_error_type = ERROR_UNKNOWN
        else:
            normalized_error_type = ERROR_NETWORK_TIMEOUT

        processed_results.append(
            {
                "status": "error",
                "data_url": None,
                "error_type": normalized_error_type,
                "error_message": str(error_message or "Unknown capture error"),
                "original_url": str(original_url or "<unknown>"),
            }
        )

        if error_message:
            logger.warning(
                "Failed to convert authenticated image %s to data URL [%s]: %s",
                original_url or "<unknown>",
                normalized_error_type,
                error_message,
            )

    return processed_results


async def _capture_authenticated_images_as_data_urls(ctx: Any, image_urls: list[str]) -> list[ImageCaptureResult]:
    """Capture login-protected images as data URLs.

    Primary path: Playwright request API (shared authenticated session).
    Fallback: browser-side fetch with credentials: include.
    Returns structured ImageCaptureResult objects.
    """
    page = getattr(getattr(ctx, "browser", None), "page", None)
    if not image_urls:
        return []

    # Normalize URLs to absolute for accurate origin tracking
    base_url = page.url if page else ""
    normalized_urls = _normalize_image_urls(image_urls, base_url)

    if page is None:
        # No authenticated browser context — return error for non-data URLs
        return [
            _build_success_result(url) if url.startswith("data:image/")
            else _build_error_result(url, ERROR_AUTH_401, "No authenticated browser context available for capture")
            for url in normalized_urls
        ]

    # Preallocate results to preserve original image order
    results: list[ImageCaptureResult | None] = [None] * len(normalized_urls)
    urls_for_fallback: list[tuple[int, str]] = []

    for idx, url in enumerate(normalized_urls):
        if url.startswith("data:image/"):
            results[idx] = _build_success_result(url)
            continue

        # PRIMARY: Playwright request API (shares authenticated session, handles cookies)
        pw_result = await _capture_via_page_request(page, url)
        if pw_result is not None:
            results[idx] = pw_result
        else:
            urls_for_fallback.append((idx, url))

    # FALLBACK: Browser-side fetch for URLs that failed the request API
    if urls_for_fallback:
        logger.debug("Falling back to browser fetch for %d URLs", len(urls_for_fallback))
        fallback_urls = [url for _, url in urls_for_fallback]
        browser_results = await _run_browser_fetch_fallback(page, fallback_urls)
        for fallback_idx, (original_idx, _) in enumerate(urls_for_fallback):
            if fallback_idx < len(browser_results):
                results[original_idx] = browser_results[fallback_idx]
            else:
                results[original_idx] = _build_error_result(
                    urls_for_fallback[fallback_idx][1],
                    ERROR_UNKNOWN,
                    "Fallback capture returned fewer results than expected",
                )

    return [r for r in results if r is not None]


@ActionRegistry.register("process_images")
class ProcessImagesAction(BaseAction):
    """Action to process, filter, and upgrade image URLs."""

    async def execute(self, params: dict[str, Any]) -> None:
        field = params.get("field")
        if not field:
            raise WorkflowExecutionError("Process_images requires 'field' parameter")

        images = self.ctx.results.get(field)
        if not images:
            logger.warning(f"No images found in field {field}")
            return

        if not isinstance(images, list):
            images = [images]

        # 1. Quality Upgrades (URL Transformation)
        upgrade_patterns = params.get("quality_patterns", [])
        processed_images = []

        for img_url in images:
            if not img_url:
                continue

            new_url = img_url
            for pattern in upgrade_patterns:
                regex = pattern.get("regex")
                replacement = pattern.get("replacement")
                if regex and replacement:
                    try:
                        new_url = re.sub(regex, replacement, new_url)
                    except Exception as e:
                        logger.warning(f"Regex error in image upgrade: {e}")

            processed_images.append(new_url)

        # 2. Filtering
        filters = params.get("filters", [])
        filtered_images = []
        for img_url in processed_images:
            keep = True
            for filter_rule in filters:
                if filter_rule.get("type") == "exclude_text":
                    text = filter_rule.get("text")
                    if text and text in img_url:
                        keep = False
                        break
                elif filter_rule.get("type") == "require_text":
                    text = filter_rule.get("text")
                    if text and text not in img_url:
                        keep = False
                        break
            if keep:
                filtered_images.append(img_url)

        # 3. Deduplication
        if params.get("deduplicate", True):
            seen = set()
            unique_images = []
            for img in filtered_images:
                if img not in seen:
                    seen.add(img)
                    unique_images.append(img)
            filtered_images = unique_images

        config = getattr(self.ctx, "config", None)
        requires_login = bool(config.requires_login()) if config and hasattr(config, "requires_login") else False
        if requires_login:
            capture_results = await _capture_authenticated_images_as_data_urls(self.ctx, filtered_images)
            self.ctx.results[f"{field}_capture_metadata"] = capture_results
            filtered_images = [result["data_url"] for result in capture_results if result["status"] == "success" and isinstance(result["data_url"], str)]

        self.ctx.results[field] = filtered_images
        logger.debug(f"Processed images for {field}: {len(filtered_images)} remaining")
