#!/usr/bin/env python3
import asyncio
import sys
import logging
from pathlib import Path

# Ensure the scraper package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from src.crawl4ai_engine.engine import Crawl4AIEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

async def test_crawl(wait_until, enable_stealth, magic):
    print(f"\n--- Testing with wait_until={wait_until}, enable_stealth={enable_stealth}, magic={magic} ---")
    engine_config = {
        "browser": {
            "headless": True,
            "viewport": {"width": 1920, "height": 1080},
            "enable_stealth": enable_stealth,
        },
        "crawler": {
            "magic": magic,
            "simulate_user": magic,
            "override_navigator": magic,
            "remove_overlay_elements": True,
            "cache_mode": "BYPASS",
            "wait_for_images": True,
            "scan_full_page": True,
            "scroll_delay": 0.45,
            "timeout": 30000,
            "wait_until": wait_until,
        },
    }
    
    url = "https://drmartypets.com/product/natures-blend-premium-origin"
    async with Crawl4AIEngine(engine_config) as engine:
        try:
            result = await engine.crawl(url)
            print("Crawl Success:", result.get("success"))
            print("Error details:", result.get("error"))
            html = result.get("html") or ""
            markdown = result.get("markdown") or ""
            print(f"HTML length: {len(html)}")
            print(f"Markdown length: {len(markdown)}")
            if len(markdown) > 0:
                print("First 200 chars of markdown:")
                print(markdown[:200])
        except Exception as e:
            print("Exception occurred:", e)

async def main():
    # 1. Default config: wait_until="networkidle", enable_stealth=True, magic=True
    await test_crawl(wait_until="networkidle", enable_stealth=True, magic=True)
    
    # 2. Relaxed wait: wait_until="domcontentloaded", enable_stealth=True, magic=True
    await test_crawl(wait_until="domcontentloaded", enable_stealth=True, magic=True)

    # 3. Failed retry config (stealth/magic disabled): wait_until="domcontentloaded", enable_stealth=False, magic=False
    await test_crawl(wait_until="domcontentloaded", enable_stealth=False, magic=False)

if __name__ == "__main__":
    asyncio.run(main())
