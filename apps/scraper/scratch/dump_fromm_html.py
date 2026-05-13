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

async def test_fromm_dump():
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
    
    # We need to hack into the extractor to get the HTML it uses
    # Or just run it and hope for the best
    print(f"Testing extraction for {url}...")
    try:
        # Hack: override _enrich_images to dump HTML
        original_enrich = extractor._enrich_images
        async def mocked_enrich(result_data, **kwargs):
            html = kwargs.get("html", "")
            with open("scratch/dumped_fromm.html", "w", encoding="utf-8") as f:
                f.write(html)
            print(f"Dumped HTML to scratch/dumped_fromm.html (Length: {len(html)})")
            return await original_enrich(result_data, **kwargs)
        
        extractor._enrich_images = mocked_enrich
        
        result = await extractor.extract(
            url, 
            sku="duck-liver-pate", 
            product_name="PurrSnickitty Duck Liver Pate",
            brand="Fromm Family Foods"
        )
        images = result.get("images", [])
        print(f"\nSUCCESS! Captured {len(images)} images")
            
    except Exception as e:
        print(f"\nFAILED with error: {e}")

if __name__ == "__main__":
    asyncio.run(test_fromm_dump())
