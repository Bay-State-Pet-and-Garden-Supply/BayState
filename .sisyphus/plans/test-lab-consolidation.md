# Test Lab Consolidation: Remove Legacy System & Fix Data Flow

## TL;DR

> **Quick Summary**: Consolidate the test lab system by removing legacy components that reference the dropped `scrapers` table, fixing query bugs, and ensuring the workbench Test Lab correctly displays test runs.
> 
> **Deliverables**: 
> - Fixed test-lab page query (duplicate join bug)
> - Fixed `update_health_metrics()` function
> - Deleted orphan test run records
> - Removed legacy `/admin/scraper-lab` page and components
> - Updated/repurposed legacy API endpoint
> - Consolidated TestLabClient components
> 
> **Estimated Effort**: Medium (4-6 hours across 3 waves)
> **Parallel Execution**: YES - 3 waves + final verification
> **Critical Path**: Hotfixes (Wave 1) → Data Cleanup (Wave 2) → Legacy Removal (Wave 3) → Verification (Wave 4)

---

## Context

### Original Request
Test runs complete and appear in History tab, but Test Lab remains empty.

### Root Cause Analysis
**The Problem**: Two competing test systems with a schema migration disconnect.

1. **The `scrapers` table was dropped** (2026-02-21) and replaced with `scraper_configs`
2. **Two test APIs exist:**
   - `/api/admin/scraper-network/test` (legacy) - Creates test runs with `scraper_id` pointing to the **dropped** `scrapers` table
   - `/api/admin/scrapers/studio/test` (new) - Correctly references `scraper_configs`
3. **Orphan records**: Test runs created via the old API have invalid `scraper_id` values (set to NULL by migration)
4. **Query bug**: `test-lab/page.tsx` has duplicate/conflicting join specifications causing Supabase errors
5. **Broken function**: `update_health_metrics()` still references the dropped `scrapers` table

### Metis Review Findings
**Critical Blockers Identified**:
- Duplicate join bug in test-lab/page.tsx (lines 49-57) - will cause immediate runtime errors
- Broken `update_health_metrics()` function referencing dropped table
- Two nearly identical TestLabClient components with divergent navigation
- Must NOT delete test runs with `pending` or `running` status

**Guardrails Applied**:
- DO NOT modify the callback handler (it's working correctly)
- DO NOT touch `scraper_configs` or production tables
- DO NOT delete active test runs (pending/running)

---

## Work Objectives

### Core Objective
Fix the test lab data flow by removing legacy schema references, consolidating components, and ensuring test runs correctly appear in the workbench Test Lab.

### Concrete Deliverables
- Fixed Supabase query in `test-lab/page.tsx` (remove duplicate join)
- Fixed `update_health_metrics()` SQL function
- Deleted orphan test run records (excluding pending/running)
- Removed legacy `/admin/scraper-lab` page directory
- Removed or repurposed legacy API endpoint
- Consolidated TestLabClient components (kept one, deleted other)
- Updated any navigation referencing legacy paths

### Definition of Done
- [ ] Test Lab page loads without Supabase errors
- [ ] New test runs appear in Test Lab immediately after creation
- [ ] No 404s when running tests
- [ ] All references to dropped `scrapers` table eliminated
- [ ] No duplicate/conflicting join specifications remain

### Must Have
- Fix the duplicate join bug (immediate blocker)
- Fix `update_health_metrics()` function
- Clean up orphan test runs safely
- Consolidate TestLabClient components

### Must NOT Have (Guardrails)
- DO NOT modify callback handler logic
- DO NOT delete `pending` or `running` test runs
- DO NOT touch `scraper_configs` table schema
- DO NOT break production scrape job flow

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Infrastructure Assessment
- **Infrastructure exists**: YES (Jest configured)
- **Automated tests**: Tests-after (post-implementation)
- **Framework**: Jest + React Testing Library
- **Agent-Executed QA**: REQUIRED for all tasks

### QA Policy
Every task MUST include agent-executed QA scenarios with evidence saved to `.sisyphus/evidence/`.

- **Frontend/UI**: Playwright — Navigate, assert DOM, screenshot
- **API/Backend**: Bash (curl) — Send requests, assert status + response
- **Database**: SQL queries — Verify data state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (CRITICAL HOTFIXES - Start Immediately):
├── Task 1: Fix duplicate join bug in test-lab/page.tsx [quick]
├── Task 2: Fix update_health_metrics() SQL function [quick]
└── Task 3: Identify which TestLabClient is actually used [quick]

Wave 2 (DATA CLEANUP - After Wave 1):
├── Task 4: Export orphan test runs for audit [quick]
├── Task 5: Delete orphan test runs (excluding pending/running) [quick]
└── Task 6: Verify no active test runs remain blocked [quick]

Wave 3 (LEGACY REMOVAL - After Wave 2):
├── Task 7: Consolidate TestLabClient components [quick]
├── Task 8: Remove legacy /admin/scraper-lab page [quick]
├── Task 9: Repurpose legacy scraper-network/test API [quick]
└── Task 10: Update navigation and links [quick]

Wave 4 (FINAL VERIFICATION - After Wave 3):
├── Task 11: End-to-end test run verification [unspecified-high]
├── Task 12: SQL function verification [quick]
└── Task 13: Code quality check (no scrapers references) [quick]

Wave FINAL (INDEPENDENT REVIEW):
├── Task F1: Plan compliance audit (oracle)
└── Task F2: Real manual QA (playwright)

Critical Path: Task 1 → Task 2 → Task 5 → Task 7 → Task 11 → F1-F2
```

---

## TODOs


- [ ] 1. Fix duplicate join bug in test-lab/page.tsx

  **What to do**:
  - Read `app/admin/scrapers/[slug]/test-lab/page.tsx` lines 48-66
  - Fix the malformed Supabase query with duplicate/conflicting join specifications
  - Change from duplicate `scrape_jobs!left(status)` entries to a single proper join
  
  **Current broken query**:
  ```typescript
  .select(`
    *,
    scrape_jobs!left(status)
    scrape_jobs!left(status)  // DUPLICATE!
    scrape_jobs!inner(status) // CONFLICTING!
  `)
  ```
  
  **Must NOT do**:
  - Do not just comment out lines - properly refactor the query
  - Do not change the data being returned (keep same fields)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `typescript`, `supabase`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocked By**: None
  - **Blocks**: Task 3 (verification)

  **References**:
  - `app/admin/scrapers/[slug]/test-lab/page.tsx:48-66` - The broken query
  - Supabase docs: https://supabase.com/docs/reference/javascript/select - Proper join syntax

  **Acceptance Criteria**:
  - [ ] Query has no duplicate join specifications
  - [ ] Test Lab page loads without Supabase error
  
  **QA Scenarios**:
  ```
  Scenario: Test Lab page loads successfully
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/admin/scrapers/AMAZON_SLUG/test-lab"
    Expected Result: HTTP 200
    Evidence: .sisyphus/evidence/task-1-page-load.txt

  Scenario: Supabase query returns no errors
    Tool: Bash (grep)
    Steps:
      1. Check browser console / server logs for Supabase query errors
      2. Verify no "duplicate join" or "syntax error" messages
    Expected Result: No Supabase errors in logs
    Evidence: .sisyphus/evidence/task-1-no-errors.log
  ```

  **Commit**: YES (Wave 1)
  - Message: `fix(test-lab): remove duplicate join specifications in test-lab query`
  - Files: `app/admin/scrapers/[slug]/test-lab/page.tsx`

- [ ] 2. Fix update_health_metrics() SQL function

  **What to do**:
  - Read `supabase/migrations/20260212000100_add_scraper_studio_tables.sql` lines 251-253
  - The function references the DROPPED `scrapers` table
  - Create a new migration to fix the function to use `scraper_configs` instead
  
  **Broken SQL**:
  ```sql
  FROM public.scraper_test_runs str
  JOIN public.scrapers s ON str.scraper_id = s.id  -- DROPPED TABLE!
  JOIN public.scraper_configs sc ON s.name = sc.slug
  ```
  
  **Must NOT do**:
  - Do not modify the existing migration file (it's already applied)
  - Do not delete the function - fix it

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `sql`, `supabase`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocked By**: None
  - **Blocks**: Task 6 (verification)

  **References**:
  - `supabase/migrations/20260212000100_add_scraper_studio_tables.sql:251-253` - Broken function
  - `supabase/migrations/20260225000000_fix_broken_scraper_fks.sql` - Shows the migration pattern used
  - Supabase docs: https://supabase.com/docs/guides/database/functions - Function management

  **Acceptance Criteria**:
  - [ ] New migration file created
  - [ ] Function updated to use `scraper_configs` instead of `scrapers`
  - [ ] Migration applies without errors
  
  **QA Scenarios**:
  ```
  Scenario: Function executes without errors
    Tool: Bash (psql)
    Steps:
      1. Run: psql $DATABASE_URL -c "SELECT update_health_metrics();"
    Expected Result: Command completes without error
    Evidence: .sisyphus/evidence/task-2-function-works.txt

  Scenario: Migration applies cleanly
    Tool: Bash (supabase)
    Steps:
      1. Run: npx supabase db reset
      2. Check for migration errors
    Expected Result: No SQL errors during migration
    Evidence: .sisyphus/evidence/task-2-migration.log
  ```

  **Commit**: YES (Wave 1)
  - Message: `fix(db): update update_health_metrics to use scraper_configs`
  - Files: `supabase/migrations/20260226_fix_health_metrics_function.sql`

- [ ] 3. Identify which TestLabClient is actually used

  **What to do**:
  - Search for all imports of `TestLabClient` across the codebase
  - Determine which component is actively being used
  - Document findings for Task 7 (consolidation)
  
  **Must NOT do**:
  - Do not delete anything yet (just investigate)
  - Do not modify components during this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `grep`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocked By**: None
  - **Blocks**: Task 7 (consolidation decision)

  **References**:
  - `components/admin/scrapers/TestLabClient.tsx` - Newer location
  - `components/admin/scraper-lab/TestLabClient.tsx` - Legacy location

  **Acceptance Criteria**:
  - [ ] List of all files importing TestLabClient
  - [ ] Determination of which component is primary
  
  **QA Scenarios**:
  ```
  Scenario: Find all TestLabClient imports
    Tool: Bash (grep)
    Steps:
      1. grep -r "TestLabClient" app/ components/ --include="*.tsx" --include="*.ts"
      2. Document which path is imported where
    Expected Result: Clear list of all usages
    Evidence: .sisyphus/evidence/task-3-imports.txt
  ```

  **Commit**: NO (research only, no code changes)


- [ ] 4. Export orphan test runs for audit

  **What to do**:
  - Query `scraper_test_runs` for records with `scraper_id IS NULL` or invalid references
  - Export to JSON for audit trail before deletion
  - Include: id, scraper_id, status, sku, created_at, results (if any)
  
  **Must NOT do**:
  - Do not delete records yet (just export)
  - Do not export records with status 'pending' or 'running'

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `sql`, `supabase`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocked By**: Task 1, Task 2 (hotfixes must be done first)
  - **Blocks**: Task 5 (deletion)

  **References**:
  - `scraper_test_runs` table schema
  - `supabase/migrations/20260225000000_fix_broken_scraper_fks.sql` - Shows orphan pattern

  **Acceptance Criteria**:
  - [ ] JSON export file created with all orphan test runs
  - [ ] Export excludes pending/running status records
  
  **QA Scenarios**:
  ```
  Scenario: Export orphan test runs
    Tool: Bash (psql)
    Steps:
      1. Query: SELECT * FROM scraper_test_runs WHERE scraper_id IS NULL OR scraper_id NOT IN (SELECT id FROM scraper_configs)
      2. Export to JSON file
    Expected Result: JSON file created with orphan records
    Evidence: .sisyphus/evidence/task-4-export.json

  Scenario: Verify no active runs in export
    Tool: Bash (jq)
    Steps:
      1. Check exported JSON for any records with status IN ('pending', 'running')
    Expected Result: Zero active records in export
    Evidence: .sisyphus/evidence/task-4-no-active.txt
  ```

  **Commit**: NO (data export, not code change)
  - Save export to: `.sisyphus/evidence/orphan-test-runs-export.json`

- [ ] 5. Delete orphan test runs (excluding pending/running)

  **What to do**:
  - Delete `scraper_test_runs` records where `scraper_id IS NULL` or references invalid config
  - CRITICAL: Exclude records with status IN ('pending', 'running')
  - Verify deletion count matches export count
  
  **Must NOT do**:
  - DO NOT DELETE records with status 'pending' or 'running' (would break active tests)
  - Do not delete without first exporting (Task 4)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `sql`, `supabase`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocked By**: Task 4 (export must be done first)
  - **Blocks**: Task 6 (verification)

  **References**:
  - Export file from Task 4
  - `scraper_configs` table (to verify which IDs are valid)

  **Acceptance Criteria**:
  - [ ] Orphan test runs deleted (excluding pending/running)
  - [ ] Deletion count matches export count
  
  **QA Scenarios**:
  ```
  Scenario: Delete orphan test runs safely
    Tool: Bash (psql)
    Steps:
      1. Begin transaction
      2. DELETE FROM scraper_test_runs WHERE scraper_id IS NULL AND status NOT IN ('pending', 'running')
      3. Verify row count matches export
      4. Commit transaction
    Expected Result: Orphan records deleted, count matches export
    Evidence: .sisyphus/evidence/task-5-deletion.txt

  Scenario: Verify no active runs deleted
    Tool: Bash (psql)
    Steps:
      1. Query: SELECT COUNT(*) FROM scraper_test_runs WHERE status IN ('pending', 'running')
      2. Count should be unchanged from before deletion
    Expected Result: Active test run count unchanged
    Evidence: .sisyphus/evidence/task-5-active-unchanged.txt
  ```

  **Commit**: YES (Wave 2)
  - Message: `cleanup(db): remove orphan test runs from dropped scrapers table`
  - Note: This is a data migration, include SQL in commit message

- [ ] 6. Verify no active test runs remain blocked

  **What to do**:
  - Query for any test runs with status IN ('pending', 'running')
  - Verify they have valid `scraper_id` references
  - If any active runs have NULL/invalid scraper_id, investigate why
  
  **Must NOT do**:
  - Do not modify active test runs
  - Do not delete anything

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `sql`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocked By**: Task 5 (deletion)
  - **Blocks**: Wave 3 (legacy removal - need clean state)

  **Acceptance Criteria**:
  - [ ] All pending/running test runs have valid scraper_id
  - [ ] No orphaned active test runs exist
  
  **QA Scenarios**:
  ```
  Scenario: Verify active test runs are valid
    Tool: Bash (psql)
    Steps:
      1. Query: SELECT id, status, scraper_id FROM scraper_test_runs WHERE status IN ('pending', 'running')
      2. Verify each scraper_id exists in scraper_configs
    Expected Result: All active runs have valid scraper_id references
    Evidence: .sisyphus/evidence/task-6-active-valid.txt
  ```

  **Commit**: NO (verification only)

- [ ] 7. Consolidate TestLabClient components

  **What to do**:
  - Based on Task 3 findings, determine which TestLabClient to keep
  - Compare the two components and merge any unique features
  - Delete the redundant component
  - Update all imports to use the surviving component
  
  **Components to compare**:
  - `components/admin/scrapers/TestLabClient.tsx` (newer location)
  - `components/admin/scraper-lab/TestLabClient.tsx` (legacy location)
  
  **Must NOT do**:
  - Do not delete both (keep one)
  - Do not lose functionality during merge

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `typescript`, `react`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Task 3 (investigation), Task 6 (clean state)
  - **Blocks**: Task 8 (page removal)

  **References**:
  - `components/admin/scrapers/TestLabClient.tsx`
  - `components/admin/scraper-lab/TestLabClient.tsx`

  **Acceptance Criteria**:
  - [ ] One TestLabClient component remains
  - [ ] All imports updated to use surviving component
  - [ ] No functionality lost
  
  **QA Scenarios**:
  ```
  Scenario: TestLabClient imports work
    Tool: Bash (grep)
    Steps:
      1. grep -r "from.*TestLabClient" app/ components/ --include="*.tsx"
      2. Verify only one component path is imported
    Expected Result: All imports point to surviving component
    Evidence: .sisyphus/evidence/task-7-imports.txt

  Scenario: No duplicate components remain
    Tool: Bash (ls)
    Steps:
      1. ls components/admin/scrapers/TestLabClient.tsx
      2. ls components/admin/scraper-lab/TestLabClient.tsx (should fail)
    Expected Result: Only one component file exists
    Evidence: .sisyphus/evidence/task-7-component.txt
  ```

  **Commit**: YES (Wave 3)
  - Message: `refactor(test-lab): consolidate TestLabClient components`
  - Files: Component files, import statements

- [ ] 8. Remove legacy scraper-lab components

  **What to do**:
  - **MOMUS NOTE**: `app/admin/scraper-lab/` directory does NOT exist (already removed)
  - Focus on removing `components/admin/scraper-lab/` directory instead
  - Delete the legacy TestLabClient and related components in this directory
  - Update any imports referencing this path
  - Update any navigation items that reference legacy paths
  
  **Must NOT do**:
  - Do not touch `/admin/scrapers/[slug]/test-lab` (this is the workbench - keep it)
  - Do not touch `components/admin/scrapers/TestLabClient.tsx` (the surviving component)
  - Do not break navigation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `filesystem`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Task 7 (component consolidation)
  - **Blocks**: Task 10 (navigation update)

  **References**:
  - `components/admin/scraper-lab/` directory (legacy components)
  - `components/admin/scrapers/TestLabClient.tsx` (keep this)

  **Acceptance Criteria**:
  - [ ] `components/admin/scraper-lab/` directory deleted
  - [ ] All imports updated to use surviving component
  
  **QA Scenarios**:
  ```
  Scenario: Legacy components removed
    Tool: Bash (ls)
    Steps:
      1. Try: ls components/admin/scraper-lab/
    Expected Result: Directory does not exist
    Evidence: .sisyphus/evidence/task-8-legacy-removed.txt

  Scenario: Workbench component still exists
    Tool: Bash (ls)
    Steps:
      1. ls components/admin/scrapers/TestLabClient.tsx
    Expected Result: File exists
    Evidence: .sisyphus/evidence/task-8-workbench-exists.txt
  ```

  **Commit**: YES (Wave 3)
  - Message: `cleanup(test-lab): remove legacy scraper-lab components`
  - Files: `components/admin/scraper-lab/` (deleted)



  **What to do**:
  - Delete the `app/admin/scraper-lab/` directory entirely
  - This includes: layout.tsx, page.tsx, and any subdirectories
  - Update any navigation items that reference this path
  
  **Must NOT do**:
  - Do not touch `/admin/scrapers/[slug]/test-lab` (this is the workbench - keep it)
  - Do not break navigation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `filesystem`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Task 7 (component consolidation)
  - **Blocks**: Task 10 (navigation update)

  **References**:
  - `app/admin/scraper-lab/` directory
  - `app/admin/scrapers/[slug]/test-lab/` (keep this)

  **Acceptance Criteria**:
  - [ ] `app/admin/scraper-lab/` directory deleted
  - [ ] `/admin/scraper-lab` URL returns 404
  - [ ] `/admin/scrapers/[slug]/test-lab` still works
  
  **QA Scenarios**:
  ```
  Scenario: Legacy page returns 404
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/admin/scraper-lab"
    Expected Result: HTTP 404
    Evidence: .sisyphus/evidence/task-8-legacy-404.txt

  Scenario: Workbench test-lab still works
    Tool: Bash (curl)
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/admin/scrapers/AMAZON/test-lab"
    Expected Result: HTTP 200
    Evidence: .sisyphus/evidence/task-8-workbench-200.txt
  ```

  **Commit**: YES (Wave 3)
  - Message: `cleanup(test-lab): remove legacy /admin/scraper-lab page`
  - Files: `app/admin/scraper-lab/` (deleted)

- [ ] 9. Repurpose legacy scraper-network/test API

  **What to do**:
  - Read `app/api/admin/scraper-network/test/route.ts`
  - Currently queries the DROPPED `scrapers` table (returns 404)
  - Either:
    a) Delete the endpoint entirely (if all callers migrated)
    b) Update to use `scraper_configs` (if still needed)
  - Based on Task 3 findings, determine if any callers remain
  
  **Must NOT do**:
  - Do not leave broken endpoint in place
  - Do not break existing functionality if endpoint is still used

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `typescript`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Task 3 (investigation)
  - **Blocks**: Task 10 (navigation)

  **References**:
  - `app/api/admin/scraper-network/test/route.ts` - The broken endpoint
  - `app/api/admin/scrapers/studio/test/route.ts` - The working endpoint

  **Acceptance Criteria**:
  - [ ] Legacy endpoint either fixed or removed
  - [ ] No 404s from remaining callers (if any)
  
  **QA Scenarios**:
  ```
  Scenario: No scrapers table references in API
    Tool: Bash (grep)
    Steps:
      1. grep -r "from('scrapers')" app/api/ --include="*.ts"
    Expected Result: No matches
    Evidence: .sisyphus/evidence/task-9-no-scrapers.txt
  ```

  **Commit**: YES (Wave 3)
  - Message: `cleanup(api): remove legacy scraper-network/test endpoint`
  - Files: `app/api/admin/scraper-network/test/` (deleted or updated)

- [ ] 10. Update navigation and links

  **What to do**:
  - Search for any links to `/admin/scraper-lab` or legacy test lab paths
  - Update to point to `/admin/scrapers/[slug]/test-lab`
  - Check: navigation components, breadcrumbs, buttons, redirects
  
  **Must NOT do**:
  - Do not break existing navigation flow
  - Do not leave broken links

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `grep`, `typescript`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocked By**: Task 8 (page removal)
  - **Blocks**: Wave 4 (verification)

  **Acceptance Criteria**:
  - [ ] No references to `/admin/scraper-lab` remain
  - [ ] Navigation points to correct workbench URL
  
  **QA Scenarios**:
  ```
  Scenario: No legacy links remain
    Tool: Bash (grep)
    Steps:
      1. grep -r "/admin/scraper-lab" app/ components/ --include="*.tsx" --include="*.ts"
    Expected Result: No matches
    Evidence: .sisyphus/evidence/task-10-no-legacy-links.txt
  ```

  **Commit**: YES (Wave 3)
  - Message: `fix(nav): update links from legacy to workbench test-lab`
  - Files: Navigation components

- [ ] 11. End-to-end test run verification

  **What to do**:
  - Trigger a test run using the new studio API
  - Verify test run appears in Test Lab
  - Verify callback updates test run status
  - Verify results are displayed correctly
  
  **Must NOT do**:
  - Do not use legacy API for testing
  - Do not skip verification steps

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `playwright`, `api-testing`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: All Wave 1-3 tasks
  - **Blocks**: Final Verification (F1, F2)

  **Acceptance Criteria**:
  - [ ] Test run creation returns 200
  - [ ] Test run appears in Test Lab query
  - [ ] Callback updates test run successfully
  - [ ] Results displayed in UI
  
  **QA Scenarios**:
  ```
  Scenario: Create test run via studio API
    Tool: Bash (curl)
    Steps:
      1. POST /api/admin/scrapers/studio/test with config_id and skus
      2. Verify response contains test_run_id
    Expected Result: HTTP 200 with test_run_id
    Evidence: .sisyphus/evidence/task-11-create.json

  Scenario: Test run appears in Test Lab
    Tool: Bash (curl)
    Steps:
      1. Query test-lab page or API
      2. Verify new test run is listed
    Expected Result: Test run visible in list
    Evidence: .sisyphus/evidence/task-11-visible.json

  Scenario: Callback updates test run (simulated)
    Tool: Bash (curl)
    Steps:
      1. POST to callback endpoint with test results
      2. Verify test run status updated in database
    Expected Result: Status changed to 'completed' or 'failed'
    Evidence: .sisyphus/evidence/task-11-callback.txt
  ```

  **Commit**: NO (verification only)

- [ ] 12. SQL function verification

  **What to do**:
  - Verify `update_health_metrics()` function works correctly
  - Run the function and check for errors
  - Verify it queries correct tables
  
  **Must NOT do**:
  - Do not modify the function (should have been fixed in Task 2)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `sql`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: Task 2 (function fix)
  - **Blocks**: Final Verification

  **Acceptance Criteria**:
  - [ ] Function executes without errors
  - [ ] Function references correct tables
  
  **QA Scenarios**:
  ```
  Scenario: Health metrics function works
    Tool: Bash (psql)
    Steps:
      1. Run: SELECT update_health_metrics();
    Expected Result: No errors
    Evidence: .sisyphus/evidence/task-12-function.txt
  ```

  **Commit**: NO (verification only)

- [ ] 13. Code quality check (no scrapers references)

  **What to do**:
  - Search entire codebase for references to dropped `scrapers` table
  - Verify no `.from('scrapers')` calls remain
  - Check migrations, functions, API routes, components
  
  **Must NOT do**:
  - Do not miss any references
  - Do not ignore SQL functions (check these carefully)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `grep`

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: All Wave 3 tasks
  - **Blocks**: Final Verification

  **Acceptance Criteria**:
  - [ ] Zero references to `scrapers` table in code
  - [ ] All SQL functions verified
  
  **QA Scenarios**:
  ```
  Scenario: No scrapers table references in TypeScript
    Tool: Bash (grep)
    Steps:
      1. grep -r "from('scrapers')" app/ components/ --include="*.ts" --include="*.tsx"
    Expected Result: Zero matches
    Evidence: .sisyphus/evidence/task-13-ts-clean.txt

  Scenario: No scrapers table references in SQL
    Tool: Bash (grep)
    Steps:
      1. grep -r "scrapers" supabase/migrations/ --include="*.sql" | grep -v "scraper_" | grep -v "scraper_configs"
    Expected Result: Only references to 'scraper_configs' or other 'scraper_' tables
    Evidence: .sisyphus/evidence/task-13-sql-clean.txt
  ```

  **Commit**: NO (verification only)



## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify all "Must Have" items are implemented and "Must NOT Have" guardrails respected. Check that no references to dropped `scrapers` table remain.
  **Acceptance**: `Must Have [5/5] | Must NOT Have [4/4] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Real Manual QA** — `unspecified-high` + `playwright`
  Execute full test run flow: trigger test → verify appears in Test Lab → verify callback updates status.
  **Acceptance**: `Test Run Flow [PASS/FAIL] | Test Lab Display [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **W1**: `fix(test-lab): fix duplicate join bug and health metrics function`
- **W2**: `cleanup(test-lab): remove orphan test runs safely`
- **W3**: `refactor(test-lab): remove legacy scraper-lab components`
- **W4**: `test(test-lab): verify end-to-end test run flow`

---

## Success Criteria

### Verification Commands
```bash
# 1. Test Lab page loads without errors
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/admin/scrapers/TEST_SLUG/test-lab"
# Expected: 200

# 2. No scrapers table references remain
grep -r "from('scrapers')" app/ --include="*.ts" | wc -l
# Expected: 0

# 3. Health metrics function works
psql $DATABASE_URL -c "SELECT update_health_metrics();"
# Expected: No errors

# 4. New test runs appear in query
psql $DATABASE_URL -c "SELECT COUNT(*) FROM scraper_test_runs WHERE created_at > NOW() - INTERVAL '1 hour';"
# Expected: > 0 after running tests
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Test Lab page loads without Supabase errors
- [ ] Test runs appear correctly in Test Lab
- [ ] No legacy components remain
- [ ] All SQL functions work correctly
