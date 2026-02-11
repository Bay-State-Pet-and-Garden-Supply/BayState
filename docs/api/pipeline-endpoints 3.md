# Pipeline API Endpoints

All pipeline endpoints require admin authentication.

## Base URL
`/api/admin/pipeline`

## Endpoints

### 1. List Products
`GET /api/admin/pipeline`

Fetches products filtered by status and other criteria.

**Query Parameters:**
- `status` (optional): `staging` | `scraped` | `consolidated` | `approved` | `published`. Default: `staging`.
- `search` (optional): Search string for SKU or name.
- `limit` (optional): Number of records to return. Default: `200`.
- `offset` (optional): Pagination offset.
- `startDate` (optional): Filter by `updated_at` >= date.
- `endDate` (optional): Filter by `updated_at` <= date.
- `source` (optional): Filter by source ID.
- `minConfidence` (optional): Minimum confidence score (0.0 - 1.0).
- `maxConfidence` (optional): Maximum confidence score (0.0 - 1.0).

**Response:**
```json
{
  "products": [...],
  "count": 123
}
```

### 2. Get Product by SKU
`GET /api/admin/pipeline/[sku]`

Fetches a single product's ingestion data.

**Response:**
```json
{
  "product": {
    "sku": "...",
    "input": {...},
    "sources": {...},
    "consolidated": {...},
    "pipeline_status": "...",
    "confidence_score": 0.85,
    ...
  }
}
```

### 3. Update Product
`PATCH /api/admin/pipeline/[sku]`

Updates a product's consolidated data or status.

**Request Body:**
```json
{
  "consolidated": { ... },
  "pipeline_status": "approved"
}
```

### 4. Bulk Update Status
`POST /api/admin/pipeline/bulk`

Updates the status of multiple products at once.

**Request Body:**
```json
{
  "skus": ["SKU1", "SKU2"],
  "newStatus": "approved"
}
```

### 5. Bulk Delete
`POST /api/admin/pipeline/delete`

Permanently deletes multiple products from the ingestion pipeline.

**Request Body:**
```json
{
  "skus": ["SKU1", "SKU2"]
}
```

### 6. Status Counts
`GET /api/admin/pipeline/counts`

Returns the count of products in each pipeline stage.

**Response:**
```json
{
  "counts": [
    { "status": "staging", "count": 10 },
    { "status": "scraped", "count": 5 },
    ...
  ]
}
```

### 7. Export CSV
`GET /api/admin/pipeline/export`

Streams a CSV export of products for a given status.

**Query Parameters:**
- `status`: The pipeline status to export.
- `search` (optional): Filter by search term.
