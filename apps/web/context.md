# Code Context: `official_brand_extraction` job type

## Constant definition

**File:** `lib/official-brand-workflow.ts:5`
```ts
export const OFFICIAL_BRAND_EXTRACTION_TYPE = 'official_brand_extraction';
```
Also exported from `lib/pipeline-scraping.ts:16` (re-imported from official-brand-workflow).

**Runner-side duplicate:** `apps/scraper/runner/__init__.py:31`
```python
OFFICIAL_BRAND_EXTRACTION_TYPE = "official_brand_extraction"
```

---

## 1. ALL references (files & line ranges)

### Web app — runtime code

| File | Lines | Role |
|------|-------|------|
| `lib/official-brand-workflow.ts` | 5, 215, 240, 431 | Constant def, phase detection, job type check, metadata source label |
| `lib/pipeline-scraping.ts` | 16, 92, 897, 919–920 | Import, type union, `isOfficialBrandExtraction` flag, job insert type selection |
| `app/api/admin/pipeline/active-runs/route.ts` | 75 | Literal string `"official_brand_extraction"` in `getOfficialBrandPhase()` |
| `app/api/admin/pipeline/official-brand/extract/route.ts` | 220 | Calls `scrapeProducts()` with `officialBrandPhase: "extraction"` (non-literal, uses the string directly in options) |
| `app/api/scraper/v1/poll/route.ts` | 26, 115, 116 | Import, `normalizeRunnerJobType` (pass‑through for this type) |
| `app/api/scraper/v1/job/route.ts` | 19, 96, 97 | Import, `normalizeRunnerJobType` (pass‑through) |
| `app/api/admin/scraping/callback/route.ts` | 26, 590 | Import `buildExtractedOfficialBrandCandidateRows`, calls it for extraction results |
| `app/api/scraper/v1/chunk-callback/route.ts` | 22, 132 | Same — import and call for extraction results |
| `components/admin/pipeline/PipelineClient.tsx` | 1455 | Hardcoded literal `"official_brand_extraction"` passed as `jobSubtype` prop to `<ActiveRunsTab>` |

### Web app — tests

| File | Lines | Role |
|------|-------|------|
| `__tests__/lib/official-brand-workflow.test.ts` | 13, 170, 196 | Import, phase detection type check, `isOfficialBrandJobType` test |
| `__tests__/lib/pipeline-scraping.test.ts` | 674, 700, 734 | Creation test; asserts `insertedPayload.type === 'official_brand_extraction'` |
| `__tests__/api/admin/pipeline/active-runs.test.ts` | 96, 168 | Literal string `"official_brand_extraction"` in mock job data |

### Web app — DB migrations

| File | Lines | Role |
|------|-------|------|
| `supabase/migrations/20260501000000_official_brand_phases.sql` | 13 | CHECK constraint includes `'official_brand_extraction'` |
| `supabase/migrations/20260505000000_add_deep_research_job_type.sql` | 13 | CHECK constraint re‑declared, includes `'official_brand_extraction'` (carried forward) |

### Scraper runner

| File | Lines | Role |
|------|-------|------|
| `runner/__init__.py` | 31 | Constant def |
| `runner/__init__.py` | 556 | Included in `is_official_brand_job` set (`{..., OFFICIAL_BRAND_EXTRACTION_TYPE, ...}`) |
| `runner/__init__.py` | 1096 | Phase dispatch: selects extraction path when `job_type in {OFFICIAL_BRAND_EXTRACTION_TYPE, DIRECT_URL_EXTRACTION_TYPE}` |
| `runner/__init__.py` | 1254 | Comment: "Both official_brand_extraction and direct_url_extraction use the same extraction path" |

### Scraper — tuning/tests

| File | Lines | Role |
|------|-------|------|
| `scrapers/ai_search/tuning_inventory.json` | 8, 252, 256 | Dataset seed reference and entry |
| `benchmarks/official_brand/fixtures/extraction_seed.json` | 2 | `schema_version` metadata string |
| `tests/unit/test_tuning_inventory.py` | 104 | Checks seed entry exists |
| `tests/unit/test_official_brand_extraction_seed.py` | 14 | Validates fixture schema version |

---

## 2. How it's dispatched (jobs queued/created)

Extraction jobs are only created via `scrapeProducts()` in `lib/pipeline-scraping.ts`.

### Call chain
```
scrapeProducts(skus, { officialBrandPhase: 'extraction', ... })
  → determines isOfficialBrandExtraction = true (line 897)
  → sets jobType = OFFICIAL_BRAND_EXTRACTION_TYPE (line 919-920)
  → builds insert payload with { type: OFFICIAL_BRAND_EXTRACTION_TYPE, config: { phase: 'extraction', cohort, items } }
  → inserts into scrape_jobs table (line ~1094)
  → also builds manual candidate rows if extraction URLs are provided (line 1118-1132)
  → updates products_ingestion.pipeline_status = 'extracting' (line 1145)
```

### Entry points that call `scrapeProducts` with extraction phase:

1. **`app/api/admin/pipeline/official-brand/extract/route.ts`** (POST) — The primary dispatch point. Admin UI sends SKUs, the route looks up `official_brand_url_candidates` selected rows, builds URLs, then calls `scrapeProducts()`. This is the main "Start Extraction" button handler.

2. **`app/api/admin/pipeline/scrape/route.ts`** (POST, line 372) — The generic pipeline scrape route. When `enrichment_method === 'official_brand'` and `officialBrandPhase === 'extraction'`, it also calls `scrapeProducts()`.

3. **`app/api/scraper/v1/poll/route.ts`** — The runner poll route doesn't *create* extraction jobs, but it **dispatches them to the runner** by polling the `scrape_jobs` table via `claim_next_pending_job` RPC. The normalized job type is passed through (line 116).

### Runner-side dispatch (in `runner/__init__.py`):

- Line 556: `is_official_brand_job` check catches `job_type == OFFICIAL_BRAND_EXTRACTION_TYPE`
- Line 1096: Inside `_run_official_brand_job()`, sets `official_brand_phase = "extraction"`
- Line 1254: Instantiates `ProductUrlExtractor` and calls `extract_products_from_urls_batch()` (same path as `direct_url_extraction`)

---

## 3. `OFFICIAL_BRAND_EXTRACTION_TYPE` constant — all usages

### In `lib/official-brand-workflow.ts`

| Line | Usage |
|------|-------|
| 5 | `export const OFFICIAL_BRAND_EXTRACTION_TYPE = 'official_brand_extraction'` |
| 215 | `getOfficialBrandPhaseFromJob`: returns `'extraction'` when `job.type === OFFICIAL_BRAND_EXTRACTION_TYPE` |
| 240 | `isOfficialBrandJobType`: returns true when `type === OFFICIAL_BRAND_EXTRACTION_TYPE` |

Also used from the `OFFICIAL_BRAND_EXTRACTION_TYPE` side:
- Line 431: metadata string `source: 'official_brand_extraction_callback'` (not the constant, but related)

### In `lib/pipeline-scraping.ts`

| Line | Usage |
|------|-------|
| 16 | Imported from official-brand-workflow |
| 92 | `ScrapeJobInsertType` union includes `typeof OFFICIAL_BRAND_EXTRACTION_TYPE` |
| 919-920 | Job type selection: `isOfficialBrandExtraction ? OFFICIAL_BRAND_EXTRACTION_TYPE :` |

### In `app/api/scraper/v1/poll/route.ts`

| Line | Usage |
|------|-------|
| 26 | Imported from official-brand-workflow |
| 115 | Return type of `normalizeRunnerJobType` includes `typeof OFFICIAL_BRAND_EXTRACTION_TYPE` |
| 116 | Pass-through check: `if (rawType === ... || rawType === OFFICIAL_BRAND_EXTRACTION_TYPE)` |

### In `app/api/scraper/v1/job/route.ts`

| Line | Usage |
|------|-------|
| 19 | Imported |
| 96 | Return type includes `typeof OFFICIAL_BRAND_EXTRACTION_TYPE` |
| 97 | Pass-through check |

### In `__tests__/lib/official-brand-workflow.test.ts`

| Line | Usage |
|------|-------|
| 13 | Imported |
| 170 | `getOfficialBrandPhaseFromJob({ type: OFFICIAL_BRAND_EXTRACTION_TYPE })` → expects `'extraction'` |
| 196 | `isOfficialBrandJobType(OFFICIAL_BRAND_EXTRACTION_TYPE)` → expects true |

---

## 4. All API endpoints / server actions that create extraction jobs

| Endpoint | File | How |
|----------|------|-----|
| `POST /api/admin/pipeline/official-brand/extract` | `app/api/admin/pipeline/official-brand/extract/route.ts` | Primary path — loads selected candidates, calls `scrapeProducts()` with `officialBrandPhase: 'extraction'` |
| `POST /api/admin/pipeline/scrape` | `app/api/admin/pipeline/scrape/route.ts` | Generic pipeline scrape — when enrichment method is official_brand + phase = extraction |
| `POST /api/scraper/v1/poll` | `app/api/scraper/v1/poll/route.ts` | **Dispatches** existing extraction jobs to runners (does not create them) |
| `POST /api/scraper/v1/job` (GET) | `app/api/scraper/v1/job/route.ts` | Returns job config for runner (pass-through type) |

Both callback routes (`app/api/admin/scraping/callback/route.ts` and `app/api/scraper/v1/chunk-callback/route.ts`) **consume** extraction results. They call `buildExtractedOfficialBrandCandidateRows()` when processing job results.

---

## 5. `official-brand-workflow.ts` — full usage of `OFFICIAL_BRAND_EXTRACTION_TYPE`

Full file content at `lib/official-brand-workflow.ts` (468 lines). Key sections:

| Section | Lines | Use of constant |
|---------|-------|-----------------|
| Constant exports | 3-5 | Defines `OFFICIAL_BRAND_SOURCE_KEY`, `OFFICIAL_BRAND_URL_DISCOVERY_TYPE`, `OFFICIAL_BRAND_EXTRACTION_TYPE` |
| `getOfficialBrandPhaseFromJob()` | 205-242 | Line 215 checks `job.type === OFFICIAL_BRAND_EXTRACTION_TYPE` → returns `'extraction'` |
| `isOfficialBrandJobType()` | 244-248 | Line 246 checks `type === OFFICIAL_BRAND_EXTRACTION_TYPE` (returns true) |
| `buildExtractedOfficialBrandCandidateRows()` | 389-434 | Line 431: sets `metadata.source = 'official_brand_extraction_callback'` (string literal, not constant) |

The constant is **not** used directly in `buildExtractedOfficialBrandCandidateRows` — that function uses the string literal `'official_brand_extraction_callback'` for source metadata on extracted candidates.

---

## Touchpoints summary for renaming/removal

### If renaming (safe rename checklist):

1. **`lib/official-brand-workflow.ts:5`** — change constant value
2. **`lib/pipeline-scraping.ts:92`** — type union (no change needed if constant-driven)
3. **`lib/pipeline-scraping.ts:919-920`** — uses constant, no change
4. **`apps/scraper/runner/__init__.py:31`** — change constant value
5. **`apps/scraper/runner/__init__.py:556,1096`** — uses constant, no change
6. **`app/api/scraper/v1/poll/route.ts:26,115-116`** — uses constant, no change
7. **`app/api/scraper/v1/job/route.ts:19,96-97`** — uses constant, no change
8. **`app/api/admin/pipeline/active-runs/route.ts:75`** — **literal string**, must update
9. **`components/admin/pipeline/PipelineClient.tsx:1455`** — **literal string**, must update
10. **`supabase/migrations/20260501000000_official_brand_phases.sql:13`** — CHECK constraint, new migration needed
11. **`supabase/migrations/20260505000000_add_deep_research_job_type.sql:13`** — CHECK constraint, new migration needed
12. **`__tests__/lib/official-brand-workflow.test.ts:13,170,196`** — import test, no change if constant
13. **`__tests__/lib/pipeline-scraping.test.ts:674,700,734`** — asserts literal `'official_brand_extraction'`, must update
14. **`__tests__/api/admin/pipeline/active-runs.test.ts:96,168`** — literal string, must update
15. **Scraper tuning/seed/test files** — update string references:
    - `scrapers/ai_search/tuning_inventory.json`
    - `benchmarks/official_brand/fixtures/extraction_seed.json`
    - `tests/unit/test_official_brand_extraction_seed.py`
    - `tests/unit/test_tuning_inventory.py`

### If removing entirely:

- Remove the `'official_brand_extraction'` entry from the `scrape_jobs` CHECK constraint (new migration)
- Remove the `OFFICIAL_BRAND_EXTRACTION_TYPE` constant from both web and scraper
- Remove `isOfficialBrandExtraction` branch from `pipeline-scraping.ts`
- Remove or rewrite the `POST /api/admin/pipeline/official-brand/extract` route
- Remove extraction-related code in `pipeline-scraping.ts` (lines 897, 919, 968-1137 area)
- Clean up `getOfficialBrandPhaseFromJob` in `official-brand-workflow.ts` (remove the extraction check)
- Clean up `isOfficialBrandJobType` in `official-brand-workflow.ts` (remove extraction check)
- Clean up `normalizeRunnerJobType` in both `poll/route.ts` and `job/route.ts`
- Remove `buildExtractedOfficialBrandCandidateRows` and its callers (two callback routes)
- Remove the `"extracting"` status piping in PipelineClient.tsx (line 1440 area)
- Remove scraper runner extraction path (lines 1096, 1254)
- Update/remove scraper test seeds referencing the string

### Key constraints/risks

- The CHECK constraint in the DB makes `scrape_jobs.type` reject unknown values. Migration must be applied carefully — old extraction jobs with this type will violate the new constraint if you remove it without migrating them.
- The `claim_next_pending_job` RPC may reference the type — check the actual RPC function in migrations.
- The scraper runner uses a `set` check in `is_official_brand_job` (line 556) and phase detection (line 1096) — easy to miss.
- PipelineClient.tsx passes the literal string to `<ActiveRunsTab>`, which then filters jobs. If renamed, both the component and the API response (`jobType` field from active-runs/route.ts) must match.
