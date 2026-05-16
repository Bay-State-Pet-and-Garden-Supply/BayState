# Approved Source Extraction Testing Guide

This guide covers testing the approved-source extraction pipeline: distributor adapters, the executor orchestrator, and the runner integration.

## Test Lanes

| Lane | Type | Network | Credentials | Description |
|------|------|---------|-------------|-------------|
| A | Fixture regression | No | No | Deterministic HTML parsing from fixtures |
| B | No-auth live smoke | Yes | No | Bradley, Central Pet live SKU search |
| C | Auth live smoke | Yes | Yes | Orgill, Phillips, Pet Food Experts login+extract |
| D | Executor unit | No | No | Orchestration logic (mock network) |
| E | Full integration | Yes | Yes | App → Runner → Callback → DB |

## Quick Commands

### Lane A: Offline Fixture Tests (run always)

```bash
cd apps/scraper

uv run --with-requirements requirements.txt pytest \
  tests/unit/test_approved_sources_dataset.py \
  tests/unit/test_approved_sources_adapter_fixtures.py \
  tests/unit/test_approved_sources_executor.py \
  tests/unit/test_approved_sources_adapters.py \
  tests/unit/test_approved_sources_registry.py \
  tests/unit/test_approved_sources_policy.py \
  tests/unit/test_approved_sources_result_builder.py \
  tests/unit/test_approved_sources_auth.py \
  tests/unit/test_api_client_claim.py \
  tests/unit/test_distributor_adapter_smoke.py \
  -q
```

### Lane B: No-Auth Live Distributor Smoke

```bash
cd apps/scraper

uv run --with-requirements requirements.txt python scripts/run_distributor_adapter_smoke.py \
  --dataset benchmarks/approved_sources/fixtures/approved_source_dataset.json \
  --sources bradley,central_pet \
  --skip-auth-required \
  --output .tmp/distributor-smoke
```

Reports are written to `.tmp/distributor-smoke/results.json` and `.tmp/distributor-smoke/report.md`.

### Lane C: Auth-Gated Live Tests

Set credentials via environment variables (NEVER commit these):

```bash
cd apps/scraper

ORGILL_USERNAME=<user> ORGILL_PASSWORD=<pass> \
PHILLIPS_USERNAME=<user> PHILLIPS_PASSWORD=<pass> \
PET_FOOD_EXPERTS_USERNAME=<user> PET_FOOD_EXPERTS_PASSWORD=<pass> \
uv run --with-requirements requirements.txt pytest \
  tests/live/test_approved_sources_login_live.py \
  -m live -v
```

Or using the legacy alias for Pet Food Experts:

```bash
PETFOODEX_USERNAME=<user> PETFOODEX_PASSWORD=<pass> \
uv run --with-requirements requirements.txt pytest \
  tests/live/test_approved_sources_login_live.py \
  -m live -v
```

### Lane E: Full App-Driven Integration

```bash
# Terminal 1: Start web app
bun run web:dev

# Terminal 2: Start scraper daemon
cd apps/scraper && ./run-dev.sh --debug

# Terminal 3: Create enrichment job via admin UI or API
# Then verify:
# select sku, pipeline_status, confidence_score, sources->'enriched'
# from products_ingestion where sku in ('001135');
```

## Credential Environment Variables

| Distributor | Env Var Prefix | Login URL |
|------------|---------------|-----------|
| Orgill | `ORGILL_*` | https://www.orgill.com |
| Phillips | `PHILLIPS_*` | https://shop.phillipspet.com |
| Pet Food Experts | `PET_FOOD_EXPERTS_*` or `PETFOODEX_*` | https://orders.petfoodexperts.com |

Format: `<PREFIX>_USERNAME` and `<PREFIX>_PASSWORD`

**Security rules:**
- Credentials come from local env or coordinator credential API only
- Never commit real credentials to `.env`, `.env.example`, tests, or docs
- Tests use `_credentials_available()` to skip cleanly when creds are absent
- Login manager redacts usernames in logs; passwords are never logged

## Pass Gates

| Area | Metric | Gate |
|------|--------|------|
| Dataset validation | Rows valid | 100% |
| Fixture parse | Adapter pass rate | 95%+ |
| No-auth live | Bradley/Central success | 70-85% |
| Negative SKU | False success rate | 0% |
| Source policy | Blocked domains rejected | 100% |
| Executor | Distributor before fallback | 100% |
| Callback | Result persisted | 95%+ |
| Queue health | Stuck running attempts | 0 |

## Key Files

- `scrapers/approved_sources/` — Core extraction package
- `scrapers/approved_sources/adapters/` — Distributor-specific adapters
- `scrapers/approved_sources/executor.py` — Orchestration logic
- `benchmarks/approved_sources/fixtures/` — Test datasets and HTML fixtures
- `scripts/run_distributor_adapter_smoke.py` — Live smoke test runner
- `tests/unit/test_approved_sources_*.py` — Offline unit tests
- `tests/live/test_approved_sources_login_live.py` — Auth live tests
