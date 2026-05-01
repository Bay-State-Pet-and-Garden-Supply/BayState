"""Capture page fixtures for the AI Search end-to-end benchmark.

This script crawls the expected_source_url for each entry in the benchmark dataset
and saves the raw HTML/markdown as fixture files. These fixtures enable deterministic,
repeatable extraction benchmarking without live network calls.

Usage:
    python -m benchmarks.ai_search.capture_page_fixtures \
        --dataset benchmarks/ai_search/fixtures/e2e_dataset.json \
        --output-dir benchmarks/ai_search/fixtures/page_fixtures
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from benchmarks.ai_search.dataset import load_dataset
from benchmarks.ai_search.runner import _write_page_fixture
from src.crawl4ai_engine.engine import Crawl4AIEngine

logger = logging.getLogger(__name__)


async def capture_page(
    url: str,
    sku: str,
    headless: bool = True,
) -> dict[str, object] | None:
    """Capture a single page and return its content."""
    engine_config = {
        "browser": {
            "headless": headless,
            "viewport": {"width": 1920, "height": 1080},
        },
        "crawler": {
            "magic": True,
            "simulate_user": True,
            "remove_overlay_elements": True,
            "cache_mode": "BYPASS",
            "timeout": 30000,
            "wait_until": "networkidle",
        },
    }

    try:
        async with Crawl4AIEngine(engine_config) as engine:
            result = await engine.crawl(url)
            if not result.get("success"):
                logger.warning("[%s] Crawl failed: %s", sku, result.get("error"))
                return None

            html_raw = result.get("html")
            markdown_raw = result.get("markdown")
            fit_markdown_raw = result.get("fit_markdown")
            raw_markdown_raw = result.get("raw_markdown")

            html = html_raw if isinstance(html_raw, str) else ""
            markdown = str(markdown_raw or "")
            fit_markdown = str(fit_markdown_raw or "")
            raw_markdown = str(raw_markdown_raw or "")
            effective_markdown = fit_markdown or raw_markdown or markdown

            return {
                "url": url,
                "final_url": str(result.get("final_url") or url),
                "html": html,
                "markdown": effective_markdown,
                "status_code": 200,  # Crawl4AI doesn't expose status directly
            }
    except Exception as exc:
        logger.warning("[%s] Exception during capture: %s", sku, exc)
        return None


async def main() -> None:
    parser = argparse.ArgumentParser(description="Capture page fixtures for AI Search E2E benchmark")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path("benchmarks/ai_search/fixtures/e2e_dataset.json"),
        help="Path to the benchmark dataset JSON",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("benchmarks/ai_search/fixtures/page_fixtures"),
        help="Directory to write captured fixtures",
    )
    parser.add_argument(
        "--max-concurrency",
        type=int,
        default=2,
        help="Maximum concurrent captures",
    )
    parser.add_argument(
        "--no-headless",
        action="store_true",
        help="Run browser with visible window",
    )
    parser.add_argument(
        "--skus",
        nargs="*",
        help="Only capture specific SKUs (default: all)",
    )
    args = parser.parse_args()

    entries = load_dataset(args.dataset)
    if args.skus:
        sku_set = set(args.skus)
        entries = [e for e in entries if e.sku in sku_set]

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logger.info("Capturing %d page fixtures to %s", len(entries), args.output_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    semaphore = asyncio.Semaphore(max(1, args.max_concurrency))

    async def _capture_one(entry) -> None:
        async with semaphore:
            logger.info("[%s] Capturing %s ...", entry.sku, entry.expected_source_url)
            captured = await capture_page(
                url=entry.expected_source_url,
                sku=entry.sku,
                headless=not args.no_headless,
            )
            if captured:
                fixture_path = _write_page_fixture(
                    page_fixtures_dir=args.output_dir,
                    url=entry.expected_source_url,
                    html=captured["html"],
                    markdown=captured["markdown"],
                    final_url=captured["final_url"],
                    status_code=captured["status_code"],
                )
                html_len = len(captured["html"])
                md_len = len(captured["markdown"])
                logger.info(
                    "  [%s] Saved to %s (html=%d, md=%d)",
                    entry.sku,
                    fixture_path.name,
                    html_len,
                    md_len,
                )

    await asyncio.gather(*[_capture_one(e) for e in entries])
    logger.info("Capture complete.")


if __name__ == "__main__":
    asyncio.run(main())
