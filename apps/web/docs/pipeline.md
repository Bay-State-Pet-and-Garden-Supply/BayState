# Pipeline Documentation

This document describes the new export-focused pipeline system for managing products from import to export.

## Table of Contents

1. [Overview](#overview)
2. [Workflow](#workflow)
3. [Image Selection](#image-selection)
4. [Export Process](#export-process)
5. [Migration Guide](#migration-guide)
6. [API Endpoints](#api-endpoints)

---

## Overview

### Purpose

The pipeline is an export-focused system designed to manage the lifecycle of products from initial import through final export. Unlike the previous multi-stage system, this pipeline uses a simplified 3-status workflow optimized for data enrichment and export operations.

### Status Model

The pipeline uses three distinct statuses:

| Status | Description | Color |
|--------|-------------|-------|
| `registered` | Product imported, awaiting enrichment | Orange |
| `enriched` | Scraping complete, ready for image selection | Blue |
| `finalized` | Images selected, ready for export | Green |

### Key Differences from Legacy Pipeline

- **Simplified flow**: 3 statuses instead of 6 (staging, scraped, consolidated, approved, published, failed)
- **Export-focused**: Products remain in `finalized` status instead of being published to storefront
- **Retry support**: Failed products are mapped back to `registered` for reprocessing
- **Image-centric**: Dedicated image selection step before finalization

---

## Workflow

### 1. Import Products (registered status)

Products enter the pipeline with `registered` status when:

- Imported from ShopSite XML
- Bulk uploaded via admin interface
- Created via API

```typescript
// Example: Register a product
await registerProduct({
  sku: "PET-001",
  name: "Premium Dog Food",
  input: { ... },
  pipeline_status_new: "registered"
});
```

### 2. Scrape/Enrich (enriched status)

Products transition to `enriched` status after:

- Web scrapers gather additional data
- AI consolidation merges multiple sources
- `selected_images` column populated with candidate URLs

```typescript
// Example: Transition to enriched
await transitionStatus({
  sku: "PET-001",
  fromStatus: "registered",
  toStatus: "enriched"
});
```

**Data gathered during enrichment:**

- Product descriptions
- Specifications
- Pricing information
- Image candidates (stored in `image_candidates`)
- Brand and category metadata

### 3. Image Selection (finalized status)

Before a product can be exported, images must be selected:

1. Navigate to Image Selection workspace
2. Choose up to 10 images from candidates
3. Click "Mark as Finalized" to transition status

```typescript
// Example: Transition to finalized
await transitionStatus({
  sku: "PET-001",
  fromStatus: "enriched",
  toStatus: "finalized"
});
```

### 4. Export (products stay finalized)

Export products at any time from the `finalized` status. Products remain in `finalized` status after export.

```typescript
// Example: Export finalized products
const response = await fetch('/api/admin/pipeline/export?status=finalized');
const blob = await response.blob();
// Download Excel file
```

---

## Image Selection

### Accessing Image Selection

Navigate to the Image Selection workspace at:

```
/admin/pipeline/image-selection?sku={SKU}
```

**Example:**

```
/admin/pipeline/image-selection?sku=PET-001
```

### Selection Rules

- **Maximum 10 images** per product
- Images must be from `image_candidates` array
- Selected images are saved to `selected_images` column
- Selection can be saved without finalizing

### Image Selection UI

The Image Selection workspace provides:

1. **Image Gallery**: Grid display of all candidate images
2. **Selection Counter**: Shows "X of 10 selected"
3. **Max Limit Warning**: Disables selection when limit reached
4. **Two Action Buttons**:
   - **Save Selections**: Save without status change
   - **Mark as Finalized**: Save and transition to `finalized`

### API for Image Selection

```typescript
// Save selected images
POST /api/admin/pipeline/images
{
  "sku": "PET-001",
  "selectedImages": [
    { "url": "https://...", "source": "scraper_a" },
    { "url": "https://...", "source": "scraper_b" }
  ]
}

// Transition to finalized
POST /api/admin/pipeline/transition
{
  "sku": "PET-001",
  "fromStatus": "enriched",
  "toStatus": "finalized"
}
```

---

## Export Process

### Accessing Export

Navigate to the Export workspace at:

```
/admin/pipeline/export
```

### Export Options

The export interface allows filtering by status:

- `registered` - Export newly imported products
- `enriched` - Export enriched but not finalized products
- `finalized` - Export ready-to-export products
- `all` - Export all products regardless of status

### Export Format

The export generates an Excel (.xlsx) file with the following columns:

| Column | Source | Description |
|--------|--------|-------------|
| SKU | `sku` | Product identifier |
| Name | `consolidated.name` or `input.name` | Product name |
| Description | `consolidated.description` | Full product description |
| Price | `consolidated.price` | Product price |
| Brand | `consolidated.brand` | Brand name |
| Weight | `consolidated.weight` | Product weight |
| Category | `consolidated.category` | Product category |
| Product Type | `consolidated.product_type` | Type classification |
| Stock Status | `consolidated.stock_status` | In/Out of stock |
| Images | `selected_images` | URLs of selected images |

### Streaming Export

The export endpoint uses streaming to handle large datasets:

- Products fetched in pages of 200
- Rows written immediately to keep memory bounded
- Supports datasets of 10,000+ products

```typescript
// Example: Stream export
const response = await fetch('/api/admin/pipeline/export?status=finalized');
const blob = await response.blob();
const url = URL.createObjectURL(blob);

const a = document.createElement('a');
a.href = url;
a.download = 'products-export.xlsx';
a.click();
URL.revokeObjectURL(url);
```

---

## Migration Guide

### Running the Migration

To migrate existing products to the new pipeline statuses, run:

```bash
cd apps/web
npx tsx scripts/migrate-pipeline-statuses.ts
```

### Migration Mapping

The migration maps legacy statuses to new statuses:

| Legacy Status | New Status | Notes |
|---------------|------------|-------|
| `staging` | `registered` | Awaiting enrichment |
| `failed` | `registered` | Retry capability |
| `scraped` | `enriched` | Enrichment complete |
| `consolidated` | `finalized` | Ready for export |
| `approved` | `finalized` | Ready for export |
| `published` | `finalized` | Ready for export |

### Automatic Backup

The migration script creates an automatic backup of affected rows before making changes. The backup includes:

- Original `pipeline_status` values
- Timestamps
- SKU identifiers

### Rollback

If you need to rollback the migration:

```bash
cd apps/web
npx tsx scripts/rollback-pipeline-statuses.ts
```

This restores the original `pipeline_status` values from the backup.

### Post-Migration

After migration:

1. Update application code to use `pipeline_status_new` column
2. Verify status counts in admin dashboard
3. Test image selection workflow
4. Test export functionality

---

## API Endpoints

### POST /api/admin/pipeline/transition

Transitions a product from one status to another.

**Request:**

```typescript
{
  "sku": string;
  "fromStatus": "registered" | "enriched" | "finalized";
  "toStatus": "registered" | "enriched" | "finalized";
  "reason"?: string;
}
```

**Valid Transitions:**

- `registered` → `enriched`
- `enriched` → `finalized`
- `registered` → `finalized` (skip enrichment)

**Response:**

```typescript
{
  "success": true,
  "sku": "PET-001",
  "newStatus": "enriched"
}
```

**Error Codes:**

- `400` - Invalid transition or validation error
- `404` - Product not found
- `409` - Status mismatch (product not in expected `fromStatus`)

---

### GET /api/admin/pipeline/export

Generates an Excel export of products.

**Query Parameters:**

- `status` (required): `registered` | `enriched` | `finalized` | `all`

**Response:**

Returns a streaming Excel file (.xlsx) with product data.

**Headers:**

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="products-{status}-{date}.xlsx"
```

---

### POST /api/admin/pipeline/publish

Publishes finalized products to the storefront.

**Request:**

```typescript
{
  "skus": string[];  // Array of SKUs to publish
}
```

**Response:**

```typescript
{
  "success": true,
  "published": 5,
  "failed": 0,
  "products": [
    { "sku": "PET-001", "status": "published" }
  ]
}
```

---

### Additional Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/pipeline` | GET | List products with filtering |
| `/api/admin/pipeline/[sku]` | GET | Get single product |
| `/api/admin/pipeline/[sku]` | PATCH | Update product data |
| `/api/admin/pipeline/bulk` | POST | Bulk status updates |
| `/api/admin/pipeline/delete` | POST | Bulk delete products |
| `/api/admin/pipeline/counts` | GET | Get status counts |
| `/api/admin/pipeline/images` | POST | Save selected images |

---

## Developer Guide

### Adding New Pipeline Features

When working with the pipeline:

1. **Always use `pipeline_status_new`** for new code
2. **Validate transitions** with `validateStatusTransition()`
3. **Log all changes** to `pipeline_audit_log`
4. **Test with large datasets** to verify streaming performance

### Code Patterns

**Status transition:**

```typescript
import { validateStatusTransition } from '@/lib/pipeline';

const isValid = validateStatusTransition(fromStatus, toStatus);
if (!isValid) {
  throw new Error(`Invalid transition: ${fromStatus} → ${toStatus}`);
}
```

**Fetching products by status:**

```typescript
import { getProductsByStatus } from '@/lib/pipeline';

const products = await getProductsByStatus('finalized', { limit: 100 });
```

**Bulk operations:**

```typescript
import { bulkUpdateStatus } from '@/lib/pipeline';

await bulkUpdateStatus({
  skus: ['PET-001', 'PET-002'],
  newStatus: 'finalized'
});
```

### Testing

Run pipeline tests:

```bash
# Run all tests
bun run web test

# Run pipeline-specific tests
bun run web test -- --testPathPatterns="pipeline"
```

---

## Troubleshooting

### Products not appearing in export

- Verify product has `finalized` status
- Check `selected_images` column is populated
- Ensure no validation errors in `consolidated` data

### Image selection not saving

- Confirm SKU exists in `products_ingestion`
- Verify product has `image_candidates` array
- Check browser console for API errors

### Migration rollback needed

- Run rollback script: `npx tsx scripts/rollback-pipeline-statuses.ts`
- Verify backup data in rollback log
- Check `pipeline_audit_log` for transition history

---

## Related Documentation

- [API Endpoints](./api/pipeline-endpoints.md) - Detailed API reference
- [Migration Guide](./migration/pipeline-v2.md) - Legacy migration guide
- [Audit Log](./audit-log.md) - Audit trail documentation
