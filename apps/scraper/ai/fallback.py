"""Proxy module for scrapers.ai_fallback -> apps.scraper.ai.fallback"""

from __future__ import annotations

from ..scrapers.ai_fallback import *  # noqa: F401,F403

__all__ = getattr(__import__("..scrapers.ai_fallback", fromlist=["*"]), "__all__", None) or [name for name in dir() if not name.startswith("_")]
