"""CLI command for the AI Search end-to-end benchmark."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import click

from benchmarks.ai_search.runner import run_ai_search_e2e_benchmark

DEFAULT_DATASET = Path("benchmarks/ai_search/fixtures/e2e_dataset.json")
LIVE_SMOKE_DATASET = Path("benchmarks/ai_search/fixtures/live_smoke_dataset.json")
DEFAULT_SEARCH_FIXTURES = Path("benchmarks/official_brand/fixtures/search_cache/entries.json")
DEFAULT_PAGE_FIXTURES = Path("benchmarks/ai_search/fixtures/page_fixtures")
DEFAULT_OUTPUT_DIR = Path("reports")


@click.command(name="ai-search-e2e")
@click.option(
    "--dataset",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=DEFAULT_DATASET,
    show_default=True,
    help="Path to the end-to-end benchmark dataset JSON.",
)
@click.option(
    "--mode",
    type=click.Choice(["fixture", "live"], case_sensitive=False),
    default="fixture",
    show_default=True,
    help="Benchmark mode: fixture (deterministic, cached) or live (real API/network calls).",
)
@click.option(
    "--search-fixtures",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    default=DEFAULT_SEARCH_FIXTURES,
    show_default=True,
    help="Path to shared search fixtures JSON (used in fixture mode).",
)
@click.option(
    "--page-fixtures-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=DEFAULT_PAGE_FIXTURES,
    show_default=True,
    help="Directory with cached page HTML fixtures.",
)
@click.option(
    "--output-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=DEFAULT_OUTPUT_DIR,
    show_default=True,
    help="Directory to write benchmark reports.",
)
@click.option(
    "--fail-under-end-to-end-rate",
    type=float,
    default=None,
    help="Fail if end-to-end success rate is below this threshold (0.0-1.0).",
)
@click.option(
    "--fail-under-domain-match-rate",
    type=float,
    default=None,
    help="Fail if domain match rate is below this threshold (0.0-1.0).",
)
@click.option(
    "--data-quality-threshold",
    type=float,
    default=0.6,
    show_default=True,
    help="Minimum overall data quality score (0.0-1.0) to pass the data quality stage.",
)
@click.option(
    "--max-concurrency",
    type=int,
    default=2,
    show_default=True,
    help="Maximum concurrent benchmark entries.",
)
@click.option(
    "--headless/--no-headless",
    default=True,
    show_default=True,
    help="Run browser in headless mode.",
)
@click.option(
    "--live-smoke",
    is_flag=True,
    default=False,
    help="Run a small 3-SKU live smoke test (requires SERPER_API_KEY env var). Overrides --dataset, --mode, and --max-concurrency.",
)
def ai_search_e2e_benchmark(
    dataset: Path,
    mode: str,
    search_fixtures: Path,
    page_fixtures_dir: Path,
    output_dir: Path,
    fail_under_end_to_end_rate: float | None,
    fail_under_domain_match_rate: float | None,
    data_quality_threshold: float,
    max_concurrency: int,
    headless: bool,
    live_smoke: bool,
) -> None:
    """Run the end-to-end AI Search benchmark.

    This benchmark evaluates the complete AI Search pipeline from product input
    through final extracted product data. It measures:

    \b
    - Search success (did we get search results?)
    - URL selection success (did we find a candidate URL?)
    - Domain match (does the selected URL match expected domains?)
    - Crawl success (did the page fetch succeed?)
    - Extraction success (did we get structured product data?)
    - Validation pass (did the extraction pass validation rules?)
    - Data quality (how accurate is the extracted data vs ground truth?)

    In fixture mode, search results are served from cached fixtures and page
    crawling uses pre-captured HTML when available. This is deterministic,
    fast, and suitable for CI.

    In live mode, real search API calls and live page crawling are performed.
    This measures actual production performance but incurs API costs.

    Reports are written as both JSON (structured data) and Markdown (human-readable).

    When --live-smoke is used, the dataset, mode, and concurrency are overridden
    to run a small 3-SKU live smoke test. API keys are checked upfront.
    """
    if live_smoke:
        dataset = LIVE_SMOKE_DATASET
        mode = "live"
        max_concurrency = 1

        if not os.getenv("SERPER_API_KEY"):
            raise click.ClickException(
                "SERPER_API_KEY environment variable is required for live mode."
            )

        if not os.getenv("OPENAI_API_KEY") and not os.getenv("GEMINI_API_KEY"):
            raise click.ClickException(
                "OPENAI_API_KEY or GEMINI_API_KEY is required for live extraction."
            )

        click.echo("Live smoke mode: 3 SKUs, live search + LLM extraction")

    report, json_path, md_path, passed = asyncio.run(
        run_ai_search_e2e_benchmark(
            dataset_path=dataset,
            output_dir=output_dir,
            mode=mode,
            search_fixtures_path=search_fixtures,
            page_fixtures_dir=page_fixtures_dir,
            headless=headless,
            fail_under_end_to_end_rate=fail_under_end_to_end_rate,
            fail_under_domain_match_rate=fail_under_domain_match_rate,
            data_quality_threshold=data_quality_threshold,
            max_concurrency=max_concurrency,
        )
    )

    summary = report["summary"]
    click.echo(
        "AI Search E2E benchmark complete: "
        f"end_to_end_success={float(summary['end_to_end_success_rate']):.2%}, "
        f"domain_match={float(summary['domain_match_rate']):.2%}, "
        f"extraction={float(summary['extraction_success_rate']):.2%}, "
        f"entries={int(summary['total_entries'])}, "
        f"failed={int(summary['total_entries']) - int(summary.get('end_to_end_success_rate', 0) * int(summary['total_entries']))}"
    )
    click.echo(f"JSON report: {json_path}")
    click.echo(f"Markdown report: {md_path}")

    failure_breakdown = summary.get("failure_breakdown", {})
    if failure_breakdown:
        click.echo("\nFailure breakdown:")
        for stage, count in sorted(failure_breakdown.items(), key=lambda x: -x[1]):
            click.echo(f"  {stage}: {count}")

    quality = summary
    click.echo("\nData quality scores:")
    click.echo(f"  brand={float(quality.get('average_brand_score', 0.0)):.3f}")
    click.echo(f"  name={float(quality.get('average_name_score', 0.0)):.3f}")
    click.echo(f"  description={float(quality.get('average_description_score', 0.0)):.3f}")
    click.echo(f"  size_metrics={float(quality.get('average_size_metrics_score', 0.0)):.3f}")
    click.echo(f"  image={float(quality.get('average_image_score', 0.0)):.3f}")
    click.echo(f"  categories={float(quality.get('average_categories_score', 0.0)):.3f}")
    click.echo(f"  overall={float(quality.get('average_overall_quality_score', 0.0)):.3f}")

    if not passed:
        messages: list[str] = []
        if fail_under_end_to_end_rate is not None:
            actual = float(summary["end_to_end_success_rate"])
            if actual < fail_under_end_to_end_rate:
                messages.append(
                    f"End-to-end success rate is below threshold ({actual:.2%} < {fail_under_end_to_end_rate:.2%})"
                )
        if fail_under_domain_match_rate is not None:
            actual = float(summary["domain_match_rate"])
            if actual < fail_under_domain_match_rate:
                messages.append(
                    f"Domain match rate is below threshold ({actual:.2%} < {fail_under_domain_match_rate:.2%})"
                )
        raise click.ClickException("; ".join(messages))


def register_ai_search_benchmark_commands(benchmark_group: click.Group) -> None:
    benchmark_group.add_command(ai_search_e2e_benchmark)
