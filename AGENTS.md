# BayState agent notes

## Read scope-specific notes first
- Root app boundaries: `apps/web` (Next.js/Bun coordinator + admin/storefront), `apps/scraper` (Python runner), `apps/mobile` (Expo/React Native; less active), `packages/api` (shared tRPC library `@baystate/api`), `conductor` (workflow docs only; no runtime code).
- More specific instructions exist and override this file: `apps/web/AGENTS.md`, `apps/web/app/admin/AGENTS.md`, `apps/web/lib/consolidation/AGENTS.md`, `apps/scraper/AGENTS.md`, plus scraper subdirectory `AGENTS.md` files.

## Monorepo commands that are easy to guess wrong
- Package manager is Bun 1.3.5 (`packageManager`); prefer Bun over npm even where old READMEs show npm.
- Root scripts use Turbo: `bun run dev|build|test|lint|typecheck`. Note `turbo.json` makes root `test` depend on `build`; for focused checks use workspace commands instead.
- Web workspace shortcut: `bun run web <script>` runs inside `apps/web` (examples: `bun run web dev`, `bun run web lint`, `bun run web test`, `bun run web build`).
- Scraper workspace shortcut: `bun run scraper dev` runs `uv run --with-requirements requirements.txt python daemon.py --env dev`.

## Web app (`apps/web`)
- Next.js 16 App Router; `app/(storefront)` is customer UI, `app/admin` is the admin portal, `app/api` includes scraper/admin/payment/internal APIs.
- Auth is handled in layouts/server code, not middleware; do not add `middleware.ts` for auth.
- Supabase clients are split: server code uses `lib/supabase/server.ts`, browser code uses `lib/supabase/client.ts`; client components must not access the DB directly.
- Imports use `@/*` from `apps/web`; TypeScript is strict and path aliases are in `tsconfig.json`.
- Tests run through `node scripts/run-jest.cjs` because it finds a real Node executable instead of Bun’s node shim. Focused test example: `bun run web test -- --testPathPatterns="brands"` or pass a test file path after `--`.
- CI for web runs, in order, `bun install --frozen-lockfile`, `bun run lint`, `bun run test` (with `env: CI: true` in workflow YAML); the separate `bun run tsc --noEmit || true` job runs typechecking as non-blocking.
- ESLint flat config ignores `__tests__/**` and `scripts/**`; lint failures there require targeted checks, not `bun run web lint`.
- Tailwind is v4 CSS/PostCSS based; there is no `tailwind.config.js` to edit.
- DB migrations live in `apps/web/supabase/migrations` and use timestamp filenames; keep schema changes there rather than ad hoc SQL in app code.

## Scraper (`apps/scraper`)
- Runner is API-only: use `X-API-Key: bsr_*` to talk to the web coordinator; do not add direct database credentials or DB access to runner code.
- Runtime flow is coordinator-runner: web queues jobs/callbacks, scraper polls or uses realtime, executes Playwright/crawl4ai, and posts results back.
- Local config files exist under `scrapers/configs`, but new/production scraper configs are published through the BayState admin UI/API; avoid treating local YAML as the deployment source of truth.
- Scraper configs should keep selectors/workflows in YAML; do not hardcode vendor selectors in Python handlers.
- Use Playwright/crawl4ai only; do not introduce Selenium or `SyncPlaywright` in production paths.
- Use structured logging instead of `print()`, and classify retryable failures instead of bare `except:`.
- Test/lint commands from `apps/scraper`: `python -m pytest`, `pytest -m "not benchmark and not live and not performance" --ignore=tests/benchmarks` (CI subset), `ruff check . --output-format=github`, `mypy . --ignore-missing-imports || true`.
- `pytest.ini` defaults to `-m "not live"` and `asyncio_mode=auto`; live/benchmark/performance suites are intentionally excluded from normal CI.
- Local scraper QA examples: `python runner.py --local --config scrapers/configs/phillips.yaml --test-mode` and add `--sku ...` or `--no-headless` for focused debugging.
- Docker Compose in `apps/scraper/docker-compose.yml` is production-oriented by default; for local development prefer `./run-dev.sh` or `python daemon.py --env dev`.

## Cross-project integration facts
- `apps/web` is the coordinator; `apps/scraper` is a stateless runner. Scraper API endpoints include `/api/scraper/v1/poll`, `/heartbeat`, `/credentials`, and admin scraping callbacks.
- Product pipeline is Import/Sync → Scrape → AI consolidation → Review/Publish. Web pipeline logic is under `apps/web/lib/pipeline`; AI consolidation is under `apps/web/lib/consolidation`.
- Scraper test assertions are shared across UI/API/runner: YAML `test_assertions` feed Admin Scraper Lab jobs and runner `--test-mode` assertion diffs.
- Git commit style in existing guidance is conventional commits: `<type>(<scope>): <description>`.
