## 2026-02-19
- Existing `tests/test_action_registry.py` asserted an exact handler count (`22`), which became stale as additional handlers were added. Updated assertion to minimum/discovered-count based checks.
- `tests/test_no_selenium_in_core.py` scanned vendored/virtualenv site-packages and falsely flagged external `selenium` strings. Excluded `/venv/`, `/.venv/`, and `/site-packages/` from repository code scan.
