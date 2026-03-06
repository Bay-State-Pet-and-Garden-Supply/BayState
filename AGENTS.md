# BAY STATE WORKSPACE

**Generated:** 2026-03-06
**Context:** Multi-project monorepo for e-commerce (Next.js) and distributed scraping (Python).

## OVERVIEW
Three-part system: **apps/web** (Next.js 16 PWA + Admin), **apps/scraper** (Python distributed engine), **conductor** (AI Workflow Engine).

## STRUCTURE
```
.
├── apps/
│   ├── web/               # MAIN: Next.js 16, Supabase, Tailwind v4, shadcn/ui
│   │   ├── app/           # App Router (storefront, admin, auth, api)
│   │   ├── components/    # UI (storefront/, admin/, ui/)
│   │   ├── lib/           # Core logic (auth, products, scrapers, consolidation)
│   │   └── supabase/      # Migrations, RLS policies
│   └── scraper/           # ACTIVE: Python 3.10+, Docker, Playwright
│       ├── scrapers/      # Configs, models, handlers, executor
│       ├── core/          # API client, health monitor, retry logic
│       ├── runner/        # Job execution modes
│       └── docs/          # Documentation
├── conductor/             # AI Workflow Engine (TDD, tracks, checkpoints)
└── package.json           # Root workspace config
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| **Feature Dev** | `apps/web/` | Mobile-first, Server Components, TDD required |
| **New Scraper** | `apps/scraper/scrapers/configs/` | Add YAML file, not Python |
| **Scraper Engine** | `apps/scraper/scrapers/executor/` | Core workflow logic |
| **AI Consolidation** | `apps/web/lib/consolidation/` | OpenAI batch processing |
| **AI Workflow** | `conductor/` | Follow `workflow.md` strictly |
| **Admin Portal** | `apps/web/app/admin/` | 22+ module dashboard |
| **Storefront** | `apps/web/app/(storefront)/` | Customer-facing PWA |

## ARCHITECTURE
**Coordinator-Runner Pattern:**
- **apps/web** = Coordinator (dispatches jobs, receives callbacks)
- **apps/scraper** = Runner (stateless Docker containers)
- Communication: `X-API-Key` (bsr_*) auth, HMAC-signed webhooks

## DESIGN SYSTEM (apps/web)
| Color | Hex | Usage |
|-------|-----|-------|
| **Forest Green** | `#008850` | Primary, Sidebar, Ring |
| **Bay State Burgundy** | `#66161D` | Secondary, Foreground |
| **Harvest Gold** | `#FCD048` | Accent, Stars, Discounts |

## CROSS-PROJECT CONVENTIONS
- **Auth**: `X-API-Key` (bsr_*) for Scrapers. `getUser()` + Supabase RLS for App.
- **DB Access**: App via `@supabase/ssr`. Scrapers use API only.
- **Imports**: `@/*` aliases in App. Named exports only.
- **State**: Zustand (cart/UI), URL state (filters), Server Components (data).
- **Git**: `<type>(<scope>): <description>`.

## TESTING
| Project | Framework | Command | Pattern |
|---------|-----------|---------|---------|
| **App** | Jest + RTL | `bun run web test` | `__tests__/` mirrors source |
| **Scraper** | pytest | `python -m pytest` | `tests/unit/` |

- **TDD Required**: Red → Green → Refactor. 80% coverage.

## ANTI-PATTERNS (GLOBAL)
- **NO** database credentials in `apps/scraper` runners
- **NO** `any`, `@ts-ignore`, default exports, `var`
- **NO** direct DB in client components (use Server Actions)
- **NO** code before failing tests (TDD violation)

## SUBPROJECTS
- **apps/web/** → `apps/web/AGENTS.md`
- **apps/scraper/** → `apps/scraper/AGENTS.md`
- **conductor/** → `conductor/AGENTS.md`

## COMMANDS
```bash
# Web App
bun run web dev           # Dev server (localhost:3000)
bun run web test          # Run tests
bun run web lint          # ESLint

# Scraper (Local)
cd apps/scraper && python daemon.py --env dev

# Scraper (Docker)
cd apps/scraper && docker build -t baystate-scraper .
```

## NOTES
- **Tailwind**: App uses v4 (CSS config)
- **ESLint**: App uses ESLint 9 flat config
- **Python**: Ruff linting with ignores (F401, E501, E722)

**Generated:** 2026-02-26
**Context:** Multi-project monorepo for e-commerce (Next.js) and distributed scraping (Python).

**Generated:** 2026-01-11
**Context:** Multi-project monorepo for e-commerce (Next.js) and distributed scraping (Python).

## OVERVIEW
Three-part system: **BayStateApp** (Next.js 16 PWA + Admin), **BayStateScraper** (Python distributed engine), **BayStateTools** (DEPRECATED reference).

## STRUCTURE
```
.
├── BayStateApp/           # MAIN: Next.js 16, Supabase, Tailwind v4, shadcn/ui
│   ├── app/               # App Router (storefront, admin, auth, api)
│   ├── components/        # UI (storefront/, admin/, ui/)
│   ├── lib/               # Core logic (auth, products, scrapers, consolidation)
│   ├── conductor/         # AI Workflow Engine (TDD, tracks, checkpoints)
│   └── supabase/          # Migrations, RLS policies
├── BayStateScraper/       # ACTIVE: Python 3.10+, Docker, Playwright
│   ├── scraper_backend/   # Engine core (YAML DSL, actions, executor)
│   ├── core/              # API client, health monitor, retry logic
│   ├── scrapers/          # Configs, models, handlers
│   ├── src-tauri/         # Desktop app (Rust + Python sidecar)
│   └── ui/                # Tauri frontend (Vite, Tailwind v3)
└── BayStateTools/         # DEPRECATED: Legacy reference only
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| **Feature Dev** | `BayStateApp/` | Mobile-first, Server Components, TDD required |
| **New Scraper** | `BayStateScraper/scrapers/configs/` | Add YAML file, not Python |
| **Scraper Engine** | `BayStateScraper/scraper_backend/` | Core logic, action handlers |
| **AI Consolidation** | `BayStateApp/lib/consolidation/` | OpenAI batch processing, prompt building |
| **AI Workflow** | `BayStateApp/conductor/` | Follow `workflow.md` strictly |
| **Desktop App** | `BayStateScraper/src-tauri/` | Rust + Python sidecar |
| **Reference Only** | `BayStateTools/` | Copy logic, never edit |

## ARCHITECTURE
**Coordinator-Runner Pattern:**
- **BayStateApp** = Coordinator (dispatches jobs via GitHub Actions, receives callbacks)
- **BayStateScraper** = Runner (stateless Docker containers on self-hosted runners)
- Communication: `X-API-Key` (bsr_*) auth, HMAC-signed webhooks, JSON callbacks

**Data Flow:**
1. App creates `scrape_jobs` record → triggers `workflow_dispatch`
2. Runner fetches job config via API → executes YAML workflow
3. Runner POSTs results to `/api/admin/scraping/callback`
4. App validates, stores in `products_ingestion`, triggers consolidation

**Consolidation Pipeline:**
- Batch processing via OpenAI API
- Prompt building from raw scraped data
- Result normalization and taxonomy validation
- Triggers on scrape job completion

## DESIGN SYSTEM (BayStateApp)
| Color | Hex | Usage |
|-------|-----|-------|
| **Forest Green** | `#008850` | Primary, Sidebar, Ring |
| **Bay State Burgundy** | `#66161D` | Secondary, Foreground |
| **Harvest Gold** | `#FCD048` | Accent, Stars, Discounts |
| **Dark Green** | `#2a7034` | Sidebar Hover |

## CROSS-PROJECT CONVENTIONS
- **Auth**: `X-API-Key` (bsr_*) for Scrapers. `getUser()` + Supabase RLS for App.
- **DB Access**: App ONLY via `@supabase/ssr`. Scrapers use API callbacks.
- **Imports**: `@/*` aliases in App. Named exports only.
- **State**: Zustand (cart/UI), URL state (filters), Server Components (data).
- **Forms**: React Hook Form + Zod. Server Actions for mutations.
- **Git**: `<type>(<scope>): <description>`. PRs require `workflow.md` adherence.

## TESTING
| Project | Framework | Command | Pattern |
|---------|-----------|---------|---------|
| **App** | Jest + RTL | `CI=true npm test` | `__tests__/` mirrors source |
| **Scraper** | pytest + custom | `python -m pytest` | `tests/unit/`, YAML `test_skus` |

- **TDD Required**: Red → Green → Refactor. 80% coverage minimum.
- **Mocks**: Supabase via `@/lib/supabase/server`. Radix via `jest.setup.js`.

## ANTI-PATTERNS (GLOBAL)
- **NO** database credentials in `BayStateScraper` runners
- **NO** new features in `BayStateTools` (deprecated)
- **NO** mixed lockfiles (use `package-lock.json` in App)
- **NO** visual changes without `frontend-ui-ux-engineer`
- **NO** `any`, `@ts-ignore`, default exports, `var`
- **NO** direct DB in client components (use Server Actions)
- **NO** code before failing tests (TDD violation)
- **NO** commits without `git notes` task summary

## SUBPROJECTS
- **BayStateApp/** → `BayStateApp/AGENTS.md` (Next.js 16 PWA details)
- **BayStateScraper/** → `BayStateScraper/AGENTS.md` (Python scraper details)

## COMMANDS
```bash
# App
cd BayStateApp && npm run dev          # Dev server (localhost:3000)
cd BayStateApp && CI=true npm test     # Run tests
cd BayStateApp && npm run lint         # ESLint

# Scraper (Local)
cd BayStateScraper && python -m scraper_backend.runner --job-id test

# Scraper (Docker)
cd BayStateScraper && docker build -t baystate-scraper .

# Desktop App
cd BayStateScraper/ui && npm run tauri dev
```

## NOTES
- **Tailwind Versions**: App uses v4 (CSS config), Scraper UI uses v3 (JS config)
- **ESLint**: App uses ESLint 9 flat config, ignores `__tests__/`
- **Python Linting**: Ruff with permissive ignores (F401, E501, E722)
- **Supabase Types**: Regenerate with `npx supabase gen types typescript --local`
- **Current Admin Panel**: `https://www.baystatepet.com/cgi-baystatepet/bo/start.cgi`
