# BayStateScraper v0.3.0

Distributed headless scraper runners for Bay State Pet & Garden Supply.

## 🚀 Local Development (Isolated Docker)

The scraper runner is now fully containerized for development. This ensures zero-install setup and perfect isolation from any live runners on your machine.

### Quick Start
```bash
# 1. Build the dev image
bun run scraper:build

# 2. Start the dev runner (automatically handled by bun run up)
bun run up
```

### Isolation Details
- **Container Name**: `baystate-scraper-dev`
- **Metrics Port**: `8001` (to avoid conflict with live runner on 8000)
- **Project Name**: `baystate-dev`
- **API URL**: Connects to `host.docker.internal:3000`

---

## 🏗️ Architecture

### System Overview
The BayStateScraper uses a coordinator-runner pattern with the crawl4ai engine:

```
┌──────────────────────────────────────────────────────────────┐
│                       BayStateApp                            │
│  POST /api/scraper/v1/poll      → Returns job or null       │
│  POST /api/scraper/v1/heartbeat → Updates runner status     │
│  GET  /api/scraper/v1/credentials → On-demand credentials   │
│  POST /api/admin/scraping/callback → Receives results       │
└──────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTPS (X-API-Key: bsr_...)
                              │
┌─────────────────────────────┴─────────────────────────────────┐
│  Docker Container (baystate-scraper-dev)                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              crawl4ai Engine                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │ LLM-Free     │  │ LLM          │  │ Static       │ │  │
│  │  │ Extraction   │→│ Extraction   │→│ Selectors    │ │  │
│  │  │ (Primary)    │  │ (Fallback)   │  │ (Fallback)   │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## 🛠️ Extraction Modes

| Mode                   | Speed | Cost       | Best For                                     |
| ---------------------- | ----- | ---------- | -------------------------------------------- |
| **LLM-Free**           | 2-4s  | Free       | Structured pages, e-commerce products        |
| **LLM**                | 8-15s | $0.01-0.05 | Complex comparisons, unstructured data       |
| **Auto** (Recommended) | 2-8s  | Varies     | Automatic selection based on page complexity |

## 📦 Docker Management

```bash
# View logs
docker compose -p baystate-dev -f apps/scraper/docker-compose.yml logs -f scraper

# Restart dev runner
docker compose -p baystate-dev -f apps/scraper/docker-compose.yml restart

# Stop dev runner
docker compose -p baystate-dev -f apps/scraper/docker-compose.yml stop
```

## 🔐 Security
- **Credentials on-demand**: Site passwords fetched from coordinator when needed.
- **API Key auth**: All requests include `X-API-Key` header.
- **No database access**: Runners communicate via API only.

## License
Proprietary - Bay State Pet & Garden Supply
