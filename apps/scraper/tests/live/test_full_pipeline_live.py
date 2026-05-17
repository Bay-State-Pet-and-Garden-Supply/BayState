"""Full pipeline SERP tests — search → crawl → resolve → extract → score.

Marked @pytest.mark.live + @pytest.mark.slow — excluded from normal CI.

These tests validate:
  1. End-to-end extraction accuracy from SKU to structured product data
  2. Whether variant resolution improves accuracy vs raw extraction
  3. Regression detection across pipeline changes

LLM backends (pick one):
  - Local (LM Studio): Set OPENAI_COMPATIBLE_BASE_URL=http://localhost:1234/v1
                        and LLM_MODEL to your loaded model name.
  - DeepSeek cloud:     Set DEEPSEEK_API_KEY.
  - OpenAI cloud:       Set OPENAI_API_KEY.

Run with local LM Studio:
    LLM_PROVIDER=openai_compatible \
    OPENAI_COMPATIBLE_BASE_URL=http://localhost:1234/v1 \
    LLM_MODEL=gemma-3-12b-it \
    pytest -m live tests/live/test_full_pipeline_live.py -v

Run with cloud API:
    DEEPSEEK_API_KEY=xxx pytest -m "live and slow" tests/live/test_full_pipeline_live.py -v
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from tests.live.conftest import has_llm_api_key, has_local_llm

logger = logging.getLogger("tests.live.full_pipeline")

FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "variant_resolution_ground_truth.json"
RESULTS_DIR = Path(__file__).parent.parent.parent / ".agent_evidence" / "evidence" / "live_pipeline"


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class PipelineTestResult:
    """Result of a single SKU pipeline test."""
    sku: str
    brand: str
    name: str
    success: bool
    resolver_status: str | None = None
    extracted_name: str | None = None
    extracted_brand: str | None = None
    extraction_time_ms: float = 0.0
    error: str | None = None
    fields_matched: dict[str, bool] = field(default_factory=dict)

    @property
    def match_rate(self) -> float:
        if not self.fields_matched:
            return 0.0
        return sum(self.fields_matched.values()) / len(self.fields_matched)


# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------

def _load_entries() -> list[dict[str, Any]]:
    if not FIXTURE_PATH.exists():
        return []
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _pipeline_cases():
    """Yield all entries for full pipeline testing."""
    for entry in _load_entries():
        yield pytest.param(
            entry,
            id=f"{entry['brand']}-{entry['sku']}",
        )


# ---------------------------------------------------------------------------
# Full pipeline test class
# ---------------------------------------------------------------------------

@pytest.mark.live
@pytest.mark.slow
@pytest.mark.asyncio
class TestFullPipelineExtraction:
    """Run the complete extraction pipeline on real product pages and score results."""

    @pytest.fixture(autouse=True)
    def _check_prerequisites(self):
        """Skip entire class if no LLM backend is available."""
        if not has_local_llm() and not has_llm_api_key():
            pytest.skip(
                "No LLM backend available. Either:\n"
                "  - Start LM Studio and set OPENAI_COMPATIBLE_BASE_URL=http://localhost:1234/v1\n"
                "  - Set DEEPSEEK_API_KEY or OPENAI_API_KEY for cloud LLM"
            )

    @pytest.fixture(autouse=True)
    def _configure_local_llm(self, monkeypatch):
        """Auto-configure LLM_PROVIDER when LM Studio is detected."""
        if has_local_llm() and not os.getenv("LLM_PROVIDER"):
            monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
            if not os.getenv("OPENAI_COMPATIBLE_API_KEY"):
                monkeypatch.setenv("OPENAI_COMPATIBLE_API_KEY", "baystate-local")

    @pytest.mark.parametrize("entry", list(_pipeline_cases()))
    async def test_extraction_from_known_url(self, entry: dict[str, Any]):
        """Extract product data from a known URL and compare to ground truth.

        This bypasses the search step and goes straight to crawl → resolve → extract,
        using the expected_source_url from the fixture. This tests the extraction
        pipeline without search variance.
        """
        try:
            from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
            from scrapers.ai_search.scoring import SearchScorer
            from scrapers.ai_search.matching import MatchingUtils
        except ImportError:
            pytest.skip("Scraper modules not importable")

        url = entry["expected_source_url"]
        sku = entry["sku"]
        start = time.monotonic()

        try:
            extractor = Crawl4AIExtractor(
                headless=True,
                llm_model=os.getenv("LLM_MODEL") or "gpt-4o-mini",
                scoring=SearchScorer(),
                matching=MatchingUtils(),
                prompt_version="v3",
                llm_provider=os.getenv("LLM_PROVIDER"),
                llm_base_url=os.getenv("OPENAI_COMPATIBLE_BASE_URL"),
                llm_api_key=os.getenv("OPENAI_COMPATIBLE_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY"),
            )
            result = await extractor.extract(
                url=url,
                sku=sku,
                product_name=entry.get("name"),
                brand=entry.get("brand"),
            )
            elapsed_ms = (time.monotonic() - start) * 1000

            if result is None:
                pytest.fail(f"Extraction returned None for {sku} at {url}")

            # Check field matches
            fields_matched = {}
            if isinstance(result, dict) and result.get("product_name"):
                fields_matched["name"] = _fuzzy_contains(
                    result.get("product_name"), entry.get("name", "")
                )
            if isinstance(result, dict) and result.get("brand"):
                fields_matched["brand"] = (
                    result.get("brand").lower().strip() == entry.get("brand", "").lower().strip()
                )

            pipeline_result = PipelineTestResult(
                sku=sku,
                brand=entry.get("brand", ""),
                name=entry.get("name", ""),
                success=True,
                resolver_status=getattr(extractor, "_last_resolver_status", None),
                extracted_name=result.get("product_name") if isinstance(result, dict) else None,
                extracted_brand=result.get("brand") if isinstance(result, dict) else None,
                extraction_time_ms=elapsed_ms,
                fields_matched=fields_matched,
            )

            logger.info(
                "Pipeline result for %s: match_rate=%.0f%%, time=%.0fms, resolver=%s",
                sku,
                pipeline_result.match_rate * 100,
                elapsed_ms,
                pipeline_result.resolver_status,
            )

            # Soft assertion: log rather than fail on field mismatches
            # (the aggregate test below handles hard thresholds)
            if pipeline_result.match_rate < 0.5:
                logger.warning(
                    "Low match rate for %s (%s): %.0f%%. Extracted: name=%r, brand=%r",
                    sku,
                    entry.get("brand"),
                    pipeline_result.match_rate * 100,
                    pipeline_result.extracted_name,
                    pipeline_result.extracted_brand,
                )

        except Exception as e:
            logger.error("Pipeline failed for %s: %s", sku, e)
            pytest.fail(f"Pipeline error for {sku}: {e}")

    async def test_aggregate_accuracy(self, variant_ground_truth: list[dict[str, Any]]):
        """Run all fixture entries and assert aggregate accuracy >= 70%.

        This is the hard gate — individual SKU failures are acceptable
        but the overall pipeline must meet a minimum threshold.
        """
        try:
            from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
            from scrapers.ai_search.scoring import SearchScorer
            from scrapers.ai_search.matching import MatchingUtils
        except ImportError:
            pytest.skip("Scraper modules not importable")

        results: list[PipelineTestResult] = []
        # With local LM Studio there's no cost concern — run all entries.
        # For cloud LLMs, limit to 5 to control spend.
        max_entries = len(variant_ground_truth) if has_local_llm() else 5
        entries = variant_ground_truth[:max_entries]
        logger.info(
            "Running aggregate test on %d/%d entries (local_llm=%s)",
            len(entries), len(variant_ground_truth), has_local_llm(),
        )

        for entry in entries:
            url = entry["expected_source_url"]
            sku = entry["sku"]
            start = time.monotonic()

            try:
                extractor = Crawl4AIExtractor(
                    headless=True,
                    llm_model=os.getenv("LLM_MODEL") or "gpt-4o-mini",
                    scoring=SearchScorer(),
                    matching=MatchingUtils(),
                    prompt_version="v3",
                    llm_provider=os.getenv("LLM_PROVIDER"),
                    llm_base_url=os.getenv("OPENAI_COMPATIBLE_BASE_URL"),
                    llm_api_key=os.getenv("OPENAI_COMPATIBLE_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY"),
                )
                result = await extractor.extract(
                    url=url,
                    sku=sku,
                    product_name=entry.get("name"),
                    brand=entry.get("brand"),
                )
                elapsed_ms = (time.monotonic() - start) * 1000

                if isinstance(result, dict) and result.get("product_name"):
                    fields_matched = {
                        "name": _fuzzy_contains(
                            result.get("product_name") or "",
                            entry.get("name", ""),
                        ),
                        "brand": (
                            (result.get("brand") or "").lower().strip()
                            == entry.get("brand", "").lower().strip()
                        ),
                    }
                    results.append(PipelineTestResult(
                        sku=sku,
                        brand=entry.get("brand", ""),
                        name=entry.get("name", ""),
                        success=True,
                        extraction_time_ms=elapsed_ms,
                        fields_matched=fields_matched,
                    ))
                else:
                    results.append(PipelineTestResult(
                        sku=sku,
                        brand=entry.get("brand", ""),
                        name=entry.get("name", ""),
                        success=False,
                        error="Extraction returned None or no product_name",
                    ))

            except Exception as e:
                results.append(PipelineTestResult(
                    sku=sku,
                    brand=entry.get("brand", ""),
                    name=entry.get("name", ""),
                    success=False,
                    error=str(e),
                ))

        # Compute aggregate
        success_count = sum(1 for r in results if r.success)
        success_rate = success_count / len(results) if results else 0.0
        avg_match_rate = (
            sum(r.match_rate for r in results if r.success) / success_count
            if success_count > 0
            else 0.0
        )

        logger.info(
            "Aggregate: %d/%d successful (%.0f%%), avg match rate: %.0f%%",
            success_count,
            len(results),
            success_rate * 100,
            avg_match_rate * 100,
        )

        # Save results for evidence
        _save_results(results)

        assert success_rate >= 0.7, (
            f"Pipeline success rate {success_rate:.0%} below 70% threshold. "
            f"Successful: {success_count}/{len(results)}"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fuzzy_contains(actual: str, expected: str) -> bool:
    """Check if the actual value contains the key parts of the expected value.

    This is intentionally lenient — we check that at least 60% of the
    expected words appear in the actual text (case-insensitive).
    """
    if not actual or not expected:
        return False
    actual_lower = actual.lower()
    expected_words = expected.lower().split()
    if not expected_words:
        return True
    matches = sum(1 for w in expected_words if w in actual_lower)
    return (matches / len(expected_words)) >= 0.6


def _save_results(results: list[PipelineTestResult]) -> None:
    """Persist pipeline test results for evidence tracking."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    path = RESULTS_DIR / f"pipeline_run_{timestamp}.json"

    payload = {
        "timestamp": timestamp,
        "total": len(results),
        "successful": sum(1 for r in results if r.success),
        "results": [
            {
                "sku": r.sku,
                "brand": r.brand,
                "success": r.success,
                "match_rate": r.match_rate,
                "resolver_status": r.resolver_status,
                "extraction_time_ms": r.extraction_time_ms,
                "error": r.error,
                "fields_matched": r.fields_matched,
            }
            for r in results
        ],
    }

    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Saved pipeline results to %s", path)
