from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Literal, TypedDict

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


class ImageCaptureResult(TypedDict):
    status: Literal["success", "error"]
    data_url: str | None
    error_type: Literal["auth_401", "not_found_404", "network_timeout", "cors_blocked"] | None
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


async def _capture_authenticated_images_as_data_urls(ctx: Any, image_urls: list[str]) -> list[ImageCaptureResult]:
    page = getattr(getattr(ctx, "browser", None), "page", None)
    if not image_urls:
        return []

    if page is None:
        return [_build_success_result(url) for url in image_urls if isinstance(url, str) and url.strip()]

    max_attempts = MAX_CAPTURE_RETRIES + 1

    captured_images = await page.evaluate(
        """
        async (urls, fetchTimeoutMs, maxAttempts, initialRetryDelayMs, scrollStep, scrollWaitMs) => {
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

            for (const rawUrl of urls) {
                if (typeof rawUrl !== 'string') {
                    continue;
                }

                const trimmed = rawUrl.trim();
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

                const absoluteUrl = new URL(trimmed, window.location.href).toString();
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
                        const response = await fetch(absoluteUrl, {
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
        """,
        image_urls,
        FETCH_TIMEOUT_MS,
        max_attempts,
        INITIAL_RETRY_DELAY_SECONDS * 1000,
        SCROLL_STEP_PX,
        SCROLL_WAIT_MS,
    )

    if hasattr(page, "wait_for_load_state"):
        await page.wait_for_load_state("networkidle")
    await asyncio.sleep(POST_SCROLL_SETTLE_SECONDS)

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
