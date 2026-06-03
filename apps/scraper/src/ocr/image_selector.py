"""Heuristics to select the best product packaging/label images for OCR."""

from urllib.parse import urlparse

# Path/filename hints that indicate non-product or low-value assets
NON_OCR_PATH_HINTS = {
    "logo", "icon", "header", "footer", "nav", "menu", "button", 
    "social", "banner", "loading", "cart", "checkout", "buynow",
    "theme", "svg", "gif", "swatch", "color", "pattern", "placeholder",
    "avatar", "user", "star", "rating", "arrow", "close", "search",
    "marker", "pin", "heart", "share", "thumbs", "100x100", "150x150",
    "50x50", "_thumb", "_sm"
}

# High value keywords that represent packaging/main images
OCR_PATH_HINTS = {
    "front", "pkg", "package", "packaging", "main", "label", "zoom", "large", "full"
}

# Lower value keywords that represent background/lifestyle/extra details
LIFESTYLE_PATH_HINTS = {
    "lifestyle", "hero", "back", "side", "angle", "usage", "detail", "context", "scene"
}

def select_ocr_images(
    image_urls: list[str],
    max_images: int = 1,
    upc: str | None = None,
) -> list[str]:
    """Select the best candidate image(s) for OCR from a list of URLs."""
    if not image_urls:
        return []

    scored_candidates = []

    for idx, url in enumerate(image_urls):
        if not isinstance(url, str) or not url.strip():
            continue

        url_lower = url.lower()
        
        if url_lower.startswith("data:image/"):
            # Data URL is already downloaded / processed
            # Give data URL high priority because it doesn't require fetching
            scored_candidates.append((200 - idx, url))
            continue

        # Parse path to get filename
        try:
            parsed = urlparse(url)
            filename = parsed.path.split("/")[-1].lower()
            path_lower = parsed.path.lower()
        except Exception:
            filename = url_lower
            path_lower = url_lower

        # Skip non-image extensions (like svg, gif)
        if filename.endswith((".svg", ".gif")):
            continue

        # Hard filter: check if any non-ocr hints are in the URL path or filename
        if any(hint in filename or hint in path_lower for hint in NON_OCR_PATH_HINTS):
            continue

        # Calculate score (higher is better)
        # 1. Base score starts with original order penalty to prefer the first image
        score = 100 - (idx * 10)

        # 2. Strong signal if URL contains UPC or SKU
        if upc and upc in filename:
            score += 100

        # 3. Add points for positive hint keywords
        if any(hint in filename for hint in OCR_PATH_HINTS):
            score += 50

        # 4. Penalize lifestyle or details
        if any(hint in filename for hint in LIFESTYLE_PATH_HINTS):
            score -= 60

        scored_candidates.append((score, url))

    # Sort descending by score
    scored_candidates.sort(key=lambda x: x[0], reverse=True)

    # Return top N
    return [url for _, url in scored_candidates[:max_images]]
