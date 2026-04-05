"""Configuration validation module for the scraper.

This module provides utilities to validate the scraper's configuration
by checking required environment variables and their formats.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ValidationReport:
    """Report object containing validation results."""

    is_valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert report to dictionary."""
        return {
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def validate_config() -> ValidationReport:
    """Validate all required configuration environment variables.

    Checks:
    - OPENAI_API_KEY: exists, not empty, starts with "sk-"
    - AI_SEARCH_PROVIDER: optional, one of auto/serpapi/gemini
    - SERPAPI_API_KEY: required only when provider is serpapi
    - BRAVE_API_KEY: deprecated and ignored
    - SCRAPER_API_URL: exists, valid URL format
    - SCRAPER_API_KEY: exists, not empty

    Returns:
        ValidationReport with validation results
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Validate OPENAI_API_KEY
    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        errors.append("OPENAI_API_KEY is not set")
    elif not openai_key.strip():
        errors.append("OPENAI_API_KEY is empty")
    elif not openai_key.startswith("sk-"):
        errors.append("OPENAI_API_KEY must start with 'sk-'")
    else:
        # Check for minimum length (OpenAI keys are typically 40+ chars)
        if len(openai_key) < 40:
            warnings.append("OPENAI_API_KEY may be truncated or invalid")

    # Validate search provider credentials
    provider = str(os.environ.get("AI_SEARCH_PROVIDER") or "auto").strip().lower() or "auto"
    if provider not in {"auto", "serpapi", "gemini"}:
        errors.append("AI_SEARCH_PROVIDER must be one of: auto, serpapi, gemini")
        provider = "auto"

    serpapi_key = os.environ.get("SERPAPI_API_KEY")
    brave_key = os.environ.get("BRAVE_API_KEY")
    serpapi_present = bool(serpapi_key and serpapi_key.strip())
    brave_present = bool(brave_key and brave_key.strip())

    if serpapi_present and len(str(serpapi_key).strip()) < 20:
        warnings.append("SERPAPI_API_KEY may be truncated or invalid")

    if brave_present:
        warnings.append("BRAVE_API_KEY is deprecated and ignored")

    if provider == "serpapi":
        if not serpapi_present:
            errors.append("SERPAPI_API_KEY is not set")

    # Validate SCRAPER_API_URL
    scraper_url = os.environ.get("SCRAPER_API_URL")
    if not scraper_url:
        errors.append("SCRAPER_API_URL is not set")
    elif not scraper_url.strip():
        errors.append("SCRAPER_API_URL is empty")
    else:
        # Validate URL format
        url_pattern = re.compile(
            r"^https?://"  # http:// or https://
            r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"  # domain
            r"localhost|"  # localhost
            r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"  # or IP
            r"(?::\d+)?",  # optional port
            re.IGNORECASE,
        )
        if not url_pattern.match(scraper_url):
            errors.append("SCRAPER_API_URL is not a valid URL format")

    # Validate SCRAPER_API_KEY
    scraper_key = os.environ.get("SCRAPER_API_KEY")
    if not scraper_key:
        errors.append("SCRAPER_API_KEY is not set")
    elif not scraper_key.strip():
        errors.append("SCRAPER_API_KEY is empty")
    else:
        # Check for minimum length
        if len(scraper_key) < 20:
            warnings.append("SCRAPER_API_KEY may be truncated or invalid")

    # Check for optional but recommended variables
    if not os.environ.get("RUNNER_NAME"):
        warnings.append("RUNNER_NAME is not set (optional)")

    is_valid = len(errors) == 0

    return ValidationReport(is_valid=is_valid, errors=errors, warnings=warnings)


def print_validation_report(report: ValidationReport | None = None) -> None:
    """Print validation report to console.

    Args:
        report: ValidationReport to print. If None, runs validate_config() first.
    """
    if report is None:
        report = validate_config()

    print("\n" + "=" * 50)
    print("SCRAPER CONFIGURATION VALIDATION REPORT")
    print("=" * 50)

    if report.is_valid:
        print("\n✓ Configuration is VALID")
    else:
        print("\n✗ Configuration is INVALID")

    if report.errors:
        print("\nERRORS:")
        for error in report.errors:
            print(f"  • {error}")

    if report.warnings:
        print("\nWARNINGS:")
        for warning in report.warnings:
            print(f"  ⚠ {warning}")

    if not report.errors and not report.warnings:
        print("\n(No issues found)")

    print("\n" + "=" * 50 + "\n")


if __name__ == "__main__":
    # Allow running directly for testing
    print_validation_report()
