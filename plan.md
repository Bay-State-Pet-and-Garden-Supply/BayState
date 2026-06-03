# Implementation Plan

## Goal
Improve deterministic distributor adapter extraction of source-backed categories, package details, and product facets that downstream LLM consolidation, detail enrichment, review, and storefront facets can actually consume, while keeping protected operational fields and price out of scope.

## Tasks
1. **Fix flat-field to facet mapping before adding adapter fields**: Expand scraper result normalization so newly extracted canonical detail fields are not silently dropped.
   - File: `apps/scraper/scrapers/ai_search/enrichment_models.py`
   - Changes: Update `build_nested_product_facts()` to map both legacy and canonical flat fields into `FacetData`, including `animal_type`, `breed_size`, `primary_protein`, `diet_type`, `health_focus`, `package_count`, `package_weight`, `case_pack`, `unit_of_measure`, `manufacturer_number`, and existing legacy aliases (`pet_type`, `pet_size`, `special_diet`, `health_feature`, `protein`, `protein_source`). Map `case_pack`/`pack_count` to `package_count`; map `unit_of_measure` to a facet only if a canonical target exists or keep as `unit_type` with clear test coverage. Do not map `price`, `stock_status`, `availability`, `is_special_order`, `minimum_quantity`, or `is_taxable`.
   - Acceptance: `build_success_result(... product_fields={"animal_type":"Dog","primary_protein":"Chicken","case_pack":"12"})` produces `result.product.facets` entries for those fields and still excludes protected fields.

2. **Add result-builder coverage for enriched facets**: Lock in the schema behavior from Task 1.
   - File: `apps/scraper/tests/unit/test_approved_sources_result_builder.py`
   - Changes: Add tests for canonical facet fields, legacy-to-canonical aliases, list facet splitting, media preservation, category-to-`canonical_category_breadcrumb`, and protected-field exclusion.
   - Acceptance: Focused test command passes: `cd apps/scraper && python -m pytest tests/unit/test_approved_sources_result_builder.py`.

3. **Create shared deterministic extraction helpers for adapters**: Avoid five separate regex implementations for the same detail labels.
   - File: `apps/scraper/scrapers/approved_sources/adapters/base.py`
   - Changes: Add reusable helper methods for BeautifulSoup parsers, such as labeled key/value extraction from `dt/dd`, table rows, `li`, and `data-test-selector` blocks; breadcrumb/category extraction; image URL normalization reuse; and product-text-derived facet hints for common animal fields (`animal_type`, `life_stage`, `breed_size`, `food_form`, `flavor`, `primary_protein`, `diet_type`, `health_focus`, `claims`). Keep helpers deterministic regex/CSS only.
   - Acceptance: Helpers are unit-testable through adapter fixture tests and do not change existing adapter success/no-match behavior.

4. **Prioritize Pet Food Experts facet extraction**: PFE appears data-rich and already exposes an attributes block with many directly labeled pet facets.
   - File: `apps/scraper/scrapers/approved_sources/adapters/pet_food_experts.py`
   - Changes: Parse `attrs_text` labels for `Flavor`, `Animal`, `Diet`, `Food Form`, `Ingredients`, `Protein`, `Weight`, `Breed Size`, and `Life Stage`; populate flat fields that Task 1 maps to facets (`flavor`, `animal_type`, `diet_type`, `food_form`, `ingredients`, `primary_protein`, `breed_size`, `life_stage`, `package_weight`). Add category/breadcrumb extraction if present in PDP HTML. Keep existing auth/PDP fetch behavior.
   - Acceptance: PFE fixture for `pfe_33011808` asserts at least 4 pet facets, including one of `animal_type`, `food_form`, `primary_protein`, `life_stage`, or `breed_size` where fixture HTML supports it.

5. **Prioritize Phillips PDP enrichment**: Phillips is a login-gated pet distributor and currently enriches description/features/images from PDP but misses many PDP specs.
   - File: `apps/scraper/scrapers/approved_sources/adapters/phillips.py`
   - Changes: Extend `_enrich_from_pdp_html()` and search-result candidate parsing to run shared labeled-value/spec parsers. Extract category/breadcrumb, dimensions, case pack/package count, unit of measure, manufacturer number if present, and pet facets inferred from name/description/features/spec labels (`flavor`, `primary_protein`, `life_stage`, `breed_size`, `food_form`, `animal_type`, `diet_type`).
   - Acceptance: Phillips fixture(s) assert enriched facets for `Fromm Gold Large Breed Dog 30 lb` such as `animal_type=Dog`, `life_stage=Adult` or source-supported equivalent, `breed_size=Large Breed`, and `package_weight`/weight preservation.

6. **Improve Central Pet extraction for categories and missing package/pet fields**: Central Pet already extracts features and dimensions, making it a good next target.
   - File: `apps/scraper/scrapers/approved_sources/adapters/central_pet.py`
   - Changes: Extract breadcrumb/category from PDP navigation where available; parse labeled specs for `case_pack`/`package_count`, `unit_of_measure`, ingredients, packaging type, and animal facets. Reuse shared helpers rather than hardcoded one-off selectors.
   - Acceptance: Central Pet fixtures assert category when present and at least one additional facet beyond existing `features`/`dimensions` for pet product fixtures.

7. **Improve Orgill extraction for package count and non-pet detail profiles**: Orgill covers hardware/garden/feed categories where dimensions, materials, NPK, and application details matter.
   - File: `apps/scraper/scrapers/approved_sources/adapters/orgill.py`
   - Changes: Keep existing category/features/dimensions extraction; add case pack/package count, unit of measure, material, color, size, `npk_ratio`, application method, target pest/weed, grass type, feed type, protein/fat percentages when visible in labeled specs/features. Do not prioritize price/stock.
   - Acceptance: Orgill fixture assertions cover `category` and at least one profile-specific facet for feed/garden/hardware fixtures when fixture HTML contains it.

8. **Close Bradley docstring gaps and add categories**: Bradley claims dimensions/ingredients support but currently needs verification and likely selector additions.
   - File: `apps/scraper/scrapers/approved_sources/adapters/bradley.py`
   - Changes: Add explicit extraction for dimensions and ingredients from `li`, specs, product detail sections, or labeled rows; add category/breadcrumb extraction; convert BCI/manufacturer/case pack/unit fields into schema-preserved facets or evidence fields via Task 1.
   - Acceptance: Bradley fixture `bradley_001135` continues passing and asserts category/dimensions/ingredients only when present; partial fixture remains allowed to miss documented fields.

9. **Upgrade fixture catalog to assert field/facet coverage quantitatively**: Move tests from “name/brand/image only” toward measurable data completeness.
   - Files: `apps/scraper/benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json`, `apps/scraper/tests/unit/test_approved_sources_adapter_fixtures.py`
   - Changes: Add optional fixture keys like `expected_fields`, `expected_facets`, `expected_min_facet_count`, and `expected_absent_fields`. Update tests to validate both raw adapter flat fields and normalized `EnrichedProductFacts` facets through `build_success_result()`.
   - Acceptance: Each product fixture has an explicit baseline field/facet expectation, and test failures identify the missing adapter/field.

10. **Ensure web-side prompt/fallback code recognizes newly preserved canonical fields**: Scraper facets are only useful if prompt evidence and fallback assembly surface them.
   - Files: `apps/web/lib/consolidation/prompt-evidence.ts`, `apps/web/lib/consolidation/facet-assembler.ts`, `apps/web/lib/product-source-fallbacks.ts`
   - Changes: Verify and, if needed, add canonical field names to relevant-field allowlists and legacy-to-canonical mappings: `animal_type`, `breed_size`, `primary_protein`, `diet_type`, `health_focus`, `package_count`, `package_weight`, `packaging_type`, `manufacturer_number`. Keep protected fields excluded.
   - Acceptance: Existing consolidation tests still pass, and a source fixture containing these fields is included in prompt evidence/fallback facets rather than filtered out.

11. **Add consolidation/detail-enrichment regression tests for source-backed facets**: Prove new scraper fields improve downstream output without extra LLM calls.
   - Files: `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts`, optionally `apps/web/lib/consolidation/__tests__/facet-assembler.test.ts`
   - Changes: Add tests where normalized source data contains facets from distributor adapters and `enrichProductDetails()` prefers structured source values over regex guesses for `animal_type`, `life_stage`, `breed_size`, `food_form`, `primary_protein`, `package_count`, and `dimensions`.
   - Acceptance: `bun run web test -- --testPathPatterns="detail-enrichment|facet-assembler"` passes.

12. **Run focused validation and record coverage improvement**: Establish before/after metrics for product data completeness.
   - Files: `apps/scraper/tests/unit/test_approved_sources_adapter_fixtures.py`, optional new `apps/scraper/tests/unit/test_approved_sources_field_coverage.py`
   - Changes: Add or script a fixture-based coverage summary that reports per-adapter counts for core fields, media, category, and facets. Use it as a non-flaky unit metric, not a live-site dependency.
   - Acceptance: Focused scraper checks pass: `cd apps/scraper && python -m pytest tests/unit/test_approved_sources_adapter_fixtures.py tests/unit/test_approved_sources_result_builder.py`; report shows increased facet/category coverage for PFE, Phillips, Central Pet, Orgill, and Bradley.

## Files to Modify
- `apps/scraper/scrapers/ai_search/enrichment_models.py` - preserve canonical and legacy facet fields in `build_nested_product_facts()`.
- `apps/scraper/scrapers/approved_sources/adapters/base.py` - shared deterministic extraction helpers.
- `apps/scraper/scrapers/approved_sources/adapters/pet_food_experts.py` - high-priority attribute/facet extraction.
- `apps/scraper/scrapers/approved_sources/adapters/phillips.py` - high-priority PDP spec/facet extraction.
- `apps/scraper/scrapers/approved_sources/adapters/central_pet.py` - category/package/ingredient/facet extraction.
- `apps/scraper/scrapers/approved_sources/adapters/orgill.py` - package and garden/hardware/feed profile facets.
- `apps/scraper/scrapers/approved_sources/adapters/bradley.py` - category, dimensions, ingredients, and documented spec gaps.
- `apps/scraper/benchmarks/approved_sources/fixtures/distributor_extraction_fixtures.json` - expected field/facet assertions.
- `apps/scraper/tests/unit/test_approved_sources_adapter_fixtures.py` - fixture coverage assertions and normalized facet assertions.
- `apps/scraper/tests/unit/test_approved_sources_result_builder.py` - schema mapping and protected-field tests.
- `apps/web/lib/consolidation/prompt-evidence.ts` - allow newly useful canonical field names in LLM evidence if currently filtered.
- `apps/web/lib/consolidation/facet-assembler.ts` - ensure legacy/canonical facet mappings are complete.
- `apps/web/lib/product-source-fallbacks.ts` - ensure source-backed fallback facets traverse new fields.
- `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts` - source-backed detail enrichment regression tests.

## New Files
- `apps/scraper/tests/unit/test_approved_sources_field_coverage.py` - optional coverage/metrics test for per-adapter extracted core/category/facet counts; create only if extending `test_approved_sources_adapter_fixtures.py` becomes too large.

## Dependencies
- Tasks 1 and 2 must happen before adapter field additions, otherwise new flat fields may be ignored downstream.
- Task 3 should happen before Tasks 4-8 to avoid duplicated selector/regex logic.
- Tasks 4-8 can run independently after Tasks 1-3, with PFE and Phillips first for highest pet-facet impact.
- Task 9 depends on adapter changes and result-builder normalization.
- Tasks 10-11 depend on knowing the final field names emitted by Tasks 1 and 4-8.
- Task 12 depends on all implementation and test tasks.

## Risks
- The supplied current-field matrix is partially stale: current code already extracts some fields listed as missing (for example Orgill category/features and PFE ingredients/features). Implementers should verify actual fixture/live HTML before changing selectors.
- Distributor HTML can differ between PLP/search pages and authenticated PDP pages; fixture coverage must include PDP HTML for auth-gated sites or tests will understate available fields.
- Some protected fields (`stock_status`, `availability`, `minimum_quantity`, `is_special_order`, `is_taxable`) are intentionally excluded downstream. Do not optimize for them unless the product requirement changes.
- Adding canonical facet keys without updating result normalization will create false confidence: adapters can emit fields that never reach consolidation.
- Category breadcrumbs from distributors may not match internal taxonomy. Store raw breadcrumbs as source evidence; let existing consolidation/taxonomy validation resolve canonical categories.
- Regex-derived pet facets can be wrong for non-pet products. Use profile-neutral extraction only when source labels are explicit; otherwise keep heuristics conservative and backed by tests.
