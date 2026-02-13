# Scraper Studio API Reference

This document outlines the API endpoints specifically designed for Scraper Studio within the BayState Admin Portal.

## Test Run Management

### Create Test Run
`POST /api/admin/scrapers/studio/test`

Creates a new test run for a specific scraper configuration.

**Request Body**
| Field | Type | Description |
|-------|------|-------------|
| `config_id` | `uuid` | **Required**. The ID of the scraper configuration to test. |
| `version_id` | `uuid` | Optional. Specific version ID to test. Defaults to the current version. |
| `skus` | `string[]` | Optional. List of SKUs to test. If omitted, default test SKUs from the config are used. |
| `options.priority` | `'normal' \| 'high'` | Optional. Priority of the test job. Defaults to `'normal'`. |
| `options.timeout` | `number` | Optional. Timeout for the test run in seconds. |

**Success Response (201 Created)**
```json
{
  "test_run_id": "uuid",
  "status": "pending",
  "job_id": "uuid",
  "config_id": "uuid",
  "version_id": "uuid",
  "skus_count": 1,
  "message": "Test run created. A runner will pick it up and process it."
}
```

### Get Test Run Status
`GET /api/admin/scrapers/studio/test/[id]`

Retrieves the current status and results of a test run.

**Success Response (200 OK)**
```json
{
  "id": "uuid",
  "status": "pending | running | passed | failed | partial",
  "scraped_data": [],
  "metrics": {
    "duration_ms": 1200,
    "steps_completed": 5,
    "errors_count": 0
  }
}
```

## Health and Metrics

### Scraper Health Metrics
`GET /lib/admin/scraper-health/metrics` (Internal Library Function)

While not a direct REST endpoint, this library function provides the data for the Health Dashboard.

**Parameters**
- `config_id` (optional): Filter metrics for a specific configuration.
- `days` (default: 30): Number of days of historical data to retrieve.

**Response**
Returns an array of daily health metrics including:
- `total_runs`
- `passed_runs`
- `failed_runs`
- `avg_duration_ms`

## Scraper Callback (Shared)

### Scraper Callback
`POST /api/admin/scraping/callback`

Secure endpoint for runners to report job progress and results. Scraper Studio test runs use this same callback mechanism.

**Headers**
- `X-API-Key`: Required for authentication (`bsr_*`).
- `X-Runner-Signature`: HMAC signature of the payload (if configured).

**Request Body**
| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `uuid` | The ID of the scrape job. |
| `status` | `string` | Current job status (`running`, `completed`, `failed`). |
| `results` | `object` | The scraped data and execution metrics. |
| `error_message` | `string` | Optional. Error description if the job failed. |

## Internal Management

### Update Daily Metrics
`RPC public.update_health_metrics()`

Database function to aggregate test run results into daily health metrics. Typically triggered by a scheduled job or after a batch of test runs completes.
