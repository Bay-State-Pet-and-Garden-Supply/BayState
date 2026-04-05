# BAY STATE SCRAPER

**Role:** Distributed scraping engine for BayStateApp
**Stack:** Python 3.10+, Playwright, YAML DSL, Docker
**Pattern:** Stateless containers on self-hosted GitHub Action runners

## OVERVIEW
Python-based scraper executing YAML-defined workflows to extract product data. Runs as ephemeral Docker containers triggered by BayStateApp. Polls coordinator API for jobs, executes browser automation via Playwright, returns structured JSON results.

## STRUCTURE
```
.
├── scraper_backend/           # CORE ENGINE
│   ├── api/                   # API client, Vercel endpoints
│   ├── core/                  # Retry logic, health monitor, failure classifier
│   ├── scrapers/
│   │   ├── actions/handlers/  # 27 action handlers (click, extract, navigate)
│   │   ├── executor/          # Workflow executor, browser manager
│   │   ├── models/            # Config models, result schemas
│   │   └── parser/            # YAML config parser
│   ├── tests/                 # pytest unit tests
│   └── utils/                 # Structured logging
├── scrapers/ (root)           # AI discovery, retry metrics, runtime state
├── config/                    # Sample scraper configs
├── runner/                    # Job runner modules
├── cli/                       # CLI commands
├── api/                       # Debug server, context endpoints
├── scripts/                   # Migrations, utilities
├── tools/                     # Config migration helpers
└── .github/workflows/         # CI/CD: ci.yml, cd.yml, scrape.yml
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| **New Scraper Config** | Publish via BayStateApp Admin UI | Local YAML deprecated; API publishes to runners |
| **Add Action Handler** | `scrapers/actions/handlers/` | 27 existing, inherit `BaseAction`, `@ActionRegistry.register()` |
| **crawl4ai Extraction** | `src/crawl4ai_engine/` | v0.3.0 engine → `src/crawl4ai_engine/AGENTS.md` |
| **Fix Retry Logic** | `core/` | Exponential backoff, circuit breaker, failure classifier |
| **Debug Job** | `api/debug.py` | Job state, browser contexts |
| **Add CLI Command** | `cli/` | Click commands, entry in `__main__.py` |
| **Update Models** | `scrapers/models/` | Pydantic, validation rules |

## ARCHITECTURE
**Coordinator-Runner Pattern:**
- BayStateApp = Coordinator (queues jobs, validates results)
- BayStateScraper = Runner (stateless, polls for work)

**Execution Flow:**
1. `daemon.py` polls `GET /api/admin/scraping/pending-jobs`
2. Fetches YAML config for vendor
3. `executor/` loads workflow, spins up Playwright browser
4. `actions/handlers/` execute step sequence
5. Results POST to `/api/admin/scraping/callback` (HMAC-signed)

**Authentication:**
- `X-API-Key: bsr_*` for all API calls
- HMAC-SHA256 webhook signatures
- No DB credentials in containers (API-only)

**YAML DSL Schema:**
```yaml
selectors:
  product_name: "h1[data-testid='product-title']"
  price: ".price-current"
actions:
  - type: navigate
    url: "{{base_url}}/product/{{sku}}"
  - type: extract
    fields: [product_name, price]
```

## CONVENTIONS
| Aspect | Rule |
|--------|------|
| **Configs** | Publish via BayStateApp API. Local YAML in `configs/` is deprecated. |
| **Handlers** | One action per file. Typed signatures. Return `ActionResult`. Async only. |
| **Logging** | Structured JSON via `utils/logger.py`. Contextual job_id always. |
| **Types** | Mypy checked. Non-blocking in CI. `| None` over `Optional`. |
| **Tests** | pytest. Mock Playwright, patch API client. `tests/unit/` mirrors source. |
| **Linting** | Ruff with ignores: F401, E501, E722. Line length 100. |
| **Secrets** | Env vars only. `SCRAPER_API_KEY`, `WEBHOOK_SECRET`. Never hardcode. |

## COMMANDS
```bash
# Development
python daemon.py --env dev              # Local polling (localhost:3000)
python -m pytest                        # Run test suite
ruff check .                            # Lint check
mypy scraper_backend/                   # Type check (warnings OK)

# Docker
docker build -t baystate-scraper .      # Build image
docker compose up -d                    # Start runner stack

# Scripts
./run-dev.sh                            # Dev mode wrapper
./run-prod.sh                           # Production mode
python cli/scraper_cli.py --help        # CLI commands
```

## ANTI-PATTERNS
- **NO** Selenium (Playwright only)
- **NO** direct database access (use API callbacks)
- **NO** long-running state in containers (ephemeral by design)
- **NO** hardcoded selectors in Python (YAML configs only)
- **NO** blocking sleeps (use `asyncio.sleep` with Playwright)
- **NO** `print()` (use structured logger)
- **NO** default mutable args in handlers
- **NO** bare `except:` (classify failures for retry logic)
- **NO** `SyncPlaywright` in production
- **NO** credentials in scraper config payloads (use credential_refs)

## SUBPROJECTS
- **core/** → `core/AGENTS.md`
- **runner/** → `runner/AGENTS.md`
- **scrapers/** → `scrapers/AGENTS.md`
- **src/crawl4ai_engine/** → `src/crawl4ai_engine/AGENTS.md`
