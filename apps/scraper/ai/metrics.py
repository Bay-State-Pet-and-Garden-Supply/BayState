"""Proxy module for scrapers.ai_metrics -> apps.scraper.ai.metrics"""

from __future__ import annotations

from ..scrapers.ai_metrics import *  # noqa: F401,F403

__all__ = getattr(__import__("..scrapers.ai_metrics", fromlist=["*"]), "__all__", None) or [name for name in dir() if not name.startswith("_")]
