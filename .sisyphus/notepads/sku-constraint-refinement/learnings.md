## 2026-03-05 - Task 5 Wave 2

- Discovery integration scripts under `BayStateScraper/scripts/` need an explicit project-root path insert (`sys.path` with `Path(__file__).resolve().parents[1]`) to import `scrapers.*` reliably when run as `python3 scripts/<file>.py`.
- Keeping the sample set at three synthetic SKUs (`TEST001`-`TEST003`) is sufficient for low-cost sanity checks while still producing measurable success-rate metrics and per-item diagnostics.
- Writing both absolute and percentage-point baseline deltas to JSON makes downstream CI/reporting comparisons straightforward.

## 2026-03-05 - Task F2 Manual QA

- `tests/test_ai_discovery_validation.py` currently passes all 11 tests in ~0.03s, so SKU fallback logic and query-variant behavior are covered by unit tests.
- `_build_query_variants("12345", None, None, None)` returns exactly `["12345 product"]`, and edge cases (`""`, SKU-only, SKU+short-name) behave deterministically.
