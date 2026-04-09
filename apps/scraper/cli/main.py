"""BayState Runner CLI - Local cohort testing tool.

Usage:
    bsr [OPTIONS] COMMAND [ARGS]...

Options:
    --version  Show version information
    --help     Show this message and exit

Commands:
    batch     Test product batches locally.
    cohort    Visualize and manage cohorts.
    benchmark Benchmark extraction strategies.
"""

from __future__ import annotations

import click

from .commands.batch import register_batch_commands
from .commands.benchmark import register_benchmark_commands
from .commands.cohort import register_cohort_commands

__version__ = "0.1.0"


@click.group()
@click.version_option(version=__version__)
def cli() -> None:
    """BayState Runner CLI for local cohort testing."""
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
    """Benchmark extraction strategies."""
    pass


register_cohort_commands(cohort)
register_batch_commands(batch)
register_benchmark_commands(benchmark)


if __name__ == "__main__":
    cli()
