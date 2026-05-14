# Code Context: BayState Web App Pipeline

> **Scout mission:** Map the current product import pipeline, schemas, consolidation logic, and tests to enable a migration from static/SERP/AI-extraction to AI-only extraction with simplified pipeline tabs.

---

## 1. Pipeline Statuses, State Machine, and Admin UI Tabs

### 1.1 Database/Canonical Statuses (`PersistedPipelineStatus`)

**File:** `apps/web/lib/pipeline/types.ts` (lines 6-19)

```typescript
export const PERSISTED_PIPELINE_STATUSES = [
  "imported",
  "searching",       // ← fallback SERP URL discovery
  "url_review",      // ← fallback URL candidate review
  "extracting",      // ← fallback direct URL extraction
  "scraping",        // ← static scraper execution
  "needs_fallback_review", // ← static scrape quality gate failed
  "scraped",
  "consolidating",
  "finalizing",
  "exporting",
  "failed",
] as const;
```

Total: **11 persisted statuses.**

### 1.2 Admin UI Tabs (`PIPELINE_TABS`)

**File:** `apps/web/lib/pipeline/types.ts` (lines 21-30)

```typescript
export const PIPELINE_TABS = [
  "imported",
  "scraping",
  "scraped",
  "consolidating",
  "finalizing",
  "exporting",
  "failed",
] as const;
```

Only **7 tabs** appear in the admin UI. The remaining 4 statuses (`searching`, `url_review`, `extracting`, `needs_fallback_review`) are internal/fallback only — products land there briefly but no tab shows them.

### 1.3 State Machine (`STATUS_TRANSITIONS`)

**File:** `apps/web/lib/pipeline/core.ts` (lines 7-30)

```typescript
export const STATUS_TRANSITIONS = {
  imported: ['scraping'],
  searching: ['url_review', 'imported', 'failed'],
  url_review: ['extracting', 'scraping', 'imported', 'failed'],
  extracting: ['scraped', 'url_review', 'failed'],
  scraping: ['scraped', 'failed', 'imported'],
  scraped: ['consolidating', 'finalizing', 'imported', 'failed'],
  consolidating: ['finalizing', 'scraped', 'failed'],
  finalizing: ['exporting', 'scraped', 'failed'],
  exporting: ['finalizing', 'failed'],
  failed: ['imported', 'url_review'],
};
```

Status map:
```
imported → scraping
searching → url_review → extracting → scraped
scraping → scraped
scraped → consolidating → finalizing → exporting
Any → failed
failed → imported | url_review
```

### 1.4 UI Stage Configuration

**File:** `apps/web/lib/pipeline/types.ts` (lines 107-165)

Each status/tab has a `STAGE_CONFIG` with label, color, and description. Visible tabs get colors: imported (gray #6B7280), scraping (blue #2563EB), scraped (blue #3B82F6), consolidating (purple #8B5CF6), finalizing (amber #F59E0B), exporting (green #008850), failed (red #DC2626).

### 1.5 Admin UI Rendering

**Files involved:**
- `apps/web/app/admin/pipeline/page.tsx` — Server Component page, fetches initial products/counts
- `apps/web/components/admin/pipeline/PipelineClient.tsx` — Main client orchestrator with tabs
- `apps/web/components/admin/pipeline/StageTabs.tsx` — Renders the 7 `PIPELINE_TABS`
- `apps/web/components/admin/pipeline/ImportedResultsView.tsx` — Shows "Imported" and "Exporting" tab content
- `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` — Shows "Scraped" tab content
- `apps/web/components/admin/pipeline/FinalizingResultsView.tsx` — Shows "Finalizing" tab content
- `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` — Shows "Scraping" tab (monitoring)
- `apps/web/components/admin/pipeline/ActiveConsolidationsTab.tsx` — Shows "Consolidating" tab (monitoring)
- `apps/web/components/admin/pipeline/FallbackReviewView.tsx` — Shown for `needs_fallback_review` products
- `apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx` — Shown for `url_review` products

### 1.6 Derivation Helpers

**File:** `apps/web/lib/pipeline/derivation.ts`

- `WORKFLOW_PIPELINE_TABS` — matches `PIPELINE_TABS` (7 tabs)
- `deriveTabFromProduct()` — maps `pipeline_status` to the tab it belongs to
- `getActiveJobsForProduct()` — checks `scrape_jobs` and `consolidation_batches` for active work
- Fallback statuses (`searching`, `url_review`, `extracting`) map to their respective tabs

---

## 2. Current Schema Definitions

### 2.1 Database Schema: `products_ingestion`

**Core table** (defined in multiple migrations):
- `apps/web/supabase/migrations/20251230175000_create_products_ingestion.sql`
- Current enum type: `pipeline_status_five` (from `20260412011500_canonicalize_pipeline_workflow.sql`)

```sql
CREATE TABLE public.products_ingestion (
    sku text PRIMARY KEY,
    input jsonb DEFAULT '{}',         -- Raw imported data from CSV/Integra
    consolidated jsonb DEFAULT '{}',   -- AI-consolidated product data
    sources jsonb DEFAULT '{}',        -- Scraped data keyed by source name
    pipeline_status pipeline_status_five NOT NULL,  -- Enum workflow state
    cohort_id uuid,                    -- Batch/cohort membership
    product_line text,                 -- Product line identifier
    image_candidates text[],           -- URLs of candidate product images
    selected_images jsonb,             -- User-selected images with metadata
    confidence_score numeric,          -- AI confidence (0-1)
    error_message text,                -- Error details if failed
    retry_count int DEFAULT 0,         -- Retry attempt counter
    scrape_quality jsonb DEFAULT '{}', -- Static scrape quality evaluation
    fallback_metadata jsonb DEFAULT '{}', -- Fallback approval/source metadata
    exported_at timestamptz,           -- When downstream export completed
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

The `pipeline_status_five` enum (from `20260412011500_canonicalize_pipeline_workflow.sql`):
```sql
CREATE TYPE pipeline_status_five AS ENUM (
    'imported', 'scraping', 'scraped', 'consolidating',
    'finalizing', 'exporting', 'failed'
);
```

Note: `needs_fallback_review` was added as a new enum value via `20260514023502_add_static_first_fallback_review.sql` (ALTER TYPE ... ADD VALUE). The `searching`, `url_review`, and `extracting` statuses appear to be handled as text values (not in the enum) — they were added earlier via `20260315000000_pipeline_redesign_statuses.sql` as text-based statuses.

### 2.2 Pipeline Product TypeScript Type

**File:** `apps/web/lib/pipeline/types.ts` (lines 42-105)

The `PipelineProduct` interface mirrors the DB schema and adds:
- `sources: Record<string, unknown>` — map of scraper name → scraped data
- `consolidated` — nullable object matching output schema
- `input` — raw import data (has fields like name, description, price, brand, pet_type, life_stage, etc.)
- Image fields: `image_candidates`, `selected_images`
- Cohort fields: `cohort_id`, `cohort_name`, `cohort_brand_name`, `cohort_brand_id`, `cohort_brands`

### 2.3 Consolidation Types

**File:** `apps/web/lib/consolidation/types.ts`

Key types:
- `ProductSource`: Contains `sku`, `sources` (record of source data), optional `productLineContext` with siblings
- `ConsolidationResult`: Output after AI processing — `sku`, `name`, `brand`, `description`, `search_keywords`, `weight`, `price`, `category`, `confidence_score`, `error`
- `BatchJob`: Database row from `batch_jobs` table
- `BatchJobItem`: Per-SKU work item (`batch_job_items` table)
- `ApplyResultsResponse`: Contains quality metrics, success/error counts

### 2.4 Finalization Draft Schema (Zod)

**File:** `apps/web/lib/pipeline/finalization-draft.ts` (lines 18-76)

Zod schema for the finalization review form:
```typescript
export const finalizationDraftSchema = z.object({
  name: z.string(), description: z.string(), price: z.string(),
  weight: z.string(), brandId: z.string(), brandName: z.string(),
  category: z.string(), stockStatus: z.enum([...]),
  // ... 20+ fields including petType, lifeStage, petSize, specialDiet,
  // healthFeature, foodForm, flavor, productFeature, size, color,
  // packagingType, isSpecialOrder, inStorePickup
});
```

### 2.5 Pipeline Run Types

**File:** `apps/web/lib/pipeline/run-types.ts`

- `PipelineRunKind`: `serp_search`, `page_scrape`, `consolidation`, `apply_results`
- `PipelineRunStatus`: `queued`, `running`, `retrying`, `blocked`, `completed`, `completed_with_errors`, `failed`, `cancelled`
- `PipelineRunSummary`: Normalized frontend display type
- `mapBatchJobStatusToRunStatus()`, `mapScrapeJobStatusToRunStatus()` — map DB statuses to normalized ones

### 2.6 Related Tables (from migrations)

- `batch_jobs` — tracks consolidation batches
- `batch_job_items` — per-SKU work items
- `scrape_jobs` — tracks static scraper jobs
- `scrape_job_chunks` — chunk-level scraper tracking
- `cohort_batches` — batch/cohort grouping
- `cohort_members` — product-to-cohort membership
- `official_brand_url_candidates` — discovered URLs for fallback extraction
- `scrape_quality` — quality evaluation results (stored in `products_ingestion.scrape_quality`)

---

## 3. Current Flow: Imported → Finalized

### 3.1 High-Level Flow

```
[Import]                         → External CSV/Integra sync → products_ingestion (pipeline_status='imported')
    │
    ▼
[Static Scraping]                → Admin selects products + scrapers → scrape_jobs created
    │                                Products move to 'scraping' → results stored in sources JSONB
    ▼
[Scrape Quality Gate]            → evaluateScrapeQuality() checks title+brand+url
    ├── Pass:     → 'scraped' (results ready for consolidation)
    └── Fail:     → 'needs_fallback_review'
                       │
                       ▼
[Fallback: SERP URL Discovery]  → Admin approves → 'searching'
    │                                → runOfficialBrandDiscovery() (SERPER API)
    ▼
[Fallback: URL Review]          → 'url_review' → admin picks URLs
    │                                → URLs stored in official_brand_url_candidates
    ▼
[Fallback: Direct URL Extract]  → 'extracting' → direct_url_extraction scraper job
    │                                → runner extracts product page → stored in sources
    ▼
                              → back to 'scraped'
    │
    ▼
[AI Consolidation]              → Admin selects scraped products → submitBatch()
    │                                → DeepSeek processes each SKU → results in consolidated JSONB
    ▼
[Finalization Review]           → 'finalizing' → admin reviews/corrects data in FinalizingResultsView
    │                                → draft stored and editable
    ▼
[Publishing/Export]             → 'exporting' → publishToStorefront()
    │                                → creates row in products table (storefront)
    ▼
[Downstream Export]             → ShopSite sync, ZIP download, XML feed
```

### 3.2 Key Entry Points

| Step | File | Function/Route |
|------|------|---------------|
| Import (CSV) | `lib/admin/integra-sync.ts` | `addToOnboarding()` |
| Scrape | `app/api/admin/pipeline/scrape/route.ts` | POST → `scrapeProducts()` |
| Scrape quality | `lib/pipeline/scrape-quality.ts` | `evaluateScrapeQuality()` |
| Fallback approval | `lib/pipeline/fallback-orchestration.ts` | `approveFallbackForSkus()` |
| SERP discovery | `lib/official-brand-discovery/` | `runOfficialBrandDiscovery()` |
| URL review | `components/admin/pipeline/UrlReviewWorkspace.tsx` | Admin workspace |
| Direct URL extract | `lib/pipeline/fallback-orchestration.ts` | `queueFallbackExtractionJob()` |
| Consolidate | `app/api/admin/consolidation/submit/route.ts` | POST → `submitBatch()` |
| Apply results | `lib/consolidation/batch-service.ts` | `applyConsolidationResults()` |
| Finalize review | `components/admin/pipeline/FinalizingResultsView.tsx` | Admin workspace |
| Publish | `lib/pipeline/publish.ts` | `publishToStorefront()` |
| Bulk transitions | `app/api/admin/pipeline/bulk/route.ts` | POST → `bulkUpdateStatus()` |

### 3.3 The AI Consolidation Process (Detail)

**Files involved:**
- `lib/consolidation/batch-service.ts` (2330 lines) — orchestrates everything
- `lib/consolidation/direct-chat-service.ts` — DeepSeek execution engine
- `lib/consolidation/prompt-builder.ts` — builds prompts with source evidence
- `lib/consolidation/taxonomy-validator.ts` — validates categories, builds JSON response format
- `lib/consolidation/result-parsing.ts` — parses LLM JSON responses
- `lib/consolidation/result-normalizer.ts` — normalizes output
- `lib/consolidation/detail-enrichment.ts` — deterministic post-consolidation field extraction
- `lib/consolidation/two-phase-service.ts` — sibling consistency validation

**Input:** Products with source data (`ProductSource[]`)  
**Output:** `ConsolidationResult[]` → written to `products_ingestion.consolidated`

The consolidation flow:
1. **Build prompt** — `buildPromptContext()` loads categories → generates system prompt with output contract
2. **Filter sources** — `filterSourceData()` extracts only relevant fields from up to 4 most trusted sources
3. **Submit to DeepSeek** — `submitBatch()` → `createDirectChatBatch()` inserts `batch_jobs` + `batch_job_items` rows
4. **Process items** — `processBatchQueue()` processes items one-by-one via DeepSeek chat completions
5. **Parse results** — `parseStructuredConsolidationText()` extracts structured JSON from LLM response
6. **Apply results** — `applyConsolidationResults()` merges into `products_ingestion.consolidated` with brand resolution, image handling, and detail enrichment

### 3.4 The Scrape Quality Gate (to be removed)

**File:** `apps/web/lib/pipeline/scrape-quality.ts`

`evaluateScrapeQuality()` checks each static scrape source for:
- Matched SKU/identifier (2 pts)
- Title/name (1 pt)
- Brand/manufacturer (1 pt)
- Source URL (1 pt)

Pass requires: matched identifier + title + (brand OR url). If no source meets this → `needs_fallback_review`.

### 3.5 The Fallback Orchestration (to be removed)

**File:** `apps/web/lib/pipeline/fallback-orchestration.ts`

Two main functions:
- `approveFallbackForSkus()` — transitions from `needs_fallback_review` → `searching`, triggers `runOfficialBrandDiscovery()` (SERPER API)
- `queueFallbackExtractionJob()` — creates `direct_url_extraction` scrape job for selected URLs

This entire module exists only because static scraping can fail.

---

## 4. AI Consolidation Logic (Deep Dive)

### 4.1 Batch Service (`batch-service.ts`)

Key exported functions:
| Function | Purpose |
|----------|---------|
| `submitBatch(products, metadata)` | Submit to DeepSeek, create batch tracking |
| `getBatchStatus(batchId)` | Poll batch progress (read-only DB) |
| `processBatchQueue(batchId)` | Process pending items via DeepSeek |
| `retrieveResults(batchId)` | Get all completed results |
| `applyResults(batchId)` | Apply results to DB |
| `listBatchJobs(filters)` | List historical batches |
| `cancelBatch(batchId)` | Cancel active batch |

### 4.2 Prompt Building (`prompt-builder.ts`)

Sources are filtered and ranked by trust level:
- **canonical**: `shopsite_input` (0)
- **trusted**: brand domains, distributors (1)
- **standard**: generic scrapers (2)
- **marketplace**: amazon, ebay, walmart (3)

Only the top 4 sources by trust are sent. Each source gets filtered to relevant fields only (title, brand, weight, size, description, category, etc.).

### 4.3 Apply Results (`applyConsolidationResults()`)

**File:** `lib/consolidation/batch-service.ts` (line 1514+)

This is a complex function (~600 lines) that:
1. Loads existing products from DB
2. Resolves brands (fuzzy matching, auto-creates if missing)
3. Handles image deduplication and storage
4. Runs `enrichProductDetails()` for deterministic field extraction
5. Merges new results with existing consolidated data
6. Preserves field values when confidence is low
7. Writes to `products_ingestion.consolidated`

### 4.4 Two-Phase Consistency Pass

**File:** `lib/consolidation/two-phase-service.ts`

Optional second phase checks sibling products from the same product line for consistency in brand, category, etc. Flags mismatches for admin review.

### 4.5 Output Contract

The LLM produces JSON with:
```json
{
  "name": "string (required)",
  "brand": "string (required)",
  "weight": "string (required)",
  "confidence_score": "number 0.0-1.0 (required)",
  "category": "string (required)",
  "description": "string (required)",
  "search_keywords": "string (required)"
}
```

These fields are then expanded by `detail-enrichment.ts` into pet_type, life_stage, flavor, color, size, etc.

---

## 5. Tests and Constraints Affected by Removing Static Scrapers

### 5.1 Pipeline Tests

| Test File | What It Tests | Impact |
|-----------|---------------|--------|
| `lib/pipeline/core.test.ts` | Status transition validation | Must update `STATUS_TRANSITIONS` — remove searching, url_review, extracting, needs_fallback_review edges |
| `lib/pipeline/types.test.ts` | Status helper functions | `PERSISTED_PIPELINE_STATUSES` and `PIPELINE_TABS` will change |
| `lib/pipeline/derivation.test.ts` | Tab derivation & active job queries | Will need updates for new tab set |
| `lib/pipeline/queries.test.ts` | Tab query functions | Tab queries change |
| `lib/pipeline.test.ts` (at `__tests__/`) | Main pipeline helpers | Tests for `getProductsByStage`, `getStatusCounts`, `bulkUpdateStatus`, `getSkusByStage` |
| `__tests__/lib/pipeline-scraping.test.ts` | Scrape job creation | Significant — scraping flow changes completely |
| `__tests__/lib/pipeline-scrape-quality.test.ts` | Quality evaluation gate | Can be removed entirely |
| `__tests__/lib/pipeline-transition.test.ts` | Transition validation | Must update for new state machine |
| `__tests__/lib/pipeline-status-validation.test.ts` | Status validation | Needs updates |

### 5.2 Consolidation Tests

| Test File | What It Tests | Impact |
|-----------|---------------|--------|
| `lib/consolidation/__tests__/` | Unit tests for prompt, taxonomy, enrichment | Minimal — consolidation logic unchanged |
| `__tests__/lib/consolidation/batch-service.test.ts` | Batch service | Minimal — same flow |
| `__tests__/lib/consolidation/two-phase-service.test.ts` | Two-phase consistency | Unchanged |
| `__tests__/lib/consolidation/taxonomy-validator.test.ts` | Taxonomy validation | Unchanged |

### 5.3 API Route Tests

| Test File | What It Tests | Impact |
|-----------|---------------|--------|
| `__tests__/app/api/admin/pipeline/route.test.ts` | Main pipeline API | Will need updates for new status set |
| `__tests__/app/api/admin/pipeline/scrape-route.test.ts` | Scrape API | Can be removed or rewritten |
| `__tests__/app/api/admin/pipeline/publish-route.test.ts` | Publish API | Unchanged |
| `__tests__/api/admin/pipeline/active-runs.test.ts` | Active runs | Will change when scraping is removed |
| `__tests__/api/admin/pipeline/active-consolidations.test.ts` | Active consolidations | Unchanged |

### 5.4 Constraints

1. **Database enum constraint**: `pipeline_status_five` enum must be updated (ALTER TYPE ... ADD VALUE / DROP VALUE not possible in PG — requires creating new enum and migrating)
2. **Status check constraint**: `products_ingestion_pipeline_status_check` on the table must be updated
3. **Transition validation**: `STATUS_TRANSITIONS` map in `core.ts` must be rebuilt
4. **UI tab rendering**: `PIPELINE_TABS` and `StageTabs.tsx` must be updated
5. **State management**: `PipelineClient.tsx` and all view components reference current stages

---

## 6. Files Likely to Need Changes

### 6.1 Pipeline Status Definitions (High Impact)

| File | Change |
|------|--------|
| `apps/web/lib/pipeline/types.ts` | Remove `searching`, `url_review`, `extracting`, `needs_fallback_review` from `PERSISTED_PIPELINE_STATUSES`; update `PIPELINE_TABS`; update `STAGE_CONFIG`; add new `extracting`/`results` tab config; update `STATUS_TRANSITIONS` |
| `apps/web/lib/pipeline/core.ts` | Rewrite `STATUS_TRANSITIONS` for new state machine |
| `apps/web/lib/pipeline/derivation.ts` | Update `WORKFLOW_PIPELINE_TABS`, `deriveTabFromProduct()` |
| `apps/web/lib/pipeline/run-types.ts` | Remove `serp_search` from `PipelineRunKind` |

### 6.2 Pipeline Logic (Medium Impact)

| File | Change |
|------|--------|
| `apps/web/lib/pipeline.ts` | Update `PIPELINE_STAGE_QUERY_SOURCE`, `getStatusCounts()` initialization, `bulkUpdateStatus()` reset logic |
| `apps/web/lib/pipeline/scrape-quality.ts` | **Remove entirely** — no longer needed |
| `apps/web/lib/pipeline/fallback-orchestration.ts` | **Remove entirely** — no longer needed |
| `apps/web/lib/pipeline/scraper-recommendations.ts` | May need updates |
| `apps/web/lib/pipeline/publish.ts` | Unchanged (publish logic stays) |

### 6.3 UI Components (High Impact)

| File | Change |
|------|--------|
| `apps/web/components/admin/pipeline/StageTabs.tsx` | Update tab rendering for new tabs |
| `apps/web/components/admin/pipeline/PipelineClient.tsx` | Update tab routing, action handlers, stage-specific views |
| `apps/web/components/admin/pipeline/ImportedResultsView.tsx` | May also serve as new "URL Review" view |
| `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` | Rename/repurpose for new "Results" tab |
| `apps/web/components/admin/pipeline/FallbackReviewView.tsx` | **Remove entirely** |
| `apps/web/components/admin/pipeline/UrlReviewWorkspace.tsx` | **Move to top-level tab** (stable integration for maintaining URL review before AI extraction) |
| `apps/web/components/admin/pipeline/SearchingTab.tsx` | **Remove entirely** |
| `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` | May keep for extraction runs; remove static scraper references |
| `apps/web/app/admin/pipeline/page.tsx` | Update page for new tabs |

### 6.4 API Routes (Medium Impact)

| File | Change |
|------|--------|
| `apps/web/app/api/admin/pipeline/route.ts` | Update status validation |
| `apps/web/app/api/admin/pipeline/bulk/route.ts` | Remove `published` check; update status list |
| `apps/web/app/api/admin/pipeline/scrape/route.ts` | **Remove or rewrite** for AI extraction triggering |
| `apps/web/app/api/admin/pipeline/transition/route.ts` | Update status validation |
| `apps/web/app/api/admin/pipeline/clear-scrape-results/route.ts` | May simplify |
| `apps/web/app/api/admin/pipeline/fallback/route.ts` | **Remove entirely** |
| `apps/web/app/api/admin/pipeline/official-brand/` | **Remove entire directory** |
| `apps/web/app/api/admin/pipeline/scrapers/route.ts` | May keep for reference but simplify |
| `apps/web/app/api/admin/consolidation/submit/route.ts` | Mostly unchanged |

### 6.5 Database Migrations

| File | Change |
|------|--------|
| Create new migration to update `pipeline_status_five` enum | Remove `searching`, `url_review`, `extracting`, `needs_fallback_review`; add new statuses if needed |
| Drop `scrape_quality`, `fallback_metadata` columns | Optional cleanup |
| Drop `official_brand_url_candidates` table | Optional cleanup |

### 6.6 Consolidation Module (Minimal Impact)

| File | Change |
|------|--------|
| `apps/web/lib/consolidation/batch-service.ts` | May remove source trust level logic for "canonical" (shopsite_input) — AI-only means all sources are scraped |
| `apps/web/lib/consolidation/prompt-builder.ts` | May simplify source ranking (no static vs fallback distinction) |

### 6.7 Tests (High Impact)

| File | Change |
|------|--------|
| `lib/pipeline/core.test.ts` | Update expected `STATUS_TRANSITIONS` |
| `lib/pipeline/types.test.ts` | Update for new `PERSISTED_PIPELINE_STATUSES` |
| `lib/pipeline/derivation.test.ts` | Update expected tabs and active job queries |
| `lib/pipeline/queries.test.ts` | Update for new tabs |
| All `__tests__/lib/pipeline-*.test.ts` files | Update transition/status tests |
| `__tests__/lib/pipeline-scrape-quality.test.ts` | **Remove** |
| `__tests__/lib/pipeline-scraping.test.ts` | **Remove or rewrite** |
| `__tests__/lib/pipeline.test.ts` | Update for new status set |
| `__tests__/app/api/admin/pipeline/route.test.ts` | Update for new status list |
| `__tests__/app/api/admin/pipeline/scrape-route.test.ts` | **Remove or rewrite** |
| `__tests__/api/admin/pipeline/active-runs.test.ts` | Update |
| `__tests__/api/admin/pipeline/export-route.test.ts` | Unchanged |

---

## 7. Architecture Summary

### Current Architecture

```
Imported → [Static Scrape Job] → Scraping → [Quality Gate] ──Pass──→ Scraped → [AI Consolidation] → Consolidating → [Review] → Finalizing → [Publish] → Exporting → Done
                                              └──Fail──→ needs_fallback_review → [Admin Approve] → Searching → [SERP Discovery] → url_review → [Pick URLs] → Extracting → [Direct Extract] → Scraped
```

**Bloat to cut:**
- Static scraping (Playwright/crawl4ai runner jobs)
- Scrape quality evaluation gate
- SERP URL discovery (Serper API)
- URL review workspace (repurpose, don't remove — it's in the target tabs)
- Direct URL extraction jobs
- Fallback orchestration module
- 4 internal statuses: `searching`, `url_review`, `extracting`, `needs_fallback_review`
- `scrape_quality` and `fallback_metadata` columns
- `scraping` tab (replaced by generalized "Extracting")
- `official_brand_url_candidates` table

### Target Architecture

```
Imported → [URL Review] → Extracting → [AI Extraction] → Results → [AI Consolidation] → Consolidating → [Review] → Finalizing → [Publish] → Exporting → Done
```

**Tabs:** Imported → URL Review → Extracting → Results → Consolidating → Finalizing

**Statuses:** `imported`, `url_review`, `extracting`, `scraped` (→ `results`?), `consolidating`, `finalizing`, `exporting`, `failed`

### Risks & Open Questions

1. **URL Review as primary step**: Currently, URL Review is a fallback workspace. If it becomes a required step, the UX for brand/domain assignment at import time must be robust. AI could auto-suggest URLs from the imported product data.

2. **AI extraction**: The migration assumes an AI-based extraction replaces Playwright/crawl4ai. The current codebase has no AI extraction module — this must be built. What technology (computer vision? direct LLM parsing of HTML? a headless browser with LLM analysis?) is not defined in the current code.

3. **Consolidation source data**: Currently, consolidation depends on `products_ingestion.sources` (populated by scrapers). If AI extraction replaces static scraping, the data format may differ. The consolidation prompt builder assumes scraped data with specific fields.

4. **DeepSeek costs**: Without static scraping as a free/low-cost first pass, every product goes through the paid LLM path immediately. Cost modeling needed.

5. **Parallel runs**: `detail-enrichment.ts` uses source-data pattern matching for deterministic post-consolidation enrichment. This is scraper-agnostic and should work with AI-extracted data too.

6. **Database enum mutation**: PostgreSQL doesn't support removing values from enums. Must use a migration pattern: create new type, ALTER column, drop old type.

7. **Search functionality**: The current `searching` status maps to SERP discovery. The target "Extracting" tab would replace both "Scraping" and the fallback extraction statuses.

8. **Export functionality**: The `exporting` tab routing (`/admin/pipeline/export`) has a separate page. This may become a sub-tab or the last step in the simplified flow.
