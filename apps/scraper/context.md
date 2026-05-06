# Code Context

## Files Retrieved

1. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/AGENTS.md` (full) — reference doc being verified
2. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/pytest.ini` (full) — test config
3. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/runner.py` (full) — entry point
4. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/daemon.py` (metadata) — daemon entry point
5. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/actions/handlers/` (directory listing) — 25 .py files
6. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/src/crawl4ai_engine/` (directory listing) — exists with 13 files
7. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/core/` (directory listing) — 26 entries
8. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/` (directory listing) — 28 entries, full scraper domain
9. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/runner/` (directory listing) — 10 files
10. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/cli/` (directory listing) — 4 files + commands/ + fixtures/
11. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/api/` (directory listing) — server.py, debug_context.py
12. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/config/` (directory listing) — 3 files (NOT scraper configs)
13. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/benchmarks/` (directory listing) — 4 entries
14. `/Users/nickborrello/Desktop/Projects/BayState/.github/workflows/` (directory listing) — 11 workflow files
15. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/Dockerfile` (lines 1-30) — Playwright-based Docker image
16. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/docker-compose.yml` (lines 1-30) — production-oriented compose
17. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/requirements.txt` (full) — core dependencies
18. `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/setup.py` (lines 1-8) — setuptools config

## Key Code

### Entry Points
```python
# runner.py (root) — wraps runner.__main__
from runner.__main__ import main
if __name__ == "__main__":
    main()
```

```python
# daemon.py (24,865 bytes) — daemon entry point
```

### pytest.ini
```ini
[pytest]
testpaths = tests scraper_backend/tests
python_files = test_*.py
addopts = --verbose -m "not live"
asyncio_mode = auto
markers =
    asyncio: marks tests as async
    integration: marks tests that exercise live scraper integrations
    benchmark: marks performance or benchmark-oriented tests
    live: marks tests that require live external APIs (search, LLM, etc.)
    slow: marks tests that are slow-running (>30s)
    performance: marks tests that measure performance metrics
    timeout: marks tests with a timeout limit
```

### Action Handlers (scrapers/actions/handlers/ — 24 handers + __init__.py)
`anti_detection.py`, `browser.py`, `click.py`, `combine.py`, `conditional.py`, `extract.py`, `extract_transform.py`, `image.py`, `input.py`, `json.py`, `login.py`, `navigate.py`, `ocr.py`, `script.py`, `set_proxy.py`, `sponsored.py`, `table.py`, `transform.py`, `validation.py`, `verify.py`, `wait.py`, `wait_for.py`, `wait_for_hidden.py`, `weight.py`

### Subproject AGENTS.md files — all 4 exist
- `core/AGENTS.md` — Infrastructure services: API client, events, retry, health monitoring
- `runner/AGENTS.md` — Execution modes: full scrape, chunk worker, realtime listener
- `scrapers/AGENTS.md` — Scraping domain: actions, workflows, execution engine, events
- `src/crawl4ai_engine/AGENTS.md` — v0.3.0 extraction engine

## Architecture

### Actual Top-Level Structure
```
apps/scraper/
├── actions/             # Nearly empty (only __pycache__) — STALE
├── api/                 # server.py (24KB), debug_context.py
├── benchmarks/          # ai_search/, official_brand/, search_fixtures.py
├── cli/                 # main.py + commands/ + fixtures/
├── config/              # evaluation_thresholds.yaml, settings.example.json, shopsite_constants.py
├── core/                # Infrastructure: api_client.py (48KB), events.py (30KB), retry_executor.py, etc.
├── daemon.py            # Main daemon entry (24KB)
├── docs/                # Documentation
├── engine/              # Small directory
├── prompts/             # Prompt templates
├── reports/             # Test/reports
├── runner/              # Job runner: cli.py, chunk_mode.py, full_mode.py, realtime_mode.py, etc.
├── runner.py            # Wrapper: imports runner.__main__.main()
├── scrapers/            # CORE SCRAPER DOMAIN (28 entries)
│   ├── actions/         # handlers/ (24 handlers), etc.
│   ├── executor/        # workflow_executor.py (29KB), step_executor.py (15KB)
│   ├── models/          # config.py (11KB), result.py (6KB), assertions.py
│   ├── parser/          # yaml_parser.py, config_parser.py
│   ├── configs/         # YAML scraper configs
│   ├── providers/       # Search providers
│   ├── ai_search/       # AI search integration
│   ├── tests/           # Subset of tests
│   └── ... (runtime.py, etc.)
├── scripts/             # Migration/utility scripts
├── src/
│   └── crawl4ai_engine/ # engine.py (22KB), anti_bot.py, metrics.py, retry.py, etc.
├── tests/               # Full test suite (40 entries)
├── utils/               # Logger, proxy_rotator, sentry, etc.
├── Dockerfile
├── docker-compose.yml
├── requirements.txt     # Core dev/prod deps
├── requirements-runtime.txt  # Minimal runtime deps for Docker
├── setup.py             # Package setup
├── pytest.ini
├── mypy.ini
└── ruff.toml
```

### Data Flow
1. `daemon.py` polls API → fetches YAML config from `scrapers/configs/`
2. `runner/` loads workflow → `scrapers/executor/` executes
3. `scrapers/actions/handlers/` perform individual browser actions
4. Results POST back via `core/api_client.py`
5. Some requests route through `src/crawl4ai_engine/` for crawl4ai extraction

### CI/CD (repo root .github/workflows/)
11 workflow files: `scraper-ci.yml`, `scraper-cd.yml`, `ai-search-benchmark.yml`, `benchmark-live.yml`, `prompt-regression.yml`, `register-sync.yml`, `shopsite-sync.yml`, `validate-scraper-configs.yml`, `web-ci.yml`, `weekly-validation.yml`

## Discrepancies vs AGENTS.md Documentation

| Claim in AGENTS.md | Actual | Severity |
|---|---|---|
| Structure shown as nested under `scraper_backend/` | Flat top-level directories, no `scraper_backend/` wrapper | **MAJOR** — misleading |
| `scraper_backend/` with `api/`, `core/`, `scrapers/`, `tests/`, `utils/` subdirs | These are **top-level**, not nested under `scraper_backend/` | **MAJOR** |
| "27 action handlers" | **24** handlers + `__init__.py` = 25 .py files | **Moderate** — off by 3 |
| `pytest.ini` testpaths includes `scraper_backend/tests` | That directory **does not exist** — stale reference | Minor (no-op) |
| `scrapers/configs/` listed as `config/` in structure table | `config/` exists but contains evaluation_thresholds.yaml, NOT scraper configs. Real configs are in `scrapers/configs/` | **Moderate** — wrong location |
| `actions/` listed under `scrapers/actions/handlers/` | Correct for `scrapers/actions/handlers/`, but there's also a **stale root `actions/`** dir (empty + __pycache__) | Minor |
| `.github/workflows/` implied under scraper dir | Workflows are at **repo root** `.github/workflows/` | Minor |
| `no pyproject.toml` | Correct — uses `setup.py` + `requirements.txt` | OK (documented accurately by omission) |
| `src/crawl4ai_engine/` exists with `AGENTS.md` | Confirmed — 13 files including AGENTS.md | **Correct** |
| All 4 subproject AGENTS.md files exist | All confirmed | **Correct** |
| `runner.py` exists | Confirmed — 73 bytes wrapper | **Correct** |
| `daemon.py` exists | Confirmed — 24,865 bytes | **Correct** |
| Docker files exist | Dockerfile + docker-compose.yml confirmed | **Correct** |
| `benchmarks/official_brand/` exists | Confirmed in benchmarks/ | **Correct** |

## Start Here
Open `scrapers/` for the scraper domain internals. For entry points, start with `runner.py` (job runner wrapper) or `daemon.py` (daemon mode entry). The AGENTS.md needs updating to reflect the flat top-level structure rather than the fictional `scraper_backend/` wrapper.
