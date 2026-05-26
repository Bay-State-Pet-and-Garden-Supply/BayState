#!/usr/bin/env python3
"""Extract one known product URL into a local evidence packet. Round 2."""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from common import (
    RENDERED_EVIDENCE_STORE_JS,
    clean_text,
    env_int,
    get_output_dir,
    load_dotenv,
    now_slug,
    sandbox_path,
    tokenize,
    write_json,
)
from field_scoring import score_fixture
from lmstudio_extract import extract_product_fields, lmstudio_settings
from media_scoring import score_selected_product_images, select_product_images
from page_classifier import classify_page


def markdown_to_text(markdown: Any) -> str:
    if markdown is None:
        return ""
    if isinstance(markdown, str):
        return markdown
    for attr in ("fit_markdown", "raw_markdown", "markdown"):
        value = getattr(markdown, attr, None)
        if isinstance(value, str):
            return value
    return str(markdown)


def extract_json_ld(html: str) -> list[Any]:
    soup = BeautifulSoup(html or "", "html.parser")
    blocks: list[Any] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        text = (script.string or script.get_text() or "").strip()
        if not text:
            continue
        try:
            blocks.append(json.loads(text))
        except json.JSONDecodeError:
            blocks.append({"_unparsed": text[:2000]})
    return blocks


def extract_meta(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html or "", "html.parser")
    meta: dict[str, str] = {}
    for tag in soup.find_all("meta"):
        key = tag.get("property") or tag.get("name")
        value = tag.get("content")
        if key and value:
            meta[str(key)] = str(value)
    return meta


def extract_h1(html: str) -> list[str]:
    soup = BeautifulSoup(html or "", "html.parser")
    return [clean_text(h.get_text(" ")) for h in soup.find_all("h1") if clean_text(h.get_text(" "))]


def find_product_jsonld(blocks: list[Any]) -> dict[str, Any] | None:
    queue = list(blocks)
    while queue:
        item = queue.pop(0)
        if isinstance(item, list):
            queue.extend(item)
        elif isinstance(item, dict):
            typ = item.get("@type")
            types = typ if isinstance(typ, list) else [typ]
            if any(str(t).lower() == "product" for t in types):
                return item
            graph = item.get("@graph")
            if isinstance(graph, list):
                queue.extend(graph)
    return None


def first(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return None


def normalize_images(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        urls = []
        for item in value:
            if isinstance(item, str):
                urls.append(item)
            elif isinstance(item, dict) and item.get("url"):
                urls.append(str(item["url"]))
        return urls
    if isinstance(value, dict) and value.get("url"):
        return [str(value["url"])]
    return []


def parse_rendered_evidence(raw_text: str | None) -> dict[str, Any]:
    if not raw_text:
        return {"images": [], "productCards": [], "imageCount": 0, "productCardCount": 0}
    try:
        parsed = json.loads(raw_text)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
        if isinstance(parsed, dict):
            parsed.setdefault("images", [])
            parsed.setdefault("productCards", [])
            parsed.setdefault("imageCount", len(parsed["images"]))
            parsed.setdefault("productCardCount", len(parsed["productCards"]))
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass
    return {"images": [], "productCards": [], "imageCount": 0, "productCardCount": 0, "_parse_error": True}


def match_product_cards(cards: list[dict[str, Any]], name: str, upc: str | None, expected_tokens: list[str] | None = None) -> list[dict[str, Any]]:
    input_tokens = set(tokenize(name or "")) | set(tokenize(upc or "")) | set(expected_tokens or [])
    if not input_tokens:
        return []
    scored = []
    for card in cards:
        card_text = " ".join([card.get("title", ""), card.get("href", ""), card.get("nearby_text", ""), str(card.get("data_attributes", {}))])
        card_tokens = set(tokenize(card_text).append if False else tokenize(card_text))
        match_tokens = list(input_tokens & card_tokens)
        miss_tokens = list(input_tokens - card_tokens)
        score = len(match_tokens) / max(len(input_tokens), 1)
        if score > 0:
            scored.append({**card, "score": round(score, 3), "matched_tokens": match_tokens, "missing_tokens": miss_tokens})
    return sorted(scored, key=lambda c: c["score"], reverse=True)[:5]


def token_overlap(expected: str, actual: str) -> float:
    expected_tokens = set(tokenize(expected))
    actual_tokens = set(tokenize(actual))
    if not expected_tokens:
        return 0
    return len(expected_tokens & actual_tokens) / len(expected_tokens)


def page_brand_from_product(product: dict[str, Any]) -> str | None:
    brand = product.get("brand")
    if isinstance(brand, dict):
        return brand.get("name")
    if isinstance(brand, str):
        return brand
    return None


def save_screenshot(result: Any, out_dir: Path, enabled: bool) -> str | None:
    if not enabled:
        return None
    screenshot = getattr(result, "screenshot", None)
    if not screenshot:
        return None
    path = out_dir / "screenshot.png"
    if isinstance(screenshot, bytes):
        path.write_bytes(screenshot)
    elif isinstance(screenshot, str):
        payload = screenshot.split(",", 1)[1] if screenshot.startswith("data:") and "," in screenshot else screenshot
        path.write_bytes(base64.b64decode(payload))
    else:
        return None
    return str(path)


def build_packet(
    args: argparse.Namespace,
    result: Any,
    out_dir: Path,
    screenshot_path: str | None,
    rendered: dict[str, Any] | None = None,
    llm_result: dict[str, Any] | None = None,
    llm_metrics: dict[str, Any] | None = None,
    llm_skipped_reason: str | None = None,
    fixture_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    html = getattr(result, "html", "") or ""
    markdown = markdown_to_text(getattr(result, "markdown", ""))
    meta = extract_meta(html)
    jsonld = extract_json_ld(html)
    product = find_product_jsonld(jsonld) or {}
    h1 = extract_h1(html)
    metadata = getattr(result, "metadata", {}) if isinstance(getattr(result, "metadata", {}), dict) else {}
    page_brand = page_brand_from_product(product)

    # Classification
    classification = classify_page(args.url, metadata.get("title"), h1, jsonld, meta, markdown, rendered)

    # Image sources (with guards against non-list values). `fields.images`
    # must contain ONLY selected images for the desired product, not all page images.
    raw_default = normalize_images(first(product.get("image"), meta.get("og:image")))
    raw_rendered = list(rendered.get("images", [])) if isinstance(rendered, dict) else []
    raw_llm = list(llm_result.get("image_urls", [])) if llm_result and isinstance(llm_result.get("image_urls"), list) else []
    default_images = list(dict.fromkeys([u for u in raw_default if isinstance(u, str)]))
    rendered_images = list(dict.fromkeys([u for u in raw_rendered if isinstance(u, str)]))
    llm_images = list(dict.fromkeys([u for u in raw_llm if isinstance(u, str)]))

    # Product cards first: selection for collection pages can only come from a strong matching card.
    # Do not use fixture expected tokens here; extraction must not depend on benchmark answers.
    product_cards = []
    if rendered and rendered.get("productCards"):
        product_cards = match_product_cards(rendered["productCards"], args.name or "", args.upc)

    media_selection = select_product_images(
        page_type=classification.get("page_type", "unknown"),
        input_name=args.name or "",
        fixture_row=fixture_row,
        default_images=default_images,
        rendered_images=rendered_images,
        llm_images=llm_images,
        product_cards=product_cards,
        has_product_jsonld=bool(product),
    )
    selected_images = media_selection["selected_product_images"]

    image_count_by_method = {
        "default": len(default_images),
        "rendered": len(rendered_images),
        "llm": len(llm_images),
        "all_page": len(media_selection["all_page_images"]),
        "candidate_product": len(media_selection["candidate_product_images"]),
        "selected_product": len(selected_images),
        "rejected_noise": len(media_selection["rejected_images"]),
    }

    fields = {
        "name": first(product.get("name"), meta.get("og:title"), h1[0] if h1 else None, metadata.get("title")),
        "brand": page_brand,
        "description": first(product.get("description"), meta.get("og:description"), metadata.get("description")),
        "upc": first(product.get("gtin12"), product.get("gtin13"), product.get("gtin")),
        "sku": product.get("sku"),
        "images": selected_images,
        "image_urls": selected_images,
        "price": None,
        "category": product.get("category"),
        "ingredients": None,
        "guaranteed_analysis": None,
        "weight": None,
        "species": None,
        "size": None,
    }
    if llm_result:
        for key in ("name", "brand", "species", "size", "category", "description", "ingredients", "guaranteed_analysis", "weight", "price"):
            llm_val = llm_result.get(key)
            if llm_val not in (None, "", [], {}) and fields.get(key) in (None, "", [], {}):
                fields[key] = llm_val

    # Scoring
    name_overlap = token_overlap(args.name or "", fields.get("name") or "")
    actual_brand = fields.get("brand") or ""
    brand_match = bool(args.brand and actual_brand and args.brand.lower() in actual_brand.lower())
    upc_match = bool(args.upc and fields.get("upc") and args.upc == fields.get("upc"))
    has_product_schema = bool(product)
    has_images = bool(fields["images"])
    has_description = bool(fields["description"])
    has_pdp_evidence = has_product_schema or has_images or has_description

    # Confidence weighted
    confidence = min(1.0,
        (0.30 if upc_match else 0) +
        (0.20 * name_overlap) +
        (0.15 if brand_match else 0) +
        (0.10 if has_product_schema else 0) +
        (0.10 if has_images else 0) +
        (0.10 if has_description else 0) +
        (0.05 if rendered_images or llm_images else 0)
    )

    # Recommendation gating: accept requires pdp + strong evidence
    page_type = classification.get("page_type", "unknown")
    recommendation = "conflict"
    if page_type == "pdp" and confidence >= 0.75 and has_pdp_evidence:
        recommendation = "accept"
    elif page_type == "pdp" and confidence >= 0.50:
        recommendation = "review"
    elif page_type in ("collection", "category") and confidence >= 0.60:
        recommendation = "review"
    elif confidence >= 0.60 and has_pdp_evidence:
        recommendation = "review"

    discovery = getattr(args, "discovery_metadata", None) or {"used": False, "sitemap_urls": [], "candidate_count": 0, "selected_url": args.url, "candidates": []}
    run_id = out_dir.name

    # Field scores if fixture_row provided
    field_scores = None
    if fixture_row:
        fs = score_fixture({"extraction": {"fields": fields, "media": {"selected_product_images": selected_images}}, "classification": classification}, fixture_row)
        field_scores = fs.get("field_scores")

    packet: dict[str, Any] = {
        "schema_version": "product_extraction_packet.v1",
        "run_id": run_id,
        "created_at": now_slug(),
        "sandbox_version": "product-page-extraction-sandbox-v0",
        "input": {"fixture_id": args.fixture_id, "upc": args.upc, "sku": args.sku, "brand": args.brand, "name": args.name, "site_key": args.site_key},
        "discovery": discovery,
        "classification": classification,
        "crawl": {
            "success": bool(getattr(result, "success", False)),
            "requested_url": args.url,
            "final_url": getattr(result, "url", args.url),
            "title": metadata.get("title"),
            "markdown_path": str(out_dir / "page.md"),
            "screenshot_path": screenshot_path,
            "html_length": len(html),
            "markdown_length": len(markdown),
            "jsonld_count": len(jsonld),
        },
        "extraction": {
            "method": "jsonld+meta+markdown" + ("+rendered" if rendered else "") + ("+lmstudio" if llm_result else ""),
            "llm_used": bool(llm_result),
            "llm_model": (llm_metrics or {}).get("model") if llm_result else None,
            "llm_skipped_reason": llm_skipped_reason,
            "llm_metrics": llm_metrics,
            "confidence": round(confidence, 3),
            "fields": fields,
            "field_evidence": {
                "name": {"source": "jsonld/meta/h1/title", "confidence": 0.8 if fields.get("name") else 0},
                "brand": {"source": "jsonld" if page_brand else "llm/input", "confidence": 0.8 if actual_brand else 0},
                "images": {"source": "jsonld/meta/rendered", "confidence": 0.7 if fields.get("images") else 0},
            },
            "media": {
                "all_page_images": media_selection["all_page_images"],
                "candidate_product_images": media_selection["candidate_product_images"],
                "selected_product_images": media_selection["selected_product_images"],
                "rejected_images": media_selection["rejected_images"],
                "default_images": default_images,
                "rendered_images": rendered_images,
                "llm_images": llm_images,
                "llm_supported_images": media_selection["llm_supported_images"],
                "selected_images": selected_images,
                "image_count_by_method": image_count_by_method,
                "media_extraction_method": "rendered_dom" if rendered else "default",
                "rendered_evidence_path": str(out_dir / "rendered-evidence.json") if rendered else None,
            },
            "product_cards": product_cards,
            "llm_raw": llm_result,
        },
        "validation": {
            "brand_match": brand_match,
            "upc_match": upc_match,
            "name_token_overlap": round(name_overlap, 3),
            "required_fields_present": bool(fields.get("name") and has_pdp_evidence),
            "recommendation": recommendation,
            "warnings": [],
            "field_scores": field_scores,
            "page_type_gating": {
                "page_type": page_type,
                "gated": page_type != "pdp",
                "reason": f"Page type '{page_type}' requires PDP classification for accept" if page_type != "pdp" else None,
            },
        },
        "artifacts": {
            "packet_markdown": str(out_dir / "packet.md"),
            "raw_jsonld": str(out_dir / "jsonld.json"),
            "crawl_markdown": str(out_dir / "page.md"),
            "screenshot": screenshot_path,
            "rendered_evidence": str(out_dir / "rendered-evidence.json") if rendered else None,
            "agent_browser": None,
            "comparison": None,
        },
        "errors": [],
    }

    if not has_pdp_evidence and recommendation != "conflict":
        packet["validation"]["warnings"].append("Acceptable confidence but no PDP evidence; review manually.")
    if page_type == "collection":
        packet["validation"]["warnings"].append(f"Page classified as {page_type}: consider matching against product cards.")
    return packet


async def run(args: argparse.Namespace) -> Path:
    load_dotenv()
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    out_root = sandbox_path(args.output_dir)
    out_dir = out_root / f"{now_slug()}-{args.fixture_id or 'known-url'}"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Determine if we should render
    do_rendered = not getattr(args, "no_rendered", False)
    timeout_ms = args.timeout_ms

    browser_config = BrowserConfig(headless=os.environ.get("HEADLESS", "true").lower() != "false")

    # Phase 1: Initial crawl
    config = CrawlerRunConfig(page_timeout=timeout_ms, remove_overlay_elements=True, screenshot=args.screenshot)
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(args.url, config=config)

    markdown = markdown_to_text(getattr(result, "markdown", ""))
    html = getattr(result, "html", "") or ""
    (out_dir / "page.md").write_text(markdown)
    write_json(out_dir / "jsonld.json", extract_json_ld(html))
    screenshot_path = save_screenshot(result, out_dir, args.screenshot)

    # Phase 2: Rendered DOM evidence
    rendered = None
    if do_rendered and getattr(result, "success", False):
        try:
            page_url = getattr(result, "url", args.url)
            # Single arun: scroll then extract via stored JS
            combined_js = f"""
            (() => {{
                window.scrollTo(0, document.body.scrollHeight || 1000);
            }})();
            {RENDERED_EVIDENCE_STORE_JS}
            """
            async with AsyncWebCrawler(config=browser_config) as render_crawler:
                store_result = await render_crawler.arun(
                    page_url, config=CrawlerRunConfig(
                        page_timeout=timeout_ms,
                        remove_overlay_elements=True,
                        js_code=combined_js,
                    )
                )
                store_html = getattr(store_result, "html", "") or ""

            soup = BeautifulSoup(store_html, "html.parser")
            ev_div = soup.find("div", id="__sandbox_rendered__")
            if ev_div:
                raw_txt = ev_div.text
                try:
                    parsed = parse_rendered_evidence(raw_txt) or {}
                    if isinstance(parsed, dict) and isinstance(parsed.get("images"), list) and len(parsed["images"]) > 0:
                        parsed["method"] = "crawl4ai_js_dom"
                        rendered = parsed
                except Exception:
                    pass

            if not rendered:
                # Fallback: extract images from rendered HTML
                img_urls = []
                for img in soup.find_all("img"):
                    for attr in ("src", "data-src", "srcset", "data-srcset", "data-large", "data-original"):
                        val = img.get(attr, "")
                        if val:
                            if attr in ("srcset", "data-srcset"):
                                for p in val.split(","):
                                    cand = p.strip().split()[0]
                                    if cand:
                                        img_urls.append(cand)
                            else:
                                img_urls.append(val)
                rendered = {
                    "images": list(dict.fromkeys(img_urls))[:200],
                    "productCards": [],
                    "imageCount": len(img_urls),
                    "productCardCount": 0,
                    "method": "scroll+html_fallback",
                    "_note": "Extraction JS sentinel not found; used HTML parser",
                }
            if rendered:
                write_json(out_dir / "rendered-evidence.json", rendered)
        except Exception as exc:
            rendered = {"images": [], "productCards": [], "imageCount": 0, "productCardCount": 0, "method": "failed", "error": repr(exc)}
            write_json(out_dir / "rendered-evidence.json", rendered)

    # Phase 3: LM Studio extraction
    llm_result = None
    llm_metrics = None
    llm_skipped_reason = None
    llm_mode = getattr(args, "llm", "off")
    if llm_mode in {"auto", "required"}:
        evidence = {"url": args.url, "html_sample": clean_text(markdown)[:6000], "json_ld": extract_json_ld(html)[:3], "meta": extract_meta(html)}
        try:
            llm_result, llm_metrics = extract_product_fields(evidence)
        except Exception as exc:
            if llm_mode == "required":
                raise
            llm_skipped_reason = f"LM Studio skipped: {exc!r}"

    fixture_row = getattr(args, "fixture_row", None)
    packet = build_packet(args, result, out_dir, screenshot_path, rendered, llm_result, llm_metrics, llm_skipped_reason, fixture_row)
    if llm_skipped_reason:
        packet["validation"]["warnings"].append(llm_skipped_reason)

    write_json(out_dir / "packet.json", packet)
    (out_dir / "packet.md").write_text(
        f"# Packet {packet['run_id']}\n\n"
        f"Recommendation: {packet['validation']['recommendation']}\n"
        f"Confidence: {packet['extraction']['confidence']}\n"
        f"Page type: {packet['classification']['page_type']}\n"
        f"URL: {packet['crawl']['final_url']}\n"
    )
    print(json.dumps({"output_dir": str(out_dir), "packet": str(out_dir / "packet.json")}, indent=2))
    return out_dir / "packet.json"


def parse_args() -> argparse.Namespace:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Extract a known URL into a product packet. Round 2.")
    parser.add_argument("--url", required=True)
    parser.add_argument("--upc")
    parser.add_argument("--sku")
    parser.add_argument("--brand", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--site-key")
    parser.add_argument("--fixture-id")
    parser.add_argument("--output-dir", default=str(get_output_dir()))
    parser.add_argument("--llm", choices=["off", "auto", "required"], default=os.environ.get("C4AI_LLM_MODE", "off"))
    parser.add_argument("--screenshot", action="store_true")
    parser.add_argument("--no-rendered", action="store_true", help="Skip Crawl4AI rendered DOM image extraction")
    parser.add_argument("--timeout-ms", type=int, default=env_int("SANDBOX_PAGE_TIMEOUT_MS", 45000))
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
