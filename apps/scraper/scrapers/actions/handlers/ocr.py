"""
OCR Image Text Extraction Action

Extracts text from product images using Tesseract OCR.
Designed for packaging photos where product name/info is printed on the front.
"""

from __future__ import annotations

import base64
import io
import logging
import re
from typing import Any

from scrapers.actions.base import BaseAction
from scrapers.actions.registry import ActionRegistry

logger = logging.getLogger(__name__)

# Optional imports — fail gracefully if not installed
HAS_PIL = False
HAS_TESSERACT = False

try:
    from PIL import Image, ImageEnhance, ImageFilter

    HAS_PIL = True
except ImportError:
    logger.warning("Pillow not installed — OCR will be unavailable")

try:
    import pytesseract

    HAS_TESSERACT = True
except ImportError:
    logger.warning("pytesseract not installed — OCR will be unavailable")


async def _fetch_image_as_bytes(url: str) -> bytes | None:
    """Fetch an image URL and return raw bytes."""
    try:
        import httpx

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if not content_type.lower().startswith("image/"):
                logger.warning(
                    "OCR fetch: unexpected content-type for %s: %s", url, content_type
                )
                return None
            return response.content
    except Exception as e:
        logger.warning("OCR fetch: failed to download %s: %s", url, e)
        return None


def _decode_image(image_source: str) -> Any | None:
    """Decode an image from a data URL or fetch from HTTP into a PIL Image."""
    if not HAS_PIL:
        return None

    image_source = image_source.strip()
    if not image_source:
        return None

    try:
        if image_source.startswith("data:image/"):
            _, _, encoded = image_source.partition(",")
            if not encoded:
                logger.warning("Malformed data URL — no base64 data found")
                return None
            image_bytes = base64.b64decode(encoded)
            return Image.open(io.BytesIO(image_bytes))

        if image_source.startswith(("http://", "https://")):
            # For HTTP URLs we return None here and handle async fetch in the caller
            return None

        logger.warning(
            "Unsupported image source format: %s...", image_source[:60]
        )
        return None

    except Exception as e:
        logger.warning("Failed to decode image: %s", e)
        return None


def _preprocess_for_ocr(image: Any) -> Any:
    """Apply preprocessing to improve OCR accuracy on product packaging images."""
    if not HAS_PIL:
        return image

    try:
        if image.mode not in ("L", "RGB"):
            image = image.convert("RGB")

        gray = image.convert("L")
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(2.0)
        sharp_enhancer = ImageEnhance.Sharpness(enhanced)
        sharpened = sharp_enhancer.enhance(1.5)
        denoised = sharpened.filter(ImageFilter.MedianFilter(size=3))
        return denoised
    except Exception as e:
        logger.warning("Image preprocessing failed: %s", e)
        return image


def _run_tesseract(image: Any, language: str = "eng") -> str:
    """Run Tesseract OCR on a preprocessed image."""
    if not HAS_TESSERACT:
        return ""

    try:
        config = "--psm 6 --oem 3"
        text = pytesseract.image_to_string(image, lang=language, config=config)
        return text.strip()
    except Exception as e:
        logger.warning("Tesseract OCR failed: %s", e)
        return ""


def _clean_ocr_output(text: str) -> str:
    """Clean up common OCR artifacts."""
    if not text:
        return ""

    text = re.sub(r"\s+", " ", text)
    text = "".join(c for c in text if c.isprintable() or c.isspace())
    return text.strip()


@ActionRegistry.register("ocr_images")
class OcrImagesAction(BaseAction):
    """Extract text from product images using Tesseract OCR.

    This action should run AFTER 'process_images' so that authenticated
    images have been converted to base64 data URLs.

    Parameters (override ocr_config defaults):
        field: Source result field containing images (default: "Image URLs")
        max_images: Maximum number of images to OCR (default: 2)
        output_field: Result field to store extracted text (default: "Image Text")
        language: Tesseract language code (default: "eng")
        preprocess: Whether to apply image preprocessing (default: true)
    """

    async def execute(self, params: dict[str, Any]) -> None:
        if not HAS_PIL or not HAS_TESSERACT:
            logger.warning(
                "OCR unavailable — Pillow: %s, pytesseract: %s",
                HAS_PIL,
                HAS_TESSERACT,
            )
            return

        # Merge ocr_config defaults from scraper config if available
        config_defaults: dict[str, Any] = {}
        scraper_config = getattr(self.ctx, "config", None)
        if scraper_config and hasattr(scraper_config, "ocr_config") and scraper_config.ocr_config:
            ocr_cfg = scraper_config.ocr_config
            config_defaults = {
                "field": "Image URLs",
                "max_images": ocr_cfg.max_images,
                "output_field": "Image Text",
                "language": ocr_cfg.language,
                "preprocess": ocr_cfg.preprocess,
            }

        # Params override config defaults
        effective_params = {**config_defaults, **params}

        field = effective_params.get("field", "Image URLs")
        max_images = effective_params.get("max_images", 2)
        output_field = effective_params.get("output_field", "Image Text")
        language = effective_params.get("language", "eng")
        preprocess = effective_params.get("preprocess", True)

        images = self.ctx.results.get(field)
        if not images:
            logger.debug("No images found in field '%s' for OCR", field)
            return

        if not isinstance(images, list):
            images = [images]

        images = [img for img in images if isinstance(img, str) and img.strip()]
        if not images:
            logger.debug("No valid image sources in field '%s'", field)
            return

        images_to_process = images[:max_images]

        logger.info(
            "Starting OCR on %d image(s) from field '%s'",
            len(images_to_process),
            field,
        )

        ocr_results: list[str] = []
        for idx, image_source in enumerate(images_to_process):
            logger.debug("OCR: Processing image %d/%d", idx + 1, len(images_to_process))

            image = _decode_image(image_source)

            # If decode returned None and it's an HTTP URL, try fetching
            if image is None and image_source.startswith(("http://", "https://")):
                image_bytes = await _fetch_image_as_bytes(image_source)
                if image_bytes and HAS_PIL:
                    try:
                        image = Image.open(io.BytesIO(image_bytes))
                    except Exception as e:
                        logger.warning("OCR: failed to open fetched image %d: %s", idx + 1, e)

            if image is None:
                logger.debug("OCR: Failed to decode image %d", idx + 1)
                continue

            if preprocess:
                image = _preprocess_for_ocr(image)

            text = _run_tesseract(image, language=language)
            cleaned = _clean_ocr_output(text)

            if cleaned:
                ocr_results.append(cleaned)
                logger.debug(
                    "OCR: Image %d — extracted %d characters",
                    idx + 1,
                    len(cleaned),
                )
            else:
                logger.debug("OCR: Image %d — no text detected", idx + 1)

        if ocr_results:
            combined_text = "\n\n".join(ocr_results)
            self.ctx.results[output_field] = combined_text
            logger.info(
                "OCR complete — extracted text from %d/%d images (%d chars) into '%s'",
                len(ocr_results),
                len(images_to_process),
                len(combined_text),
                output_field,
            )
        else:
            logger.info(
                "OCR: No text found in any of the %d images from '%s'",
                len(images_to_process),
                field,
            )
