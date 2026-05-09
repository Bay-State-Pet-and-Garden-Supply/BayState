# Task 7: Legacy Slug Redirects — Migration Summary

## File Created

`apps/web/supabase/migrations/20260509131700_create_legacy_slug_redirects.sql` (287 lines)

## Structure

### Part A: Table + RLS (lines 1-38)
- `legacy_slug_redirects(old_slug text PK, new_category_id uuid FK→categories, created_at timestamptz)`
- RLS: public read, admin/staff write
- Index on `new_category_id`

### Part B: 70+ slug mappings in 12 groups (lines 40-260)

| Group | Count | Key Transformations |
|---|---|---|
| Pet Bird | 3 | `bird*` → `pet-bird*` |
| Fish & Aquarium | 4 | `fish-aquatics*` → `fish-aquarium*` |
| Reptile & Amphibian | 3 | `reptile*` → `reptile-amphibian*` |
| Wild Bird & Wildlife | 6 | `wild-bird*` → `wild-bird-wildlife*` |
| Chicken & Poultry | 4 | `farm-animal-chicken*` → `chicken-poultry*` |
| Horse | 5 | `farm-animal-horse*` → `horse*` |
| Farm & Livestock | 9 | `farm-animal*` (remaining) → `farm-livestock*` |
| Home & Heating | 6 | `home*` → `home-heating*` |
| Dog corrections | 13 | `dog-beds-crates-beds`→`dog-beds-furniture`, `dog-waste-cleanup`→`dog-cleaning-potty`, etc. |
| Cat corrections | 5 | `cat-litter-housebreaking`→`cat-litter`, `cat-scratchers-furniture`→`cat-trees-scratchers-furniture`, etc. |
| Small Pet corrections | 5 | `small-pet-health-wellness-grooming`→`small-pet-health-grooming`, etc. |
| Lawn & Garden simplifications | 8 | Flat old slugs → hierarchical new slugs |

### Part C: Migration report (lines 262-283)
- `RAISE NOTICE` with total mapping count
- `RAISE WARNING` listing any old slugs that didn't match a seeded category (for diagnostic review)

## Safety Features
- Each INSERT uses `INNER JOIN categories c ON c.slug = new_slug AND c.is_active = true` — silently skips mappings if target slug not yet seeded
- `ON CONFLICT (old_slug) DO NOTHING` — idempotent re-runs
- Fallthrough to `RAISE WARNING` for unmatched slugs — doesn't fail the migration

## Dependencies
- **Must run AFTER** `20260509131500_seed_retail_taxonomy_and_pet_types.sql` (Task 6) — the seed migration creates the new category rows with the target slugs

## Storefront Integration (coded separately in Task 18)
- `lib/data.ts` will add `getLegacyCategoryRedirectBySlug(slug)` querying this table joined to active categories
- `app/(storefront)/c/[...slug]/page.tsx` will call this before falling to 404, issuing `permanentRedirect()` for 301

## Example Redirect Flow
1. User visits `/c/farm-animal`
2. `getCategoryBySlug('farm-animal')` returns null (old category is inactive)
3. `getLegacyCategoryRedirectBySlug('farm-animal')` finds row → returns `farm-livestock` category
4. Page issues 301 permanent redirect to `/c/farm-livestock`
