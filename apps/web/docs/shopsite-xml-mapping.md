# ShopSite Products XML → Database Mapping

This document provides a comprehensive mapping of XML elements from ShopSite's `db_xml.cgi` product export to our Supabase database schema. It serves as the single source of truth for data synchronization.

---

## Quick Reference

| XML Element | DB Column | Data Type | Notes |
|------------|-----------|-----------|-------|
| `SKU` | `products.sku` | `text` | **Primary key for upsert** |
| `Name` | `products.name` | `text` | Required |
| `Price` | `products.price` | `numeric(10,2)` | Required |
| `ProductDescription` | `products.description` | `text` | Short description |
| `MoreInformationText` | `products.long_description` | `text` | HTML content |
| `Graphic` | `products.images[0]` | `text[]` | Primary image path |
| `ProductField7` | `products.short_name` | `text` | Child / Short Name |
| `ProductField11` | `products.is_special_order` | `boolean` | Special Order flag |
| `ProductField15` | `products.in_store_pickup` | `boolean` | In Store Pick-up flag |
| `ProductField16` / `Brand` | `brands.name` → `products.brand_id` | `uuid` (FK) | Lookup/create brand |
| `ProductField17` | `pet_types` → `product_pet_types` | `uuid` (FK) | Canonical pet type |
| `ProductField24` | `categories` → `product_categories` | `uuid[]` | **Canonical category** |
| `ProductField25` | `product_types` → `products.product_type_id` | `uuid` (FK) | Canonical product type |
| `ProductField32` | `related_products` | junction table | Cross-sell relations |

---

## Detailed Element Mapping

### 1. Core Product Fields

| XML Element | DB Target | XML Type | DB Type | Transform | Example Value |
|------------|-----------|----------|---------|-----------|---------------|
| `SKU` | `products.sku` | string | `text UNIQUE NOT NULL` | Direct | `"20279995005"` |
| `Name` | `products.name` | string | `text NOT NULL` | Decode entities | `"PetAg Esbilac Powder 12 oz."` |
| `Price` | `products.price` | decimal string | `numeric(10,2)` | `parseFloat()` | `"19.99"` → `19.99` |
| `SaleAmount` | `products.sale_price`* | decimal string | `numeric(10,2)` | `parseFloat()` or null | `""` → `null` |
| `ProductDescription` | `products.description` | string | `text` | Decode entities | Product short desc |
| `MoreInformationText` | `products.long_description` | HTML string | `text` | Decode entities, sanitize HTML | Extended content |

> *Note: `sale_price` column may need to be added via migration.

---

### 2. Product Identifiers

| XML Element | DB Target | XML Type | DB Type | Notes |
|------------|-----------|----------|---------|-------|
| `ProductID` | `products.shopsite_data.shopsite_id` | integer string | `jsonb` | ShopSite internal ID (e.g., `"2003"`) |
| `ProductGUID` | `products.shopsite_data.shopsite_guid` | UUID string | `jsonb` | ShopSite UUID |
| `GTIN` | `products.shopsite_data.upc` | string | `jsonb` | Barcode (UPC/EAN) |
| `FileName` | `products.shopsite_data.legacy_filename` | string | `jsonb` | Legacy URL slug (e.g., `"esbilac-12-oz.html"`) |

---

### 3. Images

| XML Element | DB Target | XML Type | DB Type | Transform |
|------------|-----------|----------|---------|-----------|
| `Graphic` | `products.images[0]` | path string | `text[]` | Prepend base URL, skip if `"none"` |
| `MoreInfoImage1`...`MoreInfoImage20` | `products.images[1..n]` | path string | `text[]` | Collect non-`"none"` values |

**Image URL Transform:**
```typescript
const imageUrl = graphicValue === 'none' 
  ? null 
  : `https://store.baystatepetorama.com/images/${graphicValue}`;
```

---

### 4. Inventory & Stock

| XML Element | DB Target | XML Type | DB Type | Transform |
|------------|-----------|----------|---------|-----------|
| `QuantityOnHand` | `products.quantity_on_hand`* | integer string | `integer` | `parseInt()` or `0` |
| `LowStockThreshold` | `products.low_stock_threshold`* | integer string | `integer` | `parseInt()` or null |
| `OutOfStockLimit` | `products.shopsite_data.out_of_stock_limit` | integer string | `jsonb` | `parseInt()` |
| `Availability` | → `products.stock_status` | enum string | `text` (enum) | See transform below |
| `ProductDisabled` | **Skip if checked** | checkbox | — | `"checked"` = don't import |

**Stock Status Transform:**
```typescript
const stockStatus = availability === 'out of stock' 
  ? 'out_of_stock' 
  : availability === 'preorder' 
    ? 'pre_order' 
    : 'in_stock';
```

---

### 5. Physical Properties & Shipping

| XML Element | DB Target | XML Type | DB Type | Transform |
|------------|-----------|----------|---------|-----------|
| `Weight` | `products.weight` | decimal string | `numeric` | `parseFloat()` |
| `Taxable` | `products.taxable` | checkbox | `boolean` | `"checked"` → `true` |
| `ProductType` | `products.fulfillment_type` | enum string | `text` | `"Tangible"`, `"Digital"`, `"Service"` |
| `MinimumQuantity` | `products.shopsite_data.minimum_quantity` | integer string | `jsonb` | `parseInt()` |
| `NoShippingCharges` | `products.shopsite_data.no_shipping_charges` | checkbox | `jsonb` | `"checked"` → `true` |
| `ExtraHandlingCharge` | `products.shopsite_data.extra_handling` | decimal string | `jsonb` | `parseFloat()` |

---

### 6. Brand & Categories

| XML Element | DB Target | XML Type | DB Type | Notes |
|------------|-----------|----------|---------|-------|
| `Brand` | `brands.name` → `products.brand_id` | string | `uuid` (FK) | Lookup or create brand |
| `ProductField16` | `brands.name` (fallback) | string | `uuid` (FK) | Alternative brand source |
| `ProductField24` | `categories` (create/link) | string | `uuid[]` | **Canonical category source** |
| `ProductField25` | `products.product_type` | string | `text` | Canonical product type source |
| `ProductField31` | **Audit only** | string | `jsonb` | Never used for normalized categories |
| `ProductOnPages` | `product_categories` | XML block | junction table | Parse nested `<Name>` elements |
| `GoogleProductCategory` | `products.shopsite_data.google_category` | string | `jsonb` | Google taxonomy |

**Category Precedence Rule**: `ProductField24` is the only canonical category source. `ProductField31` is preserved only in raw payload for audit purposes and must never drive normalized category behavior.

**ProductOnPages Parsing:**
```xml
<ProductOnPages>
  <ProductOnPage>
    <Name>Dog Food</Name>
  </ProductOnPage>
  <ProductOnPage>
    <Name>Puppy Supplies</Name>
  </ProductOnPage>
</ProductOnPages>
```

---

### 7. SEO & Metadata

| XML Element | DB Target | XML Type | DB Type |
|------------|-----------|----------|---------|
| `SearchKeywords` | `products.shopsite_data.search_keywords` | string | `jsonb` |
| `MoreInfoMetaKeywords` | `products.shopsite_data.meta_keywords` | string | `jsonb` |
| `MoreInfoMetaDescription` | `products.shopsite_data.meta_description` | string | `jsonb` |
| `OneLineAdvertisement` | `products.shopsite_data.ad_text` | string | `jsonb` |

---

### 8. Display & Ordering Options

| XML Element | Purpose | Stored? |
|------------|---------|---------|
| `QuantityPricing` | Quantity-based pricing tiers | `shopsite_data` if needed |
| `OptionMenus` | Product variants/options | Future: variants table |
| `ProductOptions` | Option configurations | Future: variants table |
| `CustomerTextEntryBox` | Custom text input | `shopsite_data` |
| `VariablePrice/Name/SKU/Weight` | Variant modifiers | Future: variants table |

---

### 9. Google Shopping Fields

| XML Element | DB Target | Notes |
|------------|-----------|-------|
| `GoogleBase` | `shopsite_data.google_base_enabled` | `"checked"` = include in feed |
| `GoogleCondition` | `shopsite_data.condition` | `"New"`, `"Used"`, `"Refurbished"` |
| `GoogleProductType` | `shopsite_data.google_product_type` | Custom taxonomy |
| `GoogleProductCategory` | `shopsite_data.google_category` | Official Google taxonomy |
| `GoogleAgeGroup` | `shopsite_data.age_group` | Apparel targeting |
| `GoogleGender` | `shopsite_data.gender` | Apparel targeting |

---

### 10. ShopSite-Only Fields (Store in `shopsite_data` JSONB)

These are internal ShopSite fields that don't map to e-commerce columns but should be preserved:

| XML Element | Purpose |
|------------|---------|
| `ProductField1` - `ProductField6` | Custom fields (informational only) |
| `ProductField8` - `ProductField10` | Custom fields (informational only) |
| `ProductField12` - `ProductField14` | Custom fields (informational only) |
| `ProductField28` | Custom field (informational only) |
| `ProductField31` | **Audit-only category** (excluded from normalization) |
| `Template` | ShopSite page template |
| `CrossSell` | Cross-sell product IDs |
| `ProductCrossSell` | Enable cross-selling |
| `DisplayName/SKU/Price/Graphic` | Display toggles |
| `NameStyle/Size`, `PriceStyle/Size` | Styling options |
| `ImageAlignment`, `TextWrap` | Layout options |
| `AddtoCartButton`, `ViewCartButton` | Button text |
| `ProductSitemap`, `ProductSitemapPriority` | Sitemap config |

**Note**: See [Custom ProductFields Usage](#custom-productfields-usage-corrected-contract) section for the 18 ProductFields that are part of the canonical migration contract.

---

## Custom ProductFields Usage (Corrected Contract)

Based on user-approved field mappings. This is the canonical contract for migration.

### Canonical Rules

- `ProductField24` is the **only canonical category source**. Never use `ProductField31` for normalized category behavior.
- `ProductField17` direct values are **canonical**; inference is fallback only when PF17 is blank.
- `ProductField32` cross-sells are **one-way**, split on `|`, and skip duplicates, self-links, and missing SKUs.
- Blank canonical values **clear** normalized joins and nullable first-class fields on rerun.

### Full ProductField Mapping (18 Fields)

| Field | Business Meaning | Database Target | Notes |
|-------|------------------|-----------------|-------|
| `ProductField7` | Child / Short Name | `products.short_name` | Operational field; blank clears on rerun |
| `ProductField11` | Special Order | `products.is_special_order` | Boolean; truthy: `yes`, `checked`, `true`, `1` |
| `ProductField15` | In Store Pick-up | `products.in_store_pickup` | Boolean; truthy: `yes`, `checked`, `true`, `1` |
| `ProductField16` | Facet - Brand | `brands` table | Canonical brand input |
| `ProductField17` | Facet - Pet Type | `pet_types` table | Direct value wins; inference fallback only if blank |
| `ProductField18` | Facet - Lifestage | Generic normalized facet | Product-to-facet join |
| `ProductField19` | Facet - Pet Size | Generic normalized facet | Product-to-facet join |
| `ProductField20` | Facet - Special Diet | Generic normalized facet | Product-to-facet join |
| `ProductField21` | Facet - Health Feature | Generic normalized facet | Product-to-facet join |
| `ProductField22` | Facet - Food Form | Generic normalized facet | Product-to-facet join |
| `ProductField23` | Facet - Flavor | Generic normalized facet | Product-to-facet join |
| `ProductField24` | Facet - Category | `categories` table | **Only** normalized category source |
| `ProductField25` | Facet - Product Type | `product_types` table | Canonical product-type input |
| `ProductField26` | Facet - Product Feature | Generic normalized facet | Product-to-facet join |
| `ProductField27` | Facet - Size | Generic normalized facet | Product-to-facet join |
| `ProductField29` | Facet - Color | Generic normalized facet | Product-to-facet join |
| `ProductField30` | Facet - Packaging Type | Generic normalized facet | Product-to-facet join |
| `ProductField32` | Product Cross Sell | `related_products` | One-way relations; split on `|`, skip duplicates/self/missing |

### Explicit Exclusions

| Field | Status | Reason |
|-------|--------|--------|
| `ProductField31` | **Excluded from normalization** | Preserved only in raw ShopSite payload for audit/drift review. Never used for normalized category behavior. |

### Deprecated/Observed (Non-Canonical)

These fields are observed in XML exports but are **not part of the corrected contract**:

| Field | Observed Usage | Status |
|-------|----------------|--------|
| `ProductField1` | Stock status tags (e.g., `"instock041421"`) | Informational only |
| `ProductField2` | Sales period (e.g., `"sold0920"`) | Informational only |
| `ProductField3` | Distributor code (e.g., `"BCI"`) | Informational only |
| `ProductField10` | Active flag (`"Y"`) | Derive from `ProductDisabled` instead |

---

## Data Type Summary

| XML Value Pattern | Parser Treatment | DB Type |
|-------------------|------------------|---------|
| `"19.99"` | `parseFloat()` | `numeric` |
| `"0"`, `""` (integer context) | `parseInt() \|\| 0` | `integer` |
| `"checked"`, `"unchecked"` | `=== 'checked'` | `boolean` |
| `"in stock"`, `"out of stock"` | Map to enum | `text` (enum constraint) |
| `"none"` (images) | Skip/null | — |
| HTML content | Decode entities | `text` |
| `"abc\|def\|ghi"` | `.split('\|')` | `text[]` / `jsonb` |

---

## Parser Implementation Reference

The current parser is in `lib/admin/migration/shopsite-client.ts`:

```typescript
// Key extraction pattern
const value = this.extractXmlValue(productXml, 'TagName');

// Supports both cases
const sku = this.extractXmlValue(xml, 'sku') || this.extractXmlValue(xml, 'SKU');

// Boolean from checkbox
const taxable = taxableRaw?.toLowerCase() === 'checked';

// Images array
const images = [imageUrl, ...additionalImages].filter(Boolean);
```

---

## Schema Migration Checklist

Based on this mapping, the following columns may need to be added:

- [ ] `products.sale_price` — `numeric(10,2)` 
- [ ] `products.quantity_on_hand` — `integer DEFAULT 0`
- [ ] `products.low_stock_threshold` — `integer`
- [ ] `products.sku` — `text UNIQUE NOT NULL` (if not exists)
- [ ] `products.search_keywords` — `text` (or keep in `shopsite_data`)
- [ ] `products.short_name` — `text` (ProductField7)
- [ ] `products.is_special_order` — `boolean` (ProductField11)
- [ ] `products.in_store_pickup` — `boolean` (ProductField15)

### Normalized Facet Tables (Generic)

For ProductField18/19/20/21/22/23/26/27/29/30:

- [ ] `facet_definitions` — dimension metadata table
- [ ] `facet_values` — normalized value table per dimension
- [ ] `product_facet_values` — product-to-facet-value join table

### Cross-Sell Relations

- [ ] `related_products` — one-way cross-sell relations (PF32)

---

## Related Files

- [Parser Implementation](../lib/admin/migration/shopsite-client.ts)
- [Type Definitions](../lib/admin/migration/types.ts)
- [Initial Schema](../supabase/migrations/20251230150000_initial_schema.sql)
- [Field Mapping Matrix](./field-mapping-matrix.md) — Canonical contract documentation
- [ShopSite Constants](../lib/shopsite/constants.ts) — Field mapping constants

