from __future__ import annotations

import asyncio
from pathlib import Path

import click

from benchmarks.official_brand.runner import run_official_brand_fixture_benchmark

DEFAULT_DATASET = Path("benchmarks/official_brand/fixtures/smoke_dataset.json")
DEFAULT_SEARCH_FIXTURES = Path("benchmarks/official_brand/fixtures/search_cache/entries.json")
DEFAULT_OUTPUT_DIR = Path("reports")


@click.command(name="official-brand")
@click.option("--dataset", type=click.Path(exists=True, dir_okay=False, path_type=Path), default=DEFAULT_DATASET, show_default=True)
@click.option(
    "--search-fixtures",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=DEFAULT_SEARCH_FIXTURES,
    show_default=True,
)
@click.option("--output-dir", type=click.Path(file_okay=False, path_type=Path), default=DEFAULT_OUTPUT_DIR, show_default=True)
@click.option("--fail-under-domain-match-rate", type=float, default=None)
def official_brand_benchmark(
    dataset: Path,
    search_fixtures: Path,
    output_dir: Path,
    fail_under_domain_match_rate: float | None,
) -> None:
    """Run Official Brand discovery benchmark in fixture mode."""
    report, json_path, md_path, passed = asyncio.run(
        run_official_brand_fixture_benchmark(
            dataset_path=dataset,
            search_fixtures_path=search_fixtures,
            output_dir=output_dir,
            fail_under_domain_match_rate=fail_under_domain_match_rate,
        )
    )

    summary = report["summary"]
    click.echo(
        "Official Brand benchmark complete: "
        f"domain_match_rate={float(summary['domain_match_rate']):.2%}, "
        f"entries={int(summary['total_entries'])}, "
        f"failed={int(summary['failed_count'])}"
    )
    click.echo(f"JSON report: {json_path}")
    click.echo(f"Markdown report: {md_path}")

    if not passed:
        raise click.ClickException(
            "Domain match rate is below threshold "
            f"({float(summary['domain_match_rate']):.2%} < {fail_under_domain_match_rate:.2%})"
        )


def register_official_brand_benchmark_commands(benchmark_group: click.Group) -> None:
    benchmark_group.add_command(official_brand_benchmark)
