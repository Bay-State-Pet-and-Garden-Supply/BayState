from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from click.testing import CliRunner

from cli.main import cli


def test_cohort_visualize_table_output(tmp_path: Path) -> None:
    products_path = tmp_path / "products.json"
    _ = products_path.write_text(json.dumps(_sample_products()))

    runner = CliRunner()
    result = runner.invoke(cli, ["cohort", "visualize", "--input-file", str(products_path), "--limit", "10"])

    assert result.exit_code == 0
    assert "Cohort Visualization" in result.output
    assert "12345678" in result.output
    assert "Brand A (2)" in result.output
    assert "Category 1 (2)" in result.output


def test_cohort_visualize_json_output_filters_prefix(tmp_path: Path) -> None:
    products_path = tmp_path / "products.json"
    _ = products_path.write_text(json.dumps(_sample_products()))

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "cohort",
            "visualize",
            "--input-file",
            str(products_path),
            "--format",
            "json",
            "--upc-prefix",
            "12345678",
        ],
    )

    assert result.exit_code == 0

    payload = cast(dict[str, object], json.loads(result.output))
    summary = cast(dict[str, object], payload["summary"])
    cohorts = cast(list[dict[str, object]], payload["cohorts"])

    assert summary["matching_cohorts"] == 1
    assert cohorts[0]["cohort_key"] == "12345678"
    assert cohorts[0]["brand_distribution"] == {"Brand A": 2}


def test_cohort_visualize_exports_json_payload(tmp_path: Path) -> None:
    products_path = tmp_path / "products.json"
    export_path = tmp_path / "visualization.json"
    _ = products_path.write_text(json.dumps(_sample_products()))

    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "cohort",
            "visualize",
            "--input-file",
            str(products_path),
            "--export",
            str(export_path),
        ],
    )

    assert result.exit_code == 0
    assert export_path.exists()

    payload = cast(dict[str, object], json.loads(export_path.read_text()))
    summary = cast(dict[str, object], payload["summary"])
    cohorts = cast(list[dict[str, object]], payload["cohorts"])

    assert summary["cohort_count"] == 2
    assert [cohort["cohort_key"] for cohort in cohorts] == ["12345678", "98765432"]


def _sample_products() -> list[dict[str, str]]:
    return [
        {
            "sku": "123456789012",
            "product_name": "Product One",
            "brand": "Brand A",
            "category": "Category 1",
        },
        {
            "sku": "123456789098",
            "product_name": "Product Two",
            "brand": "Brand A",
            "category": "Category 1",
        },
        {
            "sku": "987654321012",
            "product_name": "Product Three",
            "brand": "Brand B",
            "category": "Category 2",
        },
        {
            "sku": "987654321098",
            "product_name": "Product Four",
            "brand": "Brand C",
            "category": "Category 2",
        },
    ]
