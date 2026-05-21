# Distributor Extraction Investigation

Date: 2026-05-20

## Scope
Investigate three reported issues:
1. approved-source outputs are mixing legacy alias fields with newer nested schema fields,
2. Processed UI collapses multiple distributor results into one `Enriched` source,
3. `distributor_only` runs surface duplicate / misleading `mixed` attempts.

## Confirmed findings

### 1) The mixed legacy/modern schema is intentional in the current callback normalizer
- `apps/web/lib/enrichment/normalize-result.ts` writes both flat backward-compatible aliases (`title`, `name`, `images`, `image_urls`, `confidence_score`, etc.) and the nested `extracted` object into `sources.enriched`.
- `apps/web/lib/enrichment/contracts.ts` explicitly documents this as backward compatibility for older consolidation consumers.
- `apps/web/lib/product-sources.ts` treats the `enriched` source as already-normalized and preserves that shape rather than re-canonicalizing it.

**Effect:** raw JSON views show both schemas at once, which makes the output look redundant/confusing and increases consumer ambiguity.

### 2) All approved-source results are persisted into a single `sources.enriched` slot
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` updates product sources as:
  - existing sources
  - `enriched: normalized`
- There is no separate `sources.phillips`, `sources.orgill`, `sources.central_pet`, or `sources.petfoodex` record for approved-source extraction.
- Distributor identity is preserved only inside `sources.enriched.source_results[]`.

**Effect:** the Processed page can only render one `Enriched` tab/object for approved-source output.

### 3) The Processed UI is explicitly designed to group distributor names under one `Enriched` tab
- `apps/web/components/admin/pipeline/ProcessedResultsView.tsx` reads `source_results[]` from the `enriched` object and renders labels like `Enriched (Phillips Pet, Orgill, Pet Food Experts, ...)`.
- The raw JSON block in the same component prints the full `currentSourceData`, which exposes the aliased + nested schema together.

**Effect:** the UI grouping is not accidental; it follows the current persistence model.

### 4) `distributor_only` mode does not mean “only the selected distributor”
- `apps/web/lib/approved-sources/source-plan.ts` filters out `official_brand` sources for `distributor_only`, but still includes all configured distributor entries.
- `selectedDistributorSlug` only marks one entry `runFirst`; it does not isolate that distributor.

**Effect:** a distributor-only run can still walk multiple distributor sources, and the returned winner may not be the initially selected distributor.

### 5) Approved-source result builders hardcode `mode="mixed"`
- `apps/scraper/scrapers/approved_sources/result_builder.py` sets `mode="mixed"` for success, partial, auth-required, auth-failed, no-match, policy-blocked, and generic failed results.
- The enrichment result contract/validation currently supports extraction-style modes (`structured`, `metadata`, `llm`, `mixed`) rather than job modes like `distributor_only` / `ai_only`.

**Effect:** approved-source callbacks lose the original job mode and report themselves as `mixed`.

### 6) Retry attempts inherit the wrong mode, which explains the duplicate mixed attempts
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` creates retries with `mode: enrichedResult.mode`.
- Because approved-source result builders always emit `mixed`, retries on a `distributor_only` job are re-queued with `mixed` attempt metadata.
- The callback retry logic is generic and will retry failed/low-confidence results even though approved-source execution already walks a full source plan within a single attempt.

**Effect:** `distributor_only` jobs can produce redundant retries and those retries are tagged as `mixed`, matching the monitor symptoms.

### 7) Telemetry/logging has an additional mixed-mode default
- `apps/scraper/runner/__init__.py` logs the job mode from `job_payload.get("mode", "mixed")`.
- Approved-source job config stores `extraction_mode`, not `mode`, so runner logs default to `mixed` unless another field supplies it.

**Effect:** even when the job itself is `distributor_only`, some runner-side telemetry/log output can still describe it as `mixed`.

## Test coverage notes
- There is coverage for source-plan mode filtering and dedup in:
  - `apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts`
  - `apps/web/__tests__/lib/approved-sources/source-plan-dedup.test.ts`
- There is route coverage for job creation mode handling in:
  - `apps/web/__tests__/app/api/admin/enrichment/jobs-route.test.ts`
- I did **not** find focused tests for:
  - enrichment callback normalization into `sources.enriched`,
  - approved-source retry mode propagation,
  - Processed UI grouping of `source_results[]`,
  - preserving/disambiguating per-distributor identity in storage/UI.

## Related artifacts
- `insight/backend-scout.md`
- `insight/ui-scout.md`
- `insight/context-contract.md`
- `insight/fix-plan.md` (planner output)
