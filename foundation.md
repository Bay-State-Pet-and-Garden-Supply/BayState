# Phase 1 Foundation — Complete

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/lib/enrichment/contracts.ts` | 126 | All v1 TypeScript contracts for enrichment result (EnrichmentResultV1, EnrichedProductFactsV1, NormalizedEnrichedSourceV1, etc.) |
| `apps/web/lib/enrichment/validation.ts` | 147 | Zod schemas for runtime validation of v1 callback payloads, including batch validation helper |
| `apps/web/lib/enrichment/normalize-result.ts` | 80 | `normalizeEnrichmentResultForSources()` — converts worker result → `sources.enriched` with backward-compatible aliases |
| `apps/web/lib/enrichment/metrics.ts` | 80 | Metrics helpers: `computeConfidenceMetrics()`, `computeFieldConfidenceMetrics()`, `computeOutcomeMetrics()`, `computeRetryMetrics()` |
| `apps/web/supabase/migrations/20260514030000_add_enrichment_tables.sql` | 132 | Three new tables (enrichment_targets, enrichment_jobs, enrichment_attempts) with RLS policies |

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/lib/enrichment/types.ts` | • Removed `stock_status` from ENRICHABLE_FIELDS<br>• Added 14 new enrichable fields: shipping_weight, image_urls, ingredients, features, pet_type, life_stage, pet_size, food_form, flavor, special_diet, health_feature, packaging_type, size, color<br>• Added `'enriched'` to SourceType union<br>• PROTECTED_FIELDS kept as (price, sku, cost, msrp) — removed stock_status, manufacturer_part_number, product_line |

## Validation

Files are syntactically valid TypeScript. Zod v4 locale warnings in node_modules are pre-existing project-wide issues (esModuleInterop flag in locale re-exports), not caused by our changes.

## Key Design Decisions

1. **Backward compatibility**: `NormalizedEnrichedSourceV1` provides `title`/`name` aliases for `product.name`, and `images`/`image_urls` aliases — matching what the existing consolidation prompt-builder expects.

2. **Schema versioning**: All structures carry `schema_version: "v1"` for forward compatibility when the contract evolves.

3. **Confidence scoring**: Per-field and overall confidence (0.0–1.0) with validation tracking (sku_match, warnings, missing_required).

4. **Extraction modes**: `"structured" | "metadata" | "llm" | "mixed"` — matching crawl4ai's extraction strategy options.

5. **Protected fields**: price, sku, cost, msrp — never touched by AI enrichment, always from original import.

6. **Additive migration**: New tables coexist with old scrape_jobs/chunks tables. No destructive changes in this phase.

## Next Steps (Blocked on This)

- Phase 2: UI components (URL Review workspace, ActiveEnrichmentsTab, ProcessedResultsView)
- Phase 3: API routes (create enrichment jobs, claim, callback)
- Phase 4: Python worker enrichment models
