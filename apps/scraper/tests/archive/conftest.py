"""Keep archived AI Search v1 tests out of pytest collection.

The files in this directory are historical references only. Several import
deleted v1 modules, so direct `pytest tests/archive` collection must also skip
them rather than reactivating obsolete test targets.
"""

from __future__ import annotations

collect_ignore_glob = ["test_*.py"]
