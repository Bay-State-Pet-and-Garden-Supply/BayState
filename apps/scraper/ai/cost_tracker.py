"""Proxy module for scrapers.ai_cost_tracker -> apps.scraper.ai.cost_tracker"""

from __future__ import annotations

from ..scrapers.ai_cost_tracker import *  # noqa: F401,F403

__all__ = getattr(__import__("..scrapers.ai_cost_tracker", fromlist=["*"]), "__all__", None) or [name for name in dir() if not name.startswith("_")]
