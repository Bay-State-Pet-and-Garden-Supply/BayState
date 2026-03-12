Archived 7 orphaned root-level test files from apps/scraper/ to
.sisyphus/archive/test-scripts/ on 2026-03-05.

Key observations:
- The files were one-off debugging scripts and not referenced by the test suite.
- Moving to .sisyphus/archive keeps history while removing clutter from project root.
- Running pytest afterwards revealed unrelated missing dev dependencies (e.g. memory_profiler)
  which prevent a clean test run in this environment. Deleting these files did not cause
  import errors or test-collection failures related to their removal.

Next steps (optional):
- If you want a fully green pytest run in CI/local, install dev/test dependencies from
  apps/scraper/requirements.txt or adjust the test environment.
