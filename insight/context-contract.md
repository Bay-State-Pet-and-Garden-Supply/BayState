# Distributor Extraction: End-to-End Context Contract

## 1. Request & Scope

Map the complete contract from **approved-source job creation** through **runner callback persistence** into `products_ingestion.sources.enriched` and downstream admin/consolidation consumers.

**Focus areas:**
- Backward-compatibility coupling (aliases from normalized → legacy field names)
- Source preservation semantics (merge vs overwrite, provenance tracking)
- Dedup/retry behavior (skip-recent-successful, retry on failure, force refresh)
- Migration risk if `sources.enriched` shape changes

---

## 2. Pipeline Architecture Overview

```
Admin UI (Enrichment Lab)
  │ POST /api/admin/enrichment/jobs  (selectedDistributorSlug, extractionMode, forceRefresh)
  ▼
buildApprovedSourcePlans()           ← coordinator/lib/approved-sources/source-plan.ts
  │ joins: products_ingestion → brands → brand_sources
  │ dedup: checks existing sources.enriched for recent success
  │ outputs: source_plans_by_sku (keyed by SKU, sent as jobConfig)
  ▼
enrichment_jobs + enrichment_attempts (queued)
  │ claim-enrichment route = runner polls, gets source_plan per SKU
  ▼
Runner (Python, approved_sources/executor.py)
  │ executes adapters (Phillips, Orgill, PFX, etc.)
  │ builds EnrichmentResultV1
  ▼
POST /api/scraper/v1/enrichment-callback  ← web route
  │ validates with Zod (safeValidateEnrichmentResultV1)
  │ normalizes into NormalizedEnrichedSourceV1 (normalizeEnrichmentResultForSources)
  │ merges into products_ingestion.sources.enriched
  │ updates pipeline_status (processed | extracting-retry | imported)
  ▼
products_ingestion.sources.enriched  ← THE PERSISTENCE CONTRACT
  │
  ▼
Downstream consumers:
  ├── buildConsolidationSourcesPayload()   → normalizeProductSources()
  ├── prompt-builder.ts (TRUSTED_SOURCE_FRAGMENTS includes 'enriched')
  ├── detail-enrichment.ts (post-consolidation named-entity extraction)
  ├── Admin Enrichment UI → enrichment/config.ts (getProductEnrichmentSummary)
  ├── isSourceRecentlySuccessful() for dedup
  └── Admin Enrichment Lab → product overview
```

---

## 3. Key Code Paths & Files

### 3a. Coordinator-Side: Plan Building (`apps/web/lib/approved-sources/`)

| File | Line Range | Role |
|------|-----------|------|
| `source-plan.ts` | 230–450+ | `buildApprovedSourcePlans()` — queries products, brands, brand_sources; applies domain filtering, dedup, catalog fallback, mode filtering |
| `types.ts` | All | `ApprovedSourcePlan`, `ApprovedSourcePlanEntry`, `ApprovedSourcePolicy` TypeScript types |
| `distributor-catalog.ts` | All | Fixed catalog: Bradley, Central Pet, Orgill, Phillips, Pet Food Experts; alias resolution and fallback plan building |

**Dedup logic** (`source-plan.ts` lines 162–224):
- `isSourceRecentlySuccessful()` checks `sources.enriched` for:
  1. `extracted_at` within 48h
  2. Non-empty `name`/`title`
  3. Non-empty `images`/`image_urls` array
  4. `source_results[]` entry with matching `sourceSlug` and `confidence >= 0.6`
- `forceRefresh: true` skips all dedup checks

**Mode filtering** (lines ~380-407):
- `mixed` (default): all sources (official_brand + distributor)
- `distributor_only`: filters out `official_brand`
- `ai_only`: only `official_brand` entries

### 3b. Enrichment Job Creation (`apps/web/app/api/admin/enrichment/jobs/route.ts`)

| Line | Logic |
|------|-------|
| 104–116 | Calls `buildApprovedSourcePlans()` with extraction options |
| 195–202 | Sets `jobConfig.source_plans_by_sku` and `jobConfig.source_type = "approved_source_extraction"` |
| 250 | Creates `enrichment_attempts` rows (one per SKU) |
| 273 | Transitions products to `pipeline_status = 'extracting'` |

### 3c. Claim Enrichment (`apps/web/app/api/scraper/v1/claim-enrichment/route.ts`)

| Line | Logic |
|------|-------|
| 200–210 | Extracts `sourcePlansBySku` from `jobConfig`, resolves per-SKU plan |
| 207 | Sentinel URL `"approved_source_extraction"` sent when source plan exists (instead of a real URL) |
| 215–220 | Each claimed attempt includes `source_plan` (the per-SKU `ApprovedSourcePlan`) and `ai_credentials` |

### 3d. Runner-Side (Python: `apps/scraper/scrapers/approved_sources/`)

| File | Role |
|------|------|
| `types.py` | Python dataclasses mirroring TypeScript `ApprovedSourcePlan`, `ApprovedSourcePlanEntry`, `ApprovedSourcePolicy` |
| `result_builder.py` | Builds `EnrichmentResultV1` for success/partial/failure with decision field, `source_results[]` |
| `executor.py` | Orchestrates adapters against the source plan priority list |
| `adapters/*.py` | Distributor-specific logic (Phillips, Orgill, Pet Food Experts, etc.) |

**Result shape produced by runner** (`EnrichmentResultV1`):
```typescript
{
  schema_version: "v1",
  sku: string,
  source: { url, domain?, source_type?, source_slug?, approved_source_id?, evidence? },
  status: "success" | "partial" | "failed",
  extracted_at: string (ISO),
  mode: "structured" | "metadata" | "llm" | "mixed",
  product: EnrichedProductFactsV1,
  confidence: { overall: number, fields: Record<string, number> },
  validation: { sku_match?, warnings?, missing_required? },
  attempts: EnrichmentAttemptSummaryV1[],
  decision?: "deterministic_success" | "deterministic_partial" | "llm_fallback" | "failed",
  llm_used?: boolean,
  source_results?: SourceResultInfo[]  ← CRITICAL: per-source evidence array
}
```

The `source_results[]` array is what dedup queries. Each entry has `{ sourceSlug, sourceType, confidence, matchedFields?, evidenceUrl? }`.

### 3e. Enrichment Callback (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts`)

| Line | Logic |
|------|-------|
| 82–88 | Validates with Zod `safeValidateEnrichmentResultV1` |
| 91 | Normalizes via `normalizeEnrichmentResultForSources()` |
| 102–117 | Looks up `enrichment_attempts` (by `_attempt_id` or latest by SKU) |
| 139–148 | Updates `enrichment_attempts` row with `normalized_source` |
| 158–180 | **Merges into `products_ingestion`**: sets `sources.enriched = normalized` (overwrite, not merge of sub-fields) |
| 163–165 | **Simple overwrite**: `{ ...currentSources, enriched: normalized }` |
| 167 | `pipeline_status` set based on `determineNextStatus()` |
| 151–155 | Retry logic: creates new `enrichment_attempts` if budget remains (max 3 retries) |

### 3f. Database Function (`merge_enrichment_attempt_result` in baseline SQL, lines 1420–1425)

Older RPC path (not currently used by the callback route — the route does inline merge, but the function exists for direct DB calls):

```sql
v_sources := jsonb_set(
    coalesce(v_sources, '{}'::jsonb),
    '{enriched}',
    p_source_data,
    true  -- create if missing
);
```

This uses `jsonb_set` with `create_if_missing=true`, which is equivalent to the callback route's `{ ...currentSources, enriched: normalized }`.

### 3g. Source Normalization (`apps/web/lib/enrichment/normalize-result.ts`)

Transforms `EnrichmentResultV1` → `NormalizedEnrichedSourceV1`:

```typescript
// Backward-compatible aliases:
title  = product.name    // legacy field name for consolidation
name   = product.name    // direct field name
brand  = product.brand
images = product.image_urls   // duplicated for backward compat
image_urls = product.image_urls
url          = source.url
confidence_score = confidence.overall

// Full depth preserved:
extracted: EnrichedProductFactsV1    // complete product facts
confidence: EnrichmentConfidenceV1    // per-field scores
validation: EnrichmentValidationV1
attempts: EnrichmentAttemptSummaryV1[]
source_results?: SourceResultInfo[]   // required for dedup
```

### 3h. Product Sources Merge (`apps/web/lib/product-sources.ts`)

| Function | Line | Role |
|----------|------|------|
| `normalizeProductSources()` | 324 | Normalizes raw `sources` JSONB object per-source; treats `enriched` source as already normalized (line 340: `isEnrichedSource()`) |
| `mergeProductSources()` | 386 | Merges incoming → existing, preserves `_`-prefixed provenance per source, deduplicates images |
| `buildConsolidationSourcesPayload()` | 594 | Wraps normalized sources + ShopSite input for consolidation prompt; enriched source appears as a top-level key alongside other scraper sources |

---

## 4. Data Flow & Persistence Semantics

### 4a. What gets persisted to `products_ingestion.sources`

**Callback route (current production path):**
```typescript
const updatedSources = {
  ...currentSources,          // preserve all existing non-enriched sources
  enriched: normalized,       // OVERWRITE the entire enriched key
};
```

**`mergeProductSources()` (used for scraper callbacks, not enrichment callbacks):**
- Merges per-source with field-level normalization
- Preserves `_provenance` metadata per source
- Deduplicates images across sources
- Field aliasing: `SOURCE_FIELD_ALIASES` map (line 40+)

**`enriched` key is treated differently by `normalizeProductSources()`:**
- `isEnrichedSource()` returns `true` for key === `'enriched'`
- **Enriched sources bypass normalization** — they are cast to `CanonicalProductSourceRecord` as-is without field aliasing (line 340)
- This preserves the `NormalizedEnrichedSourceV1` shape untouched

### 4b. Image durability (`makeIncomingSourcesDurable`)

Images with `data:` URIs are replaced with durable storage URLs before persistence. This runs for scraper callbacks; enrichment callbacks skip this step (the image URLs are already external from the distributor site).

### 4c. Pipeline Status Transitions

```
imported → enriched/extracting → processed → consolidating → finalized
                       ↑ retry ↓
                    imported (after max retries)
```

Callback `determineNextStatus()`:
- `success` + confidence >= 0.7 → `processed`
- `partial` + confidence >= 0.6 → `processed`
- `partial` + confidence < 0.6 → `extracting` (retry) if retries < 3, else `imported`
- `failed` → `extracting` (retry) if retries < 3, else `imported`

---

## 5. Downstream Consumers of `sources.enriched`

### 5a. Dedup Check in Source Plan Building

`source-plan.ts` `isSourceRecentlySuccessful()` reads `sources.enriched` and checks:
- `extracted_at` (within 48h)
- `name`/`title` (non-empty)
- `images`/`image_urls` (non-empty array)
- `source_results[]` (matching slug + confidence >= 0.6)

### 5b. Consolidation Prompt Builder

`prompt-builder.ts`:

```typescript
const TRUSTED_SOURCE_FRAGMENTS = [
    'shopsite_input',
    'enriched',
    'bradley',
    'central-pet',
    ...
];
```

The `'enriched'` fragment gives `sources.enriched` rank 1 trust (second only to `shopsite_input`). The prompt builder feeds all normalized sources to the LLM; the `enriched` source fields (especially aliased `title`, `name`, `brand`, `images`) are visible to the LLM alongside other scraper sources.

The aliased fields are critical here — the prompt builder, via `consolidation/types.ts` and `product-sources.ts`, references `title`/`name`/`images`/`brand` at the top level of each source record. Removing or renaming these aliases would break prompt context injection.

### 5c. Detail Enrichment (Post-Consolidation)

`detail-enrichment.ts` reads raw sources (including `enriched`) and performs deterministic pattern extraction for fields like pet type, life stage, food form, etc. It reads from the normalized source objects, using `normalizeProductSources()` which preserves `enriched` as-is.

### 5d. Admin Enrichment UI

`enrichment/config.ts` `getProductEnrichmentSummary()` reads `sources` from `products_ingestion` and converts to `SourceEnrichmentData`. It calls `extractEnrichableFields()` which reads from `rawData[field]` for each `ENRICHABLE_FIELDS` entry.

`enrichment/sources.ts` defines static source registry including `'phillips'`, `'bradley'`, `'central-pet'`, `'orgill'`, `'petfoodex'` as scraper sources. The admin UI uses this to let users toggle sources per-product.

### 5e. Image Extraction

`product-sources.ts` `extractImageCandidatesFromSources()` and `selectProductImageUrls()` walk all sources (including `enriched`) to collect image candidates. They key off `'images'`, `'image_urls'`, and image-like field names. The aliased `images` field (backed by `product.image_urls`) is the primary source of images for downstream rendering.

---

## 6. Backward Compatibility Coupling

### 6a. Aliases in `NormalizedEnrichedSourceV1`

| DB Field | Legacy Alias | Consumed By |
|----------|-------------|-------------|
| `product.name` | `title`, `name` | Prompt builder, detail enrichment, admin UI |
| `product.image_urls` | `images`, `image_urls` | Image extraction, prompt builder, dedup check |
| `product.brand` | `brand` | Prompt builder, admin UI |
| `product.description` | `description` | Prompt builder |
| `product.category` | `category` | Prompt builder, detail enrichment |
| `product.weight` | `weight` | Prompt builder, detail enrichment |
| `source.url` | `url` | Dedup check, admin UI |
| `confidence.overall` | `confidence_score` | Prompt builder, admin UI, dedup check |

**Risk**: Removing any alias will break the corresponding consumer. The `title`/`name` pair is especially critical — both `prompt-builder.ts` and `source-plan.ts` read `enriched.name ?? enriched.title` with `??` fallback, meaning either must exist.

### 6b. `source_results[]` Dependency

The dedup check in `source-plan.ts` (line 204) does:
```typescript
const sourceResults: unknown = enriched.source_results;
if (!Array.isArray(sourceResults)) return false;
```

Without `source_results[]`, every source will be re-scraped on every job. This is the sole mechanism for per-source freshness tracking.

### 6c. `extracted_at` Dependency

Dedup also requires `enriched.extracted_at` (ISO string, within 48h). Without it, dedup returns `false` and all sources are re-scraped.

---

## 7. Dedup & Retry Behavior

### 7a. Source-Level Dedup (Plan Build Time)

- Condition: `!forceRefresh && existingSourcesBySku` map available
- Check: `isSourceRecentlySuccessful(sku, sourceSlug, existingSourcesBySku)`
- Scope: PER SOURCE per SKU — each `brand_sources` entry is checked independently
- Result: matched sources are filtered OUT of `orderedEntries[]`
- Logged: `[SourcePlan] SKU X: skipped N recently successful source(s): ...`

### 7b. Attempt Retry (Callback Time)

- Budget: max 3 retries (from `retry_count` on `enrichment_attempts`)
- Decision: based on `status` + `confidence.overall`
- Flow: creates new `enrichment_attempts` row with `attempt_number` incremented
- Pipeline status during retry: `extracting` (not `imported`)
- After max retries: status drops to `imported` (manual re-trigger needed)

### 7c. `forceRefresh` Flag

Passed through request → `buildApprovedSourcePlans()` → skips loading `existingSourcesBySku` entirely → no dedup → all sources included in plan.

### 7d. Idempotency Notes

- **Callback is NOT idempotent per-call** — each callback overwrites `sources.enriched` entirely
- No dedup-by-attempt: if two runners submit callbacks for the same SKU, the last one wins
- The `merge_enrichment_attempt_result` RPC uses `jsonb_set` with `create_if_missing=true` also

---

## 8. Risks & Migration Considerations

### 8a. Shape Change Risk: `sources.enriched`

Changing the shape of `NormalizedEnrichedSourceV1` breaks:

1. **Dedup checks** in `isSourceRecentlySuccessful()` (reads `extracted_at`, `name`/`title`, `images`/`image_urls`, `source_results`)
2. **Prompt builder** (reads `title`, `name`, `brand`, `images` aliases)
3. **Image extraction** (reads `images`, `image_urls`)
4. **Admin enrichment UI** (reads all `ENRICHABLE_FIELDS` from raw data)
5. **Detail enrichment** (normalized sources)
6. **All existing `sources.enriched` records in the database** — migration would need to backfill

**Migration strategy if shape changes**:
- Keep all backward-compatible aliases (additive only)
- Add a `schema_version` field (currently `"v1"`) and version-check in consumers
- Dual-write during transition period
- Consider a materialized/read-only field for the new shape alongside old aliases

### 8b. Overwrite vs Merge Semantics

Current enrichment callback does a **full overwrite** of `sources.enriched`:
```typescript
updatedSources = { ...currentSources, enriched: normalized };
```

This means:
- If a second enrichment job completes for the same SKU, it replaces ALL prior enriched data
- If you want multi-source accumulation within `enriched` itself, the merge logic needs to change
- Currently, the `source_results[]` array captures multi-source data within a single `enriched` object

### 8c. Enriched Source Bypasses Normalization

`normalizeProductSources()` treats `enriched` as a special key and doesn't apply field aliasing or normalization. This means:
- The exact `NormalizedEnrichedSourceV1` shape persists unchanged
- But consumers must handle the `NormalizedEnrichedSourceV1` shape directly (not through the normal field-alias pipeline)
- Adding new fields to `EnrichedProductFactsV1` is safe (additive); removing fields risks breaking consumers that reference them directly

### 8d. Cross-Process Race Conditions

No advisory locks, no optimistic concurrency control on the `sources` JSONB update:
- Two concurrent callbacks for the same SKU could race
- Last-writer-wins semantics on `sources.enriched`
- The RPC function uses `SELECT ... FOR UPDATE` on `products_ingestion`, but the callback route does its merge application-side without locking

### 8e. Runner Callback Authentication

The callback route authenticates via `validateActiveRunner()` (X-API-Key against `scraper_runners` + `runner_api_keys`). Test runs persist but skip `products_ingestion` update (line 153: `isTestJob` check).

### 8f. Catalog Fallback Coupling

`distributor-catalog.ts` defines fixed entries for 5 distributors. If a brand_sources entry matches one of these, it's used for plan building. The catalog acts as both a fallback (when no brand_sources entry exists) and an alias resolver. Adding a new distributor requires:
1. Adding to `FIXED_DISTRIBUTOR_CATALOG`
2. Adding adapter in `apps/scraper/scrapers/approved_sources/adapters/`
3. Adding source registry entry in `apps/web/lib/enrichment/sources.ts`
4. (Optionally) Adding seed data via migration

---

## 9. Key Dependencies & Constraints

| Dependency | Relationship |
|-----------|-------------|
| `brand_sources` table | Must have enabled entries for the brand, or catalog fallback kicks in |
| `brands` table | Product must have `brand_id` set for source plan building |
| `scraper_credentials` table | Required for `requiresAuth: true` sources (Phillips, Orgill, PFX) |
| `enrichment_attempts` table | Tracks retries; budget enforced client-side in callback route |
| `ai_provider_configs` + `config_id` | Links jobs to AI runtime credentials for LLM fallback |
| `products_ingestion.sources` JSONB | Root container; `enriched` is one key among many (amazon, walmart, etc.) |
| Zod validation in callback | Rejects malformed `EnrichmentResultV1` before persistence |
| 48h dedup window | Hardcoded in `isSourceRecentlySuccessful()` |
| 0.6 confidence threshold | Hardcoded for dedup and partial-acceptance |
| Max 3 retry attempts | Hardcoded in `determineNextStatus()` |
| Max 500 SKUs per job | Enforced in `POST /api/admin/enrichment/jobs` |

---

## 10. Test Coverage

| Test File | What it Covers |
|-----------|---------------|
| `__tests__/lib/approved-sources/source-plan-dedup.test.ts` | Dedup logic: recent success, stale data, missing fields, forceRefresh, confidence thresholds |
| `__tests__/lib/approved-sources/source-plan-modes.test.ts` | Extraction modes: mixed, distributor_only, ai_only; empty guard |
| `__tests__/app/api/admin/enrichment/jobs-route.test.ts` | Job creation: auth, source plans, credentials check, error cases |
| `__tests__/lib/product-sources.test.ts` | `buildConsolidationSourcesPayload`, normalization |
| `__tests__/lib/consolidation/image-prep.test.ts` | Image extraction from sources including enriched key |
| `apps/scraper/tests/unit/test_enrichment_submission.py` | Runner submission flow: attempt_id resolution, missing attempt_id |

---

## 11. Meta-Prompt for Planning

### Goal
Implement a change to the distributor extraction pipeline that is backward-compatible with existing `sources.enriched` data and all downstream consumers.

### Evidence & Constraints (from above)
1. `sources.enriched` is **overwrite-on-callback**, not merged per-field
2. Backward-compatible aliases (`title`, `name`, `images`, `image_urls`, `confidence_score`) must be preserved; removing any breaks consumers in `prompt-builder.ts`, `source-plan.ts`, and `detail-enrichment.ts`
3. `source_results[]` array is the sole dedup granularity mechanism — without it, all sources re-scrape
4. `extracted_at` within 48h is required for dedup to work
5. Enriched source bypasses `normalizeSourcePayload()` — it's cast as-is
6. The callback overwrites `sources.enriched` entirely per-attempt; this is last-writer-wins
7. Three downstream consumers read `sources.enriched` directly:
   - **Dedup** in `source-plan.ts:isSourceRecentlySuccessful()`
   - **Consolidation** via `buildConsolidationSourcesPayload()` → `prompt-builder.ts`
   - **Admin UI** via `getProductEnrichmentSummary()`
8. Runner produces `EnrichmentResultV1` with `decision` and `source_results[]` — expected by Zod validation

### Success Criteria
- [ ] All existing `sources.enriched` records remain readable by downstream consumers
- [ ] Dedup continues to work with existing DB data (doesn't require re-scrape)
- [ ] Consolidation prompt still sees `title`/`name`/`images`/`brand` aliases
- [ ] All unit tests pass (web + scraper)
- [ ] No migration needed for existing DB rows (or migration is explicitly planned)

### Hard Constraints
- Do not change the shape of `EnrichmentResultV1` without coordinating with the Python runner (`enrichment_models.py`)
- Do not remove backward-compatible aliases before adding version detection in consumers
- The `enriched` key must remain as a top-level key in `products_ingestion.sources`

### Validation Plan
1. Verify tests pass: `bun run web test -- --testPathPatterns="approved-sources"` and `bun run web test -- --testPathPatterns="enrichment"`
2. Verify scraper tests pass: `cd apps/scraper && python -m pytest tests/ -m "not live and not benchmark" --ignore=tests/benchmarks`
3. Verify dedup with existing data: run a source plan build without `forceRefresh` and confirm recently-enriched sources are skipped
4. Verify consolidation path: build consolidation payload and confirm `sources.enriched` is visible to the LLM

### Stop/Escalation Rules
- If any consumer references a field without `??` fallback and that field is being removed → escalate for backward-compat decision
- If changing `sources.enriched` shape requires a DB migration that touches >10K existing rows → escalate for migration strategy
- If confidence thresholds or retry budgets change → escalate for product decision
