"""Proxy module for scrapers.ai_discovery -> apps.scraper.ai.discovery"""

from __future__ import annotations

from ..scrapers.ai_discovery import *  # noqa: F401,F403

__all__ = getattr(__import__("..scrapers.ai_discovery", fromlist=["*"]), "__all__", None) or [name for name in dir() if not name.startswith("_")]
