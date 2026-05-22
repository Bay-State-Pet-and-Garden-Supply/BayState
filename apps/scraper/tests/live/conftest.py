"""Shared fixtures for live tests.

These fixtures provide common utilities for tests that run against
real external services (product pages, search APIs, etc.).
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import pytest
from dotenv import load_dotenv

# Load environment variables from the scraper's .env file
SCRAPER_DIR = Path(__file__).parent.parent.parent
dotenv_path = SCRAPER_DIR / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)

logger = logging.getLogger("tests.live")

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
VARIANT_FIXTURE = FIXTURES_DIR / "variant_resolution_ground_truth.json"
SNAPSHOTS_DIR = FIXTURES_DIR / "crawl4ai" / "snapshots"


# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------

def _load_variant_ground_truth() -> list[dict[str, Any]]:
    """Load variant resolution ground truth entries from JSON fixture."""
    if not VARIANT_FIXTURE.exists():
        return []
    with open(VARIANT_FIXTURE, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="session")
def variant_ground_truth() -> list[dict[str, Any]]:
    """Full list of variant resolution ground truth entries."""
    data = _load_variant_ground_truth()
    if not data:
        pytest.skip(f"Fixture not found or empty: {VARIANT_FIXTURE}")
    return data


@pytest.fixture(scope="session")
def family_page_entries(variant_ground_truth: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Only entries that are expected to be family/variant pages."""
    entries = [
        e for e in variant_ground_truth
        if e.get("variant_resolution", {}).get("is_family_page")
    ]
    if not entries:
        pytest.skip("No family page entries in fixture")
    return entries


@pytest.fixture(scope="session")
def non_family_entries(variant_ground_truth: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Only entries that are NOT family pages (single product, no variants)."""
    return [
        e for e in variant_ground_truth
        if not e.get("variant_resolution", {}).get("is_family_page")
    ]


# ---------------------------------------------------------------------------
# Snapshot helpers
# ---------------------------------------------------------------------------

def save_html_snapshot(entry: dict[str, Any], html: str) -> Path:
    """Save fetched HTML to a snapshot file for offline debugging.

    Returns the path to the saved snapshot.
    """
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    upc= entry.get("upc", "unknown").replace("/", "_")
    domain = entry.get("expected_source_domain", "unknown")
    filename = f"{sku}_{domain}.html"
    path = SNAPSHOTS_DIR / filename
    path.write_text(html, encoding="utf-8")
    logger.info("Saved HTML snapshot: %s (%d bytes)", path, len(html))
    return path


def load_html_snapshot(entry: dict[str, Any]) -> str | None:
    """Load a previously saved HTML snapshot, if it exists."""
    upc= entry.get("upc", "unknown").replace("/", "_")
    domain = entry.get("expected_source_domain", "unknown")
    filename = f"{sku}_{domain}.html"
    path = SNAPSHOTS_DIR / filename
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


# ---------------------------------------------------------------------------
# Environment checks
# ---------------------------------------------------------------------------

def has_search_api_key() -> bool:
    """Check if a search API key is available."""
    return any(
        os.getenv(k)
        for k in ["SERPER_API_KEY", "GOOGLE_SEARCH_API_KEY", "SERP_API_KEY"]
    )


def has_local_llm() -> bool:
    """Check if a local LLM is configured via LLM_BASE_URL."""
    base_url = os.getenv("LLM_BASE_URL", "")
    return bool(base_url and ("localhost" in base_url or "127.0.0.1" in base_url))


def has_llm_api_key() -> bool:
    """Check if the required LLM_API_KEY is available."""
    return bool(os.getenv("LLM_API_KEY"))
