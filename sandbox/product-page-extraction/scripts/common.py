#!/usr/bin/env python3
"""Shared helpers for the local official product page discovery sandbox."""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]

# RFC1918 / private / localhost prefix patterns
_PRIVATE_NET_PREFIXES = ("127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168.", "::1", "localhost")

ABBREVIATIONS = {
    "FRM": "fromm",
    "CAT": "cat",
    "DOG": "dog",
    "DCK": "duck",
    "DUK": "duck",
    "LIV": "liver",
    "CHK": "chicken",
    "CHKN": "chicken",
    "SAL": "salmon",
    "TUN": "tuna",
    "PT": "pate",
    "PTE": "pate",
    "CN": "can",
    "BG": "bag",
    "OZ": "oz",
    "LB": "lb",
    "LKVLL": "lake valley seed",
    "LVSEED": "lake valley seed",
}

STOP_TOKENS = {"and", "with", "the", "for", "food", "product", "products"}

# Shared rendered DOM extraction JS used by both Crawl4AI and agent-browser
RENDERED_EVIDENCE_JS = r'''
(() => {
  const absolutize = (value) => {
    try { return value ? new URL(value, location.href).href : null; } catch (e) { return value; }
  };
  const splitSrcset = (value) => String(value || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
  const collectImages = (root) => {
    const urls = new Set();
    const attrs = ["src", "srcset", "data-src", "data-srcset", "data-large", "data-original", "data-zoom", "data-hires"];
    const els = (root || document).querySelectorAll("img, source, [style*=\'background\']");
    for (const el of els) {
      for (const attr of attrs) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        if (attr.includes("srcset")) splitSrcset(value).forEach((u) => urls.add(absolutize(u)));
        else urls.add(absolutize(value));
      }
      const style = el.getAttribute("style") || "";
      const matches = style.matchAll(/url\(["\']?([^"\'\)]+)["\']?\)/g);
      for (const match of matches) urls.add(absolutize(match[1]));
    }
    return Array.from(urls).filter(Boolean);
  };
  const collectProductCards = (root) => {
    const cards = [];
    const selectors = ["article[class*=product]", "[class*=product-card]", ".product-item", "li.product", "div[class*=product]", "[class*=ProductCard]", "[class*=product-tile]", "[data-product-id]", "[data-product-sku]", "[class*=grid-item]"];
    const seenSigs = new Set();
    for (const sel of selectors) {
      const elements = (root || document).querySelectorAll(sel);
      for (const el of elements) {
        const link = el.querySelector("a[href]") || el.closest("a[href]");
        const href = link ? (link.getAttribute("href") || "") : "";
        const titleEl = el.querySelector("h2, h3, h4, .title, .name, [class*=title], [class*=name]");
        const title = titleEl ? titleEl.innerText.trim() : "";
        const dataAttrs = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith("data-")) dataAttrs[attr.name] = attr.value;
        }
        const onclick = link ? (link.getAttribute("onclick") || el.getAttribute("onclick") || "") : "";
        const images = collectImages(el);
        const signature = href.split("?")[0].split("/").filter(Boolean).slice(-3).join("/") + "|" + title.slice(0, 40);
        if ((title || href || images.length > 0) && !seenSigs.has(signature)) {
          seenSigs.add(signature);
          cards.push({ title, href, image_urls: images, onclick, data_attributes: dataAttrs, element_signature: signature });
        }
      }
    }
    return cards.slice(0, 50);
  };
  const allImages = collectImages(null);
  const productCards = collectProductCards(null);
  return JSON.stringify({
    url: location.href,
    title: document.title,
    h1: Array.from(document.querySelectorAll("h1")).map((e) => e.innerText.trim()).filter(Boolean),
    images: allImages,
    textSample: document.body.innerText.replace(/\s+/g, " ").slice(0, 8000),
    productCards: productCards,
    imageCount: allImages.length,
    productCardCount: productCards.length,
  }, null, 2);
})()
'''

# Backward-compatible alias
IMAGE_EXTRACTION_JS = RENDERED_EVIDENCE_JS

def store_js_for_dom(js_code: str) -> str:
    """Wrap JS that returns a JSON string so it stores the result in the DOM."""
    return f"""
(() => {{
  const result = function() {{\n{js_code.rstrip()}\n}}();
  const el = document.createElement('div');
  el.id = '__sandbox_rendered__';
  el.style.display = 'none';
  el.textContent = typeof result === 'string' ? result : JSON.stringify(result);
  document.body.appendChild(el);
  window.__SANDBOX_RENDERED__ = result;
}})();
""".replace('\\n', '\n')

RENDERED_EVIDENCE_STORE_JS = store_js_for_dom(RENDERED_EVIDENCE_JS)


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def sandbox_path(value: str | Path) -> Path:
    path = Path(value)
    if not path.is_absolute():
        return ROOT / path
    return path


def require_sandbox_path(value: str | Path, *, escape_env: str = "SANDBOX_ALLOW_OUTSIDE_OUTPUTS") -> Path:
    """Resolve path; reject absolute paths outside ROOT unless env escape is set."""
    path = sandbox_path(value)
    if path.is_absolute():
        try:
            path.relative_to(ROOT)
        except ValueError:
            if not allow_outside_outputs():
                raise SystemExit(
                    f"Path {path} is outside sandbox root {ROOT}. "
                    f"Set {escape_env}=true to allow, or use a relative path."
                ) from None
    return path


def validate_llm_base_url(url: str) -> str:
    """Confirm LLM URL is local/private network unless explicitly allowed."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if host.startswith(_PRIVATE_NET_PREFIXES):
        return url
    if host == "localhost" or host == "127.0.0.1":
        return url
    if allow_remote_llm():
        return url
    raise SystemExit(
        f"LLM base URL {url} resolves to host {host!r}. "
        "Set SANDBOX_ALLOW_REMOTE_LLM=true to allow remote LLM endpoints."
    )


def get_output_dir() -> Path:
    load_dotenv()
    return require_sandbox_path(os.environ.get("SANDBOX_OUTPUT_DIR", "outputs"))


def env_int(name: str, default: int) -> int:
    load_dotenv()
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def env_bool(name: str, default: bool = False) -> bool:
    load_dotenv()
    raw = os.environ.get(name)
    if raw in (None, ""):
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def allow_outside_outputs() -> bool:
    return env_bool("SANDBOX_ALLOW_OUTSIDE_OUTPUTS", False)


def allow_remote_llm() -> bool:
    return env_bool("SANDBOX_ALLOW_REMOTE_LLM", False)

def now_slug() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def tokenize(value: str) -> list[str]:
    value = value.lower().replace("&", " and ")
    return [tok for tok in re.findall(r"[a-z0-9]+", value) if tok not in STOP_TOKENS]


def expand_register_name(register_name: str) -> dict[str, Any]:
    raw_tokens = re.findall(r"[A-Za-z]+|\d+(?:\.\d+)?", register_name.upper())
    expanded: list[str] = []
    evidence: list[dict[str, str]] = []
    for tok in raw_tokens:
        replacement = ABBREVIATIONS.get(tok, tok.lower())
        expanded.extend(tokenize(replacement))
        if replacement != tok.lower():
            evidence.append({"token": tok, "expansion": replacement})
    size_match = re.search(r"(\d+(?:\.\d+)?)\s*(OZ|LB|LBS|OUNCE|OUNCES)", register_name, re.I)
    size = None
    if size_match:
        unit = size_match.group(2).lower().replace("ounces", "oz").replace("ounce", "oz").replace("lbs", "lb")
        size = f"{size_match.group(1)} {unit}"
        expanded.extend(tokenize(size))
    return {"raw": register_name, "tokens": sorted(set(expanded)), "expanded_text": " ".join(expanded), "size": size, "evidence": evidence}


def normalize_url(url: str, base_url: str | None = None) -> str | None:
    if not url:
        return None
    joined = urljoin(base_url or "", url)
    parsed = urlparse(joined)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return parsed._replace(fragment="").geturl()


def url_allowed(url: str, domains: list[str]) -> bool:
    host = urlparse(url).netloc.lower().split(":")[0]
    return any(host == d.lower() or host.endswith("." + d.lower()) for d in domains)


def score_text_against_terms(text: str, terms: list[str]) -> dict[str, Any]:
    haystack = " ".join(tokenize(text))
    matches = []
    for term in terms:
        if term and re.search(rf"\b{re.escape(term.lower())}\b", haystack):
            matches.append(term)
    return {"matches": sorted(set(matches)), "score": len(set(matches)) * 10}


def candidate_score(url: str, title: str, h1: str, text: str, query_terms: list[str], upc: str | None = None) -> dict[str, Any]:
    slug_text = " ".join([urlparse(url).path, title, h1])
    slug_matches = score_text_against_terms(slug_text, query_terms)
    text_matches = score_text_against_terms(text[:12000], query_terms)
    score = slug_matches["score"] + min(text_matches["score"], 40)
    evidence = {"slug_title_h1_matches": slug_matches["matches"], "body_matches": text_matches["matches"]}
    if upc and upc in text:
        score += 45
        evidence["upc_match"] = True
    else:
        evidence["upc_match"] = False
    path = urlparse(url).path.lower()
    if any(marker in path for marker in ["/product", "/products", "/shop", "/catalog"]):
        score += 10
        evidence["productish_url"] = True
    return {"score": score, "evidence": evidence}


def load_brand(brand_id: str) -> dict[str, Any]:
    brands = read_json(ROOT / "config" / "brands.json")
    for brand in brands:
        if brand.get("id") == brand_id:
            return brand
    raise SystemExit(f"Unknown brand_id={brand_id!r}. Check config/brands.json")


def load_register_row(row_id: str) -> dict[str, Any]:
    rows = read_json(ROOT / "fixtures" / "register_rows.json")
    for row in rows:
        if row.get("id") == row_id:
            return row
    raise SystemExit(f"Unknown row id={row_id!r}. Check fixtures/register_rows.json")


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr)


# ── Product image selection / filtering ──────────────────────────────

_NON_PRODUCT_IMAGE_PATTERNS = (
    "logo", "footer", "header", "icon", "favicon", "pixel", "tracking",
    "transparent", "spacer", "banner", "bg-", "background",
    "menu", "nav-icon", "social", "share", "icon-", "sprite",
    "arrow", "bullet", "dot-", "chevron", "carat", "cart-",
    "checkout", "bag-", "wishlist", "search", "close-", "x-",
    "loader", "loading", "placeholder", "empty", "coming-soon",
    "newsletter", "email-signup", "instagram", "facebook", "twitter",
    "pinterest", "youtube", "tiktok",
)


_URL_BLACKLIST_PATTERNS = (
    "pixel", "tracking", "analytics", "beacon",
    "1x1", "clear.gif", "transparent.gif",
    "social", "share", "like", "follow",
    "logo.", "favicon",
)


def is_likely_product_image(url: str) -> bool:
    """Return True if the URL looks like a product image, not chrome/noise."""
    low = url.lower()
    for pattern in _NON_PRODUCT_IMAGE_PATTERNS:
        if pattern in low:
            return False
    for pattern in _URL_BLACKLIST_PATTERNS:
        if pattern in low:
            return False
    return True


def _is_product_card_image(url: str, card_text: str) -> bool:
    """Check if an image appears in a product card's content."""
    return url.lower() in card_text.lower() if card_text else False


def is_image_url_in_product_jsonld(url: str, product: dict[str, Any]) -> bool:
    """Check if a URL matches any image in a Product JSON-LD block."""
    image = product.get("image") if product else None
    if not image:
        return False
    norm_url = url.lower().rstrip("/")
    if isinstance(image, str):
        return norm_url == image.lower().rstrip("/")
    if isinstance(image, list):
        for item in image:
            if isinstance(item, str) and norm_url == item.lower().rstrip("/"):
                return True
            if isinstance(item, dict) and item.get("url") and norm_url == str(item["url"]).lower().rstrip("/"):
                return True
    if isinstance(image, dict) and image.get("url"):
        return norm_url == str(image["url"]).lower().rstrip("/")
    return False


def reject_non_product_images(images: list[str], *, product_card_texts: list[str] | None = None) -> tuple[list[str], list[dict[str, Any]]]:
    """Split images into product candidates and rejected with reasons."""
    candidates: list[str] = []
    rejected: list[dict[str, Any]] = []
    seen = set()
    for url in images:
        if not url or url in seen:
            continue
        seen.add(url)
        if is_likely_product_image(url):
            # Check if it appears in a matched product card
            if product_card_texts:
                in_card = any(_is_product_card_image(url, ct) for ct in product_card_texts)
                if in_card:
                    candidates.append(url)
                    continue
            candidates.append(url)
        else:
            rejected.append({"url": url, "reason": "non_product_image_filter"})
    return candidates, rejected


def classify_product_image_source(url: str, product: dict[str, Any], card_image_urls: list[str], page_image_urls: list[str]) -> str:
    """Determine the trust source for an image: jsonld, product_card, og_meta, or generic."""
    if is_image_url_in_product_jsonld(url, product):
        return "jsonld"
    if url in card_image_urls:
        return "product_card"
    if url in page_image_urls:
        return "page_image"
    return "unknown"


def select_product_images(
    default_images: list[str],
    rendered_images: list[str],
    llm_images: list[str],
    product: dict[str, Any] | None = None,
    product_cards: list[dict[str, Any]] | None = None,
    page_type: str = "unknown",
) -> dict[str, Any]:
    """
    Strict product image selection.

    Returns a dict with:
      - all_page_images: union of all sources
      - candidate_product_images: images that pass the product-image filter
      - selected_product_images: the final set (jsonld/best card or filtered candidates)
      - rejected_images: list of {url, reason} for each rejected image
    """
    all_page = list(dict.fromkeys(default_images + rendered_images + llm_images))
    all_page = [u for u in all_page if isinstance(u, str)]

    # Collect card image texts for matching
    card_texts: list[str] = []
    card_image_urls: list[str] = []
    if product_cards:
        for c in product_cards:
            c_text = " ".join([c.get("title", ""), c.get("href", ""), str(c.get("data_attributes", {}))])
            card_texts.append(c_text)
            card_image_urls.extend(c.get("image_urls", []))

    # Source 1: JSON-LD Product image (highest trust)
    jsonld_images: list[str] = []
    if product:
        raw_img = product.get("image")
        if isinstance(raw_img, str):
            jsonld_images = [raw_img]
        elif isinstance(raw_img, list):
            jsonld_images = [i if isinstance(i, str) else (i.get("url", "") if isinstance(i, dict) else "") for i in raw_img]
        elif isinstance(raw_img, dict) and raw_img.get("url"):
            jsonld_images = [str(raw_img["url"])]
    jsonld_images = [u for u in jsonld_images if isinstance(u, str) and u]

    # Source 2: Product card images (next trust level)
    card_images = list(dict.fromkeys([u for u in card_image_urls if isinstance(u, str)]))

    # Filter all page images for product candidates
    candidates, rejected = reject_non_product_images(all_page, product_card_texts=card_texts if page_type in ("collection", "category") else None)

    # Final selection logic
    if page_type == "pdp":
        # On PDP, prefer JSON-LD images; fall through to candidates if empty
        selected = list(dict.fromkeys(jsonld_images)) if jsonld_images else candidates
        if not selected:
            selected = candidates
    elif page_type in ("collection", "category"):
        # On collection/category, prefer matched card images; then filtered candidates
        selected = list(dict.fromkeys(card_images))
        if not selected:
            selected = []  # Don't promote page-wide images on collection pages
    else:
        # For brand_home, blog, unknown: only include filtered candidates if PDP-like evidence
        selected = []

    # Ensure we still capture all images for diagnostics but keep fields.images strict
    return {
        "all_page_images": all_page,
        "candidate_product_images": candidates,
        "selected_product_images": list(dict.fromkeys(selected)),
        "rejected_images": rejected,
    }
