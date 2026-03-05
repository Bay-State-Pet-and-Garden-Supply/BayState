# crawl4ai Issue #1754 - Docker Deadlock Mitigation

## Issue Summary

**GitHub Issue:** [unclecode/crawl4ai#1754](https://github.com/unclecode/crawl4ai/issues/1754)  
**Status:** Root caused, fix in develop branch  
**Affected Version:** crawl4ai v0.8.0  
**Severity:** High - Production risk

### Problem Description

After several days of successful operation, crawl4ai containers become unresponsive due to an `asyncio.Lock` deadlock. The container logs show continuous warnings:

```
2026-02-10 06:59:17,220 - server - WARNING - Timeline update timeout after 4s
2026-02-10 06:59:26,221 - server - WARNING - Timeline update timeout after 4s
```

These warnings repeat indefinitely. The container cannot:
- Start new crawls
- Complete ongoing crawls
- Respond to health checks

### Root Cause

An `asyncio.Lock` deadlock in the crawl4ai server code causes the event loop to block, making the application unresponsive. This appears to be related to memory pressure and resource exhaustion over extended operation periods.

### Official Fix Status

- **Root cause identified** (labeled "Root caused" on GitHub)
- **Fix available** in the `develop` branch
- **Not yet merged** to stable release
- **Recommended action:** Implement mitigation until fix is released

---

## Mitigation Implementation

We have implemented a comprehensive health check and auto-restart system to detect and recover from Issue #1754 deadlocks.

### Components

#### 1. Health Check Script (`scripts/health_check.py`)

Monitors three key indicators:

| Check | Description | Threshold |
|-------|-------------|-----------|
| **Process Health** | Daemon process running and not zombie | Must be running |
| **Memory Usage** | Container memory consumption | < 1800 MB |
| **Deadlock Symptoms** | "Timeline update timeout" warnings | < 5 in 10 minutes |

The health check returns:
- **Exit 0** - Healthy, no action needed
- **Exit 1** - Unhealthy, triggers Docker restart

#### 2. Docker Health Check

Configured in both `docker-compose.yml` and `Dockerfile`:

```yaml
healthcheck:
  test: ["CMD", "python", "/app/scripts/health_check.py"]
  interval: 60s      # Check every minute
  timeout: 15s       # Must complete within 15s
  retries: 3         # 3 failures = unhealthy
  start_period: 30s  # Grace period on startup
  start_interval: 5s # Check frequently during startup
```

#### 3. Memory Limits

Set to prevent memory exhaustion leading to deadlock:

```yaml
deploy:
  resources:
    limits:
      memory: 2g    # Hard limit: 2GB per container
      cpus: '1.0'   # CPU limit for stability
    reservations:
      memory: 512m  # Minimum reserved memory
```

**Why 2GB?**
- crawl4ai + Playwright typically uses 800MB-1.2GB
- 2GB provides headroom for spikes without being excessive
- Higher limits (>4GB) were observed to delay deadlock detection
- Lower limits (<1.5GB) cause premature OOM kills

#### 4. Auto-Restart Policy

```yaml
restart: unless-stopped
```

Automatically restarts container when:
- Health check fails 3 consecutive times
- Process exits with error
- Container is OOM killed

---

## Verification

### Check Container Health Status

```bash
# View health status
docker inspect --format='{{.State.Health.Status}}' baystate-scraper

# View health check logs
docker inspect --format='{{json .State.Health}}' baystate-scraper | jq
```

Expected output when healthy:
```
healthy
```

### Monitor for Issue #1754 Symptoms

```bash
# Check logs for deadlock warnings
docker logs baystate-scraper | grep "Timeline update timeout"

# Check consecutive health failures
docker exec baystate-scraper cat /tmp/health_check_state.json
```

### Manual Recovery (if health check fails)

If the container becomes unresponsive before health check triggers:

```bash
# Force restart
docker restart baystate-scraper

# Or stop and start fresh
docker compose down
docker compose up -d
```

---

## Production Recommendations

### 1. Monitoring Setup

Add alerts for:
- Container restart frequency (>2/hour indicates problem)
- Health check failure rate
- Memory usage approaching 1.8GB
- "Timeline update timeout" log entries

### 2. Multi-Container Deployment

For high availability, deploy multiple scraper runners:

```yaml
services:
  scraper-1:
    # ... configuration
  scraper-2:
    # ... configuration
  scraper-3:
    # ... configuration
```

If one container hits Issue #1754, others continue processing.

### 3. Regular Updates

Monitor crawl4ai releases. When the fix is merged to stable:

1. Update `requirements.txt` to new version
2. Remove or reduce health check strictness
3. Update memory limits if needed
4. Document the change

### 4. Log Rotation

Ensure logs don't fill disk (already configured in docker-compose.yml):

```yaml
logging:
  driver: json-file
  options:
    max-size: "50m"
    max-file: "3"
```

---

## Troubleshooting

### Container Restarts Too Frequently

**Symptom:** Container restarts every few minutes

**Causes:**
- Memory limit too low (<1.5GB) - Increase to 2GB
- Health check thresholds too strict - Adjust in script
- Actual deadlock occurring on every start - Check crawl4ai version

**Check:**
```bash
docker logs --tail 100 baystate-scraper
docker stats baystate-scraper
```

### Health Check Script Errors

**Symptom:** Health check returns non-JSON output

**Fix:**
```bash
# Check if psutil is installed
docker exec baystate-scraper pip list | grep psutil

# If missing, rebuild image
 docker compose build --no-cache
```

### False Positive Deadlock Detection

**Symptom:** Container restarts but no "Timeline update timeout" in logs

**Causes:**
- Memory limit hit due to large job
- Temporary network issue to API

**Adjust:** Increase `MAX_DEADLOCK_WARNINGS` in health check script or increase memory limit.

---

## References

- [crawl4ai Issue #1754](https://github.com/unclecode/crawl4ai/issues/1754)
- [Docker Health Check Documentation](https://docs.docker.com/reference/dockerfile/#healthcheck)
- [Docker Compose Health Check](https://docs.docker.com/compose/compose-file/05-services/#healthcheck)
