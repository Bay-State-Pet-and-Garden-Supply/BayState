#!/usr/bin/env python3
"""
Validate a scraper YAML config against the Pydantic ScraperConfig model.

Usage:
    python validate_config.py scrapers/configs/vendor.yaml
    python validate_config.py scrapers/configs/vendor.yaml --strict

Exit codes:
    0 = valid
    1 = validation error
    2 = file not found or import error
"""

import argparse
import os
import sys
from pathlib import Path


def validate_config(config_path: str, strict: bool = False) -> int:
    """Validate a YAML config file."""
    path = Path(config_path)
    if not path.exists():
        print(f"ERROR: File not found: {path}")
        return 2

    # BayState requires this env var to load local YAML files
    os.environ.setdefault("USE_YAML_CONFIGS", "true")

    # Import BayState scraper modules
    scraper_dir = Path(__file__).parent.parent.parent.parent / "apps" / "scraper"
    if scraper_dir.exists():
        sys.path.insert(0, str(scraper_dir))

    try:
        from scrapers.parser.yaml_parser import ScraperConfigParser
        from scrapers.models.config import ScraperConfig
    except ImportError as e:
        print(f"ERROR: Could not import BayState scraper modules: {e}")
        print("Make sure you're running from the repo root or apps/scraper directory.")
        return 2

    print(f"Validating: {path}")

    try:
        # load_from_file returns a ScraperConfig instance directly
        config = ScraperConfigParser.load_from_file(str(path))
        assert isinstance(config, ScraperConfig), "load_from_file did not return ScraperConfig"
    except Exception as e:
        print(f"VALIDATION FAILED: {e}")
        return 1

    print(f"✅ Config is valid: {config.name}")
    print(f"   Schema version: {config.schema_version}")
    print(f"   Selectors: {len(config.selectors)}")
    print(f"   Workflow steps: {len(config.workflows)}")
    print(f"   Test assertions: {len(config.test_assertions) if config.test_assertions else 0}")
    print(f"   Test SKUs: {len(config.test_skus) if config.test_skus else 0}")
    print(f"   Fake SKUs: {len(config.fake_skus) if config.fake_skus else 0}")

    warnings = []
    if not config.test_assertions:
        warnings.append("No test_assertions defined")
    if not config.test_skus:
        warnings.append("No test_skus defined")
    if not config.fake_skus:
        warnings.append("No fake_skus defined")
    if len(config.selectors) < 3:
        warnings.append(f"Only {len(config.selectors)} selectors defined (recommend >= 3)")
    if not config.validation or not config.validation.no_results_selectors:
        warnings.append("No no_results_selectors defined")

    if warnings:
        print("\n⚠️  Warnings:")
        for w in warnings:
            print(f"   - {w}")
        if strict:
            print("\nStrict mode: treating warnings as errors.")
            return 1

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate scraper YAML config")
    parser.add_argument("config", help="Path to YAML config file")
    parser.add_argument("--strict", action="store_true",
                        help="Treat missing test_assertions/test_skus/fake_skus as errors")
    args = parser.parse_args()

    return validate_config(args.config, args.strict)


if __name__ == "__main__":
    sys.exit(main())
