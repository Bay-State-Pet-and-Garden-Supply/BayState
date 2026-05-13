# Implementation Plan

## Goal
Replace the current underpowered category/domain setup with a 13-department ecommerce taxonomy, canonical/secondary category placement, expanded facets, and facet-profile-driven consolidation.

## Tasks

1. **Workstream A1: Add category metadata migration**
   - File: `apps/web/supabase/migrations/20260509130000_add_taxonomy_category_metadata.sql`
   - Changes:
     - `ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS department_key text;`
     - `ADD COLUMN IF NOT EXISTS depth integer;`
     - `ADD COLUMN IF NOT EXISTS breadcrumb text;`
     - `ADD COLUMN IF NOT EXISTS facet_profile text;`
     - `ADD COLUMN IF NOT EXISTS seo_title text;`
     - `ADD COLUMN IF NOT EXISTS seo_description text;`
     - `ADD COLUMN IF NOT EXISTS synonym_keywords text[] NOT NULL DEFAULT '{}';`
     - `ADD COLUMN IF NOT EXISTS sort_order integer;`
     - Backfill `sort_order = display_order`, `depth`, and `breadcrumb` for existing rows using recursive CTE.
     - Add constraints: `depth >= 0`, `facet_profile` in the 14 production profiles plus `general`, and `department_key` slug format.
     - Add indexes: `idx_categories_department_key`, `idx_categories_depth`, `idx_categories_facet_profile`, `idx_categories_breadcrumb`.
     - Optional but recommended decision: add `is_active boolean NOT NULL DEFAULT true`; needed if legacy categories should be hidden instead of deleted. Workstream request omitted it, but original recommendation includes it.
   - Function signature changes: none.
   - Acceptance: migration runs cleanly on a copy of current DB; all existing categories have non-null `sort_order`, `depth`, `breadcrumb`, and `synonym_keywords`.

2. **Workstream A2: Add product-category relationship type migration**
   - File: `apps/web/supabase/migrations/20260509130500_add_product_categories_relationship_type.sql`
   - Changes:
     - Add `relationship_type text NOT NULL DEFAULT 'canonical'` to `public.product_categories`.
     - Add check constraint: `relationship_type IN ('canonical', 'secondary', 'collection')`.
     - Replace current primary key only if needed: keep existing `(product_id, category_id)` primary key; add index `idx_product_categories_relationship_type`.
     - Add partial unique index to enforce one canonical category per product in the join table: `CREATE UNIQUE INDEX ... ON product_categories(product_id) WHERE relationship_type = 'canonical';`.
   - Function signature changes: none.
   - Acceptance: existing rows default to `canonical`; duplicate canonical placement per product is impossible.

3. **Workstream A3: Add products canonical category migration**
   - File: `apps/web/supabase/migrations/20260509131000_add_products_canonical_category_id.sql`
   - Changes:
     - Add `canonical_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL` to `public.products`.
     - Add index `idx_products_canonical_category_id`.
     - Backfill from `product_categories` canonical relationship after Workstream B remap; if run before B, leave nullable and add a later backfill block in B.
   - Function signature changes: none.
   - Acceptance: products can hold a single canonical category while keeping secondary/collection placements in `product_categories`.

4. **Workstream B1: Seed 13-department taxonomy**
   - File: `apps/web/supabase/migrations/20260509131500_seed_retail_taxonomy.sql`
   - Changes:
     - Insert/upsert all top-level departments using fixed slugs and `department_key`:
       - `dog`, `cat`, `small-pet`, `pet-bird`, `fish-aquarium`, `reptile-amphibian`, `wild-bird-wildlife`, `chicken-poultry`, `horse`, `farm-livestock`, `lawn-garden`, `home-heating`, `tools-hardware`.
     - Insert/upsert every L2 and L3 from the recommendation under those departments.
     - Populate every row with: `name`, `slug`, `parent_id`, `department_key`, `depth`, `breadcrumb`, `facet_profile`, `sort_order`, `display_order`, `seo_title`, `seo_description`, `synonym_keywords`.
     - Use SQL value CTEs split by depth: `department_rows`, `level2_rows`, `level3_rows`; resolve parents by slug instead of hardcoded UUIDs.
     - Assign facet profiles by product family:
       - Food: `animal_food`; treats/chews: `animal_treats_chews`; farm feed: `animal_feed_farm`; health/flea/dewormer/supplements: `animal_health_wellness`; toys/enrichment: `animal_toys_enrichment`; crates/cages/coops/tanks/terrariums: `animal_habitat_containment`; litter/bedding/substrate: `animal_litter_bedding`; grooming/cleaning: `grooming_cleaning`; fish filters/heaters/pumps/lights: `aquarium_equipment`; reptile heat/UVB/habitats: `reptile_equipment`; soil/fertilizer/seed/pest consumables: `garden_consumable`; garden tools/hoses/spreaders: `garden_equipment`; heating fuel/stove/fireplace/winter fuel: `home_heating`; tools/hardware/electrical/plumbing/shop: `hardware_tools`; fallback: `general`.
   - Function signature changes: none.
   - Acceptance: `select count(*) from categories where parent_id is null` returns 13 active departments; L3 breadcrumbs match recommendation names.

5. **Workstream B2: Remap legacy slugs to new taxonomy**
   - File: `apps/web/supabase/migrations/20260509131500_seed_retail_taxonomy.sql`
   - Changes:
     - Add a `legacy_slug_map(old_slug, new_slug)` CTE covering all old slugs currently referenced by `apps/web/lib/facets/category-mapping.ts`, including:
       - `bird-*` -> `pet-bird-*`
       - `fish-aquatics-*` -> `fish-aquarium-*`
       - `farm-animal-chicken-*` -> `chicken-poultry-*`
       - `farm-animal-horse-*` -> `horse-*`
       - remaining `farm-animal-*` -> `farm-livestock-*`
       - `home-*` -> `home-heating-*` or `tools-hardware-*` where appropriate.
     - Update `product_categories.category_id` to mapped new category IDs.
     - Delete duplicate `(product_id, category_id)` rows after remap.
     - Set one canonical row per product: prefer existing leaf-category mapping, then deepest category, then first by sort order.
     - Backfill `products.canonical_category_id` from the canonical join row.
     - Legacy category handling:
       - If A1 adds `is_active`, set unmapped old rows to `is_active = false`.
       - If `is_active` is not approved, delete legacy categories only after all product references are moved.
   - Function signature changes: none.
   - Acceptance: no `product_categories.category_id` points to a legacy slug; every product with any category has `products.canonical_category_id`.

6. **Workstream D1: Add expanded facet definitions migration**
   - File: `apps/web/supabase/migrations/20260509132000_expand_retail_facet_definitions.sql`
   - Changes:
     - Upsert new `facet_definitions` rows for universal facets: `brand`, `size`, `package_weight`, `package_count`, `material`, `color`, `scent`, `dimensions`, `indoor_outdoor`, `subscription_eligible`.
     - Upsert animal food/feed facets: `animal_type`, `life_stage`, `breed_size`, `food_form`, `primary_protein`, `diet_type`, `claims`, `health_focus`.
     - Upsert treats/chews facets: `treat_type`, `chew_duration`, `texture`, `rawhide_free`, `functional_benefit`.
     - Upsert cat litter facets: `litter_material`, `clumping`, `dust_level`, `tracking_control`.
     - Upsert toy facets: `toy_type`, `play_style`, `durability`, `has_squeaker`.
     - Upsert garden facets: `garden_product_type`, `coverage_area`, `season`, `organic`, `target_pest`, `target_weed`, `grass_type`, `npk_ratio`, `application_method`.
     - Upsert equipment/home/hardware facets: `fuel_type`, `btu`, `tank_size`, `wattage`, `media_type`, `water_type`, `bulb_type`, `uvb_strength`, `capacity`, `compatibility`, `coat_type`, `formula`, `use_case`.
     - Keep old rows (`lifestage`, `pet_size`, `special_diet`, `health_feature`, `flavor`) during transition; optionally migrate values to `life_stage`, `breed_size`, `diet_type`, `health_focus`, `primary_protein` in a later cleanup migration.
   - Function signature changes: none.
   - Acceptance: `facet_definitions` contains all recommended facets and old facet filters still work until data remap is complete.

7. **Workstream D2: Update facet helpers and import mappings**
   - Files:
     - `apps/web/lib/facets.ts`
     - `apps/web/lib/facets/generic-normalization.ts`
     - `apps/web/lib/admin/migration/product-import.ts`
     - `apps/web/lib/admin/migration/product-import-batched.ts`
     - `apps/web/lib/shopsite/constants.ts`
     - `apps/web/__tests__/lib/facets/normalization.test.ts`
     - `apps/web/__tests__/lib/admin/migration/contract-drift-regression.test.ts`
     - `apps/web/__tests__/lib/admin/migration/pet-type-direct-mapping.test.ts`
     - `apps/web/__tests__/lib/admin/migration/cross-sell-import.test.ts`
   - Changes:
     - `FacetDefinition` stays compatible but export `FacetValue` instead of keeping it private if callers need typed values.
     - Add optional fields to `FacetDefinition`: `description?: string | null`, `profile_keys?: string[]` only if D1 adds profile metadata to the table. If not, leave flat.
     - Update `GENERIC_FACET_FIELDS` so current ShopSite ProductField mappings target new canonical names:
       - ProductField18 `lifestage` -> `life_stage`
       - ProductField19 `pet_size` -> `breed_size`
       - ProductField20 `special_diet` -> `diet_type`
       - ProductField21 `health_feature` -> `health_focus`
       - ProductField22 `food_form` stays `food_form`
       - ProductField23 `flavor` stays `flavor` for display, but enrichment should also infer `primary_protein`.
     - Update import code to upsert new facet definition names and not assume exactly 10 generic facets.
   - Function signature changes:
     - `getGenericFacetDefinition(field: GenericFacetField): GenericFacetDefinition` unchanged.
     - `normalizeGenericFacetValues(value: string | null | undefined): NormalizedGenericFacetValue[]` unchanged.
     - `normalizeGenericFacetValue(value: string | null | undefined): string | null` unchanged.
   - Acceptance: existing import tests pass after expectation updates; no test asserts exactly 10 generic facets.

8. **Workstream C1: Replace broad domains with facet profiles**
   - File: `apps/web/lib/consolidation/category-domain.ts`
   - Changes:
     - Replace `ProductDomain` with `FacetProfile`:
       - `animal_food`, `animal_treats_chews`, `animal_feed_farm`, `animal_health_wellness`, `animal_toys_enrichment`, `animal_habitat_containment`, `animal_litter_bedding`, `grooming_cleaning`, `aquarium_equipment`, `reptile_equipment`, `garden_consumable`, `garden_equipment`, `home_heating`, `hardware_tools`, `general`.
     - Expand `DetailField` to include all fields used by D1 facets where deterministic enrichment is expected.
     - Replace `DOMAIN_APPLICABLE_FIELDS` with `FACET_PROFILE_APPLICABLE_FIELDS: Record<FacetProfile, readonly DetailField[]>`.
     - Replace regex pattern groups with profile-specific classifiers matching new breadcrumbs.
     - Keep a deprecated alias only if needed by downstream code during transition: `export const DOMAIN_APPLICABLE_FIELDS = FACET_PROFILE_APPLICABLE_FIELDS` and `export type ProductDomain = FacetProfile`; remove after callers are migrated.
   - Function signature changes:
     - Remove/replace `classifyProductDomain(category: string | null | undefined): ProductDomain` with `resolveFacetProfile(category: string | null | undefined, explicitFacetProfile?: string | null): FacetProfile`.
     - Change `isFieldApplicable(domain: ProductDomain, field: DetailField): boolean` to `isFieldApplicable(profile: FacetProfile, field: DetailField): boolean`.
     - Change `getApplicableFields(category: string | null | undefined): readonly DetailField[]` to `getApplicableFields(category: string | null | undefined, explicitFacetProfile?: string | null): readonly DetailField[]`.
   - Acceptance: profile classifier returns the expected profile for representative categories in every department.

9. **Workstream C2: Update detail enrichment to profile vocabulary**
   - Files:
     - `apps/web/lib/consolidation/detail-enrichment.ts`
     - `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts`
     - `apps/web/lib/consolidation/__tests__/category-domain.test.ts`
   - Changes:
     - Imports change from `classifyProductDomain`, `ProductDomain`, `DOMAIN_APPLICABLE_FIELDS` to `resolveFacetProfile`, `FacetProfile`, `FACET_PROFILE_APPLICABLE_FIELDS`.
     - `EnrichmentResult` changes field `domain: ProductDomain` to `facetProfile: FacetProfile`.
     - Optionally keep `domain?: FacetProfile` as a deprecated compatibility mirror if batch-service or UI output reads it.
     - Add source aliases and pattern dictionaries for new fields: `animal_type`, `breed_size`, `primary_protein`, `diet_type`, `claims`, `treat_type`, `chew_duration`, `texture`, `functional_benefit`, `litter_material`, `clumping`, `toy_type`, `play_style`, `durability`, `garden_product_type`, `season`, `organic`, `target_pest`, `npk_ratio`, `fuel_type`, `wattage`, `tank_size`.
     - Update tests from 5 domains to 14 production profiles plus `general` fallback.
   - Function signature changes:
     - `enrichProductDetails(input: EnrichmentInput): EnrichmentResult` unchanged externally, but returned object changes from `{ domain }` to `{ facetProfile }`.
   - Acceptance: `bun run web test -- lib/consolidation/__tests__/category-domain.test.ts lib/consolidation/__tests__/detail-enrichment.test.ts` passes.

10. **Workstream E1: Update ShopSite-to-taxonomy slug mapping**
    - File: `apps/web/lib/facets/category-mapping.ts`
    - Changes:
      - Rewrite `SHOPSITE_CATEGORY_MAPPING` values to target new slugs.
      - Required major slug changes:
        - `bird-*` -> `pet-bird-*`
        - `fish-aquatics-*` -> `fish-aquarium-*`
        - `reptile-*` -> `reptile-amphibian-*`
        - `wild-bird-*` -> `wild-bird-wildlife-*`
        - `farm-animal-chicken-*` -> `chicken-poultry-*`
        - `farm-animal-horse-*` -> `horse-*`
        - remaining livestock -> `farm-livestock-*`
        - `home-*` -> `home-heating-*` or `tools-hardware-*`.
      - Keep `getMappedCategorySlug(categoryName, productTypeName): string | null` signature unchanged.
    - Function signature changes: none.
    - Acceptance: every mapping slug exists in seeded categories; no mapping returns a deleted legacy slug.

11. **Workstream E2: Update ShopSite page inference and constants**
    - Files:
      - `apps/web/lib/shopsite/mapping.ts`
      - `apps/web/lib/shopsite/constants.ts`
      - Related ShopSite tests if present under `apps/web/__tests__/lib/shopsite/`.
    - Changes:
      - Update `inferShopSitePagesFromCategory(category: string | null): string[]` to branch on new L1 departments and L2 names.
      - Preserve outputs to current `SHOPSITE_PAGES` strings unless ShopSite itself is being reorganized.
      - Update `SHOPSITE_PAGES` only if new ShopSite destination pages exist; otherwise keep legacy ShopSite page catalog and only update inference logic.
      - Add cases for `Pet Bird`, `Fish & Aquarium`, `Chicken & Poultry`, `Farm & Livestock`, `Home & Heating`, `Tools & Hardware`.
    - Function signature changes: none.
    - Acceptance: category breadcrumbs from the new seed map to valid values in `SHOPSITE_PAGES`.

12. **Workstream F1: Update taxonomy types and tree builder**
    - File: `apps/web/lib/taxonomy.ts`
    - Changes:
      - Add to `TaxonomyCategoryRecord`: `department_key?: string | null`, `depth?: number | null`, `breadcrumb?: string | null`, `facet_profile?: string | null`, `seo_title?: string | null`, `seo_description?: string | null`, `synonym_keywords?: string[] | null`, `sort_order?: number | null`.
      - Add to `TaxonomyCategoryNode`: normalized non-optional versions of the same fields where useful.
      - Update `buildTaxonomyNodes()` to prefer DB-provided `depth` and `breadcrumb` when present but still compute fallback values from parent chain.
      - Sort by `sort_order ?? display_order ?? 0`, then depth, then breadcrumb.
      - Update `resolveTaxonomySelections()` to also match `synonym_keywords`.
    - Function signature changes:
      - `buildTaxonomyNodes(categories: TaxonomyCategoryRecord[]): TaxonomyCategoryNode[]` unchanged.
      - `getLeafTaxonomyNodes(categories: TaxonomyCategoryRecord[]): TaxonomyCategoryNode[]` unchanged.
      - `resolveTaxonomySelections(values: string[], categories: TaxonomyCategoryRecord[]): { matched: TaxonomyCategoryNode[]; unresolved: string[] }` unchanged.
    - Acceptance: existing callers compile; taxonomy nodes include new metadata.

13. **Workstream F2: Update shared types and generated Supabase types**
    - Files:
      - `apps/web/lib/types.ts`
      - `apps/web/types/supabase.ts`
      - `apps/web/lib/supabase/database.types.ts`
    - Changes:
      - Expand `Category` interface with new category columns and `updated_at`.
      - Export `Category` if needed by category/admin/storefront components instead of duplicating local category types.
      - Expand `PetLifeStage` with `chick`, `layer`, `starter-grower`, `all-life-stages`.
      - Add or update type aliases for `FacetProfile`, `CategoryRelationshipType = 'canonical' | 'secondary' | 'collection'` if shared outside consolidation.
      - Regenerate Supabase types after migrations or update generated files consistently.
    - Function signature changes: none.
    - Acceptance: `bun run web build` type-check phase sees new DB columns and no stale generated type errors.

14. **Workstream F3: Update category data fetches**
    - Files:
      - `apps/web/lib/data.ts`
      - `apps/web/lib/products.ts`
      - `apps/web/app/(storefront)/c/[...slug]/page.tsx`
    - Changes:
      - Expand `getNavCategories()` select to include new columns: `department_key, depth, breadcrumb, facet_profile, seo_title, seo_description, synonym_keywords, sort_order` and optionally `is_active`.
      - Expand `getCategoryBySlug(slug)` select with the same fields.
      - If `is_active` exists, filter public nav/category queries with `.eq('is_active', true)`.
      - Update storefront metadata to prefer `seo_title` and `seo_description`.
      - Optional URL improvement: change `resolveCategory(slugSegments)` to try exact hierarchical path by matching final segment plus ancestor slugs; keep current fallback for old `/c/dog-food` links.
      - Update `ProductFilterOptions.categories` in `lib/products.ts` to include `department_key`, `facet_profile`, `sort_order`, and SEO fields if used in UI.
    - Function signature changes:
      - `getNavCategories(): Promise<TaxonomyCategoryNode[]>` unchanged.
      - `getCategoryBySlug(slug: string): Promise<TaxonomyCategoryRecord | null>` unchanged.
      - `resolveCategory(slugSegments: string[])` remains local, but logic changes.
    - Acceptance: category pages render new breadcrumbs and SEO fields; old flat slug fallback still resolves during transition.

15. **Workstream G1: Update admin category server actions**
    - File: `apps/web/app/admin/categories/actions.ts`
    - Changes:
      - Extend `categorySchema` with `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `sort_order`.
      - Compute or validate `depth` and `breadcrumb` on server from selected parent; do not trust client-provided depth/breadcrumb.
      - Keep `display_order` and `sort_order` synchronized until old code is removed.
      - Parse `synonym_keywords` from comma/newline/tag string into `text[]`.
    - Function signature changes:
      - `createCategory(formData: FormData): Promise<ActionState>` unchanged.
      - `updateCategory(id: string, formData: FormData): Promise<ActionState>` unchanged.
      - `deleteCategory(id: string): Promise<ActionState>` unchanged.
    - Acceptance: admin-created categories receive correct department, depth, breadcrumb, profile, SEO, and synonym data.

16. **Workstream G2: Update admin category modal**
    - File: `apps/web/components/admin/categories/CategoryModal.tsx`
    - Changes:
      - Extend exported `Category` interface with new fields.
      - Extend local `categorySchema` and `CategoryFormValues` with new fields.
      - Add dropdown for `department_key` with 13 department keys.
      - Add dropdown for `facet_profile` with 14 production profile keys plus `general`.
      - Add SEO title and SEO description inputs.
      - Add synonym keyword input as comma-separated text or tag UI.
      - Show computed depth/breadcrumb preview based on selected parent; submit only fields server accepts.
      - Use `sort_order` label; continue submitting `display_order` for backward compatibility if needed.
    - Function signature changes:
      - `CategoryModal(props: CategoryModalProps)` unchanged.
      - `CategoryModalProps` type unchanged except `Category` shape.
    - Acceptance: modal can create/edit a new L3 category with facet profile and SEO fields.

17. **Workstream G3: Update admin category tree view**
    - Files:
      - `apps/web/components/admin/categories/AdminCategoriesClient.tsx`
      - `apps/web/app/admin/categories/page.tsx`
    - Changes:
      - Show `department_key`, `facet_profile`, `depth`, and `breadcrumb` in each row or secondary metadata line.
      - Sort tree by `sort_order ?? display_order`.
      - Add filter/search controls if category count is large after seed.
      - If `is_active` exists, show inactive legacy rows separately or hide by default.
      - Page query can keep `.select('*')`, but order by `sort_order` before `display_order` after migration.
    - Function signature changes:
      - `AdminCategoriesPage()` unchanged.
      - `AdminCategoriesClient({ initialCategories, totalCount })` unchanged.
    - Acceptance: admin category page remains usable with ~200 categories.

18. **Workstream H1: Update navigation and storefront consumers**
    - Files to locate/modify as needed:
      - Storefront header/nav component using `getNavCategories()` under `apps/web/components/storefront/` or `apps/web/app/(storefront)/`.
      - `apps/web/components/storefront/facet-sidebar.tsx`
      - `apps/web/lib/urls.ts`
      - `apps/web/lib/settings.ts`
      - `apps/web/app/sitemap.ts`
    - Changes:
      - Verify nav renders exactly 13 departments and does not surface legacy inactive categories.
      - Update any hardcoded links from old slugs: `bird`, `fish-aquatics`, `farm-animal`, `home` to new slugs.
      - `FacetSidebar` likely works unchanged, but update `CategorySummary` with `department_key`, `facet_profile`, `sort_order` if display/sorting needs them.
      - If hierarchical URLs are adopted, update `getCategoryUrl(slug)` or add `getCategoryUrl(category)` overload/helper; otherwise keep flat slug URLs.
    - Function signature changes:
      - Avoid changing `FacetSidebar` props unless needed; if changed, add optional fields only.
      - Avoid changing `getCategoryUrl(slug: string | null | undefined)` unless hierarchical URL decision is approved.
    - Acceptance: homepage/nav/category filters point to new department URLs and sitemap includes new categories.

19. **Workstream I1: Update prompt category scaling**
    - Files:
      - `apps/web/lib/consolidation/prompt-builder.ts`
      - `apps/web/lib/consolidation/__tests__/prompt-builder.test.ts`
    - Changes:
      - Audit current category cap in `generateSystemPrompt`; new taxonomy may exceed 200 leaf categories.
      - If cap remains 50, change prompt strategy to include departments/L2 plus ask model to choose best leaf from provided compact list or fetch category subset by source category.
      - Ensure prompt uses `breadcrumb` from seeded DB and excludes inactive legacy categories if `is_active` exists.
    - Function signature changes:
      - Prefer no exported signature changes. If needed, add optional `categoryLimit?: number` to internal helpers only.
    - Acceptance: consolidation prompt remains below provider context limits and includes enough taxonomy to choose recommended leaves.

20. **Workstream J1: Validation and regression tests**
    - Files:
      - `apps/web/lib/consolidation/__tests__/category-domain.test.ts`
      - `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts`
      - `apps/web/__tests__/lib/facets/normalization.test.ts`
      - `apps/web/__tests__/lib/admin/migration/contract-drift-regression.test.ts`
      - Any ShopSite tests under `apps/web/__tests__/lib/shopsite/`
    - Changes:
      - Add classifier tests for all 14 production facet profiles plus `general`.
      - Add remap tests for representative old slugs to new slugs.
      - Update import/facet tests for expanded generic facets and removed exactly-10 assertions.
      - Add SQL migration smoke checks if the project has migration test harness; otherwise document manual SQL checks.
    - Function signature changes: none.
    - Acceptance:
      - `bun run web test -- lib/consolidation/__tests__/category-domain.test.ts lib/consolidation/__tests__/detail-enrichment.test.ts`
      - `bun run web test -- __tests__/lib/facets/normalization.test.ts`
      - `bun run web lint`

## Files to Modify

- `apps/web/lib/consolidation/category-domain.ts` - replace broad domains with facet profiles and expanded field matrix.
- `apps/web/lib/consolidation/detail-enrichment.ts` - use `FacetProfile`, expanded detail fields, and new extractors.
- `apps/web/lib/consolidation/prompt-builder.ts` - ensure prompt handles larger seeded taxonomy.
- `apps/web/lib/consolidation/__tests__/category-domain.test.ts` - rewrite tests for facet profiles.
- `apps/web/lib/consolidation/__tests__/detail-enrichment.test.ts` - update result expectations from `domain` to `facetProfile` and new fields.
- `apps/web/lib/consolidation/__tests__/prompt-builder.test.ts` - update category prompt expectations if cap/format changes.
- `apps/web/lib/facets.ts` - expose/update facet types if new fields are needed.
- `apps/web/lib/facets/generic-normalization.ts` - map generic ShopSite fields to new canonical facet names.
- `apps/web/lib/facets/category-mapping.ts` - rewrite ShopSite category/product-type slug mapping to new taxonomy.
- `apps/web/lib/admin/migration/product-import.ts` - update facet definition assumptions and canonical names.
- `apps/web/lib/admin/migration/product-import-batched.ts` - update facet definition assumptions and canonical names.
- `apps/web/lib/shopsite/mapping.ts` - update `inferShopSitePagesFromCategory` for new breadcrumbs.
- `apps/web/lib/shopsite/constants.ts` - update generic facet constants and only update page catalog if ShopSite pages change.
- `apps/web/lib/taxonomy.ts` - add category metadata fields and synonym matching.
- `apps/web/lib/types.ts` - expand category, pet, relationship, and profile-facing types.
- `apps/web/types/supabase.ts` - regenerate/update generated DB types.
- `apps/web/lib/supabase/database.types.ts` - regenerate/update generated DB types.
- `apps/web/lib/data.ts` - select new category metadata and filter inactive rows if added.
- `apps/web/lib/products.ts` - expand category filter option type and verify new facets resolve.
- `apps/web/app/(storefront)/c/[...slug]/page.tsx` - use SEO metadata and optionally improve hierarchical slug resolution.
- `apps/web/components/storefront/facet-sidebar.tsx` - verify dynamic facets and optionally add metadata fields.
- `apps/web/lib/urls.ts` - update only if hierarchical category URLs are adopted.
- `apps/web/lib/settings.ts` - update hardcoded old category links.
- `apps/web/app/sitemap.ts` - ensure new active categories are indexed and old legacy categories are excluded if inactive.
- `apps/web/app/admin/categories/actions.ts` - accept/compute new category metadata.
- `apps/web/components/admin/categories/CategoryModal.tsx` - add fields for department, profile, SEO, synonyms, sort order.
- `apps/web/components/admin/categories/AdminCategoriesClient.tsx` - display/sort/filter new metadata.
- `apps/web/app/admin/categories/page.tsx` - update query ordering if `sort_order` is canonical.
- `apps/web/__tests__/lib/facets/normalization.test.ts` - update expected facet names.
- `apps/web/__tests__/lib/admin/migration/contract-drift-regression.test.ts` - remove exactly-10 facet assumption.
- `apps/web/__tests__/lib/admin/migration/pet-type-direct-mapping.test.ts` - update facet fixture generation.
- `apps/web/__tests__/lib/admin/migration/cross-sell-import.test.ts` - update facet fixture generation.

## New Files

- `apps/web/supabase/migrations/20260509130000_add_taxonomy_category_metadata.sql` - adds category metadata columns, constraints, indexes, and backfills.
- `apps/web/supabase/migrations/20260509130500_add_product_categories_relationship_type.sql` - adds canonical/secondary/collection relationship type.
- `apps/web/supabase/migrations/20260509131000_add_products_canonical_category_id.sql` - adds product canonical category FK.
- `apps/web/supabase/migrations/20260509131500_seed_retail_taxonomy.sql` - seeds 13-department taxonomy and remaps legacy slugs.
- `apps/web/supabase/migrations/20260509132000_expand_retail_facet_definitions.sql` - seeds expanded retail-grade facet definitions.

## Dependencies

- A1 must run before B1, F1, F3, and G1 because code needs new category columns.
- A2 and A3 must run before B2 because legacy product placement remap needs `relationship_type` and `canonical_category_id`.
- B1 must run before E1 validation because new mapping slugs need real category rows.
- D1 must run before D2 import/runtime changes are deployed.
- C1 must run before C2.
- F1/F2 should land with A migrations to keep TypeScript aligned with DB shape.
- G1 must land before G2 so the UI can save new fields.
- E2 depends on B1 category names/breadcrumbs.
- I1 depends on B1 and F3 so prompt context sees new category rows.
- J1 should run after C, D, E, and F are implemented.

## Risks

- `sort_order` duplicates existing `display_order`; keep both synced or explicitly migrate all code to `sort_order` in one PR.
- Workstream request omits `is_active`, but legacy hiding needs either `is_active`, deletion, or redirects. Need explicit choice before production migration.
- Recommendation says 14 facet profiles, but list includes 14 production profiles plus `general` fallback. Plan treats `general` as fallback, not production profile.
- Slug changes can break SEO and saved links. Need old-slug fallback or redirects before deployment.
- New taxonomy likely exceeds current prompt category cap. Prompt-builder may need a compact/hierarchical strategy.
- Facet definitions can be added without product values, but filters will stay sparse until import/enrichment populates `product_facets`.
- `relationship_type = canonical` plus `products.canonical_category_id` can drift. Add backfill checks and consider a DB trigger in a later hardening pass if drift appears.
- ShopSite page catalog may remain legacy even while storefront taxonomy changes. Do not rename `SHOPSITE_PAGES` unless ShopSite is actually reorganized.
- Generated Supabase type files may be overwritten by tooling; regenerate after migrations instead of hand-editing if possible.
- Admin category UI may become slow with ~200 nodes; add search/filter if manual QA shows degraded usability.
