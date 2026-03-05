# Scraper Lab Consolidation Plan

## TL;DR

> **Quick Summary**: Consolidate `/admin/scrapers/configs/` and `/admin/scrapers/test-lab/` into a unified `/admin/scraper-lab/` section, maintaining all existing functionality while improving workflow efficiency through inline config creation and testing.
> 
> **Deliverables**:
> - New `/admin/scraper-lab/` route structure
> - Unified Scraper Lab landing page (config list + test entry)
> - Integrated Config Editor with Test Lab workflow
> - Updated sidebar navigation
> - Legacy route redirects (307 temporary)
> - All existing APIs unchanged
> 
> **Estimated Effort**: Medium (~2-3 weeks of focused work)
> **Parallel Execution**: YES - 4 waves with parallelizable tasks
> **Critical Path**: Sidebar Update → New Routes → Legacy Redirects → Component Migration → Verification

---

## Context

### Original Request
Consolidate the "Configs" section into the "Test Lab" section and rename the combined section to "Scraper Lab".

### Interview Summary
**Key Discussions**:
- User found the current dual-section architecture confusing
- Draft/publish workflow in Configs is broken (fixed earlier in session)
- Login requirement validation was too strict (fixed earlier in session)
- User wants a unified, streamlined experience

**Research Findings**:
- Configs section: ConfigEditorClient (7 tabs), ConfigsClient (list), draft/validate/publish workflow
- Test Lab section: TestLabClient, SKU Manager, real-time results, HistoricalTestRuns, TestAnalyticsDashboard
- Both share `scraper_configs` database table
- Sidebar navigation in `components/admin/sidebar.tsx`
- No database schema changes needed (existing schema compatible)

### Metis Review
**Identified Gaps** (addressed):
1. **Missing external dependency validation** - Checked: No external systems reference these routes
2. **Missing acceptance criteria for route redirects** - Added as executable curl commands
3. **Missing feature parity checklist** - Added browser automation commands
4. **Missing rollback procedure** - Added as first task
5. **Ambiguous query parameter handling** - Resolved: use 307 with query preservation
6. **Hard guardrails defined** - Explicit "MUST NOT" list to prevent scope creep
7. **Edge cases documented** - Orphaned test runs, concurrent operations, error states

---

## Work Objectives

### Core Objective
Create a unified "Scraper Lab" section that combines configuration management with testing capabilities, reducing user confusion while maintaining full backward compatibility.

### Concrete Deliverables
1. New `/admin/scraper-lab/` route structure
2. Unified landing page with config list + test runner entry
3. Integrated Config Editor (preserving all 7 tabs)
4. Updated sidebar navigation
5. Legacy route redirects (307 temporary, upgrade to 308 after verification)
6. No database changes
7. No API changes
8. Full feature parity verification

### Definition of Done
- [ ] All legacy routes redirect correctly (301/302 with query params preserved)
- [ ] ConfigEditorClient all 7 tabs function identically
- [ ] ConfigsClient list view shows all configs
- [ ] Draft/Validate/Publish workflow completes successfully
- [ ] TestLabClient loads without errors
- [ ] SKU Manager creates/updates/deletes SKUs
- [ ] Real-time results display within 2 seconds
- [ ] HistoricalTestRuns shows previous runs
- [ ] TestAnalyticsDashboard renders all charts
- [ ] Sidebar navigation updated
- [ ] No TypeScript build errors
- [ ] All tests pass

### Must Have
- Functional config management (CRUD)
- Functional test lab with real-time updates
- Legacy route redirects
- Updated sidebar navigation
- No data loss

### Must NOT Have (Guardrails)
- NO database schema modifications
- NO API endpoint changes
- NO authentication/authorization logic changes
- NO refactoring of internal code logic beyond consolidation requirements
- NO new dependencies
- NO changes to ConfigEditorClient's 7-tab structure without explicit approval
- NO changes to TestAnalyticsDashboard calculations
- NO new database migrations
- NO breaking changes to existing functionality

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES
- **User wants tests**: Manual verification with automated curl/browser commands
- **Framework**: Playwright for browser automation, curl for API verification

### Verification Commands

**Route Redirect Verification:**
```bash
# Legacy config route redirects
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/scrapers/configs/123
# Assert: Output equals "301" or "302"

# Legacy test-lab route redirects
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/scrapers/test-lab
# Assert: Output equals "301" or "302"

# Query parameter preservation
curl -s -I "http://localhost:3000/admin/scrapers/configs?id=123&view=edit" | grep -i location
# Assert: Location header contains /admin/scraper-lab with query params
```

**API Parity Verification:**
```bash
# Configs API returns same structure
curl -s http://localhost:3000/api/scraper-configs | jq '.[0].id' | head -1
# Assert: Output is not null

# Test runs API returns same structure  
curl -s http://localhost:3000/api/admin/scraper-network/test | jq '.[0].id' | head -1
# Assert: Output is not null
```

**Feature Parity (Playwright):**
```typescript
// Navigate to new Scraper Lab
await page.goto('http://localhost:3000/admin/scraper-lab');

// Verify config list loads
await page.waitForSelector('[class*="ConfigsClient"], [class*="config-list"]');

// Verify test lab can be accessed
await page.click('text=Test');

// Verify real-time hook connects
await page.waitForFunction(() => {
  const status = document.querySelector('[class*="connection"], [class*="status"]');
  return status?.textContent?.includes('Connected') || status?.textContent?.includes('Live');
}, { timeout: 5000 });
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Start Immediately):
├── Task 1: Create rollback checklist and backup strategy
└── Task 2: Search for hardcoded URLs to old paths

Wave 2 (Infrastructure - After Wave 1):
├── Task 3: Create new /admin/scraper-lab/ route structure
├── Task 4: Create unified ScraperLabLanding component
└── Task 5: Update sidebar navigation

Wave 3 (Migration - After Wave 2):
├── Task 6: Create legacy route redirects (307)
├── Task 7: Migrate ConfigEditorClient to new location
├── Task 8: Integrate TestLabClient with new landing
└── Task 9: Update component imports and links

Wave 4 (Verification - After Wave 3):
├── Task 10: Verify all legacy routes redirect
├── Task 11: Verify feature parity (all tabs, workflows)
├── Task 12: Run TypeScript build
└── Task 13: Commit and push changes
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2 | None (foundation) |
| 2 | None | 3 | None (foundation) |
| 3 | 1, 2 | 4, 5, 6 | None |
| 4 | 3 | 7, 8, 9 | 5, 6 |
| 5 | 1 | None | 3, 4, 6 |
| 6 | 3 | 10 | 4, 5, 7, 8, 9 |
| 7 | 4 | None | 5, 6, 8, 9 |
| 8 | 4 | None | 5, 6, 7, 9 |
| 9 | 4, 7, 8 | None | 5, 6 |
| 10 | 6 | None | 11, 12, 13 |
| 11 | 7, 8, 9 | None | 10, 12, 13 |
| 12 | 7, 8, 9, 10 | None | 10, 11, 13 |
| 13 | 10, 11, 12 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | delegate_task(category="quick", load_skills=["git-master"]) |
| 2 | 3, 4, 5 | delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux"]) |
| 3 | 6, 7, 8, 9 | delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux"]) |
| 4 | 10, 11, 12, 13 | delegate_task(category="quick", load_skills=["playwright"]) |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.

- [x] 1. **Create rollback checklist and backup strategy**

  **What to do**:
  - Document all files that will be modified
  - Create backup copies of critical files before modification
  - Document database tables and their current state
  - Create a step-by-step rollback procedure

  **Must NOT do**:
  - Modify any production data
  - Delete any files (only archive if absolutely necessary)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple documentation and backup tasks
  - **Skills**: [`git-master`]
    - `git-master`: Critical for backup and rollback procedures
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed for documentation tasks

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:
  - `BayStateApp/.git/config` - Git configuration for backup
  - `BayStateApp/supabase/migrations/` - Database migration history

  **Acceptance Criteria**:
  - [ ] Rollback checklist created at `.sisyphus/plans/scraper-lab-rollback.md`
  - [ ] All modified files documented with original state captured
  - [ ] Git commit created before any modifications

- [x] 2. **Search for hardcoded URLs to old paths**

  **What to do**:
  - Search entire codebase for `/admin/scrapers/configs` string literals
  - Search entire codebase for `/admin/scrapers/test-lab` string literals
  - Search for `scrapers/configs` and `scrapers/test-lab` patterns
  - Document all findings for update

  **Must NOT do**:
  - Modify any files (only document findings)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple grep search task
  - **Skills**: [`git-master`]
    - `git-master`: For search and documentation
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed for search

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:
  - Grep patterns: `/admin/scrapers/configs`, `/admin/scrapers/test-lab`
  - File types: `.ts`, `.tsx`, `.js`, `.jsx`, `.md`

  **Acceptance Criteria**:
  - [ ] Search completed and results documented
  - [ ] All occurrences listed with file paths and line numbers
  - [ ] Categorized by: Components, API routes, Documentation

- [x] 3. **Create new /admin/scraper-lab/ route structure**

  **What to do**:
  - Create directory: `app/admin/scraper-lab/`
  - Create `app/admin/scraper-lab/page.tsx` (unified landing)
  - Create `app/admin/scraper-lab/[id]/page.tsx` (config detail + test runner)
  - Create `app/admin/scraper-lab/new/page.tsx` (config creation wizard)
  - Ensure route imports work correctly

  **Must NOT do**:
  - Delete old routes (create redirects later)
  - Modify existing API routes

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Frontend route creation
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI patterns and component structure
  - **Skills Evaluated but Omitted**:
    - `vercel-react-best-practices`: Next.js App Router patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `app/admin/scrapers/test-lab/page.tsx` - Test Lab page pattern
  - `app/admin/scraper-configs/[id]/page.tsx` - Config detail pattern
  - `app/admin/scrapers/configs/page.tsx` - Config list pattern

  **Acceptance Criteria**:
  - [ ] Directory `app/admin/scraper-lab/` created
  - [ ] `page.tsx` renders without errors
  - [ ] `[id]/page.tsx` renders without errors
  - [ ] `new/page.tsx` renders without errors
  - [ ] TypeScript build passes

- [ ] 4. **Create unified ScraperLabLanding component**

  **What to do**:
  - Create `ScraperLabLanding.tsx` combining:
    - Config list (from ConfigsClient)
    - Test Lab entry point (from TestLabClient)
  - Add "Create New Config" button inline
  - Add "Run Tests" quick action
  - Preserve all existing functionality

  **Must NOT do**:
  - Change ConfigEditorClient's 7-tab structure
  - Change TestLabClient's functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Component design and layout

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Tasks 7, 8, 9
  - **Blocked By**: Task 3

  **References**:
  - `components/admin/scrapers/ConfigsClient.tsx` - Config list pattern
  - `components/admin/scrapers/TestLabClient.tsx` - Test Lab pattern

  **Acceptance Criteria**:
  - [x] ScraperLabLanding component created
  - [ ] Config list displays all configs with status badges
  - [ ] "Create New Config" button opens wizard
  - [ ] "Run Tests" button navigates to test runner
  - [ ] TypeScript build passes

- [ ] 5. **Update sidebar navigation**

  **What to do**:
  - Edit `components/admin/sidebar.tsx`
  - Change "Configs" label to "Scraper Lab"
  - Remove "Test Lab" entry (merged into Scraper Lab)
  - Update href from `/admin/scrapers/configs` to `/admin/scraper-lab`
  - Update icon if needed

  **Must NOT do**:
  - Remove any other navigation items
  - Change navigation structure for other sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple navigation update
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI consistency

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - `components/admin/sidebar.tsx:79-88` - Current scraper navigation

  **Acceptance Criteria**:
  - [ ] Sidebar shows "Scraper Lab" instead of "Configs"
  - [ ] "Test Lab" removed from sidebar
  - [ ] Link points to `/admin/scraper-lab`
  - [ ] TypeScript build passes

- [ ] 6. **Create legacy route redirects (307)**

  **What to do**:
  - Create `app/admin/scrapers/configs/[...not-found]/page.tsx` with 307 redirect
  - Create `app/admin/scrapers/test-lab/page.tsx` with 307 redirect
  - Preserve query parameters in redirects
  - Add logging for debugging

  **Must NOT do**:
  - Use 301 (permanent) redirects yet (use 307 for testing)
  - Break any existing functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple redirect configuration
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Route patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5)
  - **Blocks**: Task 10
  - **Blocked By**: Task 3

  **References**:
  - `app/admin/scrapers/page.tsx` - Existing redirect pattern

  **Acceptance Criteria**:
  - [ ] `/admin/scrapers/configs/123` redirects to `/admin/scraper-lab/123`
  - [ ] `/admin/scrapers/test-lab` redirects to `/admin/scraper-lab`
  - [ ] Query parameters preserved in redirects
  - [ ] TypeScript build passes

- [ ] 7. **Migrate ConfigEditorClient to new location**

  **What to do**:
  - Move `components/admin/scrapers/config-editor/` to `components/admin/scraper-lab/config-editor/`
  - Update all import paths in ConfigEditorClient
  - Verify all 7 tabs still function
  - Verify draft/validate/publish workflow still works

  **Must NOT do**:
  - Modify ConfigEditorClient's internal logic
  - Change any of the 7 tabs
  - Modify any validation or form logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Component migration
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Component structure

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8, 9)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:
  - `components/admin/scrapers/config-editor/` - Current location
  - `components/admin/scraper-configs/` - For reference

  **Acceptance Criteria**:
  - [ ] ConfigEditorClient accessible at new location
  - [ ] All 7 tabs render correctly
  - [ ] Draft/Validate/Publish workflow completes successfully
  - [ ] TypeScript build passes

- [ ] 8. **Integrate TestLabClient with new landing**

  **What to do**:
  - Move Test Lab components to unified structure
  - Update imports and links
  - Ensure real-time updates still work
  - Verify SKU management still works

  **Must NOT do**:
  - Modify TestLabClient's internal logic
  - Change real-time connection logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Component integration
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Component integration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7, 9)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:
  - `components/admin/scrapers/test-lab/` - Current location
  - `lib/hooks/useSupabaseRealtime.ts` - Real-time hook

  **Acceptance Criteria**:
  - [ ] TestLabClient accessible from new landing
  - [ ] Real-time updates display within 2 seconds
  - [ ] SKU Manager creates/updates/deletes SKUs
  - [ ] TypeScript build passes

- [ ] 9. **Update component imports and links**

  **What to do**:
  - Update all hardcoded URLs found in Task 2
  - Update component imports to use new paths
  - Update any documentation references
  - Verify no broken imports

  **Must NOT do**:
  - Modify business logic
  - Change API behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Search and replace task
  - **Skills**: [`git-master`]
    - `git-master`: For finding and updating references

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 7, 8)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 7, 8

  **References**:
  - Results from Task 2

  **Acceptance Criteria**:
  - [ ] All hardcoded URLs updated to new paths
  - [ ] All component imports updated
  - [ ] TypeScript build passes
  - [ ] No console errors on page load

- [ ] 10. **Verify all legacy routes redirect**

  **What to do**:
  - Run curl commands to verify redirects
  - Verify query parameter preservation
  - Test edge cases (trailing slashes, etc.)
  - Document results

  **Must NOT do**:
  - Modify any files (only verify)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification task
  - **Skills**: [`playwright`]
    - `playwright`: For browser automation verification

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **Verification Commands**:
  ```bash
  # Test redirect status codes
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/scrapers/configs/123
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/scrapers/test-lab
  
  # Test query parameter preservation
  curl -s -I "http://localhost:3000/admin/scrapers/configs?id=123" | grep -i location
  ```

  **Acceptance Criteria**:
  - [ ] All legacy routes return 301/302 status
  - [ ] Location header contains correct new path
  - [ ] Query parameters preserved
  - [ ] Results documented

- [ ] 11. **Verify feature parity (all tabs, workflows)**

  **What to do**:
  - Test ConfigEditorClient all 7 tabs
  - Test TestLabClient real-time updates
  - Test SKU Manager functionality
  - Test HistoricalTestRuns
  - Test TestAnalyticsDashboard
  - Test draft/validate/publish workflow

  **Must NOT do**:
  - Modify any files (only verify)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification task
  - **Skills**: [`playwright`]
    - `playwright`: Browser automation for feature testing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 8, 9

  **Verification Commands**:
  ```typescript
  // Playwright test pseudocode
  await page.goto('http://localhost:3000/admin/scraper-lab');
  
  // Test config list
  await page.waitForSelector('[class*="config-list"]');
  
  // Test all 7 tabs
  const tabs = ['metadata', 'selectors', 'workflow', 'config', 'advanced', 'testing', 'preview'];
  for (const tab of tabs) {
    await page.click(`[value="${tab}"]`);
    await page.waitForSelector(`[value="${tab}"][data-state="active"]`);
  }
  
  // Test real-time connection
  await page.waitForFunction(() => {
    const status = document.querySelector('[class*="connection"]');
    return status?.textContent?.includes('Connected');
  }, { timeout: 5000 });
  ```

  **Acceptance Criteria**:
  - [ ] All 7 ConfigEditorClient tabs function
  - [ ] Real-time updates display within 2 seconds
  - [ ] SKU Manager CRUD operations work
  - [ ] HistoricalTestRuns displays past runs
  - [ ] TestAnalyticsDashboard renders all charts
  - [ ] Draft/Validate/Publish workflow completes

- [ ] 12. **Run TypeScript build**

  **What to do**:
  - Run `npm run build` or `bun build`
  - Fix any TypeScript errors (not logic errors)
  - Verify no new warnings

  **Must NOT do**:
  - Modify business logic to fix errors

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Build verification
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Build patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 8, 9

  **Verification Commands**:
  ```bash
  cd BayStateApp
  npm run build
  # Assert: Exit code 0
  ```

  **Acceptance Criteria**:
  - [ ] Build exits with code 0
  - [ ] No TypeScript errors
  - [ ] No new warnings

- [ ] 13. **Commit and push changes**

  **What to do**:
  - Create git commit with descriptive message
  - Push to remote
  - Verify CI passes if applicable

  **Must NOT do**:
  - Force push
  - Amend commits after push

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Git operations
  - **Skills**: [`git-master`]
    - `git-master`: For proper commit practices

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: Tasks 10, 11, 12

  **Verification Commands**:
  ```bash
  git status
  git add -A
  git commit -m "feat(admin): consolidate configs and test-lab into scraper-lab
  
  - Create unified /admin/scraper-lab/ route structure
  - Update sidebar navigation (Configs → Scraper Lab)
  - Add legacy route redirects (307 temporary)
  - Preserve all existing functionality
  - No breaking changes to APIs or database"
  git push
  ```

  **Acceptance Criteria**:
  - [ ] Commit created with descriptive message
  - [ ] Changes pushed to remote
  - [ ] CI passes (if configured)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1-2 | `docs(admin): document rollback strategy for scraper-lab consolidation` | `.sisyphus/plans/scraper-lab-rollback.md` | - |
| 3-5 | `feat(admin): create scraper-lab route structure and sidebar` | `app/admin/scraper-lab/`, `sidebar.tsx` | `npm run build` |
| 6-9 | `refactor(admin): migrate components to scraper-lab` | `components/admin/scraper-lab/` | `npm run build` |
| 10-12 | `test(admin): verify scraper-lab consolidation` | - | All tests pass |
| 13 | `feat(admin): scraper-lab consolidation complete` | All modified files | CI passes |

---

## Success Criteria

### Verification Commands
```bash
# Route redirects
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/scrapers/configs/123
# Expected: 301 or 302

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/scrapers/test-lab
# Expected: 301 or 302

# Build
cd BayStateApp && npm run build
# Expected: Exit code 0

# Feature parity - all tabs work
# Use Playwright to verify all 7 tabs and real-time updates
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (no schema changes, no API changes)
- [ ] All tests pass
- [ ] Legacy routes redirect correctly
- [ ] Feature parity verified
- [ ] Build succeeds
- [ ] Changes committed and pushed
