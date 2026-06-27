# Current Behavior: Distributor-Approved Sources Missing Target UPC

**Date**: 2026-06-23  
**Scope**: Coordinator plan building (web) → Runner execution (scraper) → Callback persistence  
**Audience**: Engineers planning a better UPC-not-found fallback  

---

## 1. Overview

When a UPC is submitted for enrichment, the system builds a per-UPC "source plan" of approved distributors + an optional SERP discovery fallback. The runner executes these in cascade order. The current flow handles "UPC not found at distributor" as a clean `not_stocked` outcome, which does NOT trigger SERP Discovery — only `source_error` (auth failed, network error, or adapter exception) blocks SERP. This document maps every step with file/line references.

---

## 2. Plan Building Phase (Coordinator)

### 2.1 Entry Point

**File**: `apps/web/lib/approved-sources/source-plan.ts`  
**Function**: `buildApprovedSourcePlans(db, upcs, options?)` (line ~93)

Preconditions:
1. Product must exist in `products_ingestion` with a `brand_id` (no brand → `"missing_brand"` failure, line ~123)
2. Brand must exist with `source_cascade_configured_at` set (line ~156 via `isCascadeConfigured`)
3. Brand must have at least one enabled `distributor` source in `brand_sources` (checked in `isCascadeConfigured`)

### 2.2 Source Selection & Prioritization

**File**: `apps/web/lib/approved-sources/source-plan.ts`, lines 173–260

- Sources loaded from `brand_sources` where `enabled=true`, ordered by `priority ASC`
- If `retryMode === "failed_or_untried"`, only sources with latest outcome `source_error` or never-attempted are included (via `getUntriedAndErroredSources` in `source-cascade.ts`, line ~342)
- Distributor entries and `official_brand` entries are separated:
  - **Distributor entries** (source_type `"distributor"`) → go into `distributorEntries[]`
  - **Official brand entries** (source_type `"official_brand"`) → go into `entries[]`, **only if `serpDiscoveryEnabled` is true** (line ~216)
- If no explicit `official_brand` entry exists but the brand has `official_domains`, a synthetic fallback entry is created with `priority: 1000` and `adapterSlug: "crawl4ai_direct"` (resolves to `serp_discovery` in the adapter registry), and appended to `distributorEntries` (lines ~225-255)
- Final order: sorted distributor entries first, then sorted official brand entries last

### 2.3 Options Controlling SERP Discovery

**File**: `apps/web/lib/approved-sources/source-plan.ts`, lines 72-85

```typescript
export interface BuildSourcePlanOptions {
  retryMode?: "all" | "failed_or_untried";
  serpDiscoveryEnabled?: boolean; // Default: true
}
```

When `serpDiscoveryEnabled` is `false`:
- Official brand entries are excluded entirely (line ~216)
- No synthetic fallback entry is created (line ~225-255)

### 2.4 Failure Codes (No Plan Built)

From `apps/web/lib/approved-sources/types.ts` (line ~48):
```
"product_not_found" | "missing_brand" | "no_sources_configured" 
| "ai_only_no_official_domains" | "database_error" | "source_cascade_not_configured"
```

---

## 3. Runner Execution Phase

### 3.1 Executor Entry

**File**: `apps/scraper/scrapers/approved_sources/executor.py`  
**Class**: `ApprovedSourceExecutor`  
**Method**: `execute()` (line ~59)

Flow: `ApprovedSourceOrchestrator.run()` (orchestrator.py, line ~41) → delegates to `executor.execute()`.

### 3.2 Cascade Execution Logic (The Critical Part)

**File**: `apps/scraper/scrapers/approved_sources/executor.py`  
**Method**: `_try_source_entries()` (line ~92)

**Phase 1** (lines 105–125): Execute ALL distributor entries in priority order. Each runs via `_execute_single_entry()`.

**Phase 2** (lines 128–134): Classify distributor outcomes:
```python
distributor_outcomes_with_slugs = self._collect_source_outcomes_with_slugs(all_results)
has_found = any(o == "found" for o, _ in distributor_outcomes_with_slugs)
# Amazon is prone to bot blocks; treat its source_error as non-blocking
has_source_error = any(
    o == "source_error" and slug != "amazon"
    for o, slug in distributor_outcomes_with_slugs
)
```

**Phase 3** (lines 137–165): Conditionally run non-distributor (SERP/official brand) entries:
```python
run_serp = (
    not serp_policy_disabled
    and (
        (not has_source_error and not has_found and len(distributor_entries) > 0)
        or len(distributor_entries) == 0
    )
)
```

**THE KEY INSIGHT**: SERP Discovery runs **only** when:
1. All distributors returned `not_stocked` (clean no-match, no errors, no found)
2. OR there are zero distributor entries in the plan
3. AND `serp_fallback_policy` is not `"disabled"` in `job_config`

**SERP IS SKIPPED when**:
- ✅ Any distributor returned `found` (product already found, no need for SERP)
- ❌ Any distributor returned `source_error` (auth failed, network error, adapter crash) — **EXCEPT Amazon**, whose `source_error` is treated as non-blocking
- ❌ `serp_fallback_policy: "disabled"` is set in job config

### 3.3 Single Entry Execution

**File**: `apps/scraper/scrapers/approved_sources/executor.py`  
**Method**: `_execute_single_entry()` (line ~168)

Flow:
1. Policy check (`_entry_policy_allowed`) → blocked → `build_policy_blocked_result` (outcome: `"source_error"`)
2. Adapter lookup via registry → not found → `build_failed_result` (outcome: `"source_error"`)
3. Adapter `extract()` call → exception → `build_failed_result` (outcome: `"source_error"`)
4. Adapter returns `None` → `build_failed_result` (outcome: `"source_error"`)

### 3.4 Outcome Inference (Executor-Level Normalization)

**File**: `apps/scraper/scrapers/approved_sources/executor.py`  
**Methods**: `_collect_source_outcomes()` (line ~225) and `_collect_source_outcomes_with_slugs()` (line ~250)

When a `SourceResultInfo` doesn't have an explicit `outcome` set, the executor infers it:
- `result.status in ("success", "partial")` → `"found"`
- `result.status == "failed"` with "No match" warning → `"not_stocked"`
- `result.status == "failed"` without "No match" → `"source_error"`

### 3.5 Distributor Adapter Flow (What Happens When UPC Is Not Found)

**File**: `apps/scraper/scrapers/approved_sources/adapters/base.py`  
**Class**: `BaseDistributorCrawl4AIAdapter`  
**Method**: `extract()` (line ~330)

Distributor adapters do NOT use `ProductPageExtractor`. Their flow:
1. Build search URL from UPC (e.g., `https://distributor.com/search?q={UPC}`)
2. Fetch HTML via `httpx` (static) or Crawl4AI browser (JS-rendered fallback)
3. Parse HTML deterministically with BeautifulSoup via `extract_from_html()`
4. If parsing yields `success=False`: returns `build_no_match_result()` — outcome: `"not_stocked"`
5. If parsing yields `success=True`: returns `build_success_result()` or `build_partial_result()` — outcome: `"found"`
6. On exceptions/empty HTML: returns `build_failed_result()` — outcome: `"source_error"`

**Each distributor adapter has its own `extract_from_html()` with static CSS selectors.** If the search results page doesn't contain the target UPC, the adapter returns `success=False` → `"not_stocked"`.

### 3.6 Individual Distributor Adapters

All in `apps/scraper/scrapers/approved_sources/adapters/`:

| Adapter | File | Auth | Notes |
|---------|------|------|-------|
| Amazon | `amazon.py` | Public | Bot-sensitive; `source_error` is treated as non-blocking by executor |
| Bradley Caldwell | `bradley.py` | Public | UPC search on `bradleycaldwell.com` |
| Central Pet | `central_pet.py` | Public | UPC search on `centralpet.com` |
| Orgill | `orgill.py` | Auth required | Requires login credentials |
| Phillips Pet | `phillips.py` | Auth required | Requires login credentials |
| Pet Food Experts | `pet_food_experts.py` | Auth required | Requires login credentials |

### 3.7 SERP Discovery Adapter (The Current Fallback)

**File**: `apps/scraper/scrapers/approved_sources/adapters/serp_discovery.py` (2340 lines)  
**Class**: `SerpDiscoveryAdapter`

This is the terminal fallback when all distributors are clean `not_stocked`. Flow:

1. **Phase 1: UPC Discovery** (line ~180) — Searches raw UPC via **Serper API** (NOT Crawl4AI)
   - Filters results through domain policy (disallowed domains dropped)
   - Immediate short-circuit: if a result's domain matches the brand's official domain → return that URL immediately

2. **Phase 2: LLM Name Consolidation** (line ~215) — Uses LLM to clean up register abbreviations

3. **Phase 3: Brand Site Search** (line ~260) — Serper API `site:domain <name>` search
   - Deterministic scoring pre-filters candidates
   - **Crawl4AI candidate verification** (line ~470) — Crawls top candidate URLs, runs family variant resolvers (Shopify/WooCommerce/Demandware)
   - LLM selects best URL from verified candidates
   - Falls through to Phase 3b if nothing found

4. **Phase 3b: Open Web Fallback** (line ~305) — Serper API open-web search
   - Same flow: score → verify with Crawl4AI → LLM select

5. **Phase 4: Extraction** — Uses `ProductPageExtractor.extract()` (Crawl4AI + LLM) on the selected URL

**Key Limitations of Current SERP Discovery**:
- Serper API is the ONLY search provider (no fallback if Serper fails)
- LLM URL selection operates on 150-char SERP snippets, not full page content
- If extraction ultimately fails, the entire pipeline returns `"source_error"` for the SERP source
- No content recycling between discovery phases (3-4 Serper queries + 2 LLM calls sunk before extraction starts)
- No unit tests for `SerpDiscoveryAdapter` (untested in isolation)

### 3.8 Adapter Registry Resolution

**File**: `apps/scraper/scrapers/approved_sources/adapters/registry.py`

Important mappings:
- `"crawl4ai_direct"` → `"serp_discovery"` (official_brand source-type entries use this adapter slug)
- `"official_brand"` → `"serp_discovery"`
- `"serp_discovery"` → `"serp_discovery"`
- All distributor slugs map to their specific adapters

So the synthetic fallback entry with `adapterSlug: "crawl4ai_direct"` from the coordinator resolves to `SerpDiscoveryAdapter` at runtime.

---

## 4. Outcome Persistence Phase (Callback)

### 4.1 Callback Entry

**File**: `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`  
**Endpoint**: `POST /api/scraper/v1/enrichment-callback`

Receives the full `EnrichmentResultV1` with `source_results` array.

### 4.2 Source Outcome Normalization

**File**: `apps/web/lib/scraper-callback/enrichment-result.ts`  
**Function**: `normalizeSourceOutcome()` (line ~127)

```typescript
export function normalizeSourceOutcome(outcome: string | null | undefined): NormalizedOutcome {
  if (outcome === null || outcome === undefined) { return "found"; }
  if (outcome.trim() === "") { return "skipped"; }
  // "found" / "not_stocked" / "source_error" / "skipped" → pass through
}
```

**Important**: `null` outcome defaults to `"found"` — a legacy behavior for Amazon/marketplace adapters that don't set explicit outcomes.

### 4.3 Final Status Determination (ADR 0002)

**File**: `apps/web/lib/scraper-callback/enrichment-result.ts`  
**Function**: `determineFinalStatus()` (line ~385)

```typescript
export function determineFinalStatus(outcomes: NormalizedOutcome[]): PersistedPipelineStatus {
  if (outcomes.length === 0) { return "processed"; }
  const hasFound = outcomes.some((o) => o === "found");
  if (hasFound) { return "processed"; }        // Found-wins rule
  const hasError = outcomes.some((o) => o === "source_error");
  if (hasError) { return "needs_attention"; }  // Any error → needs attention
  return "processed";                           // All not_stocked → processed
}
```

### 4.4 Database Schema for Outcomes

**File**: `apps/web/supabase/migrations/20260611120000_automated_source_cascade.sql` (line ~55)

Table: `enrichment_source_attempts`
Outcome column CHECK constraint: `'found' | 'not_stocked' | 'source_error' | 'skipped'`

### 4.5 What Gets Persisted

**Callback flow** (route.ts, lines ~299-330):
1. Delete existing attempt rows for this `attempt_id` (idempotent replay)
2. Insert new rows with: `source_slug`, `source_type`, `outcome`, `confidence`, `matched_fields`, `evidence_url`, `error_code`, `error_message`, `attempted_at`

Additionally, `products_ingestion.sources` JSONB column is updated via `buildSourcePayloadsByUpc()` (enrichment-result.ts, line ~356):
- Sources with outcome `"found"` or `"not_stocked"` are written into the `sources` column
- Sources with outcome `"source_error"` or `"skipped"` are NOT written to `sources` (but are in `enrichment_source_attempts`)

---

## 5. Decision Flow Summary

```
UPC submitted for enrichment
  │
  ├── Product missing brand_id → "missing_brand" (no plan built)
  ├── Brand cascade not configured → "source_cascade_not_configured"
  ├── No sources enabled → "no_sources_configured"
  │
  └── Plan built successfully
        │
        └── Executor runs Phase 1: ALL distributors
              │
              ├── Any distributor returns "found"?
              │   └── YES → Skip SERP. Product = "processed"
              │
              ├── Any distributor returns "source_error" (non-Amazon)?
              │   └── YES → Skip SERP. Product = "needs_attention"
              │
              └── ALL distributors return "not_stocked"?
                    │
                    └── Run Phase 3: SERP Discovery (Serper API + LLM + Crawl4AI)
                          │
                          ├── SERP finds URL & extracts product → "processed"
                          └── SERP fails → "source_error" on official_brand source
                                └── Product = "needs_attention"
```

---

## 6. Known Reliability Weaknesses

### 6.1 Serper API Single Point of Failure
- Serper is the **only** search provider. No fallback.
- If Serper is down or rate-limited, SERP Discovery returns nothing, and the UPC gets `needs_attention`.

### 6.2 LLM URL Selection on Snippets, Not Page Content
- The LLM receives only Serper snippets (title, description, URL) — not the actual page. It cannot meaningfully verify variant match from 150 chars.
- A wrong URL selection wastes extraction cost and risks wrong data.

### 6.3 No Content Recycling Between Discovery Phases
- SERP Discovery runs 3-4 Serper queries + 2 LLM calls before extraction. If extraction fails, all that cost is sunk.

### 6.4 Static HTML Parsing Weakness
- Distributor adapters parse HTML with static BeautifulSoup selectors. If a distributor changes their HTML, the adapter silently returns `not_stocked` — even if the UPC exists but wasn't found due to selector mismatch.

### 6.5 Outcome Inference Ambiguity
- When `SourceResultInfo.outcome` is `None`, it's inferred from result status. "No match" in warnings → `not_stocked`. Everything else → `source_error`. This is fragile — a failed extraction with a non-standard warning message could be misclassified.

### 6.6 Amazon's Special Treatment
- Amazon `source_error` is intentionally treated as non-blocking (executor.py lines 131-132). This means if Amazon blocks a crawl, the system assumes "maybe Amazon blocked but the brand site has it" and proceeds to SERP. This is a pragmatic choice but creates a blind spot.

### 6.7 No Unit Tests for SERP Discovery
- `SerpDiscoveryAdapter` has no unit tests. The path from `_resolve_approved_url()` through all phases is untested in isolation.

### 6.8 Incremental Re-extraction Gaps
- `getUntriedAndErroredSources()` only retries `source_error` outcomes. Sources with `not_stocked` are never retried — even if the distributor might have since added the product. There's no "re-check after N days" mechanism.

---

## 7. Integration Points for a Better UPC-Not-Found Fallback

### 7.1 Where to Intercept Before SERP

**File**: `apps/scraper/scrapers/approved_sources/executor.py`, method `_try_source_entries()`, lines 128-165

The boolean `run_serp` at line 149 is the gate. To add a new fallback layer:
- Insert a new phase between Phase 1 and Phase 3
- Check some condition on `not_stocked` outcomes before falling through to Serper-based SERP

### 7.2 Where to Add Alternative Search Providers

**File**: `apps/scraper/ai_search/search.py` (search client, currently Serper-only)

The `SearchClient` class is where a new search provider would be integrated (e.g., Crawl4AI Cloud SDK `discovery()` API, Google Custom Search, or direct Crawl4AI sitemap crawling).

### 7.3 Where to Modify Outcome Rules

**File**: `apps/web/lib/scraper-callback/enrichment-result.ts`, function `determineFinalStatus()` (line 385)

If you want `not_stocked` to also produce `needs_attention` (instead of `processed`), this is the place.

### 7.4 Where to Add Retry Policy for not_stocked

**File**: `apps/web/lib/approved-sources/source-cascade.ts`, function `getUntriedAndErroredSources()` (line 342)

Currently only returns `source_error` sources for retry. Adding a time-based re-check for `not_stocked` sources would go here.

### 7.5 Where to Enrich SERP Candidate Verification

**File**: `apps/scraper/scrapers/approved_sources/adapters/serp_discovery.py`, method `_verify_candidates_with_crawl4ai()` (line ~470)

This already does lightweight Crawl4AI verification of candidate URLs. The bottleneck is that it only runs for candidates that already passed Serper search — it could be extended to crawl brand sitemaps directly when Serper returns nothing.

---

## 8. Confidence Assessment

| Area | Confidence | Gaps |
|------|-----------|------|
| Plan building logic | **High** | Fully traced through source-plan.ts |
| Executor cascade logic | **High** | _try_source_entries() flow fully mapped |
| Outcome classification | **High** | Database CHECK constraint, Python results, and callback normalization all align |
| SERP Discovery adapter | **High** | Read all 2340 lines of serp_discovery.py |
| Distributor adapter internals | **Medium** | Read base.py fully; individual adapters (amazon.py, bradley.py, etc.) not read in detail |
| Adapter registry | **High** | Full alias-to-class mapping confirmed |
| Database schema | **High** | Migration SQL confirmed |
| Callback persistence | **High** | Route and helper functions fully traced |
| Research docs coverage | **High** | All three research files read and corroborated |
