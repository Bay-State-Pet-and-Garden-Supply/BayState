"""BayState Runner CLI - Local cohort testing tool.

Usage:
    bsr [OPTIONS] COMMAND [ARGS]...

Options:
    --version  Show version information
    --help     Show this message and exit

Commands:
    audit                  Run fleet-wide scraper audits.
    batch                  Test product batches locally.
    benchmark              Run benchmark tools.
    cohort                 Visualize and manage cohorts.
"""

from __future__ import annotations

from pathlib import Path

import click
from dotenv import load_dotenv

from .commands.audit import register_audit_commands
from .commands.batch import register_batch_commands
from .commands.cohort import register_cohort_commands
from .commands.ai_search_benchmark import register_ai_search_benchmark_commands
from .commands.official_brand_benchmark import register_official_brand_benchmark_commands

__version__ = "0.1.0"

load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


@click.group()
@click.version_option(version=__version__)
def cli() -> None:
    """BayState Runner CLI for local cohort testing."""
    pass


@cli.group()
def audit() -> None:
    """Run fleet-wide scraper audits."""
    pass


@cli.group()
def batch() -> None:
    """Test product batches locally."""
    pass


@cli.group()
def cohort() -> None:
    """Visualize and manage cohorts."""
    pass


@cli.group()
def benchmark() -> None:
    """Run benchmark tools."""
    pass


register_audit_commands(audit)
register_cohort_commands(cohort)
register_batch_commands(batch)
register_official_brand_benchmark_commands(benchmark)
register_ai_search_benchmark_commands(benchmark)


if __name__ == "__main__":
    cli()
