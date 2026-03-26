# Scraper Codebase Maintenance Plan

## Objective
Conduct maintenance on the `apps/scraper` codebase to remove excess testing files, unused code, build artifacts, and deprecated documentation, while optimizing the root `.gitignore` to prevent future clutter.

## Scope & Impact
This cleanup will reduce repository size, remove confusion from deprecated or ad-hoc files, and enforce a cleaner working directory through better git ignores. It affects only the `apps/scraper` directory and the root `.gitignore`.

## Proposed Solution

### 1. Optimize `.gitignore`
Update the root `.gitignore` to ignore common development and testing artifacts that were previously tracked or accumulating:
- HTML dumps (e.g., `*_dump.html`)
- Linting and testing results (e.g., `*-results.txt`, `ruff-results.json`)
- Local `.data` and `dummy` directories
- Sisyphus state files outside the root `.sisyphus` directory
- Chat session transcripts (e.g., `session-*.md`)

### 2. Remove Tracked Artifacts and Ad-Hoc Scripts
Remove the following files from git tracking and the file system:
- **Build/Lint Artifacts**: `apps/scraper/mypy-results.txt`, `apps/scraper/pytest-results.txt`, `apps/scraper/ruff-results.json`
- **Debug Dumps**: `apps/scraper/amazon_dump.html`, `apps/scraper/debug_dump.html`
- **Stray Files**: `apps/scraper/EOF`, `apps/scraper/.sisyphusevidencet7-proxy-test-results.txt`, `apps/scraper/session-ses_483e.md`
- **Ad-hoc / Inspection Scripts**: `apps/scraper/inspect_crawl4ai.py`, `apps/scraper/verify_e2e.py`, `apps/scraper/test_credential_loading.py`

### 3. Remove Misplaced Sisyphus Directory
Remove `apps/scraper/.sisyphus/` entirely, as Sisyphus operations should be centralized in the root `.sisyphus/` directory.

### 4. Remove `dummy` Directory
Remove `apps/scraper/dummy/` which contains an empty crawl4ai cache (`robots_cache.db`).

### 5. Remove Stale Test Results
Remove the JSON test output files in `apps/scraper/tests/results/` (`results_baseline.json`, `results_v2.json`, `results_v3.json`, `results_v4.json`, `results_v5.json`). These are static snapshots of past evaluations and clutter the repository.

### 6. Remove Abandoned POCs
Remove `apps/scraper/tests/poc/scrapegraph/` as it was a POC (Proof of Concept) whose decision was left pending/abandoned in favor of the current crawl4ai architecture.

### 7. Remove Deprecated Documentation
Remove `apps/scraper/docs/ai-scraper.md` which is explicitly marked as DEPRECATED.

## Implementation Steps
1. Apply additions to the root `.gitignore`.
2. Execute `git rm` commands for all the targeted files and directories.
3. Review `git status` to ensure only the intended files are staged for removal.

## Verification
- Run `git status` and `git diff --staged` to verify the cleanup.
- Ensure the scraper test suite still runs cleanly without the removed ad-hoc files.