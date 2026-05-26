# Research: BayState Taxonomy Overhaul — Codebase Discovery Document

## 1. Current Categories Table Schema

**File:** `apps/web/supabase/migrations/20260101001000_modern_ecommerce_schema.sql`

```sql
CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    display_order int DEFAULT 0,
    image_url text,
    is_featured boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

### What's missing vs the recommendation

| Missing Column | Why Needed |
|---|---|
| `department_key` text | Identifies which top-level department a category belongs to (e.g. 'dog', 'horse', 'lawn-garden') |
| `depth` int | Cached depth (0=L1, 1=L2, 2=L3). Currently computed in-memory by `buildTaxonomyNodes()` |
| `breadcrumb` text | Cached full breadcrumb string (e.g. "Dog > Food > Dry Food"). Currently computed in-memory |
| `facet_profile` text | References the facet profile for AI enrichment (e.g. 'animal_food', 'animal_health_wellness') |
| `seo_title` text | Custom meta title for category pages |
| `seo_description` text | Custom meta description for category pages |
| `synonym_keywords` text[] | Alternate search terms for category matching |

**Current indexes:** Only `idx_categories_parent_id` on `parent_id`. Missing indexes on `slug` (already unique so implicitly indexed), `department_key`, `depth`.

### Current `product_categories` table

```sql
CREATE TABLE IF NOT EXISTS product_categories (
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);
```

**Missing:** `relationship_type` column to distinguish canonical vs secondary vs collection placements. Currently every placement is equal — no way to say "this lives in Dog > Treats > Dental Treats primarily, but also appears in Dog > Health & Wellness > Dental Care."

**RLS:** Both tables have public read, admin/staff write policies. Good as-is.

---

## 2. Current Facet Definitions

**File:** `apps/web/supabase/migrations/20260404120000_normalize_corrected_product_facets.sql`

The migration `INSERT`s 10 facet definitions:

| # | name | slug | Source Field |
|---|---|---|---|
| 1 | `lifestage` | `lifestage` | ProductField18 |
| 2 | `pet_size` | `pet-size` | ProductField19 |
| 3 | `special_diet` | `special-diet` | ProductField20 |
| 4 | `health_feature` | `health-feature` | ProductField21 |
| 5 | `food_form` | `food-form` | ProductField22 |
| 6 | `flavor` | `flavor` | ProductField23 |
| 7 | `product_feature` | `product-feature` | ProductField26 |
| 8 | `size` | `size` | ProductField27 |
| 9 | `color` | `color` | ProductField29 |
| 10 | `packaging_type` | `packaging-type` | ProductField30 |

### Supporting tables

```sql
CREATE TABLE IF NOT EXISTS public.facet_values (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    facet_definition_id uuid NOT NULL REFERENCES public.facet_definitions(id) ON DELETE CASCADE,
    value text NOT NULL,
    normalized_value text NOT NULL,
    slug text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT facet_values_facet_definition_id_normalized_value_key
        UNIQUE (facet_definition_id, normalized_value)
);

CREATE TABLE IF NOT EXISTS public.product_facets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    facet_value_id uuid NOT NULL REFERENCES public.facet_values(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_facets_product_id_facet_value_id_key
        UNIQUE (product_id, facet_value_id)
);
```

### New facets needed (not added)

Per the recommendation, these new definitions need to be added:

| New Facet | Suggested Slug | Purpose |
|---|---|---|
| `animal_type` | `animal-type` | Universal across all animal products |
| `life_stage` (expand) | `life-stage` | Add `chick`, `layer`, `starter/grower` |
| `breed_size` | `breed-size` | Separate from `pet_size` (small/med/large/giant) |
| `food_form` (expand) | `food-form` | Add `Pellet`, `Crumble`, `Flake`, `Seed Mix`, `Hay` |
| `primary_protein` | `primary-protein` | Separate from `flavor` for food products |
| `diet_type` | `diet-type` | Split from `special_diet` — Grain-Free, Limited Ingredient, etc. |
| `claims` | `claims` | Natural, Organic, Non-GMO, Made in USA |
| `treat_type` | `treat-type` | Biscuit, Dental Treat, Jerky, Chew, Lickable |
| `chew_duration` | `chew-duration` | Quick, Moderate, Long-Lasting |
| `litter_material` | `litter-material` | Clay, Crystal, Corn, Pine, Paper |
| `clumping` | `clumping` | Clumping, Non-Clumping |
| `toy_type` | `toy-type` | Plush, Chew, Fetch, Puzzle, Wand |
| `play_style` | `play-style` | Chewing, Fetching, Tugging |
| `durability` | `durability` | Light, Moderate, Tough, Extreme |
| `indoor_outdoor` | `indoor-outdoor` | For beds, kennels, pest control |
| `subscription_eligible` | `subscription-eligible` | Boolean for future subscriptions |
| `garden_product_type` | `garden-product-type` | Soil, Fertilizer, Seed, Pest Control, Tool |
| `season` | `season` | Spring, Summer, Fall, Winter |
| `organic` | `organic` | Boolean |
| `npk_ratio` | `npk-ratio` | 10-10-10, 24-0-6, etc. |
| `fuel_type` | `fuel-type` | Pellets, Coal, Firewood |
| `package_weight` | `package-weight` | Numeric normalized weight |
| `package_count` | `package-count` | 12 count, case of 24, 2 pack |

**Key gap:** The `facet_definitions` table has no `facet_profile` column or grouping mechanism. Currently all facets are flat. The recommendation introduces ~15 facet profiles that group related facets.

### Facet normalization helper

**File:** `apps/web/lib/facets/generic-normalization.ts`

Maps ProductField18-30 to the 10 current facet definitions. Field→facet mapping is hardcoded in `GENERIC_FACET_FIELDS`. New facets would need new source field mappings or a different extraction strategy.

---

## 3. Current Domain Classification

**File:** `apps/web/lib/consolidation/category-domain.ts`

### Current ProductDomain type (5 values)

```ts
export type ProductDomain =
    | 'pet_food'
    | 'pet_product'
    | 'garden'
    | 'hardware'
    | 'general';
```

### Current DetailField type (11 fields)

```ts
export type DetailField =
    | 'pet_type'
    | 'life_stage'
    | 'pet_size'
    | 'special_diet'
    | 'health_feature'
    | 'food_form'
    | 'flavor'
    | 'product_feature'
    | 'size'
    | 'color'
    | 'packaging_type';
```

### Current DOMAIN_APPLICABLE_FIELDS matrix

| Domain | pet_type | life_stage | pet_size | special_diet | health_feature | food_form | flavor | product_feature | size | color | packaging_type |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `pet_food` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pet_product` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| `garden` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| `hardware` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| `general` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |

### How `classifyProductDomain` works

Regex-based pattern matching on category breadcrumb. Priority order:
1. `PET_FOOD_CATEGORY_PATTERNS` — 25 regex patterns
2. `PET_PRODUCT_CATEGORY_PATTERNS` — 21 regex patterns
3. `GARDEN_CATEGORY_PATTERNS` — 17 regex patterns
4. `HARDWARE_CATEGORY_PATTERNS` — 11 regex patterns
5. Falls through to `'general'`

### Change needed: Replace 5 broad domains with ~15 facet profiles

The recommendation replaces this with a profile-based system:

| Recommended Profile | Example Products | Specific Facets Needed |
|---|---|---|
| `animal_food` | Dog food, cat food, bird food | protein, form, life stage, diet, weight |
| `animal_treats_chews` | Dog chews, cat treats, horse treats | texture, chew type, flavor, functional benefit |
| `animal_feed_farm` | Chicken feed, horse feed, livestock feed | species, feed type, life stage, form, protein |
| `animal_health_wellness` | Supplements, flea/tick, dewormers | condition, active ingredient, application |
| `animal_toys_enrichment` | Dog toys, cat toys, bird toys | toy type, material, durability, play style |
| `animal_habitat_containment` | Crates, cages, coops, tanks, terrariums | dimensions, capacity, material, species |
| `animal_litter_bedding` | Cat litter, small pet bedding, coop bedding | material, scent, clumping, absorbency |
| `grooming_cleaning` | Shampoos, brushes, stain removers | use case, scent, coat type, formula |
| `aquarium_equipment` | Filters, heaters, pumps, lights | tank size, wattage, media type, water type |
| `reptile_equipment` | UVB bulbs, heat lamps, substrate | species, wattage, bulb type, UVB strength |
| `garden_consumable` | Fertilizer, soil, seed, pest control | coverage, NPK, organic, target pest |
| `garden_equipment` | Tools, hoses, spreaders | material, dimensions, capacity |
| `home_heating` | Pellets, coal, fire starters | fuel type, weight, BTU |
| `hardware_tools` | Tools, cords, fasteners | material, dimensions, compatibility |
| `general` | Fallback | Only universal fields |

### Test file impact

**File:** `apps/web/lib/consolidation/__tests__/category-domain.test.ts`

Has test cases for each of the 5 current domains. Will need:
- Update `classifyProductDomain` tests for the new profile system
- Update `DOMAIN_APPLICABLE_FIELDS` tests
- Update `isFieldApplicable` tests
- Update `getApplicableFields` tests

---

## 4. Current ShopSite Category Mapping

**File:** `apps/web/lib/facets/category-mapping.ts`

### All 27 ShopSite top-level categories currently mapped

| Original Key | Lowercase Key | Slugs Currently Mapped To |
|---|---|---|
| `Barn Supplies` | `barn supplies` | `farm-animal-*` variants |
| `Caged Bird Food & Supplies` | `caged bird food & supplies` | `bird-*`, `bird-food-*` |
| `Cat Food` | `cat food` | `cat-food-*` |
| `Cat Supplies` | `cat supplies` | `cat-*` |
| `Dog Food` | `dog food` | `dog-food-*` |
| `Dog Supplies` | `dog supplies` | `dog-*` |
| `Dog Toys` | `dog toys` | `dog-toys-*` |
| `Dog Treats` | `dog treats` | `dog-treats-*` |
| `Farm Animal` | `farm animal` | `farm-animal-*` |
| `Fish Food` | `fish food` | `fish-aquatics-food` |
| `Fish Supplies` | `fish supplies` | `fish-aquatics-*` |
| `Horse Feed & Treats` | `horse feed & treats` | `farm-animal-horse-*` |
| `Horse Health & Wellness` | `horse health & wellness` | `farm-animal-*` |
| `Lawn & Garden` | `lawn & garden` | `lawn-garden-*` |
| `Reptile Food & Supplies` | `reptile food & supplies` | `reptile-*` |
| `Small Pet Food & Supplies` | `small pet food & supplies` | `small-pet-*` |
| `Wild Bird Food` | `wild bird food` | `wild-bird-seed-food-*` |
| `Wild Bird Supplies` | `wild bird supplies` | `wild-bird-*` |
| `Household` | `household` | `home-*` |
| `Farm Animal Sheep & Goat` | `farm animal sheep & goat` | `farm-animal-goat-sheep-*` |
| `Farm Animals` | `farm animals` | `farm-animal-*` |
| `Household Supplies` | `household supplies` | `home-*` |
| `Wildlife Food` | `wildlife food` | `wild-bird-seed-food` |
| `Dog Cleanup` | `dog cleanup` | `dog-waste-cleanup` |
| `horse grooming` | `horse grooming` | `farm-animal-livestock-*` |
| `outdoors` | `outdoors` | `home-*` |

### Change needed

The old slugs use a flat `animal-type` pattern (e.g. `farm-animal-chicken-feed`, `dog-food-wet-food`). The new 13-department taxonomy uses a hierarchical department-based pattern:

| New Department | Slug | Old Slug Pattern |
|---|---|---|
| `Dog` | `dog` | `dog-*` |
| `Cat` | `cat` | `cat-*` |
| `Small Pet` | `small-pet` | `small-pet-*` |
| `Pet Bird` | `pet-bird` | `bird-*` (rename from `bird` to `pet-bird`) |
| `Fish & Aquarium` | `fish-aquarium` | `fish-aquatics-*` (rename from `aquatics` to `aquarium`) |
| `Reptile & Amphibian` | `reptile-amphibian` | `reptile-*` |
| `Wild Bird & Wildlife` | `wild-bird-wildlife` | `wild-bird-*` |
| `Chicken & Poultry` | `chicken-poultry` | `farm-animal-chicken-*` (split from Farm Animal) |
| `Horse` | `horse` | `farm-animal-horse-*` (split from Farm Animal) |
| `Farm & Livestock` | `farm-livestock` | `farm-animal-*` (remaining after splits) |
| `Lawn & Garden` | `lawn-garden` | `lawn-garden-*` |
| `Home & Heating` | `home-heating` | `home-*` |
| `Tools & Hardware` | `tools-hardware` | none (new) |

**Key issue:** Every slug pattern reference in:
- `category-mapping.ts` (the entire mapping table)
- `shopsite/mapping.ts` `inferShopSitePagesFromCategory`
- `shopsite/constants.ts` `SHOPSITE_PAGES`
- Any storefront URL references

...would need updating to match the new taxonomy.

---

## 5. Current Taxonomy.ts — Interface + Tree Building

**File:** `apps/web/lib/taxonomy.ts`

### Current TaxonomyCategoryRecord

```ts
export interface TaxonomyCategoryRecord {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  description?: string | null;
  display_order?: number | null;
  image_url?: string | null;
  is_featured?: boolean | null;
}
```

**Missing fields from recommendation:** `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`.

### Current TaxonomyCategoryNode

```ts
export interface TaxonomyCategoryNode extends Omit<TaxonomyCategoryRecord, 'slug' | 'description' | 'display_order' | 'image_url' | 'is_featured'> {
  slug: string;
  description: string | null;
  display_order: number | null;
  image_url: string | null;
  is_featured: boolean | null;
  depth: number;
  breadcrumb: string;
  ancestor_ids: string[];
  ancestor_slugs: string[];
  ancestor_names: string[];
  is_leaf: boolean;
}
```

Note: `depth`, `breadcrumb`, `ancestor_ids`, `ancestor_slugs`, `ancestor_names`, and `is_leaf` are all **computed in-memory** by `buildTaxonomyNodes()`. The recommendation has these stored in the DB instead.

### Key functions

| Function | Purpose |
|---|---|
| `buildTaxonomyNodes(categories)` | Builds tree from flat records, computes depth/breadcrumb/ancestry/leaf status |
| `getLeafTaxonomyNodes(categories)` | Returns only leaf nodes (used by prompt-builder for LLM enum) |
| `resolveTaxonomySelections(values, categories)` | Matches breadcrumb strings to category records with fuzzy matching |
| `normalizeTaxonomyBreadcrumb(value)` | Standardizes breadcrumb separator spacing |
| `parseTaxonomyValues(value)` | Splits `|`-delimited taxonomy values, normalizes each |

**Change needed:** Add new fields to both interfaces. Optionally add computed `facet_profile` based on department context. If we store `depth` and `breadcrumb` in DB, the in-memory functions become fallbacks/caches rather than primary sources.

---

## 6. Current lib/types.ts Pet Types

**File:** `apps/web/lib/types.ts`

### Current types

```ts
export interface PetType {
  id: string;
  name: string;
  display_order: number;
  icon: string | null;
}

export type PetLifeStage = 'puppy' | 'kitten' | 'juvenile' | 'adult' | 'senior';
export type PetSizeClass = 'small' | 'medium' | 'large' | 'giant';
export type PetSpecialNeed =
  | 'grain-free'
  | 'sensitive-stomach'
  | 'weight-management'
  | 'high-protein'
  | 'limited-ingredient'
  | 'dental-care'
  | 'joint-support'
  | 'skin-coat';
```

### The internal `Category` interface (not exported)

```ts
interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  created_at: string;
}
```

This private `Category` interface is **missing**: `department_key`, `depth`, `breadcrumb`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `display_order`, `is_featured`, `updated_at`.

### Change needed

Expand `PetType` to include more animals (poultry, horse, livestock). The current types only cover dog, cat (and implied small pet, bird, fish, reptile). Expand `PetLifeStage` to include chick, layer, starter/grower for poultry. Add `PetBreedSize` or expand `PetSizeClass`.

---

## 7. Current Admin Categories Page

**File:** `apps/web/app/admin/categories/page.tsx`

### How it works

```tsx
export default async function AdminCategoriesPage() {
  const supabase = await createClient();
  const { data: categories, count } = await supabase
    .from('categories')
    .select('*', { count: 'exact' })
    .order('display_order')
    .order('name');

  return (
    <AdminPageShell>
      <AdminCategoriesClient
        initialCategories={(categories || []) as Category[]}
        totalCount={count || 0}
      />
    </AdminPageShell>
  );
}
```

### AdminCategoriesClient & CategoryModal

Imports `type Category` from `@/components/admin/categories/CategoryModal`. This is a client-side type that maps to the `categories` table columns. The component likely renders a tree view with CRUD operations.

### Categories Actions (`apps/web/app/admin/categories/actions.ts`)

```ts
const categorySchema = z.object({
    name: z.string().min(1, 'Name is required'),
    slug: z.string().min(1, 'Slug is required'),
    description: z.string().optional().nullable(),
    parent_id: z.string().optional().nullable(),
    display_order: z.coerce.number().default(0),
    image_url: z.string().optional().nullable(),
    is_featured: z.coerce.boolean().default(false),
});
```

**Missing from schema:** `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `depth`, `breadcrumb`.

### Change needed

The `categorySchema` in `actions.ts` needs expansion. The `AdminCategoriesClient` and `CategoryModal` need new form fields for:
- Department selector (dropdown of 13 departments)
- Facet profile selector (dropdown matching category to profile)
- SEO title / meta description fields
- Synonym keywords (tag-style input)
- Depth auto-computed from parent selection

### RLS note

Admin categories actions call `createClient()` (which uses `service_role`), not the public client, so RLS isn't a concern for the server actions.

---

## 8. Current Storefront Category Page

**File:** `apps/web/app/(storefront)/c/[...slug]/page.tsx`

### How category resolution works

Uses catch-all `[...slug]` route:

```ts
async function resolveCategory(slugSegments: string[]) {
  // Try the last segment first
  const lastSegment = slugSegments[slugSegments.length - 1];
  const category = await getCategoryBySlug(lastSegment);
  if (category) return category;

  // Fallback: join segments with hyphens
  if (slugSegments.length > 1) {
    const joinedSlug = slugSegments.join('-');
    return getCategoryBySlug(joinedSlug);
  }
  return null;
}
```

This supports both `/c/dog-food` and `/c/dog/food` — the latter only works if the joined slug `dog-food` matches. With the new taxonomy, we'll want proper hierarchical URLs like `/c/dog/food/dry-food` mapping to the full breadcrumb. This may need a different slug resolution strategy.

### Breadcrumb building

```ts
const categoryById = new Map(navCategories.map(c => [c.id, c]));
const breadcrumbTrail: Array<{ id: string; name: string; slug: string }> = [];
let currentCat = categoryById.get(category.id);
while (currentCat) {
  breadcrumbTrail.unshift({ id: currentCat.id, name: currentCat.name, slug: currentCat.slug });
  currentCat = currentCat.parent_id ? categoryById.get(currentCat.parent_id) : undefined;
}
```

Traverses parent chain in-memory. Works with flat slugs — would need to support hierarchical URL segments if we adopt `/c/dog/food/dry-food`.

### FacetSidebar usage

```tsx
<FacetSidebar
  brands={availableFilters.brands}
  petTypes={availableFilters.petTypes}
  categories={availableFilters.categories}
  stockStatuses={availableFilters.stockStatuses}
  dynamicFacets={availableFilters.dynamicFacets}
  activeCategorySlug={categorySlug}
  hasSpecialOrder={availableFilters.hasSpecialOrder}
/>
```

The sidebar receives `dynamicFacets` — these are determined by `getAvailableProductFilters` which queries `product_facets` joined with `facet_values` and `facet_definitions`. New facet definitions would automatically appear here once seeded and products are associated.

---

## 9. Current lib/products.ts — Filtering

**File:** `apps/web/lib/products.ts`

### ProductFilterOptions return type

```ts
interface ProductFilterOptions {
  brands: Array<{ id: string; name: string; slug: string; logo_url: string | null }>;
  petTypes: Array<{ id: string; name: string }>;
  categories: Array<{
    id: string; name: string; slug: string; parent_id: string | null;
    depth: number; breadcrumb: string; ancestor_slugs: string[];
    ancestor_names: string[]; is_leaf: boolean;
  }>;
  stockStatuses: Array<{ id: StorefrontVisibleStockStatus; label: string }>;
  dynamicFacets: FacetDefinition[];
  hasSpecialOrder: boolean;
}
```

### How category filtering works

`resolveCategoryIds()`:
1. Resolves `categorySlug` or `categoryId` to a single category ID
2. Fetches all categories
3. Recursively finds all descendant IDs (breadth-first set expansion)
4. Returns array of the target category + all descendants

This is used in `getFilteredProducts` and `getAvailableProductFilters` as a `category_filter:product_categories!inner(category_id)` join with `.in()` filter.

### How facets are resolved

`resolveFacetValueIds()` splits `facets` string param (e.g. `"food-form:dry,flavor:chicken"`), queries `facet_values` joined with `facet_definitions`, and returns matching facet value IDs. These are used as `facet_filter:product_facets!inner(facet_value_id)` join.

### Change needed

The `ProductFilterOptions.categories` type already includes `depth`, `breadcrumb`, `ancestor_slugs`, `ancestor_names`, `is_leaf` — these come from `buildTaxonomyNodes()` already. No big type changes needed, but if we add new facet profiles/definitions, the filtering logic will need to handle the new facet slugs.

The `FacetDefinition` type in `lib/facets.ts` (used for `dynamicFacets`) also needs no changes — it will pick up new definitions automatically.

---

## 10. Current lib/data.ts — getNavCategories

**File:** `apps/web/lib/data.ts`

### getNavCategories

```ts
export async function getNavCategories(): Promise<TaxonomyCategoryNode[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, display_order, image_url, is_featured')
    .order('display_order');

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  return buildTaxonomyNodes((data || []) as TaxonomyCategoryRecord[]);
}
```

Only selects 7 columns. If we add `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, we need to add them to this select (or at least `department_key` for nav filtering).

### getCategoryBySlug

```ts
export async function getCategoryBySlug(slug: string): Promise<TaxonomyCategoryRecord | null> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id, description, display_order, image_url, is_featured')
    .eq('slug', slug)
    .single();
  // ...
}
```

Same select expansion needed.

### Also affected: getPetTypesNav

```ts
export async function getPetTypesNav() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('pet_types')
    .select('id, name, icon, display_order')
    .order('display_order');
  // ...
}
```

May need to add new pet types for poultry, horse, livestock if not already present.

---

## 11. Consolidation Pipeline Impact

### Prompt builder (`lib/consolidation/prompt-builder.ts`)

Fetches leaf categories and includes them in the LLM system prompt as an enum:

```ts
export async function buildPromptContext(): Promise<ConsolidationPromptContext> {
    const categoryRecords = await getCategories();
    const categories = categoryRecords.map((category) => category.breadcrumb ?? category.name);

    cachedPromptContext = {
        systemPrompt: generateSystemPrompt(categories),
        categories,
    };
    // ...
}
```

**Impact:** After seeding the new taxonomy:
- The prompt will automatically include the new leaf categories (like `Dog > Treats & Chews > Dental Treats`)
- Old categories need to be removed or deprecated so the LLM doesn't pick them
- The 50-category cap in `generateSystemPrompt` may need adjustment — the new taxonomy has ~200+ leaf nodes

### Detail enrichment (`lib/consolidation/detail-enrichment.ts`)

Uses `classifyProductDomain` and `DOMAIN_APPLICABLE_FIELDS` to determine which fields to extract deterministically:

```ts
import { classifyProductDomain, isFieldApplicable, DOMAIN_APPLICABLE_FIELDS } from './category-domain';
```

**Impact:** When `category-domain.ts` is refactored to use facet profiles instead of 5 domains, `detail-enrichment.ts` will need updating to:
- Use the new profile system instead of `classifyProductDomain`
- Map profiles to which fields are extractable
- Update regex patterns for new categories

### Taxonomy validator (`lib/consolidation/taxonomy-validator.ts`)

```ts
export function validateCategory(value: string | undefined | null, validCategories: string[]): string {
    if (!value || typeof value !== 'string') {
        return validCategories[0] || '';
    }
    return findClosestMatch(value, validCategories);
}
```

Uses Levenshtein + substring + word-overlap matching to find the best match for LLM output against valid categories. **No changes needed** — this is generic and works with any category list.

### Consistency rules (`lib/consolidation/consistency-rules.ts`)

Doesn't directly reference categories. No changes needed.

---

## 12. Shopsite Export Impact

### `lib/shopsite/mapping.ts` — `inferShopSitePagesFromCategory`

```ts
export function inferShopSitePagesFromCategory(category: string | null): string[] {
  if (!category) return [];
  const segments = normalized.split(/\s*>\s*/).map(s => s.trim());
  const mainCategory = segments[0];
  const subCategory = segments.length > 1 ? segments[1] : null;
  
  if (mainCategory.includes('dog food')) {
    pages.push('Dog Food Shop All');
    // ...
  } else if (mainCategory.includes('horse feed') || mainCategory.includes('horse treats')) {
    // ...
  }
  // etc.
}
```

This function maps category breadcrumbs to ShopSite page names. It will need updating for the new taxonomy — the old mappings like `'barn supplies'`, `'caged bird'`, `'horse feed'` need to map to the new department names.

### `lib/shopsite/constants.ts` — SHOPSITE_PAGES

The valid ShopSite pages list. Would need updating if ShopSite pages are reorganized.

---

## 13. Migration: `20260404133000_drop_products_category_column.sql`

This migration dropped the `category_id` column from `products`. The recommendation's `canonical_category_id` on `products` would be a new column added back, but for a different purpose (canonical primary category, with secondary placements in `product_categories`).

---

## 14. Summary of ALL Changes Needed

### Database Migrations (ordered)

1. **Migration 1: Add columns to `categories`** — `department_key text`, `depth int`, `breadcrumb text`, `facet_profile text`, `seo_title text`, `seo_description text`, `synonym_keywords text[]`. Add indexes on `department_key`, `depth`.

2. **Migration 2: Add `relationship_type` to `product_categories`** — `relationship_type text NOT NULL DEFAULT 'canonical' CHECK (relationship_type IN ('canonical', 'secondary', 'collection'))`.

3. **Migration 3: Add `canonical_category_id` to `products`** — `canonical_category_id uuid REFERENCES categories(id) ON DELETE SET NULL`. Add index.

4. **Migration 4: New facet definitions** — INSERT new facet definitions: `animal_type`, `breed_size`, `primary_protein`, `diet_type`, `claims`, `treat_type`, `chew_duration`, `litter_material`, `clumping`, `toy_type`, `play_style`, `durability`, `indoor_outdoor`, `subscription_eligible`, `garden_product_type`, `season`, `organic`, `npk_ratio`, `fuel_type`, `package_weight`, `package_count`.

5. **Migration 5: Seed the new taxonomy** — INSERT all 13 departments as L1 categories, all L2 categories, all L3 categories with correct `parent_id`, `department_key`, `depth`, `breadcrumb`, `facet_profile`, `display_order`.

6. **Migration 6: Deprecate old categories** — Either delete old slug-based categories or mark them inactive.

### TypeScript Changes

7. **`lib/taxonomy.ts`**: Add `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords` to `TaxonomyCategoryRecord` and `TaxonomyCategoryNode`.

8. **`lib/types.ts`**: Expand `Category` interface, `PetLifeStage`, `PetSizeClass`, `PetSpecialNeed`. Add new pet types if needed.

9. **`lib/consolidation/category-domain.ts`**: Replace `ProductDomain` (5 values) with `FacetProfile` type (~15 values). Replace `DOMAIN_APPLICABLE_FIELDS` matrix with profile-specific field lists. Replace `classifyProductDomain` with `resolveFacetProfile`.

10. **`lib/consolidation/detail-enrichment.ts`**: Update to use new `FacetProfile` system instead of `ProductDomain`.

11. **`lib/facets/category-mapping.ts`**: Rewrite entire mapping table with new department slugs.

12. **`lib/shopsite/mapping.ts`**: Update `inferShopSitePagesFromCategory` for new taxonomy.

13. **`lib/data.ts`**: Update `getNavCategories` and `getCategoryBySlug` selects to include new columns.

14. **`lib/products.ts`**: Minor — the `ProductFilterOptions.categories` type and filtering logic should work as-is, but verify.

### Admin UI Changes

15. **`app/admin/categories/page.tsx`**: May need minor updates if `Category` type changes.

16. **`app/admin/categories/actions.ts`**: Expand `categorySchema` with new fields.

17. **Components**: `AdminCategoriesClient`, `CategoryModal` — add UI for department_key dropdown, facet_profile dropdown, SEO fields, synonym keywords.

### Storefront UI Changes

18. **`app/(storefront)/c/[...slug]/page.tsx`**: Optionally update URL resolution for hierarchical paths. Verify breadcrumb building still works.

19. **FacetSidebar**: Should handle new facets automatically via `dynamicFacets`.

### Tests

20. **`lib/consolidation/__tests__/category-domain.test.ts`**: Rewrite all test cases.

21. **Any integration tests that use hardcoded category slugs**.

### Data Migration

22. **Reclassify existing products**: Update `product_categories` to point from old category IDs to new category IDs. Update `products.canonical_category_id`.

23. **Migrate existing facet values**: Map old ShopSite facet fields to new facet definitions.

---

## 15. Key Risks & Dependencies

| Risk | Impact | Mitigation |
|---|---|---|
| Slug changes break existing URLs | 404s on stored links, SEO impact | Set up 301 redirects from old slugs to new, or keep old slug matching as fallback |
| LLM prompt exceeds context window | Consolidation fails | The 50-category cap in `generateSystemPrompt` may be too low for ~200+ leaf categories. May need hierarchical prompt strategy |
| ShopSite export incompatibility | Products fail to export | Update `inferShopSitePagesFromCategory` mapping before deploying to production |
| Existing product facets reference old definitions | Products lose filterability | Write migration to re-map old facet values to new definitions |
| Pet types table lacks horse/poultry/livestock | New departments have no pet type associations | Add new pet types to `pet_types` table (or use department-based pet type inference) |

---

## Sources

- Kept: `apps/web/supabase/migrations/20260101001000_modern_ecommerce_schema.sql` — base categories table
- Kept: `apps/web/supabase/migrations/20260404120000_normalize_corrected_product_facets.sql` — current facet definitions
- Kept: `apps/web/lib/consolidation/category-domain.ts` — current domain classification
- Kept: `apps/web/lib/facets/category-mapping.ts` — ShopSite→slug mapping table
- Kept: `apps/web/lib/taxonomy.ts` — taxonomy tree builder and types
- Kept: `apps/web/lib/types.ts` — core domain types including Category, PetType
- Kept: `apps/web/app/admin/categories/page.tsx` — admin categories page
- Kept: `apps/web/app/admin/categories/actions.ts` — category CRUD server actions with Zod schema
- Kept: `apps/web/app/(storefront)/c/[...slug]/page.tsx` — storefront category listing
- Kept: `apps/web/lib/products.ts` — filtered product queries and category resolution
- Kept: `apps/web/lib/data.ts` — getNavCategories, getCategoryBySlug
- Kept: `apps/web/lib/facets.ts` — getDynamicFacets
- Kept: `apps/web/lib/facets/generic-normalization.ts` — facet field mapping
- Kept: `apps/web/lib/consolidation/prompt-builder.ts` — LLM prompt with category enum
- Kept: `apps/web/lib/consolidation/detail-enrichment.ts` — deterministic field extraction
- Kept: `apps/web/lib/consolidation/taxonomy-validator.ts` — fuzzy category matching
- Kept: `apps/web/lib/consolidation/__tests__/category-domain.test.ts` — domain tests
- Kept: `apps/web/lib/shopsite/mapping.ts` — ShopSite page inference from categories
- Kept: `apps/web/supabase/migrations/20260404133000_drop_products_category_column.sql` — dropped old category_id

## Gaps

1. **AdminCategoriesClient and CategoryModal source** — these are compiled/located somewhere in `components/admin/categories/` but `find`/`bash` tools were unavailable to list the directory. The client component and modal type definition need to be located and modified.

2. **FacetSidebar component** (`components/storefront/facet-sidebar.tsx`) — not read in detail. It renders the `dynamicFacets` array; need to verify it handles new facet types correctly.

3. **Existing category data in production** — this research is based on schema only. Actual database contents (existing categories, their IDs, how products reference them) are unknown. A data audit is needed before migration.

4. **ShopSite export API types** — the `SHOPSITE_PAGES` list in `lib/shopsite/constants.ts` was not read. Need to verify compatibility with new taxonomy pages.

5. **Navigation component** — the storefront header nav tree that renders departments and L2 categories was not examined. May need updates for 13 departments.

## Suggested Next Steps

1. Locate and read `AdminCategoriesClient` and `CategoryModal` components
2. Read `FacetSidebar` component for facet rendering logic
3. Read storefront nav component that renders `getNavCategories()`
4. Read `lib/shopsite/constants.ts` for `SHOPSITE_PAGES` list
5. Audit current database categories and product associations
6. Design the full seed data SQL for the 13 departments + L2/L3
7. Begin implementation starting with database migrations
