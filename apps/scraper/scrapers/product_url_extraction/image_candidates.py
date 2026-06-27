"""Image Candidate builder — transforms crawl results into structured ImageCandidate objects.

Reusable module called by both PDP seed verification and future product enrichment.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Any

from scrapers.product_url_extraction.media_selector import (
    ProductMediaSelector,
    canonicalize_image_url,
    _resolve_url,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


@dataclass
class ImageCandidate:
    """Normalized image candidate with provenance metadata."""

    url: str  # Resolved absolute URL
    canonical_url: str  # Canonicalized URL (stripped size/crop params)
    source_url: str  # Page URL where found
    source_type: str  # "dom_image", "srcset", "jsonld", "opengraph", "twitter", "schema"
    dom_selector: str | None = None  # CSS selector or XPath hint
    alt_text: str | None = None  # Alt attribute
    nearby_text: str | None = None  # Snippet of surrounding text
    width: int | None = None
    height: int | None = None
    score: float = 0.0  # Crawl4AI heuristic score (0–10ish)
    gallery_context: bool = False  # Inside carousel/gallery container
    non_product_context: bool = False  # Inside related-products/footer
    duplicate_context: bool = False  # Cloned slide in JS carousel
    source_attr: str | None = None  # HTML attribute name: "src", "data-src", "srcset", "href", "og:image"
    selection_role: str | None = None  # "primary", "gallery", or "rejected" (populated after selection)
    rejection_reasons: list[str] = field(default_factory=list)  # Why the candidate was rejected

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-compatible dict."""
        d = {}
        for k, v in asdict(self).items():
            # Skip None values; include empty list for rejection_reasons
            if v is None:
                continue
            d[k] = v
        return d


@dataclass
class ImageCandidateSelection:
    """Result of selecting image candidates via ProductMediaSelector."""

    primary: ImageCandidate | None = None
    gallery: list[ImageCandidate] = field(default_factory=list)
    rejected: list[ImageCandidate] = field(default_factory=list)
    stats: dict[str, Any] = field(default_factory=lambda: {
        "raw_count": 0,
        "canonical_count": 0,
        "approved_count": 0,
        "rejected_count": 0,
        "duplicate_ratio": 0.0,
    })


# ---------------------------------------------------------------------------
# HTML JSON-LD extraction
# ---------------------------------------------------------------------------


def _extract_jsonld_images(html: str, source_url: str) -> list[dict[str, Any]]:
    """Extract image URLs from JSON-LD product schemas in HTML.

    Looks for ``@type: Product``, ``@type: ProductGroup``, or
    ``@type: ItemPage`` blocks. Returns list of image info dicts.
    """
    images: list[dict[str, Any]] = []
    if not html:
        return images

    # Find all JSON-LD script blocks
    script_pattern = re.compile(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        re.DOTALL | re.IGNORECASE,
    )

    for script_match in script_pattern.finditer(html):
        raw_json = script_match.group(1).strip()
        try:
            data = json.loads(raw_json)
        except (json.JSONDecodeError, ValueError):
            continue

        # Handle both single objects and @graph arrays
        items: list[dict[str, Any]] = []
        if isinstance(data, dict):
            if "@graph" in data and isinstance(data["@graph"], list):
                items = data["@graph"]
            else:
                items = [data]
        elif isinstance(data, list):
            items = data
        else:
            continue

        for item in items:
            if not isinstance(item, dict):
                continue

            # Normalize @type which can be a string or a list of strings
            raw_type = item.get("@type") or ""
            if isinstance(raw_type, str):
                type_values = [raw_type]
            elif isinstance(raw_type, list):
                type_values = [t for t in raw_type if isinstance(t, str)]
            else:
                continue
            type_lower = {t.lower() for t in type_values}
            if not type_lower & {"product", "productgroup", "itempage"}:
                continue
            matched_type = next(t for t in type_lower if t in {"product", "productgroup", "itempage"})

            # Direct image field
            image_field = item.get("image")
            _collect_jsonld_images(image_field, source_url, images, matched_type)

            # Image from offers (merchant return policy, etc.)
            offers = item.get("offers")
            if isinstance(offers, dict):
                _collect_jsonld_images(offers.get("image"), source_url, images, matched_type)

    return images


def _collect_jsonld_images(
    image_field: Any,
    source_url: str,
    images: list[dict[str, Any]],
    item_type: str,
):
    """Collect image URLs from a JSON-LD image field (string, list, or object)."""
    if isinstance(image_field, str):
        resolved = _resolve_url(image_field, source_url)
        if resolved:
            images.append({
                "src": resolved,
                "alt": "",
                "score": 8,
                "source_type": "jsonld",
            })
    elif isinstance(image_field, list):
        for img_item in image_field:
            if isinstance(img_item, str):
                resolved = _resolve_url(img_item, source_url)
                if resolved:
                    images.append({
                        "src": resolved,
                        "alt": "",
                        "score": 8,
                        "source_type": "jsonld",
                    })
            elif isinstance(img_item, dict):
                img_url = img_item.get("url") or img_item.get("contentUrl") or img_item.get("image") or ""
                resolved = _resolve_url(str(img_url), source_url)
                if resolved:
                    images.append({
                        "src": resolved,
                        "alt": img_item.get("name", ""),
                        "score": 8,
                        "source_type": "jsonld",
                    })


# ---------------------------------------------------------------------------
# OG/Twitter meta extraction
# ---------------------------------------------------------------------------


def _extract_meta_images(html: str, source_url: str) -> list[dict[str, Any]]:
    """Extract image URLs from OpenGraph and Twitter meta tags."""
    images: list[dict[str, Any]] = []
    if not html:
        return images

    # og:image
    for match in re.finditer(
        r'<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']',
        html, re.IGNORECASE,
    ):
        resolved = _resolve_url(match.group(1), source_url)
        if resolved:
            images.append({
                "src": resolved,
                "alt": "og:image",
                "score": 6,
                "source_type": "opengraph",
            })

    # twitter:image
    for match in re.finditer(
        r'<meta[^>]*(?:name|property)=["\']twitter:image["\'][^>]*content=["\']([^"\']+)["\']',
        html, re.IGNORECASE,
    ):
        resolved = _resolve_url(match.group(1), source_url)
        if resolved:
            images.append({
                "src": resolved,
                "alt": "twitter:image",
                "score": 5,
                "source_type": "twitter",
            })

    return images


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------


def build_image_candidates(
    crawl_result: dict[str, Any],
    source_url: str,
    page_html: str | None = None,
) -> list[ImageCandidate]:
    """Build structured ImageCandidate list from a Crawl4AI crawl result.

    Extracts candidates from:
    1. ``crawl_result["media"]["images"]`` — Crawl4AI's detected images
    2. JSON-LD Product schema images parsed from HTML
    3. OpenGraph/Twitter meta image tags
    4. DOM ``<img>``, ``data-src``, ``srcset`` attributes from raw HTML

    Deduplicates by canonical URL.

    Args:
        crawl_result: Normalized Crawl4AI crawl result dict.
        source_url: The original page URL (for URL resolution).
        page_html: Optional raw page HTML. Falls back to crawl_result HTML.

    Returns:
        List of deduplicated ``ImageCandidate`` objects.
    """
    seen_canonical: set[str] = set()
    candidates: list[ImageCandidate] = []

    html = page_html or crawl_result.get("html") or crawl_result.get("cleaned_html") or ""

    # 1. Crawl4AI media.images
    media_images = crawl_result.get("media", {}).get("images", []) if isinstance(crawl_result.get("media"), dict) else []
    if isinstance(media_images, list):
        for img in media_images:
            if not isinstance(img, dict):
                continue
            src = str(img.get("src") or "").strip()
            if not src:
                continue
            resolved = _resolve_url(src, source_url)
            if not resolved:
                continue
            canonical = canonicalize_image_url(resolved)
            if canonical in seen_canonical:
                continue
            seen_canonical.add(canonical)

            alt = str(img.get("alt") or "").strip()
            width = img.get("width")
            height = img.get("height")
            score = float(img.get("score") or 0)
            group_id = img.get("group_id")

            # Determine gallery/non-product context from group_id
            # group_id -1 = JSON-LD, group_id -2 = HTML-extracted
            gallery_context = isinstance(group_id, (int, float)) and group_id >= 0
            duplicate_context = False
            non_product_context = False

            candidates.append(ImageCandidate(
                url=resolved,
                canonical_url=canonical,
                source_url=source_url,
                source_type="dom_image",
                alt_text=alt if alt else None,
                width=width if isinstance(width, (int, float)) else None,
                height=height if isinstance(height, (int, float)) else None,
                score=score,
                gallery_context=gallery_context,
                non_product_context=non_product_context,
                duplicate_context=duplicate_context,
                source_attr="src",
            ))

    # 2. JSON-LD images
    jsonld_images = _extract_jsonld_images(html, source_url)
    for img in jsonld_images:
        src = img["src"]
        canonical = canonicalize_image_url(src)
        if canonical in seen_canonical:
            continue
        seen_canonical.add(canonical)
        candidates.append(ImageCandidate(
            url=src,
            canonical_url=canonical,
            source_url=source_url,
            source_type=img.get("source_type", "jsonld"),
            alt_text=img.get("alt") or None,
            score=float(img.get("score", 8)),
            source_attr="jsonld",
        ))

    # 3. OG/Twitter meta images
    meta_images = _extract_meta_images(html, source_url)
    for img in meta_images:
        src = img["src"]
        canonical = canonicalize_image_url(src)
        if canonical in seen_canonical:
            continue
        seen_canonical.add(canonical)
        candidates.append(ImageCandidate(
            url=src,
            canonical_url=canonical,
            source_url=source_url,
            source_type=img["source_type"],
            alt_text=img.get("alt") or None,
            score=float(img.get("score", 6)),
            source_attr=f"meta[{img['source_type']}]",
        ))

    # 4. DOM img / srcset from HTML (reuse media_selector's parser)
    # The media_selector._extract_html_image_candidates already extracts from
    # <img>, <source>, data-src, srcset, and <a> links to images.
    # We import and use it here to avoid recoding the HTML parser.
    if html and len(html) > 100:
        dom_candidates = _extract_html_image_candidates_caller(html, source_url)
        for dc in dom_candidates:
            src = dc["src"]
            canonical = canonicalize_image_url(src)
            if canonical in seen_canonical:
                continue
            seen_canonical.add(canonical)
            candidates.append(ImageCandidate(
                url=src,
                canonical_url=canonical,
                source_url=source_url,
                source_type="dom_image",
                dom_selector=dc.get("desc") or None,  # source_hint as pseudo-selector
                alt_text=dc.get("alt") or None,
                width=dc.get("width"),
                height=dc.get("height"),
                score=float(dc.get("crawl_score", 5)),
                gallery_context=bool(dc.get("gallery_context")),
                non_product_context=bool(dc.get("non_product_context")),
                duplicate_context=bool(dc.get("duplicate_context")),
                source_attr=dc.get("desc") or None,  # attribute name
            ))

    return candidates


def _extract_html_image_candidates_caller(html: str, source_url: str) -> list[dict[str, Any]]:
    """Wrapper around media_selector._extract_html_image_candidates.

    Reuses the existing HTMLParser-based extraction from media_selector.py
    to avoid code duplication.
    """
    from scrapers.product_url_extraction.media_selector import _extract_html_image_candidates
    return _extract_html_image_candidates(html, source_url)


# ---------------------------------------------------------------------------
# Selector wrapper
# ---------------------------------------------------------------------------


def select_image_candidates(
    candidates: list[ImageCandidate],
    source_url: str,
    product_name: str | None = None,
    brand: str | None = None,
) -> ImageCandidateSelection:
    """Select primary/gallery images from candidates using ProductMediaSelector.

    Wraps ``ProductMediaSelector`` to process ImageCandidate objects.

    Args:
        candidates: List of ``ImageCandidate`` objects.
        source_url: Page URL (for domain detection).
        product_name: Optional expected product name.
        brand: Optional expected brand name.

    Returns:
        ``ImageCandidateSelection`` with primary, gallery, and rejected candidates.
    """
    if not candidates:
        return ImageCandidateSelection(stats={
            "raw_count": 0,
            "canonical_count": 0,
            "approved_count": 0,
            "rejected_count": 0,
            "duplicate_ratio": 0.0,
        })

    # Convert ImageCandidate list to crawl_media_images format, preserving
    # context flags so ProductMediaSelector can use them for scoring.
    crawl_media_images: list[dict[str, Any]] = []
    jsonld_images: list[str] = []
    candidate_by_src: dict[str, ImageCandidate] = {}

    for ic in candidates:
        candidate_by_src[ic.url] = ic
        crawl_media_images.append({
            "src": ic.url,
            "alt": ic.alt_text or "",
            "desc": ic.source_attr or "",
            "score": ic.score,
            "width": ic.width,
            "height": ic.height,
            "type": "image",
            "group_id": 0,  # All treated as generic group
            # Preserve context flags for selector scoring
            "gallery_context": ic.gallery_context,
            "non_product_context": ic.non_product_context,
            "duplicate_context": ic.duplicate_context,
        })
        if ic.source_type == "jsonld":
            jsonld_images.append(ic.url)

    # Build selector
    selector = ProductMediaSelector(
        expected_product_name=product_name,
        expected_brand=brand,
    )

    # Run selection
    selection = selector.select(
        crawl_media_images=crawl_media_images,
        jsonld_images=jsonld_images,
        source_url=source_url,
        page_html="",  # Already extracted into candidates, avoid double-counting
    )

    # Map back to ImageCandidate objects, annotating with role and reasons
    primary: ImageCandidate | None = None
    gallery: list[ImageCandidate] = []
    rejected: list[ImageCandidate] = []

    src_to_candidate = {c.url: c for c in candidates}

    if selection.primary_image and selection.primary_image.src in src_to_candidate:
        primary = src_to_candidate[selection.primary_image.src]
        primary.selection_role = selection.primary_image.role
        primary.rejection_reasons = selection.primary_image.reasons

    for g_img in selection.gallery_images:
        if g_img.src in src_to_candidate:
            c = src_to_candidate[g_img.src]
            c.selection_role = g_img.role
            c.rejection_reasons = g_img.reasons
            gallery.append(c)

    for r_img in selection.rejected_images:
        if r_img.src in src_to_candidate:
            c = src_to_candidate[r_img.src]
            c.selection_role = r_img.role
            c.rejection_reasons = r_img.reasons
            rejected.append(c)

    return ImageCandidateSelection(
        primary=primary,
        gallery=gallery,
        rejected=rejected,
        stats={
            "raw_count": selection.stats.raw_count,
            "canonical_count": selection.stats.canonical_count,
            "approved_count": selection.stats.approved_count,
            "rejected_count": selection.stats.rejected_count,
            "duplicate_ratio": selection.stats.duplicate_ratio,
        },
    )


__all__ = [
    "ImageCandidate",
    "ImageCandidateSelection",
    "build_image_candidates",
    "select_image_candidates",
]
