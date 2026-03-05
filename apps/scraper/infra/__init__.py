"""Compatibility package exposing scraper core as infra.

During the migration from `core` → `infra` this package provides a
transparent bridge so code can import `apps.scraper.infra` while the
implementation remains in `apps.scraper.core`. Once the repository is
fully migrated, the bridge can be removed and the files physically
moved under `infra`.
"""

from ..core import *  # re-export everything for compatibility

# If core defines __all__ this will be exported; otherwise keep empty list.
try:
    from ..core import __all__ as _core_all
except Exception:
    _core_all = []

__all__ = list(_core_all)
