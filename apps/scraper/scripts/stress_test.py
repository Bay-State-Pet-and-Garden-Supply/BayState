#!/usr/bin/env python3
"""
Stress test script for validating scraper stability and resource cleanup.
Simulates heavy load by running multiple concurrent scraping jobs.
"""

import asyncio
import logging
import os
import psutil
import time
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("stress_test")

async def monitor_resources(duration_secs: int):
    """Monitor memory and process count during the test."""
    process = psutil.Process(os.getpid())
    start_time = time.time()
    
    logger.info(f"Starting resource monitoring for {duration_secs}s")
    
    while time.time() - start_time < duration_secs:
        mem_info = process.memory_info()
        # Get count of child processes (Playwright browsers)
        children = process.children(recursive=True)
        
        logger.info(
            f"RESOURCES: RSS={mem_info.rss / 1024 / 1024:.2f}MB, "
            f"VMS={mem_info.vms / 1024 / 1024:.2f}MB, "
            f"ChildProcesses={len(children)}"
        )
        
        await asyncio.sleep(5)

async def run_simulated_scrape(site: str, index: int):
    """Run a single simulated scraping operation."""
    from utils.scraping.browser_context import ManagedBrowser
    
    logger.info(f"[{site}-{index}] Starting scrape...")
    try:
        async with ManagedBrowser(site_name=site) as browser:
            # Simulate some activity
            await browser.get("https://example.com")
            await asyncio.sleep(random.uniform(1, 3))
            
            # Intentional failure to test cleanup on error
            if index % 3 == 0:
                raise RuntimeError("Simulated failure")
                
            logger.info(f"[{site}-{index}] Completed successfully")
    except Exception as e:
        logger.warning(f"[{site}-{index}] Scrape failed (expected cleanup): {e}")

import random

async def main():
    test_duration = 60  # Shortened for verification
    concurrency = 5
    
    logger.info("Starting Scraper Stress Test")
    
    # Start monitor in background
    monitor_task = asyncio.create_task(monitor_resources(test_duration))
    
    start_time = time.time()
    task_count = 0
    
    while time.time() - start_time < test_duration:
        tasks = []
        for i in range(concurrency):
            tasks.append(run_simulated_scrape(f"site_{i}", task_count))
            task_count += 1
            
        await asyncio.gather(*tasks)
        await asyncio.sleep(1)
        
    await monitor_task
    logger.info(f"Stress test completed. Total tasks run: {task_count}")

if __name__ == "__main__":
    # Ensure we can import from parent dir
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    asyncio.run(main())
