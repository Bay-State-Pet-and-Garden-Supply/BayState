# Event Schema v2 Documentation

Scraper Studio introduces an enhanced event schema (v2) for reporting scraper execution details. This schema is used by the runners to provide granular feedback during test runs and production jobs.

## Execution Timeline Events

These events are reported during the lifecycle of a scrape job to provide real-time visibility into the runner's progress.

### Step Started
Emitted when the runner begins executing a specific workflow step.

**Schema**
```json
{
  "event": "step_started",
  "job_id": "uuid",
  "step_id": "string",
  "step_type": "navigate | extract | action | auth",
  "timestamp": "iso-8601"
}
```

### Step Completed
Emitted when a workflow step finishes successfully.

**Schema**
```json
{
  "event": "step_completed",
  "job_id": "uuid",
  "step_id": "string",
  "duration_ms": 450,
  "timestamp": "iso-8601",
  "metadata": {
    "url": "string",
    "status_code": 200
  }
}
```

### Step Failed
Emitted when a workflow step encounters an error.

**Schema**
```json
{
  "event": "step_failed",
  "job_id": "uuid",
  "step_id": "string",
  "error_type": "timeout | selector_not_found | validation_failed | network_error",
  "error_message": "string",
  "retry_count": 2,
  "timestamp": "iso-8601",
  "debug_info": {
    "screenshot_url": "string",
    "page_content_preview": "string"
  }
}
```

## Selector Health Events

These events are used by Scraper Studio to monitor the reliability of individual CSS selectors.

### Selector Match
Emitted when a selector successfully matches elements on a page.

**Schema**
```json
{
  "event": "selector_match",
  "config_id": "uuid",
  "selector_id": "string",
  "match_count": 1,
  "match_quality": 1.0,
  "timestamp": "iso-8601"
}
```

### Selector Miss
Emitted when a required selector fails to find any matches.

**Schema**
```json
{
  "event": "selector_miss",
  "config_id": "uuid",
  "selector_id": "string",
  "context_url": "string",
  "timestamp": "iso-8601"
}
```

## Result Payloads

When a job or test run completes, the final result payload follows this structure:

```json
{
  "job_id": "uuid",
  "status": "completed | failed | partial",
  "results": {
    "skus_processed": 5,
    "scrapers_run": ["amazon", "chewy"],
    "data": {
      "SKU-123": {
        "price": 19.99,
        "availability": "in_stock",
        "scraped_at": "iso-8601"
      }
    }
  },
  "metrics": {
    "total_duration_ms": 5600,
    "network_usage_bytes": 102400,
    "memory_peak_mb": 128
  }
}
```
