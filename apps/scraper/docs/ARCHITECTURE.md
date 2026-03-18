# Architecture

## Current State: API-Driven (Implemented)

The scraper system uses a fully decoupled, API-driven architecture with **API Key authentication**.

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Admin Panel (One-Time Setup)                     │
│  1. Admin creates runner → API key generated (bsr_xxxx)                 │
│  2. Key stored in GitHub Secrets as SCRAPER_API_KEY                     │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Runtime Authentication                           │
│                                                                          │
│  Runner sends:  X-API-Key: bsr_xxxxx                                    │
│  BayStateApp:   Hash key → lookup in runner_api_keys → validate         │
│                                                                          │
│  ✓ No token refresh needed                                              │
│  ✓ Instant revocation via admin panel                                   │
│  ✓ Simple runner configuration                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. The Coordinator (BayStateApp)
- **Role**: Central brain and API gateway
- **Responsibilities**:
    - Stores scraper configurations in Supabase
    - Issues and validates API keys
    - Serves job configuration via REST API (polling or realtime)
    - Receives scrape results and updates product data
    - Provides admin UI for runner management

#### 2. The Runner (BayStateScraper)
- **Role**: Stateless worker
- **Responsibilities**:
    - Authenticates with API key (single header)
    - Fetches job configuration from `/api/scraper/v1/job`
    - Executes scraping logic (Playwright/Python)
    - Posts results to `/api/admin/scraping/callback`
    - **No database access** - knows nothing about Supabase

### Data Flow

```
1. Job Creation
   ┌─────────────┐
   │ Admin Panel │ creates scrape_job record
   │             │ Runner polls for job
   └──────┬──────┘
          │
          ▼
2. Runner Startup
   ┌─────────────┐
   │   Runner    │ GET /api/scraper/v1/job?job_id=xxx
   │             │ Headers: X-API-Key: bsr_xxxxx
   │             │ Receives: SKUs, scraper configs
   └──────┬──────┘
          │
          ▼
3. Execution
   ┌─────────────┐
   │   Runner    │ Spawns Playwright workers
   │             │ Scrapes each SKU/site
   └──────┬──────┘
          │
          ▼
4. Reporting
   ┌─────────────┐
   │   Runner    │ POST /api/admin/scraping/callback
   │             │ Headers: X-API-Key: bsr_xxxxx
   │             │ Body: { job_id, status, results }
   └──────┬──────┘
          │
          ▼
5. Data Ingestion
   ┌─────────────┐
   │ BayStateApp │ Updates products_ingestion.sources
   │             │ Sets pipeline_status = 'scraped'
   └─────────────┘
```

### Security Model

| Layer | Protection |
|-------|------------|
| **Transport** | HTTPS only |
| **Authentication** | API key in `X-API-Key` header |
| **Key Storage** | SHA256 hashed in `runner_api_keys` table |
| **Authorization** | RLS policies on `scraper_runners` table |
| **Fallback** | HMAC signature for Docker crash reports |
| **Isolation** | Runners have zero database credentials |

## Local/Offline Operation (Developer Mode)

While the production runner is API-driven, the system supports a **Stateless Local Mode** designed for development and CI/CD validation.

### Mechanism
In local mode (`--local`), the runner:
1. **Bypasses API Client**: Skips all health checks and initialization of the `ScraperAPIClient`.
2. **Loads Local Configs**: Reads YAML files directly from `scrapers/configs/`.
3. **Environment Credentials**: Resolves site credentials from environment variables (`SLUG_USERNAME`/`SLUG_PASSWORD`) instead of the `/api/scraper/v1/credentials` endpoint.
4. **Direct Output**: Emits results to `stdout` or a local file instead of posting to the coordinator callback.

This architecture ensures that scraper logic can be verified in isolation without a running instance of BayStateApp.

### Database Tables

```sql
-- API keys (hashed)
runner_api_keys
├── runner_name  → links to scraper_runners
├── key_hash     → SHA256 of the actual key
├── key_prefix   → First 12 chars for identification
├── expires_at   → Optional expiration
├── revoked_at   → Soft delete for audit trail
└── last_used_at → Updated on each auth

-- Runner status
scraper_runners
├── name         → Primary key
├── status       → online/offline/busy
├── last_seen_at → Last heartbeat
└── current_job_id → Active job reference
```


## AI Extraction Engine (v0.3.0+)

As of v0.3.0, the scraper system uses **Crawl4AI** for AI-powered content extraction. The previous browser-use implementation has been archived.

### Crawl4AI Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    Crawl4AI Extraction Flow                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────────┐    ┌──────────────┐   │
│  │   Runner    │ →  │  Crawl4AI       │ →  │  Markdown    │   │
│  │             │    │  - URL fetch    │    │  extraction  │   │
│  │  ai_extract │    │  - JS render    │    │  - Clean     │   │
│  │  action     │    │  - Content      │    │  - Structured│   │
│  └─────────────┘    └─────────────────┘    └──────────────┘   │
│                           │                                      │
│                           ▼                                      │
│                    ┌─────────────────┐                          │
│                    │  OpenAI LLM     │                          │
│                    │  - Parse MD     │                          │
│                    │  - Extract      │                          │
│                    │  - Structure    │                          │
│                    └─────────────────┘                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration Schema

AI scrapers use the `scraper_type: "agentic"` setting with Crawl4AI-specific configuration:

```yaml
name: "my-ai-scraper"
scraper_type: "agentic"

ai_config:
  provider: "crawl4ai"          # Extraction engine
  task: "Extract products"      # Natural language task
  llm_model: "gpt-4o-mini"      # OpenAI model
  confidence_threshold: 0.7     # Acceptance threshold
  extraction_type: "markdown"   # Output format

workflows:
  - action: "ai_extract"
    params:
      task: "Extract product details"
      extraction_type: "markdown"
```

### Migration from browser-use

The previous browser-use based AI scraper system (v0.2.0) has been deprecated:

- **Old configs**: Used `ai_config.tool: "browser-use"`
- **New configs**: Use `ai_config.provider: "crawl4ai"`
- **Action handlers**: `ai_extract`, `ai_search`, `ai_validate` now use Crawl4AI
- **Fallback behavior**: Maintained - falls back to static scraping when AI fails

Archived browser-use code is available in `scraper_backend/archive/ai_handlers/`.

### Benefits of Crawl4AI

1. **Speed**: Faster page rendering and content extraction
2. **Reliability**: Better handling of JavaScript-heavy sites
3. **Clean Output**: Markdown format is easier to parse than raw HTML
4. **Cost Efficiency**: Reduced token usage with pre-cleaned content
5. **Maintainability**: Simpler codebase, fewer dependencies
## Benefits

- **Security**: No database credentials leave the secure BayStateApp environment
- **Simplicity**: Single API key per runner, no token refresh logic
- **Flexibility**: Schema changes don't break runners (API contract is stable)
- **Auditability**: All key usage tracked with timestamps
- **Scalability**: Multiple runners connect to same API endpoints
