"""End-to-end AI Search benchmark runner."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from urllib.parse import urlparse

from benchmarks.ai_search.dataset import EndToEndBenchmarkEntry, SearchFixture, load_dataset
from benchmarks.ai_search.metrics import (
    EndToEndResultRow,
    ExtractionMetadata,
    FieldQualityMetrics,
    PipelineStageMetrics,
    TimingMetrics,
    compute_field_quality,
    determine_failure_stage,
)
from scrapers.ai_search.crawl4ai_extractor import Crawl4AIExtractor
from scrapers.ai_search.matching import MatchingUtils
from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper
from scrapers.ai_search.scoring import SearchScorer
from scrapers.ai_search.search import SearchClient
from scrapers.ai_search.validation import ExtractionValidator
from benchmarks.search_fixtures import FixtureSearchClient

logger = __import__("logging").getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_domain(value: str | None) -> str | None:
    text = str(value or "").strip().lower()
    if not text:
        return None
    with_protocol = text if "://" in text else f"https://{text}"
    hostname = urlparse(with_protocol).netloc.lower() or urlparse(with_protocol).path.lower()
    hostname = hostname.replace("www.", "", 1).split("/", 1)[0].strip()
    return hostname or None


def _domain_matches(domain: str | None, expected_domains: list[str]) -> bool:
    if not domain:
        return False
    normalized_expected = [candidate for candidate in (_normalize_domain(item) for item in expected_domains) if candidate]
    return any(domain == expected or domain.endswith(f".{expected}") for expected in normalized_expected)


def _url_matches(expected: str | None, actual: str | None) -> bool:
    if not expected or not actual:
        return False
    return expected.rstrip("/") == actual.rstrip("/")


class _NoopSourceSelector:
    """No-op source selector for deterministic fixture mode."""

    async def score_snippet(self, url: str, snippet: str, brand: str) -> dict[str, Any]:
        _ = url, snippet, brand
        return {"is_official": False, "confidence_score": 0.0, "reason": "noop"}


# ---------------------------------------------------------------------------
# Page fixture loading
# ---------------------------------------------------------------------------


def _load_page_fixture(page_fixtures_dir: Path, url: str) -> dict[str, Any] | None:
    """Load a cached page fixture by URL hash."""
    import hashlib

    cache_key = hashlib.sha256(url.encode()).hexdigest()
    fixture_path = page_fixtures_dir / f"{cache_key}.json"
    if not fixture_path.exists():
        return None
    try:
        page = json.loads(fixture_path.read_text(encoding="utf-8"))
        return {
            "schema_version": 1,
            "url": str(page.get("url") or ""),
            "final_url": str(page.get("final_url") or page.get("url") or ""),
            "html": str(page.get("html") or ""),
            "markdown": str(page.get("markdown") or ""),
            "status_code": page.get("status_code"),
        }
    except (json.JSONDecodeError, OSError, ValueError):
        return None


def _write_page_fixture(
    page_fixtures_dir: Path,
    url: str,
    html: str,
    markdown: str,
    final_url: str,
    status_code: int | None,
) -> Path:
    """Write a captured page fixture to disk."""
    import hashlib

    page_fixtures_dir.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha256(url.encode()).hexdigest()
    fixture_path = page_fixtures_dir / f"{cache_key}.json"
    payload = {
        "schema_version": 1,
        "url": url,
        "final_url": final_url,
        "html": html,
        "markdown": markdown,
        "status_code": status_code,
    }
    fixture_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return fixture_path


# ---------------------------------------------------------------------------
# Search client setup
# ---------------------------------------------------------------------------


def _prime_search_fixtures(search_fixtures: list[SearchFixture] | None, cache_dir: Path) -> FixtureSearchClient:
    """Prime a FixtureSearchClient with cached search results."""
    client = FixtureSearchClient(cache_dir=cache_dir, allow_real_api=False)
    if search_fixtures:
        for fixture in search_fixtures:
            client.write_cache_entry(query=fixture.query, results=fixture.results)
    return client


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------


def _create_extractor(headless: bool = True, cache_enabled: bool = False) -> Crawl4AIExtractor:
    """Create a Crawl4AIExtractor with sensible defaults."""
    return Crawl4AIExtractor(
        headless=headless,
        llm_model="gpt-4o-mini",
        scoring=SearchScorer(),
        matching=MatchingUtils(),
        cache_enabled=cache_enabled,
        extraction_strategy="llm",
        prompt_version="v1",
        llm_provider="openai",
    )


async def _run_extraction_fixture(
    extractor: Crawl4AIExtractor,
    url: str,
    sku: str,
    product_name: str,
    brand: str,
    page_fixture: dict[str, Any],
) -> dict[str, Any]:
    """Run extraction against a cached page fixture."""
    html = str(page_fixture.get("html") or "")
    markdown = str(page_fixture.get("markdown") or "")
    final_url = str(page_fixture.get("final_url") or url)
    status_code = page_fixture.get("status_code")

    result = await extractor.extract_from_fixture(
        url=url,
        sku=sku,
        product_name=product_name,
        brand=brand,
        html=html,
        markdown=markdown,
        final_url=final_url,
        status_code=status_code,
    )
    result["_benchmark_method"] = "fixture"
    return result


# Nominal extraction cost estimates by method (USD per extraction).
# These are rough estimates for GPT-4o-mini-level calls and help track
# whether improvements reduce expensive LLM extraction.
_EXTRACTION_COST_ESTIMATES: dict[str, float] = {
    "fixture": 0.0,
    "json-ld": 0.0,
    "meta-tags": 0.0,
    "llm": 0.01,
    "fallback": 0.01,
    "unknown": 0.0,
}


def _estimate_extraction_cost(method: str) -> float:
    """Return a nominal cost estimate for an extraction method."""
    return _EXTRACTION_COST_ESTIMATES.get(method, 0.0)


async def _run_extraction_live(
    extractor: Crawl4AIExtractor,
    url: str,
    sku: str,
    product_name: str,
    brand: str,
) -> dict[str, Any]:
    """Run extraction against a live URL."""
    result = await extractor.extract(url, sku, product_name, brand)
    if result is None:
        return {"success": False, "error": "Extraction returned None"}
    return result


# ---------------------------------------------------------------------------
# Per-entry execution
# ---------------------------------------------------------------------------


async def _run_single_entry(
    entry: EndToEndBenchmarkEntry,
    *,
    fixture_client: FixtureSearchClient | None,
    live_client: SearchClient | None,
    extractor: Crawl4AIExtractor,
    validator: ExtractionValidator,
    effective_page_fixtures_dir: Path,
    mode: str,
    headless: bool,
    data_quality_threshold: float,
) -> EndToEndResultRow:
    total_start = time.perf_counter()
    timing: dict[str, float] = {}

    # -----------------------------------------------------------------
    # Stage 1: Search + URL Selection (Discovery)
    # -----------------------------------------------------------------
    search_start = time.perf_counter()
    discovered_url: str | None = None
    search_success = False
    url_selection_success = False
    domain_match = False
    url_match = False
    search_error: str | None = None

    # Use per-entry search fixtures if available in fixture mode
    entry_search_client = fixture_client
    entry_cache: TemporaryDirectory | None = None
    if mode == "fixture" and entry.search_fixtures:
        entry_cache = TemporaryDirectory(prefix=f"e2e-cache-{entry.sku}-")
        entry_search_client = _prime_search_fixtures(entry.search_fixtures, Path(entry_cache.name))

    scraper = OfficialBrandScraper(
        search_client=entry_search_client or live_client,
        source_selector=_NoopSourceSelector() if mode == "fixture" else None,
        headless=headless,
    )

    try:
        discovery = await scraper.discover_official_url_candidates(
            sku=entry.sku,
            brand=entry.brand,
            product_name=entry.product_name,
            official_domains=entry.expected_official_domains,
            preferred_domains=entry.expected_official_domains,
            register_name=entry.product_name,
        )
        discovered_url = str(discovery.get("selected_url") or "").strip() or None
        search_success = bool(discovery.get("success"))
        url_selection_success = discovered_url is not None
        if discovered_url:
            domain_match = _domain_matches(_normalize_domain(discovered_url), entry.expected_official_domains)
            url_match = _url_matches(entry.expected_source_url, discovered_url)
        elif discovery.get("error"):
            search_error = str(discovery.get("error"))
    except Exception as exc:
        search_error = str(exc)
        search_success = False
    finally:
        if entry_cache is not None:
            entry_cache.cleanup()

    timing["search"] = (time.perf_counter() - search_start) * 1000
    timing["url_selection"] = timing["search"]  # Combined in our scraper

    # -----------------------------------------------------------------
    # Stage 2: Crawl + Extraction
    # -----------------------------------------------------------------
    crawl_start = time.perf_counter()
    extraction_result: dict[str, Any] = {}
    crawl_success = False
    extraction_success = False
    extraction_metadata = ExtractionMetadata()
    extraction_error: str | None = None

    # Determine the URL to crawl: discovered URL, or expected URL as fallback
    crawl_url = discovered_url or entry.expected_source_url

    if crawl_url:
        try:
            page_fixture = None
            if mode == "fixture":
                page_fixture = _load_page_fixture(effective_page_fixtures_dir, crawl_url)

            if page_fixture is not None:
                extraction_result = await _run_extraction_fixture(
                    extractor=extractor,
                    url=crawl_url,
                    sku=entry.sku,
                    product_name=entry.product_name,
                    brand=entry.brand,
                    page_fixture=page_fixture,
                )
                crawl_success = True
            elif mode == "fixture":
                # In fixture mode without a page fixture, skip live crawl
                # and report a clear missing-fixture error
                extraction_result = {
                    "success": False,
                    "error": f"No page fixture found for {crawl_url} in fixture mode",
                }
                crawl_success = False
            else:
                # Live crawl
                extraction_result = await _run_extraction_live(
                    extractor=extractor,
                    url=crawl_url,
                    sku=entry.sku,
                    product_name=entry.product_name,
                    brand=entry.brand,
                )
                crawl_success = not bool(extraction_result.get("error")) or bool(
                    extraction_result.get("success")
                )

            extraction_success = bool(extraction_result.get("success"))
            extraction_error = extraction_result.get("error")

            # Extract metadata from result
            method = extraction_result.get("_benchmark_method", "unknown")
            if method == "unknown":
                # Infer from result shape
                if extraction_result.get("confidence", 0) >= 0.8 and not extraction_result.get("_llm_extracted"):
                    method = "json-ld"
                elif extraction_result.get("_llm_extracted"):
                    method = "llm"
                else:
                    method = "fallback"

            # Only charge extraction cost when extraction actually succeeded.
            # Failed extractions (missing fixtures, crawl errors) cost $0.00.
            extraction_cost = _estimate_extraction_cost(method) if extraction_success else 0.0
            extraction_metadata = ExtractionMetadata(
                method=method,
                confidence=float(extraction_result.get("confidence", 0.0)),
                extraction_error=extraction_error,
                estimated_cost_usd=extraction_cost,
            )

        except Exception as exc:
            extraction_error = str(exc)
            crawl_success = False
            extraction_success = False

    timing["crawl"] = (time.perf_counter() - crawl_start) * 1000
    timing["extraction"] = timing["crawl"]  # Combined in our extractor

    # -----------------------------------------------------------------
    # Stage 3: Validation
    # -----------------------------------------------------------------
    validation_start = time.perf_counter()
    validation_passed = False
    validation_reason: str | None = None

    if extraction_success and extraction_result:
        try:
            validation_passed, validation_reason = validator.validate_extraction_match(
                extraction_result=extraction_result,
                sku=entry.sku,
                product_name=entry.product_name,
                brand=entry.brand,
                source_url=crawl_url,
            )
        except Exception as exc:
            validation_reason = str(exc)
            validation_passed = False

    timing["validation"] = (time.perf_counter() - validation_start) * 1000

    # -----------------------------------------------------------------
    # Stage 4: Data Quality
    # -----------------------------------------------------------------
    field_quality = FieldQualityMetrics()
    has_ground_truth = entry.ground_truth is not None
    if extraction_success and has_ground_truth:
        field_quality = compute_field_quality(extraction_result, entry.ground_truth)

    # If no ground truth, data quality is skipped (passed)
    data_quality_passed = field_quality.overall_score >= data_quality_threshold if has_ground_truth else True

    # -----------------------------------------------------------------
    # Determine overall success
    # -----------------------------------------------------------------
    end_to_end_success = (
        search_success
        and url_selection_success
        and domain_match
        and crawl_success
        and extraction_success
        and validation_passed
        and data_quality_passed
    )

    stages = PipelineStageMetrics(
        search_success=search_success,
        url_selection_success=url_selection_success,
        domain_match=domain_match,
        url_match=url_match,
        crawl_success=crawl_success,
        extraction_success=extraction_success,
        validation_passed=validation_passed,
        data_quality_passed=data_quality_passed,
        end_to_end_success=end_to_end_success,
    )

    failure_stage, failure_reason = determine_failure_stage(
        stages=stages,
        field_quality=field_quality,
        validation_reason=validation_reason,
    )

    total_ms = (time.perf_counter() - total_start) * 1000

    # Compute cost estimate
    # - Search cost: Serper is $0.0 (DEFAULT_PROVIDER_COST_USD), fixture mode is also $0.0.
    #   In live mode with a billable provider this would need plumbing through
    #   OfficialBrandScraper.identify_official_url() to use SearchClient.search_with_cost().
    # - Extraction cost: nominal estimate based on extraction method.
    search_cost_usd = 0.0
    extraction_cost_usd = extraction_metadata.estimated_cost_usd
    total_cost_usd = search_cost_usd + extraction_cost_usd

    return EndToEndResultRow(
        sku=entry.sku,
        brand=entry.brand,
        product_name=entry.product_name,
        expected_source_url=entry.expected_source_url,
        expected_official_domains=entry.expected_official_domains,
        source_type=entry.source_type,
        category=entry.category,
        difficulty=entry.difficulty,
        stages=stages,
        failure_stage=failure_stage,
        failure_reason=failure_reason,
        discovered_url=discovered_url,
        selected_domain=_normalize_domain(discovered_url),
        extraction_result=extraction_result if extraction_success else {},
        field_quality=field_quality,
        extraction_metadata=extraction_metadata,
        timing=TimingMetrics(
            search_ms=timing.get("search", 0.0),
            url_selection_ms=timing.get("url_selection", 0.0),
            crawl_ms=timing.get("crawl", 0.0),
            extraction_ms=timing.get("extraction", 0.0),
            validation_ms=timing.get("validation", 0.0),
            total_ms=total_ms,
        ),
        cost_usd=total_cost_usd,
    )


# ---------------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------------


async def run_ai_search_e2e_benchmark(
    *,
    dataset_path: Path,
    output_dir: Path,
    mode: str = "fixture",
    search_fixtures_path: Path | None = None,
    page_fixtures_dir: Path | None = None,
    capture_page_fixtures: bool = False,
    headless: bool = True,
    fail_under_end_to_end_rate: float | None = None,
    fail_under_domain_match_rate: float | None = None,
    data_quality_threshold: float = 0.6,
    max_concurrency: int = 2,
) -> tuple[dict[str, Any], Path, Path, bool]:
    raise NotImplementedError(
        "AI Search discovery benchmarks have moved server-side. "
        "Discovery logic is no longer available in the scraper runner. "
        "Use the web app discovery endpoint or rewrite benchmarks to test "
        "extraction-only against pre-discovered URLs."
    )
    """Run the end-to-end AI Search benchmark.

    Args:
        dataset_path: Path to the benchmark dataset JSON.
        output_dir: Directory to write reports.
        mode: "fixture" (deterministic) or "live" (real network/API calls).
        search_fixtures_path: Path to shared search fixtures JSON (for fixture mode fallback).
        page_fixtures_dir: Directory with cached page HTML fixtures.
        capture_page_fixtures: If True, capture live crawl results as fixtures for future use.
        headless: Whether to run browser headless.
        fail_under_end_to_end_rate: Optional threshold for overall success rate.
        fail_under_domain_match_rate: Optional threshold for domain match rate.
        data_quality_threshold: Minimum overall quality score to pass data_quality stage.
        max_concurrency: Max concurrent benchmark entries.

    Returns:
        Tuple of (report_dict, json_path, md_path, passed).
    """
    from benchmarks.ai_search.report import build_report, write_report
    from benchmarks.ai_search.metrics import summarize

    entries = load_dataset(dataset_path)
    rows: list[EndToEndResultRow] = []

    # Prepare shared extractor
    extractor = _create_extractor(headless=headless, cache_enabled=(mode == "live"))
    validator = ExtractionValidator(confidence_threshold=0.7)

    effective_page_fixtures_dir = page_fixtures_dir or Path("benchmarks/ai_search/fixtures/page_fixtures")
    semaphore = asyncio.Semaphore(max(1, max_concurrency))

    # Keep shared search fixture cache alive for the entire run
    shared_cache: TemporaryDirectory | None = None
    fixture_client: FixtureSearchClient | None = None
    live_client: SearchClient | None = None

    if mode == "fixture":
        shared_cache = TemporaryDirectory(prefix="ai-search-e2e-search-cache-")
        fixture_client = _prime_search_fixtures(None, Path(shared_cache.name))
        # Also prime from global search fixtures if provided
        if search_fixtures_path and search_fixtures_path.exists():
            global_fixtures = json.loads(search_fixtures_path.read_text(encoding="utf-8"))
            for entry in global_fixtures.get("entries", []):
                query = str(entry.get("query") or "").strip()
                results = entry.get("results")
                if query and isinstance(results, list):
                    fixture_client.write_cache_entry(query=query, results=results)
    else:
        live_client = SearchClient()

    async def _run_entry(entry: EndToEndBenchmarkEntry) -> EndToEndResultRow:
        async with semaphore:
            return await _run_single_entry(
                entry,
                fixture_client=fixture_client,
                live_client=live_client,
                extractor=extractor,
                validator=validator,
                effective_page_fixtures_dir=effective_page_fixtures_dir,
                mode=mode,
                headless=headless,
                data_quality_threshold=data_quality_threshold,
            )

    try:
        tasks = [_run_entry(entry) for entry in entries]
        rows = list(await asyncio.gather(*tasks))
    finally:
        if shared_cache is not None:
            shared_cache.cleanup()

    summary = summarize(rows)
    report = build_report(
        dataset_path=dataset_path,
        summary=summary,
        rows=rows,
        mode=mode,
    )
    json_path, md_path = write_report(report=report, output_dir=output_dir)

    passed = True
    if fail_under_end_to_end_rate is not None:
        passed = passed and float(summary["end_to_end_success_rate"]) >= fail_under_end_to_end_rate
    if fail_under_domain_match_rate is not None:
        passed = passed and float(summary["domain_match_rate"]) >= fail_under_domain_match_rate

    return report, json_path, md_path, passed
