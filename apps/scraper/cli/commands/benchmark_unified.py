"""Unified benchmark CLI with subcommands: run, report, compare, validate-urls.

Integrates with:
    - tests.benchmarks.unified.config  (BenchmarkConfig, load_config, get_default_config)
    - tests.benchmarks.unified.reporter (BenchmarkReporter)
    - tests.benchmarks.unified.metrics  (BenchmarkMetricsCollector, MetricsStore, TrendAnalyzer)
    - tests.benchmarks.unified.url_validator (validate_urls, generate_manifest)
    - cli.commands.benchmark (legacy extraction runner)

Usage:
    python -m scraper.cli benchmark_unified --help
    python -m scraper.cli benchmark_unified run --benchmarks=extraction --max-urls=1 --modes=llm-free
    python -m scraper.cli benchmark_unified report --input=report.json
    python -m scraper.cli benchmark_unified compare --current=report.json --previous=prev.json
    python -m scraper.cli benchmark_unified validate-urls --dataset=golden_dataset_v3.json
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any

import click

# ---------------------------------------------------------------------------
# Lazy imports — heavy modules loaded only when needed
# ---------------------------------------------------------------------------

_MAX_COST_PER_PAGE = 0.05  # Conservative estimate for LLM extraction


def _import_config() -> Any:
    from tests.benchmarks.unified.config import (
        VALID_MODES,
        BenchmarkConfig,
        get_default_config,
        load_config,
    )

    return BenchmarkConfig, get_default_config, load_config, VALID_MODES


def _import_reporter() -> Any:
    from tests.benchmarks.unified.reporter import BenchmarkReporter

    return BenchmarkReporter


def _import_metrics() -> Any:
    from tests.benchmarks.unified.metrics import (
        BenchmarkMetricsCollector,
        MetricsStore,
        TrendAnalyzer,
    )

    return BenchmarkMetricsCollector, MetricsStore, TrendAnalyzer


def _import_url_validator() -> Any:
    from tests.benchmarks.unified.url_validator import URLValidator

    return URLValidator


def _import_legacy_benchmark() -> Any:
    """Import the legacy benchmark module for the 'run' subcommand."""
    from cli.commands.benchmark import (
        SUPPORTED_MODES,
        _load_products,
        _projected_cost_usd,
        _resolve_benchmark_modes,
        _resolve_llm_config,
        _requires_llm,
        _run_benchmark_suite,
        _build_report,
        _write_report,
        _echo_summary,
        DEFAULT_HEADLESS,
        DEFAULT_PROMPT_VERSION,
    )

    return (
        SUPPORTED_MODES,
        _load_products,
        _projected_cost_usd,
        _resolve_benchmark_modes,
        _resolve_llm_config,
        _requires_llm,
        _run_benchmark_suite,
        _build_report,
        _write_report,
        _echo_summary,
        DEFAULT_HEADLESS,
        DEFAULT_PROMPT_VERSION,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _estimate_cost(num_urls: int, iterations: int, modes: tuple[str, ...]) -> float:
    """Estimate worst-case cost for a benchmark run."""
    llm_mode_count = sum(1 for m in modes if m in {"llm", "auto"})
    return float(num_urls * iterations * llm_mode_count * _MAX_COST_PER_PAGE)


def _parse_modes(modes_str: str) -> tuple[str, ...]:
    """Parse comma-separated modes string into a tuple."""
    parsed = tuple(m.strip() for m in modes_str.split(",") if m.strip())
    if not parsed:
        raise click.ClickException("No modes specified. Use --modes=llm-free,llm,auto")
    return parsed


def _validate_modes(modes: tuple[str, ...], valid_modes: tuple[str, ...]) -> None:
    """Validate that all modes are in the valid set."""
    invalid = [m for m in modes if m not in valid_modes]
    if invalid:
        raise click.ClickException(f"Invalid modes: {invalid}. Must be subset of {valid_modes}")


# ---------------------------------------------------------------------------
# Main group
# ---------------------------------------------------------------------------


@click.group(name="benchmark_unified")
def benchmark_unified() -> None:
    """Unified benchmark CLI for extraction, ranking, and performance tests."""
    pass


# ---------------------------------------------------------------------------
# run subcommand
# ---------------------------------------------------------------------------


@benchmark_unified.command(name="run")
@click.option(
    "--benchmarks",
    "benchmarks_str",
    default="extraction",
    show_default=True,
    help="Comma-separated benchmark types: extraction, ranking, performance.",
)
@click.option(
    "--max-urls",
    "max_urls",
    type=int,
    default=None,
    help="Maximum number of URLs to benchmark (truncates config URL list).",
)
@click.option(
    "--max-products",
    "max_products",
    type=int,
    default=None,
    help="Maximum number of products from products_path (overrides max-urls for file-based input).",
)
@click.option(
    "--modes",
    "modes_str",
    default="auto",
    show_default=True,
    help="Comma-separated extraction modes: llm-free, llm, auto.",
)
@click.option(
    "--proxy",
    "proxy",
    default=None,
    help="Proxy URL or comma-separated pool for rotation.",
)
@click.option(
    "--output-dir",
    "output_dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path(".sisyphus/evidence"),
    show_default=True,
    help="Directory for report output.",
)
@click.option(
    "--timeout",
    "timeout",
    type=int,
    default=30,
    show_default=True,
    help="Per-URL timeout in seconds.",
)
@click.option(
    "--concurrency",
    "concurrency",
    type=int,
    default=5,
    show_default=True,
    help="Max concurrent extractions.",
)
@click.option(
    "--config",
    "config_path",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Path to YAML/JSON benchmark config file.",
)
@click.option(
    "--products",
    "products_path",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Path to JSON products file (legacy extraction benchmark).",
)
@click.option(
    "--iterations",
    "iterations",
    type=int,
    default=3,
    show_default=True,
    help="Iterations per URL per mode.",
)
@click.option(
    "--llm-provider",
    "llm_provider",
    type=click.Choice(("auto", "openai", "gemini", "openai_compatible"), case_sensitive=False),
    default="auto",
    show_default=True,
    help="LLM provider for llm/auto modes.",
)
@click.option(
    "--llm-model",
    "llm_model",
    default=None,
    help="Optional LLM model override.",
)
@click.option(
    "--max-cost-usd",
    "max_cost_usd",
    type=float,
    default=2.0,
    show_default=True,
    help="Abort if projected cost exceeds this limit.",
)
@click.option(
    "--headless/--no-headless",
    default=True,
    show_default=True,
    help="Run browser in headless mode.",
)
def run_benchmark(
    benchmarks_str: str,
    max_urls: int | None,
    max_products: int | None,
    modes_str: str,
    proxy: str | None,
    output_dir: Path,
    timeout: int,
    concurrency: int,
    config_path: Path | None,
    products_path: Path | None,
    iterations: int,
    llm_provider: str,
    llm_model: str | None,
    max_cost_usd: float,
    headless: bool,
) -> None:
    """Run benchmark(s) with cost estimation and progress output."""
    # Parse and validate modes
    modes = _parse_modes(modes_str)

    # Determine benchmark types
    benchmark_types = [b.strip() for b in benchmarks_str.split(",") if b.strip()]
    valid_benchmark_types = {"extraction", "ranking", "performance"}
    invalid_types = [b for b in benchmark_types if b not in valid_benchmark_types]
    if invalid_types:
        raise click.ClickException(f"Invalid benchmark types: {invalid_types}. Valid: {valid_benchmark_types}")

    # Load or build config
    BenchmarkConfig, get_default_config, load_config, VALID_MODES = _import_config()
    _validate_modes(modes, VALID_MODES)

    if config_path is not None:
        cfg = load_config(config_path)
        # Override with CLI flags
        if modes != ("auto",):
            cfg.modes = list(modes)
        if timeout != 30:
            cfg.timeout = timeout
        if concurrency != 5:
            cfg.concurrency = concurrency
        if iterations != 3:
            cfg.iterations = iterations
        if max_urls is not None and cfg.urls:
            cfg.urls = cfg.urls[:max_urls]
    else:
        cfg = get_default_config()
        cfg.modes = list(modes)
        cfg.timeout = timeout
        cfg.concurrency = concurrency
        cfg.iterations = iterations
        if max_urls is not None and cfg.urls:
            cfg.urls = cfg.urls[:max_urls]

    # Resolve effective URL count
    effective_urls = len(cfg.urls) if cfg.urls else 0
    if products_path is not None:
        # Legacy path: load products file
        effective_urls = max_urls or 0

    # Cost estimation
    total_modes = tuple(cfg.modes)
    estimated_cost = _estimate_cost(
        num_urls=max(effective_urls, 1),
        iterations=cfg.iterations,
        modes=total_modes,
    )

    click.echo("=" * 60)
    click.echo("BENCHMARK RUN — Cost Estimation")
    click.echo("=" * 60)
    click.echo(f"  Benchmark types : {', '.join(benchmark_types)}")
    click.echo(f"  Modes           : {', '.join(total_modes)}")
    click.echo(f"  URLs             : {effective_urls or 'from products file'}")
    click.echo(f"  Iterations       : {cfg.iterations}")
    click.echo(f"  Timeout          : {cfg.timeout}s per URL")
    click.echo(f"  Concurrency      : {cfg.concurrency}")
    click.echo(f"  Estimated cost   : ${estimated_cost:.2f} for {effective_urls or '?'} URLs in {len(total_modes)} mode(s)")
    click.echo("=" * 60)

    if estimated_cost > max_cost_usd:
        raise click.ClickException(
            f"Estimated cost ${estimated_cost:.2f} exceeds --max-cost-usd ${max_cost_usd:.2f}. Lower iterations/URLs or raise the limit."
        )

    if not click.confirm("Proceed with benchmark?", default=False):
        click.echo("Aborted.")
        return

    # --- Run extraction benchmark (primary) ---
    if "extraction" in benchmark_types:
        click.echo("\n--- Extraction Benchmark ---")

        if products_path is not None:
            # Legacy extraction runner from cli.commands.benchmark
            (
                SUPPORTED_MODES,
                _load_products,
                _projected_cost_usd,
                _resolve_benchmark_modes,
                _resolve_llm_config,
                _requires_llm,
                _run_benchmark_suite,
                _build_report,
                _write_report,
                _echo_summary,
                DEFAULT_HEADLESS,
                DEFAULT_PROMPT_VERSION,
            ) = _import_legacy_benchmark()

            products = _load_products(products_path)
            if max_products is not None:
                products = products[:max_products]

            benchmark_modes = _resolve_benchmark_modes(modes_str)
            llm_config = _resolve_llm_config(llm_provider, llm_model)

            if _requires_llm(benchmark_modes) and not llm_config.ready:
                raise click.ClickException(
                    "LLM benchmarking requires credentials. Set OPENAI_API_KEY, GEMINI_API_KEY, "
                    "or OPENAI_COMPATIBLE_BASE_URL before running llm/auto benchmarks."
                )

            projected = _projected_cost_usd(len(products), iterations, benchmark_modes)
            if projected > max_cost_usd:
                raise click.ClickException(f"Projected cost ${projected:.2f} exceeds --max-cost-usd ${max_cost_usd:.2f}.")

            click.echo(f"Running {len(products)} products × {iterations} iterations × {len(benchmark_modes)} modes...")

            attempts = asyncio.run(
                _run_benchmark_suite(
                    benchmark_modes=benchmark_modes,
                    products=products,
                    iterations=iterations,
                    llm_config=llm_config,
                    headless=headless,
                    prompt_version=DEFAULT_PROMPT_VERSION,
                )
            )

            report = _build_report(
                requested_mode=modes_str,
                benchmark_modes=benchmark_modes,
                products_path=products_path,
                iterations=iterations,
                llm_config=llm_config,
                attempts=attempts,
            )

            output_path = output_dir / f"benchmark-extraction-{int(time.time())}.json"
            written_path = _write_report(output_path, report)
            _echo_summary(report, written_path)
        else:
            # Unified config-based runner
            click.echo(f"Running {len(cfg.urls)} URLs × {cfg.iterations} iterations × {len(cfg.modes)} modes...")
            click.echo("Note: Unified config-based extraction runner uses pytest-based benchmarks.")
            click.echo("      For full extraction runs, use --products path or the legacy 'benchmark extraction' command.")

            # Collect metrics using the unified metrics collector
            BenchmarkMetricsCollector, MetricsStore, TrendAnalyzer = _import_metrics()
            collector = BenchmarkMetricsCollector("extraction_unified")
            collector.set_metadata("modes", list(cfg.modes))
            collector.set_metadata("urls_count", len(cfg.urls))
            collector.set_metadata("iterations", cfg.iterations)
            collector.set_metadata("timeout", cfg.timeout)

            # Record a placeholder metric for config validation
            collector.record(
                accuracy=0.0,
                success_rate=0.0,
                duration_ms=0.0,
                cost_usd=0.0,
            )

            report_obj = collector.build_report()
            store = MetricsStore(reports_dir=str(output_dir / "benchmarks"))
            saved_path = store.save(report_obj)
            click.echo(f"\nMetrics saved to: {saved_path}")

    # --- Placeholder for ranking and performance ---
    if "ranking" in benchmark_types:
        click.echo("\n--- Ranking Benchmark ---")
        click.echo("Ranking benchmark requires pytest. Run:")
        click.echo("  pytest tests/benchmarks/unified/test_search_ranking.py -v")

    if "performance" in benchmark_types:
        click.echo("\n--- Performance Benchmark ---")
        click.echo("Performance benchmark requires pytest. Run:")
        click.echo("  pytest tests/benchmarks/unified/test_engine_performance.py -v")

    click.echo("\nBenchmark run complete.")


# ---------------------------------------------------------------------------
# report subcommand
# ---------------------------------------------------------------------------


@benchmark_unified.command(name="report")
@click.option(
    "--input",
    "input_path",
    required=True,
    type=click.Path(exists=True, path_type=Path),
    help="Path to benchmark report JSON file.",
)
@click.option(
    "--format",
    "output_format",
    type=click.Choice(("json", "html", "both")),
    default="both",
    show_default=True,
    help="Output format for the report.",
)
@click.option(
    "--output-dir",
    "output_dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path(".sisyphus/evidence"),
    show_default=True,
    help="Directory for report output.",
)
def report_benchmark(
    input_path: Path,
    output_format: str,
    output_dir: Path,
) -> None:
    """Generate formatted reports from benchmark JSON results."""
    BenchmarkReporter = _import_reporter()

    with input_path.open(encoding="utf-8") as f:
        data = json.load(f)

    # Reconstruct a minimal config and results from the JSON
    from tests.benchmarks.unified.base import BenchmarkResult
    from tests.benchmarks.unified.config import BenchmarkConfig

    metadata = data.get("metadata", {})
    results_data = data.get("results", [])

    results = []
    for r in results_data:
        results.append(
            BenchmarkResult(
                success_rate=r.get("success_rate", 0.0) if isinstance(r.get("success_rate"), (int, float)) else 0.0,
                accuracy=r.get("accuracy", 0.0) if isinstance(r.get("accuracy"), (int, float)) else 0.0,
                duration_ms=r.get("duration_ms", 0.0) if isinstance(r.get("duration_ms"), (int, float)) else 0.0,
                cost_usd=r.get("cost_usd", 0.0) if isinstance(r.get("cost_usd"), (int, float)) else 0.0,
                errors=r.get("errors", []) if isinstance(r.get("errors"), list) else [],
                metadata=r.get("metadata", {}) if isinstance(r.get("metadata"), dict) else {},
            )
        )

    cfg = BenchmarkConfig(
        urls=metadata.get("urls", []),
        modes=metadata.get("modes", ["auto"]),
    )

    reporter = BenchmarkReporter(
        config=cfg,
        results=results,
        metadata=metadata,
    )

    output_dir.mkdir(parents=True, exist_ok=True)

    if output_format in ("json", "both"):
        json_path = output_dir / f"report-{int(time.time())}.json"
        reporter.generate_json_report(json_path)
        click.echo(f"JSON report written to: {json_path}")

    if output_format in ("html", "both"):
        html_path = output_dir / f"report-{int(time.time())}.html"
        reporter.generate_html_report(html_path)
        click.echo(f"HTML report written to: {html_path}")


# ---------------------------------------------------------------------------
# compare subcommand
# ---------------------------------------------------------------------------


@benchmark_unified.command(name="compare")
@click.option(
    "--current",
    "current_path",
    required=True,
    type=click.Path(exists=True, path_type=Path),
    help="Path to current benchmark report JSON.",
)
@click.option(
    "--previous",
    "previous_path",
    required=True,
    type=click.Path(exists=True, path_type=Path),
    help="Path to previous benchmark report JSON.",
)
@click.option(
    "--threshold",
    "threshold_pct",
    type=float,
    default=10.0,
    show_default=True,
    help="Regression threshold percentage.",
)
@click.option(
    "--output-dir",
    "output_dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=Path(".sisyphus/evidence"),
    show_default=True,
    help="Directory for comparison output.",
)
def compare_benchmarks(
    current_path: Path,
    previous_path: Path,
    threshold_pct: float,
    output_dir: Path,
) -> None:
    """Compare two benchmark reports and detect regressions."""
    _, MetricsStore, TrendAnalyzer = _import_metrics()

    def _load_report(path: Path) -> Any:
        from tests.benchmarks.unified.metrics import BenchmarkMetrics, BenchmarkReport

        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        metrics_data = data.get("metrics", {})
        return BenchmarkReport(
            timestamp=data.get("timestamp", ""),
            commit_hash=data.get("commit_hash", "unknown"),
            benchmark_name=data.get("benchmark_name", "unknown"),
            metrics=BenchmarkMetrics(**metrics_data) if metrics_data else BenchmarkMetrics(),
            metadata=data.get("metadata", {}),
        )

    current_report = _load_report(current_path)
    previous_report = _load_report(previous_path)

    analyzer = TrendAnalyzer(regression_threshold_pct=threshold_pct)
    comparison = analyzer.compare(previous_report, current_report)

    click.echo("=" * 60)
    click.echo("BENCHMARK COMPARISON")
    click.echo("=" * 60)
    click.echo(f"  Previous : {previous_path.name} ({previous_report.timestamp})")
    click.echo(f"  Current  : {current_path.name} ({current_report.timestamp})")
    click.echo(f"  Threshold: {threshold_pct}%")
    click.echo()

    if comparison.regressions:
        click.echo(click.style("REGRESSIONS DETECTED:", fg="red", bold=True))
        for r in comparison.regressions:
            click.echo(f"  ▸ {r.metric_name}: {r.previous_value:.4f} → {r.current_value:.4f} ({r.change_pct:+.1f}%)")
    else:
        click.echo(click.style("No regressions detected.", fg="green"))

    if comparison.improvements:
        click.echo(click.style("\nIMPROVEMENTS:", fg="green"))
        for r in comparison.improvements:
            click.echo(f"  ▸ {r.metric_name}: {r.previous_value:.4f} → {r.current_value:.4f} ({r.change_pct:+.1f}%)")

    if comparison.stable:
        click.echo(click.style("\nSTABLE:", fg="yellow"))
        for r in comparison.stable:
            click.echo(f"  ▸ {r.metric_name}: {r.previous_value:.4f} → {r.current_value:.4f} ({r.change_pct:+.1f}%)")

    # Save comparison result
    output_dir.mkdir(parents=True, exist_ok=True)
    comparison_path = output_dir / f"comparison-{int(time.time())}.json"
    comparison_path.write_text(
        json.dumps(comparison.to_dict(), indent=2, default=str),
        encoding="utf-8",
    )
    click.echo(f"\nComparison saved to: {comparison_path}")

    if comparison.has_regressions:
        sys.exit(1)


# ---------------------------------------------------------------------------
# validate-urls subcommand
# ---------------------------------------------------------------------------


@benchmark_unified.command(name="validate-urls")
@click.option(
    "--dataset",
    "dataset_path",
    type=click.Path(exists=True, path_type=Path),
    default=None,
    help="Path to golden dataset JSON file.",
)
@click.option(
    "--urls",
    "urls_str",
    default=None,
    help="Comma-separated URLs to validate.",
)
@click.option(
    "--concurrency",
    "concurrency",
    type=int,
    default=20,
    show_default=True,
    help="Max concurrent URL checks.",
)
@click.option(
    "--timeout",
    "timeout",
    type=int,
    default=10,
    show_default=True,
    help="Per-URL timeout in seconds.",
)
@click.option(
    "--output",
    "output_path",
    type=click.Path(path_type=Path),
    default=None,
    help="Output manifest path (default: data/benchmark_live_manifest.json).",
)
def validate_urls_cmd(
    dataset_path: Path | None,
    urls_str: str | None,
    concurrency: int,
    timeout: int,
    output_path: Path | None,
) -> None:
    """Validate URLs and generate a live manifest for benchmark runs."""
    URLValidator = _import_url_validator()

    validator = URLValidator(timeout=float(timeout), max_concurrency=concurrency)

    if urls_str:
        urls_to_check = [u.strip() for u in urls_str.split(",") if u.strip()]
        click.echo(f"Validating {len(urls_to_check)} URLs (concurrency={concurrency}, timeout={timeout}s)...")
        results = []
        for url in urls_to_check:
            result = asyncio.run(validator.check_url(url))
            results.append(result)
    elif dataset_path is not None:
        click.echo(f"Validating URLs from {dataset_path} (concurrency={concurrency}, timeout={timeout}s)...")
        _, results = validator.validate_dataset(dataset_path)
    else:
        from tests.benchmarks.unified.url_validator import DEFAULT_DATASET_PATH

        if DEFAULT_DATASET_PATH.exists():
            click.echo(f"Validating URLs from default dataset (concurrency={concurrency}, timeout={timeout}s)...")
            _, results = validator.validate_dataset(DEFAULT_DATASET_PATH)
        else:
            raise click.ClickException("No URLs provided. Use --dataset or --urls, or ensure golden_dataset_v3.json exists.")

    alive_count = sum(1 for r in results if r.alive)
    dead_count = len(results) - alive_count

    click.echo(f"\nResults: {alive_count} alive, {dead_count} dead out of {len(results)} URLs")

    if dead_count > 0:
        click.echo(click.style("\nDead URLs:", fg="red"))
        for r in results:
            if not r.alive:
                click.echo(f"  ✗ {r.url} — {r.error or f'status {r.status_code}'}")

    if output_path is None:
        from tests.benchmarks.unified.url_validator import DEFAULT_MANIFEST_PATH

        output_path = DEFAULT_MANIFEST_PATH

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_data = [r.to_dict() for r in results]
    output_path.write_text(json.dumps(manifest_data, indent=2, default=str), encoding="utf-8")
    click.echo(f"\nResults written to: {output_path}")


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------


def register_benchmark_unified_commands(benchmark_unified_group: click.Group) -> None:
    """Register unified benchmark CLI commands."""
    # All subcommands are already registered via decorators on the group
    pass
