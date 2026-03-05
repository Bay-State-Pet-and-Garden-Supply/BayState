"""Proxy module for scrapers.ai_discovery_cli -> apps.scraper.ai.discovery_cli"""

from __future__ import annotations

from ..scrapers.ai_discovery_cli import *  # noqa: F401,F403

__all__ = getattr(__import__("..scrapers.ai_discovery_cli", fromlist=["*"]), "__all__", None) or [name for name in dir() if not name.startswith("_")]
