from __future__ import annotations

import json
from pathlib import Path

import pytest
from unittest.mock import AsyncMock

import scripts.benchmark_ai_search_batch as batch_benchmark
import scripts.benchmark_crawl4ai_extraction as extraction_benchmark
from scrapers.ai_search.models import AISearchResult
from scrapers.ai_search.scoring import get_domain_success_rate, record_domain_attempt, reset_domain_history
from scrapers.ai_search.validation import ExtractionValidator
from tests.evaluation.field_comparator import FieldComparison
from tests.evaluation.metrics_calculator import SKUMetrics
from tests.evaluation.types import MatchType


@pytest.mark.asyncio
async def test_batch_benchmark_oracle_returns_validator_safe_official_fixture(tmp_path: Path) -> None:
    manifest_product = batch_benchmark.ManifestProduct(
        sku="095668480400",
        name="Manna Pro Fresh Flakes Poultry Bedding 12 Lb",
        brand="Manna Pro",
        category="Poultry Bedding",
    )
    scraper = batch_benchmark.FixtureBatchBenchmarkScraper(
        products_by_sku={manifest_product.sku: manifest_product},
        query_by_sku={},
        cache_dir=tmp_path,
    )

    result = await scraper._extract_product_data(
        url="https://mannapro.com/products/fresh-flakes-poultry-bedding",
        sku=manifest_product.sku,
        product_name=manifest_product.name,
        brand=manifest_product.brand,
    )

    assert result["success"] is True
    is_valid, reason = ExtractionValidator().validate_extraction_match(
        extraction_result=result,
        sku=manifest_product.sku,
        product_name=manifest_product.name,
        brand=manifest_product.brand,
        source_url="https://mannapro.com/products/fresh-flakes-poultry-bedding",
    )

    assert is_valid is True
    assert reason == "ok"
    assert result["images"] == [f"https://mannapro.com/products/images/{manifest_product.sku}/hero.jpg"]


def test_extraction_benchmark_report_counts_failed_rows_in_summary(tmp_path: Path) -> None:
    rows = [
        extraction_benchmark.ExtractionBenchmarkRow(
            sku="SKU-1",
            query="Example product",
            expected_source_url="https://brand.example/products/sku-1",
            category="Dog Food Dry",
            difficulty="easy",
            source_type="official",
            success=True,
            accuracy=0.6,
            required_fields_success_rate=1.0,
            missing_required_fields=[],
            extraction_time_ms=100.0,
            error_message=None,
            benchmark_mode="fixture",
        ),
        extraction_benchmark.ExtractionBenchmarkRow(
            sku="SKU-2",
            query="Broken product",
            expected_source_url="https://brand.example/products/sku-2",
            category="Dog Food Dry",
            difficulty="easy",
            source_type="official",
            success=False,
            accuracy=0.0,
            required_fields_success_rate=0.0,
            missing_required_fields=["images"],
            extraction_time_ms=200.0,
            error_message="Extraction failed",
            benchmark_mode="live",
        ),
    ]
    sku_metrics = [
        SKUMetrics(
            sku="SKU-1",
            field_accuracy=0.6,
            required_fields_success_rate=1.0,
            is_success=True,
            missing_required_fields=[],
            field_comparisons=[
                FieldComparison(
                    field_name="product_name",
                    expected="Example product",
                    actual="Example product",
                    match_score=1.0,
                    match_type=MatchType.EXACT,
                )
            ],
        )
    ]

    json_path, _markdown_path = extraction_benchmark._write_report(
        dataset_path=tmp_path / "dataset.json",
        output_dir=tmp_path / "reports",
        rows=rows,
        sku_metrics=sku_metrics,
    )
    payload = json.loads(json_path.read_text(encoding="utf-8"))

    assert payload["summary"]["total_examples"] == 2
    assert payload["summary"]["fixture_examples"] == 1
    assert payload["summary"]["live_examples"] == 1
    assert payload["summary"]["success_rate"] == 0.5
    assert payload["summary"]["average_field_accuracy"] == 0.3
    assert payload["summary"]["average_required_fields_success_rate"] == 0.5


@pytest.mark.asyncio
async def test_extraction_benchmark_uses_fixture_manifest_when_available(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    dataset_path.write_text(
        json.dumps(
            {
                "version": "1.0",
                "generated_at": "2026-04-19T00:00:00+00:00",
                "source_dataset": "fixtures",
                "entries": [
                    {
                        "sku": "SKU-1",
                        "query": "Acme Widget",
                        "expected_source_url": "https://brand.example/products/sku-1",
                        "category": "Dog Toys",
                        "difficulty": "easy",
                        "source_type": "official",
                        "ground_truth": {
                            "brand": "Acme",
                            "name": "Acme Widget",
                            "description": "Official widget",
                            "size_metrics": None,
                            "images": ["https://brand.example/images/widget.jpg"],
                            "categories": ["Dog Toys"],
                        },
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    fixture_path = tmp_path / "sku-1.fixture.json"
    fixture_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "url": "https://brand.example/products/sku-1",
                "final_url": "https://brand.example/products/sku-1",
                "html": "<html><body>fixture</body></html>",
                "markdown": "fixture",
                "status_code": 200,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    fixture_manifest_path = tmp_path / "fixtures.json"
    fixture_manifest_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "entries": [
                    {
                        "expected_source_url": "https://brand.example/products/sku-1",
                        "fixture_key": "sku-1",
                        "fixture_path": str(fixture_path),
                        "captured_at": "2026-04-19T00:00:00+00:00",
                        "capture_mode": "fixture",
                        "final_url": "https://brand.example/products/sku-1",
                        "status_code": 200,
                    }
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    class StubScraper:
        def __init__(self, prompt_version: str) -> None:
            self.prompt_version = prompt_version

        async def extract_from_fixture(
            self,
            *,
            url: str,
            sku: str,
            product_name: str | None = None,
            brand: str | None = None,
            html: str,
            markdown: str = "",
            final_url: str | None = None,
            status_code: int | None = None,
        ) -> AISearchResult:
            _ = product_name, brand, html, markdown, status_code
            return AISearchResult(
                success=True,
                sku=sku,
                product_name="Acme Widget",
                brand="Acme",
                description="Official widget",
                images=["https://brand.example/images/widget.jpg"],
                categories=["Dog Toys"],
                url=final_url or url,
            )

        async def extract_from_url(self, **kwargs):
            raise AssertionError("live extraction should not be used when a fixture is present")

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(extraction_benchmark, "AISearchScraper", StubScraper)
    try:
        exit_code = await extraction_benchmark.run_benchmark(
            dataset_path,
            tmp_path / "reports",
            prompt_version="v1",
            raw_skus=None,
            fixture_manifest_path=fixture_manifest_path,
        )
    finally:
        monkeypatch.undo()

    assert exit_code == 0
    payload = json.loads((tmp_path / "reports" / "crawl4ai-extraction-benchmark.json").read_text(encoding="utf-8"))
    assert payload["summary"]["fixture_examples"] == 1
    assert payload["summary"]["live_examples"] == 0
    assert payload["per_sku_results"][0]["benchmark_mode"] == "fixture"


def test_reset_domain_history_clears_scoring_memory() -> None:
    reset_domain_history()
    record_domain_attempt("acme.example", True)
    record_domain_attempt("acme.example", True)
    record_domain_attempt("acme.example", True)

    assert get_domain_success_rate("acme.example") == 1.0

    reset_domain_history()

    assert get_domain_success_rate("acme.example") == 0.5


@pytest.mark.asyncio
async def test_batch_benchmark_independent_mode_uses_fresh_scraper_per_product(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    manifest_products = [
        batch_benchmark.ManifestProduct(sku="SKU-1", name="Acme Widget", brand="Acme", category="Tools"),
        batch_benchmark.ManifestProduct(sku="SKU-2", name="Acme Mixer", brand="Acme", category="Tools"),
    ]
    scenario_products = [
        {"sku": "SKU-1", "product_name": "Acme Widget", "brand": "Acme", "category": "Tools"},
        {"sku": "SKU-2", "product_name": "Acme Mixer", "brand": "Acme", "category": "Tools"},
    ]
    created_skus: list[str] = []
    reset_calls: list[str] = []

    class FakeScraper:
        def __init__(self, *, products_by_sku: dict[str, batch_benchmark.ManifestProduct], query_by_sku: dict[str, str], cache_dir: Path) -> None:
            _ = products_by_sku, query_by_sku, cache_dir
            self._attempts_by_sku: dict[str, list[str]] = {}

        async def scrape_product(
            self,
            *,
            sku: str,
            product_name: str | None = None,
            brand: str | None = None,
            category: str | None = None,
        ) -> AISearchResult:
            _ = product_name, brand, category
            created_skus.append(sku)
            self._attempts_by_sku[sku] = [f"https://acme.example/products/{sku.lower()}"]
            return AISearchResult(success=True, sku=sku, url=f"https://acme.example/products/{sku.lower()}")

    async_has_official = AsyncMock(return_value=True)
    monkeypatch.setattr(batch_benchmark, "FixtureBatchBenchmarkScraper", FakeScraper)
    monkeypatch.setattr(batch_benchmark, "_has_official_candidate", async_has_official)
    monkeypatch.setattr(batch_benchmark, "reset_domain_history", lambda: reset_calls.append("reset"))

    report = await batch_benchmark._run_mode(
        "independent",
        manifest_products=manifest_products,
        scenario_products=scenario_products,
        cache_dir=tmp_path,
        max_concurrency=2,
    )

    assert created_skus == ["SKU-1", "SKU-2"]
    assert len(reset_calls) == len(scenario_products)
    assert report["summary"]["total_products"] == 2
    assert report["summary"]["success_rate"] == 1.0
