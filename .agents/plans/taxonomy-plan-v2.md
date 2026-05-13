# Implementation Plan

## Goal
Replace BayState's current broad ecommerce taxonomy with a 13-department retail taxonomy, facet-profile classification, canonical/secondary product placement, safe legacy redirects, migrated facet data, and updated admin/import/storefront behavior.

## Tasks

1. **Task 1: Add a preflight taxonomy audit script**
   - File: `apps/web/supabase/audits/20260509125900_taxonomy_preflight_audit.sql`
   - Changes: Create a read-only SQL script that reports current category slugs, product counts by category, products with multiple categories, category slugs not covered by the legacy mapping table, current facet definition/value counts, and products missing categories.
   - Acceptance: Running the script on staging produces explicit counts for multi-category products and unmapped category slugs before any remap migration runs.

2. **Task 2: Add category metadata and active-state columns**
   - File: `apps/web/supabase/migrations/20260509130000_add_taxonomy_category_metadata.sql`
   - Changes: Add `department_key text`, `depth integer`, `breadcrumb text`, `facet_profile text`, `seo_title text`, `seo_description text`, `synonym_keywords text[] NOT NULL DEFAULT '{}'`, `sort_order integer`, and firm `is_active boolean NOT NULL DEFAULT true` to `public.categories`. Backfill `sort_order = display_order`; backfill `depth` and `breadcrumb` via recursive CTE. Add indexes for `department_key`, `depth`, `facet_profile`, `breadcrumb`, and `is_active`. Add check constraints for non-negative `depth`, slug-shaped `department_key`, and allowed `facet_profile` values.
   - Acceptance: Existing category rows have non-null `sort_order`, `synonym_keywords`, and `is_active`; recursive backfill gives each reachable category a `depth` and `breadcrumb`.

3. **Task 3: Add product-category relationship type, phase 1 only**
   - File: `apps/web/supabase/migrations/20260509130500_add_product_categories_relationship_type_phase1.sql`
   - Changes: Add `relationship_type text DEFAULT 'canonical'` to `public.product_categories`. Add a non-unique index on `(relationship_type)`. Do **not** add `NOT NULL`, check constraint, or partial unique canonical index yet.
   - Acceptance: Migration succeeds even when a product has multiple existing category rows; no uniqueness validation is attempted.

4. **Task 4: Add canonical category column to products**
   - File: `apps/web/supabase/migrations/20260509131000_add_products_canonical_category_id.sql`
   - Changes: Add nullable `canonical_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL` to `public.products`; add `idx_products_canonical_category_id`.
   - Acceptance: Products can store one canonical category without changing existing `product_categories` rows.

5. **Task 5: Expand facet definition schema and seed canonical facet definitions**
   - File: `apps/web/supabase/migrations/20260509131200_expand_retail_facet_schema_and_definitions.sql`
   - Changes: Add `is_deprecated boolean NOT NULL DEFAULT false` and `facet_profile text[] NOT NULL DEFAULT '{}'` to `public.facet_definitions`. Seed new facet definitions except `brand` because brand is already a dedicated table/filter. Include universal and profile facets: `size`, `package_weight`, `package_count`, `material`, `color`, `scent`, `dimensions`, `indoor_outdoor`, `subscription_eligible`, `animal_type`, `life_stage`, `breed_size`, `food_form`, `primary_protein`, `diet_type`, `claims`, `health_focus`, `treat_type`, `chew_duration`, `texture`, `rawhide_free`, `functional_benefit`, `litter_material`, `clumping`, `dust_level`, `tracking_control`, `absorbency`, `toy_type`, `play_style`, `durability`, `has_squeaker`, `garden_product_type`, `coverage_area`, `season`, `organic`, `target_pest`, `target_weed`, `grass_type`, `npk_ratio`, `application_method`, `active_ingredient`, `target_condition`, `feed_type`, `protein_percentage`, `fat_percentage`, `fuel_type`, `btu`, `tank_size`, `wattage`, `media_type`, `water_type`, `bulb_type`, `uvb_strength`, `capacity`, `compatibility`, `coat_type`, `formula`, `use_case`.
   - Acceptance: `facet_definitions` has canonical rows with `facet_profile` arrays; old rows remain active until Task 9 migrates product values.

6. **Task 6: Seed the 13-department taxonomy and missing pet types**
   - File: `apps/web/supabase/migrations/20260509131500_seed_retail_taxonomy_and_pet_types.sql`
   - Changes: Upsert L1 departments with fixed slugs: `dog`, `cat`, `small-pet`, `pet-bird`, `fish-aquarium`, `reptile-amphibian`, `wild-bird-wildlife`, `chicken-poultry`, `horse`, `farm-livestock`, `lawn-garden`, `home-heating`, `tools-hardware`. Upsert all recommended L2/L3 rows. Populate `department_key`, `depth`, `breadcrumb`, `facet_profile`, `sort_order`, `display_order`, `seo_title`, `seo_description`, `synonym_keywords`, `is_active = true`. Resolve parents by slug, never UUID literals. Upsert missing `pet_types` rows for Horse, Chicken/Poultry, Farm & Livestock, Wild Bird/Wildlife, Pet Bird, Small Pet, Fish, and Reptile/Amphibian if absent.
   - Acceptance: Query `select count(*) from categories where parent_id is null and is_active` returns 13; seeded L3 breadcrumbs match the recommendation; required `pet_types` rows exist.

7. **Task 7: Create and populate legacy slug redirects**
   - File: `apps/web/supabase/migrations/20260509131700_create_legacy_slug_redirects.sql`
   - Changes: Create `public.legacy_slug_redirects(old_slug text PRIMARY KEY, new_category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now())`. Populate old-to-new mappings from existing slug patterns, including `bird* -> pet-bird*`, `fish-aquatics* -> fish-aquarium*`, `reptile* -> reptile-amphibian*`, `wild-bird* -> wild-bird-wildlife*`, `farm-animal-chicken* -> chicken-poultry*`, `farm-animal-horse* -> horse*`, remaining `farm-animal* -> farm-livestock*`, and `home* -> home-heating*` or `tools-hardware*`. Include direct rows for `bird`, `fish-aquatics`, `farm-animal`, `farm-animal-horse-feed`, and `home`.
   - Acceptance: Every populated `new_category_id` references an active seeded category; representative old slugs resolve to expected new slugs.

8. **Task 8: Remap existing product categories and choose canonical rows**
   - File: `apps/web/supabase/migrations/20260509131800_remap_product_categories_to_retail_taxonomy.sql`
   - Changes: Use the same old-to-new mapping as `legacy_slug_redirects` to update `product_categories.category_id` to seeded category IDs. Remove duplicate `(product_id, category_id)` rows after remap. For each product, rank category rows by deepest `categories.depth`, leaf status where derivable, then `categories.sort_order`, then slug; set rank 1 to `relationship_type = 'canonical'` and all others to `secondary`. Backfill `products.canonical_category_id` from the canonical row. Set legacy categories not in the 13-department tree to `is_active = false` instead of deleting them.
   - Acceptance: No active product category points to an inactive legacy category; every product with at least one category row has exactly one canonical row and matching `products.canonical_category_id`.

9. **Task 9: Backfill product facets from deprecated definitions to canonical definitions**
   - File: `apps/web/supabase/migrations/20260509132000_backfill_canonical_product_facets.sql`
   - Changes: Copy facet values and `product_facets` associations from old definitions to new ones: `lifestage -> life_stage`, `pet_size -> breed_size`, `special_diet -> diet_type`, `health_feature -> health_focus`. Keep `flavor` as a display facet, and also copy protein-like flavor values to `primary_protein` for Chicken, Beef, Salmon, Turkey, Lamb, Duck, Venison, Pork, Fish, Rabbit, Bison, Tuna, Whitefish, Trout, Cod, Liver, Seafood, Shrimp, Herring, and Mixed Protein. Upsert target `facet_values`; insert target `product_facets`; dedupe with existing `(product_id, facet_value_id)` unique constraint. Mark old definitions `lifestage`, `pet_size`, `special_diet`, and `health_feature` as `is_deprecated = true`; keep `flavor` not deprecated.
   - Acceptance: Existing products with old facet associations gain equivalent canonical facet associations; deprecated facet definitions are hidden by later query updates; no duplicate `product_facets` rows.

10. **Task 10: Finalize product-category constraints after code update is deployed**
   - File: `apps/web/supabase/migrations/20260509139000_finalize_product_category_relationship_constraints.sql`
   - Changes: Add check constraint `relationship_type IN ('canonical', 'secondary', 'collection')`, update any nulls to `secondary`, set `relationship_type SET NOT NULL`, and create partial unique index `idx_product_categories_one_canonical_per_product ON public.product_categories(product_id) WHERE relationship_type = 'canonical'`. This migration must run only after Tasks 19-20 update import code to write `relationship_type` explicitly.
   - Acceptance: Constraint migration succeeds on staging; SQL check shows zero products with more than one canonical category.

11. **Task 11: Update taxonomy types and tree builder**
   - File: `apps/web/lib/taxonomy.ts`
   - Changes: Add category fields to `TaxonomyCategoryRecord` and `TaxonomyCategoryNode`: `department_key`, `depth`, `breadcrumb`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `sort_order`, `is_active`. Make `buildTaxonomyNodes()` prefer DB `depth`/`breadcrumb` when present while preserving computed fallbacks. Sort by `sort_order ?? display_order ?? 0`. Update `resolveTaxonomySelections()` to match `synonym_keywords`.
   - Acceptance: Existing function signatures remain unchanged; callers compile and receive new metadata.

12. **Task 12: Update shared and generated DB types**
   - Files: `apps/web/lib/types.ts`, `apps/web/types/supabase.ts`, `apps/web/lib/supabase/database.types.ts`
   - Changes: Expand/ export `Category` shape with new columns; add `CategoryRelationshipType = 'canonical' | 'secondary' | 'collection'`; expose `FacetProfile` if shared outside consolidation; expand `PetLifeStage` with `chick`, `layer`, `starter-grower`, `all-life-stages`; regenerate Supabase generated types after migrations.
   - Acceptance: TypeScript recognizes new columns in category, product, facet, redirect, and join tables.

13. **Task 13: Replace broad domains with facet profiles**
   - File: `apps/web/lib/consolidation/category-domain.ts`
   - Changes: Replace `ProductDomain` with `FacetProfile`: `animal_food`, `animal_treats_chews`, `animal_feed_farm`, `animal_health_wellness`, `animal_toys_enrichment`, `animal_habitat_containment`, `animal_litter_bedding`, `grooming_cleaning`, `aquarium_equipment`, `reptile_equipment`, `garden_consumable`, `garden_equipment`, `home_heating`, `hardware_tools`, `general`. Expand `DetailField` to match canonical facet fields, including `active_ingredient`, `target_condition`, `application_method`, `feed_type`, `protein_percentage`, `fat_percentage`, and `absorbency`. Export `FACET_PROFILE_APPLICABLE_FIELDS`. Replace `classifyProductDomain(category)` with `resolveFacetProfile(category, explicitFacetProfile?)`.
   - Function signature changes: `classifyProductDomain(category: string | null | undefined): ProductDomain` becomes `resolveFacetProfile(category: string | null | undefined, explicitFacetProfile?: string | null): FacetProfile`; `isFieldApplicable()` takes `FacetProfile`; `getApplicableFields(category, explicitFacetProfile?)` adds optional explicit profile.
   - Acceptance: Unit tests cover all 14 production profiles plus `general`.

14. **Task 14: Update detail enrichment for facet profiles**
   - Files: `apps/web/lib/consolidation/detail-enrichment.ts`, `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts`, `apps/web/lib/consolidation/__tests__/category-domain.test.ts`
   - Changes: Replace imports of `classifyProductDomain`, `ProductDomain`, and `DOMAIN_APPLICABLE_FIELDS` with `resolveFacetProfile`, `FacetProfile`, and `FACET_PROFILE_APPLICABLE_FIELDS`. Change enrichment result from `domain` to `facetProfile` and keep `domain` only as a temporary compatibility alias if downstream code needs it. Add deterministic extraction dictionaries for the expanded fields from Task 13.
   - Acceptance: `bun run web test -- lib/consolidation/__tests__/category-domain.test.ts lib/consolidation/__tests__/detail-enrichment.test.ts` passes.

15. **Task 15: Update facet fetching to hide deprecated facets and expose profile metadata**
   - File: `apps/web/lib/facets.ts`
   - Changes: Export `FacetValue`; add `description?: string | null`, `facet_profile?: string[] | null`, and `is_deprecated?: boolean` to `FacetDefinition`. Update `getDynamicFacets()` to select new columns and filter `.eq('is_deprecated', false)` for storefront facets.
   - Acceptance: Deprecated `lifestage`, `pet_size`, `special_diet`, and `health_feature` do not render in storefront filters after Task 9.

16. **Task 16: Update generic facet normalization to canonical definitions**
   - Files: `apps/web/lib/facets/generic-normalization.ts`, `apps/web/__tests__/lib/facets/normalization.test.ts`
   - Changes: Map ProductField18 to `life_stage`, ProductField19 to `breed_size`, ProductField20 to `diet_type`, ProductField21 to `health_focus`, ProductField22 to `food_form`, ProductField23 to `flavor`, ProductField26 to `product_feature`, ProductField27 to `size`, ProductField29 to `color`, ProductField30 to `packaging_type`. Do not map brand into facets.
   - Acceptance: Normalization tests expect canonical facet names and no hardcoded count of 10 definitions.

17. **Task 17: Update category data fetches and legacy redirect lookup**
   - File: `apps/web/lib/data.ts`
   - Changes: Expand `getNavCategories()` and `getCategoryBySlug(slug)` selects to include all new category columns and filter `is_active = true`. Add `getLegacyCategoryRedirectBySlug(slug: string): Promise<{ old_slug: string; category: TaxonomyCategoryRecord } | null>` that queries `legacy_slug_redirects` joined to active `categories`. Do not make `getCategoryBySlug()` return redirect responses; keep data functions pure.
   - Function signature changes: New exported `getLegacyCategoryRedirectBySlug`; existing signatures unchanged.
   - Acceptance: Active category fetches exclude inactive legacy rows; legacy redirect lookup returns target category for representative old slugs.

18. **Task 18: Update storefront category pages for 301 legacy redirects and SEO**
   - File: `apps/web/app/(storefront)/c/[...slug]/page.tsx`
   - Changes: Import `permanentRedirect` from `next/navigation` and `getLegacyCategoryRedirectBySlug()` from `lib/data`. In `resolveCategory()`, after direct slug and joined fallback fail, check legacy redirects for last segment and joined slug; return redirect target metadata. In page and metadata paths, issue 301 via `permanentRedirect(getCategoryUrl(target.slug))` when legacy match occurs. Prefer `category.seo_title` and `category.seo_description` in metadata. Keep current flat slug fallback.
   - Acceptance: `/c/bird`, `/c/fish-aquatics`, `/c/farm-animal`, `/c/farm-animal-horse-feed`, and `/c/home` redirect permanently to active new category URLs.

19. **Task 19: Update single-product import category writes**
   - File: `apps/web/lib/admin/migration/product-import.ts`
   - Changes: Update `replaceProductCategories(supabase, productId, categoryIds)` to load category depth/sort metadata, choose one canonical category (deepest, then lowest `sort_order`, then slug), delete prior rows for product, upsert canonical row with `relationship_type = 'canonical'`, upsert remaining rows with `relationship_type = 'secondary'`, and update `products.canonical_category_id` to the selected canonical category or null if no categories.
   - Function signature changes: Prefer unchanged signature; helper may fetch category metadata internally. If performance requires passing metadata, add internal helper only.
   - Acceptance: Single import of a product with multiple resolved categories stores exactly one canonical row and updates `products.canonical_category_id`.

20. **Task 20: Update batched import category writes**
   - File: `apps/web/lib/admin/migration/product-import-batched.ts`
   - Changes: Change `categoriesToInsert` row shape to include `relationship_type`. Fetch category records with `id, name, slug, depth, sort_order, parent_id` instead of only `id, name, slug`. For each product, choose canonical slug using deepest/lowest-sort rule, push canonical row and secondary rows separately, and bulk update `products.canonical_category_id` after product/category relation writes. Update `deleteAndInsertRelations()` typing for product category rows.
   - Acceptance: Batched import of a multi-category product does not rely on DB defaults and passes the future one-canonical unique index.

21. **Task 21: Update import/facet migration tests**
   - Files: `apps/web/__tests__/lib/admin/migration/contract-drift-regression.test.ts`, `apps/web/__tests__/lib/admin/migration/pet-type-direct-mapping.test.ts`, `apps/web/__tests__/lib/admin/migration/cross-sell-import.test.ts`
   - Changes: Remove assertions that assume exactly 10 generic facets. Add multi-category import regression that verifies one canonical row, secondary remaining rows, and `products.canonical_category_id` update. Add fixture rows for new pet types.
   - Acceptance: Focused migration/import tests pass with canonical relationship behavior.

22. **Task 22: Rewrite ShopSite-to-taxonomy slug mapping**
   - File: `apps/web/lib/facets/category-mapping.ts`
   - Changes: Update all `SHOPSITE_CATEGORY_MAPPING` return slugs to the new taxonomy. Major required changes: `bird-* -> pet-bird-*`, `fish-aquatics-* -> fish-aquarium-*`, `reptile-* -> reptile-amphibian-*`, `wild-bird-* -> wild-bird-wildlife-*`, `farm-animal-chicken-* -> chicken-poultry-*`, `farm-animal-horse-* -> horse-*`, remaining livestock to `farm-livestock-*`, `home-*` to `home-heating-*` or `tools-hardware-*`. Keep `getMappedCategorySlug(categoryName, productTypeName): string | null` unchanged.
   - Acceptance: Every slug returned by `getMappedCategorySlug()` exists in active seeded categories.

23. **Task 23: Update ShopSite page inference while keeping ShopSite page catalog stable**
   - Files: `apps/web/lib/shopsite/mapping.ts`, `apps/web/lib/shopsite/constants.ts`
   - Changes: Update `inferShopSitePagesFromCategory(category)` to branch on new L1/L2 names: `Pet Bird`, `Fish & Aquarium`, `Chicken & Poultry`, `Horse`, `Farm & Livestock`, `Home & Heating`, and `Tools & Hardware`. Keep `SHOPSITE_PAGES` stable unless ShopSite destination pages have actually changed.
   - Acceptance: New seeded breadcrumbs infer valid page names from `SHOPSITE_PAGES`.

24. **Task 24: Update category admin server actions with recursive metadata maintenance**
   - File: `apps/web/app/admin/categories/actions.ts`
   - Changes: Extend `categorySchema` with `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `sort_order`, and `is_active`. Compute `depth`, `breadcrumb`, and inherited/default `department_key` server-side from `parent_id`; do not trust client-provided derived fields. Keep `display_order` and `sort_order` synchronized. On update, if name/slug/parent/depth-affecting data changes, recursively recompute descendants' `depth`, `breadcrumb`, and `department_key`. Change `deleteCategory(id)` to soft-delete by setting `is_active = false` unless hard delete is explicitly needed.
   - Function signature changes: `createCategory(formData)`, `updateCategory(id, formData)`, and `deleteCategory(id)` stay unchanged.
   - Acceptance: Renaming or moving a parent category updates descendant breadcrumbs/depths; admin deletes hide categories from storefront.

25. **Task 25: Update admin category modal**
   - File: `apps/web/components/admin/categories/CategoryModal.tsx`
   - Changes: Extend exported `Category` interface and `categorySchema`. Add controls for 13 `department_key` options, 14 facet profiles plus `general`, SEO title, SEO description, synonyms comma/tag input, `sort_order`, and `is_active`. Show computed breadcrumb/depth preview based on selected parent. Submit new fields via `FormData`.
   - Acceptance: Admin can create/edit a category with department, profile, SEO, synonyms, and active status.

26. **Task 26: Update admin category tree UI**
   - Files: `apps/web/components/admin/categories/AdminCategoriesClient.tsx`, `apps/web/app/admin/categories/page.tsx`
   - Changes: Sort by `sort_order` then `display_order`; display `department_key`, `facet_profile`, active/inactive badge, and breadcrumb. Add search/filter by department and active status if the tree becomes too large. Page query should order by `sort_order` and `name`.
   - Acceptance: Admin tree remains usable with the full seeded taxonomy and inactive legacy rows.

27. **Task 27: Update storefront products/filter types for category metadata**
   - File: `apps/web/lib/products.ts`
   - Changes: Expand category filter option type with `department_key`, `facet_profile`, `sort_order`, `seo_title`, `seo_description`, and `is_active`. Ensure category queries filter inactive categories. Verify dynamic facets use non-deprecated facet definitions from `lib/facets.ts`.
   - Acceptance: Category filter options do not include inactive legacy categories or deprecated facet definitions.

28. **Task 28: Update navigation, URLs, settings, and sitemap**
   - Files: `apps/web/components/storefront/facet-sidebar.tsx`, storefront nav component under `apps/web/components/storefront/`, `apps/web/lib/urls.ts`, `apps/web/lib/settings.ts`, `apps/web/app/sitemap.ts`
   - Changes: Verify nav shows exactly 13 active departments. Update hardcoded links from old slugs (`bird`, `fish-aquatics`, `farm-animal`, `home`) to new slugs. Keep `getCategoryUrl(slug)` flat unless a separate hierarchical URL decision is approved. Exclude inactive legacy categories from sitemap.
   - Acceptance: Homepage/nav/sitemap link only to active new taxonomy slugs.

29. **Task 29: Update consolidation prompt scaling**
   - Files: `apps/web/lib/consolidation/prompt-builder.ts`, `apps/web/lib/consolidation/__tests__/prompt-builder.test.ts`
   - Changes: Ensure prompt context excludes inactive categories. Replace or raise the current leaf-category cap strategy so the new ~200-leaf taxonomy remains usable without exceeding provider context. Prefer compact grouped output by department/L2 plus leaf examples, or scoped leaf lists based on source category when available.
   - Acceptance: Prompt builder test confirms active new categories appear and inactive legacy categories do not.

30. **Task 30: Add legacy redirect and taxonomy regression tests**
   - Files: `apps/web/__tests__/lib/taxonomy.test.ts`, `apps/web/__tests__/app/category-redirects.test.ts` or nearest existing app-route test location, ShopSite tests under `apps/web/__tests__/lib/shopsite/` if present.
   - Changes: Test synonym matching in `resolveTaxonomySelections()`. Test representative legacy slugs redirect: `/c/bird`, `/c/fish-aquatics`, `/c/farm-animal`, `/c/farm-animal-horse-feed`, `/c/home`. Test ShopSite inferred pages from new breadcrumbs are valid constants.
   - Acceptance: Focused tests cover all 5 reviewer blockers.

31. **Task 31: Run validation commands**
   - File: none
   - Changes: Run focused tests first, then full web lint/test: `bun run web test -- lib/consolidation/__tests__/category-domain.test.ts lib/consolidation/__tests__/detail-enrichment.test.ts`, `bun run web test -- __tests__/lib/facets/normalization.test.ts`, relevant import/ShopSite tests, then `bun run web lint`.
   - Acceptance: Focused tests and lint pass; any migration smoke/audit outputs are reviewed before production.

## Files to Modify

- `apps/web/lib/taxonomy.ts` - add category metadata fields, DB-preferred depth/breadcrumb, synonym matching.
- `apps/web/lib/types.ts` - expand Category/Pet/relationship/profile types.
- `apps/web/types/supabase.ts` - regenerate/update DB types.
- `apps/web/lib/supabase/database.types.ts` - regenerate/update DB types.
- `apps/web/lib/consolidation/category-domain.ts` - replace domains with facet profiles.
- `apps/web/lib/consolidation/detail-enrichment.ts` - use profile-specific enrichment fields.
- `apps/web/lib/consolidation/prompt-builder.ts` - handle larger active taxonomy.
- `apps/web/lib/consolidation/__tests__/category-domain.test.ts` - profile test coverage.
- `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts` - profile/enrichment expectations.
- `apps/web/lib/consolidation/__tests__/prompt-builder.test.ts` - active category prompt expectations.
- `apps/web/lib/facets.ts` - expose profile/deprecated metadata and hide deprecated facets.
- `apps/web/lib/facets/generic-normalization.ts` - map ShopSite fields to canonical facet names.
- `apps/web/lib/facets/category-mapping.ts` - rewrite old slugs to new active category slugs.
- `apps/web/lib/data.ts` - expanded category selects and legacy redirect lookup.
- `apps/web/lib/products.ts` - category metadata/filter inactive/deprecated facets.
- `apps/web/app/(storefront)/c/[...slug]/page.tsx` - legacy 301 redirects and SEO metadata.
- `apps/web/lib/admin/migration/product-import.ts` - explicit canonical/secondary writes and canonical category update.
- `apps/web/lib/admin/migration/product-import-batched.ts` - batched canonical/secondary writes and canonical category update.
- `apps/web/lib/shopsite/mapping.ts` - infer ShopSite pages from new taxonomy.
- `apps/web/lib/shopsite/constants.ts` - keep page constants stable unless destinations change.
- `apps/web/app/admin/categories/actions.ts` - save new metadata and recursively update descendants.
- `apps/web/components/admin/categories/CategoryModal.tsx` - admin fields for profile/SEO/synonyms/active.
- `apps/web/components/admin/categories/AdminCategoriesClient.tsx` - display/sort/filter expanded taxonomy metadata.
- `apps/web/app/admin/categories/page.tsx` - order/query categories by new sort order.
- `apps/web/components/storefront/facet-sidebar.tsx` - verify non-deprecated dynamic facet rendering.
- Storefront nav component under `apps/web/components/storefront/` - show 13 active departments.
- `apps/web/lib/urls.ts` - update only if flat category URL helper needs legacy-aware target generation.
- `apps/web/lib/settings.ts` - replace old hardcoded category links.
- `apps/web/app/sitemap.ts` - exclude inactive legacy categories.
- `apps/web/__tests__/lib/facets/normalization.test.ts` - canonical facet expectations.
- `apps/web/__tests__/lib/admin/migration/contract-drift-regression.test.ts` - no exact-10 facet assumptions; canonical category checks.
- `apps/web/__tests__/lib/admin/migration/pet-type-direct-mapping.test.ts` - new pet type fixtures.
- `apps/web/__tests__/lib/admin/migration/cross-sell-import.test.ts` - import fixture updates.

## New Files

- `apps/web/supabase/audits/20260509125900_taxonomy_preflight_audit.sql` - read-only production/staging audit before remap.
- `apps/web/supabase/migrations/20260509130000_add_taxonomy_category_metadata.sql` - category metadata plus firm `is_active`.
- `apps/web/supabase/migrations/20260509130500_add_product_categories_relationship_type_phase1.sql` - additive relationship type without uniqueness.
- `apps/web/supabase/migrations/20260509131000_add_products_canonical_category_id.sql` - product canonical category FK.
- `apps/web/supabase/migrations/20260509131200_expand_retail_facet_schema_and_definitions.sql` - facet schema/profile/deprecated columns plus canonical facets.
- `apps/web/supabase/migrations/20260509131500_seed_retail_taxonomy_and_pet_types.sql` - 13-department taxonomy and pet type data.
- `apps/web/supabase/migrations/20260509131700_create_legacy_slug_redirects.sql` - redirect table and old-to-new slug mappings.
- `apps/web/supabase/migrations/20260509131800_remap_product_categories_to_retail_taxonomy.sql` - existing product category remap and canonical-row selection.
- `apps/web/supabase/migrations/20260509132000_backfill_canonical_product_facets.sql` - copy old product facet values to canonical definitions and mark old definitions deprecated.
- `apps/web/supabase/migrations/20260509139000_finalize_product_category_relationship_constraints.sql` - final NOT NULL/check/unique canonical constraints, run after code deploy.
- `apps/web/__tests__/app/category-redirects.test.ts` or nearest existing route-test path - representative old slug redirect tests.
- `apps/web/__tests__/lib/shopsite/taxonomy-page-inference.test.ts` if no current ShopSite test exists - new breadcrumb to ShopSite page validation.

## Dependencies

- Task 1 must run before Tasks 7-9 so unmapped production slugs are known.
- Tasks 2-5 are additive and should land before code starts using new fields.
- Task 6 depends on Task 2 and Task 5.
- Task 7 depends on Task 6 because redirect rows reference seeded category IDs.
- Task 8 depends on Tasks 3, 4, 6, and 7.
- Task 9 depends on Task 5.
- Tasks 19-20 must deploy before Task 10 finalizes unique canonical enforcement.
- Task 10 depends on Task 8 cleanup and Tasks 19-20 runtime write updates.
- Task 13 must precede Task 14.
- Task 15 depends on Task 5 and Task 9 to safely hide deprecated facets.
- Task 18 depends on Tasks 7 and 17.
- Task 24 depends on Task 2 metadata fields and must ship before admin users edit parent categories in production.
- Task 29 depends on Tasks 6, 11, and 17 so prompt context sees active new categories only.

## Risks

- Production may contain category slugs not present in code mappings. The preflight audit must be reviewed and the redirect/remap maps extended before Task 8.
- `facet_profile text[]` on `facet_definitions` is a pragmatic grouping field. If query needs become complex, a normalized `facet_profile_definitions` join table may be cleaner later.
- Slug redirects need real 301 behavior from the storefront page, not just silent fallback, or SEO/link equity is lost.
- Keeping `products.canonical_category_id` and canonical `product_categories` rows in sync relies on import/admin code. Consider a later DB trigger if drift appears.
- The final relationship constraint migration must not run before import code writes explicit relationship types.
- Prompt scaling may require product/source-category-aware category narrowing; a flat full leaf list may be too large.
- `brand` intentionally stays outside `facet_definitions`; adding it as a facet would duplicate existing brand filter behavior.
- Soft-deleted legacy categories must be excluded from public nav, sitemap, prompt categories, and filters consistently.
