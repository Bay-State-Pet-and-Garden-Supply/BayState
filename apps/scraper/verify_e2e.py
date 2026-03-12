
import asyncio
import logging
import sys
import json
from pathlib import Path

# Setup path to include apps directory
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from apps.scraper.scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
from apps.scraper.scrapers.ai_search.scoring import SearchScorer
from apps.scraper.scrapers.ai_search.matching import MatchingUtils

async def run_e2e():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')
    
    scoring = SearchScorer()
    matching = MatchingUtils()
    
    # We use json_css strategy to avoid needing an OpenAI API key for this test
    extractor = Crawl4AIExtractor(
        headless=True,
        llm_model="gpt-4o",
        scoring=scoring,
        matching=matching,
        extraction_strategy="json_css" 
    )

    url = "https://www.petedge.com/master-equipment-grooming-table-with-arm"
    sku = "TP123"

    print(f"\n--- Phase 3 E2E Integration Test ---")
    print(f"Target URL: {url}")
    
    try:
        result = await extractor.extract(url, sku, "Grooming Table", "Master Equipment")
        print("\n--- Extraction Result ---")
        if result:
            print(json.dumps(result, indent=2))
        else:
            print("Extraction returned None.")
    except Exception as e:
        print(f"\n--- Extraction Failed ---")
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(run_e2e())
