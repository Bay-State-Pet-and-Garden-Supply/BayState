#!/usr/bin/env python3
"""
Performance benchmark script for comparing scraper speed and success rates.
Runs the AISearchScraper on a set of target SKUs and summarizes results.
"""

import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

# Add project root to python path
sys.path.append(str(Path(__file__).parents[1]))

from scrapers.ai_search.scraper import AISearchScraper

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("benchmark")

@dataclass
class BenchmarkResult:
    sku: str
    success: bool
    duration: float
    error: Optional[str] = None
    cost: float = 0.0
    source: Optional[str] = None

class PerformanceBenchmark:
    """Benchmark runner for scraper performance validation."""
    
    def __init__(self, ground_truth_path: str = "tests/fixtures/test_skus_ground_truth.json"):
        self.ground_truth_path = Path(ground_truth_path)
        self.results: List[BenchmarkResult] = []
        
    def _load_skus(self) -> List[dict]:
        """Load SKUs from ground truth file."""
        if not self.ground_truth_path.exists():
            logger.error(f"Ground truth file not found: {self.ground_truth_path}")
            return []
        with open(self.ground_truth_path, "r") as f:
            return json.load(f)

    async def run(self, max_items: Optional[int] = None):
        """Run the benchmark on the loaded SKUs."""
        skus_data = self._load_skus()
        if max_items:
            skus_data = skus_data[:max_items]
            
        logger.info(f"Starting benchmark on {len(skus_data)} SKUs...")
        
        # Initialize scraper with performance settings (Phase 1-4)
        # Note: ManagedBrowser and Tiered Timeouts are used internally by AISearchScraper
        scraper = AISearchScraper(headless=True)
        
        start_time = time.time()
        for item in skus_data:
            sku = item["sku"]
            brand = item.get("brand")
            name = item.get("name")
            
            logger.info(f"Processing SKU: {sku} ({brand})...")
            
            item_start = time.time()
            try:
                result = await scraper.scrape_product(sku=sku, brand=brand, product_name=name)
                
                self.results.append(BenchmarkResult(
                    sku=sku,
                    success=result.success,
                    duration=time.time() - item_start,
                    error=result.error,
                    cost=result.cost_usd,
                    source=result.source_website
                ))
                
                status = "SUCCESS" if result.success else f"FAILED: {result.error}"
                logger.info(f"  Result: {status} in {time.time() - item_start:.2f}s")
                
            except Exception as e:
                logger.error(f"  Exception for {sku}: {e}")
                self.results.append(BenchmarkResult(
                    sku=sku,
                    success=False,
                    duration=time.time() - item_start,
                    error=str(e)
                ))
        
        total_time = time.time() - start_time
        self._summarize(total_time)
        self._save_results()

    def _summarize(self, total_time: float):
        """Log a summary of the benchmark run."""
        if not self.results:
            logger.warning("No results to summarize.")
            return

        success_count = sum(1 for r in self.results if r.success)
        total_count = len(self.results)
        avg_duration = sum(r.duration for r in self.results) / total_count
        total_cost = sum(r.cost for r in self.results)
        
        logger.info("\n" + "="*50)
        logger.info("BENCHMARK SUMMARY (POST-FIX)")
        logger.info("="*50)
        logger.info(f"Total Items:    {total_count}")
        logger.info(f"Success Rate:   {(success_count/total_count)*100:.1f}%")
        logger.info(f"Avg Duration:   {avg_duration:.2f}s")
        logger.info(f"Total Cost:     ${total_cost:.4f}")
        logger.info(f"Total Time:     {total_time:.2f}s")
        logger.info("="*50)

    def _save_results(self, output_path: str = "tests/results/results_after_fixes.json"):
        """Save results to a JSON file."""
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        
        serialized = [
            {
                "sku": r.sku,
                "success": r.success,
                "duration": r.duration,
                "error": r.error,
                "cost": r.cost,
                "source": r.source
            }
            for r in self.results
        ]
        
        with open(out, "w") as f:
            json.dump(serialized, f, indent=2)
        logger.info(f"Results saved to {output_path}")

async def main():
    if not os.environ.get("OPENAI_API_KEY") or (not os.environ.get("SERPAPI_API_KEY") and not os.environ.get("BRAVE_API_KEY")):
        logger.error("Missing API keys (OPENAI_API_KEY and SERPAPI_API_KEY or BRAVE_API_KEY). Cannot run real benchmark.")
        # Optional: fall back to a mock mode or just exit
        sys.exit(1)

    benchmark = PerformanceBenchmark()
    await benchmark.run()

if __name__ == "__main__":
    asyncio.run(main())
