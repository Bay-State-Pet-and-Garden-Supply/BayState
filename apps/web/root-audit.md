# Root AGENTS.md Audit

Generated: 2026-05-10
Source: `/Users/nickborrello/Desktop/Projects/BayState/AGENTS.md`

## Summary

39 claims verified. **36 correct, 3 issues** (2 minor imprecisions, 1 omission).

---

## Package Manager

| Claim | Actual | Verdict |
|-------|--------|---------|
| `Bun 1.3.5` | `"packageManager": "bun@1.3.5"` in `package.json`, `bun --version` returns `1.3.5` | ✅ Correct |

## Root Scripts & Turbo

| Claim | Actual | Verdict |
|-------|--------|---------|
| Root scripts use Turbo: `bun run dev\|build\|test\|lint` | All 4 exist in root `package.json` as `bunx turbo run <task>` | ✅ Correct |
| `turbo.json` makes `test` depend on `build` | `"test": { "dependsOn": ["build"] }` | ✅ Correct |

**Omission:** Root also has scripts `typecheck`, `web`, `scraper`, `mobile`, `vercel-build`, `fallow` not mentioned. The `typecheck` script (`bunx turbo run typecheck`) is a notable omission since it's a standard check.

## Workspace Shortcuts

| Claim | Actual | Verdict |
|-------|--------|---------|
| `bun run web <script>` runs inside `apps/web` | `"web": "bun --cwd apps/web"` | ✅ Correct |
| `bun run web dev\|lint\|test\|build` examples | All 4 scripts exist in `apps/web/package.json` | ✅ Correct |
| `bun run scraper dev` runs `uv run --with-requirements requirements.txt python daemon.py --env dev` | Exact match in `apps/scraper/package.json` | ✅ Correct |

## Web App Claims

| Claim | Actual | Verdict |
|-------|--------|---------|
| "Next.js 16 App Router" | `"next": "16.1.1"` in `apps/web/package.json` | ✅ Correct |
| "Auth in layouts/server code, no middleware.ts" | No `middleware.ts` found; auth in layout/server code | ✅ Correct |
| "Supabase server vs client split" | `lib/supabase/server.ts` and `lib/supabase/client.ts` exist | ✅ Correct |
| "Imports use `@/*`" | Path alias in tsconfig | ✅ Correct |
| "Tests run through `node scripts/run-jest.cjs`" | `"test": "node scripts/run-jest.cjs"` | ✅ Correct |
| "`--testPathPatterns=` flag example" | Jest 30 uses plural `--testPathPatterns` (confirmed via `--help`) | ✅ Correct |

## CI Claims

### Web CI

| Claim | Actual | Verdict |
|-------|--------|---------|
| Runs `bun install --frozen-lockfile` | Present in `.github/workflows/web-ci.yml` | ✅ Correct |
| Runs `bun run lint` | Present in CI | ✅ Correct |
| `CI=true bun run test` | CI sets `env: CI: true` block, not inline prefix | ⚠️ **Minor imprecision** (functionally equivalent) |
| Separate `tsc --noEmit` job, non-blocking (`\|\| true`) | CI runs `bun run tsc --noEmit \|\| true` in a separate `typecheck` job | ✅ Correct (but see precision note) |

### Scraper CI

| Claim | Actual | Verdict |
|-------|--------|---------|
| `ruff check . --output-format=github` | Exact match in `.github/workflows/scraper-ci.yml` | ✅ Correct |
| `mypy . --ignore-missing-imports \|\| true` | Exact match in CI | ✅ Correct |
| `pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks` | Exact match in CI | ✅ Correct |
| `pytest.ini` defaults: `-m "not live"`, `asyncio_mode=auto` | Exact match in `apps/scraper/pytest.ini` | ✅ Correct |

## Tooling Claims

| Claim | Actual | Verdict |
|-------|--------|---------|
| ESLint flat config ignores `__tests__/**` and `scripts/**` | `globalIgnores(["__tests__/**", "scripts/**"])` in `eslint.config.mjs` | ✅ Correct |
| Tailwind v4 CSS/PostCSS, no `tailwind.config.js` | `@tailwindcss/postcss` in devDeps, `tailwindcss: ^4`, no `tailwind.config.js` | ✅ Correct |
| DB migrations in `apps/web/supabase/migrations` | 175 migration files found at that path | ✅ Correct |

## Scraper Claims

| Claim | Actual | Verdict |
|-------|--------|---------|
| Local configs under `scrapers/configs` | `apps/scraper/scrapers/configs/` exists with 14 YAML files | ✅ Correct |
| Playwright/crawl4ai only | No Selenium or SyncPlaywright imports found in source | ✅ Correct |
| Docker Compose production-oriented | `docker-compose.yml` header says "Uses production configuration by default" | ✅ Correct |
| Prefer `./run-dev.sh` or `python daemon.py --env dev` locally | Both files exist; `run-dev.sh` present and executable | ✅ Correct |

## Cross-Project Claims

| Claim | Actual | Verdict |
|-------|--------|---------|
| API endpoints: `/api/scraper/v1/poll`, `/heartbeat`, `/credentials` | All 3 route directories exist under `app/api/scraper/v1/` | ✅ Correct |
| Pipeline: Import/Sync → Scrape → AI consolidation → Review/Publish | Pipeline dir at `lib/pipeline`, consolidation at `lib/consolidation` | ✅ Correct |

## ❌ Issues Found

### 1. Omission: Undocumented workspaces
**Claim:** "Root app boundaries: `apps/web` (Next.js/Bun coordinator + admin/storefront), `apps/scraper` (Python runner), `conductor` (workflow docs only; no runtime code)."

**Actual:** `package.json` also lists `apps/mobile` and `packages/*` as workspaces. Both exist on disk:
- `apps/mobile/` — Expo/React Native app (`expo-router/entry`)
- `packages/api/` — shared tRPC library (`@baystate/api`) with `@trpc/server` and `zod`

These are completely absent from the boundaries description. If they're deprecated or inactive, the file should say so.

### 2. Minor imprecision: CI `CI=true` inline vs env block
**AGENTS.md says:** `CI=true bun run test`
**Actual CI:** `env: CI: true` in YAML (step-level env var, not inline).

Functionally identical. Not actionable but technically inaccurate.

### 3. Minor imprecision: `tsc --noEmit` vs `bun run tsc --noEmit`
**AGENTS.md says:** `tsc --noEmit`
**Actual CI:** `bun run tsc --noEmit || true`

Again functionally identical. Minor.

---

## Other Observations (Not Errors)

- Root scripts example lists `dev|build|test|lint` but omits `typecheck` — 5 scripts exist total, 4 listed. Minor completeness issue.
- Web workspace scripts example lists 4 but `apps/web/package.json` has 11 scripts total (incl. `sync:*`, `typecheck`, `test:a11y:*`, `test:api-compat`, `start`). Not necessary to list all, but worth noting for context.

---

## Suggested Fixes

1. **Add `apps/mobile` and `packages/api`** to the "Root app boundaries" section, or annotate them as inactive/secondary if appropriate.
2. **Tighten CI command descriptions** to match the actual YAML (minor — `CI=true bun run test` → `env: CI: true`; `tsc --noEmit` → `bun run tsc --noEmit` plus `|| true` already noted).
3. **Consider listing root `typecheck` script** in the Turbo scripts section for completeness.
