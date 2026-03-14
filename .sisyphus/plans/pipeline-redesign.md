# Pipeline Redesign: Export-Focused Product Data Pipeline

## TL;DR

> Redesign the product pipeline from storefront-centric to **export-focused**. New flow: `registered → enriched → finalized` with Excel export as the primary deliverable for uploading to the external live site. Keep storefront publishing as a secondary option.
> 
> **Deliverables**: Database migration (3-status enum), Backend API updates (export endpoint), UI reorganization (Image Selection workspace), Streaming Excel export
> 
> **Estimated Effort**: Large (5 waves, 20 tasks)
> **Parallel Execution**: YES - 4-5 tasks per wave
> **Critical Path**: T1 → T2 → T3 → T4 → T5 → T8 → T9 → T10 → T11 → T19 → T20 → F1-F4

---

## Context

### Original Request
Restructure the cluttered pipeline to focus on **Excel export for external site upload** (not storefront publishing). Current pipeline tries to do too much with unclear end goals.

### New Pipeline Flow
```
registered (import from register: SKU, Price, Name)
    ↓
enriched (after scrape + AI consolidation)
    ↓
finalized (after manual image selection - ready for export)
```

**Note**: Export is a log, not a status. Products stay in `finalized` for re-export.

### Key Decisions Made
1. **Pipeline Stages**: 3-stage flow (registered → enriched → finalized). Export is a log, not a status.
2. **Export Fields**: All consolidated fields in flat structure
3. **Storefront Publishing**: Keep as secondary option
4. **Automation**: Semi-automated (manual triggers)
5. **Export Format**: Single .xlsx file, streaming for 100-1000 products
6. **Re-export**: Products stay in 'finalized', can export multiple times
7. **Migration**: Smart migration (staging→registered, scraped→enriched, consolidated→finalized, published→finalized)

### Research Findings
- Current UI is 825-line UnifiedPipelineClient (too complex)
- batch-service.ts is 900+ lines (needs refactoring)
- Dual data paths: legacy scrape_results + sources JSONB
- Export exists but buried in tab (not primary workflow)
- EnrichmentWorkspace handles too much (review + config + re-scrape + conflict resolution)

---

## Work Objectives

### Core Objective
Transform the pipeline from storefront-centric to export-focused, with explicit manual image selection step and Excel export as primary output.

### Concrete Deliverables
1. **Database**: New `pipeline_status` enum with 3 values + migration script
2. **Backend**: Status transition validation, streaming export endpoint
3. **UI**: Dedicated Image Selection workspace, simplified Enrichment workspace
4. **Migration**: Script to migrate existing products to new statuses

### Definition of Done
- [ ] New 3-status enum active in database
- [ ] Existing products migrated to new statuses
- [ ] Image Selection workspace functional
- [ ] Export generates streaming .xlsx with all consolidated fields
- [ ] Products stay in 'finalized' after export (re-export supported)
- [ ] Storefront publishing works as secondary option

### Must Have
- [ ] 3 pipeline statuses: `registered`, `enriched`, `finalized`
- [ ] Manual image selection as explicit step
- [ ] Streaming Excel export (handles 100-1000 products)
- [ ] Smart migration for existing products
- [ ] Status transition guards

### Must NOT Have
- [ ] NO automatic status transitions (keep manual)
- [ ] NO changes to AI consolidation logic
- [ ] NO changes to scraper trigger mechanism
- [ ] NO image downloading (just URLs)
- [ ] NO storefront as primary path

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest + React Testing Library)
- **Automated tests**: Tests-after
- **Framework**: bun test

### QA Policy
Every task includes agent-executed QA scenarios with specific tool, steps, and expected results.

---

## Execution Strategy

### Parallel Execution Waves

```
```
Wave 1 (Foundation - can start immediately):
├── T1: Create new status types
└── T4: Add selected_images column

Wave 2 (After Wave 1):
├── T2: Database migration (depends: T1)
└── T3: Status transition validation (depends: T1)

Wave 3 (Backend - after Wave 2):
├── T5: Update pipeline CRUD (depends: T2, T3)
├── T6: Streaming Excel export endpoint (independent)
├── T7: Status transition API (depends: T3)
└── T8: Update bulk actions (depends: T5)

Wave 4 (UI - after Wave 1 & 3):
├── T9: Build Image Selection workspace (depends: T4)
├── T10: Simplify Enrichment workspace (depends: T9)
├── T11: Update Pipeline Dashboard (depends: T10)
├── T12: Build Export workspace (depends: T6)
└── T13: Update navigation (depends: T11, T12)

Wave 5 (Routes - after Wave 4):
├── T19: Create image selection page (depends: T9)
└── T20: Create export page (depends: T12)

Wave 6 (Integration - after Wave 3 & 5):
├── T14: Data migration script (depends: T2, T5, T8)
├── T15: Storefront publishing (depends: T14)
├── T16: Integration tests (depends: T9-T15)
├── T17: Build verification (depends: T6, T9, T14)
└── T18: Documentation (depends: T16, T17)

Wave FINAL (QA - after Wave 6):
├── F1: Plan compliance audit
├── F2: Code quality review
├── F3: Real manual QA
└── F4: Migration safety check
```
├── T1: Create new status types
├── T2: Database migration
├── T3: Status transition validation
└── T4: Add selected_images column
```

### Dependency Matrix
Wave 2 (Backend):
├── T5: Update pipeline CRUD
├── T6: Streaming Excel export endpoint
├── T7: Status transition API
└── T8: Update bulk actions

Wave 3 (UI):
├── T9: Build Image Selection workspace
├── T10: Simplify Enrichment workspace
├── T11: Update Pipeline Dashboard
├── T12: Build Export workspace
└── T13: Update navigation

Wave 4 (Integration):
├── T14: Data migration script
├── T15: Storefront publishing
├── T16: Integration tests
├── T17: Build verification
└── T18: Documentation

Wave 5 (Routes):
├── T19: Create image selection page
└── T20: Create export page

Wave FINAL (QA):
├── F1: Plan compliance audit
├── F2: Code quality review
├── F3: Real manual QA
└── F4: Migration safety check
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 | — | T2, T3, T4 |
| T2 | T1 | T5, T14 |
| T3 | T1 | T5, T7 |
| T4 | — | T9 |
| T5 | T2, T3 | T8, T14 |
| T6 | — | T12 |
| T7 | T3 | — |
| T8 | T5 | T14 |
| T9 | T4 | T10, T11 |
| T10 | T9 | T11 |
| T11 | T9, T10 | T13 |
| T12 | T6 | T13 |
| T13 | T11, T12 | — |
| T14 | T2, T5, T8 | F1-F4 |
| T15 | T14 | F1-F4 |
| T16 | T9-T15 | F1-F4 |
| T17 | T6, T9, T14 | F1-F4 |
| T18 | T16, T17 | F1-F4 |
| T19 | T9 | F1-F4 |
| T20 | T12 | F1-F4 |
| F1-F4 | T14-T20 | — |

---

## TODOs

### Wave 1: Foundation

- [ ] **T1. Create New Pipeline Status Types**
  - Create type: `'registered' | 'enriched' | 'finalized'`
  - Create `STATUS_TRANSITIONS` constant
  - Add validation utility
  - **QA**:
    - **Tool**: `Bash`
    - **Steps**: 
      1. Run `bun run web tsc --noEmit`
    - **Expected**: TypeScript compilation succeeds with no errors

- [ ] **T2. Database Migration**
  - Create migration for new status enum
  - Map: staging→registered, scraped→enriched, consolidated→finalized, published→finalized
  - **QA**: `supabase db reset` applies cleanly, status counts correct

- [ ] **T3. Status Transition Validation**
  - Create `validateStatusTransition()` function
  - Test all valid transitions
  - **QA**: Unit tests pass for all transitions

- [ ] **T4. Add selected_images Column**
  - Add JSONB column to products_ingestion
  - Create helper functions
  - **QA**: Column exists after migration

### Wave 2: Backend

- [ ] **T5. Update Pipeline CRUD**
  - Update getProductsByStatus, bulkUpdateStatus, getStatusCounts
  - Use new status enum
  - **QA**: Query by new status returns correct products

- [ ] **T6. Build Streaming Excel Export**
  - Create `/api/admin/pipeline/export`
  - Use streaming xlsx library
  - Query 'finalized' products
  - **QA**: Export 1000 products, memory stays under 200MB

- [ ] **T7. Create Status Transition API**
  - POST endpoint with validation
  - Update database atomically
  - **QA**: Valid transitions work, invalid returns 400

- [ ] **T8. Update Bulk Actions**
  - Add moveToEnriched, moveToFinalized
  - Validate all before updating
  - **QA**: Bulk update 5 products successfully

### Wave 3: UI

- [ ] **T9. Build Image Selection Workspace**
  - Display image_candidates gallery
  - Click to select/deselect (max 10)
  - Save to selected_images
  - **QA**: Select 3 images, save, verify in database

- [ ] **T10. Simplify Enrichment Workspace**
  - Remove image selection
  - Remove conflict resolution
  - Keep scrape/consolidate triggers
  - **QA**: Workspace loads, triggers work

- [ ] **T11. Update Pipeline Dashboard**
  - Update filters for 3 statuses
  - Update status counts
  - Add action buttons
  - **QA**: Filters show correct statuses

- [ ] **T12. Build Export Workspace**
  - Show 'finalized' count
  - Generate export button
  - Download link
  - **QA**: Generate and download Excel

- [ ] **T13. Update Navigation**
  - Add Pipeline submenu
  - Links: Dashboard, Image Selection, Export
  - **QA**: All navigation links work

### Wave 4: Integration

- [ ] **T14. Data Migration Script**
  - Backup before migration
  - Batch processing (100 at a time)
  - Rollback capability
  - **QA**: Migration successful, counts match

- [ ] **T15. Storefront Publishing**
  - Create publish endpoint
  - Copy from products_ingestion to products
  - Show "In Storefront" badge
  - **QA**: Publish button works, product in storefront

- [ ] **T16. Integration Tests**
  - Full workflow test
  - Status transitions
  - Export validation
  - **QA**: All integration tests pass

- [ ] **T17. Build Verification**
  - TypeScript check
  - Lint check
  - Test run
  - Production build
  - **QA**: All checks pass

- [ ] **T18. Documentation**
  - Document new workflow
  - Document image selection
  - Document export process
  - **QA**: Docs complete and accurate

### Wave 5: Routes

- [ ] **T19. Create Image Selection Page**
  - Route: `/admin/pipeline/image-selection`
  - Handle ?sku param
  - Mount ImageSelectionWorkspace
  - **QA**: Page loads with sku param

- [ ] **T20. Create Export Page**
  - Route: `/admin/pipeline/export`
  - Mount ExportWorkspace
  - **QA**: Page loads

---

## Final Verification Wave

> Run after T14-T20 complete. ALL must pass.

- [ ] **F1. Plan Compliance Audit** — `oracle`
  - **QA**: Read all TODOs, verify implementations exist
  - **Tool**: `Read`, `Glob`
  - **Expected**: Tasks [20/20], Evidence files present

- [ ] **F2. Code Quality Review** — `unspecified-high`
  - **QA**: Run all quality checks
  - **Tool**: `Bash`
  - **Steps**: Run `bun run web tsc --noEmit`, `bun run web lint`, `bun run web test`
  - **Expected**: All pass, no errors

- [ ] **F3. Real Manual QA** — `unspecified-high`
  - **QA**: Execute full workflow
  - **Tool**: `playwright`
  - **Steps**: Import → Scrape → Consolidate → Image Select → Export
  - **Expected**: All steps work, Excel valid

- [ ] **F4. Migration Safety Check** — `deep`
  - **QA**: Verify migration safety
  - **Tool**: `Bash`, `supabase_execute_sql`
  - **Steps**: Test migration, test rollback, verify no data loss
  - **Expected**: Migration safe, rollback works

---

## Commit Strategy

- **Wave 1** (T1-T4): Individual commits
- **Wave 2** (T5-T8): Individual commits
- **Wave 3** (T9-T13): Individual commits
- **Wave 4** (T14-T18): Individual commits
- **Wave 5** (T19-T20): Individual commits
- **Final** (F1-F4): No commits

---

## Success Criteria

### Verification Commands
```bash
# TypeScript build
cd apps/web && bun run tsc --noEmit
# Expected: No errors

# Tests
bun run web test
# Expected: All tests pass

# Lint
bun run web lint
# Expected: No errors

# Build
bun run web build
# Expected: Success

# Export test
curl -o /tmp/test.xlsx http://localhost:3000/api/admin/pipeline/export
file /tmp/test.xlsx
# Expected: "Microsoft Excel 2007+"
```

### Final Checklist
- [ ] All 3 pipeline statuses work
- [ ] Status transitions validated
- [ ] Image selection functional
- [ ] Streaming export works (100-1000 products)
- [ ] Re-export supported
- [ ] Migration safe
- [ ] Storefront publishing works
- [ ] All tests pass

---

## Plan Generated: pipeline-redesign

**Key Decisions:**
- 3 statuses: registered → enriched → finalized
- Export is log, not status
- Streaming export for 100-1000 products
- Smart migration

Plan saved to: `.sisyphus/plans/pipeline-redesign.md`
