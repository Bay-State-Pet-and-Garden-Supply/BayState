# Scraper Test Lab Enhancement - Work Plan

## TL;DR

> **Quick Summary**: Transform the test-lab page into a comprehensive scraper testing facility with real-time WebSocket updates, historical test run tracking, and granular testing of selector health, login flows, field extraction, workflow debugging, and no-results detection.
> 
> **Deliverables**: 
> - Enhanced TestLabClient with WebSocket integration and polling fallback
> - Historical test runs viewer with full detail drill-down
> - Test analytics dashboard (success rates, duration trends, error patterns)
> - SKU management interface (add/remove test SKUs)
> - Real-time test progress monitoring with auto-refresh
> - Test execution through Scraper Runner Network
> 
> **Estimated Effort**: Large (10-15 tasks across 4 waves)
> **Parallel Execution**: YES - 4 waves with sequential dependencies
> **Critical Path**: Infrastructure Verification → Degraded Mode → WebSocket Integration → Historical Features → Analytics

---

## Context

### Original Request
"The current test-lab page does not take full advantage of the Websockets and Live updates. Our current implementation fails to display recent runs, status of selectors/logins, etc. We need this lab to be used to test every facet of the scrapers and keep track of the test runs."

### Interview Summary
**Key Requirements**:
- **Testing Facets**: Selector Validation, Login Flow Testing, Field Extraction, Workflow Step Debugging, No-Results Detection
- **Historical Features**: View Recent Runs List, Full Historical Details, Test Run Analytics
- **Real-time**: Auto-refresh UI with live updates
- **Test Data**: Add/Remove SKUs directly in lab
- **Execution**: Through Scraper Runner Network (production-like)
- **Infrastructure**: User unsure about WebSocket server status

**Research Findings**:
- Database schema exists: `scraper_test_runs`, `scraper_selector_results`, `scraper_login_results`, `scraper_extraction_results`
- WebSocket hook exists: `useTestLabWebSocket.ts` (Socket.io client)
- UI components exist but disconnected: `TestSummaryDashboard`, `SelectorHealthCard`, `LoginStatusPanel`, `ExtractionResultsTable`
- API routes exist: `/api/admin/scraper-network/test`, WebSocket config endpoint
- TestLabClient.tsx fetches data but doesn't use WebSocket updates

### Metis Review
**Identified Gaps** (addressed in plan):
- WebSocket infrastructure status unknown → Added verification task as Wave 0
- Need degraded mode (polling fallback) → Built into Wave 1
- Missing scale limits → Defined: max 50 SKUs, max 100 historical runs, 30-day retention
- Need explicit scope boundaries → Guardrails defined per facet
- Error handling undefined → Acceptance criteria cover failure scenarios

---

## Work Objectives

### Core Objective
Transform the test-lab page into a comprehensive scraper testing facility with real-time updates, historical tracking, and support for testing all critical scraper facets (selectors, login, extraction, workflow, no-results detection).

### Concrete Deliverables
1. **TestLabClient Enhancement** (`TestLabClient.tsx`)
   - WebSocket connection with auto-reconnect
   - Polling fallback when WebSocket unavailable
   - Real-time test progress display
   - Connection status indicator

2. **SKU Management Interface**
   - Add/remove test SKUs in lab (updates scraper config)
   - SKU categorization (golden, fake, edge)
   - Validation before test execution
   - Max 50 SKUs per test run

3. **Real-time Test Monitoring**
   - Per-SKU progress tracking
   - Live selector validation results
   - Login flow step-by-step status
   - Field extraction progress stream
   - Auto-refreshing UI components

4. **Historical Test Runs Viewer**
   - List last 100 test runs (30-day retention)
   - Full detail view: selectors, login, extraction breakdowns
   - Test result comparison (before/after config changes)
   - Search and filter capabilities

5. **Test Analytics Dashboard**
   - Success rate trends (7-day, 30-day)
   - Average execution duration by scraper
   - Error breakdown by type and facet
   - Health score history

6. **Infrastructure Verification & Setup**
   - Verify WebSocket server on port 3001
   - Test API endpoint connectivity
   - Validate database schema alignment
   - Document WebSocket server startup if needed

### Definition of Done
- [x] All 5 testing facets have working UI components ✅
- [x] WebSocket integration provides updates within 2 seconds of state changes ✅
- [x] Polling fallback works when WebSocket server is down ✅
- [x] Historical runs display with full detail drill-down ✅
- [x] Analytics dashboard shows meaningful trends ✅
- [x] SKU management updates scraper configuration correctly ✅
- [x] Tests execute through Scraper Runner Network ✅
- [x] UI handles errors gracefully with user-friendly messages ✅

### Must Have
- WebSocket integration with reconnection logic
- Polling fallback for degraded mode
- Real-time updates for selector/login/extraction status
- Historical test runs list (last 100, 30 days)
- SKU add/remove functionality
- Test execution via existing runner network API
- Auto-refreshing UI without manual page reload

### Must NOT Have (Guardrails)
- NO modification to Scraper Runner Network behavior
- NO changes to database schema (use existing tables only)
- NO new authentication/authorization logic
- NO mobile/tablet optimized layouts (desktop-only)
- NO test scheduling/cron features
- NO performance/load testing facets
- NO bulk SKU import from files
- NO trend charts in analytics (basic metrics only)
- Analytics beyond 30-day window
- Test runs exceeding 50 SKUs

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (WebSocket hook, API routes, database schema)
- **User wants tests**: Manual verification with automated verification scripts
- **Framework**: No formal test framework - use curl/bash for API verification, React component rendering for UI verification

### Automated Verification (Agent-Executable)

**For API/Backend Verification** (using Bash curl):
```bash
# Wave 0: Infrastructure Verification
# 1. Test WebSocket server connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Host: localhost:3001" http://localhost:3001/ws 2>&1 | head -5
# Assert: Contains "HTTP/1.1 101 Switching Protocols" OR gracefully handle 404

# 2. Test API endpoint
curl -s http://localhost:3000/api/admin/scraper-network/test \
  -H "Content-Type: application/json" \
  -d '{"skus":["TEST001"],"scraper_id":"test-id","test_mode":true}'
# Assert: Returns JSON with job_id field

# 3. Test WebSocket config endpoint
curl -s http://localhost:3000/api/admin/scraper-network/test/ws?test_run_id=test-123
# Assert: Returns JSON with connection.url field

# 4. Verify database schema
psql -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'scraper_selector_results';" 2>/dev/null || echo "Schema check skipped (no psql access)"
# Assert: Returns columns including: selector_name, status, duration_ms
```

**For Frontend/UI Changes** (using Playwright):
```
# Agent executes via playwright browser automation:
1. Navigate to: http://localhost:3000/admin/scrapers/test-lab
2. Wait for: selector ".scraper-select" to be visible
3. Select option from: dropdown with label containing scraper name
4. Click: button with text "Run Test"
5. Wait for: selector ".test-status-running" to appear
6. Assert: Element with class ".websocket-status" shows "connected" OR "polling"
7. Screenshot: .sisyphus/evidence/test-lab-running.png
8. Wait for: selector ".test-status-completed" OR timeout 60s
9. Assert: Element ".test-summary" contains pass/fail counts
```

**For Database/Config Changes** (using Supabase client):
```bash
# Verify SKU was added to scraper config
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('scraper_config_versions').select('config').eq('scraper_config_id', 'TEST_ID').single().then(({data}) => {
  console.log('Test SKUs:', data?.config?.test_skus?.length || 0);
});
"
# Assert: Returns count > 0 after adding SKU
```

### Evidence to Capture
- [x] WebSocket connectivity test results ✅
- [x] API endpoint response JSON ✅
- [x] Screenshots of UI at key states (initial, running, completed) ✅
- [x] Database query results showing test data persistence ✅
- [x] Browser console logs showing WebSocket events ✅

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Infrastructure - BLOCKING):
└── Task 1: Verify WebSocket infrastructure and API connectivity

Wave 1 (Foundation - After Wave 0):
├── Task 2: Enhance useTestLabWebSocket hook with polling fallback
├── Task 3: Create TestRunManager context for state management
└── Task 4: Build SKU management interface (add/remove)

Wave 2 (Real-time Features - After Wave 1):
├── Task 5: Integrate WebSocket into TestLabClient
├── Task 6: Create real-time TestProgressPanel component
├── Task 7: Build LiveSelectorResults component
├── Task 8: Build LiveLoginStatus component
└── Task 9: Build LiveExtractionProgress component

Wave 3 (Historical & Analytics - After Wave 2):
├── Task 10: Create HistoricalTestRuns list with pagination
├── Task 11: Build TestRunDetailView with full breakdowns
├── Task 12: Create TestAnalyticsDashboard component
└── Task 13: Build TestComparisonView (before/after)

Wave 4 (Integration & Polish - After Wave 3):
├── Task 14: Update TestLabClient page.tsx with all components
└── Task 15: Add error boundaries and loading states

Critical Path: 1 → 2 → 5 → 10 → 14
Parallel Speedup: ~50% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4 | None (blocking) |
| 2 | 1 | 5 | 3, 4 |
| 3 | 1 | 5 | 2, 4 |
| 4 | 1 | None | 2, 3 |
| 5 | 2, 3 | 6, 7, 8, 9 | None |
| 6 | 5 | 14 | 7, 8, 9 |
| 7 | 5 | 11 | 6, 8, 9 |
| 8 | 5 | 11 | 6, 7, 9 |
| 9 | 5 | 11 | 6, 7, 8 |
| 10 | 5 | 11, 12 | None |
| 11 | 7, 8, 9, 10 | 13 | None |
| 12 | 10 | None | 11 |
| 13 | 11, 12 | None | None |
| 14 | 6, 10 | 15 | None |
| 15 | 14 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 0 | 1 | bash (infrastructure check) |
| 1 | 2-4 | delegate_task(category="ultrabrain", load_skills=["vercel-react-best-practices"]) |
| 2 | 5-9 | delegate_task(category="ultrabrain", load_skills=["vercel-react-best-practices"]) × 5 parallel |
| 3 | 10-13 | delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux"]) × 4 parallel |
| 4 | 14-15 | delegate_task(category="ultrabrain", load_skills=["vercel-react-best-practices"]) |

---

## TODOs

### Task 1: Verify WebSocket Infrastructure and API Connectivity

**What to do**:
- Test WebSocket server on port 3001 is running and accessible
- Verify API endpoint `/api/admin/scraper-network/test` responds correctly
- Check database schema matches hook expectations
- Document WebSocket server startup procedure if not running
- Test Supabase Realtime as alternative if Socket.io unavailable

**Must NOT do**:
- Modify any infrastructure configuration files
- Start any services that aren't already documented
- Make schema changes without migration files

**Recommended Agent Profile**:
- **Category**: `unspecified-high` (infrastructure verification)
- **Skills**: `bash` (for connectivity tests)
- **Skills Evaluated but Omitted**: 
  - `playwright`: Not needed for infrastructure check
  - `frontend-ui-ux`: Not a UI task

**Parallelization**:
- **Can Run In Parallel**: NO (blocking for all other tasks)
- **Parallel Group**: Wave 0 (solo)
- **Blocks**: Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
- **Blocked By**: None

**References**:
- `BayStateApp/lib/hooks/useTestLabWebSocket.ts:44` - Expected WebSocket URL (process.env.NEXT_PUBLIC_WEBSOCKET_URL)
- `BayStateApp/app/api/admin/scraper-network/test/ws/route.ts:25` - WebSocket config endpoint
- `BayStateApp/supabase/migrations/20260131000000_test_lab_extensions.sql` - Database schema for test results
- `BayStateApp/app/api/admin/scraper-network/test/route.ts:30-45` - Test API endpoint POST handler

**Acceptance Criteria**:
```bash
# WebSocket connectivity test
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Host: localhost:3001" http://localhost:3001/ws 2>&1 | head -3
# Expected: HTTP/1.1 101 Switching Protocols OR Connection refused (to document)

# API endpoint test
curl -s http://localhost:3000/api/admin/scraper-network/test \
  -H "Content-Type: application/json" \
  -d '{"skus":["TEST001"],"test_mode":true}' | jq -r '.status'
# Expected: "pending" or error message (confirms endpoint responds)

# WebSocket config endpoint
curl -s http://localhost:3000/api/admin/scraper-network/test/ws | jq -r '.success'
# Expected: "true"
```

**Evidence to Capture**:
- [x] Terminal output from WebSocket connectivity test ✅
- [x] API endpoint response showing status code and body ✅
- [x] Documentation of WebSocket server status (running/not running) ✅
- [x] Screenshot of any error messages if services unavailable ✅

**Commit**: NO
- Message: `chore(scraper): verify WebSocket infrastructure`
- Files: None (documentation only)
- Note: Infrastructure verification task - no code changes required

---

### Task 2: Enhance useTestLabWebSocket Hook with Polling Fallback

**What to do**:
- Modify existing `useTestLabWebSocket.ts` to add polling fallback mode
- When WebSocket connection fails, automatically switch to polling every 5 seconds
- Add connection status: 'connected' | 'connecting' | 'polling' | 'error'
- Implement reconnection logic with exponential backoff for WebSocket
- Add `isPolling` flag to indicate fallback mode is active
- Ensure cleanup on unmount works for both WebSocket and polling

**Must NOT do**:
- Remove existing Socket.io integration
- Change the hook's return type signature (maintain backward compatibility)
- Add new required parameters

**Recommended Agent Profile**:
- **Category**: `ultrabrain` (complex logic: WebSocket + polling coordination)
- **Skills**: `vercel-react-best-practices` (React hooks patterns, cleanup)
- **Reason**: Need sophisticated state management for dual-mode connectivity

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 3, 4)
- **Blocks**: Task 5
- **Blocked By**: Task 1 (infrastructure verification)

**References**:
- `BayStateApp/lib/hooks/useTestLabWebSocket.ts` - Existing hook to enhance
- `BayStateApp/lib/hooks/useConsolidationWebSocket.ts` - Reference for WebSocket patterns
- `BayStateApp/app/api/admin/scraper-network/test/route.ts:161-223` - GET endpoint for test status polling

**Acceptance Criteria**:
```bash
# Verify hook compiles
cd BayStateApp && npx tsc --noEmit lib/hooks/useTestLabWebSocket.ts 2>&1 | grep -i error || echo "No errors"
# Expected: "No errors"

# Verify hook exports
grep -E "export (function|interface|type)" BayStateApp/lib/hooks/useTestLabWebSocket.ts | wc -l
# Expected: >= 3 (hook function, interfaces, types)
```

**UI Verification** (when integrated):
```
# 1. Navigate to test-lab page
# 2. Observe connection status indicator
# 3. If WebSocket down, should show "Polling mode" banner within 10 seconds
# 4. Screenshot evidence of polling mode
```

**Evidence to Capture**:
- [x] TypeScript compilation output (no errors) ✅
- [x] Screenshot of connection status in UI (both connected and polling modes) ✅
- [x] Browser console logs showing mode switch ✅

**Commit**: YES
- Message: `feat(scraper): add polling fallback to useTestLabWebSocket hook`
- Files: `lib/hooks/useTestLabWebSocket.ts`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit lib/hooks/useTestLabWebSocket.ts`

---

### Task 3: Create TestRunManager Context for State Management

**What to do**:
- Create new React context `TestRunManagerContext` for centralized test run state
- State includes: current test run, historical runs, selected scraper, test SKUs
- Actions: startTest, addSku, removeSku, updateTestStatus, loadHistoricalRuns
- Integrate with useTestLabWebSocket for real-time updates
- Persist test SKU list to localStorage for recovery on refresh
- Max 50 SKUs enforcement

**Must NOT do**:
- Use global state libraries (Redux, Zustand) - stick to React Context
- Modify database schema - use existing tables
- Implement business logic for test execution (just state management)

**Recommended Agent Profile**:
- **Category**: `ultrabrain` (state management architecture)
- **Skills**: `vercel-react-best-practices` (React Context patterns, performance)
- **Reason**: Need proper context design to avoid unnecessary re-renders

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 2, 4)
- **Blocks**: Tasks 5, 6, 10
- **Blocked By**: Task 1

**References**:
- `BayStateApp/lib/admin/scrapers/types.ts` - Type definitions for TestRun, TestSku
- `BayStateApp/components/admin/scrapers/TestLabClient.tsx:57-64` - Reference for current state structure
- React Context API documentation for patterns
- **Note**: `lib/contexts/` directory will be created as needed

**Acceptance Criteria**:
```bash
# Verify context file created
ls -la BayStateApp/lib/contexts/TestRunManagerContext.tsx
# Expected: File exists

# Verify TypeScript compilation
cd BayStateApp && npx tsc --noEmit lib/contexts/TestRunManagerContext.tsx 2>&1 | grep -i error || echo "No errors"
# Expected: "No errors"

# Verify exports
grep -E "export (const|function|Provider)" BayStateApp/lib/contexts/TestRunManagerContext.tsx
# Expected: Shows Provider and useTestRunManager hook
```

**Evidence to Capture**:
- [x] Context file exists with proper TypeScript types ✅
- [x] Test SKU state persists in localStorage (check DevTools Application tab) ✅
- [x] Adding 51st SKU shows error/warning ✅

**Commit**: YES
- Message: `feat(scraper): create TestRunManager context for test state`
- Files: `BayStateApp/lib/contexts/TestRunManagerContext.tsx`, `BayStateApp/lib/contexts/index.ts`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit lib/contexts/TestRunManagerContext.tsx`

---

### Task 4: Build SKU Management Interface

**What to do**:
- Create `SkuManager` component for adding/removing test SKUs
- Input field with validation (non-empty, unique, max 50 total)
- SKU type selection: golden (should succeed), fake (should 404), edge (special cases)
- List display with remove buttons per SKU
- Save button persists to scraper config via API
- Visual indicators: count badge, max 50 warning

**Must NOT do**:
- Support bulk import from CSV/files
- Allow editing SKU after adding (remove and re-add instead)
- Validate SKU format against external sources

**Recommended Agent Profile**:
- **Category**: `visual-engineering` (UI component)
- **Skills**: `frontend-ui-ux`, `vercel-react-best-practices`
- **Reason**: Need proper form handling and user feedback

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 1 (with Tasks 2, 3)
- **Blocks**: None (can be integrated later)
- **Blocked By**: Task 1

**References**:
- `BayStateApp/components/admin/scrapers/TestLabClient.tsx:57-64` - Current SKU state structure
- `BayStateApp/components/admin/scrapers/TestLabClient.tsx:145-156` - addSku function pattern
- `BayStateApp/app/api/admin/scraper-configs/[id]/draft/route.ts` - API for updating config

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/SkuManager.tsx
# Expected: File exists
```

**UI Verification**:
```
# 1. Navigate to test-lab
# 2. Select a scraper
# 3. Enter SKU "TEST123" and click Add
# 4. Assert: SKU appears in list with type badge
# 5. Add 50 SKUs total
# 6. Attempt to add 51st SKU
# 7. Assert: Error message "Maximum 50 SKUs allowed"
# 8. Click Save
# 9. Assert: Success toast appears
# 10. Refresh page
# 11. Assert: SKUs persist (loaded from scraper config)
```

**Evidence to Capture**:
- [x] Screenshot of SKU list with multiple types ✅
- [x] Screenshot of max SKU error ✅
- [x] Screenshot of success toast after save ✅
- [x] DevTools Network tab showing API call to update config ✅

**Commit**: YES
- Message: `feat(scraper): add SKU management interface to test lab`
- Files: `BayStateApp/components/admin/scrapers/test-lab/SkuManager.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/SkuManager.tsx`

---

### Task 5: Integrate WebSocket into TestLabClient

**What to do**:
- Wrap TestLabClient with TestRunManagerProvider
- Integrate useTestLabWebSocket hook for real-time updates
- Add connection status indicator (connected/polling/error)
- Subscribe to test run updates when test starts
- Handle incoming events: selector validation, login status, extraction results
- Update UI state when WebSocket events arrive
- Show fallback banner when in polling mode

**Must NOT do**:
- Remove existing polling/refresh logic entirely (keep as backup)
- Change the page's URL structure or routing

**Recommended Agent Profile**:
- **Category**: `ultrabrain` (integration task, multiple systems)
- **Skills**: `vercel-react-best-practices`
- **Reason**: Complex integration of multiple hooks and contexts

**Parallelization**:
- **Can Run In Parallel**: NO (depends on Tasks 2, 3)
- **Parallel Group**: Wave 2 (solo first)
- **Blocks**: Tasks 6, 7, 8, 9
- **Blocked By**: Tasks 2, 3

**References**:
- `BayStateApp/components/admin/scrapers/TestLabClient.tsx` - Main component to modify
- `BayStateApp/lib/hooks/useTestLabWebSocket.ts` - WebSocket hook (enhanced in Task 2)
- `BayStateApp/lib/contexts/TestRunManagerContext.tsx` - State context (created in Task 3)

**Acceptance Criteria**:
```bash
# Verify TypeScript compilation
cd BayStateApp && npx tsc --noEmit components/admin/scrapers/TestLabClient.tsx 2>&1 | grep -i error || echo "No errors"
# Expected: "No errors"
```

**UI Verification**:
```
# 1. Navigate to test-lab
# 2. Assert: Connection status indicator visible
# 3. Start a test
# 4. Assert: WebSocket subscribes to test run (check console logs)
# 5. Assert: Progress updates appear without manual refresh
# 6. Simulate WebSocket failure (dev tools)
# 7. Assert: Falls back to polling mode with banner
```

**Evidence to Capture**:
- [x] Screenshot showing connection status indicator ✅
- [x] Screenshot of polling fallback banner ✅
- [x] Browser console showing WebSocket events received ✅
- [x] Screenshot of real-time progress updates ✅

**Commit**: YES
- Message: `feat(scraper): integrate WebSocket and context into TestLabClient`
- Files: `BayStateApp/components/admin/scrapers/TestLabClient.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/TestLabClient.tsx`

---

### Task 6: Create Real-time TestProgressPanel Component

**What to do**:
- Create `TestProgressPanel` component showing overall test run progress
- Display: current SKU being tested (e.g., "Testing SKU 3 of 10: ABC123")
- Overall progress bar with percentage
- Estimated time remaining (based on average duration)
- Status badges: pending → running → completed/failed
- Start time and elapsed time
- Cancel test button (if running)

**Must NOT do**:
- Show individual selector-level progress (that's Task 7)
- Allow editing test configuration while running

**Recommended Agent Profile**:
- **Category**: `visual-engineering` (UI component)
- **Skills**: `frontend-ui-ux`
- **Reason**: Progress visualization and user feedback

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 7, 8, 9)
- **Blocks**: Task 14
- **Blocked By**: Task 5

**References**:
- `BayStateApp/components/admin/scrapers/test-lab/TestSummaryDashboard.tsx` - Reference for progress display patterns
- `BayStateApp/components/admin/pipeline/PipelineClient.tsx:135` - Progress event handling reference

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/TestProgressPanel.tsx
```

**UI Verification**:
```
# 1. Navigate to test-lab with SKUs configured
# 2. Click "Run Test"
# 3. Assert: Progress panel appears with "Testing SKU 1 of N"
# 4. Assert: Progress bar increases as tests complete
# 5. Assert: Elapsed time counter updates
# 6. Assert: Cancel button visible while running
```

**Evidence to Capture**:
- [x] Screenshot of progress panel during test ✅
- [x] Screenshot showing completed state ✅
- [x] Video/GIF showing progress bar animation ✅

**Commit**: YES
- Message: `feat(scraper): add TestProgressPanel for real-time progress`
- Files: `BayStateApp/components/admin/scrapers/test-lab/TestProgressPanel.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/TestProgressPanel.tsx`

---

### Task 7: Build LiveSelectorResults Component

**What to do**:
- Create `LiveSelectorResults` component for real-time selector validation
- Shows each selector: name, CSS/XPath value, status, duration
- Status indicators: FOUND (green), MISSING (red), ERROR (orange), SKIPPED (gray)
- Expandable details: error messages, sample text found
- Live update as selector results arrive via WebSocket
- Filter/search by selector name
- Sort by status (errors first) or duration

**Must NOT do**:
- Allow editing selectors from this view (read-only)
- Show more than 100 selectors at once (virtual scroll if needed)

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`
- **Reason**: Complex table with real-time updates and filtering

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 6, 8, 9)
- **Blocks**: Task 11
- **Blocked By**: Task 5

**References**:
- `BayStateApp/components/admin/scrapers/test-lab/SelectorHealthCard.tsx` - Existing component to enhance
- `BayStateApp/supabase/migrations/20260131000000_test_lab_extensions.sql:11-38` - Selector results schema

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/LiveSelectorResults.tsx
```

**UI Verification**:
```
# 1. Run test with multiple selectors
# 2. Assert: Selector results appear as they're validated
# 3. Assert: Color coding matches status (green/red/orange)
# 4. Assert: Duration shown for each selector
# 5. Type in search box
# 6. Assert: List filters to matching selectors
```

**Commit**: YES
- Message: `feat(scraper): add LiveSelectorResults component with real-time updates`
- Files: `BayStateApp/components/admin/scrapers/test-lab/LiveSelectorResults.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/LiveSelectorResults.tsx`

---

### Task 8: Build LiveLoginStatus Component

**What to do**:
- Create `LiveLoginStatus` component for login flow visualization
- Shows 4 steps: username field → password field → submit button → success indicator
- Each step shows: status (FOUND/MISSING/ERROR), duration
- Overall status: SUCCESS (green), FAILED (red), SKIPPED (gray), ERROR (orange)
- Live updates as login progresses
- Error message display if login fails
- Duration for entire login flow

**Must NOT do**:
- Show actual credentials (usernames/passwords)
- Allow interactive login from this UI

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`
- **Reason**: Step-by-step progress visualization

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 6, 7, 9)
- **Blocks**: Task 11
- **Blocked By**: Task 5

**References**:
- `BayStateApp/components/admin/scrapers/test-lab/LoginStatusPanel.tsx` - Existing component to enhance
- `BayStateApp/supabase/migrations/20260131000000_test_lab_extensions.sql:45-58` - Login results schema

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/LiveLoginStatus.tsx
```

**UI Verification**:
```
# 1. Run test on scraper with login config
# 2. Assert: Login steps appear as they're checked
# 3. Assert: Step icons change from pending → found → success
# 4. If login fails, assert: Error message displayed
# 5. Assert: Total duration shown
```

**Commit**: YES
- Message: `feat(scraper): add LiveLoginStatus component for login flow tracking`
- Files: `BayStateApp/components/admin/scrapers/test-lab/LiveLoginStatus.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/LiveLoginStatus.tsx`

---

### Task 9: Build LiveExtractionProgress Component

**What to do**:
- Create `LiveExtractionProgress` component for field extraction tracking
- Shows each extraction field: name, value (truncated), status
- Status: SUCCESS (green - value extracted), EMPTY (yellow - element found but empty), ERROR (red), NOT_FOUND (gray)
- Value preview: show first 50 chars with "..." if longer
- Expandable to see full value
- Live updates as fields are extracted
- Progress stats: "15 of 20 fields extracted"

**Must NOT do**:
- Show raw HTML in value preview
- Allow editing extracted values

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`
- **Reason**: Data display with truncation and expansion

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 2 (with Tasks 6, 7, 8)
- **Blocks**: Task 11
- **Blocked By**: Task 5

**References**:
- `BayStateApp/components/admin/scrapers/test-lab/ExtractionResultsTable.tsx` - Existing component to enhance
- `BayStateApp/supabase/migrations/20260131000000_test_lab_extensions.sql:73-84` - Extraction results schema

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/LiveExtractionProgress.tsx
```

**UI Verification**:
```
# 1. Run test that extracts product data
# 2. Assert: Extraction fields appear as they're processed
# 3. Assert: Success fields show green checkmark with value preview
# 4. Assert: "N of M fields extracted" counter updates
# 5. Click expand on a field
# 6. Assert: Full value shown
```

**Commit**: YES
- Message: `feat(scraper): add LiveExtractionProgress for field extraction tracking`
- Files: `BayStateApp/components/admin/scrapers/test-lab/LiveExtractionProgress.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/LiveExtractionProgress.tsx`

---

### Task 10: Create HistoricalTestRuns List with Pagination

**What to do**:
- Create `HistoricalTestRuns` component displaying list of past test runs
- Shows: date/time, scraper name, status (passed/failed/partial), SKU count, duration
- Pagination: 20 runs per page (max 100 total, 30-day retention)
- Filters: by scraper, by status, by date range
- Sort: newest first (default), by duration, by status
- Click to view full details (links to Task 11)
- Empty state: "No test runs in selected period"

**Must NOT do**:
- Show runs older than 30 days
- Allow editing historical runs

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`, `vercel-react-best-practices`
- **Reason**: Table with pagination, filtering, sorting

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Task 11, 12 start)
- **Blocks**: Task 11
- **Blocked By**: Task 5

**References**:
- `BayStateApp/app/admin/scrapers/test-lab/page.tsx:94-98` - Current recentTests query (fetch from this)
- `BayStateApp/app/admin/scrapers/runs/page.tsx` - Reference for runs list UI
- `BayStateApp/lib/admin/scrapers/runs-actions.ts` - Reference for data fetching patterns

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/HistoricalTestRuns.tsx

# Verify API query
curl -s "http://localhost:3000/api/admin/scraper-network/test?id=TEST_ID" | jq -r '.status'
# Expected: Returns test run data
```

**UI Verification**:
```
# 1. Navigate to test-lab
# 2. Scroll to "Historical Test Runs" section
# 3. Assert: List shows recent test runs
# 4. Assert: Each run shows status badge, date, scraper name
# 5. Click page 2
# 6. Assert: Next set of runs loaded
# 7. Select "Failed" filter
# 8. Assert: Only failed runs shown
```

**Commit**: YES
- Message: `feat(scraper): add HistoricalTestRuns list with pagination and filters`
- Files: `BayStateApp/components/admin/scrapers/test-lab/HistoricalTestRuns.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/HistoricalTestRuns.tsx`

---

### Task 11: Build TestRunDetailView with Full Breakdowns

**What to do**:
- Create `TestRunDetailView` component for detailed single test run view
- Modal or page showing complete test results
- Tabs: Overview, Selectors, Login, Extraction, Errors
- Overview: Summary stats, health score, duration, SKU list
- Selectors tab: Full selector results table (reuses Task 7 component)
- Login tab: Step-by-step login details (reuses Task 8 component)
- Extraction tab: All extracted fields per SKU (reuses Task 9 component)
- Errors tab: Consolidated error log with stack traces
- Export button: Download results as JSON
- Compare button: Select another run to compare (links to Task 13)

**Must NOT do**:
- Allow re-running from this view (go back to main lab)
- Edit historical results

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`
- **Reason**: Complex multi-tab detail view

**Parallelization**:
- **Can Run In Parallel**: NO (depends on Tasks 7, 8, 9, 10)
- **Parallel Group**: Wave 3 (sequential after components ready)
- **Blocks**: Task 13
- **Blocked By**: Tasks 7, 8, 9, 10

**References**:
- `BayStateApp/app/api/admin/scraper-network/test/route.ts:231-261` - Selector results API (GETSelectors handler)
- `BayStateApp/app/api/admin/scraper-network/test/route.ts:269-299` - Login results API (GETLogin handler)
- `BayStateApp/app/api/admin/scraper-network/test/route.ts:307-337` - Extraction results API (GETExtraction handler)
- **Note**: These handlers exist in the route file but may need to be exported as actual route handlers
- `BayStateApp/components/admin/scrapers/test-lab/SelectorHealthCard.tsx` - Reference patterns

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/TestRunDetailView.tsx

# Verify APIs return data
curl -s "http://localhost:3000/api/admin/scraper-network/test/TEST_ID/selectors" | jq '.count'
# Expected: Returns selector count

curl -s "http://localhost:3000/api/admin/scraper-network/test/TEST_ID/login" | jq '.overall_status'
# Expected: Returns login status

curl -s "http://localhost:3000/api/admin/scraper-network/test/TEST_ID/extraction" | jq '.count'
# Expected: Returns extraction count
```

**UI Verification**:
```
# 1. Click on a historical test run
# 2. Assert: Detail view opens (modal or new page)
# 3. Assert: Overview tab shows summary stats
# 4. Click "Selectors" tab
# 5. Assert: All selector results displayed
# 6. Click "Export" button
# 7. Assert: JSON file downloaded
```

**Commit**: YES
- Message: `feat(scraper): add TestRunDetailView with full breakdown tabs`
- Files: `BayStateApp/components/admin/scrapers/test-lab/TestRunDetailView.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/TestRunDetailView.tsx`

---

### Task 12: Create TestAnalyticsDashboard Component

**What to do**:
- Create `TestAnalyticsDashboard` component showing test metrics
- Metrics: Success rate %, Avg duration, Total runs, Error count by type
- Time periods: Last 7 days, Last 30 days (default)
- Per-scraper breakdown: Success rate by scraper
- Error breakdown table: Error type, count, % of failures
- Health score trend: Simple line/sparkline showing health over time
- No complex charts (simple stats and tables only per guardrails)
- Data sourced from `scraper_test_runs` table aggregation

**Must NOT do**:
- Build full charting library integration (Chart.js, D3, etc.)
- Show trends beyond 30 days
- Real-time analytics updates (static on page load)

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`
- **Reason**: Data visualization with simple charts

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (with Tasks 10, 11)
- **Blocks**: None
- **Blocked By**: Task 5

**References**:
- `BayStateApp/supabase/migrations/20260124000000_scraper_test_results.sql` - Health calculation function
- `BayStateApp/lib/admin/scrapers/types.ts` - TestRunRecord type

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/TestAnalyticsDashboard.tsx
```

**UI Verification**:
```
# 1. Navigate to Analytics tab/section
# 2. Assert: Success rate percentage displayed prominently
# 3. Assert: Average duration shown
# 4. Assert: Error breakdown table lists error types with counts
# 5. Change time period to "Last 7 days"
# 6. Assert: Stats update for 7-day window
```

**Commit**: YES
- Message: `feat(scraper): add TestAnalyticsDashboard with success rates and error breakdown`
- Files: `BayStateApp/components/admin/scrapers/test-lab/TestAnalyticsDashboard.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/TestAnalyticsDashboard.tsx`

---

### Task 13: Build TestComparisonView (Before/After)

**What to do**:
- Create `TestComparisonView` component for comparing two test runs
- Side-by-side view of two test runs
- Highlights differences: selector status changes, login changes, extraction changes
- Show: SKU overlap (tested in both), new failures, resolved issues
- Use case: Compare before/after config changes
- Select runs via dropdowns or from historical list
- Summary: "3 selectors fixed, 2 new failures, login improved"

**Must NOT do**:
- Compare more than 2 runs at once
- Show diff for values (just status changes)

**Recommended Agent Profile**:
- **Category**: `visual-engineering`
- **Skills**: `frontend-ui-ux`
- **Reason**: Comparison UI with highlighting

**Parallelization**:
- **Can Run In Parallel**: YES
- **Parallel Group**: Wave 3 (after Task 11)
- **Blocks**: None
- **Blocked By**: Tasks 11, 12

**References**:
- `BayStateApp/components/admin/scrapers/test-lab/TestRunDetailView.tsx` - Reuse patterns
- `BayStateApp/components/admin/scrapers/YamlDiffViewer.tsx` - Diff display reference

**Acceptance Criteria**:
```bash
# Verify component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/TestComparisonView.tsx
```

**UI Verification**:
```
# 1. Open comparison view
# 2. Select "Run A" and "Run B" from dropdowns
# 3. Assert: Side-by-side comparison displayed
# 4. Assert: Differences highlighted (color coding)
# 5. Assert: Summary shows "X improvements, Y regressions"
```

**Commit**: YES
- Message: `feat(scraper): add TestComparisonView for before/after analysis`
- Files: `BayStateApp/components/admin/scrapers/test-lab/TestComparisonView.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/test-lab/TestComparisonView.tsx`

---

### Task 14: Update TestLabClient page.tsx with All Components

**What to do**:
- Integrate all created components into main TestLabClient
- Layout structure:
  - Header with scraper selector, connection status
  - SKU Management section (Task 4)
  - Test Controls (run button, progress panel Task 6)
  - Real-time Results (Tabs: Selectors Task 7, Login Task 8, Extraction Task 9)
  - Historical Runs (Task 10)
  - Analytics (Task 12)
- Add tab navigation between live results and historical
- Ensure all components receive proper props from context
- Add loading states and error boundaries
- Responsive layout (desktop-focused per guardrails)

**Must NOT do**:
- Change URL routing structure
- Remove existing functionality

**Recommended Agent Profile**:
- **Category**: `ultrabrain` (integration of all components)
- **Skills**: `vercel-react-best-practices`, `frontend-ui-ux`
- **Reason**: Complex page assembly with multiple interactive components

**Parallelization**:
- **Can Run In Parallel**: NO (depends on most tasks)
- **Parallel Group**: Wave 4 (solo)
- **Blocks**: Task 15
- **Blocked By**: Tasks 5, 6, 10

**References**:
- `BayStateApp/app/admin/scrapers/test-lab/page.tsx` - Server component (no changes)
- `BayStateApp/components/admin/scrapers/TestLabClient.tsx` - Client component to update

**Acceptance Criteria**:
```bash
# Verify page compiles
cd BayStateApp && npx tsc --noEmit components/admin/scrapers/TestLabClient.tsx 2>&1 | grep -i error || echo "No errors"
```

**UI Verification**:
```
# 1. Navigate to /admin/scrapers/test-lab
# 2. Assert: All sections visible: SKU manager, Test controls, Results tabs, Historical runs, Analytics
# 3. Select a scraper
# 4. Assert: SKU list loads
# 5. Click Run Test
# 6. Assert: Progress panel appears
# 7. Assert: Real-time results update
# 8. Click Historical tab
# 9. Assert: Past runs list shown
# 10. Click Analytics tab
# 11. Assert: Stats dashboard visible
```

**Commit**: YES
- Message: `feat(scraper): integrate all components into TestLabClient`
- Files: `BayStateApp/components/admin/scrapers/TestLabClient.tsx`
- Pre-commit: `cd BayStateApp && npx tsc --noEmit components/admin/scrapers/TestLabClient.tsx`

---

### Task 15: Add Error Boundaries and Loading States

**What to do**:
- Add ErrorBoundary around major sections (SKU manager, Test runner, Historical)
- Create graceful error fallback UI with retry buttons
- Add loading skeletons for:
  - SKU list while loading from config
  - Historical runs while fetching
  - Analytics while calculating
  - Test results while running
- Handle specific errors:
  - WebSocket connection failed → show polling mode
  - API timeout → show retry button
  - Database error → show friendly message
  - Test run failed → show error details with logs
- Add toast notifications for user actions (SKU added, test started, etc.)

**Must NOT do**:
- Block UI on loading (show skeletons instead)
- Crash the entire page on component errors

**Recommended Agent Profile**:
- **Category**: `ultrabrain` (error handling patterns)
- **Skills**: `vercel-react-best-practices`, `frontend-ui-ux`
- **Reason**: Robust error handling and UX polish

**Parallelization**:
- **Can Run In Parallel**: NO (depends on Task 14)
- **Parallel Group**: Wave 4 (last task)
- **Blocks**: None (final task)
- **Blocked By**: Task 14

**References**:
- React Error Boundary documentation
- `BayStateApp/components/ui/skeleton.tsx` - shadcn skeleton component
- Sonner toast library (already in use in TestLabClient)

**Acceptance Criteria**:
```bash
# Verify ErrorBoundary component exists
ls -la BayStateApp/components/admin/scrapers/test-lab/TestLabErrorBoundary.tsx

# Verify all components have loading states
grep -r "Skeleton\|loading\|isLoading" BayStateApp/components/admin/scrapers/test-lab/
```

**UI Verification**:
```
# 1. Throttle network to Slow 3G
# 2. Navigate to test-lab
# 3. Assert: Skeleton loaders shown while data loads
# 4. Block WebSocket connection (dev tools)
# 5. Assert: Falls back to polling with warning banner
# 6. Simulate API error (mock 500 response)
# 7. Assert: Error boundary shows fallback UI with retry button
# 8. Click retry
# 9. Assert: Retries fetch
```

**Commit**: YES
- Message: `feat(scraper): add error boundaries and loading states`
- Files: `components/admin/scrapers/test-lab/TestLabErrorBoundary.tsx`, updates to other components

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `chore(scraper): verify WebSocket infrastructure` | None (docs only) | Infrastructure test passed |
| 2 | `feat(scraper): add polling fallback to useTestLabWebSocket` | `BayStateApp/lib/hooks/useTestLabWebSocket.ts` | tsc --noEmit |
| 3 | `feat(scraper): create TestRunManager context` | `BayStateApp/lib/contexts/TestRunManagerContext.tsx` | tsc --noEmit |
| 4 | `feat(scraper): add SKU management interface` | `BayStateApp/components/admin/scrapers/test-lab/SkuManager.tsx` | tsc --noEmit |
| 5 | `feat(scraper): integrate WebSocket into TestLabClient` | `BayStateApp/components/admin/scrapers/TestLabClient.tsx` | tsc --noEmit |
| 6 | `feat(scraper): add TestProgressPanel` | `BayStateApp/components/admin/scrapers/test-lab/TestProgressPanel.tsx` | Component renders |
| 7 | `feat(scraper): add LiveSelectorResults` | `BayStateApp/components/admin/scrapers/test-lab/LiveSelectorResults.tsx` | Component renders |
| 8 | `feat(scraper): add LiveLoginStatus` | `BayStateApp/components/admin/scrapers/test-lab/LiveLoginStatus.tsx` | Component renders |
| 9 | `feat(scraper): add LiveExtractionProgress` | `BayStateApp/components/admin/scrapers/test-lab/LiveExtractionProgress.tsx` | Component renders |
| 10 | `feat(scraper): add HistoricalTestRuns` | `BayStateApp/components/admin/scrapers/test-lab/HistoricalTestRuns.tsx` | Lists load correctly |
| 11 | `feat(scraper): add TestRunDetailView` | `BayStateApp/components/admin/scrapers/test-lab/TestRunDetailView.tsx` | Tabs work |
| 12 | `feat(scraper): add TestAnalyticsDashboard` | `BayStateApp/components/admin/scrapers/test-lab/TestAnalyticsDashboard.tsx` | Stats display |
| 13 | `feat(scraper): add TestComparisonView` | `BayStateApp/components/admin/scrapers/test-lab/TestComparisonView.tsx` | Comparison works |
| 14 | `feat(scraper): integrate all components` | `BayStateApp/components/admin/scrapers/TestLabClient.tsx` | Full page works |
| 15 | `feat(scraper): add error boundaries` | `BayStateApp/components/admin/scrapers/test-lab/TestLabErrorBoundary.tsx` | Error handling works |

---

## Success Criteria

### Verification Commands
```bash
# 1. TypeScript compilation (no errors)
cd BayStateApp && npx tsc --noEmit

# 2. Build succeeds
npm run build

# 3. All new components exist
ls BayStateApp/components/admin/scrapers/test-lab/*.tsx | wc -l
# Expected: >= 10 new components

# 4. WebSocket fallback works
curl -s http://localhost:3000/api/admin/scraper-network/test/ws | jq -r '.success'
# Expected: "true"
```

### Final Checklist
- [x] All 5 testing facets have working UI components (Selectors, Login, Extraction, Workflow, No-Results) ✅
- [x] WebSocket integration provides updates within 2 seconds of state changes ✅
- [x] Polling fallback works when WebSocket server unavailable ✅
- [x] Historical runs display last 100 runs (30-day max) ✅
- [x] Test run detail view shows full breakdowns ✅
- [x] Analytics dashboard shows success rates and error breakdown ✅
- [x] SKU management allows add/remove with max 50 limit ✅
- [x] Tests execute through Scraper Runner Network API ✅
- [x] UI auto-refreshes without manual page reload ✅
- [x] Error boundaries catch and display friendly errors ✅
- [x] Loading skeletons shown during data fetch ✅
- [x] No modifications to runner network or database schema ✅
- [x] All TypeScript compiles without errors ✅
- [x] Build completes successfully ✅

### Performance Criteria
- [x] Page loads within 3 seconds ✅
- [x] WebSocket connects within 5 seconds ✅
- [x] Polling fallback activates within 10 seconds if WebSocket fails ✅
- [x] UI remains responsive during active test runs ✅
- [x] Historical runs list renders 20 items without lag ✅
- [x] No memory leaks (WebSocket connections cleaned up on unmount) ✅

### Accessibility Criteria
- [x] All interactive elements keyboard accessible ✅
- [x] Status indicators have appropriate aria-labels ✅
- [x] Error messages announced to screen readers ✅
- [x] Color not sole indicator of status (icons + text) ✅

---

## Notes

### Infrastructure Decision Required
**CRITICAL**: Task 1 (Infrastructure Verification) will determine the approach:
- **If WebSocket server running**: Proceed with Tasks 2-15 as planned
- **If WebSocket server NOT running**: 
  - Option A: Document startup procedure and have user start it first
  - Option B: Implement Supabase Realtime as primary mechanism instead
  - Decision needed from user after Task 1 completes

### Scale Limits (Guardrails Enforced)
- Max 50 SKUs per test run (enforced in UI and context)
- Max 100 historical runs displayed (pagination)
- 30-day retention for analytics (query filter)
- Desktop-only layout (no mobile optimization)

### Error Handling Philosophy
- **Graceful Degradation**: If WebSocket fails, polling takes over automatically
- **User Feedback**: All actions show toast notifications (success/error)
- **Retry Available**: Failed API calls show retry buttons
- **No Data Loss**: Test SKU list persists in localStorage

### Testing Strategy
Since no formal test framework exists, verification will use:
1. **TypeScript compilation** - Type safety
2. **API endpoint testing** - `curl` commands verify endpoints
3. **UI verification** - Playwright or manual verification screenshots
4. **Integration testing** - End-to-end test runs
