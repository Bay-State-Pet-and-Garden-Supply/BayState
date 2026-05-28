#!/usr/bin/env python3
"""
Scraper config discovery script using playwright-cli.

Opens a product page, snapshots it, mines selectors, and outputs a structured
JSON file with discovered selectors, workflow recommendations, and no-results
indicators.

Usage:
    python discover.py --url https://vendor.com/product/SKU123 --output discover.json
    python discover.py --url https://vendor.com/product/SKU123 --platform shopify --output discover.json
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path


def run_cli(*args: str) -> str:
    """Run a playwright-cli command and return stdout."""
    cmd = ["playwright-cli", *args]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Some commands fail if elements don't exist — return empty string
        return ""
    return result.stdout.strip()


def run_cli_raw(*args: str) -> str:
    """Run playwright-cli with --raw flag."""
    return run_cli("--raw", *args)


def open_page(url: str) -> None:
    """Open the page in playwright-cli."""
    run_cli("open", url)
    time.sleep(1)  # Give page time to settle


def snapshot_page(filename: str | None = None) -> str:
    """Take a snapshot. Returns the snapshot text."""
    args = ["snapshot"]
    if filename:
        args.extend(["--filename", filename])
    return run_cli(*args)


def mine_data_attributes() -> dict:
    """Discover data attributes on the page."""
    script = """
    JSON.stringify({
        testids: [...new Set([...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')))],
        skus: [...new Set([...document.querySelectorAll('[data-sku]')].map(e => e.getAttribute('data-sku')))],
        productIds: [...new Set([...document.querySelectorAll('[data-product-id]')].map(e => e.getAttribute('data-product-id')))],
        brands: [...new Set([...document.querySelectorAll('[data-brand]')].map(e => e.getAttribute('data-brand')))],
        prices: [...new Set([...document.querySelectorAll('[data-price]')].map(e => e.getAttribute('data-price')))],
    })
    """
    output = run_cli_raw("eval", script)
    try:
        return json.loads(output)
    except json.JSONDecodeError:
        return {}


def test_selector(selector: str) -> dict:
    """Test a CSS selector: count elements and get first element text."""
    count_script = f"document.querySelectorAll('{selector}').length"
    text_script = f"document.querySelector('{selector}')?.textContent?.trim() || ''"

    count_str = run_cli_raw("eval", count_script)
    text_str = run_cli_raw("eval", text_script)

    try:
        count = int(count_str) if count_str else 0
    except ValueError:
        count = 0

    return {
        "selector": selector,
        "count": count,
        "sample_text": text_str[:200] if text_str else "",
    }


def discover_selectors(platform: str | None = None) -> list[dict]:
    """Discover selectors for common product fields."""
    # Platform-specific candidate selectors
    candidates = {
        "Name": [
            "h1[data-testid='product-title']",
            "[data-testid='product-title']",
            ".product-title",
            ".product-name",
            ".page-title",
            ".productView-title",
            ".product_title",
            "h1",
        ],
        "Brand": [
            "[data-brand]",
            ".brand",
            ".vendor",
            ".product-brand",
            ".productView-brand",
            "#bylineInfo",
        ],
        "Price": [
            "[data-price]",
            ".price",
            ".product-price",
            ".current-price",
            ".productView-price",
            ".woocommerce-Price-amount",
            "[data-testid='product-price']",
        ],
        "Image URLs": [
            ".product-media img",
            ".product-image img",
            ".gallery img",
            "[data-image]",
            ".fotorama__stage img",
            ".woocommerce-product-gallery__image img",
            "img[src*='product']",
        ],
        "Description": [
            "[data-product-description]",
            ".description",
            "#productDescription",
            ".product-details",
            ".productView-description",
            ".woocommerce-product-details__short-description",
        ],
        "Features": [
            ".features li",
            "#feature-bullets li",
            ".product-features li",
        ],
        "UPC": [
            "[data-upc]",
            "[data-sku]",
            ".upc",
            ".sku",
            ".product-sku",
        ],
        "ItemNumber": [
            "[data-item-number]",
            ".item-number",
            ".product-code",
        ],
        "Weight": [
            "[data-weight]",
            ".weight",
            ".product-weight",
        ],
    }

    # Add platform-specific candidates if known
    platform_candidates = {
        "shopify": {
            "Name": ["h1", "[data-testid='product-title']", ".product__title"],
            "Brand": [".vendor", "[data-vendor]", ".product__vendor"],
            "Price": ["[data-price]", ".price", ".product__price"],
            "Image URLs": [".product-media img", ".product__media img"],
        },
        "bigcommerce": {
            "Name": ["h1.productView-title", "h1", ".product-title"],
            "Brand": [".productView-brand", "[data-brand]", ".brand"],
            "Price": [".productView-price", ".price", "[data-product-price]"],
            "Image URLs": ["[data-image-gallery-main-image]", ".productView-image img"],
        },
        "magento": {
            "Name": [".page-title", "h1", ".product-name"],
            "Brand": [".product-brand", "[data-brand]", ".brand"],
            "Price": [".price", ".product-price", "[data-price]"],
            "Image URLs": [".fotorama__stage img", ".gallery-placeholder img"],
        },
        "woocommerce": {
            "Name": [".product_title", "h1", ".product-title"],
            "Price": [".woocommerce-Price-amount", ".price", "[data-price]"],
            "Image URLs": [".woocommerce-product-gallery__image img", ".woocommerce-product-gallery img"],
        },
    }

    if platform and platform.lower() in platform_candidates:
        pc = platform_candidates[platform.lower()]
        for field, selectors in pc.items():
            # Prepend platform-specific selectors
            existing = candidates.get(field, [])
            candidates[field] = list(dict.fromkeys(selectors + existing))

    discovered = []
    for field_name, selector_list in candidates.items():
        best = None
        fallbacks = []
        for selector in selector_list:
            result = test_selector(selector)
            if result["count"] > 0:
                if best is None:
                    best = result
                else:
                    fallbacks.append(result)
        if best:
            discovered.append({
                "name": field_name,
                "selector": best["selector"],
                "attribute": "text" if field_name not in ("Image URLs", "UPC", "ItemNumber") else "src",
                "multiple": field_name in ("Image URLs", "Features"),
                "required": field_name in ("Name", "Price"),
                "sample_text": best["sample_text"],
                "fallback_selectors": [f["selector"] for f in fallbacks[:2]],
            })

    return discovered


def detect_login_required() -> bool:
    """Heuristically detect if login is required."""
    # Check for login links, gated content indicators
    login_indicators = [
        "a[href*='login']",
        "a[href*='signin']",
        "[data-testid='login-button']",
        ".login-required",
        ".gated-content",
    ]
    for selector in login_indicators:
        count = run_cli_raw("eval", f"document.querySelectorAll('{selector}').length")
        try:
            if int(count) > 0:
                return True
        except ValueError:
            pass
    return False


def detect_no_results(base_url: str, fake_sku: str = "FAKE12345XYZ") -> dict:
    """Navigate to a fake SKU search and detect no-results patterns."""
    search_urls = [
        f"{base_url}/search?q={fake_sku}",
        f"{base_url}/search?query={fake_sku}",
        f"{base_url}/s?k={fake_sku}",
        f"{base_url}/catalogsearch/result/?q={fake_sku}",
    ]

    no_results = {
        "selectors": [],
        "text_patterns": [],
    }

    for url in search_urls:
        run_cli("goto", url)
        time.sleep(2)

        # Check for common no-results selectors
        candidate_selectors = [
            ".no-results",
            ".search-results-empty",
            "[data-testid='no-results']",
            ".empty-state",
            ".plp-empty-state-message-container h3",
        ]
        for selector in candidate_selectors:
            count = run_cli_raw("eval", f"document.querySelectorAll('{selector}').length")
            try:
                if int(count) > 0:
                    no_results["selectors"].append(selector)
            except ValueError:
                pass

        # Check page text for no-results phrases
        page_text = run_cli_raw("eval", "document.body.innerText.toLowerCase()")
        phrases = [
            "no results found",
            "0 items",
            "your search returned no results",
            "no products found",
            "we couldn't find any matches",
        ]
        for phrase in phrases:
            if phrase in page_text:
                no_results["text_patterns"].append(phrase)

        if no_results["selectors"] or no_results["text_patterns"]:
            break

    # Deduplicate
    no_results["selectors"] = list(dict.fromkeys(no_results["selectors"]))
    no_results["text_patterns"] = list(dict.fromkeys(no_results["text_patterns"]))

    return no_results


def detect_platform() -> str | None:
    """Detect e-commerce platform from page content."""
    checks = [
        ("window.Shopify", "shopify"),
        ("data-shopify", "shopify"),
        ("BCData", "bigcommerce"),
        ("bigcommerce", "bigcommerce"),
        ("magento", "magento"),
        ("Mage.", "magento"),
        ("woocommerce", "woocommerce"),
    ]
    html = run_cli_raw("eval", "document.documentElement.innerHTML.slice(0, 5000)")
    for clue, platform in checks:
        if clue.lower() in html.lower():
            return platform
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover scraper selectors via playwright-cli")
    parser.add_argument("--url", required=True, help="Product page URL to inspect")
    parser.add_argument("--output", required=True, help="Output JSON file path")
    parser.add_argument("--platform", choices=["shopify", "bigcommerce", "magento", "woocommerce"],
                        help="Known platform (auto-detected if not provided)")
    parser.add_argument("--base-url", help="Base URL for no-results detection (inferred from --url if not provided)")
    parser.add_argument("--fake-sku", default="FAKE12345XYZ", help="Fake SKU for no-results detection")
    args = parser.parse_args()

    print(f"Opening {args.url}...")
    open_page(args.url)

    print("Taking snapshot...")
    snapshot = snapshot_page()

    print("Detecting platform...")
    platform = args.platform or detect_platform()
    if platform:
        print(f"Detected platform: {platform}")

    print("Mining data attributes...")
    data_attrs = mine_data_attributes()

    print("Discovering selectors...")
    selectors = discover_selectors(platform)

    print("Detecting login requirement...")
    login_required = detect_login_required()

    base_url = args.base_url or "/".join(args.url.split("/")[:3])
    print(f"Detecting no-results patterns at {base_url}...")
    no_results = detect_no_results(base_url, args.fake_sku)

    print("Closing browser...")
    run_cli("close")

    result = {
        "url": args.url,
        "base_url": base_url,
        "platform": platform,
        "login_required": login_required,
        "data_attributes": data_attrs,
        "selectors": selectors,
        "no_results": no_results,
        "snapshot_preview": snapshot[:1000] if snapshot else "",
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Discovery complete. Wrote {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
