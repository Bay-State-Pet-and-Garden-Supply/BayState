# Package for moved AI scraper modules
from __future__ import annotations

# Expose modules for compatibility
from . import discovery, discovery_cli, cost_tracker, metrics, retry, fallback  # noqa: F401

__all__ = [
    "discovery",
    "discovery_cli",
    "cost_tracker",
    "metrics",
    "retry",
    "fallback",
]
