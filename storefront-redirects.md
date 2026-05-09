# Storefront Redirects — Implementation Summary

## File Modified
`apps/web/app/(storefront)/c/[...slug]/page.tsx`

## Changes Made

### 1. Imports
- Added `permanentRedirect` from `next/navigation`
- Added `getLegacyCategoryRedirectBySlug` from `@/lib/data`

### 2. Legacy Slug Resolution (`resolveCategory`)
After direct slug match and joined-slug fallback both fail, checks `legacy_slug_redirects` table:
- First tries last slug segment (e.g. `/c/bird` → `bird` → `pet-bird`)
- Then tries joined segments (e.g. `/c/farm/animal` → `farm-animal` → `farm-livestock`)
- Returns the matching category tagged with `_isLegacyRedirect: true`

### 3. 301 Permanent Redirect
In the page component, before `notFound()`:
```ts
if (category && (category as any)._isLegacyRedirect) {
  permanentRedirect(getCategoryUrl(category.slug!));
}
```
This issues a 301 redirect to the new active category URL (e.g. `/c/bird` → `/c/pet-bird`)

### 4. SEO Metadata
`generateMetadata()` now prefers:
- `category.seo_title` over the default `"${name} | Bay State Pet & Garden"`
- `category.seo_description` over auto-generated `category.description.slice(0, 160)`

Falls back to existing logic when SEO fields are null.

## Redirect Coverage
Covers all 70+ mappings seeded in `legacy_slug_redirects`:
- `/c/bird` → `/c/pet-bird`
- `/c/fish-aquatics` → `/c/fish-aquarium`
- `/c/reptile` → `/c/reptile-amphibian`
- `/c/farm-animal` → `/c/farm-livestock`
- `/c/farm-animal-horse-feed` → `/c/horse`
- `/c/home` → `/c/home-heating`
- Plus all product-level subcategory redirects (e.g. `farm-animal-chicken-coop-supplies` → `chicken-poultry-coops-runs`)

## Dependencies
- `getLegacyCategoryRedirectBySlug()` in `lib/data.ts` (implemented in Task 12)
- `legacy_slug_redirects` table seeded by `20260509131700_create_legacy_slug_redirects.sql` (Task 7)
- Active categories must be seeded by `20260509131500_seed_retail_taxonomy_and_pet_types.sql` (Task 6)
