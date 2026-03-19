# Pipeline Rebuild - Work Plan

## TL;DR

> **Comprehensive rebuild of the product pipeline system** - Replacing 67+ cluttered files with a clean, focused 5-stage pipeline implementation.
> 
> **New Stages**: Imported → Scraped → Consolidated → Finalized → Published
> 
> **Deliverables**:
> - Database migration for new pipeline_status enum
> - Clean Next.js page with 5-stage workflow
> - Minimal API endpoints (4 endpoints vs current 11)
> - Type-safe pipeline utilities
> - Working transition logic
> 
> **Estimated Effort**: Large (8-12 tasks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Migration → Types → API → UI

---

## Context

### Current State (Broken)
The pipeline system has become a cluttered mess with:
- **67+ files** across pages, components, APIs, and lib
- Multiple overlapping implementations (PipelineClient, UnifiedPipelineClient, etc.)
- Confusing 3-stage status (registered/enriched/finalized) that oversimplifies the workflow
- Scattered logic across dozens of files
- Previous migration attempted to simplify but broke the workflow

### Target State (Clean 5-Stage Pipeline)
Proper e-commerce product ingestion workflow:

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐    ┌──────────┐
│ Imported │ → │ Scraped  │ → │ Consolidated │ → │ Finalized│ → │ Published│
│ (staging)│    │(enriched)│    │  (merged)    │    │ (ready)  │    │ (live)   │
└──────────┘    └──────────┘    └──────────────┘    └──────────┘    └──────────┘
     │                │                  │                │               │
     │           Enrichment         AI Merge         Image Select    Export to
     │           Jobs Run           & Validation     & Refinement    Storefront
     │                │                  │                │               │
```

**Stage Definitions:**
1. **Imported** (`staging`): Products from Integra/B2B import, waiting for enrichment
2. **Scraped** (`scraped`): Enriched with web data (images, descriptions, prices)
3. **Consolidated** (`consolidated`): AI merged data, ready for human review
4. **Finalized** (`finalized`): Human approved, images selected, ready to publish
5. **Published** (`published`): Live on storefront

---

## Work Objectives

### Core Objective
Replace the cluttered pipeline system with a clean, maintainable 5-stage workflow that matches the actual business process.

### Concrete Deliverables
1. **Database Migration**: New `pipeline_status` enum with 5 stages
2. **Type Definitions**: Clean TypeScript types in `lib/pipeline/types.ts`
3. **API Layer**: 4 focused endpoints (GET, POST transition, bulk, counts)
4. **UI Components**: 
   - Main pipeline page with stage navigation
   - Product cards per stage
   - Bulk action toolbar
   - Stage transition UI
5. **Transition Logic**: Proper validation and audit logging

### Definition of Done
- [ ] All 295 products migrated to new status system
- [ ] Pipeline page shows 5 stages clearly
- [ ] Can move products between stages
- [ ] Bulk actions work for each stage
- [ ] Audit trail tracks all transitions
- [ ] Old cluttered files removed/archived

### Must Have
- 5-stage status: imported, scraped, consolidated, finalized, published
- Bulk operations for each stage
- Proper transition validation
- Audit logging
- Image selection workflow for finalized stage

### Must NOT Have (Guardrails)
- NO more than 15 total pipeline files (vs current 67+)
- NO legacy status columns (clean migration)
- NO complex monitoring tabs (keep it simple)
- NO infinite component nesting
- NO duplicate API endpoints

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest + React Testing Library)
- **Automated tests**: YES (Tests after implementation)
- **Framework**: bun test (Jest)

### QA Policy
Every task includes agent-executed QA scenarios:
- **Database**: SQL queries to verify migrations
- **API**: curl requests to test endpoints
- **UI**: Component rendering verification

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Start Immediately):
├── Task 1: Database migration for new pipeline_status enum [quick]
├── Task 2: Create clean type definitions [quick]
└── Task 3: Core pipeline utilities (transitions, validation) [quick]

Wave 2 (API Layer - After Wave 1):
├── Task 4: GET /api/admin/pipeline (list products by status) [quick]
├── Task 5: POST /api/admin/pipeline/transition (status change) [quick]
├── Task 6: POST /api/admin/pipeline/bulk (bulk operations) [quick]
└── Task 7: GET /api/admin/pipeline/counts (stage counts) [quick]

Wave 3 (UI Implementation - After Wave 2):
├── Task 8: Create PipelinePage component [visual-engineering]
├── Task 9: Stage navigation tabs [visual-engineering]
├── Task 10: Product cards with stage-specific actions [visual-engineering]
├── Task 11: Bulk actions toolbar [visual-engineering]
└── Task 12: Data migration and cleanup [unspecified-high]

Wave FINAL (Verification):
├── Task F1: Test all transitions end-to-end [unspecified-high]
└── Task F2: Remove old cluttered files [git-master]

Critical Path: T1 → T2 → T3 → T4-7 → T8-12 → F1-F2
```

---

## TODOs

### Wave 1: Foundation

- [ ] 1. Create Database Migration for 5-Stage Pipeline

  **What to do**:
  - Create migration file: `supabase/migrations/20260319120000_pipeline_five_stage.sql`
  - Create new enum type: `pipeline_status_five` with values: `imported`, `scraped`, `consolidated`, `finalized`, `published`
  - Add column `pipeline_status` (using new enum) to `products_ingestion` table
  - Migrate existing data:
    - `registered` → `imported`
    - `enriched` → `scraped`  
    - `finalized` → `finalized` (keep)
  - Create index on new column
  - Drop old `pipeline_status_new` enum and column after migration
  
  **Must NOT do**:
  - Don't delete old column until data is verified
  - Don't modify existing `pipeline_status` text column yet (keep for rollback)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Reason**: Simple SQL migration, single file change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - `supabase/migrations/20260314120000_add_pipeline_status_new.sql` - Pattern to follow
  - `products_ingestion` table schema (see Context)

  **Acceptance Criteria**:
  - [ ] Migration file created with proper rollback
  - [ ] SQL applies without errors: `supabase_apply_migration`
  - [ ] New column exists with correct enum type
  - [ ] All 295 products have status migrated correctly

  **QA Scenarios**:
  ```
  Scenario: Migration applies successfully
    Tool: Bash (supabase_execute_sql)
    Steps:
      1. Run migration SQL
      2. Query: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products_ingestion' AND column_name = 'pipeline_status'
    Expected: Returns row with USER-DEFINED type
    Evidence: .sisyphus/evidence/task-1-migration.sql

  Scenario: Data migrated correctly
    Tool: Bash (supabase_execute_sql)
    Steps:
      1. Query: SELECT pipeline_status, COUNT(*) FROM products_ingestion GROUP BY pipeline_status
    Expected: Shows counts for all 5 stages (imported should have 295)
    Evidence: .sisyphus/evidence/task-1-data-migration.json
  ```

  **Commit**: YES
  - Message: `feat(db): add five-stage pipeline status enum`
  - Files: `supabase/migrations/20260319120000_pipeline_five_stage.sql`

- [ ] 2. Create Pipeline Type Definitions

  **What to do**:
  - Create file: `lib/pipeline/types.ts`
  - Define enum: `PipelineStatus = 'imported' | 'scraped' | 'consolidated' | 'finalized' | 'published'`
  - Define interface: `PipelineProduct` with all fields from current products_ingestion
  - Define interface: `StatusCount` { status: PipelineStatus; count: number }
  - Define interface: `StatusTransition` with validation rules
  - Export stage configurations (labels, colors, descriptions)

  **Must NOT do**:
  - Don't import from old pipeline files (start fresh)
  - Don't add unnecessary complexity

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed (pure TypeScript)

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 3
  - **Blocked By**: None (can design types independently)

  **References**:
  - `lib/pipeline.ts` lines 1-110 - Reference for PipelineProduct interface

  **Acceptance Criteria**:
  - [ ] File created: `lib/pipeline/types.ts`
  - [ ] All 5 statuses defined as const enum
  - [ ] PipelineProduct interface matches DB schema
  - [ ] Stage config has display info for all 5 stages

  **QA Scenarios**:
  ```
  Scenario: TypeScript compiles without errors
    Tool: Bash
    Steps:
      1. Run: `cd apps/web && tsc --noEmit lib/pipeline/types.ts`
    Expected: No TypeScript errors
    Evidence: .sisyphus/evidence/task-2-types.txt
  ```

  **Commit**: YES
  - Message: `feat(types): define five-stage pipeline types`
  - Files: `lib/pipeline/types.ts`

- [ ] 3. Implement Core Pipeline Utilities

  **What to do**:
  - Create file: `lib/pipeline/core.ts`
  - Implement `STATUS_TRANSITIONS` mapping (which stages can transition to which)
  - Implement `validateTransition(from, to)` function
  - Implement `getStageConfig(status)` helper
  - Implement `isTerminalStage(status)` check

  **Transition Rules**:
  ```typescript
  const STATUS_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
    imported: ['scraped', 'deleted'],
    scraped: ['consolidated', 'imported'], // can go back for re-scrape
    consolidated: ['finalized', 'scraped'], // can go back for re-consolidate
    finalized: ['published', 'consolidated'], // can go back for edits
    published: [], // terminal state
  };
  ```

  **Must NOT do**:
  - Don't allow arbitrary transitions (enforce rules)
  - Don't add database logic here (keep it pure)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1-2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5, Task 6
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] All transition rules implemented
  - [ ] Unit tests pass for validation logic
  - [ ] Type guards work correctly

  **QA Scenarios**:
  ```
  Scenario: Valid transitions allowed
    Tool: Bash (node REPL)
    Steps:
      1. Import validateTransition
      2. Call validateTransition('imported', 'scraped')
    Expected: Returns true
    Evidence: .sisyphus/evidence/task-3-valid-transitions.txt

  Scenario: Invalid transitions rejected
    Tool: Bash (node REPL)
    Steps:
      1. Call validateTransition('imported', 'published')
    Expected: Returns false
    Evidence: .sisyphus/evidence/task-3-invalid-transitions.txt
  ```

  **Commit**: YES
  - Message: `feat(core): implement pipeline transition logic`
  - Files: `lib/pipeline/core.ts`
  - Pre-commit: `bun test lib/pipeline/core.test.ts`

### Wave 2: API Layer

- [ ] 4. Create Pipeline List API

  **What to do**:
  - Create file: `app/api/admin/pipeline/route.ts` (replace existing)
  - GET handler: List products filtered by `status` query param
  - Support pagination: `limit`, `offset` query params
  - Support search: `search` query param (SKU or name)
  - Return: `{ products: PipelineProduct[], count: number }`
  - Use Supabase client from `lib/supabase/server`

  **Must NOT do**:
  - Don't include old filter params (clean slate)
  - Don't support legacy status values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (DB migration)

  **References**:
  - `lib/supabase/server.ts` - Server client
  - `lib/pipeline/types.ts` - Types from Task 2

  **Acceptance Criteria**:
  - [ ] GET /api/admin/pipeline?status=imported returns products
  - [ ] Pagination works (limit/offset)
  - [ ] Search filters by SKU and name
  - [ ] Returns correct count

  **QA Scenarios**:
  ```
  Scenario: List imported products
    Tool: Bash (curl)
    Steps:
      1. curl "http://localhost:3000/api/admin/pipeline?status=imported"
    Expected: Returns JSON with products array and count > 0
    Evidence: .sisyphus/evidence/task-4-list-api.json

  Scenario: Pagination works
    Tool: Bash (curl)
    Steps:
      1. curl "http://localhost:3000/api/admin/pipeline?status=imported&limit=10&offset=0"
    Expected: Returns exactly 10 products
    Evidence: .sisyphus/evidence/task-4-pagination.json
  ```

  **Commit**: YES
  - Message: `feat(api): create pipeline list endpoint`
  - Files: `app/api/admin/pipeline/route.ts`

- [ ] 5. Create Status Transition API

  **What to do**:
  - Create file: `app/api/admin/pipeline/transition/route.ts` (replace existing)
  - POST handler: Transition single product
  - Body: `{ sku: string, toStatus: PipelineStatus }`
  - Validate transition using `validateTransition` from Task 3
  - Update database: `pipeline_status`, `updated_at`
  - Log to audit table: `pipeline_audit_log`
  - Return: `{ success: boolean, updatedAt: string }`

  **Must NOT do**:
  - Don't allow invalid transitions (check before update)
  - Don't skip audit logging

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (DB), Task 3 (validation)

  **Acceptance Criteria**:
  - [ ] POST transitions product status
  - [ ] Invalid transitions return 400 error
  - [ ] Audit log entry created
  - [ ] Returns updated timestamp

  **QA Scenarios**:
  ```
  Scenario: Valid transition succeeds
    Tool: Bash (curl)
    Steps:
      1. curl -X POST -H "Content-Type: application/json" -d '{"sku":"TEST001","toStatus":"scraped"}' http://localhost:3000/api/admin/pipeline/transition
    Expected: Returns { success: true }
    Evidence: .sisyphus/evidence/task-5-transition.json

  Scenario: Invalid transition rejected
    Tool: Bash (curl)
    Steps:
      1. curl -X POST -H "Content-Type: application/json" -d '{"sku":"TEST001","toStatus":"published"}' http://localhost:3000/api/admin/pipeline/transition
    Expected: Returns 400 with error message
    Evidence: .sisyphus/evidence/task-5-invalid-transition.json
  ```

  **Commit**: YES
  - Message: `feat(api): add status transition endpoint`
  - Files: `app/api/admin/pipeline/transition/route.ts`

- [ ] 6. Create Bulk Operations API

  **What to do**:
  - Create file: `app/api/admin/pipeline/bulk/route.ts` (replace existing)
  - POST handler: Bulk transition multiple products
  - Body: `{ skus: string[], toStatus: PipelineStatus }`
  - Validate all transitions before updating (all-or-nothing)
  - Update all products in single query (using `.in('sku', skus)`)
  - Log single audit entry for bulk action
  - Return: `{ success: boolean, updatedCount: number }`

  **Must NOT do**:
  - Don't do N+1 queries (batch update)
  - Don't partial update (all-or-nothing validation)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 11
  - **Blocked By**: Task 1 (DB), Task 3 (validation)

  **Acceptance Criteria**:
  - [ ] Bulk transition updates all products
  - [ ] Validation is all-or-nothing
  - [ ] Single audit log entry created
  - [ ] Returns correct updated count

  **QA Scenarios**:
  ```
  Scenario: Bulk transition succeeds
    Tool: Bash (curl)
    Steps:
      1. curl -X POST -H "Content-Type: application/json" -d '{"skus":["SKU1","SKU2"],"toStatus":"scraped"}' http://localhost:3000/api/admin/pipeline/bulk
    Expected: Returns { success: true, updatedCount: 2 }
    Evidence: .sisyphus/evidence/task-6-bulk.json
  ```

  **Commit**: YES
  - Message: `feat(api): add bulk operations endpoint`
  - Files: `app/api/admin/pipeline/bulk/route.ts`

- [ ] 7. Create Stage Counts API

  **What to do**:
  - Create file: `app/api/admin/pipeline/counts/route.ts` (replace existing)
  - GET handler: Return counts per stage
  - Single query using `GROUP BY pipeline_status`
  - Return: `{ counts: StatusCount[] }`
  - Include all 5 stages (even if count is 0)

  **Must NOT do**:
  - Don't make 5 separate queries (use GROUP BY)

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8
  - **Blocked By**: Task 1 (DB)

  **Acceptance Criteria**:
  - [ ] Returns counts for all 5 stages
  - [ ] Single efficient query
  - [ ] Handles empty stages (shows 0)

  **QA Scenarios**:
  ```
  Scenario: Get stage counts
    Tool: Bash (curl)
    Steps:
      1. curl http://localhost:3000/api/admin/pipeline/counts
    Expected: Returns { counts: [{status:'imported',count:295}, ...] }
    Evidence: .sisyphus/evidence/task-7-counts.json
  ```

  **Commit**: YES
  - Message: `feat(api): add stage counts endpoint`
  - Files: `app/api/admin/pipeline/counts/route.ts`

### Wave 3: UI Implementation

- [ ] 8. Create PipelinePage Component

  **What to do**:
  - Create file: `app/admin/pipeline/page.tsx` (replace existing)
  - Server Component: Fetch initial data (counts, first stage products)
  - Pass data to Client Component
  - Include SEO metadata
  - Use proper error boundaries

  **Must NOT do**:
  - Don't include complex state management in server component
  - Don't fetch all stages at once (fetch current only)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Reason**: UI-focused, needs good component structure

  **Parallelization**:
  - **Can Run In Parallel**: NO (needs APIs from Wave 2)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9, 10, 11
  - **Blocked By**: Task 4, 7

  **References**:
  - Current `app/admin/pipeline/page.tsx` - For reference only

  **Acceptance Criteria**:
  - [ ] Page renders without errors
  - [ ] Fetches counts and initial products
  - [ ] Passes data to client component

  **QA Scenarios**:
  ```
  Scenario: Page loads successfully
    Tool: playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Wait for content to load
      3. Screenshot
    Expected: Page shows pipeline with stage counts
    Evidence: .sisyphus/evidence/task-8-page-load.png
  ```

  **Commit**: YES
  - Message: `feat(ui): create pipeline page component`
  - Files: `app/admin/pipeline/page.tsx`

- [ ] 9. Create Stage Navigation Tabs

  **What to do**:
  - Create file: `components/admin/pipeline/StageTabs.tsx`
  - Client Component with 'use client'
  - Display 5 tabs: Imported, Scraped, Consolidated, Finalized, Published
  - Show count badge on each tab
  - Active tab highlight
  - Click switches stage view
  - Call `onStageChange` callback

  **Must NOT do**:
  - Don't fetch data in this component (receive via props)
  - Don't add complex animations (keep simple)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `using-shadcn-ui`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8 (integration)
  - **Blocked By**: None (pure UI)

  **References**:
  - `components/ui/tabs.tsx` - shadcn tabs component

  **Acceptance Criteria**:
  - [ ] 5 tabs display with correct labels
  - [ ] Count badges show correct numbers
  - [ ] Active tab is visually distinct
  - [ ] Click calls onStageChange

  **QA Scenarios**:
  ```
  Scenario: Tab navigation works
    Tool: playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Click "Scraped" tab
      3. Verify URL or state change
      4. Screenshot
    Expected: Shows scraped products
    Evidence: .sisyphus/evidence/task-9-tabs.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add stage navigation tabs`
  - Files: `components/admin/pipeline/StageTabs.tsx`

- [ ] 10. Create Product Cards

  **What to do**:
  - Create file: `components/admin/pipeline/ProductCard.tsx`
  - Display: SKU, name, price, status badge
  - Stage-specific action buttons:
    - Imported: "Enrich" button → transitions to Scraped
    - Scraped: "Consolidate" button → transitions to Consolidated
    - Consolidated: "Finalize" button → transitions to Finalized
    - Finalized: "Publish" button → transitions to Published
    - Published: No actions (view only)
  - Checkbox for bulk selection
  - Click to view details

  **Must NOT do**:
  - Don't implement detail view (keep card simple)
  - Don't add edit functionality (just transitions)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `using-shadcn-ui`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8 (integration)
  - **Blocked By**: None (pure UI)

  **Acceptance Criteria**:
  - [ ] Card displays product info
  - [ ] Stage-specific button shown
  - [ ] Checkbox for selection
  - [ ] Click triggers onView callback

  **QA Scenarios**:
  ```
  Scenario: Product card displays correctly
    Tool: playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Screenshot of product card
    Expected: Card shows SKU, name, status, action button
    Evidence: .sisyphus/evidence/task-10-card.png
  ```

  **Commit**: YES
  - Message: `feat(ui): create stage-specific product cards`
  - Files: `components/admin/pipeline/ProductCard.tsx`

- [ ] 11. Create Bulk Actions Toolbar

  **What to do**:
  - Create file: `components/admin/pipeline/BulkToolbar.tsx`
  - Show when products selected
  - Display: "X products selected"
  - Stage-specific bulk actions:
    - Imported: "Move to Scraped"
    - Scraped: "Move to Consolidated"
    - Consolidated: "Move to Finalized"
    - Finalized: "Publish Selected"
  - Clear selection button
  - Call API: POST /api/admin/pipeline/bulk

  **Must NOT do**:
  - Don't show actions for Published stage (terminal)
  - Don't allow mixed-status bulk operations

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `using-shadcn-ui`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 8 (integration)
  - **Blocked By**: Task 6 (bulk API)

  **Acceptance Criteria**:
  - [ ] Shows when products selected
  - [ ] Bulk action button calls API
  - [ ] Success refreshes product list
  - [ ] Error shows toast notification

  **QA Scenarios**:
  ```
  Scenario: Bulk action works
    Tool: playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Select 2 products
      3. Click "Move to Scraped"
      4. Verify products moved
    Expected: Products transition to Scraped stage
    Evidence: .sisyphus/evidence/task-11-bulk-action.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add bulk actions toolbar`
  - Files: `components/admin/pipeline/BulkToolbar.tsx`

- [ ] 12. Integrate All Components in PipelineClient

  **What to do**:
  - Create file: `components/admin/pipeline/PipelineClient.tsx`
  - Client component orchestrating the entire UI
  - State: `currentStage`, `selectedProducts`, `products`, `counts`
  - Fetch products when stage changes
  - Handle bulk operations
  - Render: StageTabs, ProductGrid, BulkToolbar
  - Use React Query or SWR for data fetching (optional)

  **Must NOT do**:
  - Don't duplicate state (single source of truth)
  - Don't fetch all stages at once

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: NO (integrates all)
  - **Parallel Group**: Wave 3
  - **Blocks**: Final Verification
  - **Blocked By**: Task 8, 9, 10, 11

  **Acceptance Criteria**:
  - [ ] All components integrate smoothly
  - [ ] Stage switching works
  - [ ] Bulk actions work
  - [ ] Selection state managed correctly

  **QA Scenarios**:
  ```
  Scenario: Full workflow works
    Tool: playwright
    Steps:
      1. Navigate to /admin/pipeline
      2. Select product
      3. Move to next stage
      4. Verify transition
    Expected: Product moves through pipeline
    Evidence: .sisyphus/evidence/task-12-workflow.png
  ```

  **Commit**: YES
  - Message: `feat(ui): integrate all pipeline components`
  - Files: `components/admin/pipeline/PipelineClient.tsx`

### Wave FINAL: Cleanup

- [ ] F1. Test All Transitions End-to-End

  **What to do**:
  - Create test: `__tests__/e2e/pipeline.test.ts`
  - Test each transition path:
    - Imported → Scraped
    - Scraped → Consolidated
    - Consolidated → Finalized
    - Finalized → Published
  - Test invalid transitions (should fail)
  - Test bulk operations
  - Verify audit logs created

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: All implementation tasks

  **Acceptance Criteria**:
  - [ ] All 4 main transitions tested
  - [ ] Invalid transitions rejected
  - [ ] Audit logs verified
  - [ ] Tests pass: `bun test __tests__/e2e/pipeline.test.ts`

  **QA Scenarios**:
  ```
  Scenario: E2E test suite passes
    Tool: Bash
    Steps:
      1. Run: `bun test __tests__/e2e/pipeline.test.ts`
    Expected: All tests pass
    Evidence: .sisyphus/evidence/task-f1-test-results.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add pipeline transition tests`
  - Files: `__tests__/e2e/pipeline.test.ts`

- [ ] F2. Archive Old Pipeline Files

  **What to do**:
  - Move old cluttered files to archive:
    - All files in `components/admin/pipeline/` (except new ones)
    - Old API routes in `app/api/admin/pipeline/`
    - Old lib files
  - Create archive directory: `apps/web/.archive/pipeline-old/`
  - Update imports in any files that reference old components
  - Document what was archived

  **Must NOT do**:
  - Don't delete files immediately (archive first)
  - Don't break other parts of admin

  **Recommended Agent Profile**:
  - **Category**: `git-master`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: All tasks, F1

  **Acceptance Criteria**:
  - [ ] Old files archived
  - [ ] Build still passes
  - [ ] No import errors

  **QA Scenarios**:
  ```
  Scenario: Build passes after cleanup
    Tool: Bash
    Steps:
      1. Run: `cd apps/web && bun run build`
    Expected: Build completes without errors
    Evidence: .sisyphus/evidence/task-f2-build.txt
  ```

  **Commit**: YES
  - Message: `refactor(pipeline): archive old cluttered files`
  - Files: All moved to `.archive/`

---

## Commit Strategy

- **Wave 1**: Group commits by task (1 commit per task)
- **Wave 2**: Group commits by task (1 commit per task)
- **Wave 3**: Group commits by task (1 commit per task)
- **Wave FINAL**: 1 commit for tests, 1 commit for cleanup

---

## Success Criteria

### Verification Commands
```bash
# Build
cd apps/web && bun run build

# Tests
bun test __tests__/e2e/pipeline.test.ts

# Type check
tsc --noEmit

# Lint
bun run lint
```

### Final Checklist
- [ ] All 5 pipeline stages work correctly
- [ ] Products can move through entire workflow
- [ ] Bulk operations work
- [ ] Audit trail tracks transitions
- [ ] UI is clean and intuitive
- [ ] Old cluttered files archived
- [ ] Build passes
- [ ] Tests pass
