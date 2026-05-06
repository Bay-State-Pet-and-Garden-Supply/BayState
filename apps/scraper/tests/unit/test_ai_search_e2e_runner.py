from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from benchmarks.ai_search.runner import _NoopSourceSelector, run_ai_search_e2e_benchmark


@pytest.mark.asyncio
async def test_runner_produces_passing_report_with_fixture_mode(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    page_fixtures_dir = tmp_path / "page_fixtures"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-1",
                        "product_name": "Acme Widget",
                        "brand": "Acme",
                        "expected_official_domains": ["acme.example"],
                        "expected_source_url": "https://acme.example/products/widget",
                        "source_type": "official",
                        "difficulty": "easy",
                        "ground_truth": {
                            "brand": "Acme",
                            "name": "Acme Widget",
                            "description_contains": ["widget"],
                            "size_metrics": "10 oz",
                            "image_required": False,
                            "categories": ["Widgets"],
                        },
                        "search_fixtures": [
                            {
                                "query": "SKU-1",
                                "results": [
                                    {
                                        "url": "https://acme.example/products/widget",
                                        "title": "Acme Widget",
                                        "description": "Official widget",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            },
                            {
                                "query": "site:acme.example Acme Widget",
                                "results": [
                                    {
                                        "url": "https://acme.example/products/widget",
                                        "title": "Acme Widget",
                                        "description": "Official widget",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    search_fixtures_path.write_text(
        json.dumps(
            {
                "entries": [
                    {
                        "query": "SKU-1",
                        "results": [
                            {
                                "url": "https://acme.example/products/widget",
                                "title": "Acme Widget",
                                "description": "Official widget",
                                "provider": "fixture",
                                "result_type": "organic",
                            }
                        ],
                    },
                    {
                        "query": "site:acme.example Acme Widget",
                        "results": [
                            {
                                "url": "https://acme.example/products/widget",
                                "title": "Acme Widget",
                                "description": "Official widget",
                                "provider": "fixture",
                                "result_type": "organic",
                            }
                        ],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    report, json_path, md_path, passed = await run_ai_search_e2e_benchmark(
        dataset_path=dataset_path,
        output_dir=output_dir,
        mode="fixture",
        search_fixtures_path=search_fixtures_path,
        page_fixtures_dir=page_fixtures_dir,
        fail_under_end_to_end_rate=0.0,
        data_quality_threshold=0.0,
        max_concurrency=1,
    )

    assert json_path.exists()
    assert md_path.exists()
    assert report["benchmark_type"] == "ai_search_end_to_end"
    assert report["mode"] == "fixture"
    assert report["summary"]["total_entries"] == 1

    # URL selection should succeed with fixtures, but crawl fails without page fixtures
    assert report["summary"]["search_success_rate"] == 1.0
    assert report["summary"]["url_selection_success_rate"] == 1.0
    assert report["summary"]["domain_match_rate"] == 1.0

    # The entry should have stage details
    entry = report["entries"][0]
    assert entry["sku"] == "SKU-1"
    assert entry["stages"]["search_success"] is True
    assert entry["stages"]["url_selection_success"] is True
    assert entry["stages"]["domain_match"] is True
    assert entry["discovered_url"] == "https://acme.example/products/widget"


@pytest.mark.asyncio
async def test_runner_full_pipeline_with_page_fixture(tmp_path: Path) -> None:
    """Test the full pipeline with a synthetic page fixture demonstrating E2E success."""
    import hashlib

    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    page_fixtures_dir = tmp_path / "page_fixtures"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-FIXTURE",
                        "product_name": "Acme Widget Pro",
                        "brand": "Acme",
                        "expected_official_domains": ["acme.example"],
                        "expected_source_url": "https://acme.example/products/widget-pro",
                        "source_type": "official",
                        "ground_truth": {
                            "brand": "Acme",
                            "name": "Acme Widget Pro",
                            "description_contains": ["premium", "widget"],
                            "size_metrics": "10 oz",
                            "image_required": False,
                            "categories": ["Widgets"],
                        },
                        "search_fixtures": [
                            {
                                "query": "SKU-FIXTURE",
                                "results": [
                                    {
                                        "url": "https://acme.example/products/widget-pro",
                                        "title": "Acme Widget Pro",
                                        "description": "Premium widget",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            },
                            {
                                "query": "site:acme.example Acme Widget Pro",
                                "results": [
                                    {
                                        "url": "https://acme.example/products/widget-pro",
                                        "title": "Acme Widget Pro",
                                        "description": "Premium widget",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    search_fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    # Write a synthetic page fixture with JSON-LD structured data
    page_url = "https://acme.example/products/widget-pro"
    cache_key = hashlib.sha256(page_url.encode()).hexdigest()
    html_content = """
    <html>
    <head>
        <title>Acme Widget Pro</title>
        <script type="application/ld+json">
        {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Acme Widget Pro",
            "brand": {"@type": "Brand", "name": "Acme"},
            "description": "A premium widget for all occasions.",
            "sku": "SKU-FIXTURE",
            "image": "https://acme.example/images/widget-pro.jpg",
            "category": "Widgets"
        }
        </script>
    </head>
    <body>
        <h1>Acme Widget Pro</h1>
        <p>Size: 10 oz</p>
    </body>
    </html>
    """
    page_fixtures_dir.mkdir(parents=True, exist_ok=True)
    (page_fixtures_dir / f"{cache_key}.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "url": page_url,
                "final_url": page_url,
                "html": html_content,
                "markdown": "",
                "status_code": 200,
            }
        ),
        encoding="utf-8",
    )

    report, json_path, md_path, passed = await run_ai_search_e2e_benchmark(
        dataset_path=dataset_path,
        output_dir=output_dir,
        mode="fixture",
        search_fixtures_path=search_fixtures_path,
        page_fixtures_dir=page_fixtures_dir,
        fail_under_end_to_end_rate=1.0,
        data_quality_threshold=0.3,
        max_concurrency=1,
    )

    assert passed is True
    assert report["summary"]["end_to_end_success_rate"] == 1.0
    assert report["summary"]["crawl_success_rate"] == 1.0
    assert report["summary"]["extraction_success_rate"] == 1.0

    entry = report["entries"][0]
    assert entry["stages"]["end_to_end_success"] is True
    assert entry["stages"]["crawl_success"] is True
    assert entry["stages"]["extraction_success"] is True
    assert entry["stages"]["validation_passed"] is True
    assert entry["stages"]["data_quality_passed"] is True
    assert entry["extraction_metadata"]["method"] == "fixture"
    assert entry["field_quality"]["brand_score"] > 0.5
    assert entry["field_quality"]["name_score"] > 0.5


@pytest.mark.asyncio
async def test_shared_search_fixtures_work_for_multiple_entries(tmp_path: Path) -> None:
    """Two entries using shared (not per-entry) search fixtures both find their URLs."""
    import hashlib

    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    page_fixtures_dir = tmp_path / "page_fixtures"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-ALPHA",
                        "product_name": "Alpha Product",
                        "brand": "AlphaBrand",
                        "expected_official_domains": ["alpha.example"],
                        "expected_source_url": "https://alpha.example/products/alpha",
                        "source_type": "official",
                        # No per-entry search_fixtures; uses shared cache
                    },
                    {
                        "sku": "SKU-BETA",
                        "product_name": "Beta Product",
                        "brand": "BetaBrand",
                        "expected_official_domains": ["beta.example"],
                        "expected_source_url": "https://beta.example/products/beta",
                        "source_type": "official",
                        # No per-entry search_fixtures; uses shared cache
                    },
                ],
            }
        ),
        encoding="utf-8",
    )

    # Shared search fixtures covering both entries
    search_fixtures_path.write_text(
        json.dumps(
            {
                "entries": [
                    {
                        "query": "SKU-ALPHA",
                        "results": [
                            {
                                "url": "https://alpha.example/products/alpha",
                                "title": "Alpha Product",
                                "description": "Official alpha product",
                                "provider": "fixture",
                                "result_type": "organic",
                            }
                        ],
                    },
                    {
                        "query": "site:alpha.example Alpha Product",
                        "results": [
                            {
                                "url": "https://alpha.example/products/alpha",
                                "title": "Alpha Product",
                                "description": "Official alpha product",
                                "provider": "fixture",
                                "result_type": "organic",
                            }
                        ],
                    },
                    {
                        "query": "SKU-BETA",
                        "results": [
                            {
                                "url": "https://beta.example/products/beta",
                                "title": "Beta Product",
                                "description": "Official beta product",
                                "provider": "fixture",
                                "result_type": "organic",
                            }
                        ],
                    },
                    {
                        "query": "site:beta.example Beta Product",
                        "results": [
                            {
                                "url": "https://beta.example/products/beta",
                                "title": "Beta Product",
                                "description": "Official beta product",
                                "provider": "fixture",
                                "result_type": "organic",
                            }
                        ],
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    # Write page fixtures for both entries so crawl succeeds
    page_fixtures_dir.mkdir(parents=True, exist_ok=True)

    def _write_page_fixture(url: str) -> None:
        cache_key = hashlib.sha256(url.encode()).hexdigest()
        (page_fixtures_dir / f"{cache_key}.json").write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "url": url,
                    "final_url": url,
                    "html": "<html><head><title>Product</title></head><body><h1>Product</h1></body></html>",
                    "markdown": "",
                    "status_code": 200,
                }
            ),
            encoding="utf-8",
        )

    _write_page_fixture("https://alpha.example/products/alpha")
    _write_page_fixture("https://beta.example/products/beta")

    report, json_path, md_path, passed = await run_ai_search_e2e_benchmark(
        dataset_path=dataset_path,
        output_dir=output_dir,
        mode="fixture",
        search_fixtures_path=search_fixtures_path,
        page_fixtures_dir=page_fixtures_dir,
        fail_under_end_to_end_rate=0.0,
        data_quality_threshold=0.0,
        max_concurrency=2,
    )

    assert len(report["entries"]) == 2

    # Both entries should succeed at URL selection
    for entry in report["entries"]:
        assert entry["stages"]["search_success"] is True, f"{entry['sku']} search failed"
        assert entry["stages"]["url_selection_success"] is True, f"{entry['sku']} URL selection failed"
        assert entry["stages"]["domain_match"] is True, f"{entry['sku']} domain mismatch"

    # Verify each got the right URL
    alpha = [e for e in report["entries"] if e["sku"] == "SKU-ALPHA"][0]
    beta = [e for e in report["entries"] if e["sku"] == "SKU-BETA"][0]
    assert alpha["discovered_url"] == "https://alpha.example/products/alpha"
    assert beta["discovered_url"] == "https://beta.example/products/beta"
    assert alpha["stages"]["crawl_success"] is True
    assert beta["stages"]["crawl_success"] is True


@pytest.mark.asyncio
async def test_entry_without_ground_truth_skips_data_quality(tmp_path: Path) -> None:
    """Entry with ground_truth omitted passes data quality stage automatically."""
    import hashlib

    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    page_fixtures_dir = tmp_path / "page_fixtures"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-NO-GT",
                        "product_name": "No Ground Truth Product",
                        "brand": "NoGT",
                        "expected_official_domains": ["nogt.example"],
                        "expected_source_url": "https://nogt.example/products/item",
                        "source_type": "official",
                        # ground_truth deliberately omitted
                        "search_fixtures": [
                            {
                                "query": "SKU-NO-GT",
                                "results": [
                                    {
                                        "url": "https://nogt.example/products/item",
                                        "title": "No Ground Truth Product",
                                        "description": "Product without ground truth",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            },
                            {
                                "query": "site:nogt.example No Ground Truth Product",
                                "results": [
                                    {
                                        "url": "https://nogt.example/products/item",
                                        "title": "No Ground Truth Product",
                                        "description": "Product without ground truth",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    search_fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    # Write a page fixture with JSON-LD so extraction + validation succeed
    page_url = "https://nogt.example/products/item"
    cache_key = hashlib.sha256(page_url.encode()).hexdigest()
    page_fixtures_dir.mkdir(parents=True, exist_ok=True)
    (page_fixtures_dir / f"{cache_key}.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "url": page_url,
                "final_url": page_url,
                "html": """
                <html>
                <head>
                    <title>No Ground Truth Product</title>
                    <script type="application/ld+json">
                    {
                        "@context": "https://schema.org",
                        "@type": "Product",
                        "name": "No Ground Truth Product",
                        "brand": {"@type": "Brand", "name": "NoGT"},
                        "description": "A test product.",
                        "sku": "SKU-NO-GT",
                        "image": "https://nogt.example/images/item.jpg",
                        "category": "Widgets"
                    }
                    </script>
                </head>
                <body>
                    <h1>No Ground Truth Product</h1>
                </body>
                </html>
                """,
                "markdown": "",
                "status_code": 200,
            }
        ),
        encoding="utf-8",
    )

    report, json_path, md_path, passed = await run_ai_search_e2e_benchmark(
        dataset_path=dataset_path,
        output_dir=output_dir,
        mode="fixture",
        search_fixtures_path=search_fixtures_path,
        page_fixtures_dir=page_fixtures_dir,
        fail_under_end_to_end_rate=1.0,
        data_quality_threshold=0.6,  # Would fail if ground truth were present
        max_concurrency=1,
    )

    assert passed is True
    assert report["summary"]["end_to_end_success_rate"] == 1.0

    entry = report["entries"][0]
    assert entry["stages"]["search_success"] is True
    assert entry["stages"]["url_selection_success"] is True
    assert entry["stages"]["crawl_success"] is True
    assert entry["stages"]["extraction_success"] is True
    assert entry["stages"]["validation_passed"] is True
    # Data quality should be passed (skipped) despite no ground truth
    assert entry["stages"]["data_quality_passed"] is True
    assert entry["stages"]["end_to_end_success"] is True


@pytest.mark.asyncio
async def test_runner_tracks_failure_stage_for_missing_url(tmp_path: Path) -> None:
    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-NO-RESULTS",
                        "product_name": "Missing Product",
                        "brand": "Unknown",
                        "expected_official_domains": ["unknown.example"],
                        "expected_source_url": "https://unknown.example/product",
                        "source_type": "official",
                        "ground_truth": {
                            "brand": "Unknown",
                            "name": "Missing Product",
                            "description_contains": [],
                            "size_metrics": None,
                            "image_required": False,
                            "categories": [],
                        },
                        # No search fixtures = cache miss in fixture mode
                        "search_fixtures": [],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    search_fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    report, _json_path, _md_path, _passed = await run_ai_search_e2e_benchmark(
        dataset_path=dataset_path,
        output_dir=output_dir,
        mode="fixture",
        search_fixtures_path=search_fixtures_path,
        data_quality_threshold=0.0,
        max_concurrency=1,
    )

    entry = report["entries"][0]
    assert entry["stages"]["search_success"] is False
    assert entry["failure_stage"] == "search"
    assert "search results" in (entry["failure_reason"] or "").lower()


@pytest.mark.asyncio
async def test_fixture_mode_passes_noop_source_selector(tmp_path: Path) -> None:
    """Fixture mode constructs OfficialBrandScraper with _NoopSourceSelector."""
    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-TEST",
                        "product_name": "Test Product",
                        "brand": "TestBrand",
                        "expected_official_domains": ["test.example"],
                        "expected_source_url": "https://test.example/product",
                        "source_type": "official",
                        "search_fixtures": [
                            {
                                "query": "site:test.example SKU-TEST",
                                "results": [
                                    {
                                        "url": "https://test.example/product",
                                        "title": "Test Product",
                                        "description": "Test",
                                        "provider": "fixture",
                                        "result_type": "organic",
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    search_fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    captured_kwargs: dict = {}

    def _capture_init(self, **kwargs: object) -> None:
        captured_kwargs.update(kwargs)

    from benchmarks.ai_search.runner import OfficialBrandScraper

    with patch.object(OfficialBrandScraper, "__init__", _capture_init):
        await run_ai_search_e2e_benchmark(
            dataset_path=dataset_path,
            output_dir=output_dir,
            mode="fixture",
            search_fixtures_path=search_fixtures_path,
            data_quality_threshold=0.0,
            max_concurrency=1,
        )

    assert "source_selector" in captured_kwargs, "source_selector not passed in fixture mode"
    selector = captured_kwargs["source_selector"]
    assert isinstance(selector, _NoopSourceSelector), (
        f"Expected _NoopSourceSelector instance in fixture mode, got {type(selector).__name__}"
    )


@pytest.mark.asyncio
async def test_fixture_mode_uses_discovery_pipeline_for_url_selection(
    tmp_path: Path,
) -> None:
    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    output_dir = tmp_path / "reports"
    page_fixtures_dir = tmp_path / "page_fixtures"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-TEST",
                        "product_name": "Test Product",
                        "brand": "TestBrand",
                        "expected_official_domains": ["test.example"],
                        "expected_source_url": "https://test.example/product",
                        "source_type": "official",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    search_fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    from benchmarks.ai_search.runner import OfficialBrandScraper

    with (
        patch.object(
            OfficialBrandScraper,
            "discover_official_url_candidates",
            new=AsyncMock(
                return_value={
                    "success": True,
                    "selected_url": "https://test.example/product",
                    "predicted_name": "Test Product",
                    "phase1_result_count": 1,
                    "phase2_result_count": 2,
                }
            ),
        ),
        patch.object(
            OfficialBrandScraper,
            "identify_official_url",
            new=AsyncMock(side_effect=AssertionError("identify_official_url should not be called")),
        ),
    ):
        report, _json_path, _md_path, _passed = await run_ai_search_e2e_benchmark(
            dataset_path=dataset_path,
            output_dir=output_dir,
            mode="fixture",
            search_fixtures_path=search_fixtures_path,
            page_fixtures_dir=page_fixtures_dir,
            data_quality_threshold=0.0,
            max_concurrency=1,
        )

    assert report["entries"][0]["discovered_url"] == "https://test.example/product"


@pytest.mark.asyncio
async def test_live_mode_passes_none_source_selector(tmp_path: Path) -> None:
    """Live mode constructs OfficialBrandScraper with source_selector=None (default)."""
    dataset_path = tmp_path / "dataset.json"
    search_fixtures_path = tmp_path / "search_fixtures.json"
    output_dir = tmp_path / "reports"

    dataset_path.write_text(
        json.dumps(
            {
                "schema_version": "ai-search-e2e-benchmark-dataset-v1",
                "entries": [
                    {
                        "sku": "SKU-TEST",
                        "product_name": "Test Product",
                        "brand": "TestBrand",
                        "expected_official_domains": ["test.example"],
                        "expected_source_url": "https://test.example/product",
                        "source_type": "official",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    search_fixtures_path.write_text(json.dumps({"entries": []}), encoding="utf-8")

    captured_kwargs: dict = {}

    def _capture_init(self, **kwargs: object) -> None:
        captured_kwargs.update(kwargs)

    async def _skip_live_extraction(**kwargs: object) -> dict[str, object]:
        return {"success": False, "error": "live extraction skipped in unit test"}

    from benchmarks.ai_search import runner
    from benchmarks.ai_search.runner import OfficialBrandScraper

    with (
        patch.object(OfficialBrandScraper, "__init__", _capture_init),
        patch.object(runner, "_run_extraction_live", _skip_live_extraction),
    ):
        await run_ai_search_e2e_benchmark(
            dataset_path=dataset_path,
            output_dir=output_dir,
            mode="live",
            search_fixtures_path=search_fixtures_path,
            data_quality_threshold=0.0,
            max_concurrency=1,
        )

    assert "source_selector" in captured_kwargs, "source_selector not passed in live mode"
    assert captured_kwargs["source_selector"] is None, (
        f"Expected source_selector=None in live mode, got {type(captured_kwargs['source_selector']).__name__}"
    )
