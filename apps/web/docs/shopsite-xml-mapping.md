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
| `ProductField16` / `Brand` | `brands.name` → `products.brand_id` | `uuid` (FK) | Lookup/create brand |

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
| `ProductField24` | `categories` (create/link) | string | `uuid[]` | Department/Category name |
| `ProductField25` | `products.product_type` | string | `text` | Subcategory/product type |
| `ProductOnPages` | `product_categories` | XML block | junction table | Parse nested `<Name>` elements |
| `GoogleProductCategory` | `products.shopsite_data.google_category` | string | `jsonb` | Google taxonomy |

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
| `ProductField1`...`ProductField32` | Custom fields (some used for brand/category) |
| `Template` | ShopSite page template |
| `CrossSell` | Cross-sell product IDs |
| `ProductCrossSell` | Enable cross-selling |
| `DisplayName/SKU/Price/Graphic` | Display toggles |
| `NameStyle/Size`, `PriceStyle/Size` | Styling options |
| `ImageAlignment`, `TextWrap` | Layout options |
| `AddtoCartButton`, `ViewCartButton` | Button text |
| `ProductSitemap`, `ProductSitemapPriority` | Sitemap config |

---

## Custom ProductFields Usage

Based on analysis of the XML data:

| Field | Observed Usage | Recommendation |
|-------|----------------|----------------|
| `ProductField1` | Stock status tags (e.g., `"instock041421"`) | Parse for dates |
| `ProductField2` | Sales period (e.g., `"sold0920"`) | Analytics |
| `ProductField3` | Distributor code (e.g., `"BCI"`) | `shopsite_data.distributor` |
| `ProductField10` | Active flag (`"Y"`) | Derive from `ProductDisabled` instead |
| `ProductField16` | **Brand name** | Primary brand source |
| `ProductField24` | **Department/Category** | Map to `categories` table |
| `ProductField25` | **Product Type** | Map to `products.product_type` |
| `ProductField32` | Related SKUs (pipe-delimited) | Cross-sell array |

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

---

## Related Files

- [Parser Implementation](../lib/admin/migration/shopsite-client.ts)
- [Type Definitions](../lib/admin/migration/types.ts)
- [Initial Schema](../supabase/migrations/20251230150000_initial_schema.sql)

