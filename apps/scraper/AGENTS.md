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

## TEST MODE & ASSERTION ENGINE

The scraper runner includes a test mode for automated QA validation.

### Test Assertions in Configs

Add `test_assertions` to YAML configs to define expected extraction results:

```yaml
test_assertions:
  - sku: "072705115310"
    expected:
      name: "Fromm Gold Large Breed Adult Dog Food 30lb"
      brand: "FROMM PET FOOD"
      price: "$59.99"
  - sku: "B08N5WRWNW"
    expected:
      name: "AVID POWER 20V MAX Battery"
      brand: "AVID POWER"
```

**Fields supported in expected:**
- `name`: Product name
- `brand`: Brand name
- `price`: Price string
- `image`: Primary image URL (or image filename)

### Runner Test Mode (--test-mode flag)

Run the scraper in test mode using assertions instead of generic test_skus:

```bash
# Run with test_assertions from config
python runner.py --local --config scrapers/configs/phillips.yaml --test-mode

# Run specific SKU in test mode
python runner.py --local --config scrapers/configs/phillips.yaml --test-mode --sku 072705115310

# Run with visible browser for debugging
python runner.py --local --config scrapers/configs/phillips.yaml --test-mode --no-headless
```

**How test mode works:**
1. Loads config and extracts SKUs from `test_assertions` (or `--sku` override)
2. Runs scraper against each SKU
3. Compares extracted values against `expected` fields
4. Outputs assertion results with pass/fail status

### Test Results Output

Test mode produces structured results:

```json
{
  "test_type": "qa",
  "scraper_name": "phillips",
  "results": [...],
  "assertion_results": [
    {
      "sku": "072705115310",
      "expected": {
        "name": "Fromm Gold Large Breed Adult Dog Food 30lb",
        "brand": "FROMM PET FOOD"
      },
      "actual": {
        "name": "Fromm Gold Large Breed Adult Dog Food 30lb",
        "brand": "FROMM PET FOOD"
      },
      "passed": true
    }
  ]
}
```

Each assertion result includes:
- **sku**: Product identifier
- **expected**: Values defined in config
- **actual**: Values extracted during test
- **passed**: Boolean indicating match

### CLI Options for Testing

```bash
# Basic test mode
python runner.py --local --config <path> --test-mode

# With headless disabled (visible browser)
python runner.py --local --config <path> --test-mode --no-headless

# With specific SKU
python runner.py --local --config <path> --test-mode --sku <sku>

# With output file
python runner.py --local --config <path> --test-mode --output results.json

# With strict validation
python runner.py --local --config <path> --test-mode --strict-validate
```

### Test Mode vs Local Mode

| Mode | Flag | Uses test_assertions | Outputs diff |
|------|------|---------------------|--------------|
| Local | `--local` only | No | Raw results |
| Test | `--local --test-mode` | Yes | Assertion diff |

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
