# BayStateScraper v0.3.0

Distributed headless scraper runners for Bay State Pet & Garden Supply.

## What's New in v0.3.0

- **crawl4ai Engine** - New high-performance extraction engine (3-5x faster)
- **LLM-Free Extraction** - Smart DOM parsing reduces AI costs by 60-80%
- **Hybrid Mode** - Automatic fallback: LLM-free → LLM → Static selectors
- **Advanced Anti-Bot** - Improved fingerprinting and stealth capabilities
- **Simplified Configuration** - Streamlined YAML configs with less boilerplate
- **Migration Guide** - Complete guide for transitioning from browser-use

## What's New in v0.2.0

- **Supabase Realtime v2** - Real-time job dispatch and presence tracking
- **Structured JSON Logging** - Centralized logging with job context
- **Simplified Architecture** - Polling daemon mode for reliability
- **Test Lab Events** - Real-time event system for testing
- **Enhanced Installation** - Guided setup with realtime key configuration
- **Cost Tracking** - Built-in monitoring for AI extraction costs

## Quick Install

**One-liner** - paste this into your terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
```

Setup flow:
1. Open **Admin → Scrapers → Network** in BayStateApp
2. Generate a runner key in **Runner Accounts**
3. Run the one-liner above on the new machine
4. Paste the key into the setup wizard when prompted

That's it! The runner starts automatically and runs in the background.

### Optional Auto Updates (Docker)

v0.3.0 introduces the crawl4ai engine with hybrid extraction modes for optimal performance and cost.

### Key Features
- **Hybrid Extraction**: Automatically chooses between LLM-free and LLM modes
- **LLM-Free Mode**: Fast DOM parsing with zero AI costs (3-5x faster)
- **LLM Mode**: AI extraction for complex pages requiring semantic understanding
- **Smart Fallback Chain**: LLM-free → LLM → Static selectors → Manual review
- **Cost Reduction**: 60-80% lower AI API costs through intelligent mode selection
- **Advanced Anti-Bot**: Improved fingerprinting and stealth capabilities

### Extraction Modes

| Mode | Speed | Cost | Best For |
|------|-------|------|----------|
| **LLM-Free** | 2-4s | Free | Structured pages, e-commerce products |
| **LLM** | 8-15s | $0.01-0.05 | Complex comparisons, unstructured data |
| **Auto** (Recommended) | 2-8s | Varies | Automatic selection based on page complexity |

### Quick Start

Create a crawl4ai scraper using the template:

```yaml
name: "my-crawl4ai-scraper"
scraper_type: "crawl4ai"

crawl4ai_config:
  extraction_mode: "auto"           # auto | llm-free | llm
  llm_model: "gpt-4o-mini"          # Only for LLM mode
  
  anti_detection:
    enabled: true
    simulate_user: true

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/p/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"
```

### Migration from browser-use

If you're using the legacy browser-use system, see the [Migration Guide](docs/migration-guide.md).

For detailed crawl4ai configuration and advanced options, see [docs/crawl4ai-config.md](docs/crawl4ai-config.md).

---

## Architecture

### System Overview

The BayStateScraper uses a coordinator-runner pattern with the new crawl4ai engine:

```
┌──────────────────────────────────────────────────────────────┐
│                       BayStateApp                            │
│  POST /api/scraper/v1/poll      → Returns job or null       │
│  POST /api/scraper/v1/heartbeat → Updates runner status     │
│  GET  /api/scraper/v1/credentials → On-demand credentials   │
│  POST /api/admin/scraping/callback → Receives results       │
│  Supabase Realtime: scrape_jobs INSERT, presence, broadcast  │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS (X-API-Key: bsr_...)
                              │ OR WebSocket (if realtime key configured)
                              │
┌─────────────────────────────┴─────────────────────────────────┐
│  Docker Container (always running)                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              crawl4ai Engine                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │ LLM-Free     │  │ LLM          │  │ Static       │ │  │
│  │  │ Extraction   │→│ Extraction   │→│ Selectors    │ │  │
│  │  │ (Primary)    │  │ (Fallback)   │  │ (Fallback)   │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │  │
│  │         ↓                   ↓                 ↓        │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │         Anti-Bot & Stealth Layer                  │ │  │
│  │  │  • Fingerprint rotation                           │ │  │
│  │  │  • Human simulation                               │ │  │
│  │  │  • TLS fingerprinting                             │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  daemon.py polls or connects via realtime → executes → reports│
└───────────────────────────────────────────────────────────────┘
```

### crawl4ai Engine Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Engine** | Main orchestrator | `src/crawl4ai_engine/engine.py` |
| **Retry** | Intelligent retry with exponential backoff | `src/crawl4ai_engine/retry.py` |
| **Anti-Bot** | Stealth and fingerprinting | `src/crawl4ai_engine/anti_bot.py` |
| **Callback** | Result submission to coordinator | `src/crawl4ai_engine/callback.py` |
| **Config** | Configuration management | `src/crawl4ai_engine/config.py` |
| **Metrics** | Performance and cost tracking | `src/crawl4ai_engine/metrics.py` |

### Extraction Flow

```
1. Job Received
   ↓
2. URL Fetched (with anti-detection)
   ↓
3. Content Retrieved (cached if possible)
   ↓
4. Extraction Mode Selection
   ├── If extraction_mode == "llm-free":
   │   └── Parse DOM → Extract structured data
   │
   ├── If extraction_mode == "llm":
   │   └── Send to LLM → Parse response
   │
   └── If extraction_mode == "auto":
       ├── Try LLM-Free first
       ├── If low confidence → Try LLM
       └── If still failing → Use static selectors
   ↓
5. Results Validated
   ↓
6. Metrics Recorded
   ↓
7. Results Sent to Coordinator
```

## Development vs Production

The runner supports two environments:

| Environment | API URL | Use Case |
|-------------|---------|----------|
| **Development** | `http://localhost:3000` | Active development, testing new scrapers |
| **Production** | `https://bay-state-app.vercel.app` | Live data collection |

### Local CLI Mode (New!)

You can now run and test scrapers locally without a running API server. This is perfect for verifying YAML configs and debugging selectors.

```bash
# Test a scraper with its built-in test_skus
python runner.py --local --config scrapers/configs/phillips.yaml

# Test a specific SKU and watch the browser
python runner.py --local --config scrapers/configs/phillips.yaml --sku 072705115310 --no-headless

# Save results to a file
python runner.py --local --config scrapers/configs/phillips.yaml --output results.json
```

For scrapers requiring login, set environment variables:
```bash
PHILLIPS_USERNAME=myuser PHILLIPS_PASSWORD=mypass \
  python runner.py --local --config scrapers/configs/phillips.yaml
```

### Quick Start (Orchestrated)

### Environment Files

- `.env` - Production configuration (used by Docker)
- `.env.development` - Local development configuration

The runner automatically loads the correct file based on the `--env` flag.

## Commands

```bash
# View logs
docker logs -f baystate-scraper

# Stop runner
docker stop baystate-scraper

# Start runner
docker start baystate-scraper

# Update to latest version
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
```

## How It Works

The runner supports two modes:

### Polling Mode (Default)
1. **Polls** the coordinator every 30 seconds for new jobs
2. **Fetches credentials** on-demand (never stored locally)
3. **Executes** scraping jobs using Playwright
4. **Reports** results back via API callback

### Realtime Mode (v0.2.0+)
1. **Connects** to Supabase Realtime for instant job dispatch
2. **Tracks presence** so coordinators see active runners
3. **Receives** jobs via websocket broadcast
4. **Reports** results via API callbacks

Both modes restart automatically on crash.

## Manual Installation

If you prefer docker-compose:

```bash
# Clone the repo
git clone https://github.com/Bay-State-Pet-and-Garden-Supply/BayState.git
cd BayStateScraper

# Create .env file
cat > .env << EOF
SCRAPER_API_URL=https://app.baystatepet.com
SCRAPER_API_KEY=bsr_your_key_here
RUNNER_NAME=$(hostname)
EOF

# Create browser-state directory (cookies/session storage persist here)
mkdir -p .browser_storage_states

# Start
docker compose up -d
```

Browser session data will be persisted in `apps/scraper/.browser_storage_states/` by default.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SCRAPER_API_URL` | Yes | - | BayStateApp base URL |
| `SCRAPER_API_KEY` | Yes | - | Runner API key (starts with `bsr_`) |
| `RUNNER_NAME` | No | hostname | Identifier for this runner |
| `POLL_INTERVAL` | No | 30 | Seconds between job polls |
| `MAX_JOBS_BEFORE_RESTART` | No | 100 | Restart for memory hygiene |
| `BSR_SUPABASE_REALTIME_KEY` | No | - | Service role key for realtime mode (optional) |
| `HEADLESS` | No | `true` | Set to `false` to run browser in visible mode for debugging |
| `EXTRACTION_MODE` | No | `auto` | Default extraction mode: `auto`, `llm-free`, or `llm` |
| `LLM_API_KEY` | No | - | OpenAI API key (only needed for LLM mode) |
| `CRAWL4AI_CACHE_ENABLED` | No | `true` | Enable content caching |

### Supabase Realtime (Optional)

For real-time job dispatch and runner presence, configure:

```bash
BSR_SUPABASE_REALTIME_KEY=service_role_key_from_supabase
```

Get the key from: **Supabase Dashboard → Settings → API → service_role key**

When configured, runners connect via websocket and receive jobs instantly instead of polling.

### crawl4ai Configuration

Configure the extraction engine:

```bash
# Default extraction mode for all scrapers
EXTRACTION_MODE=auto

# LLM API key (only needed when using LLM mode)
LLM_API_KEY=sk-...

# Enable caching for faster repeat extractions
CRAWL4AI_CACHE_ENABLED=true

# Anti-detection level (basic, standard, aggressive)
ANTI_DETECTION_LEVEL=standard
```
## Monitoring

The scraper provides built-in monitoring via Prometheus metrics and optional Sentry error tracking.

### Prometheus Metrics

Metrics are exposed at `http://localhost:8000/metrics` (configurable via `METRICS_PORT`):

| Metric | Type | Description |
|--------|------|-------------|
| `crawl4ai_extractions_total` | Counter | Total extractions by mode (llm, llm_free, auto) |
| `crawl4ai_success_rate` | Gauge | Overall extraction success rate (0-1) |
| `crawl4ai_duration_ms` | Gauge | Average extraction duration |
| `crawl4ai_cache_hit_rate` | Gauge | Cache hit rate (0-1) |
| `crawl4ai_errors_total` | Counter | Errors by type |
| `crawl4ai_antibot_attempts_total` | Counter | Anti-bot bypass attempts |
| `crawl4ai_antibot_success_rate` | Gauge | Anti-bot success rate |
| `crawl4ai_cost_usd_total` | Counter | Total cost in USD |
| `crawl4ai_cost_average_usd` | Gauge | Average cost per extraction |

### Sentry Error Tracking

Enable error tracking by setting:

```bash
SENTRY_DSN=https://public_key@o0.ingest.sentry.io/project_id
```

See the full [Monitoring Guide](docs/monitoring.md) for:
- Complete Prometheus configuration
- Sentry setup instructions
- Troubleshooting common issues
- Example scrape configurations

## Security

- **Credentials on-demand**: Site passwords are fetched from coordinator when needed, never stored
- **API Key auth**: All requests include `X-API-Key` header
- **HTTPS only**: All communication encrypted in transit
- **No database access**: Runners communicate via API only

## Development

```bash
# Install dependencies
pip install -r requirements.txt
python -m playwright install chromium

# Run daemon locally
python daemon.py

# Run single job
python runner.py --job-id <uuid>
```

## License

Proprietary - Bay State Pet & Garden Supply
