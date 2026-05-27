"""Product media selection — score, canonicalize, and reject non-product images.

This module receives structured image candidates from Crawl4AI (``result.media["images"]``)
plus JSON-LD image URLs, and returns a curated selection with role assignment.

Key behaviors:

- Canonicalize image URLs by stripping width/height/crop/fit/q params
- Score images for product relevance using domain, path, alt text, and dimensions
- Hard-block forbidden domains (Unsplash, etc.)
- Soft-block known external CDNs (Replo, etc.) unless product evidence is strong
- Reject obvious non-product assets (recycle, transparency-map, logo, footer, etc.)
- Assign primary / gallery / rejected roles
- Return selection stats (raw count, canonical count, approved count, duplicate ratio)

Usage::

    selector = ProductMediaSelector(
        expected_product_name="GoodGut Harvest Chicken Dog Kibble",
        expected_brand="Open Farm",
        expected_flavor_tokens=["Chicken"],
    )
    result = selector.select(
        crawl_media_images=crawl_result["media"]["images"],
        jsonld_images=jsonld_result.get("images", []),
        source_url="https://openfarmpet.com/products/...",
    )
    approved_urls = [result["primary_image"]["src"]] + [img["src"] for img in result["gallery_images"]]
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode, urljoin


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Hard-blocked — never accept images from these domains
BLOCKED_IMAGE_DOMAINS: set[str] = {"images.unsplash.com"}

# Soft-blocked — penalize heavily but don't hard-block
# (may contain real product images on some sites)
SOFT_BLOCKED_DOMAINS: set[str] = {"assets.replocdn.com"}

# Allowed CDN domains per known site
ALLOWED_CDN_DOMAINS_BY_SITE: dict[str, set[str]] = {
    "openfarmpet.com": {"openfarmpet.com", "cdn.shopify.com"},
    "scotts.com": {"scotts.com", "smg.widen.net"},
    "scottsmiraclegro.com": {"scottsmiraclegro.com", "smg.widen.net"},
    "miraclegro.com": {"miraclegro.com", "smg.widen.net"},
}

# Path/alt hints that indicate non-product assets
NON_PRODUCT_PATH_HINTS: set[str] = {
    "recycle", "transparency-map", "promise", "lifestyle",
    "logo", "icon", "footer", "social", "badge",
}

# Path/alt hints that indicate product-relevant images
PRODUCT_PATH_HINTS: set[str] = {
    "hero", "front", "back", "topdown", "pdp",
    "product", "render", "packaging", "gallery",
}

# Common flavor/protein tokens (used for cross-flavor detection)
COMMON_FLAVOR_TOKENS: set[str] = {
    "chicken", "beef", "salmon", "turkey", "lamb", "duck",
    "pork", "venison", "fish", "bison", "rabbit", "kangaroo",
    "whitefish", "tuna", "mackerel", "sardine", "herring",
}

# Query params to strip during canonicalization
_STRIP_QUERY_PARAMS: set[str] = {
    "width", "height", "crop", "fit", "auto", "q", "quality",
    "ixlib", "ixid", "w", "h",
}

# Query params to preserve during canonicalization
_KEEP_QUERY_PARAMS: set[str] = {"v"}

# Path-based size pattern (e.g., -100x100 or -600x600)
_PATH_SIZE_PATTERN = re.compile(r"-\d+x\d+(?=\.[a-z]{3,4}$)", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Typed result shapes
# ---------------------------------------------------------------------------


@dataclass
class SelectedImage:
    """A single selected or rejected image with provenance."""

    src: str
    canonical_src: str
    alt: str
    score: float
    role: str  # "primary", "gallery", or "rejected"
    reasons: list[str] = field(default_factory=list)


@dataclass
class MediaSelectionStats:
    """Aggregate statistics about the media selection process."""

    raw_count: int = 0
    canonical_count: int = 0
    approved_count: int = 0
    rejected_count: int = 0
    duplicate_ratio: float = 0.0


@dataclass
class MediaSelectionResult:
    """Final result of media selection."""

    primary_image: SelectedImage | None = None
    gallery_images: list[SelectedImage] = field(default_factory=list)
    rejected_images: list[SelectedImage] = field(default_factory=list)
    stats: MediaSelectionStats = field(default_factory=MediaSelectionStats)

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-compatible dict."""
        return {
            "primary_image": self._img_to_dict(self.primary_image) if self.primary_image else None,
            "gallery_images": [self._img_to_dict(img) for img in self.gallery_images],
            "rejected_images": [self._img_to_dict(img) for img in self.rejected_images],
            "stats": {
                "raw_count": self.stats.raw_count,
                "canonical_count": self.stats.canonical_count,
                "approved_count": self.stats.approved_count,
                "rejected_count": self.stats.rejected_count,
                "duplicate_ratio": self.stats.duplicate_ratio,
            },
        }

    @staticmethod
    def _img_to_dict(img: SelectedImage) -> dict[str, Any]:
        return {
            "src": img.src,
            "canonical_src": img.canonical_src,
            "alt": img.alt,
            "score": img.score,
            "role": img.role,
            "reasons": img.reasons,
        }


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def source_domain_from_url(url: str) -> str:
    """Extract the lowercase hostname (without www.) from a URL."""
    try:
        hostname = urlparse(url).hostname or ""
    except Exception:
        return ""
    hostname = hostname.lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname


def _resolve_url(value: str, source_url: str = "") -> str | None:
    """Resolve a candidate image URL to an absolute https URL.

    Handles protocol-relative URLs, relative paths, and data URIs.
    Returns None for invalid or non-http/https URLs.
    """
    raw = str(value or "").strip()
    if not raw:
        return None

    # Data URIs are not product images
    if raw.startswith("data:"):
        return None

    # Protocol-relative
    if raw.startswith("//"):
        resolved = f"https:{raw}"
    elif raw.startswith("/"):
        if not source_url:
            return None
        resolved = urljoin(source_url, raw)
    else:
        resolved = raw

    try:
        parsed = urlparse(resolved)
    except Exception:
        return None

    if parsed.scheme not in {"http", "https"}:
        return None

    return resolved


# ---------------------------------------------------------------------------
# HTML image candidate extraction
# ---------------------------------------------------------------------------


def _extract_html_image_candidates(html: str, source_url: str) -> list[dict[str, Any]]:
    """Extract image URLs from raw HTML as candidate dicts.

    Collects from:
    - Meta tags: og:image, twitter:image
    - Images: img src, data-src, data-original, data-lazy-src
    - srcset values from img and picture source elements

    Returns list of dicts with keys: src, alt, crawl_score (default 5).
    """
    candidates: list[dict[str, Any]] = []
    seen_src: set[str] = set()

    # 1. Meta tags
    meta_patterns = [
        (r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)""", "og:image"),
        (r"""<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)""", "twitter:image"),
    ]
    for pattern, label in meta_patterns:
        for match in re.finditer(pattern, html, re.IGNORECASE):
            resolved = _resolve_url(match.group(1), source_url)
            if resolved and resolved not in seen_src:
                seen_src.add(resolved)
                candidates.append({"src": resolved, "alt": label, "crawl_score": 5, "width": None, "height": None, "group_id": -2})

    # 2. Image src attributes (and lazy-load variants)
    src_attrs = ["src", "data-src", "data-original", "data-lazy-src", "data-srcset"]
    img_patterns = []
    for attr in src_attrs:
        img_patterns.append(re.compile(
            rf"""<img[^>]+{re.escape(attr)}=["']([^"']+)["']""",
            re.IGNORECASE
        ))

    for pattern in img_patterns:
        for match in pattern.finditer(html):
            resolved = _resolve_url(match.group(1), source_url)
            if not resolved or resolved in seen_src:
                continue
            # Extract alt text from the same img tag
            tag_start = max(0, match.start() - 50)
            tag_end = min(len(html), match.end() + 200)
            tag_html = html[tag_start:tag_end]
            alt_match = re.search(r"""alt=["']([^"']*)["']""", tag_html, re.IGNORECASE)
            alt_text = alt_match.group(1).strip() if alt_match else ""

            # Filter out tracking pixels, favicons, spacers
            path = urlparse(resolved).path.lower()
            if any(hint in path for hint in ("favicon", "pixel", "spacer", "1x1", "blank")):
                continue

            seen_src.add(resolved)
            candidates.append({"src": resolved, "alt": alt_text, "crawl_score": 5, "width": None, "height": None, "group_id": -2})

    # 3. srcset from img and picture source elements
    srcset_patterns = [
        re.compile(r"""<img[^>]+srcset=["']([^"']+)["']""", re.IGNORECASE),
        re.compile(r"""<source[^>]+srcset=["']([^"']+)["']""", re.IGNORECASE),
    ]
    for pattern in srcset_patterns:
        for match in pattern.finditer(html):
            srcset_value = match.group(1)
            # Parse srcset: "url 1x, url 2x" or "url 100w, url 200w"
            entries = re.split(r',\s*', srcset_value)
            for entry in entries:
                entry = entry.strip()
                if not entry:
                    continue
                parts = entry.split()
                if not parts:
                    continue
                resolved = _resolve_url(parts[0], source_url)
                if resolved and resolved not in seen_src:
                    seen_src.add(resolved)
                    candidates.append({"src": resolved, "alt": "", "crawl_score": 5, "width": None, "height": None, "group_id": -2})

    return candidates


def canonicalize_image_url(url: str) -> str:
    """Canonicalize an image URL by stripping size/crop query params.

    Removes: width, height, crop, fit, auto, q, quality, ixlib, ixid, w, h
    Preserves: v (Shopify version), and all other unknown params.
    Lowercases hostname.

    Args:
        url: A full http/https image URL.

    Returns:
        Canonical URL with size params stripped.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return url

    # Normalize netloc
    netloc = parsed.netloc.lower()

    # Filter query params
    query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
    kept: list[tuple[str, str]] = []
    for key, val in query_pairs:
        key_lower = key.lower()
        if key_lower in _STRIP_QUERY_PARAMS:
            continue
        kept.append((key, val))

    # Normalize path (remove trailing slash for consistency)
    path = parsed.path.rstrip("/") or "/"

    # Strip path-based size patterns (e.g., -100x100)
    path = _PATH_SIZE_PATTERN.sub("", path)

    new_query = urlencode(sorted(kept))
    return urlunparse((parsed.scheme, netloc, path, "", new_query, ""))


# ---------------------------------------------------------------------------
# Cross-flavor detection
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    """Normalize text for comparison."""
    return " ".join(text.strip().split()).lower()


def detect_cross_flavor(
    image_text: str,
    expected_flavor_tokens: list[str],
) -> list[str]:
    """Detect mention of a flavor different from the expected one.

    Args:
        image_text: Concatenated alt + desc + src from the image.
        expected_flavor_tokens: List of expected flavor tokens (e.g. ["Chicken"]).

    Returns:
        List of foreign flavor tokens found, or empty list.
    """
    if not expected_flavor_tokens:
        return []

    normalized_text = _normalize(image_text)
    expected_norm = {_normalize(t) for t in expected_flavor_tokens}

    foreign_tokens: list[str] = []
    for token in COMMON_FLAVOR_TOKENS:
        if token in expected_norm:
            continue  # Expected — not foreign
        if token in normalized_text:
            foreign_tokens.append(token)

    return foreign_tokens


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def _score_image(
    *,
    src: str,
    canonical_src: str,
    alt: str,
    desc: str,
    crawl_score: int | float,
    width: int | None,
    height: int | None,
    source_domain: str,
    expected_product_name: str | None,
    expected_brand: str | None,
    expected_flavor_tokens: list[str] | None,
    allowed_cdn_domains: set[str] | None,
    blocked_image_domains: set[str] | None = None,
    soft_blocked_domains: set[str] | None = None,
) -> tuple[float, list[str]]:
    """Score an image candidate for product relevance.

    Returns (score, list_of_reasons).
    """
    score = 0.0
    reasons: list[str] = []

    canonical_lower = canonical_src.lower()
    path_lower = urlparse(canonical_src).path.lower()
    combined_text = _normalize(f"{alt} {desc} {src}")

    # ---- Domain checks ----
    domain = source_domain_from_url(src)

    # Resolve block lists (instance overrides or module defaults)
    hard_blocked = blocked_image_domains if blocked_image_domains is not None else BLOCKED_IMAGE_DOMAINS
    soft_blocked = soft_blocked_domains if soft_blocked_domains is not None else SOFT_BLOCKED_DOMAINS

    # Hard-blocked domain
    if domain in hard_blocked:
        return -100.0, ["blocked_domain"]

    # Soft-blocked domain
    if domain in soft_blocked:
        score -= 20.0
        reasons.append("soft_blocked_domain")

    # Source domain or allowed CDN
    allowed_domains: set[str] = set()
    if allowed_cdn_domains:
        allowed_domains = allowed_cdn_domains
    elif source_domain:
        # Default: allow source domain and common Shopify CDN
        allowed_domains = {source_domain, "cdn.shopify.com"}

    if domain in allowed_domains or domain == source_domain:
        score += 5.0
        reasons.append("allowed_domain")

    # Unknown external domain
    if domain and domain not in allowed_domains and domain not in hard_blocked and domain not in soft_blocked:
        if domain != source_domain:
            score -= 5.0
            reasons.append("unknown_external_domain")

    # ---- Product name tokens in image metadata ----
    if expected_product_name:
        name_tokens = [
            t for t in _normalize(expected_product_name).split()
            if len(t) > 2  # Skip short tokens (a, an, the, lb, oz, etc.)
        ]
        name_score = 0.0
        tokens_found = 0
        for token in name_tokens:
            if token in combined_text or token in canonical_lower:
                name_score += 4.0
                tokens_found += 1
        capped_name = min(name_score, 12.0)
        if capped_name > 0:
            score += capped_name
            reasons.append(f"name_token_match:{tokens_found}")

    # ---- Brand token ----
    if expected_brand:
        brand_norm = _normalize(expected_brand)
        if brand_norm and (
            brand_norm in combined_text or brand_norm in canonical_lower
        ):
            score += 3.0
            reasons.append("brand_token_match")

    # ---- Product path hints ----
    for hint in PRODUCT_PATH_HINTS:
        if hint in path_lower or hint in _normalize(alt):
            score += 3.0
            reasons.append(f"product_hint:{hint}")

    # ---- Non-product path hints (triggers hard rejection via reason tag) ----
    for hint in NON_PRODUCT_PATH_HINTS:
        if hint in path_lower or hint in _normalize(alt):
            score -= 20.0
            reasons.append(f"non_product_hint:{hint}")

    # ---- Crawl4AI score ----
    try:
        c4_score = float(crawl_score)
    except (ValueError, TypeError):
        c4_score = 0.0

    if c4_score > 0:
        c4_bonus = min(c4_score * 2.0, 10.0)
        score += c4_bonus
        if c4_bonus > 3:
            reasons.append(f"crawl_score:{c4_score}")
    else:
        score -= 3.0
        reasons.append("low_crawl_score")

    # ---- Dimensions ----
    try:
        w = int(width) if width is not None else 0
        h = int(height) if height is not None else 0
    except (ValueError, TypeError):
        w = 0
        h = 0

    if w > 0 and h > 0:
        if w > 600 and h > 600:
            score += 3.0
            reasons.append("large_dimensions")
        elif w > 200 and h > 200:
            score += 1.0
            reasons.append("medium_dimensions")
        if w < 50 and h < 50:
            score -= 15.0
            reasons.append("tiny_dimensions")

    # ---- Cross-flavor detection ----
    if expected_flavor_tokens:
        foreign = detect_cross_flavor(combined_text, expected_flavor_tokens)
        if foreign:
            penalty = -8.0 * len(foreign)
            score += penalty
            reasons.append(f"cross_flavor:{','.join(foreign)}")

    # ---- PLP/cross-sell hints ----
    plp_hints = {"plp", "collection", "related", "you may also", "customers also bought"}
    for hint in plp_hints:
        if hint in combined_text or hint in path_lower:
            score -= 6.0
            reasons.append(f"cross_sell_hint:{hint}")
            break  # Only penalize once

    return round(score, 2), reasons


# ---------------------------------------------------------------------------
# ProductMediaSelector
# ---------------------------------------------------------------------------


class ProductMediaSelector:
    """Score, canonicalize, and reject non-product images.

    Args:
        blocked_domains: Additional hard-blocked domains (merged with defaults).
        soft_blocked_domains: Additional soft-blocked domains (merged with defaults).
        allowed_cdn_domains: Override allowed CDN domains per source domain.
            If provided, used exactly. Default uses ``ALLOWED_CDN_DOMAINS_BY_SITE``.
        expected_product_name: Product name for token matching.
        expected_brand: Brand name for token matching.
        expected_flavor_tokens: Expected flavor/protein tokens (e.g. ["Chicken"]).
        max_images: Maximum number of approved images (default 12).
            Excess images above this limit are moved to rejected with reason
            ``over_max_images``.
        min_score: Minimum score threshold for approved candidates (default 8.0).
            Candidates below this threshold are moved to rejected with reason
            ``below_min_score``.
    """

    def __init__(
        self,
        blocked_domains: set[str] | None = None,
        soft_blocked_domains: set[str] | None = None,
        allowed_cdn_domains: set[str] | None = None,
        expected_product_name: str | None = None,
        expected_brand: str | None = None,
        expected_flavor_tokens: list[str] | None = None,
        max_images: int = 12,
        min_score: float = 8.0,
    ):
        self._blocked_domains = BLOCKED_IMAGE_DOMAINS | (blocked_domains or set())
        self._soft_blocked = SOFT_BLOCKED_DOMAINS | (soft_blocked_domains or set())
        self._expected_product_name = expected_product_name
        self._expected_brand = expected_brand
        self._expected_flavor_tokens = expected_flavor_tokens or []

        self._max_images = max_images
        self._min_score = min_score

        # Per-source allowed CDN domains
        if allowed_cdn_domains is not None:
            self._allowed_domains: set[str] | None = allowed_cdn_domains
        else:
            self._allowed_domains = None  # Will be resolved per-source

    def _resolve_allowed_domains(self, source_domain: str) -> set[str]:
        """Resolve allowed CDN domains for a given source domain."""
        if self._allowed_domains is not None:
            return self._allowed_domains
        return ALLOWED_CDN_DOMAINS_BY_SITE.get(source_domain, {source_domain, "cdn.shopify.com"})

    def select(
        self,
        crawl_media_images: list[dict[str, Any]],
        jsonld_images: list[str],
        source_url: str,
        page_html: str = "",
    ) -> MediaSelectionResult:
        """Score, canonicalize, and select product images.

        Args:
            crawl_media_images: ``result.media["images"]`` from Crawl4AI.
                Each dict has keys: src, alt, desc, score, width, height, type, group_id.
            jsonld_images: List of image URLs extracted from JSON-LD.
            source_url: Page URL (for domain detection).
            page_html: Optional raw HTML (unused but reserved for future DOM-position scoring).

        Returns:
            ``MediaSelectionResult`` with primary, gallery, rejected images and stats.
        """
        source_domain = source_domain_from_url(source_url)
        allowed_domains = self._resolve_allowed_domains(source_domain)

        # ---- Step 1: Collect raw candidates ----
        raw_candidates: list[dict[str, Any]] = []

        # From Crawl4AI media
        for img_obj in crawl_media_images:
            if not isinstance(img_obj, dict):
                continue
            src = str(img_obj.get("src") or "").strip()
            if not src:
                continue
            raw_candidates.append({
                "src": src,
                "alt": str(img_obj.get("alt") or "").strip(),
                "desc": str(img_obj.get("desc") or "").strip(),
                "crawl_score": img_obj.get("score", 0),
                "width": img_obj.get("width"),
                "height": img_obj.get("height"),
                "group_id": img_obj.get("group_id", 0),
            })

        # From JSON-LD
        seen_src: set[str] = set()
        for img_url in jsonld_images:
            resolved = _resolve_url(str(img_url).strip(), source_url)
            if not resolved:
                continue
            # Avoid duplicates with crawl media
            if resolved in seen_src:
                continue
            seen_src.add(resolved)
            raw_candidates.append({
                "src": resolved,
                "alt": "",
                "desc": "",
                "crawl_score": 5,  # JSON-LD images get a default positive score
                "width": None,
                "height": None,
                "group_id": -1,
            })

        # From raw HTML (og:image, img src, data-src, srcset, etc.)
        if page_html and isinstance(page_html, str) and len(page_html) > 100:
            html_candidates = _extract_html_image_candidates(page_html, source_url)
            for hc in html_candidates:
                if hc["src"] in seen_src:
                    continue
                seen_src.add(hc["src"])
                raw_candidates.append({
                    "src": hc["src"],
                    "alt": hc.get("alt", ""),
                    "desc": "",
                    "crawl_score": hc.get("crawl_score", 5),
                    "width": hc.get("width"),
                    "height": hc.get("height"),
                    "group_id": -2,
                })

        raw_count = len(raw_candidates)

        # ---- Step 2: Normalize URLs ----
        normalized: list[dict[str, Any]] = []
        for c in raw_candidates:
            resolved = _resolve_url(c["src"], source_url)
            if not resolved:
                continue
            c["src"] = resolved
            normalized.append(c)

        # ---- Step 3: Canonicalize and group ----
        canonical_groups: dict[str, list[dict[str, Any]]] = {}
        for c in normalized:
            can = canonicalize_image_url(c["src"])
            if can not in canonical_groups:
                canonical_groups[can] = []
            canonical_groups[can].append(c)

        canonical_count = len(canonical_groups)
        duplicate_ratio = 0.0
        if raw_count > 1 and canonical_count > 0:
            duplicate_ratio = round(1.0 - (canonical_count / raw_count), 4)

        # ---- Step 4: Score each canonical group ----
        scored: list[tuple[float, str, list[str], dict[str, Any]]] = []  # (score, canonical_url, reasons, best_candidate)

        for can_url, candidates in canonical_groups.items():
            best_score = float("-inf")
            best_reasons: list[str] = []
            best_candidate: dict[str, Any] | None = None

            for c in candidates:
                s, reasons = _score_image(
                    src=c["src"],
                    canonical_src=can_url,
                    alt=c.get("alt", ""),
                    desc=c.get("desc", ""),
                    crawl_score=c.get("crawl_score", 0),
                    width=c.get("width"),
                    height=c.get("height"),
                    source_domain=source_domain,
                    expected_product_name=self._expected_product_name,
                    expected_brand=self._expected_brand,
                    expected_flavor_tokens=self._expected_flavor_tokens,
                    allowed_cdn_domains=allowed_domains,
                    blocked_image_domains=self._blocked_domains,
                    soft_blocked_domains=self._soft_blocked,
                )
                if s > best_score or (s == best_score and best_candidate is None):
                    best_score = s
                    best_reasons = reasons
                    best_candidate = c

            if best_candidate is not None:
                scored.append((best_score, can_url, best_reasons, best_candidate))

        # ---- Step 5: Sort by score descending ----
        scored.sort(key=lambda x: x[0], reverse=True)

        # ---- Step 6: Classify ----
        approved: list[tuple[float, str, list[str], dict[str, Any]]] = []
        rejected: list[tuple[float, str, list[str], dict[str, Any]]] = []

        for s, can_url, reasons, candidate in scored:
            # Hard reject: non_product_hint in reasons (logo, recycle, etc.)
            has_non_product = any(r.startswith("non_product_hint:") for r in reasons)
            if s < 0 or has_non_product:
                rejected.append((s, can_url, reasons, candidate))
            else:
                approved.append((s, can_url, reasons, candidate))

        # ---- Step 7: Apply threshold and cap ----
        approved.sort(key=lambda x: x[0], reverse=True)

        # Apply min_score threshold
        below_min: list[tuple[float, str, list[str], dict[str, Any]]] = []
        kept_approved: list[tuple[float, str, list[str], dict[str, Any]]] = []
        for item in approved:
            if item[0] < self._min_score:
                below_min.append(item)
            else:
                kept_approved.append(item)

        for item in below_min:
            s, can_url, reasons, candidate = item
            reject_reasons = list(reasons)
            reject_reasons.append("below_min_score")
            rejected.append((s, can_url, reject_reasons, candidate))

        approved = kept_approved

        # Apply max_images cap
        if len(approved) > self._max_images:
            overflow = approved[self._max_images:]
            approved = approved[:self._max_images]
            for item in overflow:
                s, can_url, reasons, candidate = item
                reject_reasons = list(reasons)
                reject_reasons.append("over_max_images")
                rejected.append((s, can_url, reject_reasons, candidate))

        # ---- Step 8: Assign roles ----
        primary_image: SelectedImage | None = None
        gallery_images: list[SelectedImage] = []

        for idx, (s, can_url, reasons, candidate) in enumerate(approved):
            img = SelectedImage(
                src=candidate["src"],
                canonical_src=can_url,
                alt=candidate.get("alt", ""),
                score=s,
                role="primary" if idx == 0 else "gallery",
                reasons=reasons,
            )
            if idx == 0:
                primary_image = img
            else:
                gallery_images.append(img)

        rejected_images: list[SelectedImage] = []
        for s, can_url, reasons, candidate in rejected:
            rejected_images.append(
                SelectedImage(
                    src=candidate["src"],
                    canonical_src=can_url,
                    alt=candidate.get("alt", ""),
                    score=s,
                    role="rejected",
                    reasons=reasons,
                )
            )

        return MediaSelectionResult(
            primary_image=primary_image,
            gallery_images=gallery_images,
            rejected_images=rejected_images,
            stats=MediaSelectionStats(
                raw_count=raw_count,
                canonical_count=canonical_count,
                approved_count=len(approved),
                rejected_count=len(rejected),
                duplicate_ratio=duplicate_ratio,
            ),
        )


__all__ = [
    "ProductMediaSelector",
    "MediaSelectionResult",
    "MediaSelectionStats",
    "SelectedImage",
    "BLOCKED_IMAGE_DOMAINS",
    "SOFT_BLOCKED_DOMAINS",
    "ALLOWED_CDN_DOMAINS_BY_SITE",
    "NON_PRODUCT_PATH_HINTS",
    "PRODUCT_PATH_HINTS",
    "canonicalize_image_url",
    "source_domain_from_url",
    "detect_cross_flavor",
]
