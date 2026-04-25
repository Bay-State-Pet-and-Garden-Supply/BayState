from __future__ import annotations

import copy
import json
from pathlib import Path

from tests.benchmarks.unified.cv_report import (
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
