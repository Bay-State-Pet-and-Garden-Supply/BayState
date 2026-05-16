#!/usr/bin/env python3
"""Test Phillips Pet login automation and product extraction."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Ensure project root
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


async def test_login() -> dict:
    """Test Phillips login using Playwright. Returns result dict."""
    from playwright.async_api import async_playwright
    from bs4 import BeautifulSoup

    username = os.environ.get("PHILLIPS_USERNAME", "")
    password = os.environ.get("PHILLIPS_PASSWORD", "")
    result = {"login_success": False, "error": "", "details": {}}

    if not username or not password:
        result["error"] = "PHILLIPS_USERNAME or PHILLIPS_PASSWORD not set"
        return result

    result["details"]["username_redacted"] = (
        username[:2] + "***" + username[-1] if len(username) > 4 else "***"
    )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Step 1: Navigate to login page
        await page.goto(
            "https://shop.phillipspet.com/ccrz__CCSiteLogin",
            wait_until="networkidle",
            timeout=30000,
        )
        result["details"]["login_page_url"] = page.url[:80]

        # Check form exists
        email = await page.query_selector("#emailField")
        pwd = await page.query_selector("#passwordField")
        submit = await page.query_selector("#send2Dsk")
        result["details"]["form_fields"] = {
            "emailField": "FOUND" if email else "MISSING",
            "passwordField": "FOUND" if pwd else "MISSING",
            "send2Dsk": "FOUND" if submit else "MISSING",
        }

        if not email or not pwd:
            result["error"] = "Login form fields not found on Phillips page"
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")
            title = soup.select_one("title")
            result["details"]["page_title"] = (
                title.get_text(strip=True)[:60] if title else "NONE"
            )
            forms = soup.select("form")
            result["details"]["forms_count"] = len(forms)
            inputs = soup.select("input[type=text], input[type=email], input[type=password]")
            result["details"]["input_fields"] = [
                f"id={inp.get('id','')[:20]} name={inp.get('name','')[:30]}"
                for inp in inputs[:5]
            ]
            await browser.close()
            return result

        # Step 2: Fill and submit
        await page.fill("#emailField", username)
        await page.fill("#passwordField", password)
        await page.click("#send2Dsk")

        # Step 3: Wait for redirect chain
        await asyncio.sleep(3)
        try:
            await page.wait_for_load_state("networkidle", timeout=20000)
        except Exception as e:
            result["details"]["wait_error"] = str(e)[:100]

        result["details"]["post_login_url"] = page.url[:120]

        # Step 4: Navigate to homepage to verify session
        await page.goto(
            "https://shop.phillipspet.com/",
            wait_until="networkidle",
            timeout=30000,
        )
        result["details"]["homepage_url"] = page.url[:80]

        content = await page.content()
        soup = BeautifulSoup(content, "html.parser")

        # Check login indicators
        logout = soup.select_one(
            "a.doLogout, a.cc_do_logout, [class*=logout], [class*=Logout], a[href*=logout]"
        )
        result["details"]["logout_link"] = "FOUND" if logout else "NOT FOUND"

        signout_text = (
            "sign out" in content.lower()
            or "logout" in content.lower()
            or "my account" in content.lower()
        )
        result["details"]["account_text_found"] = signout_text

        # Check if we're still on login
        if "CCSiteLogin" in page.url or "login" in page.url.lower():
            result["details"]["redirected_to_login"] = True
        else:
            result["details"]["redirected_to_login"] = False

        # Step 5: Try product search
        search_url = (
            "https://shop.phillipspet.com/ccrz__ProductList"
            "?cartID=&operation=quickSearch&searchText=072705115310"
            "&portalUser=&store=DefaultStore&cclcl=en_US"
        )
        await page.goto(search_url, wait_until="networkidle", timeout=30000)
        result["details"]["search_page_url"] = page.url[:80]

        search_content = await page.content()
        soup_search = BeautifulSoup(search_content, "html.parser")

        product_name = soup_search.select_one(
            ".cc_product_name, #plp-desktop-row .cc_product_name, h1"
        )
        result["details"]["product_name_element"] = "FOUND" if product_name else "NOT FOUND"
        if product_name:
            result["details"]["product_name_text"] = product_name.get_text(strip=True)[:80]

        # Check if login page appears again
        login_form_visible = bool(soup_search.select_one("#emailField"))
        result["details"]["login_form_on_search"] = "YES" if login_form_visible else "NO"

        no_results = "no results" in search_content.lower() or "no products" in search_content.lower()
        result["details"]["no_results_text"] = no_results

        # Check for errors on login page
        if login_form_visible:
            await page.goto(
                "https://shop.phillipspet.com/ccrz__CCSiteLogin",
                wait_until="networkidle",
                timeout=30000,
            )
            error_content = await page.content()
            error_soup = BeautifulSoup(error_content, "html.parser")
            for sel in [".cc-error-message", ".login-error", ".error", "[class*=error]"]:
                elem = error_soup.select_one(sel)
                if elem:
                    text = elem.get_text(strip=True)
                    if text:
                        result["details"]["login_error"] = text[:100]
                        break
            if "login_error" not in result["details"]:
                result["details"]["login_error"] = "None found"

        # Determine overall success
        if login_form_visible:
            result["login_success"] = False
        else:
            result["login_success"] = True

        if not result["login_success"] and not result["error"]:
            result["error"] = "Login form still visible after login attempt"

        await browser.close()
        return result


async def test_adapter_extract() -> dict:
    """Test the Phillips adapter's extract() flow."""
    from scrapers.approved_sources.adapters.phillips import PhillipsAdapter
    from scrapers.approved_sources.types import (
        ApprovedSourcePlanEntry,
        ApprovedSourcePlan,
        ApprovedSourcePolicy,
        ApprovedSourceBrand,
    )

    result = {"status": "", "error": "", "product_fields": {}}

    try:
        entry = ApprovedSourcePlanEntry(
            sourceType="distributor",
            sourceSlug="phillips",
            displayName="Phillips",
            domains=["shop.phillipspet.com"],
            assetDomains=["shop.phillipspet.com"],
            adapterSlug="phillips_crawl4ai",
            requiresAuth=True,
            searchMode="sku_search",
            allowedFields=["name", "brand", "sku", "upc", "images", "weight"],
        )
        plan = ApprovedSourcePlan(
            sku="072705115310",
            brand=ApprovedSourceBrand(id="phillips", name="Fromm", slug="fromm"),
            input={"name": "Fromm Gold Large Breed Dog 30 lb", "price": None},
            sourcePolicy=ApprovedSourcePolicy(
                allowedDomains=["shop.phillipspet.com"],
                allowedAssetDomains=["shop.phillipspet.com"],
                approvedSourcesOnly=True,
            ),
        )
        adapter = PhillipsAdapter(entry, plan)

        extract_result = await adapter.extract(extractor=None)

        if extract_result:
            result["status"] = extract_result.status
            result["confidence"] = extract_result.confidence.overall
            if extract_result.product:
                result["product_fields"] = extract_result.product.model_dump()
            if extract_result.validation:
                result["warnings"] = extract_result.validation.warnings
            if extract_result.source:
                result["source_url"] = extract_result.source.url[:80]
        else:
            result["status"] = "none"
            result["error"] = "extract() returned None"

    except Exception as e:
        result["status"] = "exception"
        result["error"] = f"{type(e).__name__}: {str(e)[:200]}"

    return result


async def main():
    print("=" * 60)
    print("PHILLIPS PET LOGIN AUTOMATION TEST")
    print("=" * 60)

    login_result = await test_login()

    print()
    print("--- Login Test Results ---")
    print(f"Login success: {login_result['login_success']}")
    if login_result.get("error"):
        print(f"Error: {login_result['error']}")
    for k, v in login_result.get("details", {}).items():
        print(f"  {k}: {v}")
    print()

    # Only run adapter test if login succeeded (needs credentials to auth)
    print("--- Adapter Extract Test ---")
    # The adapter tests credentials first, which should work with env vars
    adapter_result = await test_adapter_extract()
    print(f"Adapter status: {adapter_result['status']}")
    print(f"Adapter error: {adapter_result.get('error', 'none')}")
    if adapter_result.get("confidence"):
        print(f"Confidence: {adapter_result['confidence']}")
    if adapter_result.get("product_fields"):
        pf = adapter_result["product_fields"]
        print(f"Product name: {pf.get('name', '')}")
        print(f"Brand: {pf.get('brand', '')}")
        print(f"SKU: {pf.get('sku', '')}")
        print(f"Images: {len(pf.get('image_urls', []))}")
    if adapter_result.get("warnings"):
        print(f"Warnings: {adapter_result['warnings']}")
    print()
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
