# Phase 10 Cleanup — Scraper Legacy Code Migration

## What was done

Moved all legacy scraper code from active import paths into `apps/scraper/legacy/`.

## Moved to legacy/

### YAML Configs (15 files)
`amazon.yaml`, `bentleyseeds.yaml`, `bradley.yaml`, `central-pet.yaml`, `coastal.yaml`, `countrymax.yaml`, `fromm_test.yaml`, `gardeners.yaml`, `k9granolafactory.yaml`, `mazuri.yaml`, `orgill.yaml`, `petedge.yaml`, `petfoodex.yaml`, `petswarehouse.yaml`, `phillips.yaml`

### Action Handlers (24 handlers)
All Playwright-based action handlers: browse, click, combine, conditional, extract, extract_transform, image, input, json, login, navigate, ocr, script, set_proxy, sponsored, table, transform, validation, verify, wait, wait_for, wait_for_hidden, weight, anti_detection

### Action Core
`base.py`, `registry.py`, `__init__.py`

### Executor
`workflow_executor.py`, `step_executor.py`, `selector_resolver.py`, `browser_manager.py`, `debug_capture.py`, `normalization.py`, `AGENTS.md`, `__init__.py`

### Parser
`yaml_parser.py`, `config_parser.py`, `__init__.py`

### Legacy Modules
- `result_collector.py`, `sku_loader.py`, `pricing_loader.py`, `config_validation.py`, `selector_storage.py`
- `runtime.py`, `context.py`, `__main__.py`
- `result.py`, `assertions.py`, `scraper_config_schema.py`
- `api_server.py`
- `anti_detection_manager.py`

### Utilities
`utils/debugging/` (config_validator, step_debugger, selector_tester, cli)

### CLI Commands
`cli/commands/` (audit, batch, cohort, common, ai_search_benchmark, official_brand_benchmark)

### Agent Skills
`scraper-config-builder/`

## Active code changes

### `runner/__init__.py`
- Commented out imports of `WorkflowExecutor`, `ScraperConfigParser`, `ResultCollector`
- Added early return guard in `_run_sequential_job()` to return deactivated message

### `runner/cli.py`
- Commented out module-level import of `config_validator`
- Deactivated `run_local_mode()` and `run_test_mode()` with error messages
- Added lazy import guard placeholder
- Updated `main()` to reject `--local` and `--test-mode` flags
- Enrichment mode (`--mode enrichment`) still works

### `core/api_client.py`
- Commented out import of `ScraperConfigParser`
- Deactivated YAML config loading paths in `fetch_config()` and `list_published_configs()`
- Both methods now raise `ConfigFetchError` if YAML path is hit; API-fetch path still works

### `scrapers/__init__.py`
- Removed lazy import for `WorkflowExecutor`

### `scrapers/models/__init__.py`
- Removed imports of `result.py` (moved to legacy)

### `scrapers/schemas/__init__.py`
- Removed import of `scraper_config_schema.py` (moved to legacy)

## Verification

| Check | Result |
|-------|--------|
| Web TypeScript (`bun run web tsc --noEmit`) | **0 errors** ✅ |
| Python imports (runner, core, daemon) | **All OK** ✅ |
| Pipeline test suites (50 suites, 339 tests) | **All pass** ✅ |
