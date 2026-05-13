import asyncio
import os
import sys
from pathlib import Path

# Add apps/scraper to sys.path
scraper_path = Path(r"c:\Users\thoma\OneDrive\Desktop\scripts\BayState\apps\scraper")
sys.path.append(str(scraper_path))

from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.matching import MatchingUtils
from src.crawl4ai_engine.engine import Crawl4AIEngine
from scrapers.utils.ai_utils import get_scroll_javascript

async def test_fromm_html():
    engine_config = {
        "browser": {"headless": True},
        "crawler": {
            "wait_for_images": True,
            "scan_full_page": True,
            "js_code": get_scroll_javascript(),
            "wait_until": "networkidle"
        }
    }
    
    url = "https://frommfamily.com/products/cat/purrsnickitty/can/duck-liver-pate/"
    async with Crawl4AIEngine(engine_config) as engine:
        result = await engine.crawl(url)
        html = result.get("html", "")
        print(f"HTML Length: {len(html)}")
        
        # Search for a few sample images from 6-12
        # Example image 6 from subagent: tpurrsnickitty_brand.jpg
        samples = ["tpurrsnickitty_brand", "tpurrsnickitty_texture", "tpurrsnickitty_mrsmooshy"]
        for sample in samples:
            if sample.lower() in html.lower():
                print(f"FOUND: {sample}")
            else:
                print(f"NOT FOUND: {sample}")

if __name__ == "__main__":
    asyncio.run(test_fromm_html())
