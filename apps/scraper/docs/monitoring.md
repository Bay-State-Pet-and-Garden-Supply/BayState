# Monitoring Guide

This guide covers monitoring and observability for the BayStateScraper infrastructure. The scraper provides built-in Prometheus metrics and optional Sentry error tracking.

## Overview

BayStateScraper exposes two monitoring interfaces:

1. **Prometheus Metrics** - Performance, cost, and operational metrics at `/metrics`
2. **Sentry Integration** - Error tracking and performance monitoring (optional)

Both are optional. The scraper runs fine without them, but they provide critical visibility for production deployments.

## Prometheus Setup

The scraper exposes a Prometheus-compatible metrics endpoint on port 8000 by default.

### Configuration

Set the port via environment variable:

```bash
METRICS_PORT=8000  # Default, change if needed
```

The endpoint serves metrics at:

```
http://localhost:8000/metrics
```

### Metrics Endpoint Behavior

- Starts automatically when the daemon starts
- Runs in a background thread (non-blocking)
- Returns Prometheus text format (version 0.0.4)
- Serves 404 for any path except `/metrics`
- Logs access through the standard logger

### Docker Considerations

When running in Docker, expose the metrics port:

```yaml
# docker-compose.yml
services:
  scraper:
    ports:
      - "8000:8000"  # Expose metrics port
```

Or when running directly:

```bash
docker run -p 8000:8000 baystate-scraper
```

## Sentry Setup

Sentry provides error tracking and performance monitoring. It's disabled by default.

### Configuration

Enable Sentry by setting the DSN:

```bash
SENTRY_DSN=https://public_key@o0.ingest.sentry.io/project_id
```

Get your DSN from: **Sentry Dashboard → Settings → Projects → [Your Project] → Client Keys**

### What Gets Tracked

When enabled, Sentry captures:

- Unhandled exceptions during job execution
- Extraction failures with context
- Anti-bot detection events
- Performance traces for extractions
- Breadcrumbs for debugging

### Context Tags

Sentry events include these tags for filtering:

| Tag | Description |
|-----|-------------|
| `job_id` | The scrape job UUID |
| `scraper_name` | Name of the scraper configuration |
| `extraction_mode` | llm_free, llm, or auto |
| `request_url` | The URL being scraped (scrubbed) |

## Available Metrics

All metrics use the `crawl4ai_` prefix.

### Extraction Metrics

#### crawl4ai_extractions_total

Counter of total extractions by mode.

| Label | Values |
|-------|--------|
| `mode` | `llm`, `llm_free`, `auto` |

**Example:**
```
crawl4ai_extractions_total{mode="llm"} 150
crawl4ai_extractions_total{mode="llm_free"} 850
crawl4ai_extractions_total{mode="auto"} 200
```

#### crawl4ai_success_rate

Gauge showing the overall extraction success rate (0.0 to 1.0).

**Example:**
```
crawl4ai_success_rate 0.943
```

#### crawl4ai_duration_ms

Gauge showing the average extraction duration in milliseconds.

**Example:**
```
crawl4ai_duration_ms 3420.5
```

### Cache Metrics

#### crawl4ai_cache_hit_rate

Gauge showing the cache hit rate (0.0 to 1.0).

**Example:**
```
crawl4ai_cache_hit_rate 0.325
```

### Error Metrics

#### crawl4ai_errors_total

Counter of errors by type.

| Label | Values |
|-------|--------|
| `type` | `network_error`, `timeout`, `rate_limit`, `anti_bot_detected`, `parse_error`, `validation_error`, `llm_error`, `unknown` |

**Example:**
```
crawl4ai_errors_total{type="anti_bot_detected"} 12
crawl4ai_errors_total{type="timeout"} 3
```

### Anti-Bot Metrics

#### crawl4ai_antibot_attempts_total

Counter of anti-bot bypass attempts.

| Label | Values |
|-------|--------|
| `result` | `success`, `failure` |

**Example:**
```
crawl4ai_antibot_attempts_total{result="success"} 45
crawl4ai_antibot_attempts_total{result="failure"} 5
```

#### crawl4ai_antibot_success_rate

Gauge showing the anti-bot bypass success rate (0.0 to 1.0).

**Example:**
```
crawl4ai_antibot_success_rate 0.9
```

### Cost Metrics

#### crawl4ai_cost_usd_total

Counter of total costs in USD.

| Label | Values |
|-------|--------|
| `type` | `llm`, `total` |

**Example:**
```
crawl4ai_cost_usd_total{type="llm"} 2.45
crawl4ai_cost_usd_total{type="total"} 2.45
```

#### crawl4ai_cost_average_usd

Gauge showing the average cost per extraction in USD.

**Example:**
```
crawl4ai_cost_average_usd 0.00245
```

## Example Prometheus Config

Add this to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'baystate-scraper'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: /metrics
    scrape_interval: 15s
    scrape_timeout: 10s
    
    # Optional: relabel if running multiple runners
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: '([^:]+):\d+'
        replacement: '${1}'

  # For multiple scrapers on different hosts
  - job_name: 'baystate-scraper-fleet'
    static_configs:
      - targets:
        - 'scraper-01:8000'
        - 'scraper-02:8000'
        - 'scraper-03:8000'
    metrics_path: /metrics
    scrape_interval: 15s
```

### Docker Compose with Prometheus

```yaml
version: '3.8'

services:
  scraper:
    image: baystate-scraper
    environment:
      - SCRAPER_API_URL=https://app.baystatepet.com
      - SCRAPER_API_KEY=bsr_your_key
      - METRICS_PORT=8000
    ports:
      - "8000:8000"

  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
```

## Troubleshooting

### Metrics endpoint not accessible

**Symptom:** Cannot reach `http://localhost:8000/metrics`

**Check:**
1. Verify the daemon is running: `docker logs baystate-scraper`
2. Check if port is exposed in Docker: `docker ps`
3. Confirm METRICS_PORT is set correctly

**Solution:**
```bash
# Check daemon logs for metrics server startup
docker logs baystate-scraper | grep -i "metrics server"

# Should see: "Metrics server started on port 8000"
```

### Metrics not updating

**Symptom:** Metrics show stale values

**Check:**
1. Verify extractions are actually running
2. Check if metrics collector is working

**Solution:**
```python
# In a Python shell inside the container
from src.crawl4ai_engine.metrics import get_metrics_collector
collector = get_metrics_collector()
print(collector.get_summary())
```

### Sentry not receiving events

**Symptom:** No events appear in Sentry dashboard

**Check:**
1. Verify SENTRY_DSN is set: `echo $SENTRY_DSN`
2. Check DSN format (should include https://)
3. Verify network connectivity to Sentry

**Solution:**
```python
# Test Sentry integration
import os
import sentry_sdk

dsn = os.environ.get("SENTRY_DSN")
if dsn:
    sentry_sdk.init(dsn=dsn)
    sentry_sdk.capture_message("Test message")
    print("Test event sent")
else:
    print("SENTRY_DSN not set")
```

### High memory usage from metrics

**Symptom:** Memory grows over time

**Cause:** Metrics collector stores all extraction records by default

**Solution:**
Metrics reset automatically on daemon restart (controlled by MAX_JOBS_BEFORE_RESTART). The default of 100 jobs provides a good balance between metrics granularity and memory usage.

To force a restart:
```bash
docker restart baystate-scraper
```

### Prometheus scraping errors

**Symptom:** Prometheus shows "connection refused" or timeout errors

**Check:**
1. Verify scraper is running: `docker ps`
2. Check network connectivity: `curl http://scraper-host:8000/metrics`
3. Verify firewall rules allow port 8000

**Solution:**
```bash
# Test metrics endpoint manually
curl -v http://localhost:8000/metrics

# Check if metrics are valid Prometheus format
curl http://localhost:8000/metrics | promtool check metrics
```

### Missing metrics labels

**Symptom:** Some metrics appear without expected labels

**Cause:** Labels are only present when relevant events occur

**Example:** Error type labels only appear after errors of that type occur:
```
# Before any anti-bot errors:
crawl4ai_errors_total{type="anti_bot_detected"}  # Won't exist

# After anti-bot errors occur:
crawl4ai_errors_total{type="anti_bot_detected"} 12
```

This is normal Prometheus behavior. Absence of a label means zero occurrences.

## Best Practices

1. **Always enable metrics in production** - They're lightweight and invaluable for debugging
2. **Set up Sentry for error tracking** - Catches issues you might miss in logs
3. **Use a dedicated METRICS_PORT** - Don't share with application traffic
4. **Monitor the success_rate metric** - Drop below 0.9 indicates problems
5. **Track cost_usd_total** - LLM costs can add up quickly
6. **Set up alerts on error rates** - Sudden spikes indicate site changes or blocks

## Related Documentation

- [crawl4ai Configuration](crawl4ai-config.md) - Engine configuration options
- [Migration Guide](migration-guide.md) - Migrating from browser-use
