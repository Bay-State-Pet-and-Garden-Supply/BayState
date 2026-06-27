# Selector Workshop — Profile Building Factory Handoff

**Date:** 2026-06-26  
**Status:** Architecture direction decided, implementation pending  
**Context:** The Site Extraction Profile system has 10 built slices (queue, tables, APIs, UI drawer, PDP verification, AI draft, validation, approval, browser profiles, enrichment snapshots, explicit corrections). The next phase is making this a **factory** for generating scraping profiles for every official brand website in the database.

---

## 1. Architecture Decision

The interactive **Selector Workshop** pattern was chosen over the fixed-expected-values validation model.

**Why Workshop over Generate-Correct-Regenerate:**
- AI-generated selectors are a starting point, not a finished product — every site has unique markup
- Admins need live visual feedback showing what each selector extracts from real pages
- The factory needs to scale to hundreds of brands, and the friction of "draft → validate → correct → regenerate" per brand is too high
- Direct selector editing with live preview is the fastest path to correct extraction rules
- Explicit Corrections stay as the maintenance/improvement path for active profiles

---

## 2. Current State (complete, do not rebuild)

### Database
| Migration | Tables |
|-----------|--------|
| `20260625000000_profile_maintenance_jobs` | `profile_maintenance_jobs`, `profile_maintenance_artifacts` |
| `20260626000000_site_extraction_profile_foundation` | `site_extraction_profiles`, `site_extraction_profile_versions`, `explicit_extraction_corrections`, `product_detail_page_seeds`, `profile_validation_sets/cases/runs`, `browser_profiles`, `browser_profile_setup_requests` |
| `20260627000000_activate_profile_version_rpc` | `activate_profile_version()` PG function |

### Admin API (all working)
- `POST /api/admin/brands/[id]/source-setup` — save domain, upsert profile
- `POST /api/admin/brands/[id]/source-setup/pdp-seeds` — create seed, enqueue verify
- `POST /api/admin/site-extraction-profiles/[profileId]/draft` — enqueue AI schema draft
- `POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate` — enqueue validation
- `POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve` — atomic activation
- `POST /api/admin/explicit-corrections` — create field correction
- `POST /api/admin/explicit-corrections/promote` — convert corrections → draft version
- `GET /api/admin/profile-maintenance/jobs` / `artifacts`

### Runner (working with raw crawl4ai)
- `verify_pdp_seed` — crawl URL, classify page, build image candidates, produce evidence artifact
- `draft_site_extraction_profile` — crawl seed, call `JsonCssExtractionStrategy.generate_schema()` with project LLM config, produce rules + compiled schema
- `validate_profile_version` — crawl cases, apply compiled schema, compare against expected_assertions, classify failures
- `browser_profile_setup` / `browser_profile_revalidate` — interactive profile provisioning stubs

### UI (working)
- **Brand Source Setup Drawer** (3 steps): Domain → PDP Seeds → Profile Status
- **Profile Maintenance Workspace**: Jobs/Seeds/Profiles/Browser Profiles/Corrections tabs
- Profile list shows Validate button for draft profiles

### Tests
- Web: 161 tests across 15 Jest suites (profile-maintenance APIs, helpers, UI)
- Scraper: ~80 pytest tests (runner handlers, image candidates, page classifier)

---

## 3. What the Workshop Needs to Become

### Core concept
A **Selector Workshop** component where admins:
1. Open a profile for a specific brand/domain
2. See all 11 AI-generated selectors with live extraction results from the verified PDP seed
3. Edit selectors inline (CSS selector, field name, type, required flag) — per ADR 0008, rules are declarative Crawl4AI primitives; XPath support must be explicitly allowed if needed
4. Add new selectors or remove ones that don't work
5. Test against multiple PDP pages to ensure selectors work broadly
6. See extracted images (which images the selectors find, with previews)
7. Save as a new Profile Version (draft → validate → approve)

### Key components to build

```
apps/web/components/admin/profile-maintenance/SelectorWorkshop.tsx   (NEW)
├── SelectorWorkshopHeader      — brand/domain info, version selector, save button
├── SelectorWorkshopUrlBar      — PDP URL input, "Test" button, multi-PDP tabs
├── SelectorWorkshopResultPanel — side-by-side: extracted values + selector list
├── SelectorEditor              — inline editor per selector (name, type, CSS/XPath, test)
├── SelectorImageGallery         — selected/rejected images from ProductMediaSelector
└── SelectorWorkshopActions      — Save as Draft Version, Validate, Approve
```

### Data flow

```
Admin enters PDP URL → clicks Test
  → Web coordinator compiles current selectors → Crawl4AI schema
  → Web calls runner's sync endpoint: POST /api/scraper/v1/workshop/extract
  → Runner crawls URL + applies schema + runs image detection → returns results
  → UI shows side-by-side: selector | extracted value | image previews

Admin edits a selector → UI updates locally
  → "Test again" re-runs extraction with updated selectors
  → "Save as Draft" → POST /api/admin/.../workshop/save
    → Web compiles rules → schema, computes hash
    → Creates or updates draft profile version (created_from: 'manual')
    → Reuses existing validate/approve flow for activation
```

**Note**: The Workshop test is stateless — no profile_maintenance_jobs row, no artifact. The web coordinator owns all persistence.

### New API endpoints needed

```
POST /api/admin/site-extraction-profiles/[profileId]/workshop/test
  — Accepts { url, selectors[], version_id? }
  — Returns { results: [{ field, selector, extracted_value, confidence, error }], images: [...] }
  — Web coordinator calls runner's sync extraction endpoint directly (not through job queue)
  — See ADR 0012 for the full sync endpoint contract

POST /api/admin/site-extraction-profiles/[profileId]/workshop/save
  — Accepts { selectors[], rules, version_note }
  — Creates or updates a single in-progress draft version (no version-number inflation)
  — Compiles field rules → Crawl4AI schema on the web side (deterministic, no LLM)
  — Returns { version }

GET /api/admin/site-extraction-profiles/[profileId]/versions
  — Returns all versions with selectors, status, hash (existing API gap)
```

### Runner changes needed

Add `POST /api/scraper/v1/workshop/extract` sync endpoint:
- **Stateless**: No job row, no lease, no artifact, no DB persistence
- Crawl URL with provided selectors + compiled schema
- Return per-selector extraction results with extracted values, confidence, errors
- Return image candidates for the page (fresh detection)
- Fast turnaround (target <10s, hard cap 15s)
- **Rate limited**: Enforce concurrency caps to prevent runner saturation
- See ADR 0012 for full specification

**Not a job kind** — this is a direct REST endpoint, not a `profile_maintenance_jobs` row.

---

## 4. Explicit Corrections Integration

The existing Explicit Corrections system feeds into the Workshop:
- When an admin marks a field as accepted/rejected, it creates an `explicit_extraction_corrections` row
- The Workshop shows correction history per field
- "Promote" converts accepted corrections into a new draft version
- Corrections survive across version regenerations

---

## 5. Remaining Gaps (bugs/debt to fix)

| Issue | File | Fix |
|-------|------|-----|
| Validation always fails | `profile_maintenance.py:890+` | expected_assertions is always `{}` — need auto-populate from seed crawl |
| Stuck "validating" status | validate route | No auto-reset on job failure; version stays "validating" forever |
| Daemon build check | `daemon.py` | `BAYSTATE_RUNNER_BUILD_ID` must be set in .env for local dev |
| ProfileList colSpan | `ProfileList.tsx` | Set to 8 after adding Actions column |
| No version GET endpoint | API gap | Need `GET /api/admin/site-extraction-profiles/[profileId]/versions` |
| Image preview missing | `PdpSeedStep.tsx` | Verified seeds show "View evidence" link but no image thumbnails |
| Webpack/Turbopack build | `page.tsx` | Promise.all destructuring fixed but verify with `bun run build` |

---

## 6. Implementation Order

1. **Fix gaps first** (auto-populate expected_assertions, unstick validating, version GET endpoint)
2. **Build Workshop test endpoint** — `workshop/test-pdp` runner handler + API
3. **Build SelectorWorkshop UI** — live preview panel with selector editor
4. **Workshop save flow** — create/edit versions from workshop
5. **Image gallery** — show extracted/rejected images per selector
6. **Multi-PDP testing** — test selectors against multiple seed URLs
7. **Explicit Corrections integration** — show correction history in workshop, promote workflow
8. **Approve from workshop** — inline approve button when validation passes

---

## 7. Quickstart — Resume Development

```bash
# Start web
cd apps/web && bun run dev

# Start scraper with profile maintenance
cd apps/scraper
# Ensure .env has:
#   SCRAPER_API_URL=http://localhost:3000
#   SCRAPER_API_KEY=bsr_k9MCQzy5H-66sg0ugVYrvTXSd7fTE1lOJk2Ch7TA1To
#   PROFILE_MAINTENANCE_JOBS_ENABLED=true
#   BAYSTATE_RUNNER_BUILD_ID=28167433915-1
#   LLM_MODEL=deepseek-chat
python3 daemon.py --env dev --test-mode

# Run tests
cd apps/web && node scripts/run-jest.cjs --testPathPatterns="profile-maintenance" --no-coverage --runInBand
cd apps/scraper && python3 -m pytest tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py tests/unit/test_draft_profile.py -q
```

---

## 8. Acceptance Criteria for Workshop MVP

- [ ] Admin can open a profile and see all selectors with extracted values from a test URL
- [ ] Admin can edit a selector inline and re-test against the same URL
- [ ] Admin can add a new selector field
- [ ] Admin can remove a selector
- [ ] Admin can test against multiple PDP URLs (tabbed view)
- [ ] Extracted images are shown with preview thumbnails
- [ ] "Save as Draft" creates a new profile version
- [ ] Existing draft/validate/approve flow still works
- [ ] 161 existing tests still pass
