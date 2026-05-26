# Scraper Architecture Scout Report

## Overview

The BayState scraper is an **async Python 3.10+ runner** that acts as an API-only worker, polling a Next.js coordinator (the web app) for jobs. It has fully transitioned from a static YAML-selector-based scraping engine to an **AI-driven extraction pipeline** centered on Crawl4AI v0.3.0+. Static scraping has been deactivated (Phase 10).

---

## 1. Project Structure (`apps/scraper/`)

| Path | Purpose |
|---|---|
| `daemon.py` | **Entry point** — persistent async polling loop, job claiming, heartbeat. Runs in Docker with `restart: unless-stopped`. |
| `runner/__init__.py` | **Job dispatcher** — routes enrichment jobs to approved source extraction or direct URL extraction (latter now deprecated). |
| `runner/cli.py` | CLI for standalone mode (`--mode full`, `--mode chunk_worker`, `--mode realtime`). |
| `core/api_client.py` | **HTTP client** for coordinator — `claim_enrichment()`, `submit_enrichment_result()`, heartbeat, credentials. |
| `core/` | Infrastructure: retry executor, event bus, settings manager, ScraperAPIClient, failure classifier, scheduler, realtime manager, ScraperCache. |
| `scrapers/` | Domain logic for scraping. |
| `scrapers/ai_search/` | AI-powered search (Serper) + extraction (`Crawl4AIExtractor`, `ProductPageExtractor`). |
| `scrapers/approved_sources/` | **Approved source extraction** — adapters for 5 distributors + SERP discovery for official brands. |
| `scrapers/product_url_extraction/` | Product page URL extraction (`ProductPageExtractor`). |
| `scrapers/providers/` | LLM provider factory (OpenAI, DeepSeek), Serper search client. |
| `src/crawl4ai_engine/` | **Core Crawl4AI engine** — low-level async web crawling with anti-bot stealth, fallback chains, metrics. |
| `utils/` | Logging, structured logging handlers, Sentry. |
| `config/` | `settings.example.json`, `evaluation_thresholds.yaml`, `shopsite_constants.py`. |

---

## 2. Coordinator-Runner Flow

### Flow Diagram

```
Web (Next.js)                          Scraper (Python)
────────────                           ────────────────
enrichment_jobs (table)                daemon.py (polling loop)
  ↓                                      ↓
enrichment_attempts (table)           POST /api/scraper/v1/claim-enrichment
  └─ status: "queued"  ────────────►    └─ claims → status: "running"
  └─ source_plan (JSON)                    └─ gets source_plan + ai_credentials
                                           ↓
                                          runner/__init__.py
                                          _run_enrichment_job()
                                            ├─── approved source extraction
                                            │     or
                                            └─── deprecated direct URL
                                           ↓
                                          executor / adapter extracts
                                           ↓
                                          POST /api/scraper/v1/enrichment-callback
  ◄────────────────────────────────────    └─ EnrichmentResultV1 JSON
  └─ merges into sources.enriched
  └─ updates pipeline_status
```

### Key Tables (Supabase)
- **`enrichment_jobs`** — Job-level tracking: status, mode, model, config, source_plans_by_upc (JSON), lease_token.
- **`enrichment_attempts`** — Per-UPC attempts: status, upc, source_url, job_id, lease info, retry_count.
- **`brand_sources`** — Configured sources per brand: source_type (official_brand/distributor), domains, adapter_slug, requires_auth, credential_ref, search_mode, allowed_fields, priority, enabled.

### Claim Flow (web side: `app/api/scraper/v1/claim-enrichment/route.ts`)
1. Validates runner via `X-API-Key` (bsr_*)
2. Finds `enrichment_attempts` where `status='queued'`, up to `max_attempts`
3. Atomically updates to `status='running'`, sets `claimed_by`, `started_at`
4. Looks up associated `enrichment_jobs`, resolves `ai_credentials` via `getAIScrapingRuntimeCredentialsForConfig()`
5. Attaches `source_plan` (from `source_plans_by_upc[upc]` in job config), or sends sentinel URL `"approved_source_extraction"`
6. Returns `ClaimedEnrichment` matching the Python dataclass shape

### Callback Flow (web side: `app/api/scraper/v1/enrichment-callback/route.ts`)
1. Validates runner
2. Parses and Zod-validates `EnrichmentResultV1` JSON
3. For approved source results, calls `mergeEnrichedSource()` which upserts into `sources.enriched` table
4. Updates `enrichment_attempts` status
5. Determines if retry is needed (max 5 attempts)
6. Updates `enrichment_jobs` progress

---

## 3. Crawl4AI Engine (`src/crawl4ai_engine/`)

### Architecture

```
Crawl4AIEngine (async context manager)
  ├── BrowserConfig — headless Chromium, stealth flags, UA rotation, proxy
  ├── CrawlerRunConfig — magic mode, simulate_user, scroll, cache, pruning
  ├── Extraction strategies: CSS, XPath (static), LLM (via crawl4ai LLMExtractionStrategy)
  ├── AntiBotConfigGenerator — fingerprint pools, Chrome stealth
  ├── CircuitBreaker — failure threshold + cooldown
  └── Crawl4AIMetricsCollector — per-site perf, Prometheus /metrics
```

### Extraction Modes
| Mode | Speed | When |
|---|---|---|
| **LLM-Free** | 2-4s | Structured pages, e-commerce JSON-LD/meta |
| **LLM** | 8-15s | Complex/unstructured data |
| **Auto** | 2-8s | Default — tries LLM-free first, falls back |

### Fallback Chain (in `Crawl4AIExtractor`, not the low-level engine)
1. **JSON-LD extraction** from page HTML (fast, structured)
2. **Meta tags extraction** (og:, twitter:, product:)
3. **Fallback HTTP extractor** — HTTP GET + parse
4. **LLM extraction** — crawl4ai `LLMExtractionStrategy` with schema
5. **Manual review** (if all fail)

### Anti-Bot Features
- Browser fingerprint pools
- User-Agent rotation
- Proxy support
- Chrome stealth flags (`enable_stealth`)
- `simulate_user`, `magic` mode
- Overlay removal, scroll simulation

---

## 4. Approved Source Extraction (`scrapers/approved_sources/`)

### Architecture

```
ApprovedSourcePlan (coordinator-built per-UPC)
  └─ priority[]: ApprovedSourcePlanEntry[]
       └─ adapterSlug → ApprovedSourceAdapter
            ├── BaseDistributorCrawl4AIAdapter (shared base)
            │    ├── BradleyAdapter     — bradleycaldwell.com (no auth)
            │    ├── CentralPetAdapter  — centralpet.com (no auth)
            │    ├── OrgillAdapter      — orgill.com (auth required)
            │    ├── PhillipsAdapter    — shop.phillipspet.com (auth required)
            │    └── PetFoodExpertsAdapter — orders.petfoodexperts.com (auth)
            └── SerpDiscoveryAdapter     — autonomous SERP + LLM discovery
                                          for official brand sites
```

### Adapter Flow (per `BaseDistributorCrawl4AIAdapter`)
1. **Credential check** — returns `AUTH_REQUIRED` if auth needed and no credentials
2. **Build search URL** — UPC query on distributor site
3. **Fetch HTML** — httpx (public) or authenticated Crawl4AI session (auth-gated)
4. **JS rendering detection** — if skeleton/Angular/Vue detected, browser fallback via Crawl4AI
5. **Parse HTML deterministically** — BeautifulSoup with legacy-distilled selectors
6. **Sku/identifier matching** — normalized UPC comparison across candidates
7. **Image normalization + policy filtering** — replace `/thumb/` → `/large/`, block disallowed domains
8. **Build `EnrichmentResultV1`** — success/partial/failed with confidence scoring

### SerpDiscoveryAdapter (for official brands without distributor relationship)
Multi-phase autonomous discovery:
1. **Phase 1: UPC Discovery** — Serper API search for raw UPC
2. **Phase 2: LLM Name Consolidation** — LLM (DeepSeek/OpenAI) reconciles register name with search results
3. **Phase 3: Brand Site Search** — `site:branddomain.com <consolidated_name>` via Serper, LLM selects best URL
4. **Phase 3b: Open Web Fallback** — If brand site search fails, search open web with disallowed-domain filtering
5. **Phase 4: Extraction** — Uses `ProductPageExtractor` to extract from selected URL

---

## 5. Product Page Discovery

Currently handled at **two levels**:

### A. Coordinator Level (web side: `lib/approved-sources/source-plan.ts`)
- `buildApprovedSourcePlans()` loads products, brands, brand_sources from Supabase
- Builds per-UPC `ApprovedSourcePlan` with prioritized source entries
- Entries come from `brand_sources` table (configured per-brand in admin UI)
- Five fixed distributor catalog entries act as fallback when not configured in DB
- `source_plans_by_upc` is stored in job config JSON when job is created

### B. Runner Level (scraper side)
- **Distributor adapters** — build a UPC search URL on the distributor's site, fetch HTML, find matching product via selectors
- **SerpDiscoveryAdapter** — uses LLM + Serper to discover product page URL on the brand's official site
- **Direct URL** (legacy/deprecated) — extract from a pre-known URL

---

## 6. Existing Brand-Specific Configs

No static YAML configs remain active. All brand configuration lives in:

1. **`brand_sources` Supabase table** — per-brand source entries: source_type, domains, adapter slug, auth flags, search mode, allowed fields, priority
2. **`brands` table** — `official_domains` (used as fallback for official_brand entries)
3. **`product.enrichment_config.enabled_sources`** — per-product overrides for which sources are enabled

### Distributor Catalog (hardcoded fallback in `distributor-catalog.ts`):
| Slug | Display Name | Auth | Priority |
|---|---|---|---|
| `bradley` | Bradley Caldwell | No | 10 |
| `central_pet` | Central Pet | No | 20 |
| `orgill` | Orgill | Yes | 30 |
| `phillips` | Phillips Pet | Yes | 40 |
| `pet_food_experts` | Pet Food Experts | Yes | 50 |

---

## 7. How the Proposal's Crawl4AI-First Approach Would Integrate

### Current State
Crawl4AI is **already the foundation** — both the low-level engine (`src/crawl4ai_engine/`) and the high-level extractor (`Crawl4AIExtractor` in `ai_search/`) use Crawl4AI. The engine handles browser rendering, content extraction, anti-bot evasion, and fallback chaining. Approved source adapters use Crawl4AI for browser-fallback when sites need JS rendering.

### Integration Points for Broader Crawl4AI Usage

1. **Replace HTTPX fetches in distributor adapters** — Currently `BaseDistributorCrawl4AIAdapter` uses httpx for public distributor fetches, only falling back to Crawl4AI for JS-rendered sites. A Crawl4AI-first approach would use the engine for all fetches, leveraging its anti-bot, caching, and rendering capabilities uniformly.

2. **Replace SerpDiscoveryAdapter's HTTP fallback** — The Serper-based URL discovery could be complemented by Crawl4AI's direct page analysis (e.g., crawl the brand's sitemap or index page to find product URLs rather than relying solely on search APIs).

3. **Unified extraction pipeline** — The current extraction chain (JSON-LD → Meta → Fallback → LLM) runs inside `Crawl4AIExtractor` (ai_search module) but the approved source adapters do their own deterministic HTML parsing. A Crawl4AI-first approach would push all extraction through the engine's strategies (CSS/XPath/LLM) rather than having adapters parse HTML manually.

4. **Config-driven extraction** — The `crawl4ai_engine` has a YAML config system (`config.py`) and extraction strategies (`strategies/`). Brand-specific extraction behaviors (selectors, fields) could be published as YAML configs rather than hardcoded in Python adapter classes.

5. **LLM extraction standardization** — Currently LLM extraction is called in two places: `Crawl4AIExtractor._extract_inner()` (via crawl4ai's `LLMExtractionStrategy`) and `SerpDiscoveryAdapter` (via `create_llm_provider()`). These could be unified through the engine's LLM mode.

6. **Anti-bot consolidation** — The `AntiBotConfigGenerator` in the engine already has sophisticated fingerprint/UA/proxy pools. Distributor adapters currently use simple httpx headers. A Crawl4AI-first approach would route all traffic through the engine's anti-bot layer.

---

## 8. Key Files to Change

| Task | File(s) |
|---|---|
| Modify extraction pipeline | `apps/scraper/src/crawl4ai_engine/engine.py`, `strategies/` |
| Modify distributor adapters | `apps/scraper/scrapers/approved_sources/adapters/` |
| Modify URL discovery | `apps/scraper/scrapers/approved_sources/adapters/serp_discovery.py` |
| Modify source plan building | `apps/web/lib/approved-sources/source-plan.ts` |
| Modify source plan types | `apps/web/lib/approved-sources/types.ts` |
| Add new brand source config | DB: `brand_sources` table, admin UI: `apps/web/app/admin/brands/` |
| Modify API/schemas | `apps/scraper/api/`, `apps/web/app/api/scraper/v1/` |
| Result handling | `apps/web/lib/enrichment/merge-enriched-source.ts` |
| DB migrations | `apps/web/supabase/migrations/` |

---

## 9. Constraints & Risks

1. **No direct DB access from scraper** — runner communicates only via API. All brand config must go through coordinator.
2. **Async-only** — the engine is `async` throughout; sync operations are explicitly forbidden.
3. **Auth-gated distributors** — Phillips, Orgill, Pet Food Experts require login sessions managed by a `LoginManager`. Adding new auth-required sources means writing login automation configs.
4. **Policy enforcement** — disallowed domains (Amazon, Chewy, Walmart, etc.) are enforced both on the coordinator and runner sides. New sources must not violate this policy.
5. **Serper API dependency** — URL discovery for official brands without distributor relationships depends on Serper. Cost and rate limits apply.
6. **LLM cost** — LLM extraction mode costs 8-15s per page plus API tokens. LLM-free extraction should be preferred where possible.
7. **`product_url_extraction/extractor.py` vs `src/crawl4ai_engine/`** — there are two extraction entry points (`ProductPageExtractor` and `Crawl4AIEngine`). The `ProductPageExtractor` wraps `Crawl4AIExtractor` which uses `Crawl4AIEngine`. Understanding this layering is important for any extraction changes.
