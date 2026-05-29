# Implementation Plan

## Goal
Populate Finalizing/Reviewing Product Info and Product Details from source-backed enriched evidence when `consolidated` is empty or incomplete, without filling protected operational fields from marketplace data.

## Tasks
1. **Create a shared source-backed fallback extractor**: Add a small utility that walks normalized product sources and returns only evidence-backed core, media, facet, and text candidates.
   - File: `apps/web/lib/product-source-fallbacks.ts`
   - Changes: Export helpers such as `collectSourceBackedFallbacks(sources, input?)`, `hasTextValue`, `normalizeFallbackWeight`, and trust-aware confidence/evidence helpers. Traverse these shapes: direct source records, `extracted.core`, `extracted.facets`, `product.core`, `product.facets`, `approved_sources.*`, and `source_results[].product`. Extract only `name/title`, `brand/brand_name`, `description`, `weight/weight_lbs`, explicit/derived `search_keywords`, `media/images/image_urls`, `source_urls`, and facets. Do not extract `price`, `stock_status`, `availability`, `is_special_order`, `minimum_quantity`, or `is_taxable`. Cap marketplace confidence at ~0.82 and use evidence strings like `source:amazon:extracted.core.description`.
   - Acceptance: Unit helper calls can return fallback name, brand, description, weight, images, dimensions/features from the Amazon-shaped payload while returning no protected fields.

2. **Use source fallbacks in the reviewing draft**: Populate UI draft fields from source evidence when `consolidated` and `input` are blank.
   - File: `apps/web/lib/pipeline/reviewing-draft.ts`
   - Changes: In `buildInitialFinalizationDraft`, call `collectSourceBackedFallbacks(product.sources, input)` before constructing `facets` and the return object. Apply precedence: `consolidated.core` → legacy `consolidated` → `input` → source fallback. Use fallback for `name`, `description`, `brandName`, `weight`, `searchKeywords`, `selectedImages`, and missing facets only. Keep existing/default handling for protected operational fields and never source-fill them. If category is blank, do not invent a category.
   - Acceptance: A product with empty `consolidated`/`input` and Amazon enriched sources displays name, brand, description, weight, images, search keywords, dimensions/features, and animal-food facets in the draft.

3. **Expand deterministic detail enrichment to nested enriched evidence**: Make facet extraction see text and structured facts buried inside enrichment payloads.
   - File: `apps/web/lib/consolidation/detail-enrichment.ts`
   - Changes: Update `buildSearchableText` to include nested `core.name`, `core.description`, `search_keywords`, source `features`, `facets[].value`, `approved_sources.*`, and `source_results[].product` text, with a bounded recursive allowlist to avoid noisy blobs. Update source extraction to use the shared fallback facet candidates in addition to current aliases/specifications. Add safe profile inference when category/profile is missing (for example dog/cat + food/form terms ⇒ `animal_food`) so enrichment can populate animal food details without a taxonomy category. Add missing claim patterns such as `No Artificial Preservatives` and optionally `No Fillers`.
   - Acceptance: `enrichProductDetails` on the Amazon-shaped source data with no category returns `facetProfile: "animal_food"` and fields including `animal_type=Dog`, `food_form=Freeze-Dried`, `primary_protein=Chicken`, `diet_type` containing `Grain-Free` and `High-Protein`, `claims` containing `Made in USA`/preservative claims, `dimensions`, and `package_weight` where present.

4. **Pass richer context into facet assembly and preserve facet provenance**: Ensure consolidation apply gets the same detail quality and non-null evidence/confidence.
   - File: `apps/web/lib/consolidation/facet-assembler.ts`
   - Changes: Include `description` and `search_keywords` in `tempConsolidated` when calling `enrichProductDetails`. Before/alongside heuristic enrichment, add exact source-backed fallback facets from `collectSourceBackedFallbacks`, preserving their `evidence_source` and confidence. Keep priority order: VLM/LLM facets first, then source-backed facets, then heuristic pattern facets, then existing facets only when not already set.
   - Acceptance: Assembled facets have non-null `evidence_source`/`confidence_score`, and source dimensions/features are available even when not produced by the LLM.

5. **Source-fill missing core fields during consolidation apply**: Prevent valid source evidence from being lost when LLM output is sparse.
   - File: `apps/web/lib/consolidation/apply-service.ts`
   - Changes: In `applyConsolidationResults`, compute source fallbacks after loading `existingRecord`/`existingCore` and before validation. Use fallbacks for missing `draftName`, normalized brand, `draftDescription`, `weightValue`, and `draftSearchKeywords`. Do not fill category from marketplace; only preserve existing/trusted category values already present. Store field source attribution under `nextFieldsNested.evidence.field_sources` for any fallback-filled core fields.
   - Acceptance: A consolidation result missing description/search keywords but with source-backed enriched data passes validation and writes those fields to `consolidated.core`; price/stock/tax/special-order/min-quantity remain untouched.

6. **Infer Product Details profile in the UI when category is blank**: Show relevant detail fields instead of the `general` profile when populated facets/source evidence indicate a known profile.
   - File: `apps/web/components/admin/pipeline/reviewing/MerchandisingClassification.tsx`
   - Changes: Update `resolvedFacetProfile` to use, in order: category facet profile, explicit profile if available in draft sources/consolidated if exposed, populated facet slugs (`food_form`, `primary_protein`, `diet_type`, `animal_type`, etc.), and finally source/text evidence from `formData.sources`. Keep fallback `general` only when no evidence supports a narrower profile.
   - Acceptance: With blank category but source/draft facets for dog freeze-dried food, Product Details displays `animal_food` facets rather than only general fields.

7. **Preserve fallback provenance through finalization saves where possible**: Avoid presenting source/heuristic-filled fields as manual facts unless the admin edits them.
   - File: `apps/web/lib/pipeline/reviewing-draft.ts`
   - Changes: If provenance is added to `FinalizationDraft`, include a small optional map (for example `facetEvidence?: Record<string, { evidence_source: string; confidence_score: number }>`). Use it in `buildConsolidatedPayloadFromDraft` for unchanged source-filled facets; continue using `manual` for user-created/edited facets. If this is too invasive, document it as a follow-up and keep current save behavior.
   - Acceptance: Saved source-backed facets either retain source evidence or the limitation is explicitly covered by tests/follow-up notes; no runtime schema break occurs.

8. **Add regression tests for the Amazon blank-field scenario**: Cover the exact failure mode at helper, draft, enrichment, and apply layers.
   - File: `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts`
   - Changes: Add Amazon enriched payload test for nested text/facet/profile extraction.
   - File: `apps/web/__tests__/lib/pipeline/reviewing-draft.test.ts`
   - Changes: Add a product with empty `consolidated`/`input` and Amazon-shaped `sources.enriched`/`sources.amazon`; assert draft core fields, images, and facets are populated.
   - File: `apps/web/__tests__/lib/consolidation/batch-service.test.ts`
   - Changes: Add an `applyConsolidationResults` test where LLM result omits description/search keywords/weight and source fallback supplies them; assert protected fields are not source-filled.
   - File: `apps/web/__tests__/lib/consolidation/facet-assembler.test.ts`
   - Changes: Update/add assertions for source-backed facet evidence and richer consolidated context.
   - Acceptance: Focused tests pass with `bun run web test -- --testPathPatterns="detail-enrichment|reviewing-draft|batch-service|facet-assembler"`.

9. **Run focused validation**: Verify no broad pipeline regressions.
   - File: N/A
   - Changes: Run focused Jest tests above, then run `bun run web lint` if time permits.
   - Acceptance: Focused tests pass; lint either passes or any unrelated pre-existing failures are documented.

## Files to Modify
- `apps/web/lib/pipeline/reviewing-draft.ts` - source fallback usage for initial draft fields/facets/images and optional provenance preservation.
- `apps/web/lib/consolidation/detail-enrichment.ts` - nested enriched text/facet extraction, profile inference, and expanded claim patterns.
- `apps/web/lib/consolidation/facet-assembler.ts` - pass description/search keywords and preserve source facet evidence/confidence.
- `apps/web/lib/consolidation/apply-service.ts` - source-fill missing non-protected core fields before validation/write.
- `apps/web/components/admin/pipeline/reviewing/MerchandisingClassification.tsx` - infer facet profile when category is blank.
- `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts` - nested Amazon regression.
- `apps/web/__tests__/lib/pipeline/reviewing-draft.test.ts` - draft fallback regression.
- `apps/web/__tests__/lib/consolidation/batch-service.test.ts` - apply-service fallback regression.
- `apps/web/__tests__/lib/consolidation/facet-assembler.test.ts` - source facet provenance regression.

## New Files
- `apps/web/lib/product-source-fallbacks.ts` - shared deterministic source-backed fallback extractor used by review draft, detail enrichment, facet assembly, and apply service.
- `apps/web/__tests__/lib/product-source-fallbacks.test.ts` - focused unit tests for source traversal, trust/confidence, protected-field exclusion, and Amazon-shaped fallback extraction.

## Dependencies
- Task 1 must be completed before Tasks 2, 3, 4, and 5.
- Task 3 should be completed before Task 6 so the UI can rely on populated/inferred detail facets.
- Task 4 depends on Tasks 1 and 3 for source-backed facet candidates and richer enrichment.
- Task 5 depends on Task 1 for core fallback candidates.
- Tests in Task 8 depend on the implementation tasks they cover.

## Risks
- Category inference is risky; do not write marketplace-inferred categories to `consolidated.core.canonical_category_breadcrumb`. Only infer `facetProfile`/detail visibility from source evidence.
- Recursive source traversal can pick up noisy text if too broad; keep an allowlist of keys and a depth/length cap.
- Search keyword generation can become hallucination-prone; derive only from source-backed name/brand/facet values and skip if no evidence tokens exist.
- Adding fields to `FinalizationDraft` can affect client state, schema validation, and dirty tracking; keep optional and backward-compatible.
- Existing reviewing rows will benefit from draft fallback immediately, but rows already saved after manual edits may still need careful merge behavior.
- `sources.enriched` must not be treated as trusted solely because of the key name; trust should be based on `active_source_slug`, `source_slug`, `source_type`, or source result metadata, with Amazon/marketplace capped.
