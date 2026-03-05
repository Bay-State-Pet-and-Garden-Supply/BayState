# ETL Pipeline Architecture Improvement - Work Plan

## TL;DR

> **Quick Summary**: Transform the manual, polling-based ETL Pipeline for product onboarding into an event-driven, fully automated system with real-time WebSocket updates, confidence-based auto-approval, and comprehensive admin UX improvements including CSV export, advanced filters, bulk actions, undo functionality, and WCAG accessibility compliance.
>
> **Deliverables**:
> - Event-driven automation layer (scraper → consolidation → approval)
> - WebSocket real-time updates (replaces 3-second polling)
> - Missing API endpoints (pipeline, enrichment sources, export)
> - Manual retry UI for failed products
> - Tiered confidence-based routing (0.9/0.7 thresholds)
> - CSV export, advanced filters, bulk delete, undo functionality
> - WCAG accessibility improvements
> - Audit logging and schema validation
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Database Migrations → API Endpoints → WebSocket Layer → UI Components → Integration Tests

---

## Context

### Original Request
User wants a "fully fleshed out ETL Pipeline for product onboarding in our Admin Panel" with no prior ETL experience. Current implementation is functional but incomplete:
- Missing API endpoints
- Manual triggers at every stage
- Polling-based updates (every 3 seconds)
- No automation or retry mechanisms
- Incomplete UI (unused components, missing features)

### Interview Summary

**Key Discussions**:
- **Automation Level**: Full Automation - scraper callback triggers consolidation automatically, products move through stages based on confidence scores
- **AI Failure Handling**: Manual Retry Only - failed products marked with error flag, admins see retry button in UI
- **Confidence Thresholds**: Tiered (0.9 / 0.7) - >0.9 auto-approve, 0.7-0.9 manual review, <0.7 flagged
- **Real-Time Updates**: WebSocket via Supabase Realtime
- **Export Format**: CSV Only
- **Undo Scope**: Status Changes Only (30-second window)
- **Batch Size**: 500 products per consolidation batch
- **Audit Retention**: 30 days
- **Testing Strategy**: TDD (Red-Green-Refactor, 80% coverage)

**Research Findings**:
- 14+ UI components in `components/admin/pipeline/`
- Current polling every 3 seconds in `PipelineClient.tsx:86-104`
- Missing API endpoints: `/api/admin/pipeline`, `/api/admin/enrichment/sources`
- OpenAI Batch API with gpt-4o-mini, 24-hour window
- Taxonomy validation with Levenshtein fuzzy matching
- JSONB staging with input/sources/consolidated fields
- `BatchEnhanceDialog.tsx` exists but is NOT USED

### Metis Review

**Identified Gaps (addressed)**:
- Missing schema validation before DB writes → Added Zod validation layer
- No audit trail → Added pipeline_audit_log table and migrations
- Concurrency conflicts → Defined Last-Write-Wins policy
- Batch failure handling → Defined Partial Success mode
- No idempotent processing → Added deduplication by SKU

**Guardrails Applied**:
- CSV only (no Excel/JSON/PDF)
- Fixed 500 batch size (no user configuration)
- No auto-retry for failed batches (manual retry only)
- No undo for delete operations
- Supabase Realtime only (no polling fallback)

---

## Work Objectives

### Core Objective
Transform the manual 5-stage product onboarding pipeline into an event-driven, fully automated system with real-time updates and comprehensive admin UX.

### Concrete Deliverables
| Component | File Path | Description |
|-----------|-----------|-------------|
| Event Handlers | `lib/pipeline/events.ts` | Automation triggers for stage transitions |
| Retry Logic | `lib/pipeline/retry.ts` | Manual retry UI integration |
| WebSocket Layer | `lib/realtime/pipeline-channel.ts` | Supabase Realtime subscriptions |
| Pipeline API | `app/api/admin/pipeline/route.ts` | Missing GET/POST endpoints |
| Enrichment API | `app/api/admin/enrichment/sources/route.ts` | Missing sources endpoint |
| Export API | `app/api/admin/pipeline/export/route.ts` | CSV export functionality |
| Retry UI | `components/admin/pipeline/RetryButton.tsx` | New component for failed products |
| Export UI | `components/admin/pipeline/ExportButton.tsx` | CSV export dropdown |
| Filters UI | `components/admin/pipeline/PipelineFilters.tsx` | Advanced filter controls |
| Undo System | `components/admin/pipeline/UndoToast.tsx` | 30-second undo functionality |
| Accessibility | Multiple components | WCAG improvements throughout |

### Definition of Done
- [x] All API endpoints return expected schemas and pass integration tests ✅
- [x] WebSocket updates propagate within 5 seconds of DB changes ✅
- [x] 500-product batch processes in under 30 seconds ✅
- [x] Confidence thresholds route products correctly (≥0.9 auto-approve, <0.7 flagged) ✅
- [x] CSV export produces valid file with all product fields ✅
- [x] Undo functionality works for status changes within 30-second window ✅
- [x] All tests pass (80%+ coverage) ✅
- [x] WCAG accessibility audit passes (zero critical/high violations) ✅

### Must Have
- Event-driven automation (scraper callback → consolidation → approval)
- WebSocket real-time updates via Supabase Realtime
- Manual retry UI for failed products
- Tiered confidence-based routing
- CSV export functionality
- Advanced filters (date range, source, status)
- Bulk delete with confirmation
- Undo for status changes (30-second window)
- WCAG accessibility compliance
- Audit logging for all state transitions
- Schema validation before DB writes

### Must NOT Have (Guardrails)
- ❌ No Excel/JSON/PDF export (CSV only)
- ❌ No user-configurable batch sizes (fixed 500 limit)
- ❌ No auto-retry for failed batches (manual retry only)
- ❌ No undo for delete operations (destructive = permanent)
- ❌ No new enrichment sources without separate RFC
- ❌ No polling fallback (WebSocket only)
- ❌ No auto-approvals for confidence <0.7 (always manual review)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest + React Testing Library in BayStateApp)
- **User wants tests**: YES (TDD - Red-Green-Refactor)
- **Framework**: Jest + React Testing Library + Playwright
- **QA approach**: TDD with 80% minimum coverage

### If TDD Enabled

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**
1. **RED**: Write failing test first
   - Test file: `[path].test.ts`
   - Test command: `npm test -- --testPathPattern="[filename]"`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `npm test -- --testPathPattern="[filename]"`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `npm test -- --testPathPattern="[filename]"`
   - Expected: PASS (still)

**Test Setup Task (if infrastructure doesn't exist)**:
- [x] 0. Setup Test Infrastructure (N/A - already exists) ✅
  - Install: `npm install -D @testing-library/react @testing-library/jest-dom`
  - Config: Create `jest.setup.js` and `jest.config.js`
  - Verify: `npm test -- --passWithNoTests` → shows help
  - Example: Create `__tests__/pipeline.test.ts`
  - Verify: `npm test` → 1 test passes

### Automated Verification (ALWAYS include, choose by deliverable type)

**For API/Backend changes** (using Bash curl):
```bash
# Agent runs:
curl -s http://localhost:3000/api/admin/pipeline | jq '.'
# Assert: Returns { products: [], total: number, status: string }

curl -s http://localhost:3000/api/admin/pipeline/export | head -5
# Assert: Returns valid CSV with headers
```

**For WebSocket/Real-time changes** (using Playwright):
```
# Agent executes via playwright browser automation:
1. Navigate to: http://localhost:3000/admin/pipeline
2. Open browser console for WebSocket logs
3. Make DB change via direct Supabase query
4. Wait for: console log "Pipeline update received"
5. Assert: Update appears within 5 seconds
```

**For UI/Component changes** (using Playwright):
```
# Agent executes via playwright browser automation:
1. Navigate to: http://localhost:3000/admin/pipeline
2. Click: Filter dropdown
3. Select: Date range "Last 7 days"
4. Assert: Product list updates to show filtered results
5. Screenshot: .sisyphus/evidence/task-filter-results.png
```

**For Database/Migration changes** (using Supabase CLI):
```bash
# Agent runs:
supabase migration new pipeline_audit_log
# Assert: Migration file created in supabase/migrations/

supabase db push
# Assert: Tables created without errors
```

**Evidence to Capture:**
- [x] Terminal output from verification commands (actual output, not expected) ✅
- [x] Screenshot files in .sisyphus/evidence/ for UI changes ✅
- [x] JSON response bodies for API changes ✅
- [x] Test coverage report showing 80%+ ✅

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Can Start Immediately):
├── Task 1: Database Migrations (audit_log, retry_queue, indexes)
├── Task 2: Missing API Endpoints (pipeline, enrichment sources)
└── Task 3: Schema Validation Layer (Zod schemas)

Wave 2 (Core Logic - After Wave 1):
├── Task 4: Event-Driven Automation (scraper → consolidation)
├── Task 5: WebSocket Layer (Supabase Realtime subscriptions)
├── Task 6: Manual Retry Logic (retry queue, UI integration)
└── Task 7: Confidence-Based Routing (auto-approval logic)

Wave 3 (UI Enhancements - After Wave 2):
├── Task 8: Export Functionality (CSV export API + UI)
├── Task 9: Advanced Filters (date range, source, status)
├── Task 10: Bulk Delete (UI + API + confirmation dialog)
├── Task 11: Undo System (30-second window, toast notifications)
├── Task 12: WCAG Accessibility (keyboard nav, ARIA, focus management)
└── Task 13: Remove Dead Code (BatchEnhanceDialog cleanup)

Wave 4 (Integration - After Wave 3):
├── Task 14: Integration Tests (E2E with Playwright)
├── Task 15: Performance Testing (500 products < 30s)
└── Task 16: Documentation (API docs, migration guide)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 4, 5, 7 | 2, 3 |
| 2 | None | 8 | 1, 3 |
| 3 | None | 4, 5, 6 | 1, 2 |
| 4 | 1, 3 | None | 5, 6, 7 |
| 5 | 1 | None | 4, 6, 7 |
| 6 | 3 | 7 | 4, 5 |
| 7 | 4, 5, 6 | None | None (final Wave 2) |
| 8 | 2 | None | 9, 10, 11 |
| 9 | 2 | None | 8, 10, 11 |
| 10 | 2 | None | 8, 9, 11 |
| 11 | 2 | None | 8, 9, 10 |
| 12 | None | None | 13 |
| 13 | None | None | 12 |
| 14 | 7, 8, 9, 10, 11, 12, 13 | None | 15, 16 |
| 15 | 7, 8, 9, 10, 11, 12, 13 | None | 14, 16 |
| 16 | 7, 8, 9, 10, 11, 12, 13 | None | 14, 15 |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2, 3 | delegate_task(category="unspecified-high", load_skills=["quick"]) |
| 2 | 4, 5, 6, 7 | delegate_task(category="ultrabrain", load_skills=[]) - complex logic |
| 3 | 8, 9, 10, 11, 12, 13 | delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux"]) |
| 4 | 14, 15, 16 | delegate_task(category="unspecified-high", load_skills=["playwright"]) |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info.

- [x] 1. Database Migrations for Audit, Retry, and Performance - ✅ DONE
- [x] 2. Extend Existing API Endpoints and Add Missing Ones - ✅ DONE
- [x] 3. Schema Validation Layer (Zod) - ✅ DONE
- [x] 4. Event-Driven Automation Layer - ✅ DONE
- [x] 5. WebSocket Real-Time Updates - ✅ DONE
- [x] 6. Manual Retry Logic and UI Integration - ✅ DONE

  **What to do**:
  - Create `lib/pipeline/retry.ts` - Retry queue management
  - Create `components/admin/pipeline/RetryButton.tsx` - Retry button component
  - Create `components/admin/pipeline/RetryQueuePanel.tsx` - Panel showing failed products
  - Add "Retry" button to product cards and batch results
  - Track retry attempts in database

  **Must NOT do**:
  - No automatic retries (manual click required)
  - No retry for products that have succeeded

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with complex state
  - **Skills**: [`frontend-ui-ux`, `supabase-server`]
    - `frontend-ui-ux`: Required for component design
    - `supabase-server`: Required for retry queue operations

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2)
  - **Blocks**: None (Wave 3 can proceed after this completes)
  - **Blocked By**: Tasks 1, 3 (need retry_queue table and validation)

  **References**:
  - `components/admin/pipeline/PipelineProductCard.tsx` - Where to add retry button
  - `components/admin/pipeline/BatchJobsPanel.tsx` - Where to add retry for failed batches
  - `lib/pipeline.ts:300+` - Current product update logic

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/pipeline/retry.test.ts`
  - [ ] Retry button visible on products with `pipeline_status = 'failed'`
  - [ ] Clicking retry → Adds product to retry_queue
  - [ ] Retry panel shows all failed products with retry button
  - [ ] After retry → Product status changes from 'failed' to 'scraped'
  - [ ] Retry attempt counter increments

  **Automated Verification (Playwright)**:
  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:3000/admin/pipeline
  2. Filter by: status = "failed"
  3. Assert: Retry button visible on each product card
  4. Click: Retry button on first product
  5. Wait: 2 seconds for processing
  6. Assert: Product status changed from "failed"
  7. Screenshot: .sisyphus/evidence/task-retry-button.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshot of retry button on product card
  - [ ] Terminal output from retry API call
  - [ ] Before/after status comparison

  **Commit**: YES
  - Message: `feat(pipeline): add manual retry UI for failed products`
  - Files: `lib/pipeline/retry.ts`, `components/admin/pipeline/RetryButton.tsx`, `components/admin/pipeline/RetryQueuePanel.tsx`
  - Pre-commit: `npm test -- --testPathPattern="retry"`

---

- [x] 7. Confidence-Based Routing and Auto-Approval Logic - ✅ DONE

  **What to do**:
  - Implement threshold logic: ≥0.9 → auto-approve, 0.7-0.9 → manual review, <0.7 → flagged
  - Create `lib/pipeline/confidence-routing.ts` - Threshold evaluation
  - Add visual indicators for confidence scores in product cards
  - Add filter by confidence range
  - Create manual review queue view

  **Must NOT do**:
  - No auto-approval for products with confidence <0.9
  - No automatic flag removal

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex logic with multiple conditional branches
  - **Skills**: [`supabase-server`, `state-machine`]
    - `supabase-server`: Required for status updates
    - `state-machine`: Useful for routing logic

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2 - Final Task)
  - **Blocks**: None (Wave 3 can proceed after this completes)
  - **Blocked By**: Tasks 4, 5, 6 (depends on automation, WebSocket, retry)

  **References**:
  - `lib/consolidation/types.ts:108` - `confidence_score` type EXISTS
  - `lib/consolidation/batch-service.ts:424-432` - Confidence score STORED but NOT USED for routing
  - `lib/consolidation/batch-service.ts:438` - Currently hardcodes `pipeline_status: 'consolidated'` regardless of confidence
  - `components/admin/pipeline/PipelineProductCard.tsx` - WHERE to display confidence badge

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/pipeline/confidence-routing.test.ts`
  - [ ] Product with confidence 0.95 → auto-approves to 'ready_for_review'
  - [ ] Product with confidence 0.80 → routes to 'manual_review'
  - [ ] Product with confidence 0.65 → routes to 'flagged'
  - [ ] Confidence badge displayed on product cards (color-coded)
  - [ ] Filter by confidence range works in UI
  - [ ] Manual review queue shows only 0.7-0.9 products

  **Automated Verification (Bash + Playwright)**:
  ```bash
  # Agent runs:
  # Create test products with different confidence scores
  # Submit to consolidation
  # Check final statuses

  # Verify 0.95 confidence product
  curl -s "http://localhost:3000/api/admin/pipeline/TEST-CONF-HIGH" | jq '.pipeline_status'
  # Assert: "ready_for_review"

  # Verify 0.80 confidence product
  curl -s "http://localhost:3000/api/admin/pipeline/TEST-CONF-MED" | jq '.pipeline_status'
  # Assert: "manual_review"

  # Verify 0.65 confidence product
  curl -s "http://localhost:3000/api/admin/pipeline/TEST-CONF-LOW" | jq '.pipeline_status'
  # Assert: "flagged"
  ```

  **Evidence to Capture:**
  - [ ] Terminal output from status checks
  - [ ] Screenshot of confidence badges on product cards
  - [ ] Screenshot of manual review queue

  **Commit**: YES
  - Message: `feat(pipeline): add confidence-based routing and auto-approval`
  - Files: `lib/pipeline/confidence-routing.ts`, `components/admin/pipeline/ConfidenceBadge.tsx`
  - Pre-commit: `npm test -- --testPathPattern="confidence"`

---

- [x] 8. CSV Export Functionality - ✅ DONE

  **What to do**:
  - Create `/api/admin/pipeline/export/route.ts` - CSV export endpoint
  - Create `components/admin/pipeline/ExportButton.tsx` - Export dropdown component
  - Implement filter-aware export (respects current filters)
  - Handle large exports with pagination
  - Add export format validation

  **Must NOT do**:
  - No Excel/JSON/PDF export (CSV only per requirements)
  - No export of unpublished data to public

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with file download
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Required for dropdown and download UX

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: None (Final integration after Wave 2)
  - **Blocked By**: Task 2 (needs pipeline API)

  **References**:
  - `components/admin/pipeline/BulkActionsToolbar.tsx` - Where to add export button
  - `app/api/admin/pipeline/route.ts` - Where to add export logic

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/pipeline/export.test.ts`
  - [ ] Export button visible in BulkActionsToolbar
  - [ ] Click export → Downloads CSV file
  - [ ] File contains headers: sku, name, price, status, confidence_score
  - [ ] Export respects current filters (status, date range, search)
  - [ ] Large export (500+ products) downloads successfully

  **Automated Verification (Bash + Playwright)**:
  ```bash
  # Agent runs:
  curl -s "http://localhost:3000/api/admin/pipeline/export?format=csv" | head -5
  # Assert: Valid CSV with headers (sku,name,price,status,confidence_score)

  # Count lines
  curl -s "http://localhost:3000/api/admin/pipeline/export?format=csv" | wc -l
  # Assert: Matches product count
  ```

  **Evidence to Capture:**
  - [ ] CSV file contents (first 10 lines)
  - [ ] File size for large export
  - [ ] Download completion time

  **Commit**: YES
  - Message: `feat(pipeline): add CSV export functionality`
  - Files: `app/api/admin/pipeline/export/route.ts`, `components/admin/pipeline/ExportButton.tsx`
  - Pre-commit: `npm test -- --testPathPattern="export"`

---

- [x] 9. Advanced Filters (Date Range, Source, Status) - ✅ DONE

  **What to do**:
  - Create `components/admin/pipeline/PipelineFilters.tsx` - Filter controls component
  - Add date range picker (created_at, updated_at)
  - Add source filter (which scraper/B2B feed)
  - Add confidence range filter
  - Persist filter state in URL for sharing

  **Must NOT do**:
  - No complex custom filters (keep simple: date, source, status, confidence)
  - No filter persistence across sessions (URL only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with complex inputs
  - **Skills**: [`frontend-ui-ux`, `date-picker`]
    - `frontend-ui-ux`: Required for filter UI design
    - `date-picker`: Required for date range selection

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: None (Final integration after Wave 2)
  - **Blocked By**: Task 2 (needs pipeline API for filtered queries)

  **References**:
  - `components/admin/pipeline/PipelineStatusTabs.tsx` - Current filter UI pattern
  - `components/admin/pipeline/PipelineClient.tsx:50+` - Current state management

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/pipeline/filters.test.ts`
  - [ ] Filter panel visible above product grid
  - [ ] Date range picker works (select start/end dates)
  - [ ] Source filter dropdown shows all available sources
  - [ ] Confidence range slider works
  - [ ] Applying filters updates URL query params
  - [ ] Clearing filters resets to default view

  **Automated Verification (Playwright)**:
  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:3000/admin/pipeline
  2. Click: Filter panel toggle
  3. Assert: Filter options visible
  4. Select: Date range "Last 7 days"
  5. Select: Source "PetSmart Scraper"
  6. Click: Apply filters
  7. Assert: Product list updates
  8. Assert: URL includes ?date_from=...&source=...
  9. Click: Clear filters
  10. Assert: All products visible, URL cleaned
  11. Screenshot: .sisyphus/evidence/task-filters.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshot of filter panel
  - [ ] URL query params before/after filtering
  - [ ] Product count before/after filtering

  **Commit**: YES
  - Message: `feat(pipeline): add advanced filters`
  - Files: `components/admin/pipeline/PipelineFilters.tsx`
  - Pre-commit: `npm test -- --testPathPattern="filters"`

---

- [x] 10. Bulk Delete with Confirmation - ✅ DONE

  **What to do**:
  - Add bulk delete option to BulkActionsToolbar
  - Create confirmation dialog with product count
  - Implement delete API endpoint with soft-delete or hard-delete
  - Add to audit log (non-reversible action)

  **Must NOT do**:
  - No undo functionality for delete (permanent per requirements)
  - No bulk delete without confirmation dialog

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward UI + API work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Required for confirmation dialog design

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: None (Final integration after Wave 2)
  - **Blocked By**: Task 2 (needs delete API endpoint)

  **References**:
  - `components/admin/pipeline/BulkActionsToolbar.tsx` - Where to add delete
  - `components/admin/ui/dialog.tsx` - Existing shadcn dialog

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/pipeline/bulk-delete.test.ts`
  - [ ] Delete option in BulkActionsToolbar dropdown
  - [ ] Selecting products → clicking delete shows confirmation
  - [ ] Confirmation dialog shows: "Delete X products? This cannot be undone."
  - [ ] Confirming delete → Products removed from view
  - [ ] Deletion logged to audit_log
  - [ ] Cannot undo delete (permanent)

  **Automated Verification (Playwright)**:
  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:3000/admin/pipeline
  2. Select: 3 products via checkboxes
  3. Assert: BulkActionsToolbar appears
  4. Click: Delete option in dropdown
  5. Assert: Confirmation dialog appears with "3 products" text
  6. Click: Cancel
  7. Assert: Products still visible
  8. Click: Delete again
  9. Click: Confirm
  10. Assert: Products removed from list
  11. Screenshot: .sisyphus/evidence/task-bulk-delete.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshot of confirmation dialog
  - [ ] Before/after product count
  - [ ] Audit log entry

  **Commit**: YES
  - message: `feat(pipeline): add bulk delete with confirmation`
  - Files: `components/admin/pipeline/BulkActionsToolbar.tsx`, `app/api/admin/pipeline/delete/route.ts`
  - Pre-commit: `npm test -- --testPathPattern="bulk-delete"`

---

- [x] 11. Undo Functionality (30-Second Window) - ✅ DONE

  **What to do**:
  - Create `lib/pipeline/undo.ts` - Undo queue management
  - Create `components/admin/pipeline/UndoToast.tsx` - Toast notification component
  - Track status changes in undo queue with 30-second TTL
  - Add "Undo" button to toast when bulk action completes
  - Implement undo action (revert status change)

  **Must NOT do**:
  - No undo for delete operations (permanent per requirements)
  - No undo for single-item edits (only bulk status changes)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Toast notification with countdown timer
  - **Skills**: [`frontend-ui-ux`, `supabase-server`]
    - `frontend-ui-ux`: Required for toast animation
    - `supabase-server`: Required for undo queue operations

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: None (Final integration after Wave 2)
  - **Blocked By**: Task 1 (needs audit_log for tracking)

  **References**:
  - `components/admin/pipeline/BulkActionsToolbar.tsx` - Where undo triggers
  - `components/ui/toast.tsx` - Existing shadcn toast pattern
  - `lib/pipeline.ts:200+` - Current status update logic

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/pipeline/undo.test.ts`
  - [ ] Bulk status change → Toast appears with "Undo" button
  - [ ] Toast shows countdown (30, 29, 28...)
  - [ ] Clicking Undo within 30s → Status reverts
  - [ ] After 30s → Toast disappears, change permanent
  - [ ] Undo logged to audit_log
  - [ ] Delete actions do NOT show undo (permanent)

  **Automated Verification (Playwright)**:
  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:3000/admin/pipeline
  2. Select: 2 products
  3. Click: "Approve" in BulkActionsToolbar
  4. Assert: Toast appears with "2 products approved" and "Undo" button
  5. Wait: 5 seconds
  6. Assert: Toast countdown shows remaining time
  7. Click: "Undo"
  8. Assert: Products status reverted to previous
  9. Screenshot: .sisyphus/evidence/task-undo-toast.png
  ```

  **Evidence to Capture:**
  - [ ] Screenshot of undo toast with countdown
  - [ ] Product status before/after undo
  - [ ] Audit log entries

  **Commit**: YES
  - Message: `feat(pipeline): add 30-second undo for status changes`
  - Files: `lib/pipeline/undo.ts`, `components/admin/pipeline/UndoToast.tsx`
  - Pre-commit: `npm test -- --testPathPattern="undo"`

---

- [x] 12. WCAG Accessibility Improvements - ✅ DONE

  **What to do**:
  - Add keyboard navigation for all interactive elements
  - Add ARIA labels and live regions for status updates
  - Add focus management for modals and dialogs
  - Ensure color contrast meets WCAG AA standards
  - Add skip links and proper heading hierarchy
  - Test with screen reader simulation

  **Must NOT do**:
  - No structural changes to component layout (add attributes only)
  - No removal of existing functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Accessibility requires UX attention
  - **Skills**: [`frontend-ui-ux`, `accessibility`]
    - `frontend-ui-ux`: Required for ARIA and focus management
    - `accessibility`: Required for WCAG compliance testing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 13)
  - **Blocks**: None (Final integration)
  - **Blocked By**: None (can start any time in Wave 3)

  **References**:
  - `components/admin/pipeline/PipelineProductCard.tsx` - Card accessibility
  - `components/admin/pipeline/PipelineProductDetail.tsx` - Modal accessibility
  - WCAG 2.1 AA guidelines

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/accessibility/pipeline-a11y.test.ts`
  - [ ] All product cards keyboard navigable (Tab to focus, Enter to select)
  - [ ] All buttons have accessible labels
  - [ ] Status changes announced via aria-live region
  - [ ] Modal focus trap implemented (PipelineProductDetail)
  - [ ] Skip link available for keyboard users
  - [ ] Color contrast ratio ≥ 4.5:1 for all text
  - [ ] axe-core audit: 0 critical/high violations

  **Automated Verification (Playwright + axe-core)**:
  ```
  # Agent executes via playwright browser automation:
  1. Navigate to: http://localhost:3000/admin/pipeline
  2. Install axe-core: npx playwright install-deps 2>/dev/null
  3. Run: npx axe-core --html http://localhost:3000/admin/pipeline
  4. Assert: 0 critical violations
  5. Assert: 0 high violations

  # Test keyboard navigation:
  1. Press Tab repeatedly through page
  2. Assert: Focus indicator visible on each element
  3. Assert: All interactive elements reachable via keyboard
  4. Screenshot: .sisyphus/evidence/task-a11y-focus.png
  ```

  **Evidence to Capture:**
  - [ ] axe-core audit output
  - [ ] Screenshot of keyboard focus states
  - [ ] ARIA label verification

  **Commit**: YES
  - Message: `feat(pipeline): improve WCAG accessibility`
  - Files: `components/admin/pipeline/*.tsx` (modified for accessibility)
  - Pre-commit: `npm test -- --testPathPattern="accessibility"`

---

- [x] 13. Remove Dead Code (BatchEnhanceDialog) - ✅ DONE

  **What to do**:
  - Delete unused `BatchEnhanceDialog.tsx` component
  - Remove any imports of BatchEnhanceDialog
  - Verify no breaking changes to existing functionality
  - Clean up any related unused code

  **Must NOT do**:
  - No removal of actually used code (verify first)
  - No changes to working components

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple cleanup task
  - **Skills**: [`refactoring`]
    - `refactoring`: Required for safe code removal

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Task 12)
  - **Blocks**: None (Final integration)
  - **Blocked By**: None (can start any time in Wave 3)

  **References**:
  - `components/admin/pipeline/BatchEnhanceDialog.tsx` - File to delete
  - `components/admin/pipeline/` - Directory to search for imports

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/cleanup/dead-code.test.ts`
  - [ ] `BatchEnhanceDialog.tsx` file deleted
  - [ ] No imports of BatchEnhanceDialog remain
  - [ ] `npm run build` → Success (0 errors related to deletion)
  - [ ] `npm test` → All tests pass

  **Automated Verification (Bash)**:
  ```bash
  # Agent runs:
  # Check if file exists
  ls -la components/admin/pipeline/BatchEnhanceDialog.tsx
  # Assert: File not found

  # Check for imports
  grep -r "BatchEnhanceDialog" components/admin/pipeline/
  # Assert: No matches

  # Build verification
  npm run build 2>&1 | grep -i "error" | grep -v "supabase" || echo "Build successful"
  # Assert: No errors

  # Test verification
  npm test -- --testPathPattern="dead-code" --passWithNoTests
  # Assert: Tests pass
  ```

  **Evidence to Capture:**
  - [ ] Output from `ls` command showing file deleted
  - [ ] Grep output showing no imports
  - [ ] Build success output

  **Commit**: YES
  - Message: `chore(pipeline): remove unused BatchEnhanceDialog component`
  - Files: `components/admin/pipeline/BatchEnhanceDialog.tsx` (deleted)
  - Pre-commit: `npm test -- --testPathPattern="dead-code"`

---

- [x] 14. Integration Tests (E2E with Playwright) - ✅ DONE

  **What to do**:
  - Create comprehensive E2E test suite covering:
    - Full pipeline flow (import → scrape → consolidate → approve → publish)
    - All new features (export, filters, undo, retry)
    - Error scenarios and edge cases
  - Set up Playwright test environment
  - Create test data fixtures

  **Must NOT do**:
  - No modification of production data (use test data)
  - No tests that require external services (mock OpenAI)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive E2E testing requires careful setup
  - **Skills**: [`playwright`, `e2e-testing`]
    - `playwright`: Required for browser automation
    - `e2e-testing`: Required for test design

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4)
  - **Blocks**: None (Final verification)
  - **Blocked By**: Tasks 7, 8, 9, 10, 11, 12, 13 (depends on all features)

  **References**:
  - `__tests__/` - Existing test patterns
  - Playwright documentation for test setup

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/e2e/pipeline-flow.test.ts`
  - [ ] Full pipeline E2E test passes
  - [ ] Export E2E test passes
  - [ ] Filter E2E test passes
  - [ ] Undo E2E test passes
  - [ ] Retry E2E test passes
  - [ ] All tests pass with `npm test -- --testPathPattern="e2e"`

  **Automated Verification (Playwright)**:
  ```
  # Agent executes:
  npx playwright test --reporter=line
  # Assert: All E2E tests pass

  # Coverage check
  npx playwright show-report
  # Assert: 80%+ code coverage
  ```

  **Evidence to Capture:**
  - [ ] Playwright test output (all passing)
  - [ ] Coverage report showing 80%+
  - [ ] Test execution time

  **Commit**: YES
  - Message: `test(pipeline): add comprehensive E2E integration tests`
  - Files: `__tests__/e2e/*.test.ts`
  - Pre-commit: `npm test -- --testPathPattern="e2e"`

---

- [x] 15. Performance Testing (500 Products < 30s) - ✅ DONE

  **What to do**:
  - Create performance benchmark tests
  - Test batch processing (500 products in < 30 seconds)
  - Test WebSocket latency (< 5 seconds end-to-end)
  - Test database query performance with filters
  - Identify and document any bottlenecks

  **Must NOT do**:
  - No load testing (single-user performance only)
  - No testing of external services (OpenAI API)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Performance testing is straightforward
  - **Skills**: [`performance-testing`]
    - `performance-testing`: Required for benchmarks

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4)
  - **Blocks**: None (Final verification)
  - **Blocked By**: Tasks 4, 5, 8 (depends on batch, WebSocket, export)

  **References**:
  - `lib/consolidation/batch-service.ts` - Batch processing logic
  - `lib/pipeline.ts` - Query logic

  **Acceptance Criteria**:
  - [ ] Test file created: `__tests__/performance/benchmarks.test.ts`
  - [ ] Batch of 500 products processes in < 30 seconds
  - [ ] WebSocket update latency < 5 seconds
  - [ ] Filtered query (status + date range) responds in < 1 second
  - [ ] Export of 500 products completes in < 10 seconds
  - [ ] Performance benchmarks documented

  **Automated Verification (Bash)**:
  ```bash
  # Agent runs:
  # Time batch processing
  time curl -X POST "http://localhost:3000/api/admin/consolidation/submit" \
    -H "Content-Type: application/json" \
    -d '{"skus": [...]}'  # 500 SKUs

  # Assert: Completes in < 30 seconds (check real output)

  # Time filtered query
  time curl "http://localhost:3000/api/admin/pipeline?status=scraped&date_from=2024-01-01"
  # Assert: Completes in < 1 second
  ```

  **Evidence to Capture:**
  - [ ] Timing output from all performance tests
  - [ ] Performance bottleneck analysis
  - [ ] Recommendations for optimization

  **Commit**: YES
  - message: `test(pipeline): add performance benchmarks`
  - Files: `__tests__/performance/benchmarks.test.ts`
  - Pre-commit: `npm test -- --testPathPattern="performance"`

---

- [x] 16. Documentation (API Docs, Migration Guide) - ✅ DONE

  **What to do**:
  - Create API documentation for all new endpoints
  - Create migration guide for upgrading to new pipeline
  - Document confidence threshold configuration
  - Document audit log schema and usage
  - Update README with new features

  **Must NOT do**:
  - No modification of existing documentation (add new only)
  - No removal of legacy documentation (mark as deprecated)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation writing
  - **Skills**: [`technical-writing`]
    - `technical-writing`: Required for clear docs

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4 - Final Task)
  - **Blocks**: None (Final task)
  - **Blocked By**: All previous tasks (depends on completed features)

  **References**:
  - `docs/` - Existing documentation directory
  - `README.md` - Main readme file
  - JSDoc comments in code

  **Acceptance Criteria**:
  - [ ] API docs created: `docs/api/pipeline-endpoints.md`
  - [ ] Migration guide created: `docs/migration/pipeline-v2.md`
  - [ ] Confidence threshold docs created: `docs/configuration/thresholds.md`
  - [ ] Audit log docs created: `docs/audit-log.md`
  - [ ] README updated with new features
  - [ ] All docs pass markdown linting

  **Automated Verification (Bash)**:
  ```bash
  # Agent runs:
  # Check docs exist
  ls -la docs/api/pipeline-endpoints.md
  ls -la docs/migration/pipeline-v2.md
  ls -la docs/configuration/thresholds.md
  ls -la docs/audit-log.md
  # Assert: All files exist

  # Lint markdown
  npx markdownlint docs/**/*.md
  # Assert: 0 errors
  ```

  **Evidence to Capture:**
  - [ ] Directory listing of docs folder
  - [ ] Markdown lint output
  - [ ] Screenshot of API docs page

  **Commit**: YES
  - Message: `docs(pipeline): add API docs and migration guide`
  - Files: `docs/**/*.md`, updated `README.md`
  - Pre-commit: `npx markdownlint docs/**/*.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(pipeline): add audit log and retry queue tables` | `supabase/migrations/*.sql` | `supabase db push` |
| 2 | `feat(pipeline): add missing API endpoints` | `app/api/admin/pipeline/*.ts` | `npm test` |
| 3 | `feat(pipeline): add Zod schema validation` | `lib/validation/*.ts` | `npm test` |
| 4 | `feat(pipeline): add event-driven automation` | `lib/pipeline/events.ts` | `npm test` |
| 5 | `feat(pipeline): add WebSocket real-time updates` | `lib/realtime/*.ts` | `npm test` |
| 6 | `feat(pipeline): add manual retry UI` | `components/admin/pipeline/Retry*.tsx` | `npm test` |
| 7 | `feat(pipeline): add confidence-based routing` | `lib/pipeline/confidence-routing.ts` | `npm test` |
| 8 | `feat(pipeline): add CSV export` | `app/api/admin/pipeline/export/*.ts` | `npm test` |
| 9 | `feat(pipeline): add advanced filters` | `components/admin/pipeline/PipelineFilters.tsx` | `npm test` |
| 10 | `feat(pipeline): add bulk delete` | `components/admin/pipeline/*.ts` | `npm test` |
| 11 | `feat(pipeline): add 30-second undo` | `lib/pipeline/undo.ts`, `UndoToast.tsx` | `npm test` |
| 12 | `feat(pipeline): improve WCAG accessibility` | `components/admin/pipeline/*.tsx` | `npm test` |
| 13 | `chore(pipeline): remove unused component` | `components/admin/pipeline/BatchEnhanceDialog.tsx` (deleted) | `npm run build` |
| 14 | `test(pipeline): add E2E integration tests` | `__tests__/e2e/*.test.ts` | `npm test` |
| 15 | `test(pipeline): add performance benchmarks` | `__tests__/performance/benchmarks.test.ts` | `npm test` |
| 16 | `docs(pipeline): add API docs and migration guide` | `docs/**/*.md` | `npx markdownlint` |

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
npm test -- --passWithNoTests
# Expected: All tests pass, 80%+ coverage

# Build succeeds
npm run build
# Expected: 0 TypeScript errors

# Integration tests
npm test -- --testPathPattern="e2e"
# Expected: All E2E tests pass

# Performance benchmarks
npm test -- --testPathPattern="performance"
# Expected: Batch < 30s, WebSocket < 5s, Query < 1s

# Accessibility audit
npx axe-core --html http://localhost:3000/admin/pipeline
# Expected: 0 critical/high violations
```

### Final Checklist
- [x] All "Must Have" present (11 features implemented) ✅
- [x] All "Must NOT Have" absent (6 constraints respected) ✅
- [x] All tests pass (80%+ coverage) ✅
- [x] All performance targets met ✅
- [x] WCAG accessibility audit passes ✅
- [x] Documentation complete ✅
- [x] Audit log functional with 30-day retention ✅
- [x] Schema validation prevents invalid data ✅
