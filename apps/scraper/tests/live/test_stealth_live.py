import json
import pytest
import os
from crawl4ai_engine.engine import Crawl4AIEngine

def load_stealth_targets():
    """Load stealth targets from the fixture file."""
    fixture_path = os.path.join(os.path.dirname(__file__), "..", "fixtures", "stealth_targets.json")
    with open(fixture_path, "r") as f:
        targets = json.load(f)
    
    # Mark known Kasada-protected targets as xfail
    processed_targets = []
    for t in targets:
        if t["retailer"].lower() == "chewy":
            processed_targets.append(pytest.param(t, marks=pytest.mark.xfail(reason="Kasada protection active. Requires residential proxy/TLS spoofing.")))
        else:
            processed_targets.append(t)
    return processed_targets

@pytest.mark.live
@pytest.mark.asyncio
@pytest.mark.parametrize("target", load_stealth_targets())
async def test_crawl4ai_stealth_bypass(target):
    """
    Live stealth test to verify Crawl4AIEngine can bypass bot protections 
    on high-value retail targets.
    """
    url = target["url"]
    retailer = target["retailer"]
    safe_marker = target["safe_marker"]

    # Use a standard stealth configuration
    config = {
        "browser": {
            "headless": True,
            "enable_stealth": True,
            "browser_type": "chromium",
            "user_agent_mode": "random",
        },
        "crawler": {
            "magic": True,
            "simulate_user": True,
            "wait_until": "domcontentloaded",  # More robust for retail sites
            "page_timeout": 60000,            # Increase to 60s for live targets
        }
    }

    async with Crawl4AIEngine(config) as engine:
        result = await engine.crawl(url)

        # 1. Assert result["success"] is True
        assert result["success"] is True, f"Crawl failed for {retailer} ({url}): {result.get('error')}"

        # 2. Assert no anti-bot fallback triggered
        # (This indicates the engine handled it or it didn't trigger)
        assert not result.get("fallback_triggered"), f"Anti-bot fallback was unexpectedly triggered for {retailer}"

        # Additional check: ensure no anti-bot related error strings in the error field if it exists
        error_msg = str(result.get("error") or "").lower()
        anti_bot_patterns = ["403", "429", "forbidden", "too many requests", "captcha", "datadome", "cloudflare"]
        for pattern in anti_bot_patterns:
            assert pattern not in error_msg, f"Anti-bot signature '{pattern}' found in error for {retailer}"

        # 3. Assert safe_marker exists in html or cleaned_html
        html_content = (result.get("html") or "") + (result.get("cleaned_html") or "")
        assert safe_marker.lower() in html_content.lower(), \
            f"Safe marker '{safe_marker}' not found in {retailer} content. Stealth may have failed."
