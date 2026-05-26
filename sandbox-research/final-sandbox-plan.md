# Implementation Plan

## Goal
Create a fully isolated local product-page discovery/extraction sandbox under `sandbox/product-page-extraction/` that evaluates Crawl4AI, LM Studio, and agent-browser workflows without integrating with `apps/web`, the scraper daemon, Supabase, coordinator APIs, or production scraper configs.

## Tasks

1. **Create the isolated sandbox directory skeleton**
   - File: `sandbox/product-page-extraction/`
   - Changes: Add this new root-level sandbox tree only; do not add imports, routes, scripts, package entries, or Turbo tasks in production app/workspace files.
   - Acceptance: `git diff --name-only` should show only `sandbox/product-page-extraction/**` plus this plan artifact under `sandbox-research/`.

2. **Add sandbox documentation and safety boundaries**
   - File: `sandbox/product-page-extraction/README.md`
   - Changes: Document purpose, non-goals, setup, required commands, artifact locations, live-network caveats, and explicit prohibited integrations:
     - no `apps/web` changes
     - no scraper daemon changes
     - no Supabase access
     - no coordinator callbacks
     - no production YAML publication
     - no real `SCRAPER_API_URL` / `SCRAPER_API_KEY` usage
   - Acceptance: A new contributor can run a fixture from README commands without needing the web app or scraper daemon.

3. **Add local ignore rules for generated evidence**
   - File: `sandbox/product-page-extraction/.gitignore`
   - Changes: Ignore `.env`, `.venv/`, `outputs/`, `agent-browser-runs/`, `*.log`, browser profiles, screenshots, and temporary run files.
   - Acceptance: After running a live fixture, `git status --short` does not include generated artifacts.

4. **Add Python/runtime setup files**
   - Files:
     - `sandbox/product-page-extraction/.python-version`
     - `sandbox/product-page-extraction/requirements.txt`
     - `sandbox/product-page-extraction/.env.example`
   - Changes:
     - Pin Python to `3.12` in `.python-version` for broader dependency compatibility.
     - In `requirements.txt`, either reference the scraper dev dependencies or list only sandbox dependencies. Recommended initial content:
       ```txt
       -r ../../apps/scraper/requirements.txt
       ```
     - Add `.env.example` with sandbox-only variables listed in the Environment Variables section below.
   - Acceptance: From repo root, `uv venv sandbox/product-page-extraction/.venv --python 3.12` and `uv pip install -r sandbox/product-page-extraction/requirements.txt` complete, or documented fallback uses `uv run --with-requirements apps/scraper/requirements.txt ...`.

5. **Add sample site and extraction configs**
   - Files:
     - `sandbox/product-page-extraction/configs/site.sample.yaml`
     - `sandbox/product-page-extraction/configs/extraction.sample.yaml`
     - `sandbox/product-page-extraction/configs/lmstudio.sample.yaml`
   - Changes: Define sitemap discovery, candidate scoring, Crawl4AI run settings, confidence thresholds, and LM Studio fallback policy in config files rather than hardcoding vendor rules.
   - Acceptance: Scripts can run against the sample config with `--dry-run` and print the resolved settings without network calls.

6. **Add product fixture format**
   - Files:
     - `sandbox/product-page-extraction/fixtures/products.sample.jsonl`
     - `sandbox/product-page-extraction/fixtures/README.md`
   - Changes: Use JSONL for batch-friendly fixtures. Each line should contain one product scenario with input metadata, optional known URL, expected fields, and thresholds. Format is defined below.
   - Acceptance: `scripts/run_fixture.py --fixture fixtures/products.sample.jsonl --dry-run` validates every fixture line and reports no schema errors.

7. **Add JSON schemas for outputs and LLM extraction**
   - Files:
     - `sandbox/product-page-extraction/schemas/product_packet.schema.json`
     - `sandbox/product-page-extraction/schemas/product_llm.schema.json`
     - `sandbox/product-page-extraction/schemas/agent_browser_result.schema.json`
     - `sandbox/product-page-extraction/schemas/comparison.schema.json`
   - Changes: Define stable, local-only output contracts for evidence packets, LM Studio structured output, agent-browser captures, and comparisons.
   - Acceptance: `scripts/validate_packet.py` can validate generated packet JSON files against these schemas.

8. **Create common utility module**
   - File: `sandbox/product-page-extraction/scripts/common.py`
   - Changes: Implement shared helpers only:
     - load YAML/JSON/JSONL config
     - normalize URLs/domains
     - create deterministic run IDs
     - create output directories
     - write JSON/markdown artifacts
     - parse JSON-LD blocks
     - calculate confidence scores
     - validate env vars
     - ping LM Studio `/v1/models` before LLM use
     - configure structured logging
   - Acceptance: `python -m compileall sandbox/product-page-extraction/scripts` passes and `common.py` has no imports from `apps/web`, `apps/scraper/core/api_client.py`, or scraper runner entrypoints.

9. **Create environment validator**
   - File: `sandbox/product-page-extraction/scripts/validate_env.py`
   - Changes: Check Python version, Crawl4AI import, Playwright browser availability, optional OpenAI SDK import, optional LM Studio availability, optional `agent-browser` CLI availability, output directory writability, and absence of production coordinator credentials.
   - Acceptance: `python scripts/validate_env.py` exits 0 for local non-LLM setup and reports skipped optional checks clearly.

10. **Create sitemap discovery script**
    - File: `sandbox/product-page-extraction/scripts/discover_from_sitemap.py`
    - Changes: Implement async sitemap discovery with:
      - explicit `sitemap_urls`
      - optional `robots.txt` sitemap discovery
      - recursive sitemap index traversal
      - max sitemap and URL limits
      - include/exclude regex filters
      - candidate scoring by product URL markers, brand/name token overlap, UPC/SKU presence, and category/blog/search penalties
      - optional Crawl4AI verification of top candidates
      - output: `outputs/<run_id>/candidates.json`
    - Acceptance: Dry-run mode validates filters; live mode emits candidate JSON with scores and reasons.

11. **Create Crawl4AI product extraction script**
    - File: `sandbox/product-page-extraction/scripts/extract_product_page.py`
    - Changes: Crawl a known product URL and extract facts in deterministic order:
      1. JSON-LD `Product`
      2. OpenGraph/meta tags
      3. CSS extraction schema via Crawl4AI `JsonCssExtractionStrategy`
      4. optional LM Studio fallback when enabled and confidence is low
      Save markdown, optional screenshot, extracted JSON-LD snippets, metadata, final URL, and `packet.json`.
    - Acceptance: Running with a known URL writes `outputs/<run_id>/packet.json` and `packet.md` with `llm_used=false` unless explicitly enabled.

12. **Create LM Studio structured extraction helper**
    - File: `sandbox/product-page-extraction/scripts/lmstudio_extract.py`
    - Changes: Use the OpenAI-compatible SDK path only:
      - default base URL: `http://localhost:1234/v1`
      - dummy API key: `lm-studio`
      - JSON schema response format from `schemas/product_llm.schema.json`
      - temperature `0`
      - strict instruction to return `null` for absent facts and not invent UPCs, ingredients, weights, prices, or images
    - Acceptance: `C4AI_LLM_MODE=auto` uses this helper only when deterministic confidence is below threshold and records `llm_skipped_reason` if LM Studio is unavailable.

13. **Create orchestration wrapper for one product packet**
    - File: `sandbox/product-page-extraction/scripts/run_packet.py`
    - Changes: Orchestrate discovery and extraction:
      - load site config + extraction config
      - accept CLI input `--upc`, `--sku`, `--brand`, `--name`, optional `--url`
      - if `--url` is present, skip discovery
      - otherwise discover candidates, select top N, extract until accept threshold is met
      - produce final `packet.json`, `packet.md`, and run summary
    - Acceptance: `run_packet.py --url <known-url> ...` works without sitemap discovery; `run_packet.py --site-config ...` works with live sitemap discovery.

14. **Create fixture batch runner**
    - File: `sandbox/product-page-extraction/scripts/run_fixture.py`
    - Changes: Read `fixtures/*.jsonl`, run each fixture through `run_packet.py` logic, write `outputs/<batch_run_id>/summary.json`, and support `--dry-run`, `--limit`, `--fixture-id`, `--no-llm`, and `--agent-browser-fallback`.
    - Acceptance: Dry-run validates fixture schema; live run produces per-fixture packet directories and a summary with pass/review/fail recommendations.

15. **Create agent-browser fallback capture script**
    - File: `sandbox/product-page-extraction/scripts/agent_browser_capture.sh`
    - Changes: Use installed `agent-browser` CLI for rendered evidence only when requested:
      - create isolated session and profile under `agent-browser-runs/<run_id>/`
      - set viewport `1365x900`
      - open URL
      - wait for page load
      - capture snapshot JSON, interactive snapshot JSON, viewport screenshot, full-page screenshot, and DOM extraction JSON
      - close session best-effort
    - Acceptance: Running the script writes artifacts under sandbox-only `agent-browser-runs/<run_id>/` and never writes browser profiles into `apps/`.

16. **Create result comparison script**
    - File: `sandbox/product-page-extraction/scripts/compare_results.py`
    - Changes: Compare normalized Crawl4AI packet fields with optional agent-browser output:
      - product name token similarity
      - brand exact normalized match
      - description token similarity
      - size/weight normalized match
      - image URL overlap
      - category overlap
      - weighted score and recommendation: `accept`, `review`, or `conflict`
    - Acceptance: Given one `packet.json` and one `agent-browser` result JSON, writes `comparison.json` matching `schemas/comparison.schema.json`.

17. **Create packet validator**
    - File: `sandbox/product-page-extraction/scripts/validate_packet.py`
    - Changes: Validate `packet.json`, `agent_browser_result.json`, and `comparison.json` against JSON schemas; report missing required fields and confidence warnings.
    - Acceptance: Validation exits non-zero for malformed packets and prints actionable field paths.

18. **Add example output docs without generated artifacts**
    - Files:
      - `sandbox/product-page-extraction/docs/evidence-packet.md`
      - `sandbox/product-page-extraction/docs/experiment-log.md`
      - `sandbox/product-page-extraction/docs/subagent-workflow.md`
    - Changes: Document packet shape, how to record experiments using hypothesis → changes → results → conclusion, and how to divide future research/validation work safely.
    - Acceptance: Docs contain no real credentials and no large live scrape artifacts.

19. **Run local validation commands**
    - File: N/A
    - Changes: Execute the validation commands listed below after implementation.
    - Acceptance: Commands pass or failures are documented in `sandbox/product-page-extraction/docs/experiment-log.md` with exact remediation.

## Concrete File Tree

```text
sandbox/product-page-extraction/
  README.md
  .gitignore
  .python-version
  requirements.txt
  .env.example
  configs/
    site.sample.yaml
    extraction.sample.yaml
    lmstudio.sample.yaml
  fixtures/
    README.md
    products.sample.jsonl
  schemas/
    product_packet.schema.json
    product_llm.schema.json
    agent_browser_result.schema.json
    comparison.schema.json
  scripts/
    common.py
    validate_env.py
    discover_from_sitemap.py
    extract_product_page.py
    lmstudio_extract.py
    run_packet.py
    run_fixture.py
    agent_browser_capture.sh
    compare_results.py
    validate_packet.py
  docs/
    evidence-packet.md
    experiment-log.md
    subagent-workflow.md
  outputs/                 # gitignored generated packets
    .gitkeep               # optional only if desired
  agent-browser-runs/      # gitignored browser profiles/screenshots/snapshots
```

## Environment Variables

Create `sandbox/product-page-extraction/.env.example` with:

```bash
# General sandbox behavior
SANDBOX_OUTPUT_DIR=./outputs
SANDBOX_LOG_LEVEL=INFO
SANDBOX_NETWORK_MODE=live          # dry-run | live
SANDBOX_MAX_CONCURRENCY=3
SANDBOX_PAGE_TIMEOUT_MS=45000
SANDBOX_SCREENSHOTS=false

# Crawl4AI / browser behavior
HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=          # optional; leave empty to use default cache
C4AI_CACHE_MODE=enabled            # enabled | bypass
C4AI_VERIFY_TOP_N=10

# LM Studio local-only fallback
C4AI_LLM_MODE=off                  # off | auto | required
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=                    # set from LM Studio /v1/models or lms ls
LMSTUDIO_API_KEY=lm-studio
LMSTUDIO_TIMEOUT_SECONDS=60

# agent-browser rendered evidence fallback
AGENT_BROWSER_ENABLED=false
AGENT_BROWSER_BIN=agent-browser
AGENT_BROWSER_PROFILE_ROOT=./agent-browser-runs/profiles
AGENT_BROWSER_VIEWPORT_WIDTH=1365
AGENT_BROWSER_VIEWPORT_HEIGHT=900

# Safety: these must be unset or ignored by sandbox scripts
SCRAPER_API_URL=
SCRAPER_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Rules:
- `C4AI_LLM_MODE=off` is the default.
- LM Studio is local-only and must use the OpenAI-compatible `/v1` API.
- If `C4AI_LLM_MODE=auto` and LM Studio is unavailable, scripts should continue deterministically and record `llm_skipped_reason`.
- If `C4AI_LLM_MODE=required` and LM Studio is unavailable, scripts should fail fast before crawling.
- Sandbox scripts must not require or use production `SCRAPER_API_*` or Supabase variables.

## Test Fixture Format

Use JSONL at `sandbox/product-page-extraction/fixtures/products.sample.jsonl`, one product per line:

```json
{"fixture_id":"fromm-demo-known-url","site_key":"fromm-example","mode":"known_url","url":"https://example.com/products/fromm-demo","upc":"072705113446","sku":"072705113446","brand":"Fromm","name":"Fromm Four-Star Nutritionals Demo","expected":{"brand":"Fromm","name_contains":["Fromm"],"upc":"072705113446","required_fields":["name","brand","description","images"]},"thresholds":{"accept_confidence":0.75,"manual_review_below":0.60},"options":{"allow_llm":false,"allow_agent_browser":false,"screenshot":false}}
{"fixture_id":"fromm-demo-sitemap","site_key":"fromm-example","mode":"discover","url":null,"upc":"072705113446","sku":"072705113446","brand":"Fromm","name":"Fromm Four-Star Nutritionals Demo","expected":{"brand":"Fromm","name_token_overlap_min":0.5,"required_fields":["name","brand","description"]},"thresholds":{"accept_confidence":0.75,"manual_review_below":0.60},"options":{"allow_llm":"auto","allow_agent_browser":true,"screenshot":true}}
```

Field meanings:
- `fixture_id`: stable unique ID for output paths and summaries.
- `site_key`: references `configs/site.sample.yaml` site entry.
- `mode`: `known_url` or `discover`.
- `url`: required for `known_url`; optional/null for sitemap discovery.
- `upc` / `sku`: product identifiers; scripts should not invent these if absent on page.
- `brand` / `name`: expected input hints for candidate scoring and validation.
- `expected`: assertions for validation, not forced extraction values.
- `thresholds`: per-fixture confidence overrides.
- `options`: controls LLM, agent-browser, and screenshots per fixture.

## Evidence Packet Output Shape

`outputs/<run_id>/packet.json` should include:

```json
{
  "schema_version": "product_extraction_packet.v1",
  "run_id": "20260524T213000Z-fromm-demo-known-url",
  "created_at": "2026-05-24T21:30:00Z",
  "sandbox_version": "product-page-extraction-sandbox-v0",
  "input": {
    "fixture_id": "fromm-demo-known-url",
    "upc": "072705113446",
    "sku": "072705113446",
    "brand": "Fromm",
    "name": "Fromm Four-Star Nutritionals Demo",
    "site_key": "fromm-example"
  },
  "discovery": {
    "used": false,
    "sitemap_urls": [],
    "candidate_count": 0,
    "selected_url": "https://example.com/products/fromm-demo",
    "candidates": []
  },
  "crawl": {
    "success": true,
    "requested_url": "https://example.com/products/fromm-demo",
    "final_url": "https://example.com/products/fromm-demo",
    "title": "Example product title",
    "markdown_path": "outputs/run-id/page.md",
    "screenshot_path": null,
    "html_length": 245000,
    "markdown_length": 18000,
    "jsonld_count": 2
  },
  "extraction": {
    "method": "jsonld+meta+css",
    "llm_used": false,
    "llm_model": null,
    "confidence": 0.86,
    "fields": {
      "name": "Product name",
      "brand": "Brand",
      "description": "Description",
      "upc": "072705113446",
      "sku": null,
      "images": ["https://example.com/image.jpg"],
      "price": null,
      "category": "Dog Food",
      "ingredients": null,
      "guaranteed_analysis": null,
      "weight": "4 lb"
    },
    "field_evidence": {
      "name": {
        "value": "Product name",
        "source": "jsonld",
        "path": "$.name",
        "confidence": 0.95,
        "snippet": "\"name\": \"Product name\""
      }
    }
  },
  "validation": {
    "brand_match": true,
    "upc_match": true,
    "name_token_overlap": 0.72,
    "required_fields_present": true,
    "recommendation": "accept",
    "warnings": []
  },
  "artifacts": {
    "packet_markdown": "outputs/run-id/packet.md",
    "raw_jsonld": "outputs/run-id/jsonld.json",
    "crawl_markdown": "outputs/run-id/page.md",
    "screenshot": null,
    "agent_browser": null,
    "comparison": null
  },
  "errors": []
}
```

## Validation Commands

Run from repo root unless noted.

### Setup

```bash
uv venv sandbox/product-page-extraction/.venv --python 3.12
source sandbox/product-page-extraction/.venv/bin/activate
uv pip install -r sandbox/product-page-extraction/requirements.txt
python -m playwright install chromium
cp sandbox/product-page-extraction/.env.example sandbox/product-page-extraction/.env
```

Alternative without persistent sandbox venv:

```bash
uv run --with-requirements apps/scraper/requirements.txt \
  python sandbox/product-page-extraction/scripts/validate_env.py
```

### Static validation

```bash
python -m compileall sandbox/product-page-extraction/scripts
ruff check sandbox/product-page-extraction/scripts
python sandbox/product-page-extraction/scripts/validate_env.py
python sandbox/product-page-extraction/scripts/run_fixture.py \
  --fixture sandbox/product-page-extraction/fixtures/products.sample.jsonl \
  --dry-run
```

### LM Studio optional validation

```bash
export C4AI_LLM_MODE=auto
export LMSTUDIO_BASE_URL=http://localhost:1234/v1
export LMSTUDIO_API_KEY=lm-studio
export LMSTUDIO_MODEL="<model-name-from-lm-studio>"
python sandbox/product-page-extraction/scripts/validate_env.py --check-lmstudio
```

### Known URL live validation

```bash
python sandbox/product-page-extraction/scripts/extract_product_page.py \
  --url "https://example.com/products/example-product" \
  --upc "072705113446" \
  --brand "Fromm" \
  --name "Known product name" \
  --output-dir sandbox/product-page-extraction/outputs
```

### Sitemap discovery live validation

```bash
python sandbox/product-page-extraction/scripts/discover_from_sitemap.py \
  --site-config sandbox/product-page-extraction/configs/site.sample.yaml \
  --upc "072705113446" \
  --brand "Fromm" \
  --name "Known product name" \
  --output-dir sandbox/product-page-extraction/outputs
```

### Full packet validation

```bash
python sandbox/product-page-extraction/scripts/run_packet.py \
  --site-config sandbox/product-page-extraction/configs/site.sample.yaml \
  --extraction-config sandbox/product-page-extraction/configs/extraction.sample.yaml \
  --upc "072705113446" \
  --brand "Fromm" \
  --name "Known product name" \
  --llm off

python sandbox/product-page-extraction/scripts/validate_packet.py \
  sandbox/product-page-extraction/outputs/<run_id>/packet.json
```

### agent-browser optional validation

```bash
agent-browser --help
bash sandbox/product-page-extraction/scripts/agent_browser_capture.sh \
  "https://example.com/products/example-product" \
  "072705113446" \
  "sandbox/product-page-extraction/agent-browser-runs"

python sandbox/product-page-extraction/scripts/compare_results.py \
  --packet sandbox/product-page-extraction/outputs/<run_id>/packet.json \
  --agent-browser sandbox/product-page-extraction/agent-browser-runs/<run_id>/dom-extract.json
```

### Isolation validation

```bash
# Should print no files outside sandbox/product-page-extraction and sandbox-research/final-sandbox-plan.md
python - <<'PY'
import subprocess
allowed = ("sandbox/product-page-extraction/", "sandbox-research/final-sandbox-plan.md")
files = subprocess.check_output(["git", "diff", "--name-only"], text=True).splitlines()
violations = [f for f in files if not f.startswith(allowed)]
print("violations:", violations)
raise SystemExit(1 if violations else 0)
PY
```

## Files to Modify

- None in production code.
- Do not modify:
  - `apps/web/**`
  - `apps/scraper/daemon.py`
  - `apps/scraper/runner/**`
  - `apps/scraper/scrapers/configs/**`
  - `packages/**`
  - root `package.json`
  - `turbo.json`
  - Supabase migrations

## New Files

- `sandbox/product-page-extraction/README.md` - setup, safety boundaries, and usage guide.
- `sandbox/product-page-extraction/.gitignore` - ignore generated local artifacts.
- `sandbox/product-page-extraction/.python-version` - Python version pin.
- `sandbox/product-page-extraction/requirements.txt` - sandbox dependency entrypoint.
- `sandbox/product-page-extraction/.env.example` - safe local environment template.
- `sandbox/product-page-extraction/configs/site.sample.yaml` - sitemap/candidate discovery config.
- `sandbox/product-page-extraction/configs/extraction.sample.yaml` - Crawl4AI extraction/confidence config.
- `sandbox/product-page-extraction/configs/lmstudio.sample.yaml` - optional local LLM defaults.
- `sandbox/product-page-extraction/fixtures/README.md` - fixture schema documentation.
- `sandbox/product-page-extraction/fixtures/products.sample.jsonl` - example product fixtures.
- `sandbox/product-page-extraction/schemas/product_packet.schema.json` - evidence packet schema.
- `sandbox/product-page-extraction/schemas/product_llm.schema.json` - LM Studio structured output schema.
- `sandbox/product-page-extraction/schemas/agent_browser_result.schema.json` - agent-browser output schema.
- `sandbox/product-page-extraction/schemas/comparison.schema.json` - comparison output schema.
- `sandbox/product-page-extraction/scripts/common.py` - shared utilities.
- `sandbox/product-page-extraction/scripts/validate_env.py` - local runtime validator.
- `sandbox/product-page-extraction/scripts/discover_from_sitemap.py` - sitemap candidate discovery.
- `sandbox/product-page-extraction/scripts/extract_product_page.py` - deterministic product extraction.
- `sandbox/product-page-extraction/scripts/lmstudio_extract.py` - local structured LLM fallback.
- `sandbox/product-page-extraction/scripts/run_packet.py` - one-product orchestration.
- `sandbox/product-page-extraction/scripts/run_fixture.py` - JSONL fixture batch runner.
- `sandbox/product-page-extraction/scripts/agent_browser_capture.sh` - rendered evidence fallback.
- `sandbox/product-page-extraction/scripts/compare_results.py` - Crawl4AI vs agent-browser comparison.
- `sandbox/product-page-extraction/scripts/validate_packet.py` - JSON schema validator.
- `sandbox/product-page-extraction/docs/evidence-packet.md` - packet contract documentation.
- `sandbox/product-page-extraction/docs/experiment-log.md` - experiment log template.
- `sandbox/product-page-extraction/docs/subagent-workflow.md` - safe future workflow recommendations.

## Dependencies

- Task 1 must happen before all file creation.
- Tasks 2-7 define contracts/configs needed by scripts in Tasks 8-17.
- Task 8 (`common.py`) should be implemented before scripts that share config, run ID, output, JSON-LD, confidence, and logging behavior.
- Task 9 (`validate_env.py`) should be implemented before live crawler/LLM/browser tests.
- Task 10 (`discover_from_sitemap.py`) and Task 11 (`extract_product_page.py`) can be implemented in parallel after `common.py`.
- Task 12 (`lmstudio_extract.py`) depends on `product_llm.schema.json` and `common.py` LM Studio ping helper.
- Task 13 (`run_packet.py`) depends on discovery and extraction scripts.
- Task 14 (`run_fixture.py`) depends on `run_packet.py` and fixture schema.
- Task 15 (`agent_browser_capture.sh`) can be implemented independently after output directory conventions are defined.
- Task 16 (`compare_results.py`) depends on packet schema and agent-browser result schema.
- Task 17 (`validate_packet.py`) depends on all JSON schemas.
- Task 19 depends on implementation of scripts and docs.

## Subagent Workflow Recommendations

Use these only as future orchestrated worker roles; keep all work confined to `sandbox/product-page-extraction/**`.

1. **Sandbox implementer**
   - Owns directory skeleton, configs, schemas, common utilities, and CLI scripts.
   - Must not touch production app or scraper daemon files.

2. **Crawl4AI validator**
   - Runs known-URL and sitemap fixtures.
   - Records packet quality, field evidence, confidence scoring issues, and Crawl4AI failures in `docs/experiment-log.md`.

3. **LM Studio validator**
   - Tests local-only structured output through `http://localhost:1234/v1`.
   - Confirms unavailable LM Studio is handled as skip/fail according to `C4AI_LLM_MODE`.
   - Verifies the model does not invent missing product facts.

4. **agent-browser validator**
   - Tests rendered evidence capture on JS-heavy/auth/session-sensitive pages.
   - Confirms all browser profiles, snapshots, and screenshots stay under `agent-browser-runs/` and are gitignored.

5. **Fixture curator**
   - Adds JSONL fixture cases with known URL, sitemap discovery, missing-field, JS-heavy, and conflict scenarios.
   - Avoids real credentials and avoids committing generated output.

6. **Isolation reviewer**
   - Reviews `git diff --name-only` for boundary violations.
   - Confirms no imports from coordinator/API client/Supabase paths and no root workspace wiring.

## Risks

- **Python version drift**: Existing scraper venv uses Python 3.14, while project metadata targets 3.10-3.12. Pin the sandbox to 3.12 if possible; document if local tooling forces 3.14.
- **Crawl4AI/Playwright setup cost**: Browser binaries may be missing. `validate_env.py` should provide the exact `python -m playwright install chromium` remediation.
- **Network/live-site variability**: Sitemaps and product pages can change. Fixtures should separate `dry-run`, `known_url`, and `discover` modes and mark live tests explicitly.
- **LM Studio model differences**: Structured output support can vary by model. Always validate `/v1/models`, record model name, and treat LLM as fallback only.
- **LLM hallucination**: The LLM helper must return null for absent facts and packet validation must flag invented UPC/SKU/price/ingredients when not evidenced.
- **agent-browser CLI version differences**: Installed version may not support newer `skills` commands. Scripts should rely on verified basic commands: `open`, `wait`, `snapshot`, `screenshot`, `eval`, `close`.
- **Accidental production integration**: Avoid root scripts, package workspace changes, app imports, scraper daemon imports, Supabase env vars, and coordinator callbacks.
- **Large generated artifacts**: Screenshots, snapshots, markdown, and HTML evidence can be large. Keep them under gitignored output directories and only commit schemas/docs/sample fixtures.
- **Auth-gated distributor pages**: Persistent browser profiles may be needed for local investigation, but credentials/cookies must remain outside gitignored sandbox profile directories.
- **Selector hardcoding**: Keep site-specific selectors and URL filters in sandbox config files, not Python code, to preserve portability and avoid creating production-style vendor logic.
