"""Runtime feature-flag configuration for the scraper.

This module exposes small helpers for runtime feature flags controlled via
environment variables. New flags should be added here so the rest of the
backend can check behavior in a single place.

Current flags:
- USE_YAML_CONFIGS: when truthy, allow loading local YAML scraper configs.
  Default: false (API-published configs remain the default runtime mode).
"""

from __future__ import annotations

import os
from typing import Final

_ENV_KEY_USE_YAML: Final[str] = "USE_YAML_CONFIGS"


def use_yaml_configs() -> bool:
    """Return True when local YAML configs are enabled via env var.

    Accepts common truthy values: 1, true, yes, on (case-insensitive).
    Defaults to False to preserve current API-first behavior.
    """
    val = os.environ.get(_ENV_KEY_USE_YAML, "false")
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "on")
    return bool(val)


def ensure_yaml_enabled() -> None:
    """Raise RuntimeError if YAML configs are disabled.

    Callers should use this to short-circuit YAML-loading code paths when
    the flag is explicitly disabled so the runtime keeps the API-first
    behavior by default.
    """
    if not use_yaml_configs():
        raise RuntimeError("Local YAML configs are disabled by environment flag USE_YAML_CONFIGS. Set USE_YAML_CONFIGS=true to enable loading YAML configs.")
