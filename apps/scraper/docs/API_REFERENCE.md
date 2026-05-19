# API Reference: Runner ↔ Coordinator Communication (v0.3.0+)

This document describes the API contract between scraper runners and the BayStateApp coordinator for the enrichment-based pipeline.

## Authentication

All endpoints require an API key in the `X-API-Key` header:

```http
X-API-Key: bsr_your_api_key_here
```

API keys are issued from the BayStateApp admin panel.

## Endpoints

### 1. Claim Enrichment Attempt

Claim the next pending enrichment attempt from the queue.

**POST /api/scraper/v1/claim-enrichment**

Request Body:
```json
{
  "runner_name": "office-mac",
  "max_attempts": 1
}
```

Response:
```json
{
  "attempts": [
    {
      "id": "attempt-uuid",
      "job_id": "job-uuid",
      "sku": "072705115310",
      "source_url": "https://example.com/product/123",
      "domain": "example.com",
      "model": "deepseek-chat",
      "mode": "mixed",
      "ai_credentials": { ... },
      "lease_token": "token-abc",
      "lease_expires_at": "2024-01-15T10:35:00Z",
      "source_plan": { ... }
    }
  ]
}
```

### 2. Submit Enrichment Result

Submit the result of an enrichment attempt.

**POST /api/scraper/v1/enrichment-callback**

Request Body (EnrichmentResultV1 + metadata):
```json
{
  "sku": "072705115310",
  "status": "success",
  "product": {
    "name": "Product Title",
    "brand": "Brand Name",
    "weight": "30lb",
    "description": "...",
    "image_urls": ["..."]
  },
  "confidence": {
    "overall": 0.95,
    "fields": { "name": 0.99, "price": 0.95 }
  },
  "_attempt_id": "attempt-uuid",
  "_status": "success",
  "_lease_token": "token-abc"
}
```

### 3. Heartbeat

Indicate that the runner is alive.

**POST /api/scraper/v1/heartbeat**

Request Body:
```json
{
  "runner_name": "office-mac",
  "status": "online",
  "current_job_id": "job-uuid"
}
```

### 4. Post Logs

Batch upload runner logs.

**POST /api/scraper/v1/logs**

Request Body:
```json
{
  "job_id": "job-uuid",
  "logs": [
    { "level": "info", "message": "Enrichment started", "timestamp": "..." }
  ]
}
```

### 5. Fetch Scraper Configs

Fetch specialized scraper configurations (used for approved sources or custom extraction).

**GET /api/internal/scraper-configs/{slug}**

Response:
```json
{
  "name": "slug",
  "scraper_type": "crawl4ai",
  "base_url": "...",
  "crawl4ai_config": { ... },
  "workflows": [ ... ]
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

Common HTTP status codes:
- `400` - Bad request (missing/invalid parameters)
- `401` - Unauthorized (invalid or missing API key)
- `404` - Not found
- `426` - Upgrade Required (Runner image build mismatch)
- `500` - Server error
