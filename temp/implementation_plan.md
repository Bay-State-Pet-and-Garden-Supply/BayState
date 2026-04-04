# ShopSite Migration — Implementation Plan (v2)

## Goal

Fresh-start the `products` table with a clean import of all **8,330 enabled products** from the ShopSite XML export, then batch-migrate images into Supabase Storage, auto-create product groups, and populate cross-sell relationships.

---

## Key Corrections from v1

| Item | v1 (wrong) | v2 (correct) |
|------|-----------|--------------|
| **Disabled products** | 1,365 "disabled" | All 8,330 are **enabled** — `<ProductDisabled/>` (empty) means NOT disabled. Disabled products weren't included in the export. |
| **Cross-sell source** | `<CrossSell>` element (52 products) | **`<ProductField32>`** — pipe-delimited SKUs (7,999 products, ~32K references) |
| **Conflict strategy** | Merge with existing 12,523 | **Fresh start** — truncate products and re-import cleanly from XML |
| **Image timing** | All at once | **Batched/resumable** — separate spaced-out process |

---

## Fresh Start Analysis

**20 tables** have foreign keys pointing to `products`. Here's the data impact:

| Child Table | Current Rows | FK Action | Impact |
|-------------|-------------|-----------|--------|
| `product_categories` | 6,750 | CASCADE | ⚠️ Will be re-created from XML `<ProductOnPages>` |
| `product_storefront_settings` | 12,523 | CASCADE | Auto-recreated by trigger on product insert |
| `product_group_products` | 25 | CASCADE | Will be re-created from XML `<Subproducts>` |
| `product_groups` | 26 | SET NULL (default_product_id) | Groups stay, default_product_id nulled; we'll re-link |
| `price_history` | verify | CASCADE | Scraper pipeline history — acceptable to lose |
| `order_items` | **0** | — | No real orders yet ✅ |
| `wishlists` | **0** | — | No wishlists yet ✅ |
| `product_images` | **0** | CASCADE | Empty — no impact |
| `related_products` | **0** | CASCADE | Empty — no impact |
| All others | **0** | CASCADE | Empty — no impact |

> [!IMPORTANT]
> **This is safe.** No customer-facing data (orders, wishlists, reviews) will be lost. Only scraper pipeline artifacts and category mappings are affected, and those will be rebuilt from the XML source of truth.

---

## Proposed Changes

### Phase 1: Fresh Start

A single migration that:
1. Truncates `products` (cascading to all child tables)
2. Clears `product_groups` and related data
3. Preserves `brands` and `categories` tables (these are reusable)

```sql
BEGIN;
TRUNCATE public.products CASCADE;
TRUNCATE public.product_groups CASCADE;
COMMIT;
```

---

### Phase 2: Core Product Import

**Migration script** (TypeScript) that parses the XML and inserts all 8,330 products.

#### Field Mapping

| XML Field | → Column | Transform |
|-----------|----------|-----------|
| `<Name>` | `name` | Direct |
| `<Name>` | `slug` | Slugify (lowercase, hyphens, dedup) |
| `<Price>` | `price` | Parse as numeric |
| `<SKU>` | `sku` | Direct |
| `<GTIN>` | `gtin` | Direct (3,666 populated) |
| `<ProductDescription>` | `description` | Direct |
| `<MoreInformationText>` | `long_description` | HTML-decode (518 populated) |
| `<Weight>` | `weight` | Parse as numeric (7,946 populated) |
| `<MinimumQuantity>` | `minimum_quantity` | Parse as integer |
| `<Taxable>` | `is_taxable` | `checked` → true, else true (default) |
| `<Availability>` | `stock_status` | `in stock` → `in_stock`, `out of stock` → `out_of_stock` |
| `<QuantityOnHand>` | `quantity` | Parse as integer (196 populated) |
| `<LowStockThreshold>` | `low_stock_threshold` | Parse as integer |
| `<Graphic>` | `images[0]` | Direct relative path (e.g., `petag/esbilacpowder.jpg`) |
| `<MoreInformationGraphic>` + `<MoreInfoImage1..20>` | `images[1..N]` | Filter out `none` values |
| `<ProductOnPages>/<Name>` | → `product_categories` | Match/create categories |
| `<Brand>` | → `brands` table → `brand_id` | Match/create brand (100 populated) |
| `<ProductType>` | `fulfillment_type` | `Tangible` → `tangible` |

#### Slug Generation Strategy
- Base: slugify `<Name>` 
- Dedup: if collision, append `-{sku}` suffix

---

### Phase 3: Image Migration (Batched, Separate)

**Approach:** A standalone resumable script run independently.

1. Query all products' `images[]` paths from Supabase
2. For each path, construct source URL: `https://www.baystatepet.com/media/{path}`
3. Download image → upload to `product-images` Supabase Storage bucket at same relative path
4. Insert into `product_images` table (`product_id`, `url`, `position`, `is_primary`, `storage_path`)
5. **Rate limiting:** 5-10 concurrent downloads, 100ms delay between batches
6. **Resumable:** Track uploaded paths, skip on re-run
7. **Batched:** Process in chunks of ~500 products per run

> [!NOTE]
> The `products.images[]` array already stores the correct relative paths. The `image-loader.ts` already resolves them to Supabase Storage URLs. So once the files are in the bucket, everything works immediately.

---

### Phase 4: Product Groups from Subproducts

For each `<Product>` with `<Subproducts>`:
1. Create a `product_group` with the parent product's name/slug
2. Set parent as `default_product_id`
3. Match each `<Subproduct>` by `<SKU>` → `product_group_products` entry
4. Set `display_label` from subproduct `<Name>`
5. Set `sort_order` from position in XML

**Volume:** ~1,667 subproduct entries.

---

### Phase 5: Cross-Sells from ProductField32

**`<ProductField32>`** contains pipe-delimited SKUs referencing related products.

For each product with PF32:
1. Split by `|` to get reference SKUs
2. Match each reference to existing products by `sku`
3. Insert into `related_products` with `relation_type = 'cross_sell'`
4. Unmatched SKUs are silently skipped (may be discontinued products)

**Volume:** 7,999 products, ~32K total references. Match rate will vary — many references may point to products no longer in the catalog.

---

### Phase 6: Legacy Redirects

#### [NEW] Migration: `legacy_redirects` table

```sql
CREATE TABLE public.legacy_redirects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    old_path text NOT NULL UNIQUE,
    new_path text NOT NULL,
    status_code integer NOT NULL DEFAULT 301,
    created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_legacy_redirects_old_path ON public.legacy_redirects(old_path);
ALTER TABLE public.legacy_redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read legacy_redirects" ON public.legacy_redirects FOR SELECT USING (true);
```

Populate from XML: `<FileName>` → `old_path`, product `slug` → `new_path`.

---

## Execution Order

```
1. Create legacy_redirects table (migration)
2. TRUNCATE products CASCADE (migration)
3. Run import script (TypeScript — Phase 2)
4. Run product groups script (Phase 4)
5. Run cross-sells script (Phase 5)
6. Populate legacy redirects (Phase 6)
7. Run image migration in batches (Phase 3 — async, over time)
```

---

## Open Questions

> [!WARNING]
> **Fresh start confirmation:** Truncating `products CASCADE` will wipe 12,523 products, 6,750 product_categories mappings, and the price_history table. Are you ready to do this, or do you want to do it on a development branch first?

> [!IMPORTANT]
> **ProductField32 match rate:** About 58% of PF32 SKU references match real SKUs in the XML. The other 42% may be discontinued products, UPCs, or other identifiers. Should we only create cross-sells for matched SKUs, or also store unmatched ones for future reference?

---

## Verification Plan

### Automated Checks
```sql
-- Post-import counts
SELECT count(*) FROM products;                    -- Should be 8,330
SELECT count(*) FROM products WHERE weight IS NOT NULL; -- Should be ~7,946
SELECT count(*) FROM product_categories;          -- Re-populated from XML
SELECT count(*) FROM product_group_products;      -- ~1,667
SELECT count(*) FROM related_products;            -- From PF32 matches
SELECT count(*) FROM legacy_redirects;            -- ~8,330
```

### Image Verification
- Sample 10 random `images[0]` paths → verify they resolve via Supabase Storage
- Check `product_images` table row count matches total image paths

### Manual
- Browse storefront → products load correctly
- Test a product group page → size selector works
- Test an old ShopSite URL → 301 redirects to new slug
