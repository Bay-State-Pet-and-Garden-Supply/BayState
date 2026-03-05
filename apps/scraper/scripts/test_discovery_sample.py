#!/usr/bin/env python3

import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Union

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    from apps.scraper.ai.discovery import AIDiscoveryScraper  # type: ignore
except Exception:
    from scrapers.ai_discovery import AIDiscoveryScraper


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


TEST_PRODUCTS = [
    {"sku": "TEST001", "register_name": "PURINA PROPLAN CHKN 40LB"},
    {"sku": "TEST002", "register_name": "BLUE BUFFALO LAMB RICE 30LB"},
    {"sku": "TEST003", "register_name": "WELLNESS CORE FISH 24LB"},
]

BASELINE_SUCCESS_RATE = float(os.getenv("DISCOVERY_BASELINE_SUCCESS_RATE", "0.0"))
OUTPUT_FILE = "logs/discovery_test_results.json"

ResultField = Union[str, bool, float, None]


async def main() -> None:
    scraper = AIDiscoveryScraper()
    results: list[dict[str, ResultField]] = []

    os.makedirs("logs", exist_ok=True)

    logger.info("=" * 60)
    logger.info("Discovery Integration Test (SKU-only style input)")
    logger.info("=" * 60)
    logger.info("Sample size: %d", len(TEST_PRODUCTS))
    logger.info("Baseline success rate: %.1f%%", BASELINE_SUCCESS_RATE * 100)

    for product in TEST_PRODUCTS:
        sku = product["sku"]
        register_name = product["register_name"]
        logger.info("\nTesting %s...", sku)

        try:
            result = await scraper.scrape_product(
                sku=sku,
                product_name=register_name,
                brand=None,
            )

            record = {
                "sku": sku,
                "register_name": register_name,
                "success": result.success,
                "confidence": float(result.confidence),
                "product_found": result.product_name,
                "brand_found": result.brand,
                "source_url": result.url,
                "source_website": result.source_website,
                "error": result.error,
                "cost_usd": float(result.cost_usd),
            }
            results.append(record)

            status = "✓" if result.success else "✗"
            logger.info("  %s %s: confidence=%.2f", status, sku, result.confidence)
            if result.success:
                logger.info("    Found: %s", result.product_name)
                logger.info("    Brand: %s", result.brand)
                logger.info("    URL: %s", result.url)
            else:
                logger.info("    Error: %s", result.error)

        except Exception as exc:
            logger.error("  ✗ %s: Exception - %s", sku, exc)
            results.append(
                {
                    "sku": sku,
                    "register_name": register_name,
                    "success": False,
                    "confidence": 0.0,
                    "product_found": None,
                    "brand_found": None,
                    "source_url": None,
                    "source_website": None,
                    "error": str(exc),
                    "cost_usd": 0.0,
                }
            )

    successful = sum(1 for item in results if bool(item.get("success")))
    total = len(results)
    success_rate = (successful / total) if total else 0.0
    improvement_abs = success_rate - BASELINE_SUCCESS_RATE

    logger.info("\n" + "=" * 60)
    logger.info("Results Summary")
    logger.info("=" * 60)
    logger.info("Total: %d", total)
    logger.info("Successful: %d", successful)
    logger.info("Success Rate: %.1f%%", success_rate * 100)
    logger.info("Baseline: %.1f%%", BASELINE_SUCCESS_RATE * 100)
    logger.info("Improvement over baseline: %+0.1f percentage points", improvement_abs * 100)

    output = {
        "test_date": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total": total,
            "successful": successful,
            "success_rate": success_rate,
            "baseline_success_rate": BASELINE_SUCCESS_RATE,
            "improvement_absolute": improvement_abs,
            "improvement_percentage_points": improvement_abs * 100,
        },
        "results": results,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(output, file, indent=2)

    logger.info("\nDetailed results saved to: %s", OUTPUT_FILE)


if __name__ == "__main__":
    asyncio.run(main())
