# Work Plan: Scraper Architecture Cleanup

## TL;DR

> **Objective:** Consolidate 100+ scattered Python files into a clean, maintainable architecture
> 
> **Key Deliverables:**
> - Remove duplicate crawl4ai engine (scraper_backend/)
> - Consolidate 6 entry points into 3
> - Restructure directories by concern (engine/, actions/, ai/, infra/)
> - Eliminate dead code (archives, orphaned tests)
> - Break up oversized files (>500 lines)
> 
> **Estimated Effort:** Large (3-4 days)
> **Parallel Execution:** YES - Investigation → Cleanup → Consolidation → Restructure
> **Critical Path:** T1-T4 → T5 → T6-T9 → T10-T14 → F1-F4

---

## Context

### Current State
- **100+ Python files** scattered across overlapping directories
- **2 complete crawl4ai engines** (src/ and scraper_backend/)
- **6 entry points** with unclear responsibilities
- **Multiple archive/ directories** with dead AI handler code
- **Mixed architectural patterns** from different development eras

### Documented in
- `.sisyphus/drafts/scraper-architecture-analysis.md` (full analysis)

### Open Questions (to be resolved in Phase 1)
1. Is scraper_backend/ actually used anywhere?
2. Which event system is canonical (scrapers/events/ vs core/events.py)?
3. What's the relationship between scrapers/runtime.py and runner/__init__.py?
4. Which root-level test_*.py files are one-off vs maintained?

---

## Work Objectives

### Core Objective
Transform the scraper from an architectural mess into a clean, well-organized codebase with clear module boundaries and single sources of truth.

### Concrete Deliverables
1. **Single crawl4ai engine** (remove scraper_backend/ duplicate)
2. **3 consolidated entry points** (daemon, cli, job-runner)
3. **Restructured directory tree** organized by concern
4. **Zero archive/ directories** (dead code removed)
5. **No files >500 lines** (break up oversized modules)
6. **All tests in tests/** (no tests/ inside modules)

### Definition of Done
- All imports resolve correctly
- pytest passes (CI=true npm test equivalent)
- docker build succeeds
- daemon.py runs without errors
- No remaining duplicate implementations

### Must Have
- [ ] Investigation complete (all uncertainties resolved)
- [ ] Dead code identified and catalogued
- [ ] scraper_backend/ removed or confirmed unused
- [ ] Entry points consolidated
- [ ] Directory restructure complete
- [ ] All tests pass

### Must NOT Have (Guardrails)
- [ ] NO changes to actual scraping logic (only organization)
- [ ] NO deletion of active production code
- [ ] NO breaking changes to external APIs
- [ ] NO modifications to core algorithm behavior

---

## Verification Strategy

### Test Decision
- **Infrastructure exists:** YES (pytest configured)
- **Automated tests:** YES (tests-after each phase)
- **Framework:** pytest
- **Coverage:** Focus on import resolution and smoke tests

### QA Policy
Every task includes agent-executed QA scenarios using bash commands:
- Import resolution: `python -c "import module"`
- Smoke tests: `python -m pytest tests/ -v --tb=short`
- Docker build: `docker build -t baystate-scraper .`
- Entry point verification: `python daemon.py --help`

---

## Execution Strategy

### Wave 1: Investigation & Discovery (Start Immediately - Foundation)
```
Wave 1 (Parallel - All Independent):
├── T1: Investigate scraper_backend/ usage [quick]
├── T2: Map event system dependencies [quick]
├── T3: Compare runtime.py vs runner/__init__.py [quick]
├── T4: Catalog root-level test files [quick]
└── T5: Create dead code registry [quick]

No dependencies - all can run in parallel
```

### Wave 2: Safe Dead Code Removal (After Wave 1)
```
Wave 2 (Parallel - depends on Wave 1):
├── T6: Remove scraper_backend/ (if confirmed unused) [quick]
├── T7: Remove archive/ directories [quick]
├── T8: Remove orphaned root test files [quick]
├── T9: Clean up transpiler.py vs transpiler/ confusion [unspecified-high]
└── T10: Consolidate duplicate imports [quick]

All depend on: T1, T2, T3, T4, T5
```

### Wave 3: Entry Point Consolidation (After Wave 2)
```
Wave 3 (Sequential - Core restructuring):
├── T11: Consolidate runner.py and run_job.py into runner/ [unspecified-high]
├── T12: Merge scrapers/runtime.py with runner/__init__.py [deep]
└── T13: Standardize CLI entry points [quick]

Depends on: Wave 2 complete
```

### Wave 4: Directory Restructure (After Wave 3)
```
Wave 4 (Parallel - Major reorganization):
├── T14: Create engine/ and move src/crawl4ai_engine/ [quick]
├── T15: Create actions/ and move scrapers/actions/ [quick]
├── T16: Create ai/ and consolidate AI modules [unspecified-high]
├── T17: Create infra/ and move core/ services [unspecified-high]
└── T18: Reorganize models/ and validation/ [quick]

Depends on: Wave 3 complete
```

### Wave 5: Final Cleanup (After Wave 4)
```
Wave 5 (Sequential - Polish):
├── T19: Break up oversized files [artistry]
├── T20: Move all tests to root tests/ [quick]
└── T21: Update all imports to new structure [unspecified-high]

Depends on: Wave 4 complete
```

### Wave FINAL: Verification (After ALL)
```
Wave FINAL (Parallel - Independent reviews):
├── F1: Import resolution audit (oracle)
├── F2: pytest verification (unspecified-high)
├── F3: Docker build test (unspecified-high)
└── F4: Architecture compliance check (deep)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1-T5 | — | Wave 2 |
| T6-T10 | Wave 1 | Wave 3 |
| T11-T13 | Wave 2 | Wave 4 |
| T14-T18 | Wave 3 | Wave 5 |
| T19-T21 | Wave 4 | F1-F4 |
| F1-F4 | Wave 5 | — |

---

## TODOs

### Phase 1: Investigation (Foundation)

- [ ] **T1: Investigate scraper_backend/ Usage**

  **What to do:**
  - Search entire codebase for any imports from scraper_backend/
  - Check if any tests exercise scraper_backend/ code
  - Verify daemon.py and other entry points only use src/
  - Check Docker build process for scraper_backend/ references
  
  **Must NOT do:**
  - Do NOT delete anything yet
  - Do NOT modify any files
  - Do NOT assume based on AGENTS.md documentation
  
  **Recommended Agent Profile:**
  - **Category:** `quick` (investigation only)
  - **Skills:** `grep` for thorough search
  
  **Parallelization:**
  - **Can Run In Parallel:** YES (with T2-T5)
  - **Blocked By:** None
  
  **Acceptance Criteria:**
  - [ ] Complete list of all imports referencing scraper_backend/
  - [ ] Confirmation of which entry points (if any) use it
  - [ ] Decision: SAFE TO DELETE or MUST KEEP
  
  **QA Scenarios:**
  ```
  Scenario: Verify no active imports from scraper_backend
    Tool: Bash (grep)
    Steps:
      1. grep -r "from scraper_backend" apps/scraper --include="*.py"
      2. grep -r "import scraper_backend" apps/scraper --include="*.py"
      3. Check Dockerfiles for scraper_backend/ references
    Expected Result: Zero matches (or documented list if found)
    Evidence: .sisyphus/evidence/t1-scraper-backend-usage.txt
  ```
  
  **Commit:** NO (investigation only)

- [ ] **T2: Map Event System Dependencies**

  **What to do:**
  - Identify all imports from scrapers/events/ vs core/events.py
  - Map which modules use which event system
  - Determine if they're duplicates or complementary
  - Identify the canonical event system
  
  **Must NOT do:**
  - Do NOT delete either yet
  - Do NOT assume one is dead
  
  **Recommended Agent Profile:**
  - **Category:** `quick` (investigation)
  - **Skills:** `grep`, `lsp_find_references`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES (with T1, T3-T5)
  
  **Acceptance Criteria:**
  - [ ] List of all files importing from scrapers/events/
  - [ ] List of all files importing from core/events.py
  - [ ] Determination: which is canonical or if both serve different purposes
  
  **QA Scenarios:**
  ```
  Scenario: Map event system usage
    Tool: Bash (grep)
    Steps:
      1. grep -r "from scrapers.events" apps/scraper --include="*.py" | wc -l
      2. grep -r "from core.events" apps/scraper --include="*.py" | wc -l
      3. grep -r "from core import events" apps/scraper --include="*.py" | wc -l
    Expected Result: Usage counts for both systems
    Evidence: .sisyphus/evidence/t2-event-system-usage.txt
  ```
  
  **Commit:** NO (investigation only)

- [ ] **T3: Compare runtime.py vs runner/__init__.py**

  **What to do:**
  - Read both files completely
  - Document overlapping functionality
  - Identify which one is actually used by daemon.py
  - Determine consolidation strategy
  
  **Must NOT do:**
  - Do NOT merge yet
  - Do NOT delete either
  
  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` (code analysis)
  
  **Parallelization:**
  - **Can Run In Parallel:** YES (with T1-T2, T4-T5)
  
  **Acceptance Criteria:**
  - [ ] Functionality comparison table
  - [ ] Which entry points use which file
  - [ ] Consolidation recommendation
  
  **QA Scenarios:**
  ```
  Scenario: Identify which file is used
    Tool: Bash (grep)
    Steps:
      1. grep -r "from scrapers.runtime" apps/scraper --include="*.py"
      2. grep -r "from runner" apps/scraper/daemon.py
      3. Check imports in run_job.py
    Expected Result: Clear picture of usage patterns
    Evidence: .sisyphus/evidence/t3-runtime-vs-runner.md
  ```
  
  **Commit:** NO (investigation only)

- [ ] **T4: Catalog Root-Level Test Files**

  **What to do:**
  - List all test_*.py files at apps/scraper/ root
  - Check which are imported/referenced
  - Determine which are one-off debugging scripts vs maintained tests
  - Check git history for recency of modifications
  
  **Files to investigate:**
  - test_setup.py
  - test_supabase_connection.py
  - test_supabase_writes.py
  - test_fix_extraction.py
  - test_cost_validation.py
  - test_browser_use_fix.py
  - tmp_metrics_test.py
  
  **Recommended Agent Profile:**
  - **Category:** `quick` (investigation)
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] List of all root-level test files
  - [ ] Classification: ONE-OFF vs MAINTAINED
  - [ ] Deletion candidates identified
  
  **QA Scenarios:**
  ```
  Scenario: Check file usage
    Tool: Bash
    Steps:
      1. ls -la apps/scraper/test_*.py apps/scraper/tmp_*.py
      2. grep -r "test_setup\|test_supabase" apps/scraper --include="*.py" | head -20
      3. git log --oneline -5 apps/scraper/test_*.py
    Expected Result: Usage patterns and modification dates
    Evidence: .sisyphus/evidence/t4-test-files-catalog.md
  ```
  
  **Commit:** NO (investigation only)

- [ ] **T5: Create Dead Code Registry**

  **What to do:**
  - Compile findings from T1-T4
  - Create comprehensive list of deletable code
  - Prioritize by safety (obviously dead → needs verification)
  - Document any risks
  
  **Recommended Agent Profile:**
  - **Category:** `writing` (documentation)
  
  **Parallelization:**
  - **Depends On:** T1, T2, T3, T4
  
  **Acceptance Criteria:**
  - [ ] Document: `.sisyphus/plans/scraper-cleanup/dead-code-registry.md`
  - [ ] Categorized list: SAFE / NEEDS_VERIFICATION / KEEP
  - [ ] Risk assessment for each item
  
  **QA Scenarios:**
  ```
  Scenario: Registry completeness
    Tool: Manual review
    Steps:
      1. Verify all archive/ directories listed
      2. Verify all duplicate engines listed
      3. Verify all orphaned test files listed
    Expected Result: Comprehensive registry document
    Evidence: .sisyphus/plans/scraper-cleanup/dead-code-registry.md
  ```
  
  **Commit:** NO (documentation only)

---

### Phase 2: Safe Dead Code Removal

- [ ] **T6: Remove scraper_backend/ Directory**

  **What to do:**
  - Delete entire apps/scraper/scraper_backend/ directory
  - Only proceed if T1 confirmed it's unused
  - Update any documentation references
  
  **Must NOT do:**
  - Do NOT proceed if T1 found any active imports
  - Do NOT delete if uncertainty remains
  
  **Recommended Agent Profile:**
  - **Category:** `quick` (file operations)
  
  **Parallelization:**
  - **Can Run In Parallel:** YES (with T7-T10)
  - **Depends On:** T1, T5
  
  **Acceptance Criteria:**
  - [ ] Directory apps/scraper/scraper_backend/ no longer exists
  - [ ] No import errors in remaining code
  - [ ] pytest still passes
  
  **QA Scenarios:**
  ```
  Scenario: Verify clean removal
    Tool: Bash
    Steps:
      1. rm -rf apps/scraper/scraper_backend/
      2. python -c "import sys; sys.path.insert(0, 'apps/scraper'); from runner import run_job" 2>&1
      3. python -c "import sys; sys.path.insert(0, 'apps/scraper'); from daemon import main" 2>&1
    Expected Result: No ImportError for scraper_backend modules
    Evidence: .sisyphus/evidence/t6-backend-removal.log
  ```
  
  **Commit:** YES
  - Message: `refactor(scraper): remove unused scraper_backend directory`
  - Files: `apps/scraper/scraper_backend/` (deleted)

- [ ] **T7: Remove archive/ Directories**

  **What to do:**
  - Delete apps/scraper/scraper_backend/archive/ (if T6 didn't remove it)
  - Delete apps/scraper/scrapers/actions/archive/
  - Any other archive/ directories found
  
  **Recommended Agent Profile:**
  - **Category:** `quick`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  - **Depends On:** T5 (dead code registry)
  
  **Acceptance Criteria:**
  - [ ] All archive/ directories removed
  - [ ] ~8 dead AI handler files deleted
  
  **QA Scenarios:**
  ```
  Scenario: Verify archive removal
    Tool: Bash
    Steps:
      1. find apps/scraper -type d -name "archive" 2>/dev/null
      2. Verify no archive directories remain
    Expected Result: Empty list (no archive directories)
    Evidence: .sisyphus/evidence/t7-archive-removal.log
  ```
  
  **Commit:** YES (can group with T6)

- [ ] **T8: Remove Orphaned Root Test Files**

  **What to do:**
  - Delete files classified as ONE-OFF in T4
  - Keep any files marked as MAINTAINED
  - Move valuable one-off scripts to tools/ if they might be reused
  
  **Candidates (from T4 analysis):**
  - tmp_metrics_test.py
  - test_setup.py (likely one-off)
  - test_supabase_connection.py (likely one-off)
  - test_supabase_writes.py (likely one-off)
  
  **Recommended Agent Profile:**
  - **Category:** `quick`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  - **Depends On:** T4, T5
  
  **Acceptance Criteria:**
  - [ ] Identified one-off test files deleted
  - [ ] No pytest errors
  
  **QA Scenarios:**
  ```
  Scenario: Verify test cleanup
    Tool: Bash
    Steps:
      1. List deleted files
      2. cd apps/scraper && python -m pytest tests/ -v --tb=short 2>&1 | head -50
    Expected Result: pytest runs without errors from missing files
    Evidence: .sisyphus/evidence/t8-test-cleanup.log
  ```
  
  **Commit:** YES

- [ ] **T9: Clean Up Transpiler Confusion**

  **What to do:**
  - Investigate relationship between:
    - apps/scraper/transpiler.py (root level)
    - apps/scraper/transpiler/ (directory)
    - apps/scraper/src/crawl4ai_engine/transpiler/
  - Consolidate or delete redundant implementations
  
  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` (requires code analysis)
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] Single transpiler implementation
  - [ ] Redundant versions removed
  
  **QA Scenarios:**
  ```
  Scenario: Test transpiler functionality
    Tool: Bash
    Steps:
      1. python -c "from transpiler import YAMLToCrawl4AI; t = YAMLToCrawl4AI(); print('OK')"
      2. Verify no duplicate module errors
    Expected Result: Transpiler imports cleanly
    Evidence: .sisyphus/evidence/t9-transpiler-cleanup.log
  ```
  
  **Commit:** YES

- [ ] **T10: Consolidate Duplicate Imports**

  **What to do:**
  - Find and fix any circular or duplicate imports
  - Standardize import patterns (from X import Y vs import X.Y)
  - Clean up any import * usage
  
  **Recommended Agent Profile:**
  - **Category:** `quick`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] No obvious duplicate imports
  - [ ] Consistent import style
  
  **QA Scenarios:**
  ```
  Scenario: Import smoke test
    Tool: Bash
    Steps:
      1. cd apps/scraper && python -c "import daemon; import runner; import scrapers.runtime"
    Expected Result: All main modules import without errors
    Evidence: .sisyphus/evidence/t10-import-cleanup.log
  ```
  
  **Commit:** YES (can group with other cleanup)

---

### Phase 3: Entry Point Consolidation

- [ ] **T11: Consolidate runner.py and run_job.py**

  **What to do:**
  - runner.py is only 5 lines - integrate into runner/__main__.py
  - run_job.py functionality should move into runner/
  - Create clear separation: daemon for production, runner for job execution
  
  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` (structural changes)
  
  **Parallelization:**
  - **Can Run In Parallel:** NO (sequential with T12-T13)
  - **Depends On:** Wave 2
  
  **Acceptance Criteria:**
  - [ ] runner.py deleted or properly integrated
  - [ ] run_job.py moved to runner/job_runner.py
  - [ ] All entry points still work
  
  **QA Scenarios:**
  ```
  Scenario: Entry point functionality preserved
    Tool: Bash
    Steps:
      1. python apps/scraper/runner.py --help 2>&1 | head -5
      2. python apps/scraper/daemon.py --help 2>&1 | head -5
      3. python apps/scraper/run_job.py --help 2>&1 | head -5
    Expected Result: All entry points respond with help text
    Evidence: .sisyphus/evidence/t11-entry-points.log
  ```
  
  **Commit:** YES

- [ ] **T12: Merge scrapers/runtime.py with runner/__init__.py**

  **What to do:**
  - These appear to duplicate job execution logic
  - Determine which is authoritative
  - Merge functionality, keeping best parts of each
  - Break up the 1197-line runtime.py into smaller modules
  
  **Must NOT do:**
  - Do NOT lose functionality
  - Do NOT create breaking changes to run_job() signature
  
  **Recommended Agent Profile:**
  - **Category:** `deep` (complex refactoring)
  
  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on T11)
  
  **Acceptance Criteria:**
  - [ ] Single source of truth for job execution
  - [ ] runtime.py deleted or significantly reduced
  - [ ] runner/__init__.py contains clean run_job() function
  
  **QA Scenarios:**
  ```
  Scenario: Job execution works after merge
    Tool: Bash (smoke test)
    Steps:
      1. cd apps/scraper && python -c "from runner import run_job; print('run_job import OK')"
      2. Verify no runtime.py imports broken
    Expected Result: Job execution logic intact
    Evidence: .sisyphus/evidence/t12-runtime-merge.log
  ```
  
  **Commit:** YES (major change - own commit)

- [ ] **T13: Standardize CLI Entry Points**

  **What to do:**
  - Ensure consistent CLI interface across all entry points
  - Use Click or argparse consistently
  - Document CLI commands
  
  **Recommended Agent Profile:**
  - **Category:** `quick`
  
  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on T11-T12)
  
  **Acceptance Criteria:**
  - [ ] Consistent CLI patterns
  - [ ] All --help options work
  - [ ] No argparse/click mixing in same interface
  
  **QA Scenarios:**
  ```
  Scenario: CLI consistency check
    Tool: Bash
    Steps:
      1. Check each entry point has --help
      2. Verify consistent argument naming
    Expected Result: Clean, consistent CLI
    Evidence: .sisyphus/evidence/t13-cli-standardize.log
  ```
  
  **Commit:** YES (group with T11-T12)

---

### Phase 4: Directory Restructure

- [ ] **T14: Create engine/ Directory**

  **What to do:**
  - Create apps/scraper/engine/
  - Move apps/scraper/src/crawl4ai_engine/ to apps/scraper/engine/
  - Update all imports
  
  **Why:** src/ is not a standard Python package name
  
  **Recommended Agent Profile:**
  - **Category:** `quick` (mostly file moves)
  
  **Parallelization:**
  - **Can Run In Parallel:** YES (with T15-T18)
  - **Depends On:** Wave 3
  
  **Acceptance Criteria:**
  - [ ] engine/ directory exists with crawl4ai code
  - [ ] All imports updated
  - [ ] No references to src.crawl4ai_engine remain
  
  **QA Scenarios:**
  ```
  Scenario: Engine import test
    Tool: Bash
    Steps:
      1. cd apps/scraper && python -c "from engine import crawl4ai_engine; print('OK')"
      2. grep -r "from src\." apps/scraper --include="*.py" | wc -l
    Expected Result: Zero old import references
    Evidence: .sisyphus/evidence/t14-engine-restructure.log
  ```
  
  **Commit:** YES

- [ ] **T15: Create actions/ Directory**

  **What to do:**
  - Move apps/scraper/scrapers/actions/ to apps/scraper/actions/
  - Update imports
  
  **Recommended Agent Profile:**
  - **Category:** `quick`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] actions/ at root level
  - [ ] All imports updated
  
  **QA Scenarios:**
  ```
  Scenario: Actions import test
    Tool: Bash
    Steps:
      1. python -c "from actions.registry import ActionRegistry; print('OK')"
    Expected Result: Actions import cleanly
    Evidence: .sisyphus/evidence/t15-actions-restructure.log
  ```
  
  **Commit:** YES

- [ ] **T16: Create ai/ Directory and Consolidate**

  **What to do:**
  - Create apps/scraper/ai/
  - Move all ai_*.py files from scrapers/:
    - ai_discovery.py
    - ai_metrics.py
    - ai_retry.py
    - ai_fallback.py
    - ai_cost_tracker.py
  - Update imports
  
  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` (many file moves + import updates)
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] All AI modules in ai/ directory
  - [ ] No ai_*.py files remaining in scrapers/
  - [ ] All imports updated
  
  **QA Scenarios:**
  ```
  Scenario: AI module import test
    Tool: Bash
    Steps:
      1. python -c "from ai.discovery import AIDiscoveryScraper; print('OK')"
      2. Verify no ai_*.py in scrapers/
    Expected Result: AI modules import cleanly from new location
    Evidence: .sisyphus/evidence/t16-ai-consolidation.log
  ```
  
  **Commit:** YES

- [ ] **T17: Create infra/ and Move core/ Services**

  **What to do:**
  - Create apps/scraper/infra/
  - Move apps/scraper/core/ to apps/scraper/infra/
  - Alternative: keep as core/ but consolidate with events, api, validation
  
  **Decision needed:** core/ vs infra/ naming
  
  **Recommended Agent Profile:**
  - **Category:** `unspecified-high`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] Core services organized clearly
  - [ ] All imports updated
  
  **QA Scenarios:**
  ```
  Scenario: Infrastructure import test
    Tool: Bash
    Steps:
      1. python -c "from infra.api_client import ScraperAPIClient; print('OK')"
      2. python -c "from infra.events import create_emitter; print('OK')"
    Expected Result: Infrastructure modules import cleanly
    Evidence: .sisyphus/evidence/t17-infra-restructure.log
  ```
  
  **Commit:** YES

- [ ] **T18: Reorganize Models and Validation**

  **What to do:**
  - Move apps/scraper/scrapers/models/ to apps/scraper/models/
  - Consolidate scrapers/schemas/ with validation/
  - Update imports
  
  **Recommended Agent Profile:**
  - **Category:** `quick`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] All models in models/
  - [ ] Validation consolidated
  - [ ] All imports updated
  
  **QA Scenarios:**
  ```
  Scenario: Model import test
    Tool: Bash
    Steps:
      1. python -c "from models.config import ScraperConfig; print('OK')"
      2. python -c "from models.result import ScrapeResult; print('OK')"
    Expected Result: Models import cleanly
    Evidence: .sisyphus/evidence/t18-models-validation.log
  ```
  
  **Commit:** YES

---

### Phase 5: Final Cleanup

- [ ] **T19: Break Up Oversized Files**

  **What to do:**
  - Break up files >500 lines identified in analysis:
    - runner/__init__.py (554 lines) - after T12 merge
    - transpiler.py (379 lines) - if still large after T9
  - Extract helper functions into separate modules
  
  **Recommended Agent Profile:**
  - **Category:** `artistry` (careful refactoring)
  
  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Wave 4)
  
  **Acceptance Criteria:**
  - [ ] No files >500 lines remain
  - [ ] Functionality preserved
  - [ ] All imports work
  
  **QA Scenarios:**
  ```
  Scenario: File size check
    Tool: Bash
    Steps:
      1. find apps/scraper -name "*.py" -exec wc -l {} + | sort -n | tail -20
      2. Verify no files >500 lines
    Expected Result: All files under 500 lines
    Evidence: .sisyphus/evidence/t19-file-sizes.log
  ```
  
  **Commit:** YES

- [ ] **T20: Move All Tests to Root tests/**

  **What to do:**
  - Move scrapers/tests/ to tests/unit/scrapers/
  - Move any other tests from inside modules
  - Ensure tests/ mirrors source structure
  
  **Recommended Agent Profile:**
  - **Category:** `quick`
  
  **Parallelization:**
  - **Can Run In Parallel:** YES
  
  **Acceptance Criteria:**
  - [ ] No tests/ directories inside modules
  - [ ] All tests in root tests/
  - [ ] pytest discovers all tests
  
  **QA Scenarios:**
  ```
  Scenario: Test discovery check
    Tool: Bash
    Steps:
      1. cd apps/scraper && python -m pytest --collect-only 2>&1 | tail -20
      2. Verify test count matches or exceeds previous
    Expected Result: All tests discovered and runnable
    Evidence: .sisyphus/evidence/t20-test-restructure.log
  ```
  
  **Commit:** YES

- [ ] **T21: Final Import Update Pass**

  **What to do:**
  - Comprehensive grep for any remaining old imports
  - Update any stragglers
  - Verify no broken imports remain
  
  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` (thoroughness required)
  
  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on T14-T20)
  
  **Acceptance Criteria:**
  - [ ] Zero broken imports
  - [ ] All modules import cleanly
  - [ ] pytest passes completely
  
  **QA Scenarios:**
  ```
  Scenario: Comprehensive import test
    Tool: Bash
    Steps:
      1. cd apps/scraper && python -c "
          import daemon
          import runner
          from engine import crawl4ai_engine
          from actions.registry import ActionRegistry
          from models.config import ScraperConfig
          from infra.api_client import ScraperAPIClient
          print('All imports successful')
        "
      2. python -m pytest tests/ -v --tb=short 2>&1 | tail -30
    Expected Result: All imports work, all tests pass
    Evidence: .sisyphus/evidence/t21-final-imports.log
  ```
  
  **Commit:** YES

---

## Final Verification Wave (MANDATORY)

- [ ] **F1: Import Resolution Audit** — `oracle`
  
  Read the final codebase. For each top-level module (engine/, actions/, ai/, infra/, models/, runner/), verify all imports resolve correctly. Check for any remaining references to deleted modules (scraper_backend/, src/, old paths). Use Python to attempt importing every module.
  
  **Output:** `All modules import successfully [PASS]` or list of broken imports `[FAIL]`

- [ ] **F2: pytest Verification** — `unspecified-high`
  
  Run the full test suite: `cd apps/scraper && python -m pytest tests/ -v`. Verify all tests pass. Check that test coverage hasn't dropped significantly. Ensure no tests were lost during the moves.
  
  **Output:** `Tests passing [N/N]` with coverage report

- [ ] **F3: Docker Build Test** — `unspecified-high`
  
  Build the Docker image: `docker build -t baystate-scraper apps/scraper`. Verify the build completes without errors. Test that the container can start: `docker run --rm baystate-scraper python daemon.py --help`.
  
  **Output:** `Docker build [PASS/FAIL]`

- [ ] **F4: Architecture Compliance Check** — `deep`
  
  Verify the final structure matches the target architecture:
  - engine/ contains crawl4ai code
  - actions/ contains action handlers
  - ai/ contains AI modules
  - infra/ contains core services
  - models/ contains data models
  - No files >500 lines
  - No archive/ directories
  - No tests/ inside modules
  
  **Output:** `Architecture compliance [PASS/FAIL]` with deviations listed

---

## Commit Strategy

### Phase 1: Investigation
- NO commits (investigation only)

### Phase 2: Dead Code Removal
```
refactor(scraper): remove unused scraper_backend directory
- Delete apps/scraper/scraper_backend/ (confirmed unused)
- Remove 23 files of duplicate crawl4ai engine
```

### Phase 3: Entry Point Consolidation
```
refactor(scraper): consolidate entry points
- Merge runner.py and run_job.py into runner/
- Merge runtime.py with runner/__init__.py
- Standardize CLI interfaces
```

### Phase 4: Directory Restructure
```
refactor(scraper): restructure directories by concern
- Move src/crawl4ai_engine/ to engine/
- Move scrapers/actions/ to actions/
- Create ai/ and move AI modules
- Create infra/ for core services
- Reorganize models/ and validation/
```

### Phase 5: Final Cleanup
```
refactor(scraper): final cleanup and import fixes
- Break up oversized files
- Move all tests to root tests/
- Fix all import references
```

---

## Success Criteria

### Verification Commands
```bash
# Must all pass:
cd apps/scraper

# 1. Import test
python -c "
import daemon
import runner
from engine import crawl4ai_engine
from actions.registry import ActionRegistry
from models.config import ScraperConfig
from infra.api_client import ScraperAPIClient
print('✓ All imports successful')
"

# 2. pytest
python -m pytest tests/ -v --tb=short

# 3. Docker build
docker build -t baystate-scraper .

# 4. Entry point smoke test
python daemon.py --help

# 5. File count check
find . -name "*.py" | wc -l  # Should be < 80

# 6. File size check
find . -name "*.py" -exec wc -l {} + | sort -n | tail -5  # None > 500

# 7. Archive check
find . -type d -name "archive"  # Should be empty

# 8. Tests location check
find . -path "*/tests" -type d | grep -v "^./tests"  # Should be empty
```

### Final Checklist
- [ ] < 80 Python files (was 100+)
- [ ] Single crawl4ai engine (not 2)
- [ ] 3 entry points maximum (was 6)
- [ ] No archive/ directories
- [ ] No files >500 lines
- [ ] All tests in tests/
- [ ] All imports resolve
- [ ] pytest passes
- [ ] Docker build succeeds
- [ ] Directory structure matches target architecture

---

## Risk Mitigation

### High-Risk Changes
1. **Removing scraper_backend/** - Mitigation: T1 investigation + git revert capability
2. **Merging runtime.py** - Mitigation: T3 thorough comparison + preserve both versions initially
3. **Directory restructure** - Mitigation: Do in waves, verify imports after each wave

### Rollback Strategy
- Each phase is independent and can be rolled back via git
- Keep Phase 1 investigation results for reference
- Document all import changes for easy reverting

### Testing Strategy
- Run pytest after every commit
- Verify Docker build after major changes
- Smoke test entry points (daemon.py, runner.py) after each phase

---

## Notes

### Why Not Just Delete Everything at Once?
The phased approach ensures:
1. **Investigation first** - We don't delete code that might be used
2. **Safe cleanup** - Remove dead code with confidence
3. **Gradual restructuring** - Easy to test and rollback at each phase
4. **Verification** - Final wave ensures nothing was broken

### Key Decisions Needed During Execution
1. **T1:** Confirm scraper_backend/ is truly unused
2. **T2:** Decide which event system to keep (or if both serve different purposes)
3. **T3:** Determine authoritative job execution module (runtime.py vs runner/)
4. **T17:** Decide on naming (core/ vs infra/ vs keep as core/)

### Post-Cleanup Opportunities
After this cleanup is complete, consider:
- Adding import linting (prevent future circular deps)
- Standardizing on a single CLI framework (Click vs argparse)
- Adding architecture tests (enforce module boundaries)
- Documentation updates (AGENTS.md files need refresh)
