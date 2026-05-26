# Brands Implementation — Scout Report

## 1. Database Schema (`public.brands`)

**File:** `apps/web/supabase/migrations/20250101000000_baseline.sql` (lines 2905–2935)

```sql
CREATE TABLE IF NOT EXISTS "public"."brands" (
    "id"                uuid DEFAULT gen_random_uuid() NOT NULL,
    "name"              text NOT NULL,
    "slug"              text NOT NULL,
    "logo_url"          text,
    "created_at"        timestamptz DEFAULT now(),
    "description"       text,
    "official_domains"  text[] DEFAULT ARRAY[]::text[] NOT NULL,
    "preferred_domains" text[] DEFAULT ARRAY[]::text[] NOT NULL
);

-- Unique constraint on slug
ALTER TABLE ONLY "public"."brands" ADD CONSTRAINT "brands_slug_key" UNIQUE ("slug");
```

- **No `aliases` column** — it was removed in a past migration (see §5 below).
- **No `website_url` column** — also removed (folded into `official_domains`).
- **RLS:** Public read (SELECT for all), staff/admin write (via `is_staff()` policy).
- **GRANT ALL** to `anon`, `authenticated`, and `service_role` (Supabase managed).

### Columns currently available:
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `name` | text | Required |
| `slug` | text | Required, unique |
| `logo_url` | text | Nullable |
| `description` | text | Nullable |
| `official_domains` | text[] | Canonical official domains (e.g. `scottsmiraclegro.com`) |
| `preferred_domains` | text[] | Additional fallback domains |
| `created_at` | timestamptz | Auto-set |

### FK references to `brands`:
| Table | FK Column | On Delete |
|-------|-----------|-----------|
| `brand_sources` | `brand_id` | CASCADE |
| `brand_scraper_mappings` | `brand_id` | CASCADE |
| `official_brand_url_candidates` | `brand_id` | SET NULL |
| `product_groups` | `brand_id` | SET NULL |
| `products` | `brand_id` | SET NULL |
| `products_ingestion` | `brand_id` | (none) |
| `cohort_batches` | `brand_id` | SET NULL |

---

## 2. Brand Type Definitions

### Web app (`apps/web/lib/types.ts`, lines 6–16)
```typescript
export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description?: string | null;
  official_domains?: string[];
  preferred_domains?: string[];
  created_at?: string;
}
```

### Shared API package (`packages/api/src/types.ts`, lines 22–26)
```typescript
export interface Brand {
  id: string
  name: string
  slug: string
  logo_url: string | null
}
```
The mobile API type is **simpler** — no `description`, `official_domains`, or `preferred_domains`.

### Admin component types (`components/admin/brands/types.ts`)
Re-exports `Brand` from `lib/types` and defines:
```typescript
export interface BrandActionState {
  success: boolean;
  error?: string;
  brand?: Brand;
}
```

---

## 3. Admin UI Pages & API Endpoints

### Admin Pages

| Route | File | Description |
|-------|------|-------------|
| `/admin/brands` | `app/admin/brands/page.tsx` | Server component: fetches all brands `select('*')`, renders AdminBrandsClient |
| AdminBrandsClient | `components/admin/brands/AdminBrandsClient.tsx` | DataTable with search, sort, selection, bulk delete, row actions (edit/open/delete) |
| BrandModal | `components/admin/brands/BrandModal.tsx` | Create/Edit dialog with fields: name, slug, logo_url, description, **official_domains** (comma-separated input, auto-parsed). Auto-generates slug from name on create. |

### Admin API Routes

| Method | Route | File | Auth |
|--------|-------|------|------|
| `GET` | `/api/admin/brands` | `app/api/admin/brands/route.ts` | `requireAdminAuth` |
| `POST` | `/api/admin/brands` | `app/api/admin/brands/route.ts` | `requireAdminAuth` |
| `GET` | `/api/admin/brands/[id]` | `app/api/admin/brands/[id]/route.ts` | `requireAdminAuth` |
| `DELETE` | `/api/admin/brands/[id]` | `app/api/admin/brands/[id]/route.ts` | `requireAdminAuth` |

### Mobile API (tRPC)
- `listBrands` procedure in `packages/api/src/routers/mobileV1/catalog.ts` → calls `ctx.services.catalog.listBrands()` → which maps to `getBrands()` from `lib/data.ts`

### Server Actions (`app/admin/brands/actions.ts`)
- **`createBrand(formData)`** — Zod-validated, inserts brand, then auto-syncs `official_brand` source to `brand_sources` table
- **`updateBrand(id, formData)`** — Same pattern, also syncs official brand source
- **`deleteBrand(id)`** — Deletes brand, revalidates paths
- Both create/update parse `official_domains` from a newline/comma-separated text field into an array via `parseDomainList()`
- `preferred_domains` is in the Zod schema but **never written** in the form/post — the form only collects `official_domains`

---

## 4. Storefront Usage

| Route/Purpose | File | Details |
|---------------|------|---------|
| `/brands` (all brands) | `app/(storefront)/brands/page.tsx` | Alphabetical A–Z grid with logo placeholders |
| `/b/[slug]` (brand products) | `app/(storefront)/b/[slug]/page.tsx` | Product listing page filtered by brand slug |
| Header nav | `components/storefront/header.tsx` | Top 20 brands in dropdown |
| Homepage | `app/(storefront)/page.tsx` | Featured brands section (configurable limit) |
| Product detail | `app/(storefront)/products/[slug]/page.tsx` | Brand link + brand info sidebar |
| Sitemap | `app/sitemap.ts` | Weekly change frequency, priority 0.7 |
| Facet sidebar | `components/storefront/facet-sidebar.tsx` | Brand filter |

URL helper: `getBrandUrl(slug)` → `/b/${slug}` (defined in `lib/urls.ts`).

---

## 5. Brand Aliases — Current State

### What WAS there (now removed)

The `brands` table **previously had an `aliases` column** that was **dropped** in:
```
apps/web/supabase/migrations_archive/20260506055436_consolidate_brand_website_into_domains.sql
```
```sql
alter table public.brands drop column if exists aliases;
```
This migration also dropped `website_url` (folded into `official_domains`) but **did not migrate the aliases data anywhere** — they were simply dropped.

### What exists now (scraper-side only)

**Hardcoded BRAND_ALIASES** in `apps/scraper/scrapers/ai_search/extraction.py` (line 25):
```python
BRAND_ALIASES = {
    "lkvll": "Lake Valley Seed",
    "lvseed": "Lake Valley Seed",
}
```
Used by `normalize_brand_name()` to expand shorthand → canonical names during AI extraction.

**BRAND_DOMAIN_ALIASES** in `apps/scraper/scrapers/ai_search/scoring.py` (via tuning_inventory.json entry `scoring.brand_domain_aliases`):
```json
{"scotts": ["scotts.com", "scottsmiraclegro.com"],
 "scottsmiraclegro": ["miraclegro.com", "scotts.com", "scottsmiraclegro.com"],
 "miraclegro": ["miraclegro.com", "scottsmiraclegro.com"]}
```
Used by `SearchScorer._brand_matches_domain()` to classify official sources during URL scoring.

**No DB-backed brand aliases exist** in the current schema.

---

## 6. Related Tables & How Brands Connect

### `brand_sources` (baseline migration, line 2879)
- FK to brands with ON DELETE CASCADE
- Each source has `source_type` (official_brand, distributor, internal, licensed_feed), `domains` text[], `allowed_fields`
- On brand create/update, the server actions **auto-sync** an `official_brand` source entry
- This is the scraper's data source configuration per brand

### `brand_scraper_affinity` (line 2739)
- Tracks historical scraper performance per **brand_name** (text, NOT FK to brands table)
- Used for automatic scraper recommendation during cohort processing

### `brand_scraper_mappings` (line 2803)
- FK to brands with ON DELETE CASCADE
- Explicit mappings between brands and scraper configs with priority

### `official_brand_url_candidates` (line 3966)
- FK to brands with ON DELETE SET NULL
- AI-discovered/manually entered URL candidates for official brand product pages
- Selection workflow: candidate → selected → extracted → failed
- Used for the "official brand URL discovery" pipeline

---

## 7. Data Flow Summary

```
Admin UI (BrandModal) → Server Actions (createBrand/updateBrand)
    → inserts/updates brands table
    → revalidates caches
    → auto-syncs brand_sources (official_brand entry with domains)
    
API routes (GET/POST /api/admin/brands) → same syncing logic

Storefront (getBrands) → SELECT * FROM brands ORDER BY name
    → used for brand listing, product filtering, navigation, sitemap
```

---

## 8. What Would Need to Change for Brand Aliases

If the proposal requires adding brand aliases support:

1. **Migration**: Add an `aliases` column (or separate `brand_aliases` table) to `public.brands`
   - `text[]` column (like `official_domains`) or a separate normalized table
   - Would need to re-add what was previously dropped

2. **Type definitions**:
   - Add `aliases?: string[]` to `Brand` in `apps/web/lib/types.ts`
   - Update `packages/api/src/types.ts` if the mobile API needs aliases

3. **Admin UI**:
   - Add alias input field to `BrandModal.tsx` (similar to official_domains comma-separated pattern)
   - Update Zod schema in both `BrandModal.tsx` and `actions.ts`

4. **Server actions**:
   - Update `createBrand` and `updateBrand` to handle aliases
   - Or add a separate alias management action

5. **Scraper integration** (if aliases need to feed the scraper):
   - Replace hardcoded `BRAND_ALIASES` in `extraction.py` with DB-backed lookup
   - Replace hardcoded `BRAND_DOMAIN_ALIASES` in `scoring.py` with DB-backed lookup
   - This would likely be an API endpoint the scraper calls to get brand alias data

6. **Related file list** (files likely needing changes):
   - `apps/web/supabase/migrations/` → new migration
   - `apps/web/lib/types.ts` → add `aliases` field
   - `packages/api/src/types.ts` → possibly add aliases
   - `apps/web/components/admin/brands/BrandModal.tsx` → UI field
   - `apps/web/app/admin/brands/actions.ts` → validation/logic
   - `apps/web/components/admin/brands/AdminBrandsClient.tsx` → display aliases in table
   - `apps/web/app/api/admin/brands/route.ts` → API creates/updates
   - `apps/scraper/scrapers/ai_search/extraction.py` → replace hardcoded aliases
   - `apps/scraper/scrapers/ai_search/scoring.py` → replace hardcoded domain aliases
