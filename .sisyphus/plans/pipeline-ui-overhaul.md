# Admin Pipeline UI Overhaul - Work Plan

## TL;DR

**Current Problem:** The pipeline page has 10 horizontal tabs mixing status stages, monitoring views, and action tools, creating cognitive overload and navigation confusion.

**Solution:** Consolidate into a unified view with status filtering (like Analytics date picker), move monitoring to secondary navigation, convert tools to action buttons. Reduce visual clutter by ~60%.

**Deliverables:**
- Unified Pipeline View with status filter dropdown
- Secondary navigation for monitoring/tools
- Simplified component architecture (50% code reduction)
- Consistent styling with dashboard design system

**Estimated Effort:** Medium (3-4 days implementation)
**Parallel Execution:** YES - UI refactor can happen in parallel with component splitting
**Critical Path:** Navigation restructure → Component refactor → Visual cleanup

---

## Context

### Current State
The `/admin/pipeline` page manages the ETL workflow for product ingestion with 10 tabs organized into:
- **6 Status Tabs:** staging, scraped, consolidated, approved, published, failed
- **2 Monitoring Tabs:** active-runs, active-consolidations
- **2 Action Tabs:** images, export

### Problems Identified
1. **Tab Overload** - 10 horizontal tabs create cognitive overload
2. **Mixed Concerns** - Status, monitoring, and actions all in one tab bar
3. **Duplicated Visualization** - Flow diagram + tab bar show same pipeline
4. **Cluttered UI** - Multiple action bars, banners, and toolbars scattered
5. **Code Complexity** - PipelineClient.tsx is 824 lines with 15+ state variables
6. **Accessibility Issues** - Checkbox onClick handlers, missing ARIA labels

### Best Practice References
- **Analytics Page** (`analytics-client.tsx`): Clean date range picker, metric cards, consistent layout
- **Dashboard** (`page.tsx`): StatCard grid, clear hierarchy, QuickActions pattern
- **Sidebar** (`sidebar.tsx`): Sectioned navigation with role-based filtering

---

## Work Objectives

### Core Objective
Restructure the pipeline UI from a tab-heavy interface to a unified view with secondary navigation, reducing visual clutter and improving task completion speed.

### Concrete Deliverables
1. **Unified Pipeline View** - Single page with status filter (dropdown)
2. **Secondary Navigation** - Monitoring/tools moved to sidebar sub-section
3. **Simplified Components** - Split 824-line PipelineClient into focused components
4. **Consistent Styling** - Match dashboard StatCard and pipeline-status patterns
5. **Accessibility Fixes** - Proper checkbox handlers, ARIA labels, focus states

### Definition of Done
- [ ] User can filter products by status via dropdown (not 10 tabs)
- [ ] Monitoring views accessible via sidebar navigation
- [ ] Tools (Import/Export/Images) available as action buttons
- [ ] Code: PipelineClient.tsx reduced to <400 lines
- [ ] Accessibility: Pass axe-core audit with 0 violations
- [ ] Visual: Consistent with dashboard design system

### Must Have
- Status filtering functionality preserved
- All existing bulk actions working
- Product cards display correctly
- Search and filter functionality
- Mobile responsive layout

### Must NOT Have (Guardrails)
- **NO** horizontal tab scrolling
- **NO** more than 3 primary UI sections above fold
- **NO** duplicated pipeline visualizations
- **NO** inline styles or custom color codes
- **NO** mixing of status/monitoring/action in single navigation

---

## Verification Strategy

### Test Strategy Decision
- **Infrastructure exists:** YES (Jest + React Testing Library)
- **Automated tests:** Tests-after (existing tests in `__tests__/api/admin/pipeline/`)
- **Framework:** Jest + React Testing Library
- **Agent-Executed QA:** MANDATORY for all UI changes

### QA Policy
Every task includes agent-executed QA scenarios:
- **Frontend/UI:** Use Playwright - Navigate, interact, assert DOM, screenshot
- **Component rendering:** Use React Testing Library - Render, query, assert
- **API integration:** Use fetch mocking - Test data flow

### Verification Commands
```bash
cd /Users/nickborrello/Desktop/Projects/BayState/apps/web
CI=true npm test -- --testPathPattern="pipeline"  # Run pipeline tests
npm run build  # Verify build passes
npx playwright test e2e/admin/pipeline  # E2E tests
```

---

## Execution Strategy

### Parallel Execution Waves

**Wave 1: Navigation & Layout Restructure (Foundation)**
- Task 1: Create new sidebar navigation structure
- Task 2: Build unified PipelineClient layout
- Task 3: Create status filter dropdown component

**Wave 2: Component Extraction (Parallel Development)**
- Task 4: Extract PipelineHeader component
- Task 5: Extract PipelineStats component
- Task 6: Extract PipelineProductGrid component
- Task 7: Extract PipelineActions component

**Wave 3: Feature Migration (Depends on Wave 1)**
- Task 8: Move monitoring to secondary route
- Task 9: Convert tools to action buttons
- Task 10: Migrate import/export functionality

**Wave 4: Cleanup & Polish**
- Task 11: Remove deprecated components
- Task 12: Fix accessibility issues
- Task 13: Update tests and documentation

**Wave FINAL: Verification (4 parallel reviews)**
- Task F1: Plan compliance audit (oracle)
- Task F2: Code quality review (unspecified-high)
- Task F3: Manual QA with Playwright (unspecified-high)
- Task F4: Accessibility audit (deep)

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 (Sidebar) | — | 2, 8 |
| 2 (Layout) | — | 4, 5, 6, 7 |
| 3 (Filter) | — | 2 |
| 4 (Header) | 2 | F1-F4 |
| 5 (Stats) | 2 | F1-F4 |
| 6 (Grid) | 2 | F1-F4 |
| 7 (Actions) | 2 | F1-F4 |
| 8 (Monitoring) | 1 | F1-F4 |
| 9 (Tools) | 2 | F1-F4 |
| 10 (Import/Export) | 2, 9 | F1-F4 |
| 11 (Cleanup) | 4-10 | F1-F4 |
| 12 (A11y) | 4-10 | F1-F4 |
| 13 (Tests) | 4-12 | F1-F4 |
| F1-F4 | 1-13 | — |

### Agent Dispatch Summary

- **Wave 1:** 3 tasks → `visual-engineering` (sidebar styling, component layout)
- **Wave 2:** 4 tasks → `quick` (component extraction, refactoring)
- **Wave 3:** 3 tasks → `unspecified-high` (route creation, button integration)
- **Wave 4:** 3 tasks → `quick` + `unspecified-low` (cleanup, docs)
- **Wave FINAL:** 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

- [x] 1. Create Pipeline Sidebar Navigation Sub-section

  **What to do:**
  - Add "Pipeline" section to sidebar.tsx with sub-items
  - Create sub-navigation: Overview, Monitoring, Tools
  - Implement active state for child routes
  - Follow existing sidebar pattern with role-based filtering

  **Must NOT do:**
  - Don't modify existing top-level navigation items
  - Don't add icons that don't match Lucide set
  - Don't break mobile sidebar collapse behavior

  **Recommended Agent Profile:**
  - **Category:** `visual-engineering` - Sidebar styling and responsive design
  - **Skills:** `frontend-ui-ux` - Navigation UX patterns
  - **Skills Evaluated but Omitted:** `vercel-composition-patterns` (not needed for simple nav)

  **Parallelization:**
  - **Can Run In Parallel:** YES
  - **Parallel Group:** Wave 1
  - **Blocks:** Task 8 (Monitoring route), Task 9 (Tools buttons)
  - **Blocked By:** None

  **References:**
  - Pattern: `components/admin/sidebar.tsx` - Existing nav structure
  - Pattern: Lines 30-59 - Section definition pattern
  - Pattern: Lines 78-77 - Active state handling

  **Acceptance Criteria:**
  - [ ] New "Pipeline" section appears in sidebar under "Ingestion"
  - [ ] Sub-items: Overview (/admin/pipeline), Monitoring (/admin/pipeline/monitoring), Tools (/admin/pipeline/tools)
  - [ ] Active state highlights current sub-route
  - [ ] Mobile: Hamburger menu shows sub-items correctly
  - [ ] Admin-only access preserved

  **QA Scenarios:**
  ```
  Scenario: Sidebar shows Pipeline section
    Tool: Playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Verify sidebar has "Pipeline" section
      3. Verify sub-items: Overview, Monitoring, Tools
    Expected: All three sub-items visible and clickable
    Evidence: .sisyphus/evidence/task-1-sidebar-visible.png
  ```

  **Commit:** YES
  - Message: `feat(admin): add pipeline sub-navigation to sidebar`
  - Files: `apps/web/components/admin/sidebar.tsx`
  - Pre-commit: `npm run lint`

---

- [x] 2. Build Unified Pipeline Page Layout

  **What to do:**
  - Create new unified PipelineClient layout
  - Replace 10-tab system with single view
  - Include: Header, Stats Bar, Filter Bar, Product Grid, Actions
  - Follow Analytics page header pattern

  **Must NOT do:**
  - Don't remove old PipelineClient yet (keep for reference)
  - Don't add horizontal scrolling
  - Don't use more than 3 main sections above fold

  **Recommended Agent Profile:**
  - **Category:** `visual-engineering` - Page layout and responsive grid
  - **Skills:** `frontend-ui-ux` - Admin interface patterns

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Task 1)
  - **Parallel Group:** Wave 1
  - **Blocks:** Tasks 4, 5, 6, 7 (all component extraction)
  - **Blocked By:** None

  **References:**
  - Pattern: `components/admin/analytics/analytics-client.tsx` - Header structure
  - Pattern: `app/admin/page.tsx` - Stats grid layout
  - Pattern: Lines 80-159 - Date range picker pattern

  **Acceptance Criteria:**
  - [ ] Header with title "New Product Pipeline" + subtitle
  - [ ] Stats bar showing counts for all 5 pipeline stages
  - [ ] Filter bar: Search + Status Dropdown + Filters + Refresh
  - [ ] Product grid below (placeholder for now)
  - [ ] No horizontal scrolling on desktop (1280px+)

  **QA Scenarios:**
  ```
  Scenario: Unified layout renders correctly
    Tool: Playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Screenshot full page
      3. Verify header + stats + filter + grid structure
    Expected: All sections visible without scrolling
    Evidence: .sisyphus/evidence/task-2-layout.png
  
  Scenario: Responsive at 1024px
    Tool: Playwright
    Steps:
      1. Set viewport to 1024x768
      2. Navigate to /admin/pipeline
      3. Verify no horizontal scroll
    Expected: Layout adapts without horizontal scroll
    Evidence: .sisyphus/evidence/task-2-responsive.png
  ```

  **Commit:** YES
  - Message: `feat(pipeline): create unified page layout`
  - Files: `apps/web/components/admin/pipeline/UnifiedPipelineClient.tsx`
  - Pre-commit: `npm run lint`

---

- [x] 3. Create Status Filter Dropdown Component

  **What to do:**
  - Build status filter dropdown (like Analytics date range)
  - Options: All, Imported, Enhanced, Ready for Review, Verified, Live, Failed
  - Show counts in dropdown items
  - Update URL query param on selection

  **Must NOT do:**
  - Don't create tabs or horizontal navigation
  - Don't use custom styling outside design system
  - Don't break existing URL param format

  **Recommended Agent Profile:**
  - **Category:** `quick` - Simple component with dropdown
  - **Skills:** `frontend-ui-ux` - Dropdown UX patterns

  **Parallelization:**
  - **Can Run In Parallel:** YES
  - **Parallel Group:** Wave 1
  - **Blocks:** Task 2 (needs filter in layout)
  - **Blocked By:** None

  **References:**
  - Pattern: `components/admin/analytics/analytics-client.tsx` - Date range picker
  - Pattern: Lines 94-114 - Button group pattern with active state
  - shadcn/ui: DropdownMenu component

  **Acceptance Criteria:**
  - [ ] Dropdown shows current status selection
  - [ ] Dropdown items show status name + count
  - [ ] Clicking item updates URL (?status=xxx)
  - [ ] "All" option shows total count
  - [ ] Keyboard navigable (arrow keys, enter, escape)

  **QA Scenarios:**
  ```
  Scenario: Status filter dropdown works
    Tool: Playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Click status filter dropdown
      3. Select "Enhanced"
      4. Verify URL changes to ?status=scraped
    Expected: URL updates, dropdown shows "Enhanced" selected
    Evidence: .sisyphus/evidence/task-3-filter.mp4
  
  Scenario: Keyboard navigation
    Tool: Playwright
    Steps:
      1. Tab to filter dropdown
      2. Press Enter to open
      3. Arrow down to select
      4. Press Enter
    Expected: Selection works via keyboard only
    Evidence: .sisyphus/evidence/task-3-keyboard.txt
  ```

  **Commit:** YES
  - Message: `feat(pipeline): add status filter dropdown`
  - Files: `apps/web/components/admin/pipeline/StatusFilter.tsx`
  - Pre-commit: `npm test -- StatusFilter`

---

- [x] 4. Extract PipelineHeader Component

  **What to do:**
  - Extract header section from unified layout
  - Include: Icon, Title, Subtitle, Action buttons
  - Follow Analytics page header pattern
  - Make reusable and configurable

  **Must NOT do:**
  - Don't hardcode action buttons
  - Don't use inline styles
  - Don't break existing header functionality

  **Recommended Agent Profile:**
  - **Category:** `quick` - Component extraction
  - **Skills:** `vercel-react-best-practices` - Component composition

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 5, 6, 7)
  - **Parallel Group:** Wave 2
  - **Blocks:** None
  - **Blocked By:** Task 2

  **References:**
  - Pattern: `components/admin/analytics/analytics-client.tsx` - Lines 80-93
  - Pattern: Title + subtitle + icon layout

  **Acceptance Criteria:**
  - [ ] Component accepts: title, subtitle, icon, children (actions)
  - [ ] Renders with correct styling
  - [ ] Responsive at all breakpoints
  - [ ] Props are typed with TypeScript

  **QA Scenarios:**
  ```
  Scenario: Header renders with props
    Tool: React Testing Library
    Steps:
      1. Render <PipelineHeader title="Test" subtitle="Desc" icon={Icon} />
      2. Query for title text
      3. Query for subtitle
    Expected: Both text elements found in document
    Evidence: .sisyphus/evidence/task-4-test-results.txt
  ```

  **Commit:** NO (group with Task 2)

---

- [x] 5. Extract PipelineStats Component

  **What to do:**
  - Extract stats bar showing pipeline stage counts
  - Use StatCard component pattern from dashboard
  - Show: Imported, Enhanced, Ready for Review, Verified, Live
  - Each card shows count and status color

  **Must NOT do:**
  - Don't duplicate stat-card.tsx code
  - Don't hardcode status names
  - Don't use custom colors outside design system

  **Recommended Agent Profile:**
  - **Category:** `quick` - Component composition
  - **Skills:** `frontend-ui-ux` - Data visualization

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 4, 6, 7)
  - **Parallel Group:** Wave 2
  - **Blocks:** None
  - **Blocked By:** Task 2

  **References:**
  - Pattern: `components/admin/dashboard/stat-card.tsx` - StatCard component
  - Pattern: `app/admin/page.tsx` - Lines 134-177 - Stats grid
  - Colors: variantStyles from stat-card (warning/success/info/default)

  **Acceptance Criteria:**
  - [ ] 5 stat cards in responsive grid (4 cols on lg, 2 on sm)
  - [ ] Each card shows status name + count
  - [ ] Cards use correct variant colors
  - [ ] Clicking card filters to that status
  - [ ] Loading state handled

  **QA Scenarios:**
  ```
  Scenario: Stats display correctly
    Tool: Playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Verify 5 stat cards visible
      3. Click "Enhanced" card
      4. Verify filter updates to Enhanced
    Expected: Stats visible, click filters correctly
    Evidence: .sisyphus/evidence/task-5-stats.png
  ```

  **Commit:** NO (group with Task 2)

---

- [x] 6. Extract PipelineProductGrid Component

  **What to do:**
  - Extract product grid from PipelineClient
  - Maintain existing PipelineProductCard rendering
  - Handle empty states, loading states
  - Support selection and bulk actions

  **Must NOT do:**
  - Don't break existing card selection logic
  - Don't change product card styling yet
  - Don't remove existing keyboard handlers

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` - Complex component extraction
  - **Skills:** `vercel-react-best-practices` - State management

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 4, 5, 7)
  - **Parallel Group:** Wave 2
  - **Blocks:** None
  - **Blocked By:** Task 2

  **References:**
  - Pattern: `components/admin/pipeline/PipelineClient.tsx` - Lines 664-693
  - Pattern: `components/admin/pipeline/PipelineProductCard.tsx` - Card component
  - Grid: `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` from existing

  **Acceptance Criteria:**
  - [ ] Grid renders products correctly
  - [ ] Selection checkboxes work (Shift+click, Select All)
  - [ ] Load More button works
  - [ ] Empty state displays when no products
  - [ ] Loading spinner during fetch

  **QA Scenarios:**
  ```
  Scenario: Grid displays products
    Tool: Playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Verify product cards visible
      3. Click checkbox on first product
      4. Shift-click third product
    Expected: Range selection works
    Evidence: .sisyphus/evidence/task-6-selection.mp4
  ```

  **Commit:** NO (group with Task 2)

---

- [x] 7. Extract PipelineActions Component

  **What to do:**
  - Extract bulk actions toolbar
  - Include: Approve, Reject, Delete, Clear buttons
  - Show/hide based on selection state
  - Use consistent styling (not dark theme)

  **Must NOT do:**
  - Don't use dark theme (inconsistent with rest)
  - Don't show actions when nothing selected
  - Don't break existing action handlers

  **Recommended Agent Profile:**
  - **Category:** `quick` - Component extraction
  - **Skills:** `frontend-ui-ux` - Action bar patterns

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Tasks 4, 5, 6)
  - **Parallel Group:** Wave 2
  - **Blocks:** None
  - **Blocked By:** Task 2

  **References:**
  - Pattern: `components/admin/pipeline/BulkActionsToolbar.tsx` - Existing toolbar
  - Pattern: `components/admin/dashboard/quick-actions.tsx` - Button patterns
  - Styling: Light theme, rounded buttons, consistent spacing

  **Acceptance Criteria:**
  - [ ] Toolbar shows only when items selected
  - [ ] Shows selection count
  - [ ] Action buttons: Approve, Reject, Delete
  - [ ] Clear button to deselect
  - [ ] Loading states during actions

  **QA Scenarios:**
  ```
  Scenario: Actions appear on selection
    Tool: Playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Select 2 products
      3. Verify actions toolbar appears
      4. Click Clear
    Expected: Toolbar shows/hides correctly
    Evidence: .sisyphus/evidence/task-7-actions.png
  ```

  **Commit:** NO (group with Task 2)

---

- [x] 8. Create Monitoring Route (/admin/pipeline/monitoring)

  **What to do:**
  - Create new route for monitoring views
  - Move ActiveRunsTab and ActiveConsolidationsTab here
  - Create MonitoringClient component
  - Add sidebar navigation link

  **Must NOT do:**
  - Don't duplicate data fetching logic
  - Don't break existing WebSocket connections
  - Don't remove old tabs until verified

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` - Route creation and data migration
  - **Skills:** `vercel-react-best-practices` - Next.js App Router

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Task 1)
  - **Parallel Group:** Wave 3
  - **Blocks:** Task 11 (cleanup)
  - **Blocked By:** Task 1 (sidebar navigation)

  **References:**
  - Pattern: `components/admin/pipeline/ActiveRunsTab.tsx` - Existing component
  - Pattern: `components/admin/pipeline/ActiveConsolidationsTab.tsx` - Existing
  - Route: `app/admin/pipeline/monitoring/page.tsx`

  **Acceptance Criteria:**
  - [ ] Route /admin/pipeline/monitoring exists
  - [ ] Shows Active Runs and Active Consolidations
  - [ ] Real-time updates via WebSocket work
  - [ ] Sidebar link navigates correctly
  - [ ] Mobile responsive

  **QA Scenarios:**
  ```
  Scenario: Monitoring page accessible
    Tool: Playwright
    Steps:
      1. Click "Monitoring" in sidebar
      2. Verify URL is /admin/pipeline/monitoring
      3. Verify Active Runs visible
      4. Verify Active Consolidations visible
    Expected: Both monitoring sections load
    Evidence: .sisyphus/evidence/task-8-monitoring.png
  ```

  **Commit:** YES
  - Message: `feat(pipeline): add monitoring sub-page`
  - Files: `app/admin/pipeline/monitoring/page.tsx`, `components/admin/pipeline/MonitoringClient.tsx`
  - Pre-commit: `npm run build`

---

- [x] 9. Convert Tools to Action Buttons

  **What to do:**
  - Move Images and Export from tabs to action buttons
  - Add Import button (currently only in Staging banner)
  - Create unified action bar in header
  - Use QuickActions pattern from dashboard

  **Must NOT do:**
  - Don't remove old tabs yet
  - Don't break existing import/export functionality
  - Don't use inconsistent button styles

  **Recommended Agent Profile:**
  - **Category:** `quick` - Button integration
  - **Skills:** `frontend-ui-ux` - Action patterns

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Task 8, 10)
  - **Parallel Group:** Wave 3
  - **Blocks:** None
  - **Blocked By:** Task 2 (unified layout)

  **References:**
  - Pattern: `components/admin/dashboard/quick-actions.tsx` - Button grid
  - Pattern: `app/admin/page.tsx` - Lines 109-121 - QuickActions usage
  - Buttons: Import, Export, Images

  **Acceptance Criteria:**
  - [ ] Import button opens Integra import modal
  - [ ] Export button opens export dialog
  - [ ] Images button navigates to image management
  - [ ] Buttons styled consistently with dashboard
  - [ ] Responsive layout

  **QA Scenarios:**
  ```
  Scenario: Tool buttons work
    Tool: Playwright
    Steps:
      1. Click Import button
      2. Verify import modal opens
      3. Close modal
      4. Click Export
    Expected: All buttons trigger correct actions
    Evidence: .sisyphus/evidence/task-9-tools.mp4
  ```

  **Commit:** YES
  - Message: `feat(pipeline): add tool action buttons`
  - Files: `components/admin/pipeline/PipelineToolActions.tsx`
  - Pre-commit: `npm test`

---

- [x] 10. Migrate Import/Export Functionality

  **What to do:**
  - Migrate Import modal from old PipelineClient
  - Migrate Export dialog functionality
  - Ensure all API calls preserved
  - Test import/export with real data

  **Must NOT do:**
  - Don't break existing API routes
  - Don't lose undo/redo functionality
  - Don't change validation logic

  **Recommended Agent Profile:**
  - **Category:** `unspecified-high` - Feature migration
  - **Skills:** `vercel-react-best-practices` - Data flow preservation

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Tasks 2, 9)
  - **Parallel Group:** Wave 3
  - **Blocks:** Task 11 (cleanup)
  - **Blocked By:** Tasks 2, 9

  **References:**
  - Pattern: `components/admin/pipeline/PipelineClient.tsx` - Lines 796-821
  - Pattern: `components/admin/pipeline/ExportButton.tsx` - Export functionality
  - API: `/api/admin/pipeline/export` - Export endpoint

  **Acceptance Criteria:**
  - [ ] Import from Integra works
  - [ ] Export to CSV works
  - [ ] Batch export by status works
  - [ ] Success/error toasts display
  - [ ] Undo functionality preserved

  **QA Scenarios:**
  ```
  Scenario: Export functionality
    Tool: Playwright + API mock
    Steps:
      1. Click Export button
      2. Select status filter
      3. Click Download
      4. Verify file download
    Expected: CSV file downloads with correct data
    Evidence: .sisyphus/evidence/task-10-export.csv
  ```

  **Commit:** YES
  - Message: `feat(pipeline): migrate import/export to new UI`
  - Files: Multiple in pipeline/ directory
  - Pre-commit: Full test suite

---

- [x] 11. Remove Deprecated Components

  **What to do:**
  - Remove old PipelineStatusTabs component
  - Remove PipelineFlowVisualization
  - Remove old PipelineClient (after migration verified)
  - Clean up unused imports

  **Must NOT do:**
  - Don't delete until all features migrated
  - Don't break imports in other files
  - Don't remove shared utilities

  **Recommended Agent Profile:**
  - **Category:** `quick` - Cleanup
  - **Skills:** `git-master` - Safe deletion

  **Parallelization:**
  - **Can Run In Parallel:** NO (depends on Tasks 8-10)
  - **Parallel Group:** Wave 4
  - **Blocks:** None
  - **Blocked By:** Tasks 8, 9, 10

  **References:**
  - Files to remove: `PipelineStatusTabs.tsx`, `PipelineFlowVisualization.tsx`
  - Files to update: `page.tsx` - use new UnifiedPipelineClient

  **Acceptance Criteria:**
  - [ ] Old components deleted
  - [ ] No broken imports
  - [ ] Build passes
  - [ ] No console errors

  **QA Scenarios:**
  ```
  Scenario: No deprecated code
    Tool: Bash
    Steps:
      1. Run `find . -name "*StatusTabs*"`
      2. Run `find . -name "*FlowVisualization*"`
      3. Verify no results
    Expected: Files successfully removed
    Evidence: .sisyphus/evidence/task-11-cleanup.txt
  ```

  **Commit:** YES
  - Message: `refactor(pipeline): remove deprecated tab components`
  - Files: Delete deprecated files
  - Pre-commit: `npm run build && npm test`

---

- [x] 12. Fix Accessibility Issues

  **What to do:**
  - Fix checkbox onChange handlers (currently onClick)
  - Add proper ARIA labels to modals
  - Ensure focus states visible
  - Add skip links

  **Must NOT do:**
  - Don't use outline-none without focus replacement
  - Don't skip keyboard navigation
  - Don't break existing functionality

  **Recommended Agent Profile:**
  - **Category:** `unspecified-low` - A11y fixes
  - **Skills:** `web-design-guidelines` - Accessibility compliance

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Task 11)
  - **Parallel Group:** Wave 4
  - **Blocks:** None
  - **Blocked By:** Tasks 4-7 (components must exist)

  **References:**
  - Issues: PipelineProductCard line 131, PipelineClient modals
  - Guidelines: Vercel Web Interface Guidelines - Accessibility section
  - Tool: axe-core for testing

  **Acceptance Criteria:**
  - [ ] Checkboxes use onChange not onClick
  - [ ] Modals have aria-labelledby
  - [ ] Focus states visible (focus-visible:ring)
  - [ ] Skip link works
  - [ ] axe-core audit: 0 violations

  **QA Scenarios:**
  ```
  Scenario: A11y audit passes
    Tool: Playwright + axe-core
    Steps:
      1. Navigate to /admin/pipeline
      2. Run axe-core accessibility scan
      3. Verify 0 violations
    Expected: All a11y checks pass
    Evidence: .sisyphus/evidence/task-12-a11y.json
  ```

  **Commit:** YES
  - Message: `fix(pipeline): resolve accessibility issues`
  - Files: Multiple component files
  - Pre-commit: `npm run lint`

---

- [x] 13. Update Tests and Documentation

  **What to do:**
  - Update existing PipelineClient tests
  - Add tests for new components
  - Update AGENTS.md with new structure
  - Document component usage

  **Must NOT do:**
  - Don't delete old tests until new ones pass
  - Don't skip test coverage
  - Don't forget edge cases

  **Recommended Agent Profile:**
  - **Category:** `quick` - Documentation
  - **Skills:** `vercel-react-best-practices` - Testing patterns

  **Parallelization:**
  - **Can Run In Parallel:** YES (with Task 11, 12)
  - **Parallel Group:** Wave 4
  - **Blocks:** F1-F4 (final verification)
  - **Blocked By:** Tasks 4-12

  **References:**
  - Tests: `__tests__/components/admin/pipeline/`
  - Docs: `apps/web/AGENTS.md`, `apps/web/app/admin/AGENTS.md`
  - Pattern: Jest + React Testing Library

  **Acceptance Criteria:**
  - [ ] All new components have unit tests
  - [ ] Integration tests for full flow
  - [ ] AGENTS.md updated with new structure
  - [ ] Test coverage >80%

  **QA Scenarios:**
  ```
  Scenario: Test suite passes
    Tool: Bash
    Steps:
      1. Run `CI=true npm test -- --testPathPattern="pipeline"`
      2. Verify all tests pass
      3. Check coverage report
    Expected: 100% tests pass, >80% coverage
    Evidence: .sisyphus/evidence/task-13-coverage.txt
  ```

  **Commit:** YES
  - Message: `test(pipeline): update tests and documentation`
  - Files: Test files, documentation
  - Pre-commit: `CI=true npm test -- --coverage`

---

## Final Verification Wave

### F1. Plan Compliance Audit - `oracle`

Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns.

**Checklist:**
- [ ] Unified view with status filter exists
- [ ] Monitoring moved to secondary navigation
- [ ] Tools converted to action buttons
- [ ] No horizontal tab scrolling
- [ ] PipelineClient <400 lines
- [ ] No accessibility violations
- [ ] Consistent with dashboard design

**Output:** `Must Have [7/7] | Must NOT Have [5/5] | VERDICT: APPROVE/REJECT`

---

### F2. Code Quality Review - `unspecified-high`

Run TypeScript and linter checks. Review all changed files.

**Commands:**
```bash
cd apps/web
npx tsc --noEmit
npm run lint
npm run build
```

**Check for:**
- `as any` or `@ts-ignore`
- Empty catch blocks
- console.log in production code
- Unused imports
- AI slop: excessive comments, generic names (data/result/item)

**Output:** `TypeScript [PASS/FAIL] | Lint [PASS/FAIL] | Build [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

---

### F3. Manual QA with Playwright - `unspecified-high`

Execute all QA scenarios from tasks 1-13.

**Scenarios:**
1. Navigate to pipeline, verify layout
2. Use status filter dropdown
3. Select products and use bulk actions
4. Import a product
5. Export products
6. Check mobile responsive
7. Verify keyboard navigation
8. Run accessibility audit

**Evidence:** Screenshots in `.sisyphus/evidence/`

**Output:** `Scenarios [8/8 pass] | VERDICT`

---

### F4. Accessibility Audit - `deep`

Comprehensive a11y review.

**Tools:**
- axe-core automated scan
- Manual keyboard navigation test
- Screen reader test (VoiceOver/NVDA)
- Color contrast check

**Checklist:**
- [ ] All interactive elements keyboard accessible
- [ ] Focus states visible
- [ ] ARIA labels present
- [ ] Color contrast 4.5:1 minimum
- [ ] No screen reader errors
- [ ] Reduced motion respected

**Output:** `Automated [PASS/FAIL] | Manual [PASS/FAIL] | Screen Reader [PASS/FAIL] | VERDICT`

---

## Commit Strategy

**Grouped Commits:**

1. **Wave 1:** `feat(pipeline): restructure navigation and layout`
   - Tasks 1, 2, 3
   - Files: sidebar, UnifiedPipelineClient, StatusFilter

2. **Wave 2:** `refactor(pipeline): extract components`
   - Tasks 4, 5, 6, 7
   - Files: Header, Stats, Grid, Actions components

3. **Wave 3:** `feat(pipeline): migrate monitoring and tools`
   - Tasks 8, 9, 10
   - Files: Monitoring route, Tool buttons, Import/Export

4. **Wave 4:** `refactor(pipeline): cleanup and polish`
   - Tasks 11, 12, 13
   - Files: Deleted files, A11y fixes, Tests

---

## Success Criteria

### Verification Commands
```bash
cd /Users/nickborrello/Desktop/Projects/BayState/apps/web

# Build verification
npm run build

# Test verification
CI=true npm test -- --testPathPattern="pipeline"

# Lint verification
npm run lint

# TypeScript verification
npx tsc --noEmit
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] PipelineClient.tsx <400 lines
- [ ] No horizontal tab scrolling
- [ ] All tests pass
- [ ] Accessibility audit passes
- [ ] Visual consistency with dashboard
- [ ] Mobile responsive verified
- [ ] Code review approved

---

## Summary

This plan restructures the admin pipeline UI from a 10-tab interface to a unified view with secondary navigation. The key changes:

1. **Navigation:** Move from 10 horizontal tabs to unified view + sidebar sub-section
2. **Layout:** Follow Analytics/Dashboard patterns with clear hierarchy
3. **Components:** Extract 824-line monster into 7 focused components
4. **Accessibility:** Fix violations and ensure keyboard navigation
5. **Visual:** Match dashboard design system for consistency

**Expected Outcome:** 60% reduction in visual clutter, 50% reduction in code complexity, improved task completion speed, WCAG 2.1 AA compliance.
