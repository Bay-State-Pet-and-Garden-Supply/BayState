"""CLI runner for the extraction-only URL benchmark.

Usage:

    # Live run (requires LLM_API_KEY and network):
    python -m benchmarks.url_extraction.runner \\
        --dataset benchmarks/url_extraction/dataset.json \\
        --output-dir benchmarks/url_extraction/reports/latest \\
        --max-concurrency 2 \\
        --fail-under 0.80

    # Override LLM config:
    python -m benchmarks.url_extraction.runner \\
        --dataset ... \\
        --llm-model gpt-4o-mini \\
        --llm-api-key sk-...

    # With .env auto-load:
    LLM_API_KEY=... python -m benchmarks.url_extraction.runner \\
        --dataset ...
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Load .env from project root before any imports that read env vars
_project_root = Path(__file__).resolve().parent.parent.parent
_env_file = _project_root / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=True)

from benchmarks.url_extraction.metrics import score_extraction, summarize_scores
from benchmarks.url_extraction.report import build_report, write_report

logger = logging.getLogger(__name__)


def _load_dataset(path: Path) -> list[dict[str, Any]]:
    """Load the benchmark dataset."""
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = data.get("entries", [])
    if not entries:
        raise ValueError(f"No entries found in {path}")
    return entries


def _create_extractor(
    llm_model: str | None = None,
    llm_api_key: str | None = None,
    llm_base_url: str | None = None,
    headless: bool = True,
) -> Any:
    """Create a ProductPageExtractor with the given LLM config.

    Falls back to env vars / defaults if not provided.
    """
    from scrapers.product_url_extraction import ProductPageExtractor

    return ProductPageExtractor(
        headless=headless,
        llm_model=llm_model,
        llm_api_key=llm_api_key,
        llm_base_url=llm_base_url,
    )


async def _run_single(
    entry: dict[str, Any],
    extractor: Any,
    output_dir: Path,
    entry_id: str,
) -> dict[str, Any]:
    """Run extraction for a single entry and write raw output."""
    upc = str(entry.get("upc", "")).strip()
    source_url = str(entry.get("source_url", "")).strip()
    product_name = str(entry.get("product_name", "")).strip()
    brand = str(entry.get("brand", "")).strip()
    expected = entry.get("expected", {})
    tags = entry.get("tags", [])

    logger.info("[%s] Extracting %s", entry_id, source_url)

    start = time.perf_counter()
    try:
        result = await extractor.extract(
            url=source_url,
            upc=upc,
            product_name=product_name,
            brand=brand,
        )
        duration_ms = (time.perf_counter() - start) * 1000
        result["duration_ms"] = duration_ms
    except Exception as e:
        duration_ms = (time.perf_counter() - start) * 1000
        result: dict[str, Any] = {
            "success": False,
            "error": str(e),
            "duration_ms": duration_ms,
        }

    # Score the result
    score = score_extraction(result, expected, tags, entry_id=entry_id)
    logger.info(
        "[%s] Score: %.3f, hard_fails=%d, warnings=%d",
        entry_id,
        score.overall_score,
        len(score.hard_fails),
        len(score.warnings),
    )

    # Write raw result
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / f"{entry_id}.json"

    # Extract method from result for top-level visibility
    extraction_method = result.get("method", "unknown")

    # Extract image diagnostics from result telemetry when available
    image_diagnostics = None
    telemetry = result.get("telemetry", {})
    if isinstance(telemetry, dict):
        image_diagnostics = telemetry.get("image_diagnostics")
    # Also check top-level result for image diagnostics (some extractors put it there)
    if image_diagnostics is None:
        image_diagnostics = result.get("image_diagnostics")

    raw_output = {
        "entry_id": entry_id,
        "source_url": source_url,
        "upc": upc,
        "method": extraction_method,
        "duration_ms": duration_ms,
        "result": result,
        "image_diagnostics": image_diagnostics,
        "score": {
            "overall_score": score.overall_score,
            "hard_fails": score.hard_fails,
            "warnings": score.warnings,
            "metrics": {
                "brand_score": score.brand_score,
                "name_score": score.name_score,
                "description_score": score.description_score,
                "weight_match": score.weight_match,
                "species_match": score.species_match,
                "food_form_match": score.food_form_match,
                "flavor_score": score.flavor_score,
                "category_sane": score.category_sane,
                "category_sane_reason": score.category_sane_reason,
                "approved_image_count": score.approved_image_count,
                "image_count_in_bounds": score.image_count_in_bounds,
                "image_count_reason": score.image_count_reason,
                "forbidden_domain_hits": score.forbidden_domain_hits,
                "forbidden_path_hint_hits": score.forbidden_path_hint_hits,
                "dirty_html_hits": score.dirty_html_hits,
                "duplicate_ratio": score.duplicate_ratio,
            },
        },
    }
    raw_path.write_text(json.dumps(raw_output, indent=2, default=str), encoding="utf-8")

    return {
        "entry": entry,
        "result": result,
        "score": score,
    }


async def _run_all(
    entries: list[dict[str, Any]],
    extractor: Any,
    output_dir: Path,
    max_concurrency: int = 2,
) -> list[Any]:
    """Run extraction for all entries with concurrency control."""

    # Prepare entry IDs
    entry_ids: list[str] = []
    for entry in entries:
        eid = str(entry.get("id", "")).strip()
        if not eid:
            # Fallback: use UPC
            eid = str(entry.get("upc", "unknown_" + str(len(entry_ids))))
        entry_ids.append(eid)

    semaphore = asyncio.Semaphore(max(1, max_concurrency))

    async def _run_one(idx: int) -> dict[str, Any]:
        async with semaphore:
            return await _run_single(
                entries[idx], extractor, output_dir, entry_ids[idx],
            )

    results = await asyncio.gather(*[_run_one(i) for i in range(len(entries))])

    scores = [r["score"] for r in results]
    return scores


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extraction-only URL benchmark runner",
    )
    parser.add_argument(
        "--dataset",
        required=True,
        type=Path,
        help="Path to the dataset JSON file",
    )
    parser.add_argument(
        "--output-dir",
        default=Path("benchmarks/url_extraction/reports/latest"),
        type=Path,
        help="Output directory for reports and raw results",
    )
    parser.add_argument(
        "--max-concurrency",
        default=2,
        type=int,
        help="Maximum parallel extractions (default: 2)",
    )
    parser.add_argument(
        "--fail-under",
        default=None,
        type=float,
        help="Fail if overall pass rate is below this threshold (0.0-1.0)",
    )
    parser.add_argument(
        "--llm-model",
        default=None,
        help="LLM model override (default: from env or gpt-4o-mini)",
    )
    parser.add_argument(
        "--llm-api-key",
        default=None,
        help="LLM API key override (default: from env or .env)",
    )
    parser.add_argument(
        "--llm-base-url",
        default=None,
        help="LLM base URL override (default: from env or https://api.openai.com/v1)",
    )
    parser.add_argument(
        "--headless",
        default=True,
        type=lambda x: x.lower() in ("true", "1", "yes"),
        help="Run browser headless (default: true)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    parser.add_argument(
        "--allow-hard-fails",
        action="store_true",
        help="Allow hard failures without exiting nonzero (only --fail-under matters)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s [%(name)s] %(message)s",
    )

    # Validate dataset
    if not args.dataset.exists():
        print(f"Error: Dataset not found: {args.dataset}", file=sys.stderr)
        sys.exit(1)

    # Load dataset
    logger.info("Loading dataset from %s", args.dataset)
    entries = _load_dataset(args.dataset)
    logger.info("Loaded %d entries", len(entries))

    # Create extractor
    logger.info(
        "Creating ProductPageExtractor (model=%s, headless=%s)",
        args.llm_model or os.getenv("LLM_MODEL", "default"),
        args.headless,
    )
    extractor = _create_extractor(
        llm_model=args.llm_model,
        llm_api_key=args.llm_api_key,
        llm_base_url=args.llm_base_url,
        headless=args.headless,
    )

    # Run extraction
    logger.info(
        "Running extraction with concurrency=%d", args.max_concurrency,
    )
    scores = asyncio.run(
        _run_all(entries, extractor, args.output_dir, args.max_concurrency),
    )

    # Compute summary
    summary = summarize_scores(scores)
    logger.info(
        "Summary: pass_rate=%.1f%% avg_score=%.3f",
        summary["overall_pass_rate"] * 100,
        summary["average_overall_score"],
    )

    # Build report
    report = build_report(
        summary=summary,
        scores=scores,
        dataset_path=str(args.dataset),
        mode="live",
        fail_under=args.fail_under,
    )

    # Write reports
    json_path, md_path = write_report(report, args.output_dir, scores)
    logger.info("JSON report: %s", json_path)
    logger.info("Markdown report: %s", md_path)

    # Determine exit code
    total_hard_fails = sum(len(s.hard_fails) for s in scores)
    has_hard_fails = total_hard_fails > 0

    if args.fail_under is not None:
        # --fail-under takes precedence: check pass rate against threshold
        pass_rate = summary["overall_pass_rate"]
        passed = pass_rate >= args.fail_under
        logger.info(
            "Pass rate %.1f%% vs threshold %.0f%%: %s",
            pass_rate * 100,
            args.fail_under * 100,
            "PASSED" if passed else "FAILED",
        )
    elif args.allow_hard_fails:
        # --allow-hard-falls: exit 0 regardless of hard fails
        passed = True
        logger.info("Hard failures suppressed by --allow-hard-fails flag")
    else:
        # Default: exit 1 if any hard failures exist
        passed = not has_hard_fails
        logger.info(
            "Hard failures %s — %s",
            f"{total_hard_fails} found across {len([s for s in scores if s.hard_fails])} entries" if has_hard_fails else "none",
            "PASSED" if passed else "FAILED",
        )

    # Summarize hard fails
    if has_hard_fails:
        logger.warning("%d total hard failures across all entries", total_hard_fails)
        for s in scores:
            if s.hard_fails:
                logger.warning("  %s: %s", s.entry_id, s.hard_fails)

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
