"""Gated live-mode smoke test for the AI Search E2E benchmark.

This test runs the benchmark against **real** search APIs and live product pages.
It is gated behind `@pytest.mark.live` so it never runs in normal CI or local
`python -m pytest` invocations (see pytest.ini: `-m "not live"`).

Requires environment variables:
  - SERPER_API_KEY (required) — search provider
  - OPENAI_API_KEY or GEMINI_API_KEY (required) — LLM extraction

This is a manual-only, observability test. It does NOT enforce hard thresholds
on success rates. Results vary between runs as search rankings and product
pages change.

Usage:
    export SERPER_API_KEY="your_key"
    export OPENAI_API_KEY="your_key"
    python -m pytest tests/integration/test_ai_search_e2e_live.py -m live
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

from benchmarks.ai_search.runner import run_ai_search_e2e_benchmark

pytestmark = pytest.mark.live

logger = logging.getLogger(__name__)
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

LIVE_SMOKE_DATASET = Path("benchmarks/ai_search/fixtures/live_smoke_dataset.json")


@pytest.mark.asyncio
async def test_live_smoke_runs_and_produces_report(tmp_path: Path) -> None:
    """Run the 3-SKU live smoke profile and verify report artifacts are produced.

    This test exercises real search queries, live page crawling, and LLM-based
    product extraction. Results are logged for human review but no pass/fail
    thresholds are enforced.

    The test is skipped automatically when the required API keys are absent.
    """
    # ---- Guard: required environment variables ----
    if not os.getenv("SERPER_API_KEY"):
        pytest.skip("SERPER_API_KEY not set — live search unavailable")

    if not os.getenv("OPENAI_API_KEY") and not os.getenv("GEMINI_API_KEY"):
        pytest.skip(
            "No LLM API key (OPENAI_API_KEY or GEMINI_API_KEY) — "
            "extraction requires an LLM provider"
        )

    # ---- Guard: dataset must exist ----
    if not LIVE_SMOKE_DATASET.exists():
        pytest.fail(f"Live smoke dataset not found: {LIVE_SMOKE_DATASET}")

    output_dir = tmp_path / "reports"

    report, json_path, md_path, _passed = await run_ai_search_e2e_benchmark(
        dataset_path=LIVE_SMOKE_DATASET,
        output_dir=output_dir,
        mode="live",
        page_fixtures_dir=None,  # force live crawl
        headless=True,
        max_concurrency=1,
        fail_under_end_to_end_rate=None,  # no threshold gate
        data_quality_threshold=0.0,  # don't fail on quality
    )

    # ---- Assert report artifacts exist ----
    assert json_path.exists(), f"JSON report not found at {json_path}"
    assert md_path.exists(), f"Markdown report not found at {md_path}"
    assert report["benchmark_type"] == "ai_search_end_to_end"
    assert report["mode"] == "live"
    assert report["summary"]["total_entries"] == 3

    # ---- Log summary for human review ----
    summary = report["summary"]
    logger.info(
        "Live smoke complete: "
        "e2e=%.0f%%, domain=%.0f%%, search=%.0f%%, url_selection=%.0f%%, "
        "crawl=%.0f%%, extraction=%.0f%%, validation=%.0f%%, "
        "entries=%d, failures=%s",
        float(summary["end_to_end_success_rate"]) * 100,
        float(summary["domain_match_rate"]) * 100,
        float(summary["search_success_rate"]) * 100,
        float(summary["url_selection_success_rate"]) * 100,
        float(summary["crawl_success_rate"]) * 100,
        float(summary["extraction_success_rate"]) * 100,
        float(summary["validation_pass_rate"]) * 100,
        int(summary["total_entries"]),
        summary.get("failure_breakdown", {}),
    )

    logger.info(
        "Live smoke quality: brand=%.3f, name=%.3f, desc=%.3f, "
        "size=%.3f, img=%.3f, cat=%.3f, overall=%.3f",
        float(summary.get("average_brand_score", 0.0)),
        float(summary.get("average_name_score", 0.0)),
        float(summary.get("average_description_score", 0.0)),
        float(summary.get("average_size_metrics_score", 0.0)),
        float(summary.get("average_image_score", 0.0)),
        float(summary.get("average_categories_score", 0.0)),
        float(summary.get("average_overall_quality_score", 0.0)),
    )

    # Per-entry logging for detailed review
    for entry in report["entries"]:
        sku = entry["sku"]
        stages = entry["stages"]
        quality = entry["field_quality"]
        logger.info(
            "[%s] success=%s, stage=%s, reason=%s, "
            "quality=%.2f, discovery=%s",
            sku,
            stages["end_to_end_success"],
            entry.get("failure_stage", "none"),
            entry.get("failure_reason", "none"),
            quality["overall_score"],
            entry.get("discovered_url", "none"),
        )

    # NOTE: No hard assertions on success rates.
    # This is an observability test, not a CI gate.
    # Results vary between runs as search rankings and pages change.
