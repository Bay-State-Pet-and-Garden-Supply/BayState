# ShopSite Mapping Updates for Retail Taxonomy

## Files Modified

### 1. `apps/web/lib/facets/category-mapping.ts`

Rewrote entire `SHOPSITE_CATEGORY_MAPPING` object. Every slug value changed.

**Department renames applied:**
- `bird-*` → `pet-bird-*` (Pet Bird department)
- `fish-aquatics-*` → `fish-aquarium-*` (Fish & Aquarium department)
- `reptile-*` → `reptile-amphibian-*` (Reptile & Amphibian department)
- `wild-bird-*` → `wild-bird-wildlife-*` (Wild Bird & Wildlife department)
- `home-*` → `home-heating-*` (Home & Heating department)

**Farm Animal split:**
- Chicken-related → `chicken-poultry-*`
- Horse-related → `horse-*`
- Livestock/general → `farm-livestock-*`

**Dog slug corrections:**
- `dog-beds-crates-beds` → `dog-beds-furniture`
- `dog-beds-crates-crates-kennels` → `dog-crates-kennels-gates`
- `dog-bowls-feeding-supplies` → `dog-bowls-feeders`
- `dog-walk-train-collars` → `dog-collars-leashes-harnesses`
- `dog-walk-train-training-behavior` → `dog-training-behavior`
- `dog-waste-cleanup` → `dog-cleaning-potty`
- `dog-toys-plush-squeaky-toys` → `dog-toys`
- All treat/chew variants → `dog-treats-chews`
- `dog-clothing` → `dog-apparel`

**Cat slug corrections:**
- `cat-litter-housebreaking` → `cat-litter`
- `cat-litter-housebreaking-litter-boxes-accessories` → `cat-litter-boxes-accessories`
- `cat-scratchers-furniture-scratchers` → `cat-trees-scratchers-furniture`
- `cat-scratchers-furniture` → `cat-trees-scratchers-furniture`
- `cat-health-wellness-flea-tick` → `cat-flea-tick`

**Small Pet corrections:**
- `small-pet-health-wellness-grooming` → `small-pet-health-grooming`
- `small-pet-habitats-accessories` → `small-pet-cages-habitats`
- `small-pet-health-wellness` → `small-pet-health-grooming`
- `small-pet-hay-forage` → `small-pet-hay`
- `small-pet-treats-chews-treats` → `small-pet-treats-chews`
- `small-pet-treats-chews` → `small-pet-toys-enrichment`

**Lawn & Garden simplified:**
- `lawn-garden-pest-weed-control-animal-repellents` → `lawn-garden-pest-weed-control`
- `lawn-garden-fertilizers-plant-food` → `lawn-garden-fertilizer`
- `lawn-garden-gardening-tools` → `lawn-garden-garden-tools`
- `lawn-garden-grass-seed-lawn-repair-grass-seed` → `lawn-garden-grass-seed`
- `lawn-garden-planters-seed-starting-seed-starting` → `lawn-garden-garden-seeds-plants`
- `lawn-garden-soil-mulch-compost` → la`wn-garden-soil-mulch-compost`
- `lawn-garden-pest-weed-control-weed-control` → `lawn-garden-pest-weed-control`

**Horse corrections:**
- `farm-animal-horse-feed` → `horse-feed`
- `farm-animal-horse-treats` → `horse-treats`
- `farm-animal-horse-fly-control` → `horse-fly-control`
- `farm-animal-horse-supplements` → `horse-health-supplements`
- `farm-animal-livestock-health-dewormers` → `horse-health-supplements`
- `farm-animal-livestock-health-wound-care` → `horse-health-supplements`
- `farm-animal-livestock-health-hoof-care` → `horse-grooming`
- `farm-animal-livestock-health` → `horse`

**Livestock/Farm corrections:**
- `farm-animal-livestock-waterers-feeders` → `farm-livestock-feeders-waterers`
- `farm-animal-livestock-fencing-gates` → `farm-livestock-handling-fencing`
- `farm-animal-chicken-coop-supplies` → `chicken-poultry-coops-runs`
- `farm-animal-chicken` → `chicken-poultry`
- `farm-animal-chicken-feed` → `chicken-poultry-feed`
- `farm-animal-chicken-treats-supplements` → `chicken-poultry-treats`
- `farm-animal-goat-sheep-supplements` → `farm-livestock-supplements-minerals`
- `farm-animal-goat-sheep-feed` → `farm-livestock-treats`
- `farm-animal-goat-sheep` → `farm-livestock`

**Unchanged:** `getMappedCategorySlug()` function signature and lowercase cache logic.

### 2. `apps/web/lib/shopsite/mapping.ts`

Updated `inferShopSitePagesFromCategory()` to branch on new department names:

- **Dog treats** — also matches `mainCategory === 'dog'` with `subCategory?.includes('treat')` for "Dog > Treats & Chews" breadcrumbs
- **Horse** — also matches bare `mainCategory === 'horse'` for the new Horse department (was only matching "horse feed" or "horse treats")
- **Wild bird** — broadened from `'wild bird food'` to `'wild bird'` (new breadcrumb: "Wild Bird & Wildlife")
- **Pet bird** — also matches `'pet bird'` alongside legacy `'caged bird'`
- **Chicken/Poultry** — new branch matching bare `'chicken'` or `'poultry'` categories → `Farm Animal Chicken & Poultry` ShopSite page
- **Farm/Livestock** — broadened to also match `'farm'` and `'livestock'` alongside legacy `'barn supplies'`
- **Home/Heating** — new branch matching `'home'` or `'heating'` → `Home Shop All` / `Heating` pages
- **Tools/Hardware** — new branch matching `'tool'` or `'hardware'` → `Hardware` ShopSite page

**Unchanged:** ShopSite page output strings (`SHOPSITE_PAGES`), function signature.

### 3. `apps/web/lib/shopsite/constants.ts`

**No changes.** `SHOPSITE_PAGES` is a list of ShopSite store destination pages, not taxonomy categories. These haven't changed. `SHOPSITE_FIELD_MAP` and `GENERIC_FACET_FIELDS` also unchanged.

## Verification

- Category-mapping.ts: brace balance 0 (64 open, 64 close)
- Mapping.ts: brace balance 0 (463 open, 463 close)
- No stale old slug patterns (`farm-animal-`, `bird-food`, `fish-aquatics`) remain in slug values
- All wildcard handlers present (36 entries, matching original count)
- `getMappedCategorySlug()` function unchanged
