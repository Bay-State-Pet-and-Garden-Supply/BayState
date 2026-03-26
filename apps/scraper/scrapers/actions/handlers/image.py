from __future__ import annotations

import logging
import re
from typing import Any

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry
from scrapers.exceptions import WorkflowExecutionError

logger = logging.getLogger(__name__)


async def _capture_authenticated_images_as_data_urls(ctx: Any, image_urls: list[str]) -> list[str]:
    page = getattr(getattr(ctx, "browser", None), "page", None)
    if page is None or not image_urls:
        return image_urls

    captured_images = await page.evaluate(
        """
        async (urls) => {
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
                    results.push({ original_url: trimmed, data_url: trimmed, error: null });
                    continue;
                }

                try {
                    const absoluteUrl = new URL(trimmed, window.location.href).toString();
                    const response = await fetch(absoluteUrl, { credentials: 'include' });

                    if (!response.ok) {
                        results.push({
                            original_url: trimmed,
                            data_url: absoluteUrl,
                            error: `HTTP ${response.status}`,
                        });
                        continue;
                    }

                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.toLowerCase().startsWith('image/')) {
                        results.push({
                            original_url: trimmed,
                            data_url: absoluteUrl,
                            error: `Unexpected content type: ${contentType || 'unknown'}`,
                        });
                        continue;
                    }

                    results.push({
                        original_url: trimmed,
                        data_url: await toDataUrl(response),
                        error: null,
                    });
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
                    results.push({
                        original_url: trimmed,
                        data_url: trimmed,
                        error: message,
                    });
                }
            }

            return results;
        }
        """,
        image_urls,
    )

    processed_urls: list[str] = []
    for entry in captured_images:
        data_url = entry.get("data_url") if isinstance(entry, dict) else None
        if isinstance(data_url, str) and data_url.strip():
            processed_urls.append(data_url)

        error = entry.get("error") if isinstance(entry, dict) else None
        original_url = entry.get("original_url") if isinstance(entry, dict) else None
        if error:
            logger.warning(
                "Failed to convert authenticated image %s to data URL: %s",
                original_url or "<unknown>",
                error,
            )

    return processed_urls


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
            filtered_images = await _capture_authenticated_images_as_data_urls(self.ctx, filtered_images)

        self.ctx.results[field] = filtered_images
        logger.debug(f"Processed images for {field}: {len(filtered_images)} remaining")
