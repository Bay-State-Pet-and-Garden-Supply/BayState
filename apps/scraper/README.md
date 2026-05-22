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

## 🌎 Production Runner Installation

Use this one-liner to install a production runner on a new machine (Linux, macOS, or Windows with Bash).

```bash
curl -fsSL https://raw.githubusercontent.com/Bay-State-Pet-and-Garden-Supply/BayState/refs/heads/master/apps/scraper/get.sh | bash
```

### Setup Flow
1. Open **Admin → Scrapers → Network** in BayStateApp.
2. Generate a runner key in **Runner Accounts**.
3. Run the one-liner above on the target machine.
4. Paste your API key and follow the prompts.

The installer configures a Docker Compose stack with **Watchtower** (or a **cron schedule** on macOS/ARM64) for automatic updates by default.

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
│  │  ┌──────────────┐          ┌──────────────┐            │  │
│  │  │ LLM-Free     │          │ LLM          │            │  │
│  │  │ Extraction   │ -------->│ Extraction   │            │  │
│  │  │ (Primary)    │          │ (Fallback)   │            │  │
│  │  └──────────────┘          └──────────────┘            │  │
│  └────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## 🛠️ Extraction Modes

| Mode                   | Speed | Cost       | Best For                                     |
| ---------------------- | ----- | ---------- | -------------------------------------------- |
| **LLM-Free**           | 2-4s  | Free       | Structured pages, e-commerce products        |
| **LLM**                | 8-15s | $0.01-0.05 | Complex comparisons, unstructured data       |
| **Mixed** (Default)    | 2-8s  | Varies     | Automatic selection based on page complexity |

---

## ⚙️ Configuration

### Environment Variables
Configure your environment in `apps/scraper/.env`. See [.env.example](file:///Users/nickborrello/Desktop/Projects/BayState/apps/scraper/.env.example) for all options.

#### API Keys (AI & Search)
These keys are required for the `crawl4ai` engine to perform AI extraction and for the fallback SERP search:

| Variable | Purpose |
| :--- | :--- |
| `LLM_API_KEY` | (Required) Your API key for extraction (OpenAI, DeepSeek, etc.). |
| `LLM_MODEL` | (Optional) Defaults to `gpt-4o-mini`. |
| `LLM_BASE_URL`| (Optional) Custom endpoint for OpenRouter/Local LLMs. |
| `SERPER_API_KEY` | Required for fallback search discovery (finds brand sites). |

## 🧪 Local Testing

You can test AI extraction locally without the full stack:

```bash
# Extract data from a specific URL
python runner.py --upc "MY-UPC" --url "https://example.com/product/123" --debug
```

Flags:
- `--upc`: Product UPC for tracking.
- `--url`: Target page URL.
- `--no-headless`: Show the browser window for debugging.
- `--model`: Change LLM model (e.g., `gpt-4o`).
- `--enrichment-strategy`: Choose `mixed`, `llm`, or `structured`.

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
