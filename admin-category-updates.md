# Admin Category Management Updates — Complete

## Files Modified

### 1. `apps/web/app/admin/categories/actions.ts`
- **Schema**: Added `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `sort_order`, `is_active` to `categorySchema`
- **Helpers**: `parseSynonyms()` — comma-separated → text[], `fetchParentMetadata()` — queries parent's depth/breadcrumb/department_key, `recomputeCategorySubtree()` — recursively updates descendants after name/parent change
- **createCategory**: Computes depth/breadcrumb from parent; inherits department_key from parent; parses synonyms; inserts all new fields
- **updateCategory**: Detects parent/name changes before update; recomputes descendant breadcrumbs/depths when change detected
- **deleteCategory**: Changed to soft-delete — sets `is_active = false` instead of deleting row

### 2. `apps/web/components/admin/categories/CategoryModal.tsx`
- **Category interface**: Extended with `department_key`, `facet_profile`, `seo_title`, `seo_description`, `synonym_keywords`, `sort_order`, `is_active`, `depth`, `breadcrumb`
- **Constants**: `DEPARTMENT_OPTIONS` (13 department keys), `FACET_PROFILE_OPTIONS` (15 profile values)
- **Schema**: Added all 7 new fields to form validation
- **Default values**: Maps from existing category data/falls back to sensible defaults (synonyms joined from array, is_active default true)
- **Form data**: All new fields appended in onSubmit
- **UI fields added** (between is_featured checkbox and DialogFooter):
  - Taxonomy & SEO section header
  - Department dropdown (13 options + "Inherit from parent")
  - Facet Profile dropdown (15 options + "None (General)")
  - Sort Order number input
  - SEO Title input
  - SEO Description textarea
  - Synonym Keywords text input (comma-separated)
  - Is Active checkbox

### 3. `apps/web/components/admin/categories/AdminCategoriesClient.tsx`
- **Tree sorting**: Changed `buildCategoryTree` to sort by `sort_order` (primary) → `display_order` → `name`
- **Name/info section**: Added department badge (blue, shows `department_key`), inactive status badge (red, only when `is_active === false`), breadcrumb text in muted secondary line
- **Order badge**: Shows `sort_order` if present, falls back to `display_order`, defaults to 0

## Usage Notes
- Admin category creation now auto-computes depth/breadcrumb from selected parent
- Changing a category parent or name triggers full descendant depth/breadcrumb recomputation
- Deleting a category soft-hides it (is_active=false) — storefront pages filter inactive by default
- Legacy redirected categories from the taxonomy seed remain in DB as inactive visible in admin only
- Department and Facet Profile fields are optional — new categories inherit department_key from parent if not explicitly set
