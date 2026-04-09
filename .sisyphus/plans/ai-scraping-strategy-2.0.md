# AI Scraping Strategy 2.0 - Work Plan

## TL;DR

> **Core Objective**: Transform the scraper from sequential per-SKU processing to cohort-based product line batch processing using UPC prefix matching for improved data consistency and efficiency.
>
> **Deliverables**:
> - Cohort grouping engine in runner (extracted from AI Search pattern)
> - Product line detection via UPC prefix matching
> - Two-phase consolidation with sibling context
> - Local CLI testing suite (batch testing, cohort viz, benchmarking)
> - Frontend UI for product line management and monitoring
>
> **Estimated Effort**: Large (4-6 weeks)
> **Parallel Execution**: YES - 4 waves with 7-8 tasks each
> **Critical Path**: Data model → Cohort engine → CLI tools → Integration → QA

---

## Context

### Original Request
Revise AI Scraping Strategy to support identification of products from the same brand/product line. Currently testing solutions for products in same product lines, but implementation is fragile. Need changes to runner, backend, and frontend with local CLI testing for optimization.

### Technical Decisions Confirmed
- **Product Line Detection**: UPC prefix matching (first 8-10 digits)
- **Consistency Scope**: Core identity only (brand, category, base description)
- **CLI Testing**: All capabilities (batch testing, cohort viz, benchmarking)
- **Migration Strategy**: Big bang (full cutover after testing)
- **Integration**: crawl4ai for extraction + Gemini for search/navigation

### Current Architecture Pain Points
1. Sequential per-SKU processing in `runner/__init__.py` (1166 lines)
2. No product line awareness - each product processed in isolation
3. AI Search has cohort logic (`_build_cohort_key()`) but static scrapers don't
4. Consolidation treats each product independently
5. `product_groups` table exists but is manual-only

### Key Insight from Research
The AI Search scraper (`scrapers/ai_search/scraper.py`) already implements cohort-based batch processing with domain preference locking. This pattern can be extracted and generalized for all scraper types.

---

## Work Objectives

### Core Objective
Transform the scraper architecture from sequential per-SKU processing to cohort-based product line batch processing using UPC prefix matching, enabling cross-product consistency and improved data quality.

### Concrete Deliverables
- **Data Model**: `product_line` column, cohort metadata, batch tracking
- **Runner Engine**: `CohortProcessor` class extracted from AI Search pattern
- **Backend**: Enhanced consolidation with sibling context injection
- **CLI Tools**: `bsr batch`, `bsr cohort`, `bsr benchmark` commands
- **Frontend UI**: Product line management dashboard, batch monitoring

### Definition of Done
- [ ] CLI can test product line batches locally with full visibility
- [ ] Runner groups products by UPC prefix before scraping
- [ ] Consolidation includes sibling product context for consistency
- [ ] All existing tests pass + new cohort tests added
- [ ] Frontend shows product line batches and their status

### Must Have
- UPC prefix matching for product line detection
- Cohort-based processing extracted from AI Search pattern
- Two-phase consolidation (raw + consistency pass)
- Local CLI testing for all operations
- Big bang migration with rollback plan

### Must NOT Have (Guardrails)
- NO changes to existing SKU primary key strategy
- NO breaking changes to API contracts (backward compatible)
- NO manual product line curation required (automatic detection)
- NO changes to crawl4ai integration (use existing modes)
- NO support for non-UPC SKU formats in 2.0 (future enhancement)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest for scraper, Jest for web)
- **Automated tests**: YES (Tests after implementation for new features)
- **Framework**: pytest (scraper), Jest + RTL (web)
- **Agent-Executed QA**: MANDATORY for all tasks

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **CLI/Runner**: Use tmux for interactive commands, validate output, check exit codes
- **Backend**: Use curl for API validation, parse JSON responses
- **Frontend**: Use Playwright for UI flows, screenshot evidence
- **Database**: SQL queries to verify data state

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Data Model & Core Engine):
├── Task 1: Add product_line column to products_ingestion [quick]
├── Task 2: Create cohort metadata schema [quick]
├── Task 3: Extract CohortProcessor from AI Search [deep]
├── Task 4: UPC prefix detection utility [quick]
├── Task 5: Cohort grouping algorithm [deep]
└── Task 6: Batch tracking schema updates [quick]

Wave 2 (Runner Enhancement - MAX PARALLEL):
├── Task 7: Cohort-aware job processor [deep]
├── Task 8: Modify runner/__init__.py for batch processing [deep]
├── Task 9: Update WorkflowExecutor for cohort context [unspecified-high]
├── Task 10: Cohort result aggregation [unspecified-high]
├── Task 11: Update daemon.py for cohort claiming [quick]
└── Task 12: Migration script for existing data [unspecified-high]

Wave 3 (Backend & Consolidation):
├── Task 13: Enhanced ProductSource with sibling context [quick]
├── Task 14: Two-phase consolidation service [deep]
├── Task 15: Prompt builder with cohort context [unspecified-high]
├── Task 16: Consistency validation rules [unspecified-high]
├── Task 17: API endpoints for cohort operations [quick]
└── Task 18: Batch job routing by product line [quick]

Wave 4 (CLI Tools - MAX PARALLEL):
├── Task 19: CLI entry point and command structure [quick]
├── Task 20: bsr batch test command [unspecified-high]
├── Task 21: bsr cohort visualize command [unspecified-high]
├── Task 22: bsr benchmark extraction command [unspecified-high]
├── Task 23: Local test data fixtures [quick]
└── Task 24: CLI documentation and help [writing]

Wave 5 (Frontend UI):
├── Task 25: Product line list page [visual-engineering]
├── Task 26: Cohort batch monitoring dashboard [visual-engineering]
├── Task 27: Product line detail view [visual-engineering]
├── Task 28: Batch status indicators [visual-engineering]
└── Task 29: Integration with existing admin [quick]

Wave FINAL (Integration & QA):
├── Task 30: End-to-end integration test [unspecified-high]
├── Task 31: Performance benchmarking [unspecified-high]
├── Task 32: Migration dry-run and validation [deep]
├── Task 33: Rollback procedure documentation [writing]
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review [unspecified-high]
├── Task F3: Real manual QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]
-> Present results -> Get explicit user okay

Critical Path: T1-6 → T7-12 → T13-18 → T19-24 → T25-29 → T30-33 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 8 (Wave 2)
```

### Dependency Matrix (Abbreviated)
- **1-6**: Foundation schema and engine → 7-12
- **7-12**: Runner cohort support → 13-18, 19-24
- **13-18**: Backend consolidation → 25-29
- **19-24**: CLI tools (mostly independent) → 30
- **25-29**: Frontend (depends on 13-18 APIs) → 30
- **30-33**: Integration (depends on all implementation)

### Agent Dispatch Summary
- **Wave 1**: 2 quick, 2 deep, 2 quick → `quick`, `deep`
- **Wave 2**: 1 deep, 1 deep, 3 unspecified-high, 1 quick → `deep`, `unspecified-high`, `quick`
- **Wave 3**: 2 quick, 1 deep, 3 unspecified-high → `quick`, `deep`, `unspecified-high`
- **Wave 4**: 2 quick, 3 unspecified-high, 1 writing → `quick`, `unspecified-high`, `writing`
- **Wave 5**: 4 visual-engineering, 1 quick → `visual-engineering`, `quick`
- **Wave FINAL**: 2 unspecified-high, 1 deep, 1 writing, 4 review → mixed

---

## TODOs

---

### Wave 1: Foundation (Data Model & Core Engine)

- [x] 1. Add product_line column to products_ingestion table

  **What to do**:
  - Create migration to add `product_line` text column to `products_ingestion` table
  - Add index on `product_line` for efficient querying
  - Update TypeScript types in `lib/database.types.ts`
  - Add `product_line` to `ProductIngestion` interface

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**: Wave 1 - can run in parallel with tasks 2-6

  **Acceptance Criteria**:
  - [ ] Migration applies cleanly
  - [ ] TypeScript compiles without errors

  **Commit**: `feat(data): add product_line column to products_ingestion`

- [x] 2. Create cohort metadata schema

  **What to do**:
  - Create `cohort_batches` table to track cohort processing
  - Create `cohort_members` junction table
  - Add foreign keys and indexes

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(data): create cohort metadata schema`

- [x] 3. Extract CohortProcessor from AI Search pattern

  **What to do**:
  - Analyze `scrapers/ai_search/scraper.py` cohort logic
  - Extract reusable `CohortProcessor` class
  - Generalize for use with any scraper type

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Commit**: `feat(runner): extract CohortProcessor from AI Search`

- [x] 4. Create UPC prefix detection utility

  **What to do**:
  - Create utility module for UPC validation and prefix extraction
  - Handle edge cases: short UPCs, non-numeric, leading zeros

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(utils): add UPC validation and prefix extraction`

- [x] 5. Implement cohort grouping algorithm

  **What to do**:
  - Implement product grouping by UPC prefix
  - Support configurable prefix length (default 8 digits)
  - Handle edge cases: mixed UPC lengths, invalid UPCs

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Commit**: `feat(runner): implement cohort grouping algorithm`

- [x] 6. Create batch tracking schema updates

  **What to do**:
  - Update `scrape_jobs` table to track cohort_id
  - Add cohort status to job tracking
  - Update TypeScript types

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(data): add cohort tracking to scrape_jobs`

### Wave 2: Runner Enhancement

- [x] 7. Create cohort-aware job processor

  **What to do**:
  - Create new job processor that handles cohorts
  - Process all products in cohort together
  - Share context across cohort members

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Commit**: `feat(runner): create cohort-aware job processor`

- [x] 8. Modify runner/__init__.py for batch processing

  **What to do**:
  - Refactor 1166-line runner/__init__.py
  - Add cohort processing path alongside sequential
  - Maintain backward compatibility

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Commit**: `feat(runner): add cohort batch processing to runner`

- [x] 9. Update WorkflowExecutor for cohort context

  **What to do**:
  - Pass cohort context through workflow steps
  - Enable shared browser sessions for cohort
  - Optimize for product line pages

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(runner): update WorkflowExecutor for cohort context`

- [x] 10. Implement cohort result aggregation

  **What to do**:
  - Aggregate results from all cohort members
  - Detect inconsistencies across cohort
  - Generate cohort-level metadata

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(runner): implement cohort result aggregation`

- [x] 11. Update daemon.py for cohort claiming

  **What to do**:
  - Modify chunk claiming to support cohort batches
  - Claim entire cohorts instead of individual SKUs
  - Update callback format for cohort results

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(runner): update daemon for cohort claiming`

- [x] 12. Create migration script for existing data

  **What to do**:
  - Script to detect product lines in existing products
  - Populate cohort_batches for historical data
  - Backfill product_line column

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(data): add migration script for product line detection`

- [ ] F1. Plan Compliance Audit - `oracle`

  **What to do**:
  - Verify all requirements from plan are implemented
  - Check all guardrails are respected
  - Validate evidence files exist for all tasks
  - Review 1:1 spec-to-implementation mapping

  **Recommended Agent Profile**:
  - **Category**: `oracle`

  **Output**: Compliance report with APPROVE/REJECT verdict

- [ ] F2. Code Quality Review - `unspecified-high`

  **What to do**:
  - Run full test suite (pytest + Jest)
  - Run linting (ruff for Python, ESLint for TypeScript)
  - Run type checking (mypy + tsc)
  - Review for anti-patterns (any, console.log, empty catches)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Output**: Quality report with PASS/FAIL for each check

- [ ] F3. Real Manual QA - `unspecified-high`

  **What to do**:
  - Execute all QA scenarios from all tasks
  - Test integration points (runner → backend → frontend)
  - Test edge cases: empty cohorts, single-product lines, large batches
  - Capture evidence screenshots/logs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Output**: QA report with scenario pass/fail status

- [ ] F4. Scope Fidelity Check - `deep`

  **What to do**:
  - Compare implementation against original requirements
  - Verify no scope creep (features not in plan)
  - Check for missing features
  - Validate "Must NOT Have" guardrails

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Output**: Fidelity report showing compliance percentage


### Wave 3: Backend & Consolidation

- [ ] 13. Enhanced ProductSource with sibling context

  **What to do**:
  - Extend ProductSource type to include sibling products
  - Add product line metadata to source context
  - Update data fetching queries

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(backend): enhance ProductSource with sibling context`

- [ ] 14. Implement two-phase consolidation service

  **What to do**:
  - Phase 1: Raw extraction (existing)
  - Phase 2: Consistency pass with sibling context
  - Detect and flag inconsistencies

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Commit**: `feat(backend): implement two-phase consolidation`

- [ ] 15. Update prompt builder with cohort context

  **What to do**:
  - Modify generateSystemPrompt to include sibling products
  - Add consistency rules for product lines
  - Update prompt context building

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(backend): add cohort context to prompts`

- [ ] 16. Create consistency validation rules

  **What to do**:
  - Define rules for core identity consistency
  - Brand, category, base description validation
  - Flag outliers and anomalies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(backend): add consistency validation rules`

- [ ] 17. Create API endpoints for cohort operations

  **What to do**:
  - GET /api/admin/cohorts - List cohorts
  - GET /api/admin/cohorts/:id - Get cohort details
  - POST /api/admin/cohorts/:id/process - Trigger cohort processing

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(api): add cohort management endpoints`

- [ ] 18. Update batch job routing by product line

  **What to do**:
  - Route batches by product line instead of scrape_job_id
  - Group related products in same batch
  - Update batch routing key logic

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(backend): route batches by product line`

### Wave 4: CLI Tools

- [ ] 19. CLI entry point and command structure

  **What to do**:
  - Create bsr CLI entry point
  - Implement command structure with subcommands
  - Add help and documentation

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(cli): add bsr CLI entry point`

- [ ] 20. Implement bsr batch test command

  **What to do**:
  - Test product line batches end-to-end
  - Full output visibility
  - Save results for analysis

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(cli): add bsr batch test command`

- [ ] 21. Implement bsr cohort visualize command

  **What to do**:
  - Show how products are grouped into cohorts
  - Display cohort metadata
  - Export visualization data

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(cli): add bsr cohort visualize command`

- [ ] 22. Implement bsr benchmark command

  **What to do**:
  - Compare crawl4ai modes (llm-free, llm, auto)
  - Benchmark on sample products
  - Generate comparison report

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `feat(cli): add bsr benchmark command`

- [ ] 23. Create local test data fixtures

  **What to do**:
  - Sample product data with UPCs
  - Test cohort configurations
  - Mock scraper responses

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(cli): add test data fixtures`

- [ ] 24. CLI documentation and help

  **What to do**:
  - Write comprehensive CLI documentation
  - Usage examples for each command
  - Troubleshooting guide

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Commit**: `docs(cli): add CLI documentation and examples`

### Wave 5: Frontend UI

- [ ] 25. Product line list page

  **What to do**:
  - List all product lines with stats
  - Search and filter capabilities
  - Quick actions (process, view)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Commit**: `feat(admin): add product line list page`

- [ ] 26. Cohort batch monitoring dashboard

  **What to do**:
  - Real-time cohort status display
  - Progress indicators for batches
  - Error highlighting and details

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Commit**: `feat(admin): add cohort monitoring dashboard`

- [ ] 27. Product line detail view

  **What to do**:
  - Show products in product line
  - Consistency status per product
  - Action buttons (reprocess, edit)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Commit**: `feat(admin): add product line detail view`

- [ ] 28. Batch status indicators

  **What to do**:
  - Visual indicators for batch status
  - Consistency score display
  - Warning badges for issues

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Commit**: `feat(admin): add batch status indicators`

- [ ] 29. Integrate with existing admin UI

  **What to do**:
  - Add product line column to products table
  - Link to product line pages
  - Update navigation

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Commit**: `feat(admin): integrate product lines into existing UI`

### Wave FINAL: Integration & Verification

- [ ] 30. End-to-end integration test

  **What to do**:
  - Full pipeline test from import to publish
  - Multiple product lines
  - Verify consistency enforcement

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `test(integration): add end-to-end cohort tests`

- [ ] 31. Performance benchmarking

  **What to do**:
  - Compare old vs new processing times
  - Memory usage analysis
  - Scalability testing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Commit**: `perf(tests): add performance benchmarks`

- [ ] 32. Migration dry-run and validation

  **What to do**:
  - Test migration on production-like data
  - Validate product line detection accuracy
  - Measure migration time

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Commit**: `feat(data): validate migration on production data`

- [ ] 33. Rollback procedure documentation

  **What to do**:
  - Document rollback steps
  - Create rollback scripts
  - Test rollback procedure

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Commit**: `docs(ops): add rollback procedure documentation`

## Final Verification Wave

### F1. Plan Compliance Audit - `oracle`
Verify all requirements implemented, all guardrails respected, evidence files present.

### F2. Code Quality Review - `unspecified-high`
Run full test suite, lint, type check. Review for anti-patterns.

### F3. Real Manual QA - `unspecified-high`
Execute all QA scenarios from all tasks, test integration points.

### F4. Scope Fidelity Check - `deep`
Verify 1:1 spec-to-implementation, no scope creep, no missing features.

---

## Commit Strategy

- **Wave 1**: `feat(data): add product_line support and cohort schema`
- **Wave 2**: `feat(runner): implement cohort-based batch processing`
- **Wave 3**: `feat(backend): two-phase consolidation with sibling context`
- **Wave 4**: `feat(cli): add bsr batch/cohort/benchmark commands`
- **Wave 5**: `feat(admin): product line management UI`
- **Wave FINAL**: `feat(integration): end-to-end cohort processing and QA`

---

## Success Criteria

### Verification Commands
```bash
# CLI testing
bsr cohort visualize --upc-prefix "12345678" --limit 10
bsr batch test --product-line "blue-buffalo-dog" --scraper phillips
bsr benchmark --mode llm-free --products test-fixtures/small-batch.json

# Backend verification
curl /api/admin/cohorts | jq '.cohorts | length'
curl /api/admin/product-lines | jq '.lines[0].upc_prefix'

# Database verification
psql -c "SELECT COUNT(*) FROM products_ingestion WHERE product_line IS NOT NULL"
psql -c "SELECT product_line, COUNT(*) FROM products GROUP BY product_line"

# Full pipeline test
bun run test:cohort-integration
python -m pytest tests/cohort/ -v
```

### Final Checklist
- [ ] All 33 implementation tasks complete with evidence
- [ ] CLI tools working locally with sample data
- [ ] Runner processes cohorts correctly (not sequential SKUs)
- [ ] Consolidation includes sibling context
- [ ] Frontend shows product line batches
- [ ] All tests pass (existing + new)
- [ ] Migration script tested on production-like data
- [ ] Rollback procedure documented and tested
- [ ] Performance benchmarks show improvement
- [ ] User accepts final verification results
