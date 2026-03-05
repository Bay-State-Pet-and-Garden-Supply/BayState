# BAY STATE WORKSPACE

**Generated:** 2026-03-04
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
- **DB Access**: App ONLY via `@supabase/ssr`. Scrapers use API callbacks (NO direct DB credentials).
- **Imports**: `@/*` aliases in App. Named exports only (no default exports for libraries).
- **State**: Zustand (cart/UI), URL state (filters), Server Components (data).
- **Forms**: React Hook Form + Zod validation. Server Actions for mutations.
- **Git**: `<type>(<scope>): <description>`. PRs require `workflow.md` adherence.
- **Package Manager**: Bun v1.3.5 (`bun install --frozen-lockfile`)

## TESTING
| Project | Framework | Command | Pattern |
|---------|-----------|---------|---------|
| **App** | Jest + RTL | `CI=true npm test` | `__tests__/` mirrors source |
| **App E2E** | Playwright | `npm run test:a11y:e2e` | `tests/e2e/` |
| **Scraper** | pytest | `python -m pytest` | `tests/unit/`, `scraper_backend/tests/` |

- **TDD Required**: Red → Green → Refactor. 80% coverage minimum.
- **Mocks**: Supabase via `@/lib/supabase/server`. Radix via `jest.setup.js`.
- **CI Mode**: Use `CI=true` for all automated test commands.

## ANTI-PATTERNS (GLOBAL)
- **NO** database credentials in `BayStateScraper` runners (API callbacks only)
- **NO** new features in `BayStateTools` (deprecated - reference only)
- **NO** mixed lockfiles (use Bun + `bun.lockb` in App)
- **NO** visual changes without `frontend-ui-ux-engineer`
- **NO** `any`, `@ts-ignore`, `@ts-expect-error` (strict TypeScript)
- **NO** default exports (named only for refactoring)
- **NO** `var` (use `const`/`let` with strict typing)
- **NO** direct DB in client components (use Server Actions)
- **NO** logic in page files (move to `lib/` or components)
- **NO** code before failing tests (TDD violation)
- **NO** commits without `git notes` task summary
- **NO** Selenium (Playwright only in scrapers)
- **NO** `print()` in scraper production code (use structured logger)
- **NO** bare `except:` clauses (classify failures for retry logic)

## COMMANDS

### BayStateApp (Next.js)
```bash
cd BayStateApp
bun install --frozen-lockfile      # Install deps (uses Bun v1.3.5)
bun run dev                         # Dev server (localhost:3000)
CI=true npm test                    # Run Jest tests with coverage
npm run test:a11y:e2e               # Playwright E2E tests
npm run lint                        # ESLint 9 flat config
bun run build                       # Production build (Vercel)
```

### BayStateScraper (Python)
```bash
cd BayStateScraper
pip install -r requirements.txt     # Install deps
python daemon.py --env dev          # Local polling (localhost:3000)
./run-dev.sh                        # Dev mode wrapper
./run-prod.sh                       # Production mode (Vercel)
python -m pytest                    # Run test suite
ruff check .                        # Lint check
mypy scraper_backend/               # Type check (non-blocking)
```

### Docker (Scraper)
```bash
cd BayStateScraper
docker build -t baystate-scraper .  # Build image
docker compose up -d                # Start runner stack
docker logs -f baystate-scraper     # View logs
```

### Desktop App (Tauri)
```bash
cd BayStateScraper/ui
npm install
npm run tauri dev                   # Dev mode with hot reload
```

## NOTES
- **Tailwind Versions**: App uses v4 (CSS config), Scraper UI uses v3 (JS config)
- **ESLint**: App uses ESLint 9 flat config, ignores `__tests__/`
- **Python Linting**: Ruff with permissive ignores (F401, E501, E722)
- **Supabase Types**: Regenerate with `npx supabase gen types typescript --local`
- **Bun Migration**: App migrated from npm to Bun (use `bun.lockb` not `package-lock.json`)
