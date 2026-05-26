#!/usr/bin/env python3
"""Compare Crawl4AI packet (with rendered media) against agent-browser. Round 2."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from urllib.parse import urljoin, urlparse

from common import now_slug, read_json, tokenize, write_json

# Tracking/resource patterns unlikely to be product images
_NON_PRODUCT_IMAGE_PATTERNS = (
    "logo", "footer", "header", "icon", "favicon", "pixel", "tracking",
    "transparent", "spacer", "banner", "button", "bg-", "background",
    "menu", "nav-icon", "social", "share", "icon-", "sprite",
)


def _is_likely_product_image(url: str) -> bool:
    low = url.lower()
    for pattern in _NON_PRODUCT_IMAGE_PATTERNS:
        if pattern in low:
            return False
    return True


def _normalize_and_filter(raw_urls: list[str], base_url: str | None = None) -> list[str]:
    normalized = []
    for u in raw_urls:
        try:
            joined = urljoin(base_url or "", u)
            parsed = urlparse(joined)
            if parsed.scheme in ("http", "https") and parsed.netloc:
                clean = parsed._replace(fragment="").geturl()
                normalized.append(clean)
        except Exception:
            pass
    seen = set()
    deduped = []
    for u in normalized:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    return deduped


def overlap(a: str, b: str) -> float:
    left = set(tokenize(a or ""))
    right = set(tokenize(b or ""))
    if not left:
        return 0.0
    return len(left & right) / len(left)


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare a product packet with agent-browser output. Round 2.")
    parser.add_argument("left", nargs="?", type=Path, help="Backward-compatible first evidence path")
    parser.add_argument("right", nargs="?", type=Path, help="Backward-compatible second evidence path")
    parser.add_argument("--packet", type=Path)
    parser.add_argument("--agent-browser", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    packet_path = args.packet or args.left
    browser_path = args.agent_browser or args.right
    if not packet_path or not browser_path:
        raise SystemExit("Provide --packet and --agent-browser, or two positional paths")

    packet = read_json(packet_path)
    browser = read_json(browser_path)
    fields = packet.get("extraction", {}).get("fields", {})
    media = packet.get("extraction", {}).get("media", {})
    classification = packet.get("classification", {})
    rendered = browser.get("rendered", browser)

    # Text comparison
    packet_name = fields.get("name") or packet.get("title") or ""
    rendered_text = " ".join([
        rendered.get("title") or "",
        " ".join(rendered.get("h1") or []),
        rendered.get("textSample") or "",
    ])
    name_score = overlap(packet_name, rendered_text)
    brand_score = overlap(fields.get("brand") or "", rendered_text) if fields.get("brand") else 0.0
    description_score = overlap(fields.get("description") or "", rendered_text) if fields.get("description") else 0.0
    upc_score = 1.0 if fields.get("upc") and fields.get("upc") in rendered_text else 0.0

    # Normalize and filter images for all tools
    page_url = packet.get("crawl", {}).get("final_url") or packet.get("crawl", {}).get("requested_url") or ""
    crawl4ai_default_raw = list(media.get("default_images", []))
    crawl4ai_rendered_raw = list(media.get("rendered_images", []))
    selected_product_raw = list(media.get("selected_product_images") or media.get("selected_images") or fields.get("images") or [])
    candidate_product_raw = list(media.get("candidate_product_images") or [])
    rejected_images = list(media.get("rejected_images") or [])
    agent_browser_raw = list(rendered.get("images", []))

    c4_default = _normalize_and_filter(crawl4ai_default_raw, page_url)
    c4_rendered = _normalize_and_filter(crawl4ai_rendered_raw, page_url)
    selected_product = _normalize_and_filter(selected_product_raw, page_url)
    candidate_product = _normalize_and_filter(candidate_product_raw, page_url)
    ab_images = _normalize_and_filter(agent_browser_raw, page_url)

    c4_default_product = [u for u in c4_default if _is_likely_product_image(u)]
    c4_rendered_product = [u for u in c4_rendered if _is_likely_product_image(u)]
    ab_product = [u for u in ab_images if _is_likely_product_image(u)]

    # Set comparisons
    c4_default_set = set(c4_default)
    c4_rendered_set = set(c4_rendered)
    ab_set = set(ab_images)
    c4_rendered_product_set = set(c4_rendered_product)
    ab_product_set = set(ab_product)

    crawl4ai_default_count = len(c4_default_set)
    crawl4ai_rendered_count = len(c4_rendered_set)
    agent_browser_count = len(ab_set)

    rendered_vs_agent_overlap = 0.0
    if c4_rendered_set and ab_set:
        rendered_vs_agent_overlap = len(c4_rendered_set & ab_set) / max(len(c4_rendered_set | ab_set), 1)
    elif ab_set:
        rendered_vs_agent_overlap = 0.0
    else:
        rendered_vs_agent_overlap = 1.0

    agent_browser_unique_count = len(ab_set - c4_rendered_set)
    agent_browser_unique_product_count = len(ab_product_set - c4_rendered_product_set)
    crawl4ai_rendered_close_enough = (crawl4ai_rendered_count >= 0.8 * agent_browser_count) if agent_browser_count > 0 else True
    image_gain = max(0, agent_browser_count - crawl4ai_rendered_count)
    product_image_gain = max(0, len(ab_product) - len(selected_product))

    # Product card comparison
    packet_cards = packet.get("extraction", {}).get("product_cards", [])
    browser_cards = rendered.get("productCards", [])
    browser_card_hrefs = list(dict.fromkeys(c.get("href", "") for c in browser_cards if c.get("href")))
    # Find which packet images appear in browser cards
    packet_imgs_in_browser_cards = [u for u in c4_default + c4_rendered if any(u in str(c) for c in browser_cards)]

    # Weighted score
    image_overlap_val = rendered_vs_agent_overlap if c4_rendered or ab_images else 1.0
    weighted = (0.30 * name_score) + (0.10 * brand_score) + (0.10 * description_score) + (0.05 * upc_score) + (0.25 * image_overlap_val) + (0.20 if browser.get("success", True) else 0)
    packet_recommendation = packet.get("validation", {}).get("recommendation")
    has_pdp_evidence = bool(fields.get("description") or selected_product or fields.get("brand") or fields.get("upc"))

    recommendation = "accept" if weighted >= 0.75 else "review" if weighted >= 0.45 else "conflict"
    if packet_recommendation == "conflict" or not has_pdp_evidence:
        recommendation = "review" if weighted >= 0.45 else "conflict"
    if image_gain >= 5 and recommendation == "conflict":
        recommendation = "review"

    warnings: list[str] = []
    if image_gain > 0:
        warnings.append(f"agent-browser found {image_gain} more images than Crawl4AI rendered pass")
    if packet_recommendation == "conflict" or not has_pdp_evidence:
        warnings.append("Underlying packet is conflict or lacks page-sourced PDP evidence; comparison cannot accept")
    if agent_browser_count > 0 and not crawl4ai_rendered_close_enough:
        warnings.append(f"Crawl4AI rendered ({crawl4ai_rendered_count}) < 80% of agent-browser ({agent_browser_count})")

    comparison = {
        "schema_version": "comparison.v1",
        "run_id": now_slug() + "-comparison",
        "recommendation": recommendation,
        "scores": {
            "name_token_similarity": round(name_score, 3),
            "brand_similarity": round(brand_score, 3),
            "description_similarity": round(description_score, 3),
            "upc_match": upc_score,
            "image_overlap": round(image_overlap_val, 3),
            "weighted": round(weighted, 3),
        },
        "image_comparison": {
            "all_page_image_count": len(set(c4_rendered) | set(c4_default)),
            "candidate_product_image_count": len(candidate_product),
            "selected_product_image_count": len(selected_product),
            "rejected_noise_image_count": len(rejected_images),
            "product_image_precision": (packet.get("validation", {}).get("field_scores", {}).get("images", {}) or {}).get("precision"),
            "product_image_recall": (packet.get("validation", {}).get("field_scores", {}).get("images", {}) or {}).get("recall"),
            "crawl4ai_default_count": crawl4ai_default_count,
            "crawl4ai_rendered_count": crawl4ai_rendered_count,
            "agent_browser_count": agent_browser_count,
            "crawl4ai_rendered_product_estimate": len(c4_rendered_product),
            "agent_browser_product_estimate": len(ab_product),
            "product_image_gain": product_image_gain,
            "rendered_vs_agent_overlap": round(rendered_vs_agent_overlap, 3),
            "agent_browser_unique_count": agent_browser_unique_count,
            "agent_browser_unique_product_estimate": agent_browser_unique_product_count,
            "crawl4ai_rendered_close_enough": crawl4ai_rendered_close_enough,
        },
        "product_card_comparison": {
            "packet_card_count": len(packet_cards),
            "browser_card_count": len(browser_cards),
            "browser_card_href_samples": browser_card_hrefs[:5],
            "packet_images_in_browser_cards": len(packet_imgs_in_browser_cards),
        },
        "page_type_comparison": {
            "packet_page_type": classification.get("page_type"),
        },
        "inputs": {"packet": str(packet_path), "agent_browser": str(browser_path)},
        "warnings": warnings,
    }
    if args.out:
        write_json(args.out, comparison)
    print(f"tool        | PACKET: product_packet | BROWSER: agent-browser")
    print(f"recommend  | {comparison['recommendation']}")
    print(f"img_counts | default={crawl4ai_default_count} rendered={crawl4ai_rendered_count} browser={agent_browser_count}")
    if crawl4ai_rendered_count or agent_browser_count:
        overlap_pct = rendered_vs_agent_overlap * 100
        unique = agent_browser_unique_count
        print(f"img_score  | overlap={overlap_pct:.0f}% browser_unique={unique} close_enough={crawl4ai_rendered_close_enough}")
    if args.out:
        print(f"wrote      | {args.out}")


if __name__ == "__main__":
    main()
