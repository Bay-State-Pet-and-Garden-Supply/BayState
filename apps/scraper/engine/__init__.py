"""Compatibility proxy package for crawl4ai engine.

This alias needs to work both when the scraper is imported as part of the
monorepo package graph and when tests execute from `apps/scraper` directly.
"""

from __future__ import annotations

import importlib

_CANDIDATE_MODULES = (
    "apps.scraper.src.crawl4ai_engine",
    "src.crawl4ai_engine",
)

_orig_pkg = None
for _candidate in _CANDIDATE_MODULES:
    try:
        _orig_pkg = importlib.import_module(_candidate)
        break
    except ModuleNotFoundError:
        continue

if _orig_pkg is None:
    raise ModuleNotFoundError(
        "Unable to resolve crawl4ai engine compatibility package from "
        f"{', '.join(_CANDIDATE_MODULES)}"
    )

# Copy selected attributes to this package namespace
for _k, _v in _orig_pkg.__dict__.items():
    if _k.startswith("__"):
        continue
    globals()[_k] = _v

# Ensure the package path points to the original package directory so
# submodule imports (e.g. apps.scraper.engine.metrics_endpoint) will be
# looked up in the original src/crawl4ai_engine folder.
try:
    __path__ = _orig_pkg.__path__  # type: ignore
except Exception:
    # Fallback: leave default path
    pass
