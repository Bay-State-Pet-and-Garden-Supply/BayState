from __future__ import annotations

from pathlib import Path

from click.testing import CliRunner

from cli.main import cli


def test_official_brand_benchmark_command_runs_with_smoke_fixtures(tmp_path: Path) -> None:
    runner = CliRunner()
    result = runner.invoke(
        cli,
        [
            "benchmark",
            "official-brand",
            "--dataset",
            "benchmarks/official_brand/fixtures/smoke_dataset.json",
            "--search-fixtures",
            "benchmarks/official_brand/fixtures/search_cache/entries.json",
            "--output-dir",
            str(tmp_path),
            "--fail-under-domain-match-rate",
            "1.0",
        ],
    )

    assert result.exit_code == 0
    assert "Official Brand benchmark complete" in result.output
    assert (tmp_path / "official-brand-benchmark.json").exists()
