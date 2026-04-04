# ShopSite → Supabase Migration Tasks

## Phase 1: Schema & Fresh Start
- [ ] Create `legacy_redirects` table migration
- [ ] Truncate `products CASCADE` and `product_groups CASCADE`

## Phase 2: Core Product Import
- [ ] Write XML parser + import script (Python)
- [ ] Insert 8,330 products with field mapping
- [ ] Create/match brands from XML `<Brand>` field
- [ ] Populate `product_categories` from `<ProductOnPages>`

## Phase 3: Product Groups from Subproducts
- [ ] Auto-create product_groups from `<Subproducts>` 
- [ ] Populate product_group_products junction

## Phase 4: Cross-Sells from ProductField32
- [ ] Parse PF32 pipe-delimited SKUs
- [ ] Insert matched-only cross-sells into related_products

## Phase 5: Legacy Redirects
- [ ] Populate legacy_redirects from `<FileName>` → product slug

## Phase 6: Image Migration (Separate/Batched)
- [ ] Build resumable image download + upload script
- [ ] Run in batches (deferred)
