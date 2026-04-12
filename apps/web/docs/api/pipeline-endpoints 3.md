# Pipeline API Endpoints

All pipeline endpoints require admin authentication.

## Base URL

`/api/admin/pipeline`

## Canonical workflow states

The pipeline uses one shared workflow vocabulary across persistence and UI:

- `imported`
- `scraping`
- `scraped`
- `consolidating`
- `finalizing`
- `exporting`
- `failed`

Legacy stage aliases are normalized at the route boundary:

- `finalized -> finalizing`
- `export -> exporting`
- `published -> exporting`

Legacy **status** values like `published` are rejected.

## Endpoints

### 1. List products

`GET /api/admin/pipeline`

Query parameters:

- `stage` (optional): canonical workflow tab/stage
- `status` (optional): canonical persisted workflow state
- `search` (optional): SKU/name search
- `limit` (optional): default `200`
- `offset` (optional): pagination offset
- `startDate` / `endDate` (optional): `updated_at` range
- `source` (optional): source filter
- `product_line` (optional): product line filter
- `cohort_id` (optional): cohort filter
- `minConfidence` / `maxConfidence` (optional): confidence range
- `selectAll=true` (optional): return matching SKUs instead of product rows

Response:

```json
{
  "products": [],
  "count": 0,
  "availableSources": []
}
```

With `selectAll=true`:

```json
{
  "skus": ["SKU1", "SKU2"],
  "count": 2
}
```

### 2. Get product by SKU

`GET /api/admin/pipeline/[sku]`

Returns the ingestion record and related editable data for a single SKU.

### 3. Update a product

`PATCH /api/admin/pipeline/[sku]`

Updates product data or moves a product to a valid workflow state.

Example body:

```json
{
  "consolidated": { "name": "Updated Product" },
  "pipeline_status": "finalizing"
}
```

### 4. Bulk update workflow status

`POST /api/admin/pipeline/bulk`

```json
{
  "skus": ["SKU1", "SKU2"],
  "newStatus": "scraping"
}
```

### 5. Transition workflow status

`POST /api/admin/pipeline/transition`

```json
{
  "sku": "SKU1",
  "fromStatus": "scraped",
  "toStatus": "finalizing"
}
```

### 6. Status counts

`GET /api/admin/pipeline/counts`

Returns counts for all active workflow states.

### 7. Publish from finalizing into exporting

`POST /api/admin/pipeline/publish`

- Requires `pipeline_status = finalizing`
- Creates or updates the storefront product row
- Moves the ingestion record to `exporting`

### 8. Spreadsheet export

`GET /api/admin/pipeline/export`

Downloads an XLSX export for a canonical workflow status or `all`.

Query parameters:

- `status`: `imported` | `scraping` | `scraped` | `consolidating` | `finalizing` | `exporting` | `failed` | `all`

### 9. ShopSite export queue endpoints

- `GET /api/admin/pipeline/export-xml`
- `GET /api/admin/pipeline/export-zip`
- `POST /api/admin/pipeline/upload-shopsite`

These endpoints operate on the active `exporting` queue (`pipeline_status = 'exporting'` and `exported_at IS NULL`).
