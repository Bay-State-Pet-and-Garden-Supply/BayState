"""Proxy module for scrapers.ai_retry -> apps.scraper.ai.retry"""

from __future__ import annotations

from ..scrapers.ai_retry import *  # noqa: F401,F403

__all__ = getattr(__import__("..scrapers.ai_retry", fromlist=["*"]), "__all__", None) or [name for name in dir() if not name.startswith("_")]
