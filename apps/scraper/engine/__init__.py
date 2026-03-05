"""Compatibility proxy package for crawl4ai engine.

This module provides a lightweight proxy so code can import
`apps.scraper.engine` while the original implementation remains
under `apps.scraper.src.crawl4ai_engine` during this migration.

It copies the original package's __path__ and public attributes so
submodule imports like `apps.scraper.engine.metrics_endpoint` resolve
to the existing files under src/crawl4ai_engine.
"""

from __future__ import annotations

import importlib
import sys
from types import ModuleType

ORIG = "apps.scraper.src.crawl4ai_engine"

_orig_pkg = importlib.import_module(ORIG)

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

# Also ensure sys.modules maps this package name to the original module
# so other importers see a consistent module object.
sys.modules.setdefault(__name__, sys.modules.get(ORIG, _orig_pkg))
