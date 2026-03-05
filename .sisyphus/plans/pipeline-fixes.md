# AI Consolidation Pipeline Fixes Plan

## TL;DR

> **Quick Summary**: Fix AI Consolidation integration issues in BayStateApp pipeline UI. Add error handling with toast notifications, polling fallback for WebSocket, working "View Details" modal, OpenAI config warning, and wire ImageSelector into product detail view.
> 
> **Deliverables**: 
> - Error toast notifications for all API failures
> - OpenAI config warning banner
> - Polling fallback (5s interval) for status tracking
> - Batch status details modal (simplified)
> - ImageSelector wired into PipelineProductDetail
> - Completion handling with refresh
> 
> **Estimated Effort**: Medium (6-8 tasks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: T1 (Error Handling) → T3 (Polling) → T5 (View Details) → T7 (ImageSelector Integration)

---

## Context

### Original Request
User clicks "AI Consolidate" in BayStateApp pipeline but nothing appears to happen. Need to fix integration issues including: silent failures, no status tracking fallback, broken View Details button, missing OpenAI config check, and ImageSelector not wired to pipeline.

### Key Discoveries from Investigation

**What's Working:**
- "AI Consolidate" button exists in BulkActionsToolbar
- `handleConsolidate` function submits to `/api/admin/consolidation/submit`
- `ConsolidationProgressBanner` component displays progress
- WebSocket hook (`useConsolidationWebSocket`) for real-time updates
- ImageSelector component built and tested
- OpenAI config check exists (`isOpenAIConfigured()`)

**What's Broken:**
- API errors only logged to console (silent failures)
- If WebSocket not connected, no progress updates
- "View Details" button just dismisses banner (no actual details)
- No visible warning if OpenAI API key not configured
- ImageSelector component exists but not integrated into PipelineProductDetail
- Completion handling weak (just logs, no user notification)

### Requirements Confirmed
1. **View Details**: Show batch status metadata only (ID, progress %, product count) - NOT per-product results
2. **ImageSelector**: Replace existing inline image grid in PipelineProductDetail
3. **Polling**: WebSocket primary with polling fallback (5-second interval)
4. **Error Handling**: Toast notifications for ALL API failures
5. **Config Check**: Visible warning banner if OpenAI not configured

### Metis Review Findings
- Phase ordering critical: Error handling must be first (foundation)
- Polling should supplement, not replace WebSocket
- ImageSelector integration must handle existing selected images
- View Details should be modal, not new page
- Must NOT modify consolidation prompts or API contracts

---

## Work Objectives

### Core Objective
Make AI Consolidation button work reliably end-to-end with proper error feedback, status tracking (WebSocket + polling fallback), batch details visibility, OpenAI configuration warnings, and image selection integration.

### Concrete Deliverables
- Error toast notifications in PipelineClient.tsx
- OpenAI config warning banner component
- Polling fallback mechanism (5s interval, stop on completion/error)
- ConsolidationDetailsModal component (simplified batch status)
- ImageSelector integrated into PipelineProductDetail (replaces inline grid)
- Completion handling with toast notification and auto-refresh

### Definition of Done
- [x] User sees clear error toast if API call fails
- [x] Warning banner appears if OPENAI_API_KEY not configured
- [x] Progress updates even when WebSocket disconnected
- [x] "View Details" opens modal with batch status
- [x] ImageSelector displays and saves product images
- [x] Completion shows success toast and refreshes product list
- [x] All 23 consolidation tests still pass

### Must Have
- Toast notifications for all error scenarios
- Polling fallback (WebSocket primary)
- OpenAI config check on page load
- ImageSelector integrated (replaces inline grid)
- View Details modal (batch metadata only)

### Must NOT Have (Guardrails)
- NO changes to OpenAI Batch API prompts or model
- NO changes to consolidation result normalization
- NO new database tables or migrations
- NO changes to batch submission API contract
- NO WebSocket server changes (frontend-only)
- NO image upload functionality (selection only)
- NO per-product result editing in View Details
- NO batch history page (modal only)
- NO automatic retry functionality
- NO drag-and-drop image reordering

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES - Jest configured in BayStateApp
- **Automated tests**: Tests after implementation
- **Framework**: Jest + React Testing Library
- **Manual QA**: Playwright for UI flows

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Phase 1):
├── T1: Error Toast Notifications
└── T2: OpenAI Config Warning Banner

Wave 2 (Reliability - Phase 2):
├── T3: Polling Fallback Mechanism
└── T4: Completion Handling Enhancement

Wave 3 (UX Enhancement - Phase 3):
├── T5: Consolidation Details Modal
└── T6: ImageSelector Integration

Wave FINAL (Review):
├── F1: Code Quality Review
├── F2: End-to-End Integration QA
└── F3: Accessibility & Edge Cases

Critical Path: T1 → T3 → T5 → T6 → F1-F3
Parallel Speedup: ~30% faster than sequential
Max Concurrent: 2 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 (Error toasts) | — | T4, F2 |
| T2 (Config banner) | — | F2 |
| T3 (Polling) | T1 | T4, F2 |
| T4 (Completion) | T1, T3 | F2 |
| T5 (Details modal) | — | F2 |
| T6 (ImageSelector) | — | F2 |
| F1-F3 | T1-T6 | — |

---

## TODOs


- [x] 1. Error Toast Notifications

  **What to do**:
  Add toast notifications to all error scenarios in PipelineClient.tsx:
  1. In `handleConsolidate` catch block: Show toast with error message
  2. If API returns 503 (OpenAI not configured): Show specific toast
  3. If network error: Show "Network error" toast
  4. If batch submission fails: Show "Failed to start consolidation" toast
  5. If fetch fails in other handlers: Add toast there too

  **Must NOT do**:
  - NO automatic retry logic
  - NO error recovery beyond showing toast
  - NO changes to error messages from API

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None
  - Reason: Adding toast calls is straightforward UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T2)
  - **Parallel Group**: Wave 1
  - **Blocks**: T4 (completion handling needs toasts)
  - **Blocked By**: None

  **References**:
  - `components/admin/pipeline/PipelineClient.tsx:345-385` - handleConsolidate function
  - `components/admin/pipeline/PipelineClient.tsx:381-384` - Current catch block (only console.error)
  - Sonner toast docs: `toast.error(message)` pattern

  **Acceptance Criteria**:
  - [ ] Given API returns error, when consolidation fails, then toast shows error message
  - [ ] Given network disconnected, when clicking "AI Consolidate", then toast shows "Network error"
  - [ ] Given OpenAI returns 503, when clicking "AI Consolidate", then toast shows "AI service unavailable"

  **QA Scenarios**:
  ```
  Scenario: API error shows toast
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to /admin/pipeline
      2. Block /api/admin/consolidation/submit in network tools
      3. Select a product, click "AI Consolidate"
    Expected Result: Toast appears with "Failed to start consolidation"
    Evidence: .sisyphus/evidence/t1-error-toast.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add error toast notifications for consolidation`
  - Files: `components/admin/pipeline/PipelineClient.tsx`

---

- [x] 2. OpenAI Config Warning Banner

  **What to do**:
  Create warning banner component that displays when `!isOpenAIConfigured()`:
  1. Check config on PipelineClient mount using `isOpenAIConfigured()`
  2. If not configured, show warning banner at top of page
  3. Banner text: "AI Consolidation disabled: OpenAI API key not configured"
  4. Include "Configure" button linking to /admin/settings
  5. Disable "AI Consolidate" button when not configured (with tooltip)

  **Must NOT do**:
  - NO API key validation (only check if set, not if valid)
  - NO settings page implementation (link to existing)
  - NO automatic redirection

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `lib/consolidation/index.ts` - Export of isOpenAIConfigured
  - `lib/consolidation/openai-client.ts:35-37` - isOpenAIConfigured function
  - Existing banner pattern: ConsolidationProgressBanner

  **Acceptance Criteria**:
  - [ ] Given OPENAI_API_KEY not set, when page loads, then warning banner appears
  - [ ] Given banner visible, when clicking "Configure", then navigates to /admin/settings
  - [ ] Given config missing, when viewing "scraped" tab, then "AI Consolidate" button disabled

  **QA Scenarios**:
  ```
  Scenario: Config warning appears
    Tool: Playwright
    Preconditions: Remove OPENAI_API_KEY from env
    Steps:
      1. Navigate to /admin/pipeline
      2. Wait for page load
    Expected Result: Yellow warning banner visible with config message
    Evidence: .sisyphus/evidence/t2-config-banner.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add OpenAI config warning banner`
  - Files: `components/admin/pipeline/PipelineClient.tsx` (new component inline or separate)

---

- [x] 3. Polling Fallback Mechanism

  **What to do**:
  Add polling as fallback when WebSocket not connected:
  1. In PipelineClient.tsx, add useEffect for polling
  2. Only poll if `consolidationBatchId` set AND WebSocket not connected
  3. Poll interval: 5 seconds
  4. Poll endpoint: GET `/api/admin/consolidation/${batchId}`
  5. Update `consolidationProgress` from response
  6. Stop polling when: batch completes, fails, or component unmounts
  7. Add max polling duration: 30 minutes (360 requests)

  **Must NOT do**:
  - NO remove WebSocket code (supplement, don't replace)
  - NO decrease polling interval below 5s (rate limiting)
  - NO polling if WebSocket connected (avoid double updates)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None
  - Reason: Effect with interval is standard React pattern

  **Parallelization**:
  - **Can Run In Parallel**: NO (must wait for T1)
  - **Parallel Group**: Wave 2
  - **Blocks**: T4
  - **Blocked By**: T1 (error handling needed for failed polls)

  **References**:
  - `components/admin/pipeline/PipelineClient.tsx:95-96` - WebSocket hook usage
  - `components/admin/pipeline/PipelineClient.tsx:137-162` - Existing batch status effect
  - `app/api/admin/consolidation/[batchId]/route.ts` - Status endpoint

  **Acceptance Criteria**:
  - [ ] Given WebSocket disconnected, when batch active, then polling starts at 5s interval
  - [ ] Given polling active, when batch completes, then polling stops
  - [ ] Given polling active, when 30min elapsed, then polling stops with timeout message

  **QA Scenarios**:
  ```
  Scenario: Polling fallback works
    Tool: Playwright + Browser DevTools
    Preconditions: Block WebSocket connection
    Steps:
      1. Start consolidation
      2. Open Network tab
      3. Observe requests every 5 seconds
    Expected Result: GET /api/admin/consolidation/{id} every 5s
    Evidence: .sisyphus/evidence/t3-polling-network.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add polling fallback for consolidation status`
  - Files: `components/admin/pipeline/PipelineClient.tsx`

---

- [x] 4. Completion Handling Enhancement

  **What to do**:
  Enhance completion handling to notify user and refresh data:
  1. In WebSocket completion handler: Show success toast
  2. In polling completion detection: Show success toast
  3. Toast message: "Consolidation complete! X products processed"
  4. Auto-refresh product list (call refresh function or router.refresh())
  5. Reset consolidation state (batchId, progress)
  6. If partial failures: Show warning toast "X succeeded, Y failed"
  7. Keep banner visible on failure with error state

  **Must NOT do**:
  - NO automatic apply of results (user must manually approve)
  - NO redirect to different page
  - NO email notifications

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs T1 and T3)
  - **Parallel Group**: Wave 2
  - **Blocks**: F2
  - **Blocked By**: T1 (toasts), T3 (polling completion detection)

  **References**:
  - `components/admin/pipeline/PipelineClient.tsx:137-162` - Current completion handling
  - `lib/hooks/useConsolidationWebSocket.ts:102-108` - WS completion event

  **Acceptance Criteria**:
  - [ ] Given batch completes, when processing done, then success toast appears
  - [ ] Given completion toast shown, when user clicks, then product list refreshed
  - [ ] Given partial failures, when complete, then warning toast with counts

  **QA Scenarios**:
  ```
  Scenario: Completion shows toast
    Tool: Playwright
    Steps:
      1. Start consolidation with mock that completes quickly
      2. Wait for completion
    Expected Result: Toast "Consolidation complete!" appears, list refreshes
    Evidence: .sisyphus/evidence/t4-completion-toast.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add completion toast and auto-refresh`
  - Files: `components/admin/pipeline/PipelineClient.tsx`

---

- [x] 5. Consolidation Details Modal

  **What to do**:
  Create modal component for "View Details" button that shows batch status:
  1. Create `components/admin/pipeline/ConsolidationDetailsModal.tsx`
  2. Props: `batchId`, `isOpen`, `onClose`, `status`
  3. Display fields:
     - Batch ID (first 8 chars with copy button)
     - Status (Pending/Processing/Completed/Failed)
     - Progress percentage with progress bar
     - Product count
     - Start time (if available)
     - Estimated completion (if available)
  4. Use Dialog component from shadcn/ui
  5. Wire into PipelineClient: Replace `setIsBannerDismissed` with modal open
  6. Fetch fresh status when modal opens

  **Must NOT do**:
  - NO per-product results grid (out of scope)
  - NO ability to cancel/retry from modal
  - NO editing of results
  - NO new page route (modal only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: None
  - Reason: UI component requiring proper modal styling

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T6)
  - **Parallel Group**: Wave 3
  - **Blocks**: F2
  - **Blocked By**: None

  **References**:
  - `components/admin/pipeline/ConsolidationProgressBanner.tsx:67-72` - View Details button
  - `components/admin/pipeline/PipelineClient.tsx:478` - Current onViewDetails (just dismisses)
  - `components/ui/dialog.tsx` - shadcn Dialog component

  **Acceptance Criteria**:
  - [ ] Given banner visible, when clicking "View Details", then modal opens
  - [ ] Given modal open, when looking at content, then batch ID and progress visible
  - [ ] Given modal open, when clicking close, then modal closes, banner remains

  **QA Scenarios**:
  ```
  Scenario: Details modal opens
    Tool: Playwright
    Preconditions: Consolidation in progress
    Steps:
      1. Click "View Details" on progress banner
      2. Observe modal content
    Expected Result: Modal shows batch ID, status, progress bar
    Evidence: .sisyphus/evidence/t5-details-modal.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): add consolidation details modal`
  - Files: `components/admin/pipeline/ConsolidationDetailsModal.tsx`, `PipelineClient.tsx`

---

- [x] 6. ImageSelector Integration

  **What to do**:
  Replace inline image grid in PipelineProductDetail with ImageSelector component:
  1. Open `components/admin/pipeline/PipelineProductDetail.tsx`
  2. Find inline image grid (around lines 391-423)
  3. Replace with ImageSelector component
  4. Pass `image_candidates` from product as `images` prop
  5. Handle `onSave` callback to update product's consolidated images
  6. Pre-select existing `consolidated.images` if present
  7. Add "Save Images" button that triggers product update
  8. Show success toast on save

  **Must NOT do**:
  - NO changes to ImageSelector component itself (use as-is)
  - NO image upload functionality
  - NO drag-and-drop reordering
  - NO changes to image source data structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: None
  - Reason: Component integration requiring state management

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5)
  - **Parallel Group**: Wave 3
  - **Blocks**: F2
  - **Blocked By**: None

  **References**:
  - `components/admin/pipeline/ImageSelector.tsx` - Component to integrate
  - `components/admin/pipeline/PipelineProductDetail.tsx:391-423` - Current inline grid
  - Product type: Check `PipelineProduct` interface for image_candidates structure

  **Acceptance Criteria**:
  - [ ] Given product detail open, when viewing images section, then ImageSelector displayed
  - [ ] Given images selected, when clicking save, then product updates with selected images
  - [ ] Given existing consolidated images, when opening detail, then those images pre-selected

  **QA Scenarios**:
  ```
  Scenario: ImageSelector saves images
    Tool: Playwright
    Steps:
      1. Open product detail
      2. Click 2 images in ImageSelector
      3. Click "Save Selected Images"
    Expected Result: Toast "Images saved", PATCH request to product API
    Evidence: .sisyphus/evidence/t6-imageselector-save.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): integrate ImageSelector into product detail`
  - Files: `components/admin/pipeline/PipelineProductDetail.tsx`

---


---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `npm run lint` on changed files. Check for:
  - TypeScript errors in PipelineClient.tsx
  - No `any` types without justification
  - Proper error handling (no empty catches)
  - No `console.log` in production code (use console.error for actual errors)
  - ImageSelector integration doesn't break existing types
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F2. **End-to-End Integration QA** — `unspecified-high` (+ `playwright` skill)
  Test the complete consolidation flow:
  1. **Config Check**: Remove OPENAI_API_KEY, reload page → verify warning banner
  2. **Error Handling**: Block API, click "AI Consolidate" → verify error toast
  3. **Polling**: Block WebSocket, start consolidation → verify polling requests
  4. **View Details**: Click "View Details" on banner → verify modal opens
  5. **ImageSelector**: Open product, select images, save → verify update
  6. **Completion**: Start consolidation, wait for complete → verify toast + refresh
  Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Flows [6/6 pass] | VERDICT`

- [x] F3. **Accessibility & Edge Cases** — `deep`
  Verify:
  1. All buttons have accessible labels
  2. Toasts announced to screen readers
  3. Modal traps focus when open
  4. Progress bar has aria-valuenow
  5. Edge case: Refresh page during consolidation → state recovered
  6. Edge case: Rapid start/stop → no race conditions
  Output: `Accessibility [PASS/FAIL] | Edge Cases [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **T1**: `feat(pipeline): add error toast notifications for consolidation`
- **T2**: `feat(pipeline): add OpenAI config warning banner`
- **T3**: `feat(pipeline): add polling fallback for consolidation status`
- **T4**: `feat(pipeline): add completion toast and auto-refresh`
- **T5**: `feat(pipeline): add consolidation details modal`
- **T6**: `feat(pipeline): integrate ImageSelector into product detail`
- **F1-F3**: `refactor(pipeline): address review feedback` (if needed)

---

## Success Criteria

### Verification Commands
```bash
# 1. All tests pass
cd BayStateApp && CI=true npm test -- --testPathPattern="consolidation" --no-coverage
# Expected: "Tests: 23 passed, 23 total"

# 2. TypeScript compiles
npm run build 2>&1 | grep -i "error" || echo "Build clean"
# Expected: No TypeScript errors

# 3. Lint passes on changed files
npm run lint -- --file components/admin/pipeline/PipelineClient.tsx 2>&1 | tail -10
# Expected: No new errors

# 4. Error handling in place
grep -n "toast.error" components/admin/pipeline/PipelineClient.tsx | wc -l
# Expected: >= 3 occurrences

# 5. Polling implemented
grep -n "setInterval.*consolidation" components/admin/pipeline/PipelineClient.tsx
# Expected: Found polling interval

# 6. ImageSelector integrated
grep -n "ImageSelector" components/admin/pipeline/PipelineProductDetail.tsx
# Expected: Found component usage

# 7. Details modal created
ls -la components/admin/pipeline/ConsolidationDetailsModal.tsx
# Expected: File exists
```

### Final Checklist
- [x] Error toast appears for all API failures
- [x] Config warning banner visible when key missing
- [x] Polling works when WebSocket disconnected
- [x] View Details modal shows batch status
- [x] ImageSelector saves images correctly
- [x] Completion refreshes product list
- [x] All 23 consolidation tests pass
- [x] No new TypeScript errors
- [x] No new lint errors

---

## Edge Cases Addressed

| Edge Case | Handling |
|-----------|----------|
| **Browser refresh during consolidation** | Batch ID tracked in component state, progress resumes via polling/WS |
| **User opens multiple tabs** | Each tab independent, last write wins for image selection |
| **Batch completes while tab backgrounded** | Polling catches it, toast shows on tab focus |
| **Image URL is broken/404** | ImageSelector shows placeholder, allows removal |
| **Consolidation fails after 24h** | Max polling 30min, timeout toast with manual check option |
| **Large batch (500+ products)** | Progress bar + "X of Y processed" text |
| **Zero image candidates** | ImageSelector shows "No images available" empty state |
| **All products fail** | "All failed" error state with retry button |
| **Partial batch failure** | Toast: "X succeeded, Y failed" with expand for details |
| **Rapid start/stop** | Button disabled during submission, prevents race conditions |

---

## Notes for Executor

### Priority Order (MUST follow)
1. **T1 (Error Handling)** - Foundation, blocks T4
2. **T2 (Config Banner)** - Can parallel with T1
3. **T3 (Polling)** - Depends on T1 error handling
4. **T4 (Completion)** - Depends on T1, T3
5. **T5 (Details Modal)** - Can parallel with T6
6. **T6 (ImageSelector)** - Can parallel with T5
7. **F1-F3** - After all implementation

### Testing Strategy
- Use existing Jest tests as regression check
- Add Playwright tests for new UI flows
- Test error scenarios by mocking fetch/WebSocket
- Test config banner by temporarily removing env var

### Common Pitfalls
- Don't break existing WebSocket functionality
- Don't forget to clear polling interval on unmount
- Ensure ImageSelector pre-selects existing images
- Toast messages should be user-friendly (not raw errors)

---

**Plan Generated**: 2026-02-27  
**Ready for Execution**: YES  
**Run**: `/start-work` to begin
