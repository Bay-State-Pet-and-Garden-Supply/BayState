from __future__ import annotations

import json
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from urllib.parse import urlparse

from benchmarks.official_brand.dataset import OfficialBrandBenchmarkEntry, load_dataset
from benchmarks.official_brand.metrics import DiscoveryResultRow, summarize
from benchmarks.official_brand.report import build_report, write_report
from benchmarks.search_fixtures import FixtureSearchClient
from scrapers.ai_search.official_brand_scraper import OfficialBrandScraper


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


class _NoopSourceSelector:
    async def score_snippet(self, url: str, snippet: str, brand: str) -> dict[str, Any]:
        _ = url, snippet, brand
        return {"is_official": False, "confidence_score": 0.0, "reason": "noop"}


def _load_search_fixture_entries(search_fixtures_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(search_fixtures_path.read_text(encoding="utf-8"))
    entries = payload.get("entries")
    if not isinstance(entries, list):
        raise ValueError("Search fixtures file must contain an 'entries' list")
    return [entry for entry in entries if isinstance(entry, dict)]


def _prime_cache_from_fixtures(search_fixtures_path: Path, cache_dir: Path) -> FixtureSearchClient:
    client = FixtureSearchClient(cache_dir=cache_dir, allow_real_api=False)
    for entry in _load_search_fixture_entries(search_fixtures_path):
        query = str(entry.get("query") or "").strip()
        results = entry.get("results")
        if not query or not isinstance(results, list):
            continue
        client.write_cache_entry(query=query, results=results)
    return client


async def run_official_brand_fixture_benchmark(
    *,
    dataset_path: Path,
    search_fixtures_path: Path,
    output_dir: Path,
    fail_under_domain_match_rate: float | None = None,
) -> tuple[dict[str, Any], Path, Path, bool]:
    entries: list[OfficialBrandBenchmarkEntry] = load_dataset(dataset_path)

    with TemporaryDirectory(prefix="official-brand-benchmark-cache-") as cache_dir:
        fixture_client = _prime_cache_from_fixtures(search_fixtures_path, Path(cache_dir))
        scraper = OfficialBrandScraper(search_client=fixture_client, source_selector=_NoopSourceSelector())
        rows: list[DiscoveryResultRow] = []

        for entry in entries:
            start = time.perf_counter()
            error: str | None = None
            discovered_url: str | None = None
            try:
                discovered_url = await scraper.identify_official_url(
                    entry.sku,
                    entry.brand or "",
                    entry.product_name,
                    official_domains=entry.expected_official_domains,
                    preferred_domains=entry.preferred_domains,
                )
            except Exception as exc:  # pragma: no cover - defensive
                error = str(exc)

            duration_ms = (time.perf_counter() - start) * 1000
            discovered_domain = _normalize_domain(discovered_url)
            domain_match = _domain_matches(discovered_domain, entry.expected_official_domains)
            exact_url_match = bool(entry.expected_url and discovered_url and discovered_url == entry.expected_url)
            if discovered_url is None and error is None:
                error = "no_url_found"

            rows.append(
                DiscoveryResultRow(
                    sku=entry.sku,
                    brand=entry.brand,
                    product_name=entry.product_name,
                    expected_official_domains=entry.expected_official_domains,
                    expected_url=entry.expected_url,
                    discovered_url=discovered_url,
                    discovered_domain=discovered_domain,
                    domain_match=domain_match,
                    exact_url_match=exact_url_match,
                    duration_ms=duration_ms,
                    cost_usd=0.0,
                    error=error,
                    category=entry.category,
                    difficulty=entry.difficulty,
                )
            )

    summary = summarize(rows)
    report = build_report(dataset_path=dataset_path, summary=summary, rows=rows)
    json_path, md_path = write_report(report=report, output_dir=output_dir)
    passed = True
    if fail_under_domain_match_rate is not None:
        passed = float(summary["domain_match_rate"]) >= fail_under_domain_match_rate
    return report, json_path, md_path, passed
