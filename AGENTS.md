# BAY STATE WORKSPACE

**Generated:** 2026-04-05
**Commit:** 7e468a1
**Branch:** master

## OVERVIEW
Three-part system: **apps/web** (Next.js 16 PWA + Admin), **apps/scraper** (Python distributed engine with crawl4ai), **conductor** (AI Workflow Engine — docs only, no runtime code).

## STRUCTURE
```
.
├── apps/
│   ├── web/               # Next.js 16, Supabase, Tailwind v4, shadcn/ui, Bun
│   │   ├── app/           # App Router: (storefront), (auth), admin (26 modules), api (100+ routes)
│   │   ├── components/    # UI: storefront/ admin/ ui/ account/ auth/ (278 files)
│   │   ├── lib/           # Core: 22 domain modules (auth, pipeline, consolidation, realtime, etc.)
│   │   └── supabase/      # 122 migrations, RLS policies, functions
│   └── scraper/           # Python 3.10+, Docker, Playwright + crawl4ai v0.3.0
│       ├── scrapers/      # YAML DSL, action handlers, executor, events
│       ├── core/          # API client, retry/circuit-breaker, realtime, health
│       ├── runner/        # Execution modes (full, chunk, realtime)
│       ├── src/crawl4ai_engine/  # New extraction engine (LLM-free/LLM/auto)
│       └── scripts/       # 17 operational scripts
├── conductor/             # Dev workflow docs (TDD, tracks, checkpoints) — NO runtime code
├── docker/                # Self-hosted GitHub Actions runner
└── .github/workflows/     # 7 CI/CD workflows
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| **Feature Dev** | `apps/web/` | Mobile-first, Server Components, TDD |
| **New Scraper Config** | BayStateApp Admin UI | Local YAML deprecated; API publishes |
| **Scraper Engine** | `apps/scraper/scrapers/executor/` | Decomposed workflow engine |
| **crawl4ai Engine** | `apps/scraper/src/crawl4ai_engine/` | v0.3.0 extraction (auto/llm-free/llm) |
| **AI Consolidation** | `apps/web/lib/consolidation/` | OpenAI + Gemini batch processing |
| **AI Workflow** | `conductor/` | Follow `workflow.md` strictly |
| **Admin Portal** | `apps/web/app/admin/` | 26-module dashboard |
| **Storefront** | `apps/web/app/(storefront)/` | Customer-facing PWA |
| **Pipeline ETL** | `apps/web/lib/pipeline/` | Import → Scrape → Consolidate → Publish |
| **Supabase Schema** | `apps/web/supabase/migrations/` | 122 migrations, `public` schema only |

## ARCHITECTURE
**Coordinator-Runner Pattern:**
- **apps/web** = Coordinator (dispatches jobs, receives callbacks, manages pipeline)
- **apps/scraper** = Runner (stateless Docker containers, polls or Realtime WebSocket)
- Communication: `X-API-Key` (bsr_*) auth, HMAC-SHA256 webhooks
- Scraper API: `POST /api/scraper/v1/poll`, `/heartbeat`, `/credentials`, callback

**Pipeline Flow:** Import (Integra/ShopSite) → Scrape (distributed) → Consolidate (AI) → Review → Publish

## DESIGN SYSTEM (apps/web)
| Color | Hex | Usage |
|-------|-----|-------|
| **Forest Green** | `#008850` | Primary, Sidebar, Ring |
| **Bay State Burgundy** | `#66161D` | Secondary, Foreground |
| **Harvest Gold** | `#FCD048` | Accent, Stars, Discounts |

## CROSS-PROJECT CONVENTIONS
- **Auth**: `X-API-Key` (bsr_*) for Scrapers. `getUser()` + Supabase RLS for App. `is_staff()` DB function for admin.
- **DB Access**: App via `@supabase/ssr` (server.ts/client.ts split). Scrapers use API only.
- **Imports**: `@/*` aliases in App. Named exports only. No default exports.
- **State**: Zustand (cart/UI), URL state (filters/status), Server Components (data).
- **Git**: `<type>(<scope>): <description>` (conventional commits).
- **AI Providers**: Gemini migration in progress — feature flags in `lib/config/`. OpenAI fallback.

## TESTING
| Project | Framework | Command | Pattern |
|---------|-----------|---------|---------|
| **App** | Jest + RTL | `bun run web test` | `__tests__/` mirrors source |
| **Scraper** | pytest | `python -m pytest` | `tests/unit/` mirrors source |

- **TDD Required**: Red → Green → Refactor. 80% coverage minimum.
- **App extras**: `test:a11y:e2e`, `test:a11y:unit` for accessibility.
- **Scraper extras**: `asyncio_mode=auto`, markers: `integration`, `benchmark`.

## ANTI-PATTERNS (GLOBAL)
- **NO** `any`, `@ts-ignore`, `@ts-expect-error`, default exports, `var`
- **NO** database credentials in scraper runners (API-only)
- **NO** direct DB in client components (use Server Actions)
- **NO** code before failing tests (TDD violation)
- **NO** Selenium (Playwright only)
- **NO** `print()` in Python (structured logger only)
- **NO** bare `except:` (classify failures for retry)
- **NO** hardcoded selectors in Python (YAML configs only)
- **NO** `SyncPlaywright` in production

## CI/CD
| Workflow | Trigger | What |
|----------|---------|------|
| `web-ci.yml` | PR/push | Tests + lint for web app |
| `scraper-ci.yml` | PR/push | Ruff + mypy + pytest |
| `scraper-cd.yml` | main/dev push | Docker build → GHCR |
| `validate-scraper-configs.yml` | PR | YAML config validation |
| `prompt-regression.yml` | PR | AI prompt accuracy checks |
| `weekly-validation.yml` | cron | Scraper validation + GitHub issues |
| `register-sync.yml` | manual | Windows ODBC register sync |

## SUBPROJECTS
- **apps/web/** → `apps/web/AGENTS.md`
- **apps/scraper/** → `apps/scraper/AGENTS.md`
- **conductor/** → `conductor/AGENTS.md`

## COMMANDS
```bash
# Web App
bun run web dev           # Dev server (localhost:3000)
bun run web test          # Run tests (custom jest runner)
bun run web lint          # ESLint 9 flat config

# Scraper (Local)
cd apps/scraper && python daemon.py --env dev

# Scraper (Docker)
cd apps/scraper && docker build -t baystate-scraper .
cd apps/scraper && docker compose up -d
```

## NOTES
- **Tailwind v4**: CSS-based config via `@tailwindcss/postcss`, no tailwind.config.js
- **ESLint 9**: Flat config in `eslint.config.mjs`
- **Python**: Ruff (line-length 160, ignores: F401, E501, E722, E402, F541, F841, F811)
- **Next.js config**: TypeScript (.ts), removes console in prod, security headers
- **Bun 1.3.5**: Package manager and runtime
- **No middleware.ts**: Auth handled at layout level, not middleware
