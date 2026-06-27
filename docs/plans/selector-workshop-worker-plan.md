# Selector Workshop — Worker Implementation Plan

**Generated:** 2026-06-27
**Approved decisions:** 9 architectural choices resolved via grill-with-docs
**Context docs:** CONTEXT.md (updated glossary), ADR 0012 (sync endpoint)

---

## Scope

Build a **Selector Workshop** factory for creating/editing site extraction profiles.
Admins open a profile, see AI-generated selectors, edit them inline with live
visual feedback against real pages, and save as draft versions.

### Acceptance Criteria (MVP)

- [ ] Admin opens a profile and sees all selectors with extracted values from a test URL
- [ ] Admin can edit a selector inline (field_name, selector, type, required) and re-test
- [ ] Admin can add/remove selector fields
- [ ] Admin can test against ad-hoc URLs + verified PDP seeds (tabbed)
- [ ] Extracted images are shown with preview thumbnails
- [ ] "Save as Draft" creates/updates a profile version (single in-progress draft)
- [ ] Existing draft/validate/approve flow still works
- [ ] **161 existing web tests + ~80 scraper tests still pass**

---

## Architecture Decisions (from grilling)

| # | Decision | Implementation |
|---|----------|---------------|
| 1 | Workshop test = dedicated sync endpoint | Runner adds asyncio HTTP server on port 9099; web calls it directly |
| 2 | Workshop save = direct version creation | Web compiles selectors→rules→schema→hash, inserts version row |
| 3 | Full field rule editor | Edit field_name, selector, type (text/image/attribute), required flag |
| 4 | Ad-hoc URL bar + formal seed tabs | Both testing modes with promotion path |
| 5 | Route: `/admin/profile-maintenance/profiles/[id]/workshop` | Full-page Workspace View |
| 6 | Fix validation: assertions + real extraction | Auto-populate expected_assertions; replace regex with JsonCssExtractionStrategy |
| 7 | Unstick validating: callback + sweeper | Reset version on job failure; sweeper for stalled jobs |
| 8 | Single in-progress draft | Save updates existing draft or creates new; no version inflation |
| 9 | Hybrid images: seed + fresh detection | Reuse seed images for known URLs; fresh detection for ad-hoc |

---

## Implementation Steps

### Step 1: Fix Existing Gaps

#### 1a. ProfileList duplicate column + Workshop button
File: `apps/web/components/admin/profile-maintenance/ProfileList.tsx`
- Remove duplicate "Created" column (two `<TableCell>` entries for same data)
- Add "Workshop" button (Wrench icon) to ProfileActions — navigates to workshop page
- Use `window.location.href` for navigation (test-compatible, no useRouter mock needed)

#### 1b. Unstick "validating" status on job failure
File: `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts`
- After the artifact creation block, add a section for non-succeeded validate_profile_version jobs
- If `body.status !== 'succeeded' && job.kind === 'validate_profile_version'`, reset version status from 'validating' to 'draft'

#### 1c. Version GET endpoint
File: `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/route.ts` (NEW)
- `GET` endpoint that returns all versions for a profile, ordered by version_number desc
- Selects: id, profile_id, version_number, status, version_hash, created_from, created_at, etc.

#### 1d. Auto-populate expected_assertions from seed verification
File: `apps/web/lib/profile-maintenance/seed-update.ts`
- The `ensureValidationCaseForSeed` function already sets `{ page_type: 'product_detail_page' }`
- If the seed verification result includes extracted values, add them to expected_assertions
- (If not available, page_type assertion is sufficient for MVP)

### Step 2: Runner Workshop Extraction Server

File: `apps/scraper/runner/workshop_server.py` (NEW)

Add a lightweight asyncio HTTP server to the scraper daemon (stdlib only, no new deps):
- Endpoint: `POST /api/scraper/v1/workshop/extract`
- Auth: `X-API-Key: bsr_*` header
- Body: `{ url, selectors: [{name, selector, type, attribute?}], browser_profile_ref? }`
- Response: `{ results: [{field, selector, extracted_value, confidence, error}], images: [...] }`
- Uses crawl4ai's `JsonCssExtractionStrategy` for real extraction (not regex)
- Uses `build_image_candidates` + `select_image_candidates` for image detection
- Rate limited: `asyncio.Semaphore(3)` for max 3 concurrent extractions
- 15s hard timeout per request
- Returns graceful errors for timeout, crawl failure, empty results

Integration into daemon (`apps/scraper/daemon.py`):
- Import `start_workshop_server` / `stop_workshop_server` (with no-op fallbacks)
- Call `await start_workshop_server(port=9099)` after metrics server start
- Call `await stop_workshop_server()` during shutdown

### Step 3: Web Workshop Test Endpoint

File: `apps/web/app/api/admin/site-extraction-profiles/[profileId]/workshop/test/route.ts` (NEW)

- `POST` endpoint accepting `{ url, selectors[], version_id? }`
- Validates admin auth, profile existence, and selector structure
- Optionally resolves browser_profile_ref from validated browser profiles for the profile's scope
- Calls runner's workshop extraction endpoint via HTTP fetch
- 18s total timeout (runner has 15s)
- Handles: runner unavailable (502), timeout (504), extraction errors
- Returns: `{ results, images, elapsed_ms, url }`

### Step 4: Web Workshop Save Endpoint

File: `apps/web/app/api/admin/site-extraction-profiles/[profileId]/workshop/save/route.ts` (NEW)

- `POST` endpoint accepting `{ selectors: [{field_name, selector, type, required?, attribute?}] }`
- Compiles selectors to Field Evidence Rules (BayState format) and Crawl4AI schema
- Computes SHA256 version hash of rules + schema
- Single in-progress draft: if draft version exists, update in-place; else create new
- Version created with `created_from: 'manual'`
- Returns `{ version: { id, version_number, status, version_hash } }`

### Step 5: Selector Workshop UI

#### 5a. Page route
File: `apps/web/app/admin/profile-maintenance/profiles/[profileId]/workshop/page.tsx` (NEW)

Server component that fetches:
- Profile with brand name (site_extraction_profiles + brands!inner)
- All versions (for version selector)
- Verified PDP seeds (for seed tabs)

Passes data to `<SelectorWorkshop>` client component.

#### 5b. Client component
File: `apps/web/components/admin/profile-maintenance/SelectorWorkshop.tsx` (NEW)

Subcomponents (inline, not separate files for MVP):
- **Header**: brand/domain info, version badge, "Save as Draft" button
- **URL Bar**: text input + "Test" button + seed URL tabs (Custom + verified seeds)
- **Selector List** (left panel): each selector shown as compact card or expanded editor
  - Compact: field_name, type badge, selector string, extracted value preview, delete button
  - Expanded (on click): inline form for field_name, selector, type dropdown, required checkbox
  - "Add Field" button at top
  - Scrollable container
- **Results Panel** (right panel): extraction result badges + image gallery grid
  - Image thumbnails with selected/rejected indicators
  - Empty state: "Enter URL and click Test"
  - Loading state: spinner with hostname
- **Actions Bar** (bottom): "Test Again" + "Save as Draft" buttons, field count indicator

Grid layout: 2-column on lg screens (`lg:grid-cols-2`), single column on mobile.

### Step 6: Fix Runner Validation Extraction

File: `apps/scraper/runner/profile_maintenance.py`

Replace `_extract_fields_from_html` (regex-based) in `_run_single_validation_case` with
a new `_extract_with_crawl4ai` async function that:
- Uses `JsonCssExtractionStrategy` with the compiled schema
- Crawls the URL fresh and extracts real values
- Falls back to regex extraction if Crawl4AI fails
- Returns `dict[str, Any]` of field_name → extracted_value

**Important**: Ensure any existing test mocks that patch `Crawl4AIEngine` or `AsyncWebCrawler`
continue to work. The test failures from earlier changes (11 tests) suggest mock compatibility
issues — the worker must ensure tests pass.

### Step 7: Wire Navigation

File: `apps/web/components/admin/profile-maintenance/ProfileList.tsx`
- Add "Workshop" button to every profile row (next to Validate button)
- Navigates to `/admin/profile-maintenance/profiles/${profile.id}/workshop`

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/scraper/runner/workshop_server.py` | Runner sync extraction server |
| `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/route.ts` | Version GET endpoint |
| `apps/web/app/api/admin/site-extraction-profiles/[profileId]/workshop/test/route.ts` | Workshop test API |
| `apps/web/app/api/admin/site-extraction-profiles/[profileId]/workshop/save/route.ts` | Workshop save API |
| `apps/web/app/admin/profile-maintenance/profiles/[profileId]/workshop/page.tsx` | Workshop page route |
| `apps/web/components/admin/profile-maintenance/SelectorWorkshop.tsx` | Workshop client component |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/scraper/daemon.py` | Import + start/stop workshop server |
| `apps/scraper/runner/profile_maintenance.py` | `_run_single_validation_case` → use `_extract_with_crawl4ai` |
| `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts` | Reset version on validation job failure |
| `apps/web/components/admin/profile-maintenance/ProfileList.tsx` | Remove duplicate column, add Workshop button |

## Files to Keep (already updated this session)

| File | Status |
|------|--------|
| `CONTEXT.md` | Updated with 7 glossary terms |
| `docs/adr/0012-selector-workshop-synchronous-extraction-endpoint.md` | New ADR |
| `docs/handoffs/selector-workshop-factory-handoff.md` | Updated |

---

## Validation Contract

Before the worker can call this done:

1. `bun run web lint` — no new ESLint errors in changed files
2. `bun run web test -- --testPathPatterns="profile-maintenance" --runInBand` — 161 tests pass
3. `cd apps/scraper && python -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py tests/unit/test_draft_profile.py -q` — ~80+ tests pass
4. All new API endpoints return correct status codes:
   - `GET /api/admin/site-extraction-profiles/[profileId]/versions` → 200
   - `POST /api/admin/site-extraction-profiles/[profileId]/workshop/test` → 200 (with valid body)
   - `POST /api/admin/site-extraction-profiles/[profileId]/workshop/save` → 200
5. SelectorWorkshop page renders without errors
6. No TypeScript compilation errors (`bun run tsc --noEmit || true` in web — non-blocking)

## Non-Goals

- Do NOT add new npm/pip dependencies
- Do NOT modify the existing draft/validate/approve flow
- Do NOT add database migrations (existing schema is sufficient)
- Do NOT rebuild existing profile maintenance UI (queue, tabs, drawer)
- Do NOT implement image lazy-loading optimization, pagination, or caching (MVP only)
- Do NOT implement multi-admin conflict detection (out of scope)

## Hard Constraints

- Runner workshop server MUST use stdlib asyncio only (no aiohttp, no FastAPI, no Flask)
- All API endpoints MUST use `requireAdminAuth` or `requireAdminOnlyAuth` (no unauthenticated access)
- Workshop test MUST respect the 15s timeout cap
- Version save MUST preserve the `created_from` provenance column
- All client components MUST be `'use client'` with proper separation from server components
- Do NOT introduce playwright/crawl4ai as a web dependency (crawling happens on the runner)
