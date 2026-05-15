# Approved Sources Benchmark

This directory contains the golden evaluation/training dataset for Approved Source Extraction v1.

## Dataset Structure

```
fixtures/
  approved_source_dataset.json         # Distributor extraction manifest (17 entries)
  distributor_extraction_fixtures.json # HTML fixture references for all 5 distributors
  serp_discovery_dataset.json          # SERP official URL discovery (55 entries)
  serp_search_fixtures.json            # Deterministic search result cache (28 entries)
  official_extraction_dataset.json     # Official brand extraction positives (7 entries)
  negative_source_dataset.json         # Disallowed source rejection cases (20 entries)
  html/
    bradley/                           # 3 HTML fixtures (product, partial, no-results)
    central_pet/                       # 3 HTML fixtures (2 products, no-results)
    orgill/                            # 5 HTML fixtures (login, failure, product, partial, no-results)
    phillips/                          # 5 HTML fixtures (login, failure, product, partial, no-results)
    pet_food_experts/                  # 5 HTML fixtures (login, failure, product, partial, no-results)
```

## Dataset Schema Versions

| File | Schema Version | Purpose |
|------|---------------|---------|
| `approved_source_dataset.json` | `approved-source-dataset-v1` | Distributor extraction ground truth |
| `serp_discovery_dataset.json` | `official-brand-benchmark-dataset-v1` | SERP URL discovery ground truth |
| `serp_search_fixtures.json` | `official-brand-search-fixtures-v1` | Deterministic search results |
| `official_extraction_dataset.json` | `official-brand-extraction-dataset-v1` | Official brand extraction truth |
| `negative_source_dataset.json` | `negative-source-dataset-v1` | Rejection/detection test cases |

## Dataset Rules

1. **No positive extraction entry** has `source_type: "retailer"` — all retailer/marketplace URLs are negative/rejection examples only.
2. **Every distributor entry** references legacy `test_skus` or `test_assertions` from `legacy-scraper-archive/configs/`.
3. **Auth-required distributors** have `expected_status: "auth_required"` — do not fake success.
4. **SERP discovery entries** include `source_legality.approved_positive_domains` and `source_legality.disallowed_negative_domains` for policy validation.
5. **Negative source entries** assert that extraction and image use are disallowed.
6. **Official extraction entries** must have `source_type: "official"` and fixture_refs pointing to curated HTML snapshots.
7. **No fabricated ground truth** — all ground_truth strings must be source-backed from fixture HTML.

## Login Automation

Auth-gated distributors (Orgill, Phillips, Pet Food Experts) use Crawl4AI-based login automation:

- **ApprovedSourceLoginManager** (`apps/scraper/scrapers/approved_sources/auth.py`):
  - Process-local session cache with TTL
  - Per-key async lock for concurrent login serialization
  - Crawl4AI `js_code`-based form filling
  - NEVER logs passwords or raw credential values

### Login Configs (from legacy YAML):

| Distributor | Login URL | Username Field | Password Field | Success Indicator |
|-------------|-----------|---------------|---------------|-------------------|
| **Orgill** | `https://www.orgill.com/index.aspx?tab=8` | `#cphMainContent_ctl00_loginOrgillxs_UserName` | `#cphMainContent_ctl00_loginOrgillxs_Password` | `#btnMyProfile` |
| **Phillips** | `https://shop.phillipspet.com/ccrz__CCSiteLogin` | `#emailField` | `#passwordField` | `a.doLogout.cc_do_logout` |
| **Pet Food Experts** | `https://orders.petfoodexperts.com/SignIn` | `#userName` | `#password` | `[data-test-selector=header_userName]` |

### Credential Resolution

Credentials are resolved in order:
1. `api_client.get_credentials(ref)` — API/supabase path
2. `{SLUG_UPPER}_USERNAME` / `{SLUG_UPPER}_PASSWORD` — environment variables

For local development, set:
```bash
export ORGILL_USERNAME="your_user"
export ORGILL_PASSWORD="your_pass"
export PHILLIPS_USERNAME="your_user"
export PHILLIPS_PASSWORD="your_pass"
export PETFOODEX_USERNAME="your_user"
export PETFOODEX_PASSWORD="your_pass"
```

### Session Cache

- Default TTL: 15 minutes (configurable via `ApprovedSourceLoginManager(session_ttl_seconds=N)`)
- Cache key: SHA256(source_slug + credential_ref)
- Session ID: stable per (slug, ref) pair for browser session reuse
- Concurrent login for same (slug, ref) serialized via per-key async lock

## Login Failure Modes

| Code | Meaning | Action |
|------|---------|--------|
| `AUTH_REQUIRED` | No credentials available | Skip to next source |
| `AUTH_FAILED` | Credentials exist but login failed | Skip to next source |
| `AUTH_EXPIRED` | Session expired, re-login failed | Skip to next source |
| `EXTRACTION_FAILED` | Authenticated crawl failure | Skip to next source |

The executor treats all auth failures as per-source failures and continues
to the next source (next distributor or official SERP fallback).

## HTML Fixture Files

Deterministic HTML fixture files are stored in `fixtures/html/{distributor}/`.
These are used by adapter fixture tests to verify extraction without network access.

### Distributor Fixture Counts

| Distributor | Product | Partial | No Results | Login | Login Fail | Total |
|-------------|---------|---------|------------|-------|------------|-------|
| **Bradley** | 1 | 1 | 1 | — | — | 3 |
| **Central Pet** | 2 | — | 1 | — | — | 3 |
| **Orgill** | 1 | 1 | 1 | 1 | 1 | 5 |
| **Phillips** | 1 | 1 | 1 | 1 | 1 | 5 |
| **Pet Food Experts** | 1 | 1 | 1 | 1 | 1 | 5 |

### Legacy Assertions Verified by Fixtures

| Distributor | SKU | Expected Name | Expected Brand |
|-------------|-----|---------------|----------------|
| **Bradley** | 001135 | E-Z HANG SCALE | KERBL |
| **Central Pet** | 38777520 | KONG Air Dog Squeaker Tennis Ball Dog Toy | KONG |
| **Central Pet** | 43580233 | IAMS Perfect Portions Grain Free... | IAMS |
| **Phillips** | 072705115310 | Fromm Gold Large Breed Dog 30 lb | FROMM FAMILY FOODS LLC |
| **Pet Food Experts** | 33011808 | Wellness CORE Grain Free ... | Wellness |

## Official Extraction Curation

Official extraction fixtures need to be curated from live source pages. The
`fixture_refs` in `official_extraction_dataset.json` point to expected paths
under `fixtures/official/{domain}/{sku}/`.

### Curation Utility

An opt-in curation utility is planned at:
`apps/scraper/benchmarks/approved_sources/curate_official_extraction.py`

Expected usage:
```bash
# Dry-run (show what would be curated)
python3 benchmarks/approved_sources/curate_official_extraction.py --dry-run

# Live curation (requires network)
python3 benchmarks/approved_sources/curate_official_extraction.py \
  --live --accept-network \
  --dataset benchmarks/approved_sources/fixtures/official_extraction_dataset.json \
  --output benchmarks/approved_sources/fixtures/official_extraction_candidates.json
```

The utility:
1. Reads official extraction dataset entries with `expected_behavior.should_auto_select=true`
2. Crawls only approved official URLs via Crawl4AI
3. Writes HTML/markdown/json-ld snapshots to `fixtures/official/{domain_slug}/{sku}/`
4. Emits draft `official_extraction_candidates.json` for human review
5. Refuses disallowed retailer domains; defaults to dry-run

## LEGAL: Allowed vs Disallowed Sources

### Approved Positive Sources
- Official brand/manufacturer websites (e.g., `frommfamily.com`)
- Approved distributor portals (e.g., `shop.phillipspet.com`, `orders.petfoodexperts.com`)
- Bay State-owned/internal sources

### Disallowed Sources (Negative/Rejection Only)
- `amazon.com`, `chewy.com`, `walmart.com`, `petco.com`, `petsmart.com`
- `ebay.com`, `etsy.com`, `target.com`, `instacart.com`
- Blogs, review sites, random retailer Shopify sites
- Google Images, unknown CDN images
- Any unapproved source

**Important**: Product images/data may ONLY come from approved positive sources.
Disallowed retailer URLs may appear as negative/rejection examples but must
never be used as positive extraction ground truth.

## Run Commands

### Dataset Validation
```bash
# From apps/scraper
python -m pytest tests/unit/test_approved_sources_dataset.py -v
```

### Distributor Adapter Tests (URL/selector/build)
```bash
# From apps/scraper
python -m pytest tests/unit/test_approved_sources_adapters.py -v
```

### Fixture Replay Tests (deterministic, no network)
```bash
# From apps/scraper
python -m pytest tests/unit/test_approved_sources_adapter_fixtures.py -v
```

### Login Automation Tests
```bash
# From apps/scraper
python -m pytest tests/unit/test_approved_sources_auth.py -v
```

### Official Extraction Dataset Fixture Tests
```bash
# From apps/scraper
python -m pytest tests/unit/test_official_extraction_fixtures.py -v
```

### Full Approved Sources Test Suite
```bash
# From apps/scraper
python -m pytest tests/unit/test_approved_sources_*.py tests/unit/test_official_extraction_fixtures.py -v
```

### Live Login Smoke Tests (opt-in, requires credentials)
```bash
# From apps/scraper
python -m pytest -m live tests/live/test_approved_sources_login_live.py -v
```

### Run Without Live Tests (CI default)
```bash
# From apps/scraper
python -m pytest -m "not live" tests/unit/ -v
```

## Known Gaps

1. **Official extraction positives**: Only 7 entries (target 30). Each requires a curated
   HTML snapshot from the live official product page. Use the curation utility with
   `--live --accept-network` to generate snapshots, then review and approve candidates.

2. **Official fixture files**: The 21 fixture files for official extraction entries
   (7 entries × 3 file types) do not exist yet. They must be curated from live
   official sources.

3. **Live login automation**: Login automation uses js_code form filling via Crawl4AI.
   Some portals may require MFA, CAPTCHA, IP allowlisting, or account-specific
   storefront configuration. These cases return clean AUTH_FAILED/AUTH_EXPIRED
   instead of blocking the extraction pipeline.

4. **Auth session profiles**: Persistent browser context via
   `BrowserConfig.use_persistent_context` and `user_data_dir` is available when
   `APPROVED_SOURCE_PROFILE_DIR` environment variable is set. Without it, sessions
   default to in-memory/session-id reuse which may not persist cookies across
   separate Crawl4AI engine instances.

5. **Distributor test coverage**: No-results and partial-product HTML fixtures exist
   for all 5 distributors. Full coverage of all legacy test_skus would require
   additional fixture files.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ORGILL_USERNAME` / `ORGILL_PASSWORD` | Orgill portal credentials |
| `PHILLIPS_USERNAME` / `PHILLIPS_PASSWORD` | Phillips Pet credentials |
| `PETFOODEX_USERNAME` / `PETFOODEX_PASSWORD` | Pet Food Experts credentials |
| `APPROVED_SOURCE_PROFILE_DIR` | Directory for persistent browser profiles |
| `AI_SEARCH_SERPER_MAX_RESULTS` | Max results for Serper search API |
