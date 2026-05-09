# Taxonomy Overhaul — Migrations 1-2

## Created Files

### Task 1: Preflight Audit
- **File:** `apps/web/supabase/audits/20260509125900_taxonomy_preflight_audit.sql`
- **Purpose:** Read-only SQL report to baseline current state before remap
- **Queries:**
  1. Category inventory — total count, top-level count, full slug list
  2. Product counts — every category with product count, descending
  3. Multi-category products — products with >1 category, names + IDs
  4. Uncovered slugs — categories not matching any legacy mapping pattern
  5. Facet definition inventory — all current definitions
  6. Facet value counts — values per definition
  7. Uncategorized products — products with zero category assignments
- **Run:** Copy/paste into Supabase SQL editor (staging first, then production). Read-only, safe to run anytime.

### Task 2: Category Metadata Columns
- **File:** `apps/web/supabase/migrations/20260509130000_add_taxonomy_category_metadata.sql`
- **New columns on `public.categories`:**
  | Column | Type | Default | Notes |
  |---|---|---|---|
  | `department_key` | `text` | NULL | L1 department slug (e.g. 'dog', 'horse', 'lawn-garden') |
  | `depth` | `integer` | NULL | 0 = L1, 1 = L2, 2 = L3. Backfilled by recursive CTE |
  | `breadcrumb` | `text` | NULL | Full path (e.g. "Dog > Food > Dry Food"). Backfilled by recursive CTE |
  | `facet_profile` | `text` | NULL | Enrichment profile, constrained to 15 valid values |
  | `seo_title` | `text` | NULL | Custom meta title |
  | `seo_description` | `text` | NULL | Custom meta description |
  | `synonym_keywords` | `text[]` | `'{}'` | Alternate search terms |
  | `sort_order` | `integer` | NULL | Backfilled from `display_order`, then 0 |
  | `is_active` | `boolean` | `true` | Soft-delete/hide flag |
- **Backfill logic:**
  - `sort_order` ← `display_order` (fallback 0)
  - `depth` and `breadcrumb` computed by recursive CTE walking `parent_id` chain
  - Orphans (broken `parent_id` refs) get `depth=0`, `breadcrumb=name`
- **Indexes added (7):** `department_key`, `depth`, `facet_profile`, `breadcrumb`, `is_active`, `sort_order`
- **Check constraints:**
  - `depth >= 0`
  - `facet_profile` must be one of: `animal_food`, `animal_treats_chews`, `animal_feed_farm`, `animal_health_wellness`, `animal_toys_enrichment`, `animal_habitat_containment`, `animal_litter_bedding`, `grooming_cleaning`, `aquarium_equipment`, `reptile_equipment`, `garden_consumable`, `garden_equipment`, `home_heating`, `hardware_tools`, `general`, or NULL
- **Run order:** Run preflight audit first, then migration. Safe to re-run (IF NOT EXISTS).

## Next Tasks in Chain
- Task 3: `product_categories.relationship_type` — additive, no uniqueness yet
- Task 4: `products.canonical_category_id` — nullable FK to categories
- Task 5: Expanded `facet_definitions` schema + canonical facet seeds
- Task 6: Seed 13-department taxonomy + pet type data
