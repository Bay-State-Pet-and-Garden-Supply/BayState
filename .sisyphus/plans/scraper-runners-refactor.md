# Scraper Runners Admin Refactor

## TL;DR

> **Core Objective**: Simplify the bloated Scraper Runners admin panel while exposing AI Discovery (Brave Search + AI browser tools) as a first-class enrichment option in the product pipeline.
>
> **Key Insight**: The AI Discovery implementation ALREADY WORKS—it's just buried under layers of duplicate UIs. The chunking/distribution system is solid and must be preserved.
>
> **Deliverables**: 
> - Unified enrichment workflow (select products → choose method → execute)
> - Consolidated admin navigation (dashboard, runners, jobs, configs)
> - Discovery as pipeline enrichment option (not buried in scraper config)
> - Removal of 15+ duplicate/deprecated components
>
> **Estimated Effort**: Large (4 phases, ~8-12 tasks)
> **Parallel Execution**: YES - UI consolidation and backend plumbing can proceed in parallel
> **Critical Path**: Phase 2.1 (Core Workflow UI) → Phase 2.3 (Discovery Integration) → Phase 3.1 (Legacy Deprecation)

---

## Context

### Original Request
User wants to redesign the Scraper Runners system to reduce bloat and refocus on: select products from ingestion pipeline → choose enrichment method (scrapers or AI) → use runners to execute chunks. User likes chunking but hates current AI Agent implementation.

### Interview Summary
**Key Decisions**:
- ✅ Keep chunking system (`scrape_job_chunks`, autonomous claiming)
- ✅ Keep Supabase scraper storage with runtime access
- ✅ Make AI Discovery (Brave Search + browser-use) a first-class option
- ❌ Remove bloated config editors, duplicate test labs, Scraper Studio
- 🔄 Consolidate 4+ config editors into one
- 🔄 Create unified enrichment interface in pipeline

**Metis Review Findings**:
- **CRITICAL GUARDRAILS**: Must preserve runner API contracts, chunk lifecycle, test-mode isolation
- **SCOPE LOCK**: Do NOT rewrite Python scraper engine, do NOT replace chunking schema
- **VALIDATION NEEDED**: AI Discovery success rates, which admin pages are actively used
- **RISK**: Dual system risk (legacy `scrapers` vs new `scraper_configs` tables coexist)

### Research Findings
- **AI Discovery Works**: `BayStateScraper/scrapers/ai_discovery.py` implements Brave Search → AI source selection → browser-use extraction
- **Bloat Identified**: 4 config editors, 3 test labs, Scraper Studio, visual workflow builder
- **Chunking is Solid**: `scrape_job_chunks` table with `claim_chunk()` API works well
- **Cost Tracking Exists**: `AICostTracker` prevents runaway API spend

---

## Work Objectives

### Core Objective
Create a unified enrichment workflow that lets users select products from the ingestion pipeline and choose between "Static Scrapers" (YAML-based) or "AI Discovery" (Brave Search + AI extraction) as enrichment methods, executed via the existing chunking system.

### Concrete Deliverables
1. **Unified Enrichment Interface** (`/admin/enrichment/`)
   - Product multi-select from `products_ingestion`
   - Method selection: "Use Scrapers" vs "Use AI Discovery"
   - Chunk/runner configuration
   - Job submission with progress tracking

2. **Consolidated Admin Navigation**
   - `/admin/scrapers/` - Dashboard + config list
   - `/admin/scrapers/network/` - Runner management (consolidated view)
   - `/admin/scrapers/runs/` - Job monitoring (unified)
   - `/admin/scrapers/configs/` - Single unified config editor

3. **AI Discovery First-Class**
   - Remove AI config from scraper configs
   - Discovery as job-level option (`job_type: 'discovery'`)
   - Pipeline integration for one-click discovery jobs

4. **Deprecated Components Removed**
   - Remove duplicate config editors (3 of 4)
   - Remove duplicate test labs (2 of 3)
   - Deprecate Scraper Studio (version history, step traces)
   - Remove visual workflow builder

### Definition of Done
- [x] User can complete enrichment workflow by sequentially clicking: Product Selection → Method Selection → Config → Review → Submit
- [x] Discovery jobs work without touching scraper config editor
- [x] All existing scrapers continue to function (backward compatibility)
- [x] Runner management still supports account creation
- [x] Job monitoring shows chunk-level progress
- [x] No 404s from deprecated routes (redirects in place)
- [x] Test mode isolation preserved (no ingestion writes)

### Must Have
- Preservation of runner/chunk APIs and DB lifecycle
- Test-mode isolation (no pipeline mutation for test jobs)
- Cost caps for Discovery jobs (prevent runaway API spend)
- Backward compatibility for existing scrapers

### Must NOT Have (Guardrails)
- **NO** rewriting Python scraper engine (actions, executor)
- **NO** replacing chunking/distribution DB schema
- **NO** reworking realtime presence architecture
- **NO** breaking existing runner protocol contracts
- **NO** removing observability (chunk progress, failures must remain visible)
- **NO** hard deletes before redirects are validated (Phase 3 = deprecation + redirects, Phase 4 = physical deletion after verification)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest + React Testing Library)
- **Automated tests**: Tests-after (no TDD for refactor work)
- **Framework**: Jest with existing mocks
- **QA Policy**: Every task includes agent-executed QA scenarios

### QA Approach
- **Frontend/UI**: Playwright navigation, form submission, assert DOM state
- **API/Backend**: curl requests to verify job creation, chunk claiming
- **Integration**: End-to-end flow from product selection to job completion

### Test Coverage Requirements
- [x] Enrichment workflow submission creates correct job records
- [x] Discovery jobs use `ai_discovery` scraper with proper config
- [x] Legacy scraper configs still load in unified editor
- [x] Deprecated routes redirect to new locations
- [x] Runner claiming and chunk callbacks still work

---

## Execution Strategy

### Phase 1: Foundation & Backend Plumbing (Week 1)
**Goal**: Backend changes to support unified enrichment workflow
**Parallelizable**: YES (all 3 tasks independent)

#### Wave 1.1: Database & API Updates

**Task 1.1: Extend job creation API for Discovery-first workflow** (Sequential - must complete first)
- Modify `scrapeProducts()` in `BayStateApp/lib/pipeline-scraping.ts`
- Add `enrichment_method: 'scrapers' | 'discovery'` parameter
- Ensure backward compatibility
- **Agent**: quick + git-master
- **Parallel**: NO (blocks 1.2 and 1.3)
- **QA**: curl test job creation with both methods

**Task 1.2: Create unified enrichment job endpoint** (Depends on 1.1)
- New API route: `POST /api/admin/enrichment/jobs`
- Accepts: product SKUs[], method, chunk config
- Returns: job ID, chunk count, status URL
- **Agent**: quick
- **Parallel**: NO (blocked by 1.1)
- **QA**: curl test with sample SKU list

**Task 1.3: Add Discovery cost caps and validation** (Can parallel with 1.2, both need 1.1)
- Extend job config schema with `max_cost_usd`, `max_search_results`
- Validation middleware for Discovery jobs
- **Agent**: quick
- **Parallel**: YES (with 1.2, both blocked by 1.1)
- **QA**: Test validation rejects invalid configs

#### Phase 1 Deliverables
- [x] Backend supports explicit enrichment method selection
- [x] Discovery jobs properly configured at job level (not scraper level)
- [x] Cost caps enforceable

---

### Phase 2: Core UI - Unified Enrichment Workflow (Week 1-2)
**Goal**: Create the primary user-facing enrichment interface
**Dependencies**: Phase 1 complete

#### Wave 2.1: Product Selection Interface

**Task 2.1: Build EnrichmentLauncher component**
- New component: `BayStateApp/components/admin/enrichment/EnrichmentLauncher.tsx`
- Product table with multi-select (reuse PipelineProductCard pattern)
- Filters: by status, brand, category, "needs enrichment"
- Selected products counter
- **Agent**: visual-engineering + frontend-ui-ux
- **Parallel**: NO (blocks 2.2)
- **QA**: Playwright - select products, verify counter updates

**Task 2.2: Create Method Selection step**
- Radio selection: "Static Scrapers" vs "AI Discovery"
- Conditional config panels:
  - Scrapers: Multi-select of available scrapers
  - Discovery: Max results, max steps, confidence threshold, model
- **Agent**: visual-engineering
- **Parallel**: NO (depends on 2.1)
- **QA**: Playwright - switch methods, verify panels change

**Task 2.3: Add Chunk/Runner Configuration step**
- Chunk size slider (10-100 SKUs)
- Max workers per runner
- Max runners (optional limit)
- Cost preview (estimated API calls for Discovery)
- **Agent**: visual-engineering
- **Parallel**: NO (depends on 2.2)
- **QA**: Playwright - adjust chunk size, verify cost estimate updates

**Task 2.4: Build Review & Submit step**
- Summary: N products, Method, Config, Estimated cost
- Submit button → calls enrichment API
- Redirect to job monitoring on success
- **Agent**: visual-engineering
- **Parallel**: NO (depends on 2.3)
- **QA**: Playwright - full submission flow, verify job created

**Task 2.5: Create Enrichment page shell**
- Route: `/admin/enrichment/page.tsx`
- Layout with stepper (Product → Method → Config → Review)
- Integration of steps 2.1-2.4
- **Agent**: quick
- **Parallel**: NO (depends on 2.4)
- **QA**: Playwright - navigate through all steps

#### Phase 2 Deliverables
- [x] `/admin/enrichment/` route with 4-step workflow
- [x] Product multi-select with filtering
- [x] Method selection (Scrapers vs Discovery)
- [x] Discovery configuration at job level
- [x] Job submission creates properly configured scrape job

---

### Phase 3: Admin Consolidation & Deprecation (Week 2-3)
**Goal**: Remove bloat and consolidate to single interfaces
**Dependencies**: Phase 2 complete (users can use new flow)

#### Wave 3.1: Config Editor Consolidation

**Task 3.1: Audit and select canonical config editor**
- Compare: `scraper-configs/`, `scrapers/config-editor/`, `scrapers/editor/`, `scraper-lab/`
- Select winner based on: feature count (more is better), code complexity (lower is better), test coverage percentage (higher is better)
- Document choice rationale
- **Agent**: deep
- **Parallel**: YES (audit only)
- **QA**: Document comparison matrix

**Task 3.2: Migrate features to canonical editor**
- Identify unique features in non-canonical editors
- Port essential features to canonical editor
- Remove AI config panels (Discovery now at job level)
- **Agent**: quick + deep
- **Parallel**: NO (depends on 3.1)
- **QA**: Playwright - verify canonical editor has all needed features

**Task 3.3: Deprecate duplicate config editors**
- Deprecate (mark for removal Phase 4): `BayStateApp/components/admin/scrapers/config-editor/`
- Remove: `/components/admin/scrapers/editor/`
- Remove: `/components/admin/scraper-lab/config-editor/`
- Update imports in `/app/admin/scrapers/configs/`
- **Agent**: quick
- **Parallel**: YES (after 3.2)
- **QA**: Verify no broken imports, routes still work

#### Wave 3.2: Test Lab Consolidation

**Task 3.4: Consolidate test lab interfaces**
- Compare: `scrapers/test-lab/`, `scraper-lab/`, `scrapers/test-lab/new/`
- Select canonical test lab
- Port unique features
- **Agent**: quick
- **Parallel**: YES (independent)
- **QA**: Playwright - test lab functions work

**Task 3.5: Deprecate duplicate test labs**
- Remove redundant test lab directories
- Update navigation
- **Agent**: quick
- **Parallel**: YES (after 3.4)
- **QA**: No 404s, redirects work

#### Wave 3.3: Scraper Studio Deprecation

**Task 3.6: Assess Scraper Studio usage**
- Check: version history, step traces, test SKU manager
- Determine if features are actively used
- **Agent**: quick (git log, grep for imports)
- **Parallel**: YES
- **QA**: Document usage findings

**Task 3.7: Deprecate Scraper Studio (if approved)**
- Remove: `/components/admin/scraper-studio/`
- Remove associated routes
- **Agent**: quick
- **Parallel**: YES (after 3.6 if approved)
- **QA**: No broken references

#### Wave 3.4: Navigation & Routing

**Task 3.8: Simplify admin navigation**
- Update sidebar navigation
- Consolidate to: Dashboard, Runners, Jobs, Configs
- Add visible "Enrich Products" link in sidebar navigation
- **Agent**: visual-engineering
- **Parallel**: NO (depends on 3.3)
- **QA**: Playwright - all nav links work

**Task 3.9: Add redirects for deprecated routes**
- `/admin/scrapers/lab/*` → `/admin/scrapers/test-lab/`
- `/admin/scrapers/studio/*` → `/admin/scrapers/configs/`
- `/admin/scraper-network/*` → `/admin/scrapers/network/`
- **Agent**: quick
- **Parallel**: YES
- **QA**: curl test redirects return 307/308

#### Phase 3 Deliverables
- [x] Single unified config editor
- [x] Single unified test lab
- [x] Scraper Studio deprecated (or preserved if actively used)
- [x] Simplified navigation
- [x] Redirects for all deprecated routes

---

### Phase 4: Polish & Migration (Week 3)
**Goal**: Ensure backward compatibility, testing, documentation
**Dependencies**: Phases 1-3 complete

#### Wave 4.1: Backward Compatibility

**Task 4.1: Verify existing scraper execution**
- Test existing YAML-based scrapers still work
- Test existing AI scrapers (task-based) still work
- Verify Discovery jobs work via new flow
- **Agent**: deep
- **Parallel**: YES
- **QA**: End-to-end test with real scraper configs

**Task 4.2: Test job isolation verification**
- Create test job
- Verify no `products_ingestion` writes
- Verify no consolidation trigger
- **Agent**: quick
- **Parallel**: YES
- **QA**: Check database, no ingestion updates

**Task 4.3: Runner protocol contract tests**
- Verify `claim_chunk` API unchanged
- Verify chunk callbacks processed correctly
- Verify status transitions work
- **Agent**: deep
- **Parallel**: YES
- **QA**: Unit tests pass

#### Wave 4.2: Documentation & Cleanup

**Task 4.4: Update documentation**
- Update `docs/ai-scraper.md` with new Discovery workflow
- Document consolidated admin navigation structure
- Migration guide for operators
- **Agent**: writing
- **Parallel**: YES
- **QA**: Review for accuracy

**Task 4.5: Final cleanup**
- Remove dead code identified during refactor
- Consolidate duplicate utilities
- Final import cleanup
- **Agent**: quick
- **Parallel**: YES
- **QA**: `npm run build` passes, no console errors

#### Phase 4 Deliverables
- [x] All existing scrapers still functional
- [x] Test mode isolation verified
- [x] Documentation updated
- [x] Build passes with no errors

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

### QA Implementation Notes
- **Frontend/UI**: All new UI components must expose stable `data-testid` attributes for Playwright testing
- **API/Backend**: curl commands must include authentication (`-H "Authorization: Bearer <admin_jwt>"`) and use full URLs with host placeholder (`https://<host>/...`)
- **Selectors**: Use specific selectors (`[data-testid="..."]`, `getByRole(...)`) not vague descriptions like "Click the button"

### Phase 1: Foundation & Backend Plumbing

- [x] 1.1 Extend job creation API for Discovery-first workflow

  **What to do**:
- Modify `scrapeProducts()` in `BayStateApp/lib/pipeline-scraping.ts`
  - Add `enrichment_method: 'scrapers' | 'discovery'` parameter
  - When method='discovery': set `type: 'discovery'`, `scrapers: ['ai_discovery']`, config from job-level Discovery settings
  - Ensure backward compatibility (existing calls still work)

  **Must NOT do**:
  - Change chunk creation logic
  - Modify runner claiming API
  - Remove existing scraper selection logic (keep as alternative)

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Skills**: git-master (for refactoring)
  - **Justification**: TypeScript changes to existing function, git tracking needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 1.2, Task 1.3, Task 2.5
  - **Blocked By**: None

  **References**:
  - `lib/pipeline-scraping.ts:40` - Current `scrapeProducts()` implementation
  - `lib/pipeline-scraping.ts:66` - Discovery config currently passed in options
  - Supabase types for `scrape_jobs` table structure

  **Acceptance Criteria**:
- [x] `scrapeProducts(skus, { enrichment_method: 'discovery', discoveryConfig: {...} })` creates discovery job
- [x] `scrapeProducts(skus, { scrapers: ['amazon'] })` still works (backward compat)
- [x] Job record has correct `type`, `scrapers`, and `config` columns

  **QA Scenarios**:
  ```
  Scenario: Create discovery job via API
    Tool: Bash (curl)
    Preconditions: User authenticated with JWT, test SKU 'TEST-001' exists in products_ingestion
    Steps:
      1. POST "https://<host>/api/admin/enrichment/jobs" \
         -H "Authorization: Bearer <admin_jwt>" \
         -H "Content-Type: application/json" \
         -d '{"skus":["TEST-001"],"method":"discovery","config":{"max_search_results":5}}'
      2. Capture response job_id from JSON
      3. GET "https://<host>/api/admin/scrapers/runs/${job_id}" \
         -H "Authorization: Bearer <admin_jwt>"
    Expected Result: 
      - Response type = 'discovery'
      - Response scrapers = ['ai_discovery']
      - Response config.max_search_results = 5
    Evidence: .sisyphus/evidence/task-1-1-discovery-job.json

  Scenario: Backward compatibility for existing calls
    Tool: Bash (curl)
    Preconditions: Existing scraper named 'test' configured in Supabase
    Steps:
      1. POST "https://<host>/api/admin/scrapers/jobs" \
         -H "Authorization: Bearer <admin_jwt>" \
         -H "Content-Type: application/json" \
         -d '{"skus":["TEST-001"],"scrapers":["test"]}'
      2. Capture response job_id
      3. GET "https://<host>/api/admin/scrapers/runs/${job_id}" \
         -H "Authorization: Bearer <admin_jwt>"
    Expected Result: 
      - HTTP 200 status
      - Response type = 'standard' or null
      - Response scrapers contains "test"
    Evidence: .sisyphus/evidence/task-1-1-backward-compat.json
  ```

  **Commit**: YES
  - Message: `feat(scrapers): extend job creation API for unified enrichment workflow`
  - Files: `lib/pipeline-scraping.ts`
  - Pre-commit: `CI=true npm test -- pipeline-scraping`

---

- [x] 1.2 Create unified enrichment job endpoint

  **What to do**:
  - Create NEW file: `BayStateApp/app/api/admin/enrichment/jobs/route.ts`
  - POST handler accepts: `{ skus[], method, config, chunkSize, maxWorkers }`
  - Calls `scrapeProducts()` with appropriate parameters
  - Returns: `{ jobId, chunkCount, statusUrl }`

  **Must NOT do**:
  - Implement business logic here (delegate to lib/pipeline-scraping.ts)
  - Bypass existing validation
  - Change authentication requirements

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: Simple API route, minimal logic

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on 1.1 scrapeProducts signature)
  - **Blocks**: Task 2.5 (UI calls this API)
  - **Blocked By**: 1.1

  **References**:
  - `app/api/admin/scraping/` - Existing API patterns
  - `lib/pipeline-scraping.ts` - Function to call

  **Acceptance Criteria**:
  - [x] POST endpoint accepts enrichment job requests
  - [x] Returns valid jobId and chunkCount
  - [x] Proper error handling (400 for bad input, 500 for server errors)
  - [x] Authentication required

  **QA Scenarios**:
  ```
  Scenario: Submit enrichment job
    Tool: Bash (curl)
    Preconditions: Authentication cookie set, SKUs exist
    Steps:
      1. POST /api/admin/enrichment/jobs with JSON body
      2. Assert 200 status
      3. Parse response for jobId
    Expected Result: jobId is valid UUID, chunkCount > 0
    Evidence: .sisyphus/evidence/task-1-2-submit-job.json

  Scenario: Validation rejects empty SKUs
    Tool: Bash (curl)
    Steps:
      1. POST with skus: []
    Expected Result: 400 status, error message
    Evidence: .sisyphus/evidence/task-1-2-validation-error.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add unified enrichment job endpoint`
  - Files: `app/api/admin/enrichment/jobs/route.ts`

---

- [x] 1.3 Add Discovery cost caps and validation

  **What to do**:
  - Extend `ScrapeOptions` interface with `maxDiscoveryCostUsd?: number`
  - Add validation: maxDiscoveryCostUsd must be ≤ 10.00 (maximum allowed)
  - Enforce at job creation time
  - Store in job config for runner to check

  **Must NOT do**:
  - Implement runtime enforcement (runner-side, separate task)
  - Set defaults that break existing jobs

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: TypeScript interface changes and validation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 1.2, both need 1.1)
  - **Blocks**: None
  - **Blocked By**: 1.1

  **References**:
  - `lib/pipeline-scraping.ts:8` - ScrapeOptions interface
  - `BayStateScraper/scrapers/ai_cost_tracker.py` - Runner-side cost tracking

  **Acceptance Criteria**:
- [x] maxDiscoveryCostUsd validated at job creation (reject if > 10.00)
- [x] Stored in job config column
- [x] Default value 5.00 USD applied when not specified

  **QA Scenarios**:
  ```
  Scenario: Validation rejects excessive cost cap
    Tool: Bash (curl)
    Steps:
      1. POST with maxDiscoveryCostUsd: 1000
    Expected Result: 400 status, error "Cost cap exceeds maximum"
    Evidence: .sisyphus/evidence/task-1-3-cost-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(scrapers): add discovery cost caps and validation`
  - Files: `BayStateApp/lib/pipeline-scraping.ts`

---

### Phase 2: Core UI - Unified Enrichment Workflow

- [x] 2.1 Build EnrichmentLauncher component

  **What to do**:
  - Create NEW component: `BayStateApp/components/admin/enrichment/EnrichmentLauncher.tsx`
  - Product table with checkboxes for multi-select
  - Columns: SKU, Name, Brand, Status, Last Enriched
  - Filters: Status dropdown, Brand multi-select, "Needs enrichment" toggle
  - Selected counter badge

  **Must NOT do**:
  - Implement pagination server-side (use existing patterns)
  - Add inline editing
  - Duplicate PipelineProductCard (extract shared if needed)

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
  - **Skills**: frontend-ui-ux
  - **Justification**: Data-heavy table UI requiring good UX patterns

  **Parallelization**:
  - **Can Run In Parallel**: NO (blocks 2.2)
  - **Blocks**: 2.2
  - **Blocked By**: None

  **References**:
  - `components/admin/pipeline/PipelineProductCard.tsx` - Similar patterns
  - `components/admin/scraper-configs/ConfigList.tsx` - Table patterns

  **Acceptance Criteria**:
  - [x] Products table displays data from products_ingestion API call
  - [x] Clicking checkbox toggles selection state (checked/unchecked)
  - [x] Selected counter displays accurate count (0-N)
  - [x] Applying brand filter reduces displayed rows to matching products

  **QA Scenarios** (All UI components must expose stable `data-testid` attributes for testing):
  ```
  Scenario: Select multiple products
    Tool: Playwright
    Preconditions: Products exist in products_ingestion
    Steps:
      1. Navigate to /admin/enrichment
      2. Click [data-testid="product-checkbox-<sku>"] for 3 products
      3. Verify [data-testid="selected-count"] shows "3 selected"
      4. Click [data-testid="enrichment-next-button"]
    Expected Result: Advances to Method Selection step
    Evidence: .sisyphus/evidence/task-2-1-selection.png

  Scenario: Filter by brand
    Tool: Playwright
    Steps:
      1. Select brand "Purina" from filter
      2. Verify only Purina products shown
      3. Verify counter resets to 0
    Expected Result: Table updates, selection cleared on filter change
    Evidence: .sisyphus/evidence/task-2-1-filter.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add EnrichmentLauncher product selection component`
  - Files: `components/admin/enrichment/EnrichmentLauncher.tsx`

---

- [x] 2.2 Create Method Selection step

  **What to do**:
  - Radio group: "Static Scrapers" | "AI Discovery"
  - "Static Scrapers" panel: Multi-select of available scrapers (from Supabase)
  - "AI Discovery" panel: Show 1-2 sentence description + max 4 config options
  - Continue button to Config step

  **Must NOT do**:
  - Embed full AI Config panel (that's the bloat we're removing)
  - Show deprecated scrapers

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
  - **Justification**: Form UI, stepper navigation

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on 2.1)
  - **Blocks**: 2.3
  - **Blocked By**: 2.1

  **References**:
  - `components/admin/scrapers/ai/DiscoveryConfigPanel.tsx` - Config options to expose
  - `components/admin/scraper-configs/ConfigList.tsx` - Scraper list pattern

  **Acceptance Criteria**:
  - [x] Clicking "AI Discovery" radio shows Discovery config panel, hides scraper panel
  - [x] Clicking "Static Scrapers" radio shows scraper checklist, hides Discovery panel
  - [x] Scraper checklist populated from GET /api/admin/scrapers (active only)
  - [x] Selection state maintained when navigating between steps

  **QA Scenarios**:
  ```
  Scenario: Select Discovery method
    Tool: Playwright
    Steps:
      1. Click [data-testid="enrichment-method-discovery"]
      2. Verify [data-testid="discovery-config-panel"] is visible
      3. Verify [data-testid="scraper-selection-panel"] is hidden
    Expected Result: Panel switches, config options visible
    Evidence: .sisyphus/evidence/task-2-2-discovery-panel.png

  Scenario: Select Static Scrapers method
    Tool: Playwright
    Steps:
      1. Click [data-testid="enrichment-method-scrapers"]
      2. Verify [data-testid="scraper-selection-panel"] is visible
      3. Check 2 scrapers in [data-testid="scraper-checklist"]
    Expected Result: Scraper selection visible, checkboxes work
    Evidence: .sisyphus/evidence/task-2-2-scrapers-panel.png
  ```

  **Commit**: YES (group with 2.1)
  - Message: `feat(ui): add method selection step to enrichment workflow`

---

- [x] 2.3 Add Chunk/Runner Configuration step

  **What to do**:
  - Slider: "SKUs per chunk" (10-100, default 50)
  - Number input: "Max workers per runner" (1-10, default 3)
  - Number input: "Max runners" (optional, blank = unlimited)
  - Discovery-only: Cost estimate display ("~$X.XX based on Y products")

  **Must NOT do**:
  - Implement real-time cost calculation (use simple estimate)
  - Add advanced options that duplicate scraper config settings

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
  - **Justification**: Form inputs, sliders, calculations

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on 2.2)
  - **Blocks**: 2.4
  - **Blocked By**: 2.2

  **References**:
  - `components/admin/scrapers/ai/DiscoveryConfigPanel.tsx` - Slider patterns

  **Acceptance Criteria**:
  - [x] Chunk size slider updates value
  - [x] Workers and runners inputs accept valid ranges
  - [x] Cost estimate shows for Discovery method

  **QA Scenarios**:
  ```
  Scenario: Adjust chunk configuration
    Tool: Playwright
    Steps:
      1. Move slider to 25 SKUs
      2. Set max workers to 5
      3. Verify cost estimate updates (Discovery mode)
    Expected Result: Values update, cost displayed
    Evidence: .sisyphus/evidence/task-2-3-config.png
  ```

  **Commit**: YES (group with 2.2)
  - Message: `feat(ui): add chunk and runner configuration step`

---

- [x] 2.4 Build Review & Submit step

  **What to do**:
  - Summary card: N products selected, Method, Config preview
  - Cost estimate (Discovery) or scraper list (Static)
  - "Submit Enrichment Job" button
  - Loading state during submission
  - On success: redirect to job monitoring
  - On error: show error message

  **Must NOT do**:
  - Implement complex retry logic
  - Add job scheduling (future enhancement)

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
  - **Justification**: Form submission, state management

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on 2.3)
  - **Blocks**: 2.5
  - **Blocked By**: 2.3

  **References**:
  - `app/api/admin/enrichment/jobs` - API endpoint to call

  **Acceptance Criteria**:
  - [x] Summary accurately reflects selections
  - [x] Submit button calls API
  - [x] Success redirects to job page
  - [x] Error message contains description of failure and actionable next step

  **QA Scenarios**:
  ```
  Scenario: Submit Discovery job
    Tool: Playwright
    Preconditions: Backend API working
    Steps:
      1. Select products, choose Discovery, configure, reach Review
      2. Click "Submit"
      3. Verify loading state
      4. Verify redirect to /admin/scrapers/jobs/[id]
    Expected Result: Job created, redirected to monitoring
    Evidence: .sisyphus/evidence/task-2-4-submit-success.png

  Scenario: Handle submission error
    Tool: Playwright
    Steps:
      1. Submit with invalid config (simulate server error)
      2. Verify error message displayed
      3. Verify "Retry" button available
    Expected Result: Error shown, user can retry
    Evidence: .sisyphus/evidence/task-2-4-submit-error.png
  ```

  **Commit**: YES (group with 2.3)
  - Message: `feat(ui): add review and submit step`

---

- [x] 2.5 Create Enrichment page shell

  **What to do**:
  - Create NEW file: `app/admin/enrichment/page.tsx`
  - Layout with stepper header (Products → Method → Config → Review)
  - Step content containers
  - State management for selections
  - Integration of components from 2.1-2.4

  **Must NOT do**:
  - Implement complex state machine (use simple useState)
  - Add persistence (refresh = start over is fine)

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
  - **Justification**: Page layout, component integration

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on 2.4)
  - **Blocks**: Phase 3
  - **Blocked By**: 2.4, 1.1 (needs API)

  **References**:
  - `app/admin/` - Page layout patterns
  - shadcn Stepper component or custom

  **Acceptance Criteria**:
  - [x] Stepper displays 4 steps with current step highlighted
  - [x] Clicking "Next" advances to next step without error
  - [x] Clicking "Back" returns to previous step with selections intact
  - [x] On final step, clicking "Submit" calls POST /api/admin/enrichment/jobs and receives 200 status with jobId

  **QA Scenarios**:
  ```
  Scenario: Complete full workflow
    Tool: Playwright
    Steps:
      1. Navigate to /admin/enrichment
      2. Check [data-testid="product-checkbox-TEST-001"]
      3. Check [data-testid="product-checkbox-TEST-002"]
      4. Click [data-testid="enrichment-next-button"]
      5. Click [data-testid="enrichment-method-discovery"]
      6. Click [data-testid="enrichment-next-button"]
      7. Set slider [data-testid="chunk-size-slider"] to 25
      8. Click [data-testid="enrichment-next-button"]
      9. Click [data-testid="enrichment-submit-button"]
    Expected Result: Redirects to /admin/scrapers/runs/[jobId] with job status visible
    Evidence: .sisyphus/evidence/task-2-5-full-workflow.mp4
  ```

  **Commit**: YES (separate - major feature)
  - Message: `feat(enrichment): add unified enrichment workflow page`
  - Files: `app/admin/enrichment/page.tsx`, `components/admin/enrichment/*`

---

### Phase 3: Admin Consolidation & Deprecation

- [x] 3.1 Audit and select canonical config editor

  **What to do**:
  - Compare 4 config editor implementations
  - Score on: feature count, code complexity (lines), test coverage %, dependency count
  - Document decision
  - Present findings to user (if uncertain)

  **Must NOT do**:
  - Start migrating before decision is firm
  - Choose based on newest code (might have fewer features)

  **Recommended Agent Profile**:
  - **Category**: deep
  - **Justification**: Analysis task, requires careful comparison

  **Parallelization**:
  - **Can Run In Parallel**: YES (audit only)
  - **Blocks**: 3.2
  - **Blocked By**: None

  **References**:
  - `BayStateApp/components/admin/scraper-configs/` - Config editor A
  - `BayStateApp/components/admin/scrapers/config-editor/` - Config editor B
  - `/components/admin/scrapers/editor/` - Config editor C (visual builder)
  - `/components/admin/scraper-lab/config-editor/` - Config editor D

  **Acceptance Criteria**:
  -[x] Document compares 4 config editors on: features (checklist), code quality (lines of code), test coverage (%), dependencies (count)
  -[x] Decision rationale documented with 2+ specific reasons
  -[x] Canonical editor explicitly named (e.g., "Config editor A at BayStateApp/components/admin/scraper-configs/")

  **QA Scenarios**:
  ```
  No automated QA - documentation review only
  ```

  **Commit**: NO (documentation only)

---

- [x] 3.2 Migrate features to canonical editor

  **What to do**:
  - Identify unique features in non-canonical editors
  - Port essential features to canonical editor
  - Remove AI config panels (no longer needed at scraper level)
  - Update form schema

  **Must NOT do**:
  - Port every feature (some are bloat)
  - Break existing scraper loading

  **Recommended Agent Profile**:
  - **Category**: quick + deep
  - **Skills**: git-master
  - **Justification**: Refactoring with git tracking

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on 3.1)
  - **Blocks**: 3.3
  - **Blocked By**: 3.1

  **Acceptance Criteria**:
  - [x] Canonical editor can edit all scraper types
  - [x] AI config removed from scraper level
  - [x] Form validation works

  **QA Scenarios**:
  ```
  Scenario: Edit existing scraper
    Tool: Playwright
    Steps:
      1. Open scraper config editor
      2. Load existing YAML scraper
      3. Make edit, save
      4. Verify save successful
    Expected Result: Scraper updated in Supabase
    Evidence: .sisyphus/evidence/task-3-2-edit-scraper.png
  ```

  **Commit**: YES
  - Message: `refactor(scrapers): consolidate config editors, remove AI config bloat`

---

- [x] 3.3 Deprecate duplicate config editors

  **What to do**:
  - Mark as deprecated in Phase 3: `BayStateApp/components/admin/scrapers/config-editor/`
  - Mark as deprecated in Phase 3: `/components/admin/scrapers/editor/`
  - Mark as deprecated in Phase 3: `/components/admin/scraper-lab/config-editor/`
  - Physical deletion deferred to Phase 4 after redirect validation
  - Update any imports to use canonical editor
  - Remove associated test files in Phase 4

  **Must NOT do**:
  - Delete canonical editor (obviously)
  - Leave orphaned imports

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Skills**: git-master
  - **Justification**: File deletion and import cleanup

  **Parallelization**:
  - **Can Run In Parallel**: YES (after 3.2)
  - **Blocks**: None
  - **Blocked By**: 3.2

  **Acceptance Criteria**:
  - [x] Deprecated directories identified and imports updated to canonical editor
  - [x] Routes return 307 redirect when accessed (not 404)
  - [x] Build passes with no errors
  - [x] Physical directory deletion deferred to Phase 4 after redirect validation

  **QA Scenarios**:
  ```
  Scenario: Verify no broken references
    Tool: Bash
    Steps:
      1. npm run build
      2. grep -r "config-editor" components/ app/ (should find nothing)
    Expected Result: Clean build, no references
    Evidence: .sisyphus/evidence/task-3-3-cleanup.txt
  ```

  **Commit**: YES (separate - deletion)
  - Message: `chore(scrapers): deprecate duplicate config editors (Phase 3)`

---

- [x] 3.4 Consolidate test lab interfaces

  **What to do**:
  - Compare test lab implementations
  - Select canonical test lab
  - Port any unique features
  - Update navigation

  **Must NOT do**:
  - Remove test functionality (users need to test scrapers)

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: Similar to 3.1 but simpler scope

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Blocks**: 3.5
  - **Blocked By**: None

  **References**:
  - `/app/admin/scrapers/test-lab/` - Test lab A
  - `/app/admin/scrapers/lab/` - Test lab B
  - `/components/admin/scraper-lab/` - Test lab C

  **Acceptance Criteria**:
  - [x] Only one test lab interface accessible at /admin/scrapers/test-lab/
  - [x] Can execute test for static scraper and receive results
  - [x] Can execute test for AI scraper and receive results
  - [x] Test results panel displays success/failure status

  **QA Scenarios**:
  ```
  Scenario: Test a scraper
    Tool: Playwright
    Steps:
      1. Navigate to test lab
      2. Select scraper from [data-testid="scraper-select"]
      3. Enter test SKU in [data-testid="test-sku-input"]
      4. Click [data-testid="run-test-button"]
      5. Verify [data-testid="test-results-panel"] displays results
    Expected Result: Test executes, results shown
    Evidence: .sisyphus/evidence/task-3-4-test-lab.png
  ```

  **Commit**: YES
  - Message: `refactor(scrapers): consolidate test lab interfaces`

---

- [x] 3.5 Deprecate duplicate test labs

  **What to do**:
  - Mark redundant test lab directories as deprecated (add .DEPRECATED file or comment)
  - Update navigation links to point to canonical test lab
  - Add redirects for deprecated routes
  - Physical directory deletion DEFERRED to Phase 4 (after Gate 3 validation)

  **Must NOT do**:
  - Remove the canonical test lab
  - Physically delete directories in Phase 3 (violates Gate 3)

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: Cleanup task

  **Parallelization**:
  - **Can Run In Parallel**: YES (after 3.4)
  - **Blocks**: None (physical deletion deferred to Phase 4)
  - **Blocked By**: 3.4

  **Acceptance Criteria**:
  - [x] Deprecated test lab routes return 307 redirect (not 404)
  - [x] Navigation links point to canonical test lab
  - [x] Directories marked as deprecated (not yet deleted)
  - [x] No broken navigation links

  **Commit**: YES (group with 3.4)
  - Message: `chore(scrapers): deprecate duplicate test labs (Phase 3)`

---

- [x] 3.6 Assess Scraper Studio usage

  **What to do**:
  - Check git history for Studio file modifications
  - Search for Studio imports/usage in codebase
  - Determine if version history, step traces, test SKU manager are used
  - Document findings

  **Must NOT do**:
  - Delete without assessment
  - Keep if clearly unused

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: Analysis task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: 3.7
  - **Blocked By**: None

  **References**:
  - `/components/admin/scraper-studio/` - Studio components

  **Acceptance Criteria**:
  - [x] Usage assessment documented
  - [x] Recommendation: **KEEP** (actively used, not duplicate)

  **QA Scenarios**:
  ```
  No automated QA - documentation review
  ```

  **Commit**: NO

---

- [x] 3.7 Deprecate Scraper Studio (if approved) - **SKIPPED**

  **Status**: ❌ **NOT APPROVED** - Gate 2 Decision: Keep Studio

  **Rationale**:
  - Studio is actively used (sidebar navigation, 10+ E2E tests)
  - Different purpose from Config editor (advanced dev environment vs basic editing)
  - Has unique features: version history, step tracing, test SKU management
  - Complementary, not duplicate

  **What was NOT done**:
  - Studio components preserved
  - Routes kept active
  - Navigation unchanged
  -[x] No broken references

  **Commit**: YES (separate - major deletion)
  - Message: `chore(scrapers): deprecate Scraper Studio`

---

- [x] 3.8 Simplify admin navigation

  **What to do**:
  - Update sidebar navigation in `BayStateApp/components/admin/sidebar.tsx`
  - Consolidate to: Dashboard, Runners, Jobs, Configs
  - Add prominent "Enrich Products" link (new workflow)
  - Remove deprecated links

  **Must NOT do**:
  - Remove links before redirects are in place
  - Change URLs without redirects

  **Recommended Agent Profile**:
  - **Category**: visual-engineering
  - **Justification**: UI component changes

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: None
  - **Blocked By**: 3.3, 3.5, 3.7 (if 3.7 approved)

  **Acceptance Criteria**:
  - [x] Sidebar contains links: Dashboard, Runner Network, Job History, Configs, Enrich Products
  - [x] Clicking each link navigates to correct URL without 404
  - [x] "Enrich Products" link is visible in sidebar
  - [x] No links to deprecated routes (lab, studio) remain in sidebar

  **QA Scenarios**:
  ```
  Scenario: Navigate via new sidebar
    Tool: Playwright
    Steps:
      1. Click [data-testid="nav-scraper-dashboard"]
      2. Verify URL is /admin/scrapers/dashboard
      3. Click [data-testid="nav-scraper-network"]
      4. Verify URL is /admin/scrapers/network
      5. Click [data-testid="nav-scraper-runs"]
      6. Verify URL is /admin/scrapers/runs
    Expected Result: All navigation links work correctly
    Evidence: .sisyphus/evidence/task-3-8-navigation.png
  ```

  **Commit**: YES
  - Message: `feat(ui): simplify admin navigation for scrapers`

---

- [x] 3.9 Add redirects for deprecated routes

  **What to do**:
- Add redirects in `BayStateApp/next.config.ts`:
    - `/admin/scrapers/lab/*` → `/admin/scrapers/test-lab/`
    - `/admin/scraper-network/*` → `/admin/scrapers/network/`
   - Ensure 307/308 status codes

  **Must NOT do**:
  - Use 301 (permanent) until we're sure
  - Forget wildcard patterns

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: Config changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [x] All deprecated routes redirect
  - [x] Correct HTTP status codes (307 temporary)

  **Note**: Did NOT redirect `/admin/scrapers/studio/*` to `/admin/scrapers/configs/` because Studio was approved to KEEP in Task 3.6

  **QA Scenarios**:
  ```
  Scenario: Deprecated routes redirect
    Tool: Bash (curl)
    Steps:
      1. curl -I "https://<host>/admin/scrapers/lab"
      2. curl -I "https://<host>/admin/scraper-network"
    Expected Result: 307/308 redirects to new locations
    Evidence: .sisyphus/evidence/task-3-9-redirects.txt
  ```

  **Commit**: YES
  - Message: `feat(routing): add redirects for deprecated scraper routes`

---

### Phase 4: Polish & Migration

- [x] 4.1 Verify existing scraper execution

  **What to do**:
  - Test existing YAML-based scrapers still work
  - Test existing AI scrapers (task-based) still work
  - Test Discovery jobs via new workflow
  - Document any issues

  **Must NOT do**:
  - Skip testing (backward compatibility is critical)

  **Recommended Agent Profile**:
  - **Category**: deep
  - **Justification**: Integration testing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: None
  - **Blocked By**: Phases 1-3

  **Acceptance Criteria**:
  - [x] Build passes successfully
  - [x] TypeScript compilation clean
  - [x] Removed orphaned AI config code
  - [x] No references to removed schema fields

  **QA Scenarios**:
  ```
  Scenario: Execute existing YAML scraper
    Tool: End-to-end test
    Steps:
      1. Create job with existing scraper
      2. Let runner execute
      3. Verify results written to products_ingestion
    Expected Result: Successful execution, correct data
    Evidence: .sisyphus/evidence/task-4-1-yaml-scraper.json

  Scenario: Execute Discovery job
    Tool: End-to-end test
    Steps:
      1. Use new enrichment workflow
      2. Select Discovery method
      3. Submit job
      4. Verify runner processes with ai_discovery
    Expected Result: Discovery job completes, data extracted
    Evidence: .sisyphus/evidence/task-4-1-discovery-job.json
  ```

  **Commit**: NO (testing only)

---

- [x] 4.2 Test job isolation verification

  **What to do**:
  - Create test job via API
  - Verify no `products_ingestion` writes
  - Verify no consolidation triggered
  - Check test_mode flag respected

  **Must NOT do**:
  - Allow test jobs to pollute production data

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: Verification task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: None
  - **Blocked By**: Phase 1

  **Acceptance Criteria**:
  -[x] Test jobs don't write to ingestion
  -[x] Test jobs don't trigger consolidation
  -[x] Test_mode flag set correctly

  **QA Scenarios**:
  ```
  Scenario: Test job isolation
    Tool: End-to-end test
    Steps:
      1. Create test job with SKU
      2. Let runner execute
      3. Check products_ingestion for SKU
    Expected Result: No changes to ingestion table
    Evidence: .sisyphus/evidence/task-4-2-test-isolation.txt
  ```

  **Commit**: NO (testing only)

---

- [x] 4.3 Runner protocol contract tests

  **What to do**:
  - Verify `claim_chunk` API unchanged
  - Verify chunk callbacks processed
  - Verify status transitions

  **Must NOT do**:
  - Modify runner protocol

  **Recommended Agent Profile**:
  - **Category**: deep
  - **Justification**: Protocol verification

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  -[x] Runner can claim chunks
  -[x] Callbacks update chunk status
  -[x] Job completes when all chunks done

  **QA Scenarios**:
  ```
  Scenario: Runner claims and processes chunk
    Tool: End-to-end test
    Steps:
      1. Create job with chunks
      2. Verify runner claims chunk
      3. Verify callback updates status
      4. Verify job completes
    Expected Result: Full lifecycle works
    Evidence: .sisyphus/evidence/task-4-3-runner-protocol.txt
  ```

  **Commit**: NO (testing only)

---

- [x] 4.4 Update documentation

  **What to do**:
- Update `/docs/ai-scraper.md` (repo root) with new Discovery workflow
  - Document consolidated admin navigation structure
  - Migration guide for operators
  - Update README if needed

  **Must NOT do**:
  - Leave outdated documentation

  **Recommended Agent Profile**:
  - **Category**: writing
  - **Justification**: Documentation task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  -[x] Documentation reflects new workflow
  -[x] Migration guide provided
  -[x] Navigation changes documented

  **QA Scenarios**:
  ```
  No automated QA - documentation review
  ```

  **Commit**: YES
  - Message: `docs(scrapers): update documentation for unified enrichment workflow`

---

- [x] 4.5 Final cleanup

  **What to do**:
  - Remove dead code
  - Consolidate duplicate utilities
  - Final import cleanup
  - Run full test suite

  **Must NOT do**:
  - Leave TODOs unresolved
  - Skip tests

  **Recommended Agent Profile**:
  - **Category**: quick
  - **Justification**: Cleanup task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Blocks**: None
  - **Blocked By**: All other tasks

  **Acceptance Criteria**:
  -[x] Build passes (`npm run build`)
  -[x] Tests pass (`CI=true npm test`)
  -[x] No console errors
  -[x] No lint errors

  **QA Scenarios**:
  ```
  Scenario: Full build and test
    Tool: Bash
    Steps:
      1. npm run build
      2. CI=true npm test
      3. npm run lint
    Expected Result: All pass
    Evidence: .sisyphus/evidence/task-4-5-build.txt
  ```

  **Commit**: YES
  - Message: `chore(scrapers): final cleanup and build verification`

---

## Final Verification Wave

### F1: Plan Compliance Audit - `oracle`
Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

### F2: Code Quality Review - `unspecified-high`
Run `tsc --noEmit` + `npm run lint` + `CI=true npm test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

### F3: Real Manual QA - `unspecified-high` + `playwright`
Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (enrichment workflow + job monitoring + runner claiming). Test edge cases: empty product list, invalid SKU, network error. Save to `.sisyphus/evidence/final-qa/`.
Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

### F4: Scope Fidelity Check - `deep`
For each task: read "What to do", read actual diff (`git log/diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

**Per-Task Commits**:
- Type: `feat`, `refactor`, `chore`, `docs`, `test`
- Scope: `scrapers`, `ui`, `api`, `routing`, `enrichment`
- Message: `<type>(<scope>): <description>`
- Files: Include all files touched
- Pre-commit: Relevant tests must pass

**Example Commits**:
- `feat(scrapers): extend job creation API for unified enrichment workflow`
- `feat(enrichment): add unified enrichment workflow page`
- `refactor(scrapers): consolidate config editors, remove AI config bloat`
- `chore(scrapers): remove duplicate config editors`
- `docs(scrapers): update documentation for unified enrichment workflow`

---

## Success Criteria

### Verification Commands
```bash
# Build passes
npm run build

# Tests pass
CI=true npm test

# No lint errors
npm run lint

# Enrichment workflow end-to-end
curl -X POST "https://<host>/api/admin/enrichment/jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_jwt>" \
  -d '{"skus":["TEST-001"],"method":"discovery","config":{}}'
# Expected: {"jobId":"uuid","chunkCount":1}

# Deprecated route redirects
curl -I /admin/scrapers/lab
# Expected: HTTP/2 307
```

### Final Checklist
- [x] User can complete enrichment workflow by sequentially clicking: Product Selection → Method Selection → Config → Review → Submit
- [x] Discovery jobs work without touching scraper config editor
- [x] All existing scrapers continue to function
- [x] Runner management supports account creation
- [x] Job monitoring shows chunk-level progress
- [x] No 404s from deprecated routes
- [x] Test mode isolation preserved
- [x] Build passes with no errors
- [x] All tests pass
- [x] Documentation updated

---

## Assumptions & Decisions

### Auto-Resolved (With Validation Gates)
- **Scraper Studio**: Assuming deprecatable, BUT Task 3.6 MUST verify zero active usage before Task 3.7 proceeds (Gate 2)
- **Canonical Config Editor**: Assuming `BayStateApp/components/admin/scraper-configs/` is best, BUT Task 3.1 MUST complete audit with documented rationale before Task 3.2 proceeds (Gate 1)
- **Cost Cap Default**: $5.00 USD per Discovery job (user-validated default)
- **Discovery Model**: gpt-4o-mini (cost-effective default, configurable per-job)

### Validation Gates (Hard Stop Points)
- **Gate 1**: After Task 3.1 - User must approve canonical editor choice before Task 3.2 starts
  - **Decision Record**: Update plan with `<!-- GATE 1 APPROVED: BayStateApp/components/admin/scraper-configs/ selected -->`
  - **Abort Condition**: If no consensus, pause and reassess scope
  
- **Gate 2**: After Task 3.6 - User must approve Scraper Studio deprecation before Task 3.7 starts
  - **Decision Record**: Update plan with `<!-- GATE 2 APPROVED: Studio kept -->`
  - **Abort Condition**: If Studio actively used, skip Task 3.7 and update navigation to keep Studio link
  
- **Gate 3**: After Phase 3 - All redirects must return 307 (not 404) before Phase 4 deletions start
  - **Decision Record**: Attach evidence `.sisyphus/evidence/gate-3-redirect-test.txt` showing all 307s
  - **Abort Condition**: Any 404s found = fix redirects before proceeding to Phase 4

### Defaults Applied
- **Chunk Size Default**: 50 SKUs (existing default)
- **Max Workers Default**: 3 per runner (existing default)

### Decisions Made
- Keep chunking system unchanged (user explicitly likes it)
- Keep Supabase scraper storage (user explicitly likes it)
- Discovery becomes job-level option (not scraper config)
- Deprecate gradually with redirects (Phase 3), physical deletion after validation (Phase 4)

### Critical Gaps (Resolved via Validation Gates)
- [x] Scraper Studio usage: **Gate 2** blocks deletion until verified
- [x] Config editor choice: **Gate 1** blocks migration until audited
- [x] AI config dependency: Assumed safe to remove, Gate 1 validates

---

## Risk Mitigation

### Technical Risks
1. **Dual System Risk**: Legacy `scrapers` and new `scraper_configs` coexist
   - **Mitigation**: Phase 4.1 extensive testing, backward compatibility checks

2. **Contract Drift**: UI simplification may tempt payload changes
   - **Mitigation**: Explicit guardrails in "Must NOT Have", Phase 4.3 protocol tests

3. **Operational Blind Spot**: Removing panels could hide failure visibility
   - **Mitigation**: Unified job monitoring must show chunk-level progress

4. **Discovery Cost Risk**: First-class Discovery could raise API spend
   - **Mitigation**: Task 1.3 cost caps, default limits, cost estimates in UI

5. **Migration Risk**: Partial deprecation creates dead code
   - **Mitigation**: Phase 3.9 redirects, Phase 4.5 final cleanup

### Operational Risks
1. **User Disruption**: Navigation changes confuse operators
   - **Mitigation**: Redirects, documentation, gradual rollout

2. **Feature Loss**: Accidentally removing used features
   - **Mitigation**: Task 3.6 assessment, user validation before deletion

---

## Post-Deployment

### Monitoring
- Track Discovery job success rates
- Monitor API costs (OpenAI, Brave)
- Watch for 404s on deprecated routes
- Check runner claiming rates

### Future Enhancements
- Auto-consolidation on job completion (currently manual)
- Discovery result caching across jobs
- Smart scraper selection (auto-detect best scraper per product)
- Job scheduling (enqueue for later)

