# Backend Scout: Approved Source Extraction — Mixed Mode & Duplicate Attempts

## Overview

Investigation into why distributor extraction outputs mix legacy aliases with the newer nested schema, and why `distributor_only` runs can surface duplicate mixed-mode attempts. Six concrete root causes identified (all confirmed with file/line evidence).

---

## Root Cause 1: Result Builder Hardcodes `mode="mixed"` — Never Reflects Actual Extraction Mode

**File:** `apps/scraper/scrapers/approved_sources/result_builder.py`
**Lines:** 55, 131, 187, 240, 293, 339, 384, 437, 446

**Every builder function** (`build_success_result`, `build_partial_result`, `build_auth_required_result`, `build_auth_failed_result`, `build_auth_expired_result`, `build_no_match_result`, `build_policy_blocked_result`, `build_failed_result`) passes `mode="mixed"` as a literal string. None accept a `mode` parameter from the caller.

**Impact:** The `EnrichmentResultV1.mode` field always reports `"mixed"` regardless of whether the job was created with `extractionMode: "distributor_only"` or `"ai_only"`. Downstream consumers (callback, retry logic, DB, consolidation) cannot distinguish distributor-only from mixed-mode results at field level.

**Evidence** (lines 55, 131, etc.):
```python
def build_success_result(..., llm_used=False, ...) -> EnrichmentResultV1:
    return EnrichmentResultV1(
        ...
        mode="mixed",  # <-- hardcoded
        ...
    )
```

---

## Root Cause 2: distributor_only Mode Includes ALL Distributor Sources, Not Only the Selected One

**File:** `apps/web/lib/approved-sources/source-plan.ts`
**Lines:** ~354–360

```typescript
if (extractionMode === "ai_only") {
  orderedEntries = orderedEntries.filter(e => e.sourceType === "official_brand");
} else if (extractionMode === "distributor_only") {
  orderedEntries = orderedEntries.filter(e => e.sourceType !== "official_brand");
}
```

The `distributor_only` filter removes `official_brand` entries but keeps **all** `distributor` entries, not just the one identified by `selectedDistributorSlug`. The selected distributor is merely marked `runFirst: true` (line ~300) for ordering, not isolated as the sole source. This means:

- A `distributor_only` job will try **every** configured distributor sequentially (not just "phillips" if Phillips was selected).
- If the selected distributor fails (auth required, no match), a different distributor's data is returned as the "result" — silently.
- `runFirst` controls ordering but offers no exclusivity guarantee.

---

## Root Cause 3: Executor Returns First Success, Not a Merged Result — `source_results` Only Contains One Source

**File:** `apps/scraper/scrapers/approved_sources/executor.py`
**Lines:** 82–135

```python
async def _try_source_entries(self, entries) -> EnrichmentResultV1 | None:
    last_result = None
    for entry in entries:
        adapter = adapter_cls(entry, self.plan)
        result = await adapter.extract(self.extractor)
        ...
        if result.status == "success":
            return result           # <-- returns immediately, discards other attempts
    return last_result              # <-- only the last failure, not cumulative
```

Each adapter returns a complete `EnrichmentResultV1` with a **single-entry** `source_results` array (the current source only). The executor picks the first success and returns it — all other source attempt data is lost. On total failure, only the *last* failure's `source_results` survives, giving a misleading picture of what was tried.

---

## Root Cause 4: Callback Retry Propagates `enrichedResult.mode` Instead of Original Job Mode

**File:** `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`
**Line:** ~175

```typescript
await supabase.from("enrichment_attempts").insert({
    ...
    mode: enrichedResult.mode,  // <-- always "mixed" (from Root Cause 1)
    ...
});
```

When a retry attempt is created, the `mode` field is taken from the enrichment result (always `"mixed"`) **not** from the original job's `extractionMode`. This means:

- A job started with `mode: "distributor_only"` will spawn retry attempts with `mode: "mixed"`.
- The source plan builder is NOT re-invoked on retry (the plan was embedded in `job_config.source_plans_by_sku` at job creation time). So the retry attempt's `mode` field is misleading metadata, but the actual source plan still reflects the original job's extraction mode.

**Contrast** with the standard URL extraction path in `runner/__init__.py` (line ~146), where `build_v1_from_extraction_result` is called with the actual `mode_str` from the job payload. The approved-source path never does this — the executor bypasses `build_v1_from_extraction_result` entirely.

---

## Root Cause 5: Dual Representation in `NormalizedEnrichedSourceV1` — Legacy Aliases and Nested Schema Coexist

**File:** `apps/web/lib/enrichment/normalize-result.ts`
**Lines:** 21–48

```typescript
return {
    // Backward-compatible aliases
    title: product.name ?? null,    // alias
    name: product.name ?? null,     // alias
    images: product.image_urls ?? [],   // alias
    image_urls: product.image_urls ?? [], // alias
    url: result.source.url,
    confidence_score: result.confidence.overall,
    // Nested enriched product facts
    extracted: product,              // full EnrichedProductFacts
    ...
};
```

The normalized shape stores **both**:
1. Legacy flat aliases (`title`, `name`, `images`, `image_urls`, `url`, `confidence_score`)
2. The complete nested `extracted` object containing all `EnrichedProductFacts`

Both coexist in the same JSON column. The consolidation pipeline (`prompt-builder.ts`, `batch-service.ts`) can read from either layer. When distributor extraction outputs change field names (e.g., an adapter returns `item_number` but the legacy alias maps `name` at the top level), consumers see different data depending on which source they read. This is the "mixing legacy aliases with newer nested schema" behavior — the aliases provide backward compatibility but create an ambiguous data surface.

**Contract type** in `apps/web/lib/enrichment/contracts.ts` (lines 69–103) documents this explicitly:
```typescript
/**
 * Contains backward-compatible aliases so existing consolidation can consume it.
 * Key aliases:
 *   - product.name → title, name
 *   - product.image_urls → images, image_urls
 *   - confidence.overall → confidence_score
 */
```

---

## Root Cause 6: Dedup is Source-Plan-Only, Not Executor-Level — Sequential `distributor_only` Runs Overwrite Each Other

**File:** `apps/web/lib/approved-sources/source-plan.ts`
**Lines:** 138–167 (`isSourceRecentlySuccessful`), 369–384 (skipping logic)

Dedup filtering (`isSourceRecentlySuccessful`) only happens at **source plan construction time** on the coordinator. It checks `source_results` for a matching `sourceSlug` with confidence ≥ 0.6 and a recent `extracted_at`. The executor has no dedup awareness.

**Scenario for duplicate mixed-mode attempts:**
1. **Run 1** (`distributor_only`): plan includes [Phillips(runFirst), Bradley, Central Pet, ...]. Phillips succeeds → stored with `source_results: [{sourceSlug: "phillips"}]`
2. **Run 2** (`distributor_only`): plan rebuilt → `isSourceRecentlySuccessful` finds Phillips ≥ 0.6 within 48h → removes Phillips from plan. Executor gets [Bradley, Central Pet, ...]. Bradley succeeds → **overwrites** `sources.enriched` with Bradley's data + `source_results: [{sourceSlug: "bradley"}]`
3. Each sequential run produces a **different result** from a different distributor, overwriting the previous one. Nothing signals to the user that the result changed sources.

This is why `distributor_only` runs appear to produce "duplicate mixed-mode attempts" — each run is a complete overwrite, not an incremental addition.

---

## Mode Propagation Summary Table

| Stage | Source | `mode` value | Correct? |
|---|---|---|---|
| Job creation (admin API) | User/request body | `"distributor_only"` | ✓ |
| Source plan construction | `source-plan.ts` | Uses extraction mode for filtering | ✓ (filtering works) |
| Enrichment attempt (queued) | Admin API insert | `"distributor_only"` | ✓ |
| Result builder (Python) | `result_builder.py` | **`"mixed"`** (hardcoded) | ✗ |
| Enrichment callback | Validation (Zod) | `"mixed"` (valid) | Accepts wrong value |
| `normalized_source` stored | Callback | `"mixed"` | ✗ |
| Retry attempt created | Callback line ~175 | `"mixed"` (from result) | ✗ |
| Standard URL extraction path | `runner/__init__.py` line ~146 | Actual `mode_str` | ✓ |

---

## Impacted Files

| File | Lines | Role |
|------|-------|------|
| `apps/scraper/scrapers/approved_sources/result_builder.py` | 55, 131, 187, 240, 293, 339, 384, 437, 446 | **Primary culprit** — hardcoded `mode="mixed"` in every builder |
| `apps/web/lib/approved-sources/source-plan.ts` | 354–360, 369–384 | distributor_only filter includes all distributors; dedup at plan-build time only |
| `apps/scraper/scrapers/approved_sources/executor.py` | 82–135 | First-success return discards other source attempts |
| `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` | ~175 | Retry uses `enrichedResult.mode` instead of job mode |
| `apps/web/lib/enrichment/normalize-result.ts` | 21–48 | Dual representation: legacy aliases + nested `extracted` |
| `apps/web/lib/enrichment/contracts.ts` | 69–103 | Contract documents the alias design |
| `apps/web/lib/enrichment/validation.ts` | 3–6 | Zod schema only accepts `"mixed"|"structured"|"metadata"|"llm"` — no `"distributor_only"` |
| `apps/scraper/scrapers/ai_search/enrichment_models.py` | 13, 126 | Python model allows `"approved_source"` in regex but literal type doesn't match |
| `apps/web/app/api/admin/enrichment/jobs/route.ts` | 51–55, 80–90 | Creates jobs with `extractionMode`; embeds source plans in config |
| `apps/web/lib/approved-sources/distributor-catalog.ts` | 70–120 | Slug normalization; aliases map to canonical slugs |
| `apps/scraper/scrapers/approved_sources/adapters/base.py` | 132–343 | `extract()` builds results; images filtered but mode never touched |
| `apps/scraper/scrapers/approved_sources/adapters/registry.py` | 13–45 | Adapter slug aliases (distinct from distributor-slug normalization) |

---

## Open Questions

1. **Intentional?** Is the hardcoded `mode="mixed"` in `result_builder.py` deliberate (since approved-source extraction truly is "mixed" — deterministic + optional LLM), or was it an oversight that missed adding a `mode` parameter? The contract comment in `contracts.ts` line 10 says "stores backward-compatible aliases" — this implies the aliases are deliberate, but the mode mismatch may not be.

2. **Should `extractionMode` be a separate field?** The `EnrichmentMode` type (`"structured"|"metadata"|"llm"|"mixed"`) and the `ExtractionMode` type (`"mixed"|"distributor_only"|"ai_only"`) are conflated in the `mode` field. If they represent distinct concerns, they should be separate fields. If not, the result builder needs access to the actual extraction mode.

3. **Retry impact of wrong mode:** Since retry attempts inherit `mode: "mixed"` instead of the job's `extractionMode`, does the source plan in `job_config.source_plans_by_sku` still correctly filter sources on retry? Or does the retry path rebuild the plan using the wrong mode? The callback only creates a new attempt row — it doesn't rebuild the plan. The plan was embedded at job creation time, so it's frozen with the original filtering. But the attempt's `mode` field is now misleading.

4. **Dedup correctness for distributor_only:** `isSourceRecentlySuccessful` checks `source_results` for a matching `sourceSlug`. If successive runs switch which distributor succeeds, the dedup only prevents re-running the *previously successful* distributor. Should the dedup key on the selected distributor, not the successful source?

5. **Should `source_results` accumulate?** The executor currently returns the first success's single-entry `source_results`. Should it aggregate all attempted sources? If so, the result builder and executor need changes.
