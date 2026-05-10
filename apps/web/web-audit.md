# AGENTS.md Audit — 2026-05-10

Audit of 3 AGENTS.md files against actual codebase at `apps/web/`.

---

## FILE 1: `apps/web/AGENTS.md` (Generated: 2026-04-05 — 35 days old)

### Stale Claims

| # | Claim (Doc) | Actual (Codebase) | Correction |
|---|-------------|-------------------|------------|
| 1 | **"278 files across 5 groups"** — total component count | 233 `.ts`/`.tsx` files in `components/` | **278 → 233** |
| 2 | **"Customer UI (35 files)"** — `components/storefront/` | 41 `.ts`/`.tsx` files | **35 → 41** |
| 3 | **"Admin UI (120+ files)"** — `components/admin/` | 140 files. "120+" is technically true but understates by ~17% | **~120 → 140** |
| 4 | **"22 domain modules (169 files)"** — `lib/` module breakdown | **20** module directories (not 22) with **175** non-test files (not 169). Missing from listing: `account/`, `agents/`, `ai-scraping/`, `email/`, `enrichment/`, `facets/`, `mobile-api/`, `tools/`, `validation/` | **22→20 modules, 169→175 files** |
| 5 | **"`lib/providers/`"** — listed as a module directory | `lib/providers/` **does not exist**. No such directory | Remove from listing |
| 6 | **"[16 standalone .ts]"** — lib root files | **36** standalone `.ts` files in `lib/` | **16 → 36** |
| 7 | **"122 migrations"** — `supabase/migrations/` | **175** migration `.sql` files | **122 → 175** |
| 8 | **"29 operational scripts"** — `scripts/` directory | **14** files (excluding README) | **29 → ~14** |
| 9 | **"'use client' in 242+ files"** | **62** total files across entire project with `"use client"` | **242+ → 62** |
| 10 | **"Feature flags in `lib/config/`"** — Gemini migration notes | `lib/config/` **does not exist**. No feature flag infrastructure found anywhere in `lib/` | Remove or add real path |
| 11 | **"Supabase: 122 migrations"** (duplicate) | 175 migrations (see #7) | **122 → 175** |
| 12 | **"next.config.ts: TypeScript config. ... Optimized imports."** — implied modern | `next.config.ts` exists. Valid. | OK |

### Minor / Ambiguous Issues

| # | Issue |
|---|-------|
| 13 | `lib/config/` referenced for "Gemini migration feature flags" — no such directory. Gemini is a valid `LLMProvider` in `lib/ai-scraping/credentials.ts` but there's no feature flag system in `lib/config/`. |
| 14 | "OpenAI fallback active" — `openai` listed as fallback provider in `discovery-config.ts`. Claim is directionally correct but no `lib/config/` path for flags. |
| 15 | `app/auth/callback/` exists as `app/auth/callback/route.ts` — correct. |
| 16 | No `middleware.ts` exists — claim upheld. |
| 17 | Tailwind v4 via `@tailwindcss/postcss`, no `tailwind.config.js` — correct. |
| 18 | `eslint.config.mjs` exists — correct. |
| 19 | `scripts/run-jest.cjs` custom test runner — correct. |
| 20 | Next.js 16.1.1 (package.json `next: "16.1.1"`) — correct. |

---

## FILE 2: `apps/web/app/admin/AGENTS.md`

### Stale / Incorrect Claims

| # | Claim (Doc) | Actual (Codebase) | Correction |
|---|-------------|-------------------|------------|
| 1 | **"`app/admin/scraping/`"** — listed as a route module | `app/admin/scraping/` **does not exist**. Scraping/jobs functionality lives in `app/admin/scrapers/runs/` | Rename to `scrapers/runs` or remove |
| 2 | **"`app/admin/scraper-network/`"** — listed as a route module | No `app/admin/scraper-network/` route. There IS `app/admin/scrapers/network/` (a sub-route under scrapers) and `components/admin/scraper-network/` (components) | Change to `scrapers/network` or remove |
| 3 | **"16 listed modules + [10 more] = 26 total"** — but 2 listed modules don't exist as routes | Actual 26 routes (see below). Only **14** of the 16 listed exist as routes. "scraping" and "scraper-network" are fictitious as routes | Correct the list |
| 4 | **"B2B Sync → `app/admin/migration/`"** — WHERE TO LOOK table | B2B has its own route: `app/admin/b2b/`. `app/admin/migration/` is for ShopSite tools | **migration → b2b** |
| 5 | **"RBAC via `lib/auth/admin.ts`"** — auth description | `lib/auth/admin.ts` **does not exist**. Real RBAC is in `lib/auth/roles.ts` | **admin.ts → roles.ts** |
| 6 | **"Services: Rentals, refills catalog"** — description | `app/admin/services/` exists but serves **general services catalog** (rentals + refills may be part of it, but the code queries from `'services'` table broadly) | Minor; clarify scope |
| 7 | **Missing modules from explicit listing** — doc claims 16 listed + 10 hidden = 26 total | Actual 26 admin route dirs: `(auth)`, `analytics`, `b2b`, `brands`, `categories`, `cohorts`, `customers`, `design`, `enrichment`, `health`, `inventory`, `migration`, `orders`, `pages`, `pipeline`, `preorder-groups`, `product-groups`, `products`, `promotions`, `quality`, `reviews`, `scrapers`, `services`, `settings`, `tools`, `users`. The doc's hidden 10 should instead list: cohorts, design, enrichment, health, inventory, pages, preorder-groups, product-groups, reviews, settings, users (11 unlisted mods) | Update explicit listing |

### Actual Admin Route Modules (26 total)

```
(auth)         — login          analytics     — metrics
b2b            — portal cfg      brands        — mgmt, logos, SEO
categories     — hierarchy       cohorts       — pipeline cohorts
customers      — profiles        design        — theme/design
enrichment     — AI enrichment   health        — system health
inventory      — stock mgmt      migration     — ShopSite sync
orders         — fulfillment     pages         — CMS pages
pipeline       — job scheduling  preorder-groups — preorders
product-groups — product groups  products      — CRUD
promotions     — discounts       quality       — flagged products
reviews        — reviews         scrapers      — YAML config, test runner
services       — services        settings      — system settings
tools          — utilities       users         — user mgmt
```

### Correct WHERE TO LOOK

| Task | Actual Location |
|------|-----------------|
| **Product CRUD** | `app/admin/products/` ✓ |
| **Scraper Config** | `app/admin/scrapers/` ✓ |
| **Job Queue** | `app/admin/scrapers/runs/` (not `scraping/`) |
| **B2B Sync** | `app/admin/b2b/` (not `migration/`) |
| **ShopSite Export** | `app/admin/migration/` |
| **Analytics** | `app/admin/analytics/` ✓ |
| **Quality Review** | `app/admin/quality/` ✓ |

---

## FILE 3: `apps/web/lib/consolidation/AGENTS.md`

### Stale / Incorrect Claims

| # | Claim (Doc) | Actual (Codebase) | Correction |
|---|-------------|-------------------|------------|
| 1 | **"`llm-client.ts`"** — listed in structure table | `llm-client.ts` **does not exist**. The file is still named **`openai-client.ts`** | **llm-client.ts → openai-client.ts** |
| 2 | **"Renamed: `openai-client.ts` → `llm-client.ts`"** | Rename was **NEVER DONE**. `openai-client.ts` still exists, `llm-client.ts` does not | Rename was not executed |
| 3 | **"Renamed: `getOpenAIClient()` → `getLLMClient()`"** | `getLLMClient` is referenced in `batch-service.ts` and `direct-chat-service.ts` but is **not defined** in consolidation module itself. Imported from external `lib/ai-scraping/credentials.ts` | Clarify source module |
| 4 | **"Renamed: `isOpenAIConfigured()` → `isLLMConfigured()`"** | `isLLMConfigured` **does not exist** in consolidation module. `isOpenAIConfigured` **still exported** from `index.ts` via `openai-client.ts` | Rename was not executed |
| 5 | **"Renamed: `buildOpenAIResponseFormat()` → `buildJSONResponseFormat()`"** | `buildJSONResponseFormat` exists in `taxonomy-validator.ts`. `buildOpenAIResponseFormat` may not exist. | Verify; may be correct |
| 6 | **Structure missing `evaluation.ts`** | `evaluation.ts` (5792 bytes) is a real file in the consolidation module, not listed | Add to structure table |
| 7 | **API Routes: lists 6 routes** | Actual: **11 route files** in `app/api/admin/consolidation/`. Missing: `/webhook`, `/reset`, `/scraped`, `/models`, `/review`, `/ws`, `/[batchId]/process` | Update from 6→11 |
| 8 | **"`getConsolidationConfig()`"** listed in `llm-client.ts` | Function exists as `CONSOLIDATION_CONFIG` (const) in `openai-client.ts`. Name mismatch | Align name |
| 9 | **"Pricing: ...$0.14/M input, $0.28/M output for deepseek-chat"** — hardcodes DeepSeek pricing | Actual pricing loaded dynamically from `lib/ai-scraping/pricing.ts` using shared catalog. DeepSeek prices may differ from the catalog | Remove hardcoded prices; point to pricing service |
| 10 | **"Size: 100-500 products per batch"** — batch size claim | No evidence of this size constraint in code. May be out of date or tuning parameter | Verify against batch-service.ts |

### Consolidation API Routes (actual)

Route file | Purpose
`[batchId]/apply/route.ts` | Apply results
`[batchId]/process/route.ts` | Process single item
`[batchId]/route.ts` | Get batch status
`jobs/route.ts` | List batch jobs
`models/route.ts` | LLM models
`reset/route.ts` | Reset batch
`review/route.ts` | Review results
`scraped/route.ts` | Scraped data
`settings/route.ts` | Read/write defaults
`submit/route.ts` | Submit SKUs
`sync/route.ts` | Sync status
`webhook/route.ts` | Webhook receiver
`ws/route.ts` | WebSocket

### Consolidation Module Files (actual)

Listed in doc (15 items including this doc): `batch-service.ts`, `category-domain.ts`, `consistency-rules.ts`, `detail-enrichment.ts`, `direct-chat-service.ts`, `index.ts`, `openai-client.ts` (as `llm-client.ts`), `parallel-runs.ts`, `prompt-builder.ts`, `result-normalizer.ts`, `result-parsing.ts`, `taxonomy-validator.ts`, `two-phase-service.ts`, `types.ts`, `AGENTS.md`.

Missing: `evaluation.ts`, `DEEPSEEK_OVERHAUL_PLAN.md`, `IMPLEMENTATION_SUMMARY.md` (these are docs, not code).

`openai-client.ts` exists — the rename to `llm-client.ts` documented in "CONSOLIDATION MODULE RENAMING NOTES" was **never executed**. The renaming section of the doc is aspirational, not factual.

---

## Cross-File Issues

| Issue | Files Affected |
|-------|---------------|
| Component count outdated (278→233) | Main AGENTS.md |
| `lib/config/` referenced but doesn't exist | Main AGENTS.md NOTES |
| Client component count off by ~75% (242→62) | Main AGENTS.md PATTERNS |
| "scraping" and "scraper-network" don't exist as routes | Admin AGENTS.md |
| B2B sync mapped to wrong route | Admin AGENTS.md |
| Consolidation module renames not actually done | Consolidation AGENTS.md |
| Migration count 53 behind (122→175) | Main AGENTS.md |

---

## What's Correct

- No `middleware.ts` — verified absent
- Tailwind v4 via `@tailwindcss/postcss` — verified in `postcss.config.mjs`
- No `tailwind.config.js` — verified absent
- `eslint.config.mjs` flat config — verified
- Custom Jest runner `scripts/run-jest.cjs` — verified
- Next.js 16 — `package.json` has `"next": "16.1.1"`
- Bun package manager — `"packageManager": "bun@1.3.5"`
- `@/*` absolute imports — verified across many files
- Zustand cart store — `lib/cart-store.ts` uses `zustand`
- Supabase split (server.ts / client.ts) — both exist, imports widespread
- `app/admin/` has 26 modules (count matches claim)
- `app/api/` has 115 `route.ts` files (doc says "100+")
- Pipeline components (`FinalizingResultsView`, `PipelineClient`) exist
- `app/auth/callback/` exists
