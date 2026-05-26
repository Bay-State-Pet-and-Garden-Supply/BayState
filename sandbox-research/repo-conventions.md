# Repo Conventions Research for Isolated Sandbox

## 1. Monorepo Directory Layout

```
BayState/
├── apps/
│   ├── web/          # Next.js 16 (Bun/TypeScript) — coordinator & admin
│   ├── scraper/      # Python scraper runner
│   └── mobile/       # Expo/React Native (less active)
├── packages/
│   └── api/          # @baystate/api — shared tRPC library
├── shared/
│   └── ai-pricing/   # Shared pricing catalog for AI cost calculation
├── docs/
│   └── plans/        # Proposals and implementation plans
├── data/             # Empty — reserved for local datasets
├── scripts/          # Root-level infra scripts
├── handoff/          # Output from previous agent sessions
├── insight/          # Research/audit outputs
├── context-build/    # AI context builders
└── legacy-scraper-archive/  # Archived Python scraper (v1)
```

**Key convention**: `apps/` = runnable applications, `packages/` = shared libraries. No `experiments/` or `sandbox/` directory exists yet.

---

## 2. Package Managers

| Tech | Manager | Version | Notes |
|------|---------|---------|-------|
| **JS/TS** | **Bun** | 1.3.5 | `packageManager` in root `package.json`. Prefer over npm. |
| **Python** | **pip** (via `requirements.txt`) | pip 25+ | No `pyproject.toml` or `Pipfile`. `setup.py` exists but is informational. |
| **Python (optional)** | **uv** | 0.9.18 | Installed and used by `bun run scraper dev` (`uv run --with-requirements`). Available on host. |
| **Runtime orchestration** | **Turbo** | 2.8.17 | Root `turbo.json` coordinates dev/build/test/tasks across workspaces. |

**Monorepo workspaces** defined in root `package.json`:
- `packages/*`
- `apps/web`
- `apps/scraper` (has its own `package.json` for convenience scripts only; actual Python is pip-managed)

**JS commands** follow the pattern:
- `bun run web <script>` → runs inside `apps/web`
- `bun run scraper <script>` → runs inside `apps/scraper`

---

## 3. Python Environment Conventions

### Virtual Environment

- **Location**: `apps/scraper/.venv/` (exists and is active)
- **Fallback**: `apps/scraper/venv/` (checked by `run-dev.sh`)
- **Python version**: 3.14.2 (uv-managed), system Python is 3.14.5
- **`setup.py` specifies**: `python_requires=">=3.10"` and classifier `3.10`, `3.11`, `3.12`
- **No `.python-version`** file exists (would be useful for `uv` auto-discovery)

### Activation

- **Local dev**: `source .venv/bin/activate` (Linux/macOS)
- **Docker**: Self-contained in `mcr.microsoft.com/playwright/python:v1.57.0-jammy` (Python 3.10+)
- **run-dev.sh**: Auto-detects and sources `.venv` or `venv`
- **bun run scraper dev/up**: Uses Docker compose (production-oriented) — *not recommended for sandbox work*

### Dependencies (split files)

| File | Scope | Includes |
|------|-------|----------|
| `apps/scraper/requirements.txt` | Full dev/test | crawl4ai, openai, playwright, pydantic, structlog, rich, pandas, pytesseract, supabase, sentry-sdk, pandera, click, etc. |
| `apps/scraper/requirements-runtime.txt` | Docker runtime only | Subset: crawl4ai, openai, playwright, pydantic, supabase, sentry-sdk, stealth |

### Python Code Quality Tooling

- **Linter**: `ruff` (py310 target, line length 160, select E/F)
- **Type checker**: `mypy` (Python 3.13 target, `--ignore-missing-imports || true` in CI)
- **Testing**: `pytest` with `asyncio_mode=auto`, markers: `integration`, `benchmark`, `live`, `slow`, `performance`
- **Test mark defaults**: `-m "not live"` (live API tests excluded from CI)

### Python sys.path Setup

The `daemon.py` adds both the project root and `src/` to `sys.path`:
```python
sys.path.insert(0, str(PROJECT_ROOT))     # apps/scraper/
sys.path.insert(0, str(src_path))          # apps/scraper/src/
```
This means imports like `from core.api_client import X` and `from crawl4ai_engine.engine import Y` both work.

---

## 4. Python Dependency Graph (Key Imports)

```
runner/__init__.py
  → core.api_client (ClaimedEnrichment)
  → core.settings_manager (settings)
  → scrapers.product_url_extraction.extractor (ProductPageExtractor)
  → scrapers.ai_search.enrichment_models (build_v1_from_extraction_result, etc.)
  → scrapers.approved_sources.types (parse_source_plan)
  → scrapers.approved_sources.executor (ApprovedSourceExecutor)

scrapers/approved_sources/executor.py
  → scrapers.approved_sources.adapters.registry (get_adapter_class)
  → scrapers.approved_sources.types (ApprovedSourcePlan, ApprovedSourcePlanEntry)
  → scrapers.approved_sources.result_builder (build_failed_result)

scrapers/approved_sources/types.py
  → Dataclasses only (no heavy imports)

core/api_client.py
  → core.config, core.models, httpx (for HTTP calls)

src/crawl4ai_engine/engine.py
  → crawl4ai library, core.failure_classifier

scrapers/ai_search/enrichment_models.py
  → Pydantic models (EnrichmentResultV1, etc.)
```

**Critical architectural constraint**: The scraper code assumes it's running in a context where `sys.path` includes both `apps/scraper/` and `apps/scraper/src/`. All imports use bare module names (no relative imports). Any sandbox reusing this code must replicate this path setup.

---

## 5. Environment / Config Conventions

### Python (.env)

- Single `.env` file in `apps/scraper/` is the **single source of config**
- Loaded via `python-dotenv` in `daemon.py` and `runner/__main__.py`
- Template: `apps/scraper/.env.example`
- Key vars:
  - `SCRAPER_API_URL` — coordinator endpoint
  - `SCRAPER_API_KEY` — auth key (`bsr_*`)
  - `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` — AI extraction config
  - `SERPER_API_KEY` — fallback search
  - `HEADLESS` — browser mode
  - `POLL_INTERVAL` — polling frequency
- **DO NOT commit real credentials** — `.env` is in `.gitignore`

### JS/TS (.env.local, etc.)

- `apps/web/.env.local` for local dev (in `.gitignore`)
- `apps/web/.env.local.example` as template
- `apps/web/env_list.txt` and `env-used.txt` track used vars

### Docker Compose

- `apps/scraper/docker-compose.yml` — production-oriented by default
- Uses `env_file: .env` and `environment:` overrides
- Health checks, memory limits (2GB), auto-restart
- **Local dev prefers `./run-dev.sh`** over Docker

---

## 6. Is it Safe to Reuse `apps/scraper` Code in an Isolated Sandbox?

### Assessment: **Safe with caveats**

#### Safe aspects:
1. **Architecture is decoupled**: The scraper runner is already stateless and API-driven. It communicates only via `api_client.py` (HTTP + API key). No direct DB access.
2. **No singletons or global state**: Most code is async, instance-based (engine, executor, extractor).
3. **Pydantic-validated interfaces**: All data structures are typed.
4. **Well-documented internal dependencies**: `AGENTS.md` files at every module level.
5. **Existing `.venv`** means dependencies are already installed.

#### Risks / constraints:
1. **Import path assumption**: Code assumes `sys.path` includes `apps/scraper/` and `apps/scraper/src/`. Any sandbox must replicate this or use `PYTHONPATH`.
2. **python-dotenv dependency**: Most entry points call `load_dotenv()` — a sandbox must either have the `.env` file or mock env vars.
3. **crawl4ai browser dependency**: The heavy lifting depends on Playwright + crawl4ai, which needs browser binaries (`playwright install chromium`). This is the biggest environment setup cost.
4. **API key dependency**: Runner code cannot function without a coordinator to talk to. For isolated testing, you'd need either a mock coordinator or local web app.
5. **Python 3.14 vs 3.10+**: The `.venv` uses Python 3.14.2, but `setup.py` targets 3.10-3.12. Some transitive dependency pins might be untested on 3.14.
6. **No `pyproject.toml`**: Modern Python tooling (editable installs, `uv sync`, PEP 621) isn't configured. You'd need to add one or rely on `pip install -r requirements.txt -e .`.

### Recommended isolation strategy

| Concern | Recommendation |
|---------|---------------|
| Python env | Create a new `.venv` in the sandbox dir, or share the existing one with `PYTHONPATH` pointing at `apps/scraper/` |
| Dependencies | Symlink or copy `requirements.txt` / `requirements-runtime.txt` |
| Config | Copy `.env.example` → `.env` with mock values; don't share production `API_URL`/`API_KEY` |
| Browser | `playwright install chromium` inside sandbox (caches to `~/Library/Caches/ms-playwright`) |
| Imports | Set `PYTHONPATH=apps/scraper:apps/scraper/src` or replicate `sys.path` insertion |
| Coord mock | Write a small FastAPI mock of the `/api/scraper/v1/poll`, `/heartbeat`, `/callback` endpoints |
| Isolation | Don't write to `apps/scraper/data/` or `apps/scraper/scratch/` from the sandbox; use sandbox-local paths |

---

## 7. Existing Experiment/Sandbox Patterns

### What exists
- **`apps/scraper/docs/`** — Architecture docs, deployment checklists, API references
- **`apps/scraper/prompts/EXPERIMENTS.md`** — Hypothesis-driven prompt experiment log (1 experiment tracked so far)
- **`apps/scraper/scratch/`** — Contains `test_strategy_types.py` (minimal; seems like a test scratch file)
- **`apps/scraper/benchmarks/`** — Performance benchmarks (separate from tests)
- **`apps/scraper/tests/validation/`** — Validation/sampler tests
- **`docs/plans/`** — Implementation plans and proposals
- **`insight/`** — Research scouting outputs
- **`handoff/`** — Agent session handoff artifacts
- **`legacy-scraper-archive/`** — Archived v1 scraper code

### What does NOT exist
- **No `experiments/` directory** at any level
- **No `sandbox/` directory**
- **No `tools/` or `scripts/sandbox*` scripts**
- **No Jupyter notebooks** in the repo
- **No `.python-version` file** for uv/Pyenv pinning
- **No `pyproject.toml`** for modern Python packaging

### What you should create
If establishing a sandbox experiment area, align with existing conventions:

1. **Location**: Create `sandbox-research/` (this directory) or `experiments/` at repo root to match `insight/` and `handoff/` patterns
2. **Documentation**: Add a `README.md` with experiment log format matching `prompts/EXPERIMENTS.md`
3. **Python env**: Use `uv` with a `.python-version` file pinning Python 3.14 (or 3.12 for broader compatibility)
4. **Config**: Use `python-dotenv` with a local `.env` (add to `.gitignore` if at root level)
5. **Imports**: Set `PYTHONPATH` to include `apps/scraper/` and `apps/scraper/src/`
6. **Scraper code reuse**: Import `from scrapers.approved_sources.types import ApprovedSourcePlan` etc. directly — the module structure supports it

---

## 8. Key Files Referenced

| File | Purpose |
|------|---------|
| `AGENTS.md` | Root agent instructions, workspace commands |
| `apps/scraper/AGENTS.md` | Scraper architecture overview |
| `apps/scraper/core/AGENTS.md` | Core infrastructure (API client, retry) |
| `apps/scraper/runner/AGENTS.md` | Runner execution modes |
| `apps/scraper/scrapers/AGENTS.md` | Domain scraping logic |
| `apps/scraper/src/crawl4ai_engine/AGENTS.md` | Extraction engine |
| `apps/scraper/DEV_SETUP.md` | Local dev setup instructions |
| `apps/scraper/CONTRIBUTING.md` | Branching strategy, CI, commit conventions |
| `apps/scraper/.env.example` | Environment variable template |
| `apps/scraper/requirements.txt` | Full dev dependencies |
| `apps/scraper/requirements-runtime.txt` | Minimal runtime dependencies |
| `apps/scraper/prompts/EXPERIMENTS.md` | Prompt experiment log format |
| `apps/scraper/docker-compose.yml` | Production Docker setup |
| `apps/scraper/run-dev.sh` | Local dev runner (non-Docker) |
| `package.json` | Root package.json (Bun workspace config) |
| `turbo.json` | Turbo task orchestration |

---

## 9. Recommendations Summary

1. **Directory**: Create at `sandbox-research/` (already started) or `experiments/` at repo root.
2. **Python env**: Use `uv venv` with a `.python-version` file pinning Python 3.14 or 3.12. Do NOT reuse `apps/scraper/.venv` — create a sandbox-specific environment.
3. **Dependencies**: Install from `requirements-runtime.txt` (smaller) or `requirements.txt` (full dev). Add dependencies only as needed.
4. **Imports**: Always set `PYTHONPATH=apps/scraper:apps/scraper/src` or replicate `sys.path.insert` in entry scripts.
5. **API mocking**: Write a lightweight FastAPI/httpx mock server for the coordinator endpoints if full-stack testing is needed.
6. **Scraper code reuse**: Core types (`ApprovedSourcePlan`, `EnrichmentResultV1`, `SourceResultInfo`) are pure Pydantic/dataclass code and safe to import. The executor and engine require browser + network setup.
7. **Config**: Use `python-dotenv` with a sandbox-local `.env` file. Add to `.gitignore`.
8. **No `pyproject.toml`**: Consider adding one if you need editable installs (`pip install -e .`). Otherwise, `sys.path` manipulation is sufficient.
9. **Experiment tracking**: Follow the format in `apps/scraper/prompts/EXPERIMENTS.md` (hypothesis → changes → results → conclusion) for any sandbox experiments.
10. **Browser setup**: Run `playwright install chromium` in the sandbox environment. Binary cache is global (~/Library/Caches/ms-playwright).
