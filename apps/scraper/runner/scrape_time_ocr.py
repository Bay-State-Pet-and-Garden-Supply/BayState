"""
Scrape-time OCR — raw packaging text extraction during enrichment.

Runs OCR on images captured by approved-source enrichment jobs.
Non-blocking: OCR failure never blocks or fails the enrichment flow.
Populates `image_text` in per-source EvidenceData so it becomes
prompt-visible in the consolidation system.

Separate from the packaging vision pipeline (PACKAGING_VISION_*),
which is a later, higher-cost, structured VLM extraction step.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from src.ocr.image_selector import select_ocr_images
from src.ocr.vision_service import extract_text_from_image_urls

logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================


def is_scrape_time_ocr_enabled() -> bool:
    """Check if scrape-time OCR is enabled via IMAGE_OCR_ENABLED env var."""
    return os.environ.get("IMAGE_OCR_ENABLED", "").lower() in ("true", "1", "yes")


def get_scrape_time_ocr_config(attempt: Any = None) -> dict[str, Any]:
    """Resolve scrape-time OCR configuration from env with fallbacks.

    If IMAGE_OCR_API_KEY is not set, falls back to attempt.ai_credentials
    dict (if attempt provided), then LLM_API_KEY env.
    Same for IMAGE_OCR_BASE_URL -> attempt.ai_credentials -> LLM_BASE_URL.
    """
    api_key = os.environ.get("IMAGE_OCR_API_KEY")
    if not api_key and attempt is not None:
        creds = getattr(attempt, "ai_credentials", None)
        if isinstance(creds, dict):
            api_key = (creds.get("llm_api_key")
                       or creds.get("openai_api_key")
                       or creds.get("deepseek_api_key"))
    if not api_key:
        api_key = os.environ.get("LLM_API_KEY", "")

    base_url = os.environ.get("IMAGE_OCR_BASE_URL")
    if not base_url and attempt is not None:
        creds = getattr(attempt, "ai_credentials", None)
        if isinstance(creds, dict):
            base_url = creds.get("llm_base_url")
    if not base_url:
        base_url = os.environ.get("LLM_BASE_URL") or None

    return {
        "model": os.environ.get("IMAGE_OCR_MODEL", "gpt-4o-mini"),
        "api_key": api_key or "",
        "base_url": base_url,
        "max_images": int(os.environ.get("IMAGE_OCR_MAX_IMAGES", "1")),
        "max_tokens": int(os.environ.get("IMAGE_OCR_MAX_TOKENS", "500")),
        "timeout": int(os.environ.get("IMAGE_OCR_TIMEOUT_SECONDS", "120")),
    }


# =============================================================================
# Image Collection
# =============================================================================


def collect_source_images(
    product: Any,
    upc: str | None = None,
    max_images: int = 1,
) -> list[str]:
    """Collect and rank image URLs from an EnrichedProductFacts product.

    Tries, in priority order:
    1. evidence.selected_images (admin-curated)
    2. media[*].url (captured product images)
    3. image_urls property (fallback flat list)

    Passes all candidate URLs through select_ocr_images() for scoring/filtering,
    which filters out logos, icons, thumbnails, etc.
    """
    candidates: list[str] = []

    # 1. evidence.selected_images (highest priority — captured/best images)
    if product and hasattr(product, "evidence") and product.evidence:
        if hasattr(product.evidence, "selected_images") and product.evidence.selected_images:
            candidates.extend(
                url for url in product.evidence.selected_images
                if isinstance(url, str) and url.strip()
            )

    # 2. media[*].url
    if product and hasattr(product, "media") and product.media:
        for m in product.media:
            url = getattr(m, "url", None) or ""
            if isinstance(url, str) and url.strip():
                candidates.append(url.strip())

    # 3. image_urls property fallback
    if not candidates and product and hasattr(product, "image_urls"):
        urls = product.image_urls
        if isinstance(urls, list):
            candidates.extend(u for u in urls if isinstance(u, str) and u.strip())

    if not candidates:
        return []

    # Deduplicate preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for url in candidates:
        if url not in seen:
            seen.add(url)
            unique.append(url)

    # Use OCR image selector for intelligent ranking/filtering
    return select_ocr_images(unique, max_images=max_images, upc=upc or None)


# =============================================================================
# Scrape-time OCR Application
# =============================================================================


async def apply_scrape_time_ocr(
    enrichment_result: Any,
    *,
    upc: str,
    attempt: Any = None,
) -> dict[str, Any]:
    """Run scrape-time OCR on enrichment result sources.

    Iterates source_results, collects images per source, calls the
    vision OCR endpoint, and writes image_text into each source's
    product.evidence. Also writes top-level product.evidence.image_text
    from the best available source result.

    Returns a summary dict. Never raises — all exceptions are caught
    and logged. OCR failure does not fail enrichment.

    Args:
        enrichment_result: An EnrichmentResultV1 instance.
        upc: Product UPC for image selection hints.

    Returns:
        Summary dict with keys:
            enabled: bool
            sources_scanned: int
            sources_with_images: int
            sources_ocr_succeeded: int
            sources_ocr_failed: int
            errors: list[str]
    """
    summary: dict[str, Any] = {
        "enabled": True,
        "sources_scanned": 0,
        "sources_with_images": 0,
        "sources_ocr_succeeded": 0,
        "sources_ocr_failed": 0,
        "errors": [],
    }

    if not enrichment_result:
        summary["errors"].append("No enrichment result provided")
        return summary

    config = get_scrape_time_ocr_config(attempt)
    if not config["api_key"]:
        summary["errors"].append("No API key available for scrape-time OCR (set IMAGE_OCR_API_KEY or LLM_API_KEY)")
        logger.warning("[ScrapeOCRT] No API key available — skipping OCR")
        return summary

    max_images = config["max_images"]
    source_results = getattr(enrichment_result, "source_results", None) or []

    # If there's a top-level product but no source_results, use it directly
    if not source_results:
        product = getattr(enrichment_result, "product", None)
        if product:
            source_results = [type("Src", (), {"product": product, "sourceSlug": "primary"})()]
            summary["sources_scanned"] = 1
        else:
            summary["sources_scanned"] = 0
    else:
        summary["sources_scanned"] = len(source_results)

    best_image_text: str | None = None

    for sr in source_results:
        product = getattr(sr, "product", None)
        if not product:
            continue

        # Collect images for this source
        image_urls = collect_source_images(product, upc=upc, max_images=max_images)
        if not image_urls:
            continue

        summary["sources_with_images"] += 1

        # Run OCR
        try:
            ocr_text = await extract_text_from_image_urls(
                image_urls,
                api_key=config["api_key"],
                base_url=config["base_url"],
                model=config["model"],
                max_tokens=config["max_tokens"],
                timeout=config["timeout"],
            )
        except Exception as e:
            logger.warning(
                "[ScrapeOCRT] OCR failed for source %s UPC %s: %s",
                getattr(sr, "sourceSlug", "?"),
                upc,
                e,
            )
            summary["sources_ocr_failed"] += 1
            summary["errors"].append(f"OCR failed for {getattr(sr, 'sourceSlug', '?')}: {e}")
            continue

        if not ocr_text or not ocr_text.strip():
            logger.info(
                "[ScrapeOCRT] OCR returned empty text for source %s UPC %s",
                getattr(sr, "sourceSlug", "?"),
                upc,
            )
            summary["sources_ocr_failed"] += 1
            continue

        summary["sources_ocr_succeeded"] += 1

        # Write image_text into source product evidence
        if not product.evidence:
            try:
                from scrapers.ai_search.enrichment_models import EvidenceData
                product.evidence = EvidenceData()
            except ImportError:
                product.evidence = type("EvidenceData", (), {
                    "image_text": None, "source_urls": [],
                    "selected_images": [], "extraction_notes": None,
                })()

        product.evidence.image_text = ocr_text.strip()
        logger.info(
            "[ScrapeOCRT] OCR text written to source %s UPC %s (%d chars)",
            getattr(sr, "sourceSlug", "?"),
            upc,
            len(ocr_text.strip()),
        )

        # Track best image_text for top-level product
        if best_image_text is None:
            best_image_text = ocr_text.strip()

    # Write best image_text to top-level product evidence
    if best_image_text:
        top_product = getattr(enrichment_result, "product", None)
        if top_product:
            if not top_product.evidence:
                try:
                    from scrapers.ai_search.enrichment_models import EvidenceData
                    top_product.evidence = EvidenceData()
                except ImportError:
                    top_product.evidence = type("EvidenceData", (), {
                        "image_text": None, "source_urls": [],
                        "selected_images": [], "extraction_notes": None,
                    })()
            top_product.evidence.image_text = best_image_text

    return summary
