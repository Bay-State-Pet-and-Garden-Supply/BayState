#!/usr/bin/env python3
"""Deterministic page-type classifier for ecommerce product pages."""

from __future__ import annotations

import re
from typing import Any


def classify_page(url: str, title: str | None, h1: list[str], jsonld: list[Any], meta: dict[str, str], markdown: str, rendered: dict[str, Any] | None = None) -> dict[str, Any]:
    signals: list[str] = []
    warnings: list[str] = []
    path_lower = url.split("?")[0].rstrip("/").lower()
    title_lower = (title or "").lower()
    h1_lower = " ".join(h1).lower()
    combined = " ".join([title_lower, h1_lower])

    # PDP signals
    has_product_jsonld = False
    for block in jsonld:
        queue = [block]
        while queue:
            item = queue.pop(0)
            if isinstance(item, list):
                queue.extend(item)
            elif isinstance(item, dict):
                typ = item.get("@type")
                types = typ if isinstance(typ, list) else [typ]
                if any(str(t).lower() == "product" for t in types):
                    has_product_jsonld = True
                    signals.append("product_jsonld")
                    break
                graph = item.get("@graph")
                if isinstance(graph, list):
                    queue.extend(graph)
        if has_product_jsonld:
            break

    og_type = meta.get("og:type", "")
    if og_type.lower() == "product":
        signals.append("og_type_product")

    card_count = 0
    if rendered and "productCards" in rendered:
        card_count = len(rendered["productCards"]) or 0
    if card_count > 0:
        signals.append(f"product_cards:{card_count}")

    if re.search(r"/product[s]?/[^/]+/[^/]+$", path_lower):
        signals.append("deep_product_url")
    elif re.search(r"/p/", path_lower):
        signals.append("p_url")
    elif re.search(r"/dp/", path_lower):
        signals.append("dp_url")
    elif re.search(r"/item/", path_lower):
        signals.append("item_url")
    elif re.search(r"/product[s]?/", path_lower):
        signals.append("product_path")

    if re.search(r"\b(product|shop|buy|order)\b", combined):
        signals.append("product_text")

    # Collection/category signals
    if re.search(r"/(category|collection|collections|browse|catalog)/", path_lower):
        signals.append("category_path")
    if re.search(r"/products/(dog|cat)/[^/]+$", path_lower):
        signals.append("product_line_path")
    if re.search(r"\b(collection|browse|shop\s+all|all\s+products|view\s+all)\b", combined):
        signals.append("collection_text")
    if "?" in url and any(q in url.lower() for q in ["sort=", "filter=", "page=", "limit=", "view="]):
        signals.append("query_params")

    # Blog/support signals
    if re.search(r"/(blog|news|article|post|support|help|faq|contact|about|privacy|terms)/", path_lower):
        signals.append("blog_support_path")

    # Homepage signals
    if path_lower.strip("/") == "" or re.search(r"^(https?://[^/]+)$", url):
        signals.append("homepage")
    if any(w in combined for w in ["home", "welcome", "index"]):
        signals.append("home_text")

    # Page-type decision
    if has_product_jsonld or og_type.lower() == "product":
        if card_count > 0:
            page_type = "pdp"
        elif re.search(r"/product[s]?/[^/]+/[^/]+$", path_lower):
            page_type = "pdp"
        else:
            page_type = "pdp"
    elif card_count >= 3 and any(s in signals for s in ["category_path", "product_path", "query_params", "product_line_path"]):
        page_type = "collection"
    elif "product_line_path" in signals:
        page_type = "collection"
    elif re.search(r"/product[s]?/", path_lower) and card_count >= 2:
        page_type = "collection"
    elif re.search(r"/(category|collection|collections)/", path_lower):
        page_type = "category"
    elif re.search(r"/(blog|news|article|support|help)/", path_lower):
        page_type = "blog_support"
    elif "homepage" in signals or "home_text" in signals:
        page_type = "brand_home"
    elif card_count > 0 and card_count < 3:
        page_type = "collection"
    else:
        page_type = "unknown"

    # Confidence - keep cautious for unknown
    confidence = 0.0
    if has_product_jsonld:
        confidence = 0.9
    elif og_type.lower() == "product":
        confidence = 0.85
    elif page_type == "collection" and card_count >= 3:
        confidence = 0.75
    elif page_type == "collection" and "product_line_path" in signals:
        confidence = 0.7
    elif page_type == "collection":
        confidence = 0.6
    elif page_type == "category":
        confidence = 0.6
    elif page_type == "brand_home":
        confidence = 0.6
    elif page_type == "blog_support":
        confidence = 0.7
    elif page_type == "pdp":
        # Only PDP by deep url path or card count; moderate confidence
        confidence = 0.6
    else:
        confidence = 0.3
        warnings.append(f"Low-confidence page_type={page_type}: signals={signals}")

    return {
        "page_type": page_type,
        "confidence": round(confidence, 3),
        "product_card_count": card_count,
        "signals": signals,
        "warnings": warnings,
    }
