#!/usr/bin/env python3
"""
Performance benchmark script for comparing scraper speed and success rates.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import List

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger("benchmark")

@dataclass
class ScrapeResult:
    site: str
    sku: str
    success: bool
    duration: float
    error_type: str = None

async def benchmark_site(site: str, skus: List[str]):
    """Run benchmark for a single site."""
    from utils.scraping.browser_context import ManagedBrowser
    
    results = []
    logger.info(f"Benchmarking {site} with {len(skus)} SKUs...")
    
    for sku in skus:
        start_time = time.time()
        success = False
        error_type = None
        
        try:
            async with ManagedBrowser(site_name=site) as browser:
                # Simulate a real scrape (placeholder for actual executor call)
                await browser.get(f"https://example.com/search?q={sku}")
                await asyncio.sleep(1) # Simulate processing
                success = True
        except Exception as e:
            error_type = type(e).__name__
            
        duration = time.time() - start_time
        results.append(ScrapeResult(site, sku, success, duration, error_type))
        
    return results

async def main():
    sites = ["mazuri", "coastal"]
    skus = ["SKU1", "SKU2", "SKU3"]
    
    start_time = time.time()
    all_results = []
    
    for site in sites:
        site_results = await benchmark_site(site, skus)
        all_results.extend(site_results)
        
    total_duration = time.time() - start_time
    
    # Summary
    success_count = sum(1 for r in all_results if r.success)
    avg_duration = sum(r.duration for r in all_results) / len(all_results)
    
    logger.info("\n" + "="*40)
    logger.info("BENCHMARK SUMMARY")
    logger.info("="*40)
    logger.info(f"Total Scrapes: {len(all_results)}")
    logger.info(f"Success Rate:  {(success_count/len(all_results))*100:.1f}%")
    logger.info(f"Avg Duration:  {avg_duration:.2f}s")
    logger.info(f"Total Time:    {total_duration:.2f}s")
    logger.info("="*40)

if __name__ == "__main__":
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    asyncio.run(main())
