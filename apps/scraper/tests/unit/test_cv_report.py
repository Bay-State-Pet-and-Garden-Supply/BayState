from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from tests.benchmarks.unified.cv_report import (
    build_live_baseline_report,
    build_offline_cv_report,
    compare_report_to_baseline,
    main,
    render_cv_markdown,
    write_cv_artifacts,
)


def test_offline_cv_report_contains_folds_aggregates_breakdowns_and_confusion_matrix(tmp_path: Path) -> None:
    dataset_path, search_results_path = _write_fixture_files(tmp_path)

    report = build_offline_cv_report(
        dataset_path=dataset_path,
        search_results_path=search_results_path,
        fold_count=5,
        seed=23,
        run_id="unit-offline-cv",
    )

    assert report["run_id"] == "unit-offline-cv"
    assert len(report["folds"]) == 5
    assert len(report["fold_list"]) == 5
    assert report["aggregate_metrics"]["top1_official_accuracy"]["mean"] == 1.0
    assert report["aggregate_metrics"]["top1_official_accuracy"]["std"] == 0.0
    assert report["aggregate_metrics"]["top1_official_accuracy"]["confidence_interval_95"] == {"low": 1.0, "high": 1.0}
    assert report["brand_breakdown"]["Acme"]["examples"] == 2
    assert report["category_breakdown"]["Tools"]["examples"] == 2
    assert report["confusion_matrix"]["official"]["official"] == 4
    assert report["confusion_matrix"]["retailer"]["retailer"] == 1
    assert report["pass_fail"]["decision"] == "pass"


def test_cv_markdown_and_artifacts_are_written_offline(tmp_path: Path) -> None:
    dataset_path, search_results_path = _write_fixture_files(tmp_path)
    report = build_offline_cv_report(dataset_path=dataset_path, search_results_path=search_results_path, fold_count=5)

    json_path, markdown_path = write_cv_artifacts(report, tmp_path / "reports")
    markdown = render_cv_markdown(report)

    assert json_path.exists()
    assert markdown_path.exists()
    assert "## Cross-Validation Folds" in markdown
    assert "## Aggregate Mean/Std/CI" in markdown
    assert "## Per-Fold Metrics" in markdown
    assert "## Confusion Matrix" in markdown
    assert json.loads(json_path.read_text(encoding="utf-8"))["run_id"] == report["run_id"]


def test_compare_report_to_baseline_fails_when_candidate_is_below_threshold(tmp_path: Path) -> None:
    dataset_path, search_results_path = _write_fixture_files(tmp_path)
    baseline = build_offline_cv_report(dataset_path=dataset_path, search_results_path=search_results_path, fold_count=5, run_id="baseline")
    candidate = copy.deepcopy(baseline)
    candidate["run_id"] = "candidate"
    candidate["top1_official_accuracy"] = 0.8
    candidate["pass_fail"] = baseline["pass_fail"]

    comparison = compare_report_to_baseline(candidate, baseline)

    failed_metrics = [check["metric"] for check in comparison["pass_fail"]["checks"] if not check["passed"]]
    assert comparison["decision"] == "fail"
    assert failed_metrics == ["top1_official_accuracy"]


def test_compare_command_exits_nonzero_for_bad_candidate(tmp_path: Path, capsys) -> None:
    dataset_path, search_results_path = _write_fixture_files(tmp_path)
    baseline = build_offline_cv_report(dataset_path=dataset_path, search_results_path=search_results_path, fold_count=5, run_id="baseline")
    candidate = copy.deepcopy(baseline)
    candidate["run_id"] = "candidate"
    candidate["top1_official_accuracy"] = 0.8

    baseline_path = tmp_path / "baseline.json"
    candidate_path = tmp_path / "candidate.json"
    baseline_path.write_text(json.dumps(baseline), encoding="utf-8")
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")

    exit_code = main(["compare", "--baseline", str(baseline_path), "--candidate", str(candidate_path)])
    output = capsys.readouterr().out

    assert exit_code == 1
    assert '"decision": "fail"' in output
    assert "top1_official_accuracy" in output


def test_generate_command_writes_json_and_markdown(tmp_path: Path, capsys) -> None:
    dataset_path, search_results_path = _write_fixture_files(tmp_path)
    output_dir = tmp_path / "generated"

    exit_code = main(
        [
            "generate",
            "--dataset",
            str(dataset_path),
            "--search-results",
            str(search_results_path),
            "--output-dir",
            str(output_dir),
            "--fold-count",
            "5",
            "--seed",
            "23",
            "--run-id",
            "cli-offline-cv",
        ]
    )
    output = capsys.readouterr().out

    assert exit_code == 0
    assert "JSON report:" in output
    assert (output_dir / "offline-cv-report.json").exists()
    assert (output_dir / "offline-cv-report.md").exists()


def test_live_baseline_report_uses_search_client_results_and_writes_replay_artifact(tmp_path: Path) -> None:
    dataset_path, _search_results_path = _write_fixture_files(tmp_path)
    replay_path = tmp_path / "live-search-results.json"
    search_client = _LiveSearchClientStub(
        {
            "Acme Hammer": [{"url": "https://acme.com/products/hammer", "title": "Acme Hammer", "description": "Official Acme hammer page"}],
            "Acme Saw": [{"url": "https://acme.com/products/saw", "title": "Acme Saw", "description": "Official Acme saw page"}],
            "Bravo Hose": [{"url": "https://bravo.com/products/hose", "title": "Bravo Hose", "description": "Official Bravo hose page"}],
            "Bravo Rake": [{"url": "https://bravo.com/products/rake", "title": "Bravo Rake", "description": "Official Bravo rake page"}],
            "Retail Paint": [
                {
                    "url": "https://www.homedepot.com/p/retail-paint",
                    "title": "Retail Paint",
                    "description": "Retail paint detail page",
                }
            ],
        }
    )

    report = build_live_baseline_report(
        dataset_path=dataset_path,
        run_id="baseline-1",
        search_client=search_client,
        max_cost_usd=0.01,
        search_results_output_path=replay_path,
    )

    replay_payload = json.loads(replay_path.read_text(encoding="utf-8"))

    assert report["run_id"] == "baseline-1"
    assert report["top1_official_accuracy"] == 1.0
    assert report["retailer_false_positive_rate"] == 0.0
    assert report["field_correctness"] == 1.0
    assert report["cost_usd"] == 0.005
    assert report["model_provider_metadata"]["search_provider"] == "live-serper"
    assert report["model_provider_metadata"]["live_api_calls"] == 5
    assert replay_payload["schema_version"] == 1
    assert len(replay_payload["entries"]) == 5
    assert search_client.queries == [
        "Acme Hammer",
        "Acme Saw",
        "Bravo Hose",
        "Bravo Rake",
        "Retail Paint",
    ]


def test_live_baseline_report_refuses_to_run_when_cost_cap_is_too_low(tmp_path: Path) -> None:
    dataset_path, _search_results_path = _write_fixture_files(tmp_path)

    with pytest.raises(ValueError, match=r"Estimated live baseline cost \$0.01 exceeds max_cost_usd \$0.00"):
        build_live_baseline_report(
            dataset_path=dataset_path,
            run_id="baseline-tight-cap",
            search_client=_LiveSearchClientStub({}),
            max_cost_usd=0.004,
        )


def _write_fixture_files(tmp_path: Path) -> tuple[Path, Path]:
    entries = [
        _entry("sku-1", "Acme", "Tools", "Acme Hammer", "https://acme.com/products/hammer"),
        _entry("sku-2", "Acme", "Tools", "Acme Saw", "https://acme.com/products/saw"),
        _entry("sku-3", "Bravo", "Garden", "Bravo Hose", "https://bravo.com/products/hose"),
        _entry("sku-4", "Bravo", "Garden", "Bravo Rake", "https://bravo.com/products/rake"),
        _entry("sku-5", "Retail Brand", "Paint", "Retail Paint", "https://www.homedepot.com/p/retail-paint"),
    ]
    search_entries = [
        {
            "query": entry["query"],
            "results": [
                {
                    "url": entry["expected_source_url"],
                    "title": entry["product_name"],
                    "description": f"Official cached page for {entry['product_name']}",
                    "provider": "fixture",
                    "result_type": "organic",
                }
            ],
        }
        for entry in entries
    ]
    dataset_path = tmp_path / "dataset.json"
    search_results_path = tmp_path / "search_results.json"
    dataset_path.write_text(json.dumps({"entries": entries}), encoding="utf-8")
    search_results_path.write_text(json.dumps({"schema_version": 1, "entries": search_entries}), encoding="utf-8")
    return dataset_path, search_results_path


def _entry(sku: str, brand: str, category: str, product_name: str, expected_url: str) -> dict[str, str]:
    return {
        "sku": sku,
        "query": product_name,
        "brand": brand,
        "category": category,
        "product_name": product_name,
        "expected_source_url": expected_url,
    }


class _LiveSearchClientStub:
    def __init__(self, results_by_query: dict[str, list[dict[str, object]]]) -> None:
        self.results_by_query = results_by_query
        self.queries: list[str] = []

    async def search(self, query: str) -> tuple[list[dict[str, object]], str | None]:
        self.queries.append(query)
        return [dict(result) for result in self.results_by_query.get(query, [])], None
