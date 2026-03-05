from __future__ import annotations

import argparse
import logging

# os not needed; avoid unused import warnings
import sys
from pathlib import Path

# Setup path
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Fix Windows encoding issues by forcing UTF-8 for stdout/stderr
if sys.platform == "win32":
    import io

    # Detach and wrap stdout/stderr with UTF-8 encoding
    # 'errors="replace"' ensures that if encoding fails, it doesn't crash the script
    if hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "buffer"):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Setup logging to stream to stdout so parent process can capture it
from apps.scraper.utils.logger import setup_logging

setup_logging(debug_mode=False, json_output=True)
logger = logging.getLogger(__name__)

from apps.scraper.runner import run_job

# Keep a local reference to avoid unused-import linter warnings. The CLI
# script provides a compatibility shim and doesn't call run_job directly.
_runner_ref = run_job


# Compatibility wrapper: original script called `run_scraping(...)` from
# `scrapers.runtime`. New runner exposes `run_job`. Provide a thin shim with
# the original signature so the CLI remains compatible. The actual runner
# implementation expects a JobConfig object; this shim is a compatibility
# placeholder. When invoked in normal operation, a proper JobConfig should be
# constructed or the caller should use the runner package directly.
def run_scraping(skus: list[str] | None = None, selected_sites: list[str] | None = None, test_mode: bool = False, max_workers: int = 3):
    """Compatibility shim for the old run_scraping(...) API.

    Note: This is a thin placeholder to preserve the CLI signature. The
    daemon/runner flow should use runner.run_job with a JobConfig object.
    """
    # Mark parameters as used to satisfy static checkers, then raise an
    # explicit error to guide callers to the new runner API.
    _ = (skus, selected_sites, test_mode, max_workers)
    raise RuntimeError("run_scraping compatibility shim called. Use runner.run_job with a JobConfig.")


def main():
    parser = argparse.ArgumentParser(description="Run Scraper Job")
    parser.add_argument("--skus", nargs="*", help="List of SKUs to scrape")
    parser.add_argument("--scrapers", nargs="*", help="List of scraper names to run")
    parser.add_argument("--test-mode", action="store_true", help="Run in test mode")
    parser.add_argument("--max-workers", type=int, default=3, help="Max workers")

    args = parser.parse_args()

    logger.info(f"Starting job with SKUs: {args.skus}, Scrapers: {args.scrapers}, Test Mode: {args.test_mode}")

    try:
        run_scraping(
            skus=args.skus,
            selected_sites=args.scrapers,
            test_mode=args.test_mode,
            max_workers=args.max_workers,
        )
        logger.info("Configuration completed successfully")
    except Exception as e:
        logger.error(f"Job failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
