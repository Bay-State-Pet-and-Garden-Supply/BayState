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

async def test_fromm():
    # Set dummy env vars to avoid API errors
    os.environ["SCRAPER_API_URL"] = "http://localhost:3000"
    os.environ["SCRAPER_API_KEY"] = "bsr_test"
    
    scoring = SearchScorer()
    matching = MatchingUtils()
    
    extractor = Crawl4AIExtractor(
        headless=True,
        llm_model="gpt-4o-mini",
        scoring=scoring,
        matching=matching
    )
    
    url = "https://frommfamily.com/products/cat/purrsnickitty/can/duck-liver-pate/"
    
    print(f"Testing extraction for {url}...")
    try:
        result = await extractor.extract(
            url, 
            sku="duck-liver-pate", 
            product_name="PurrSnickitty Duck Liver Pate",
            brand="Fromm Family Foods"
        )
        images = result.get("images", [])
        print(f"\nSUCCESS! Captured {len(images)} images")
        for i, img in enumerate(images, 1):
            print(f"  {i}. {img}")
            
    except Exception as e:
        import traceback
        print(f"\nFAILED with error: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_fromm())
