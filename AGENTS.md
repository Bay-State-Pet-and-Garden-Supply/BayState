# BAY STATE WORKSPACE

**Generated:** 2026-03-13
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
│   │   └── supabase/     # Migrations, RLS policies
│   └── scraper/           # ACTIVE: Python 3.10+, Docker, Playwright
│       ├── scrapers/       # Configs, models, handlers, executor
│       ├── core/           # API client, health monitor, retry logic
│       ├── runner/         # Job execution modes
│       └── docs/           # Documentation
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
bun run web lint         # ESLint

# Scraper (Local)
cd apps/scraper && python daemon.py --env dev

# Scraper (Docker)
cd apps/scraper && docker build -t baystate-scraper .
```

## NOTES
- **Tailwind**: App uses v4 (CSS config)
- **ESLint**: App uses ESLint 9 flat config
- **Python**: Ruff linting with ignores (F401, E501, E722)
