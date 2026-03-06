from __future__ import annotations

from __future__ import annotations

from scrapers.actions.base import BaseAction

# Keep importing handlers to ensure registration (backwards compatible)
from scrapers.actions.handlers import (
    anti_detection,
    browser,
    click,
    combine,
    conditional,
    extract,
    extract_transform,
    image,
    input,
    json,
    login,
    navigate,
    script,
    sponsored,
    table,
    transform,
    validation,
    verify,
    wait,
    wait_for,
    weight,
)

from scrapers.actions.registry import ActionRegistry

__all__ = ["ActionRegistry", "BaseAction"]
