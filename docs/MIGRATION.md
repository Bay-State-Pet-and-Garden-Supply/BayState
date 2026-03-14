# Migration Guide: GitHub Actions to Direct Docker Runners

This guide explains how to migrate your scraper infrastructure from GitHub Actions-based runners to direct Docker-based runners with polling and realtime capabilities. The new architecture uses crawl4ai for improved reliability, cost savings, and faster execution.

---

## Table of Contents

1. [Overview: Why Migrate?](#overview-why-migrate)
2. [Prerequisites](#prerequisites)
3. [Architecture Changes](#architecture-changes)
4. [Step-by-Step Migration](#step-by-step-migration)
5. [Direct Runner Setup](#direct-runner-setup)
6. [Troubleshooting](#troubleshooting)
7. [FAQ](#faq)
8. [Rollback Instructions](#rollback-instructions)

---

## Overview: Why Migrate?

### The Problem with GitHub Actions

GitHub Actions served us well for initial prototyping, but several limitations emerged at scale:

| Issue | Impact |
|-------|--------|
| **Queue delays** | Jobs wait in GitHub's shared queue, sometimes 5-15 minutes |
| **Rate limiting** | 1,000 API requests/hour per repository |
| **Ephemeral storage** | No local cache between runs, repeated downloads |
| **Cost** | $0.008/minute for Linux runners adds up with frequent jobs |
| **Complexity** | Workflow files, secrets management, action versioning |
| **Limited observability** | Hard to debug failures in ephemeral containers |

### Benefits of Direct Runners

The new Docker-based runner architecture solves these problems:

| Benefit | How It Helps |
|---------|--------------|
| **Instant startup** | No queue waits, runners are always ready |
| **Polling + Realtime** | Check for jobs every 30s or receive instant websocket pushes |
| **Local caching** | Docker volumes persist between jobs for faster execution |
| **Cost reduction** | Use your own hardware, 60-80% cost savings |
| **crawl4ai engine** | Purpose-built scraping engine with retry logic, anti-detection |
| **Better debugging** | Persistent logs, local browser visibility mode |
| **Scalability** | Add runners by running one command on any machine |

### crawl4ai Engine Benefits

The new architecture introduces crawl4ai, a modern scraping engine:

- **Automatic retry logic** with exponential backoff and circuit breakers
- **Anti-detection measures** built-in, rotating user agents and fingerprints
- **Multiple extraction strategies**: CSS selectors, XPath, LLM-powered extraction
- **Smart fallback**: Falls back to alternative methods when primary fails
- **Structured logging**: JSON logs with job context for easy debugging
- **Memory management**: Automatic restart after configurable job counts

---

## Prerequisites

Before starting migration, ensure you have:

### For BayStateApp (Coordinator)

- [ ] BayStateApp deployed and accessible
- [ ] Admin access to generate runner API keys
- [ ] (Optional) Supabase service role key for realtime mode

### For Runner Machines

- [ ] Docker Engine 20.10+ installed
- [ ] Docker Compose 2.0+ installed
- [ ] Internet connectivity to reach BayStateApp API
- [ ] Minimum 2GB RAM, 10GB disk space per runner
- [ ] Linux, macOS, or Windows with WSL2

### Knowledge Requirements

- [ ] Basic Docker commands (`docker run`, `docker logs`)
- [ ] Access to your server's terminal/SSH
- [ ] Understanding of your current GitHub Actions workflows

---

## Architecture Changes

### Before: GitHub Actions Flow

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Admin UI   │────▶│  Scrape Job     │────▶│  GitHub Actions │
│             │     │  (scrape_jobs)  │     │  (workflow_dispatch)
└─────────────┘     └─────────────────┘     └────────┬────────┘
                                                     │
                         ┌───────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Ephemeral Runner   │
              │  (ubuntu-latest)    │
              │  - Pulls repo       │
              │  - Installs deps    │
              │  - Runs scraper     │
              │  - Reports results  │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  API Callback       │
              │  /api/admin/        │
              │  scraping/callback  │
              └─────────────────────┘
```

### After: Direct Runner Flow

```
┌─────────────┐     ┌─────────────────┐
│  Admin UI   │────▶│  Scrape Job     │
│             │     │  (scrape_jobs)  │
└─────────────┘     └─────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │ Polling (30s)      │ Realtime (instant) │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Docker Runner  │  │  Docker Runner  │  │  Docker Runner  │
│  (Always On)    │  │  (Always On)    │  │  (Always On)    │
│  - Polls API    │  │  - Websocket    │  │  - Polls API    │
│  - Local cache  │  │  - Local cache  │  │  - Local cache  │
│  - crawl4ai     │  │  - crawl4ai     │  │  - crawl4ai     │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                   ┌─────────────────────┐
                   │  API Callback       │
                   │  /api/admin/        │
                   │  scraping/callback  │
                   └─────────────────────┘
```

### Key Differences

| Aspect | GitHub Actions | Direct Runners |
|--------|---------------|----------------|
| **Startup time** | 1-5 minutes | Instant (always running) |
| **Job discovery** | Webhook trigger | Polling or realtime websocket |
| **Authentication** | GitHub token | API key (`bsr_...`) |
| **Environment** | Fresh VM each run | Persistent Docker container |
| **Scaling** | Edit workflow, manage concurrency | Run one command per machine |
| **Caching** | Limited GitHub cache | Docker volumes, local storage |

---

## Step-by-Step Migration

### Phase 1: Prepare the Coordinator (BayStateApp)

#### Step 1.1: Verify API Endpoints

Ensure your BayStateApp has these endpoints available:

```bash
# Test the poll endpoint (should return empty or a job)
curl -H "X-API-Key: bsr_test" \
  https://your-app.com/api/scraper/v1/poll

# Test the heartbeat endpoint
curl -X POST -H "X-API-Key: bsr_test" \
  https://your-app.com/api/scraper/v1/heartbeat
```

Expected response for poll (no jobs):
```json
{ "job": null }
```

Expected response for heartbeat:
```json
{ "status": "ok" }
```

#### Step 1.2: Configure Supabase Realtime (Optional but Recommended)

For instant job dispatch instead of polling:

1. Go to **Supabase Dashboard** → Your Project → **Settings** → **API**
2. Copy the **service_role** key (starts with `eyJ...`)
3. Save this key for runner configuration

This enables websocket-based job dispatch, eliminating the 30-second polling delay.

#### Step 1.3: Create Runner API Keys

1. Log into BayStateApp admin panel
2. Navigate to **Scrapers → Network**
3. Click **Runner Accounts**
4. Click **Add Runner**
5. Copy the generated API key (starts with `bsr_`)

**Important**: Each physical machine needs its own key. Generate one key per runner.

---

### Phase 2: Deploy the First Direct Runner

#### Step 2.1: Choose Your Deployment Method

**Option A: One-Line Installer (Recommended)**

Fastest method, works on most Linux/macOS systems:

```bash
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
```

**Option B: Manual Docker Compose**

For more control or Windows systems:

```bash
# Clone the repository
git clone https://github.com/Bay-State-Pet-and-Garden-Supply/BayStateScraper.git
cd BayStateScraper

# Create environment file
cat > .env << EOF
SCRAPER_API_URL=https://your-app.com
SCRAPER_API_KEY=bsr_your_key_here
RUNNER_NAME=runner-$(hostname)
POLL_INTERVAL=30
MAX_JOBS_BEFORE_RESTART=100
BSR_SUPABASE_REALTIME_KEY=eyJ...  # Optional, for realtime
EOF

# Start the runner
docker compose up -d
```

#### Step 2.2: Run the Setup Wizard

If using the one-line installer:

1. The wizard will prompt for:
   - **API URL**: Your BayStateApp URL (e.g., `https://app.baystatepet.com`)
   - **API Key**: Paste the `bsr_...` key you generated
   - **Runner Name**: Auto-detected from hostname (can customize)
   - **Auto-updates**: Recommended to enable

2. The installer will:
   - Check Docker installation
   - Pull the latest scraper image
   - Start the container with restart policy
   - Save config to `~/.baystate-scraper/runner.env`

#### Step 2.3: Verify the Runner is Connected

1. Return to BayStateApp admin → **Scrapers → Network**
2. Look for your runner name in the list
3. Status should show as **online** or **ready**

Check runner logs:

```bash
# View logs
docker logs -f baystate-scraper

# You should see:
# - "Runner registered successfully"
# - "Polling for jobs..." or "Connected to realtime"
# - Heartbeat messages every 30 seconds
```

---

### Phase 3: Test the New Runner

#### Step 3.1: Create a Test Scrape Job

1. In BayStateApp admin, go to **Scrapers → Jobs**
2. Click **New Job**
3. Select a small test set (2-3 SKUs)
4. Select one scraper config
5. Click **Start Job**

#### Step 3.2: Monitor Execution

Watch the runner logs in real-time:

```bash
docker logs -f baystate-scraper
```

You should see:
- Job received
- crawl4ai engine initializing
- SKU processing with progress
- Results being posted to callback
- Job completion

#### Step 3.3: Verify Results

1. Check **Scrapers → Jobs** in admin panel
2. The job status should show **completed**
3. View the results to confirm data was scraped correctly
4. Check **Products → Ingestion** for the ingested data

---

### Phase 4: Migrate Production Workloads

#### Step 4.1: Run Parallel (Recommended Approach)

For a safe migration, run both GitHub Actions and direct runners in parallel:

1. **Week 1-2**: Keep GitHub Actions as primary
   - Deploy 1-2 direct runners
   - Route 10% of traffic to direct runners (via admin panel)
   - Monitor error rates, compare performance

2. **Week 3**: Increase direct runner share
   - Route 50% of traffic to direct runners
   - Monitor metrics, adjust as needed

3. **Week 4**: Complete migration
   - Route 100% to direct runners
   - Disable GitHub Actions triggers
   - Update documentation

#### Step 4.2: Disable GitHub Actions

Once confident in direct runners:

1. In your repository, go to **Settings → Actions → General**
2. Under **Actions permissions**, select **Disable actions for this repository**
3. Or keep enabled but remove the `workflow_dispatch` trigger from `.github/workflows/scrape.yml`

#### Step 4.3: Scale Up Runners

Add more runners by repeating Phase 2 on additional machines:

```bash
# On each new machine:
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
# Use a new API key for each runner
```

---

## Direct Runner Setup

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCRAPER_API_URL` | Yes | - | BayStateApp base URL |
| `SCRAPER_API_KEY` | Yes | - | Runner API key from admin panel |
| `RUNNER_NAME` | No | hostname | Unique identifier for this runner |
| `POLL_INTERVAL` | No | 30 | Seconds between job polls |
| `MAX_JOBS_BEFORE_RESTART` | No | 100 | Auto-restart for memory hygiene |
| `BSR_SUPABASE_REALTIME_KEY` | No | - | Service role key for websocket mode |
| `HEADLESS` | No | `true` | Set `false` to see browser (debugging) |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

### Deployment Patterns

#### Pattern 1: Single Machine, Single Runner

Simplest setup for small-scale operations:

```yaml
# docker-compose.yml
version: '3.8'
services:
  scraper:
    image: ghcr.io/bay-state-pet-and-garden-supply/baystatescraper:latest
    container_name: baystate-scraper
    restart: unless-stopped
    environment:
      - SCRAPER_API_URL=${SCRAPER_API_URL}
      - SCRAPER_API_KEY=${SCRAPER_API_KEY}
      - RUNNER_NAME=${RUNNER_NAME}
      - POLL_INTERVAL=30
    volumes:
      - scraper-cache:/app/cache
      - scraper-logs:/app/logs

volumes:
  scraper-cache:
  scraper-logs:
```

#### Pattern 2: Multiple Runners on One Machine

For higher throughput on a single powerful machine:

```bash
# Start 3 runners on one machine
for i in 1 2 3; do
  docker run -d \
    --name baystate-scraper-$i \
    --restart unless-stopped \
    -e SCRAPER_API_URL=https://app.baystatepet.com \
    -e SCRAPER_API_KEY=bsr_runner_$i \
    -e RUNNER_NAME=server-runner-$i \
    -v scraper-cache-$i:/app/cache \
    ghcr.io/bay-state-pet-and-garden-supply/baystatescraper:latest
done
```

#### Pattern 3: Distributed Runners (Multiple Machines)

For geographic distribution or high availability:

```
Machine A (Office):
  - runner-office-1
  - runner-office-2

Machine B (Home):
  - runner-home-1

Machine C (Cloud VPS):
  - runner-cloud-1
  - runner-cloud-2
```

Each machine runs the one-line installer with a unique API key.

---

## Troubleshooting

### Common Issues and Solutions

#### Issue: Runner shows "offline" in admin panel

**Symptoms**: Runner not appearing in network list or showing offline status.

**Diagnostic Steps**:

```bash
# Check if container is running
docker ps | grep baystate-scraper

# Check logs for errors
docker logs baystate-scraper --tail 100

# Test API connectivity from container
docker exec baystate-scraper curl -v ${SCRAPER_API_URL}/api/admin/scraper-network/health
```

**Solutions**:

1. **Container not running**: Start it
   ```bash
   docker start baystate-scraper
   ```

2. **API key invalid**: Check the key in admin panel, regenerate if needed
   ```bash
   # Edit the env file
   nano ~/.baystate-scraper/runner.env
   
   # Restart container
   docker restart baystate-scraper
   ```

3. **Network connectivity**: Verify firewall rules
   ```bash
   # Test from host machine
   curl -I ${SCRAPER_API_URL}/api/admin/scraper-network/health
   ```

#### Issue: Jobs not being picked up

**Symptoms**: Jobs stay in "pending" status, runner not processing.

**Diagnostic Steps**:

```bash
# Check runner logs for polling activity
docker logs baystate-scraper --tail 50 | grep -i "poll\|job"

# Verify runner is in "ready" state (not busy)
docker logs baystate-scraper | grep "status"
```

**Solutions**:

1. **Runner busy**: Wait or restart if stuck
   ```bash
   docker restart baystate-scraper
   ```

2. **Polling misconfiguration**: Check POLL_INTERVAL
   ```bash
   docker exec baystate-scraper env | grep POLL
   ```

3. **API endpoint issues**: Test manually
   ```bash
   curl -H "X-API-Key: ${SCRAPER_API_KEY}" \
     "${SCRAPER_API_URL}/api/scraper/v1/poll"
   ```

#### Issue: crawl4ai engine crashes during scraping

**Symptoms**: Runner starts job but crashes mid-execution, browser errors.

**Diagnostic Steps**:

```bash
# Check for OOM (out of memory)
docker stats baystate-scraper --no-stream

# Check recent error logs
docker logs baystate-scraper --tail 200 | grep -i "error\|fatal\|traceback"
```

**Solutions**:

1. **Memory issues**: Increase container memory or reduce concurrency
   ```bash
   # Stop and recreate with more memory
   docker stop baystate-scraper
   docker rm baystate-scraper
   docker run -d \
     --name baystate-scraper \
     --memory=4g \
     --restart unless-stopped \
     -e SCRAPER_API_URL=${SCRAPER_API_URL} \
     -e SCRAPER_API_KEY=${SCRAPER_API_KEY} \
     ghcr.io/bay-state-pet-and-garden-supply/baystatescraper:latest
   ```

2. **Browser crash**: Enable headful mode to debug
   ```bash
   # Edit env file, set HEADLESS=false
   # (Requires machine with display or VNC)
   ```

3. **Auto-restart**: Lower MAX_JOBS_BEFORE_RESTART
   ```bash
   # In runner.env, set:
   MAX_JOBS_BEFORE_RESTART=50
   ```

#### Issue: Realtime connection failing

**Symptoms**: Runner falls back to polling even with realtime key configured.

**Diagnostic Steps**:

```bash
# Check if realtime key is set
docker exec baystate-scraper env | grep REALTIME

# Check logs for websocket errors
docker logs baystate-scraper | grep -i "websocket\|realtime\|supabase"
```

**Solutions**:

1. **Wrong key**: Ensure you're using service_role key, not anon key
2. **Supabase config**: Check Realtime is enabled in Supabase dashboard
3. **Network**: WebSocket port might be blocked
   ```bash
   # Test websocket connection
   curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Host: your-supabase-project.supabase.co" \
     -H "Origin: https://your-app.com" \
     https://your-supabase-project.supabase.co/realtime/v1/websocket
   ```

#### Issue: Results not appearing in BayStateApp

**Symptoms**: Job completes on runner but no data in ingestion.

**Diagnostic Steps**:

```bash
# Check callback logs
docker logs baystate-scraper | grep -i "callback\|submit"

# Check if callback succeeded
docker logs baystate-scraper | grep -A5 "POST.*callback"
```

**Solutions**:

1. **Callback failing**: Check API key has proper permissions
2. **Payload too large**: Check runner logs for 413 errors
   ```bash
   # If results are large, runner batches them
   # Check LOG_LEVEL=DEBUG for details
   ```

3. **HMAC mismatch**: If using legacy fallback, verify webhook secret

---

## FAQ

### General Questions

**Q1: Why should I migrate from GitHub Actions?**

Direct runners offer instant startup (no queue waits), lower costs, better caching, and more control. GitHub Actions charges per minute and has rate limits. Direct runners run on your hardware with flat costs.

**Q2: Can I run both GitHub Actions and direct runners together?**

Yes. During migration, run both in parallel. The coordinator will distribute jobs to whichever runners are available. Gradually shift traffic to direct runners while monitoring.

**Q3: What hardware do I need for a runner?**

Minimum: 2GB RAM, 10GB disk, 1 CPU core. Recommended: 4GB RAM, 20GB disk, 2+ cores for parallel SKU processing. Any Linux, macOS, or Windows with WSL2 works.

**Q4: Is Docker required?**

Yes, Docker is required for the recommended setup. It ensures consistent environments and easy updates. If you cannot use Docker, you can run the Python daemon directly (see ADVANCED.md).

**Q5: How do I update runners?**

If you enabled auto-updates during setup, runners update automatically every hour when a new image is available. Manual update:

```bash
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
```

### crawl4ai Questions

**Q6: What is crawl4ai and why use it?**

crawl4ai is the new scraping engine replacing the legacy Playwright-based scraper. It provides automatic retries, anti-detection, multiple extraction strategies, and better error handling. It's purpose-built for robust web scraping.

**Q7: Do I need to change my scraper configurations?**

No. Existing YAML configs work with crawl4ai. The engine automatically handles extraction. You can optionally use new crawl4ai-specific features like LLM-powered extraction by updating configs.

**Q8: How does crawl4ai handle anti-bot measures?**

crawl4ai includes built-in anti-detection: rotating user agents, browser fingerprint randomization, request timing randomization, and automatic retry with backoff. It also supports proxy rotation (configure in admin panel).

### Security Questions

**Q9: Are direct runners less secure than GitHub Actions?**

No. Both use API key authentication. Direct runners never have database access (same as GitHub Actions). The API key is stored in Docker secrets, not in code. Runners communicate via HTTPS only.

**Q10: How do I revoke a compromised runner key?**

1. Go to BayStateApp admin → Scrapers → Network → Runner Accounts
2. Find the compromised runner
3. Click **Revoke Key**
4. Generate a new key for that runner
5. Update the runner's configuration and restart

**Q11: Can runners access my database?**

No. Runners only communicate via the API. They have no database credentials. This is the same security model as GitHub Actions. The coordinator (BayStateApp) handles all database operations.

### Operational Questions

**Q12: How many runners should I run?**

Start with 2-3 runners for redundancy. Each runner processes one job at a time. For high volume, add more runners or increase MAX_JOBS_BEFORE_RESTART. Monitor the admin panel to see runner utilization.

**Q13: What happens if a runner goes offline mid-job?**

The coordinator detects the missed heartbeat and marks the job as failed after a timeout (5 minutes). The job can be retried. Results from partial execution are preserved and visible in logs.

**Q14: How do I debug scraping failures?**

1. Check runner logs: `docker logs -f baystate-scraper`
2. Set HEADLESS=false to watch the browser (requires display)
3. Check the Test Lab in admin panel for detailed traces
4. Enable DEBUG logging: set `LOG_LEVEL=DEBUG` in runner.env

**Q15: Can I run runners on Raspberry Pi or ARM devices?**

Yes, the Docker image supports ARM64. Raspberry Pi 4 (4GB+) works well for light workloads. Performance will be slower than x86_64. Use `docker pull --platform linux/arm64` if needed.

### Migration Questions

**Q16: Will migration cause downtime?**

No. Run GitHub Actions and direct runners in parallel during migration. The coordinator routes jobs to available runners. No changes needed to BayStateApp during the transition.

**Q17: How long does migration take?**

Plan for 2-4 weeks for a full migration:
- Week 1: Deploy 1-2 runners, test thoroughly
- Week 2: Run parallel, monitor metrics
- Week 3: Shift 50% traffic to direct runners
- Week 4: Complete migration, disable GitHub Actions

**Q18: What if I need to rollback?**

See the [Rollback Instructions](#rollback-instructions) section below. You can re-enable GitHub Actions by restoring the workflow file and triggering jobs. Direct runners can remain running or be stopped.

---

## Rollback Instructions

If you need to revert to GitHub Actions:

### Step 1: Re-enable GitHub Actions

1. Go to your repository **Settings → Actions → General**
2. Select **Allow all actions and reusable workflows**
3. Restore the workflow file if it was deleted:

```yaml
# .github/workflows/scrape.yml
name: Scrape Products

on:
  workflow_dispatch:
    inputs:
      job_id:
        description: 'Scrape Job ID'
        required: true
      environment:
        description: 'Environment'
        required: true
        default: 'production'

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          python -m playwright install chromium
      
      - name: Run scraper
        env:
          SCRAPER_API_URL: ${{ vars.SCRAPER_API_URL }}
          SCRAPER_API_KEY: ${{ secrets.SCRAPER_API_KEY }}
        run: |
          python runner.py --job-id ${{ github.event.inputs.job_id }}
```

### Step 2: Update Repository Secrets

Ensure these secrets are configured:
- `SCRAPER_API_KEY`: A valid runner API key
- `SCRAPER_API_URL`: Your BayStateApp URL

### Step 3: Stop Direct Runners (Optional)

If you want to stop direct runners:

```bash
# On each runner machine
docker stop baystate-scraper
docker rm baystate-scraper

# Or stop all runners on a machine
for container in $(docker ps -q --filter "name=baystate-scraper"); do
  docker stop $container
  docker rm $container
done
```

### Step 4: Disable Direct Runner Registration

1. In BayStateApp admin → Scrapers → Network
2. Select each direct runner
3. Click **Unregister** or set status to **disabled**

### Step 5: Test GitHub Actions

1. Create a test scrape job in admin panel
2. Verify it triggers a GitHub Actions workflow
3. Monitor the Actions tab for execution
4. Verify results appear in Products → Ingestion

### Emergency Quick Rollback

If direct runners are causing issues and you need immediate rollback:

```bash
# Stop all direct runners immediately (run on each machine)
docker kill $(docker ps -q --filter "name=baystate-scraper")

# In BayStateApp admin, mark all direct runners as disabled
# GitHub Actions jobs will queue until Actions is re-enabled
```

### Partial Rollback (Keep Direct Runners for Backup)

If you want to keep direct runners available but primarily use GitHub Actions:

1. Keep direct runners running
2. In BayStateApp admin, set direct runner priority to **low**
3. Re-enable GitHub Actions
4. Jobs will prefer GitHub Actions but fall back to direct runners if Actions queue is full

---

## Additional Resources

- [Runner Setup Guide](../BayStateApp/docs/runner-setup.md) - One-line installation details
- [API Reference](../BayStateScraper/docs/API_PROPOSAL.md) - Runner/coordinator API contract
- [Architecture Overview](../BayStateScraper/docs/ARCHITECTURE.md) - System design details
- [crawl4ai Documentation](https://github.com/unclecode/crawl4ai) - External crawl4ai library docs

---

## Support

If you encounter issues not covered in this guide:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review runner logs: `docker logs baystate-scraper`
3. Check BayStateApp admin → Scrapers → Network for runner status
4. File an issue with logs and reproduction steps

---

*Last updated: 2026-02-27*
*Version: 1.0*
