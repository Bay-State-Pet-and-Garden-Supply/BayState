# Scraper Infrastructure Improvements

## TL;DR

> **Quick Summary**: Enhance production scraper reliability and observability by exposing existing Prometheus metrics, adding Sentry error tracking, implementing proxy rotation for high-volume sites, adding Pandera data validation, and evaluating ScrapeGraphAI for complex navigation patterns.
> 
> **Deliverables**:
> - HTTP `/metrics` endpoint for Prometheus scraping
> - Sentry SDK integration with job context enrichment
> - Proxy rotation configuration in YAML DSL
> - Pandera validation schemas for callback payloads
> - ScrapeGraphAI POC (conditional)
> 
> **Estimated Effort**: Medium (4 weeks)
> **Parallel Execution**: YES - 4 phases with dependencies
> **Critical Path**: T1 (Metrics) → T2 (Sentry) → T5 (Proxy Config) → T9 (Pandera) → F1-F4 (Final Review)

---

## Context

### Original Request
User requested improvements to the BayStateScraper infrastructure focusing on:
1. Production monitoring (Sentry + Prometheus)
2. Proxy support for high-volume sites
3. AI enhancement for complex navigation
4. Data quality validation

### Interview Summary
**Key Discussions**:
- Focus on operational tooling, NOT core engine changes
- Maintain backward compatibility with existing YAML configs
- Additive improvements only
- Skills installed to support implementation

**Metis Research Findings** (Critical Discoveries):
- ✅ **Prometheus metrics ALREADY EXIST** in `metrics.py:get_prometheus_metrics()`
- ✅ **Proxy support ALREADY EXISTS** in crawl4ai's BrowserConfig
- ✅ Sophisticated retry/circuit breaker infrastructure in place
- ✅ Pydantic models already provide strong validation
- ⚠️ ScrapeGraphAI requires POC before production commitment

### Metis Review
**Identified Gaps** (addressed):
- **Gap**: Unclear metrics consumption path → Resolved: HTTP endpoint for Prometheus
- **Gap**: Missing Sentry integration → Resolved: Add Sentry SDK with context
- **Gap**: No proxy rotation strategy → Resolved: Configurable rotation per scraper
- **Gap**: Validation only at model level → Resolved: Pandera at callback boundary
- **Gap**: ScrapeGraphAI scope undefined → Resolved: POC gate before implementation

---

## Work Objectives

### Core Objective
Expose and enhance existing scraper infrastructure to improve production observability, reliability, and data quality without modifying the core crawl4ai engine.

### Concrete Deliverables
1. `/metrics` HTTP endpoint exposing Prometheus-formatted metrics
2. Sentry error tracking with job context and breadcrumbs
3. Proxy rotation configuration in YAML DSL (opt-in)
4. Pandera validation schemas for extraction results
5. ScrapeGraphAI POC report (go/no-go decision)

### Definition of Done
- [ ] All TODOs complete with agent-executable QA evidence
- [ ] Final verification wave (F1-F4) approves all changes
- [ ] No regression in existing scraper functionality
- [ ] Documentation updated for new features

### Must Have
- Prometheus metrics endpoint responding on `/metrics`
- Sentry capturing exceptions with job_id context
- Proxy configuration working with Bright Data or Oxylabs
- Pandera validating callback payloads
- All changes backward compatible

### Must NOT Have (Guardrails from Metis)
- **NO** changes to existing crawl4ai engine behavior
- **NO** removal of existing retry/circuit breaker logic
- **NO** mandatory proxy requirement (opt-in only)
- **NO** breaking changes to YAML DSL
- **NO** new UI/dashboards (use existing BayStateApp admin)
- **NO** ScrapeGraphAI production code without POC approval
- **NO** proxy rotation algorithms built from scratch
- **NO** statistical/ML validation in Pandera (basic schemas only)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest)
- **Automated tests**: Tests-after (no TDD requirement for infrastructure)
- **Framework**: pytest with mocking
- **If TDD**: N/A - infrastructure integration work

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/Python**: Use Bash (pytest, curl, python REPL)
- **Docker**: Use Bash (docker build, docker run)
- **API**: Use Bash (curl) - Send requests, assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - Foundation):
├── T1: Expose Prometheus metrics endpoint [quick]
├── T2: Integrate Sentry error tracking [quick]
├── T3: Document monitoring setup [quick]
└── T4: Create proxy configuration schema [quick]

Wave 2 (After Wave 1 - Core Infrastructure):
├── T5: Implement proxy rotation logic [unspecified-high]
├── T6: Add proxy action handler [quick]
├── T7: Test proxy integration with mock [quick]
└── T8: Document proxy configuration [quick]

Wave 3 (After Wave 2 - Data Quality):
├── T9: Define Pandera validation schemas [quick]
├── T10: Integrate Pandera at callback boundary [unspecified-high]
├── T11: Add validation error handling [quick]
└── T12: Document validation rules [quick]

Wave 4 (After Wave 3 - AI Enhancement POC):
├── T13: ScrapeGraphAI POC setup [quick]
├── T14: POC implementation for complex navigation [deep]
├── T15: POC evaluation and report [unspecified-high]
└── T16: Decision gate (implement or defer) [unspecified-high]

Wave FINAL (After ALL tasks - Independent Review, 4 parallel):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)

Critical Path: T1 → T2 → T5 → T9 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 1-3)
```

### Dependency Matrix

- **T1**: — — T2 (can share metrics client), 1
- **T2**: — — T9 (Sentry context for validation errors), 2
- **T5**: T4 — T6, T7, 3
- **T6**: T5 — T7, 4
- **T9**: — — T10, 5
- **T10**: T2, T9 — T11, F1-F4, 6
- **T11**: T10 — F1-F4, 7
- **T13**: — — T14, T15, 8
- **T16**: T15 — F1-F4 (if approved), 9

### Agent Dispatch Summary

- **W1**: **4** — T1-T3 → `quick`, T4 → `quick`
- **W2**: **4** — T5 → `unspecified-high`, T6-T8 → `quick`
- **W3**: **4** — T9, T11 → `quick`, T10 → `unspecified-high`
- **W4**: **4** — T13, T15 → `unspecified-high`, T14 → `deep`, T16 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs



- [x] T1. Expose Prometheus Metrics Endpoint

  **What to do**:
  - Create HTTP `/metrics` endpoint in the scraper daemon
  - Use existing `Crawl4AIMetricsCollector.get_prometheus_metrics()` method (already exists in `src/crawl4ai_engine/metrics.py`)
  - Return Prometheus-formatted text response
  - Expose on port 8000 (configurable via env var `METRICS_PORT`)
  - Include standard metrics: extraction counts, success rates, durations, cache hits, errors, anti-bot metrics, costs

  **Must NOT do**:
  - Do NOT modify existing metrics collection logic
  - Do NOT remove any existing metrics
  - Do NOT add authentication to the endpoint (Prometheus handles this externally)
  - Do NOT use a framework - use stdlib `http.server` or existing daemon's HTTP capability

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`, `playwright-best-practices`
  - Reason: Simple HTTP endpoint wrapping existing functionality

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4)
  - **Blocks**: T2 (can share metrics client)
  - **Blocked By**: None

  **References**:
  - `apps/scraper/src/crawl4ai_engine/metrics.py:355-411` - Existing `get_prometheus_metrics()` method
  - `apps/scraper/daemon.py` - Main daemon entry point
  - Prometheus exposition format: https://prometheus.io/docs/instrumenting/exposition_formats/

  **Acceptance Criteria**:
  - [ ] `curl -s http://localhost:8000/metrics` returns Prometheus-formatted text
  - [ ] Response includes `crawl4ai_extractions_total` metric
  - [ ] Response includes `crawl4ai_duration_ms` metric (existing)
  - [ ] Response includes `crawl4ai_cache_hit_rate` metric (existing)
  - [ ] Metrics update after each extraction (run test job, verify metric incremented)

  **QA Scenarios**:

  ```
  Scenario: Metrics endpoint responds with Prometheus format
    Tool: Bash (curl)
    Preconditions: Scraper daemon running locally
    Steps:
      1. Start daemon: `cd apps/scraper && python daemon.py &`
      2. Wait 5 seconds for startup
      3. Request metrics: `curl -s http://localhost:8000/metrics`
    Expected Result: HTTP 200 response with Content-Type: text/plain; version=0.0.4
    Failure Indicators: Connection refused, empty response, non-200 status
    Evidence: .sisyphus/evidence/t1-metrics-endpoint-response.txt

  Scenario: Metrics update after extraction
    Tool: Bash (curl + python)
    Preconditions: Daemon running, metrics endpoint accessible
    Steps:
      1. Capture initial count: `BEFORE=$(curl -s http://localhost:8000/metrics | grep "crawl4ai_extractions_total" | grep "mode=\"llm_free\"" | awk '{print $2}')`
      2. Trigger extraction via test job
      3. Capture new count: `AFTER=$(curl -s http://localhost:8000/metrics | grep "crawl4ai_extractions_total" | grep "mode=\"llm_free\"" | awk '{print $2}')`
      4. Verify: `[ "$AFTER" -gt "$BEFORE" ] && echo "PASS" || echo "FAIL"`
    Expected Result: AFTER > BEFORE (metric incremented)
    Failure Indicators: Metric not found, values equal, parsing error
    Evidence: .sisyphus/evidence/t1-metrics-update-test.sh
  ```

  **Evidence to Capture**:
  - [ ] Metrics endpoint response saved to evidence file
  - [ ] Before/after metric values showing increment

  **Commit**: YES
  - Message: `feat(monitoring): add Prometheus metrics endpoint`
  - Files: `apps/scraper/daemon.py`, `apps/scraper/src/crawl4ai_engine/metrics_endpoint.py`

---

- [x] T2. Integrate Sentry Error Tracking

  **What to do**:
  - Add `sentry-sdk` to requirements.txt
  - Initialize Sentry in daemon startup with `dsn` from `SENTRY_DSN` env var
  - Enrich Sentry context with job_id, scraper_name, url, extraction_mode
  - Add breadcrumbs for extraction steps (navigate, extract, validate)
  - Capture anti-bot detection events as warnings
  - Ensure Sentry doesn't add >50ms latency per extraction

  **Must NOT do**:
  - Do NOT replace existing structured logging (use alongside)
  - Do NOT send PII (urls are ok, but scrub any user credentials)
  - Do NOT capture every retry attempt as separate error (only final failures)
  - Do NOT block extraction on Sentry send (use async transport)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`
  - Reason: SDK integration with context enrichment

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4)
  - **Blocks**: T10 (Sentry context for validation errors)
  - **Blocked By**: None

  **References**:
  - `apps/scraper/daemon.py` - Daemon initialization
  - `apps/scraper/src/crawl4ai_engine/engine.py` - Extraction flow
  - Sentry Python SDK: https://docs.sentry.io/platforms/python/
  - `apps/scraper/scraper_backend/src/crawl4ai_engine/retry.py` - Retry logic for breadcrumb integration

  **Acceptance Criteria**:
  - [ ] Sentry SDK initialized when `SENTRY_DSN` env var is set
  - [ ] Errors include job_id tag in Sentry context
  - [ ] Test error appears in Sentry dashboard when triggered
  - [ ] Breadcrumbs show extraction steps for failed jobs

  **QA Scenarios**:

  ```
  Scenario: Sentry captures test exception
    Tool: Bash (python)
    Preconditions: SENTRY_DSN set to test DSN
    Steps:
      1. Set env: `export SENTRY_DSN=https://test@test.sentry.io/123`
      2. Run test: `cd apps/scraper && python -c "from utils.sentry import init_sentry; init_sentry(); raise ValueError('test')" 2>&1 | grep -i sentry`
      3. Verify: Check Sentry dashboard for test error
    Expected Result: Test error appears in Sentry with context
    Failure Indicators: No error in dashboard, SDK not initialized error
    Evidence: .sisyphus/evidence/t2-sentry-test-error.png (screenshot of Sentry UI)

  Scenario: Sentry context includes job_id
    Tool: Python (REPL)
    Preconditions: Sentry initialized
    Steps:
      1. Import: `from scraper_backend.src.crawl4ai_engine.engine import Crawl4AIEngine`
      2. Check context: `python -c "import sentry_sdk; sentry_sdk.set_tag('job_id', 'test-123'); print('Context set')"`
      3. Verify context is attached to subsequent errors
    Expected Result: job_id appears in Sentry error context
    Failure Indicators: Context missing, wrong format
    Evidence: .sisyphus/evidence/t2-sentry-context.txt
  ```

  **Evidence to Capture**:
  - [ ] Sentry dashboard screenshot showing test error
  - [ ] Error context showing job_id and tags

  **Commit**: YES
  - Message: `feat(monitoring): add Sentry error tracking`
  - Files: `apps/scraper/utils/sentry.py`, `apps/scraper/daemon.py`, `apps/scraper/requirements.txt`

---

- [x] T3. Document Monitoring Setup

  **What to do**:
  - Create `apps/scraper/docs/monitoring.md` documenting:
    - Prometheus metrics endpoint configuration
    - Sentry DSN setup
    - Available metrics and their meanings
    - Example Prometheus scrape config
    - Troubleshooting (what to check if metrics aren't appearing)
  - Update main README.md with monitoring section
  - Add environment variables to `.env.example`

  **Must NOT do**:
  - Do NOT document Grafana setup (out of scope)
  - Do NOT create dashboard JSON files

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - Reason: Documentation only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4)
  - **Blocks**: None
  - **Blocked By**: T1, T2 (must know what was built)

  **References**:
  - `apps/scraper/README.md` - Main readme to update
  - Create `apps/scraper/.env.example` environment template file with:

  **Acceptance Criteria**:
  - [ ] `monitoring.md` exists with all required sections
  - [ ] README.md updated with monitoring section
  - [ ] `.env.example` includes `SENTRY_DSN` and `METRICS_PORT`

  **QA Scenarios**:

  ```
  Scenario: Documentation is complete
    Tool: Bash (file check)
    Preconditions: None
    Steps:
      1. Check file exists: `test -f apps/scraper/docs/monitoring.md && echo "PASS" || echo "FAIL"`
      2. Check README updated: `grep -q "Monitoring" apps/scraper/README.md && echo "PASS" || echo "FAIL"`
      3. Check env example created: `test -f apps/scraper/.env.example && grep -q "SENTRY_DSN" apps/scraper/.env.example && echo "PASS" || echo "FAIL"`
    Expected Result: All checks pass
    Evidence: .sisyphus/evidence/t3-docs-check.sh
  ```

  **Commit**: YES (groups with T1, T2)
  - Message: `docs(monitoring): add monitoring setup documentation`
  - Files: `apps/scraper/docs/monitoring.md`, `apps/scraper/README.md`, `apps/scraper/.env.example` (created)

---

- [x] T4. Create Proxy Configuration Schema

  **What to do**:
  - Add optional `proxy_config` section to YAML DSL schema
  - Define Pydantic models for proxy configuration:
    - `proxy_url`: str (http://proxy:port format)
    - `proxy_username`: Optional[str]
    - `proxy_password`: Optional[str]
    - `rotation_strategy`: Literal["per_request", "per_site", "off"]
    - `proxy_list`: Optional[List[str]] (for multiple proxies)
  - Add validation for proxy URL format
  - Ensure proxy config is optional (existing configs without proxy must still work)

  **Must NOT do**:
  - Do NOT require proxy configuration (opt-in only)
  - Do NOT break existing configs without proxy settings
  - Do NOT store proxy passwords in plain text logs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`
  - Reason: Schema definition with Pydantic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3)
  - **Blocks**: T5 (proxy rotation logic needs schema)
  - **Blocked By**: None

  **References**:
  - `apps/scraper/scrapers/models/config.py` - Existing config models
  - `apps/scraper/scrapers/configs/ai-template.yaml` - Example config to extend
  - crawl4ai BrowserConfig proxy parameter: `apps/scraper/scraper_backend/src/crawl4ai_engine/engine.py:80`

  **Acceptance Criteria**:
  - [ ] `ProxyConfig` Pydantic model exists
  - [ ] YAML configs with proxy_config validate successfully
  - [ ] YAML configs without proxy_config still validate (backward compatibility)
  - [ ] Invalid proxy URLs raise validation error

  **QA Scenarios**:

  ```
  Scenario: Proxy config validates correctly
    Tool: Python (pytest)
    Preconditions: Schema implemented
    Steps:
      1. Test valid config: `python -c "from scrapers.models.config import ScraperConfig; c = ScraperConfig(proxy_config={'proxy_url': 'http://proxy:8080'}); print('Valid')"`
      2. Test without proxy: `python -c "from scrapers.models.config import ScraperConfig; c = ScraperConfig(); print('Valid')"`
      3. Test invalid URL: `python -c "from scrapers.models.config import ScraperConfig; ScraperConfig(proxy_config={'proxy_url': 'invalid'})" 2>&1 | grep -i error`
    Expected Result: Valid configs pass, invalid fails with clear error
    Evidence: .sisyphus/evidence/t4-proxy-schema-test.py
  ```

  **Commit**: YES
  - Message: `feat(proxy): add proxy configuration schema`
  - Files: `apps/scraper/scrapers/models/config.py`

---


- [x] T5. Implement Proxy Rotation Logic

  **What to do**:
  - Create `ProxyRotator` class that manages proxy lists and rotation strategies
  - Support strategies: `per_request` (rotate every request), `per_site` (same proxy for site), `off` (no rotation)
  - Integrate with existing crawl4ai `BrowserConfig` proxy parameter
  - Handle proxy authentication (Basic Auth header)
  - Track proxy health (mark failed proxies, retry later)
  - Support Bright Data and Oxylabs proxy formats

  **Must NOT do**:
  - Do NOT implement proxy health checking from scratch (use simple success/fail tracking)
  - Do NOT build a proxy management UI
  - Do NOT make proxy mandatory for any scraper
  - Do NOT cache proxy passwords in memory longer than necessary

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `web-scraping`, `playwright-best-practices`
  - Reason: Complex logic with rotation strategies and auth

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T4)
  - **Parallel Group**: Wave 2
  - **Blocks**: T6 (action handler needs rotator), T7 (tests need implementation)
  - **Blocked By**: T4 (schema must be defined)

  **References**:
  - `apps/scraper/src/crawl4ai_engine/engine.py` - BrowserConfig integration point
  - `apps/scraper/scraper_backend/src/crawl4ai_engine/engine.py` - crawl4ai engine
  - Bright Data proxy format: http://user:pass@proxy.brightdata.io:22225
  - Oxylabs proxy format: http://user:pass@pr.oxylabs.io:7777

  **Acceptance Criteria**:
  - [ ] `ProxyRotator` class exists with `get_proxy()` method
  - [ ] `per_request` strategy rotates proxy on each call
  - [ ] `per_site` strategy returns same proxy for same site
  - [ ] Failed proxies are temporarily excluded from rotation
  - [ ] Auth headers correctly formatted for Bright Data/Oxylabs

  **QA Scenarios**:

  ```
  Scenario: Proxy rotation works per request
    Tool: Python (REPL)
    Preconditions: ProxyRotator implemented
    Steps:
      1. Create rotator: `rotator = ProxyRotator(["http://p1:8080", "http://p2:8080"], strategy="per_request")`
      2. Get proxies: `p1 = rotator.get_proxy(); p2 = rotator.get_proxy(); p3 = rotator.get_proxy()`
      3. Verify rotation: `assert p1 != p2 or p2 != p3, "Should rotate"`
    Expected Result: Proxies rotate (p1, p2, p1 pattern for 2 proxies)
    Evidence: .sisyphus/evidence/t5-rotation-test.py

  Scenario: Failed proxy is temporarily excluded
    Tool: Python (REPL)
    Preconditions: Rotator with health tracking
    Steps:
      1. Mark proxy failed: `rotator.mark_failed("http://bad-proxy:8080")`
      2. Get proxy: `proxy = rotator.get_proxy()`
      3. Verify: `assert proxy != "http://bad-proxy:8080", "Failed proxy should be excluded"`
    Expected Result: Failed proxy not returned (until recovery period)
    Evidence: .sisyphus/evidence/t5-failed-proxy-test.py
  ```

  **Evidence to Capture**:
  - [ ] Unit test output showing rotation strategies
  - [ ] Test showing failed proxy exclusion

  **Commit**: YES
  - Message: `feat(proxy): implement proxy rotation logic`
  - Files: `apps/scraper/utils/proxy_rotator.py`

---

- [x] T6. Add Proxy Action Handler

  **What to do**:
  - Create `SetProxyAction` handler in `scrapers/actions/handlers/`
  - Register with `@ActionRegistry.register("set_proxy")`
  - Accept proxy config from YAML params or use scraper-level proxy_config
  - Integrate with `ProxyRotator` to get next proxy
  - Apply proxy to browser context via crawl4ai BrowserConfig
  - Support dynamic proxy switching mid-workflow (rare but useful)

  **Must NOT do**:
  - Do NOT create separate browser context for proxy (use existing)
  - Do NOT restart browser on proxy change (crawl4ai supports dynamic proxy)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`, `playwright-best-practices`
  - Reason: Action handler following existing pattern

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: T7 (integration tests)
  - **Blocked By**: T5 (needs ProxyRotator)

  **References**:
  - `apps/scraper/scrapers/actions/handlers/` - Existing action handlers
  - `apps/scraper/scrapers/actions/base.py` - BaseAction class
  - `apps/scraper/scrapers/actions/registry.py` - ActionRegistry
  - `apps/scraper/utils/proxy_rotator.py` - T5 implementation

  **Acceptance Criteria**:
  - [ ] `set_proxy` action registered and executable
  - [ ] Action updates browser proxy configuration
  - [ ] Works with scraper-level proxy_config as default
  - [ ] Logs proxy usage (without exposing credentials)

  **QA Scenarios**:

  ```
  Scenario: Proxy action executes successfully
    Tool: Python (pytest)
    Preconditions: Handler implemented
    Steps:
      1. Load action: `from scrapers.actions.handlers.set_proxy import SetProxyAction`
      2. Mock context and browser
      3. Execute: `action.execute({"proxy_url": "http://test:8080"})`
      4. Verify browser.proxy was set
    Expected Result: Browser config updated with proxy
    Evidence: .sisyphus/evidence/t6-proxy-action-test.py
  ```

  **Commit**: YES
  - Message: `feat(proxy): add set_proxy action handler`
  - Files: `apps/scraper/scrapers/actions/handlers/set_proxy.py`

---

- [x] T7. Test Proxy Integration with Mock

  **What to do**:
  - Create mock proxy server for testing (using Python http.server)
  - Test that scraper requests route through proxy
  - Test proxy rotation strategies
  - Test proxy failure handling
  - Ensure no real proxy credentials needed for tests

  **Must NOT do**:
  - Do NOT use real proxy services in tests (costs money)
  - Do NOT test against real sites through proxy (unreliable)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`
  - Reason: Test implementation with mocking

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T6 (needs action handler)

  **References**:
  - `apps/scraper/tests/unit/` - Existing test structure
  - Python http.server for mock proxy

  **Acceptance Criteria**:
  - [ ] Mock proxy server implementation
  - [ ] Tests verify requests route through proxy
  - [ ] Tests verify rotation strategies
  - [ ] All tests pass without real proxy credentials

  **QA Scenarios**:

  ```
  Scenario: Scraper routes through mock proxy
    Tool: Bash (pytest)
    Preconditions: Mock proxy running
    Steps:
      1. Start mock proxy: `python tests/mocks/proxy_server.py &`
      2. Run test: `pytest tests/unit/test_proxy_integration.py -v`
      3. Verify: All tests pass
    Expected Result: 100% test pass rate
    Evidence: .sisyphus/evidence/t7-proxy-test-results.txt
  ```

  **Commit**: YES (groups with T5, T6)
  - Message: `test(proxy): add proxy integration tests`
  - Files: `apps/scraper/tests/unit/test_proxy_integration.py`, `apps/scraper/tests/mocks/proxy_server.py`

---

- [x] T8. Document Proxy Configuration

  **What to do**:
  - Add proxy configuration section to `docs/crawl4ai-config.md`
  - Document Bright Data and Oxylabs setup
  - Provide example YAML configs with proxy settings
  - Document rotation strategies and when to use each
  - Add troubleshooting section for proxy issues

  **Must NOT do**:
  - Do NOT provide actual proxy credentials (use placeholders)
  - Do NOT document proxy provider pricing (links only)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - Reason: Documentation only

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: T5, T6 (must know what was built)

  **References**:
  - `apps/scraper/docs/crawl4ai-config.md` - Existing config docs

  **Acceptance Criteria**:
  - [ ] Proxy section added to config docs
  - [ ] Bright Data example provided
  - [ ] Oxylabs example provided
  - [ ] Rotation strategies documented

  **QA Scenarios**:

  ```
  Scenario: Documentation is complete
    Tool: Bash (file check)
    Preconditions: None
    Steps:
      1. Check proxy section: `grep -q "proxy_config" apps/scraper/docs/crawl4ai-config.md && echo "PASS" || echo "FAIL"`
      2. Check examples: `grep -q "brightdata\|oxylabs" apps/scraper/docs/crawl4ai-config.md && echo "PASS" || echo "FAIL"`
    Expected Result: All checks pass
    Evidence: .sisyphus/evidence/t8-proxy-docs-check.sh
  ```

  **Commit**: YES (groups with T5-T7)
  - Message: `docs(proxy): add proxy configuration documentation`
  - Files: `apps/scraper/docs/crawl4ai-config.md`

---


- [x] T9. Define Pandera Validation Schemas

  **What to do**:
  - Install `pandera` in requirements.txt
  - Create Pandera schemas for `ScrapedResult` model:
    - `price`: must be positive number or null
    - `name`: required string, min length 1
    - `url`: valid URL format
    - `sku`: alphanumeric with allowed delimiters
  - Create schemas for callback payload validation
  - Ensure schemas align with existing Pydantic models (complement, don't replace)

  **Must NOT do**:
  - Do NOT replace Pydantic models (Pandera complements them)
  - Do NOT add statistical validation (basic schemas only)
  - Do NOT validate at multiple layers (validate at callback boundary only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`
  - Reason: Schema definition with Pandera

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T10 (validation integration needs schemas)
  - **Blocked By**: None

  **References**:
  - `apps/scraper/scrapers/models/result.py` - Existing result models
  - `apps/web/lib/scraper-callback/contract.ts` - BayStateApp callback contract
  - Pandera docs: https://pandera.readthedocs.io/

  **Acceptance Criteria**:
  - [ ] Pandera schemas defined for all callback payload types
  - [ ] Invalid data raises `SchemaError` with clear message
  - [ ] Valid data passes without errors
  - [ ] Schemas don't conflict with Pydantic validation

  **QA Scenarios**:

  ```
  Scenario: Schema catches invalid price
    Tool: Python (REPL)
    Preconditions: Pandera installed, schemas defined
    Steps:
      1. Import schema: `from validation.schemas import ScrapedResultSchema`
      2. Try invalid: `ScrapedResultSchema.validate({'price': 'free', 'name': 'Test'})`
    Expected Result: Raises SchemaError with message about price type
    Evidence: .sisyphus/evidence/t9-pandera-validation-test.py

  Scenario: Valid data passes validation
    Tool: Python (REPL)
    Preconditions: Schema defined
    Steps:
      1. Validate: `ScrapedResultSchema.validate({'price': 29.99, 'name': 'Test Product', 'url': 'https://example.com/product'})`
    Expected Result: Returns validated DataFrame/dict without error
    Evidence: .sisyphus/evidence/t9-pandera-valid-test.py
  ```

  **Evidence to Capture**:
  - [ ] Validation error output showing clear messages
  - [ ] Successful validation of valid data

  **Commit**: YES
  - Message: `feat(validation): add Pandera schemas for data quality`
  - Files: `apps/scraper/validation/schemas.py`, `apps/scraper/requirements.txt`

---

- [x] T10. Integrate Pandera at Callback Boundary

  **What to do**:
  - Add Pandera validation to callback submission in `callback.py`
  - Validate `ScrapedResult` before POST to BayStateApp
  - On validation failure: log error, send to Sentry, return structured error
  - On validation success: proceed with callback
  - Add validation timing metrics (ensure <10ms overhead)
  - Make validation optional via env var `ENABLE_PANDERA_VALIDATION` (default true)

  **Must NOT do**:
  - Do NOT validate at multiple points (only at callback)
  - Do NOT block on validation forever (set timeout)
  - Do NOT expose raw validation errors to BayStateApp (sanitize first)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `web-scraping`
  - Reason: Integration with existing callback flow

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T2, T9)
  - **Parallel Group**: Wave 3
  - **Blocks**: T11 (error handling needs integration)
  - **Blocked By**: T2 (Sentry for error reporting), T9 (schemas needed)

  **References**:
  - `apps/scraper/src/crawl4ai_engine/callback.py` - Callback submission
  - `apps/scraper/validation/schemas.py` - T9 implementation
  - `apps/scraper/utils/sentry.py` - T2 implementation

  **Acceptance Criteria**:
  - [ ] Validation runs before every callback
  - [ ] Invalid data triggers Sentry alert with context
  - [ ] Validation adds <10ms latency
  - [ ] Can be disabled via env var

  **QA Scenarios**:

  ```
  Scenario: Invalid data triggers error flow
    Tool: Python (pytest)
    Preconditions: Integration complete
    Steps:
      1. Mock invalid result: `result = {'price': 'invalid', 'name': ''}`
      2. Attempt callback: `callback.send(result)`
      3. Verify: Error logged, Sentry notified, callback not sent
    Expected Result: ValidationError raised, Sentry breadcrumb added
    Evidence: .sisyphus/evidence/t10-validation-integration-test.py

  Scenario: Valid data proceeds normally
    Tool: Python (pytest)
    Preconditions: Integration complete
    Steps:
      1. Mock valid result: `result = {'price': 29.99, 'name': 'Valid', 'url': 'https://test.com'}`
      2. Attempt callback: `callback.send(result)`
      3. Verify: HTTP POST sent to BayStateApp
    Expected Result: Callback successful (HTTP 200)
    Evidence: .sisyphus/evidence/t10-valid-callback-test.py
  ```

  **Commit**: YES
  - Message: `feat(validation): integrate Pandera at callback boundary`
  - Files: `apps/scraper/src/crawl4ai_engine/callback.py`

---

- [x] T11. Add Validation Error Handling

  **What to do**:
  - Create structured error format for validation failures
  - Include field-level error details in error response
  - Add validation error metrics to Prometheus
  - Document common validation failures and fixes
  - Create retry logic for transient validation issues (rare but possible)

  **Must NOT do**:
  - Do NOT retry validation errors (fail fast)
  - Do NOT send partial data to BayStateApp (all or nothing)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`
  - Reason: Error handling and metrics

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T10)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T10 (needs integration point)

  **References**:
  - `apps/scraper/src/crawl4ai_engine/metrics.py` - Metrics collection
  - `apps/scraper/src/crawl4ai_engine/callback.py` - Error context

  **Acceptance Criteria**:
  - [ ] Validation errors have structured format
  - [ ] Field-level errors are captured
  - [ ] Prometheus counter for validation failures
  - [ ] Errors include remediation hints

  **QA Scenarios**:

  ```
  Scenario: Validation error includes field details
    Tool: Python (REPL)
    Preconditions: Error handling implemented
    Steps:
      1. Trigger validation error with multiple invalid fields
      2. Catch error and inspect: `error.details`
    Expected Result: Error includes per-field failure reasons
    Evidence: .sisyphus/evidence/t11-error-details-test.py
  ```

  **Commit**: YES (groups with T9, T10)
  - Message: `feat(validation): add validation error handling`
  - Files: `apps/scraper/validation/errors.py`

---

- [x] T12. Document Validation Rules

  **What to do**:
  - Add validation section to `docs/crawl4ai-config.md`
  - Document all validation rules (price positive, name required, etc.)
  - Provide examples of valid and invalid data
  - Document how to disable validation (env var)
  - Add troubleshooting for validation errors

  **Must NOT do**:
  - Do NOT document Pandera internals (just rules and usage)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - Reason: Documentation only

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T11)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T9, T10 (must know what was built)

  **References**:
  - `apps/scraper/docs/crawl4ai-config.md` - Existing docs

  **Acceptance Criteria**:
  - [ ] Validation section added to docs
  - [ ] All rules documented
  - [ ] Examples provided

  **QA Scenarios**:

  ```
  Scenario: Documentation is complete
    Tool: Bash (file check)
    Preconditions: None
    Steps:
      1. Check validation section: `grep -q "Validation" apps/scraper/docs/crawl4ai-config.md && echo "PASS" || echo "FAIL"`
      2. Check examples: `grep -q "pandera\|validation" apps/scraper/docs/crawl4ai-config.md && echo "PASS" || echo "FAIL"`
    Expected Result: All checks pass
    Evidence: .sisyphus/evidence/t12-validation-docs-check.sh
  ```

  **Commit**: YES (groups with T9-T11)
  - Message: `docs(validation): add validation rules documentation`
  - Files: `apps/scraper/docs/crawl4ai-config.md`

---

- [x] T13. ScrapeGraphAI POC Setup

  **What to do**:
  - Install `scrapegraphai` in separate virtual environment (isolated POC)
  - Create minimal POC script using ScrapeGraphAI with Playwright
  - Define POC scope: one complex navigation scenario (e.g., multi-step form, comparison table)
  - Document what crawl4ai cannot handle that ScrapeGraphAI can
  - Keep POC under 100 lines of code

  **Must NOT do**:
  - Do NOT integrate with main scraper codebase yet
  - Do NOT modify existing crawl4ai workflows
  - Do NOT spend more than 1 day on POC

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `web-scraping`, `playwright-explore-website`, `firecrawl`
  - Reason: Isolated evaluation of new tool

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: T14 (POC implementation)
  - **Blocked By**: None

  **References**:
  - ScrapeGraphAI docs: https://github.com/0xpayne/ScrapeGraphAI
  - `apps/scraper/tests/poc/` - Create this directory for POCs

  **Acceptance Criteria**:
  - [ ] POC environment isolated from main codebase
  - [ ] ScrapeGraphAI installed and importable
  - [ ] One test case defined (complex navigation)

  **QA Scenarios**:

  ```
  Scenario: ScrapeGraphAI imports successfully
    Tool: Bash (python)
    Preconditions: POC environment ready
    Steps:
      1. Create venv: `python -m venv /tmp/scrapegraph-poc`
      2. Install: `pip install scrapegraphai playwright`
      3. Test import: `python -c "from scrapegraphai import SmartScraperGraph; print('OK')"`
    Expected Result: Import succeeds without errors
    Evidence: .sisyphus/evidence/t13-scrapegraph-import.txt
  ```

  **Commit**: NO (POC is isolated, don't commit to main)
  - Files: `apps/scraper/tests/poc/scrapegraph/` (add to .gitignore)

---

- [x] T14. POC Implementation for Complex Navigation

  **What to do**:
  - Implement one complex navigation scenario using ScrapeGraphAI
  - Example: Product comparison across multiple retailers
  - Compare same scenario with crawl4ai (document limitations)
  - Measure: success rate, time to completion, cost (if API calls)
  - Document integration complexity with existing system

  **Must NOT do**:
  - Do NOT test against production sites (use test sites)
  - Do NOT exceed $10 in API costs
  - Do NOT build abstraction layers (keep it simple)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `web-scraping`, `playwright-explore-website`, `langchain-architecture`
  - Reason: Deep evaluation of AI tool capabilities

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T13)
  - **Parallel Group**: Wave 4
  - **Blocks**: T15 (evaluation needs results)
  - **Blocked By**: T13 (needs environment)

  **References**:
  - Test site: https://scrape-this-site.web.app/ (if available) or similar
  - crawl4ai comparison: `apps/scraper/src/crawl4ai_engine/engine.py`

  **Acceptance Criteria**:
  - [ ] One complex scenario implemented
  - [ ] Success/failure documented
  - [ ] Comparison with crawl4ai completed
  - [ ] Cost measured

  **QA Scenarios**:

  ```
  Scenario: POC completes complex navigation
    Tool: Bash (python)
    Preconditions: POC script ready
    Steps:
      1. Run POC: `cd apps/scraper/tests/poc/scrapegraph && python complex_navigation.py`
      2. Capture output: Success/failure, time, cost
    Expected Result: Script completes, results documented
    Evidence: .sisyphus/evidence/t14-poc-results.json
  ```

  **Commit**: NO (POC only)
  - Files: `apps/scraper/tests/poc/scrapegraph/complex_navigation.py`

---

- [x] T15. POC Evaluation and Report

  **What to do**:
  - Write evaluation report: `tests/poc/scrapegraph/EVALUATION_REPORT.md`
  - Include: what worked, what didn't, integration complexity, recommendation
  - Compare to existing crawl4ai capabilities
  - Provide go/no-go recommendation with rationale
  - If GO: outline integration approach
  - If NO-GO: document why and close POC

  **Must NOT do**:
  - Do NOT write production code yet
  - Do NOT commit to using ScrapeGraphAI (decision gate)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `web-scraping`
  - Reason: Evaluation and decision documentation

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T14)
  - **Parallel Group**: Wave 4
  - **Blocks**: T16 (decision needs report)
  - **Blocked By**: T14 (needs POC results)

  **Acceptance Criteria**:
  - [ ] Evaluation report written
  - [ ] Clear go/no-go recommendation
  - [ ] Integration approach outlined (if GO)

  **QA Scenarios**:

  ```
  Scenario: Report exists with recommendation
    Tool: Bash (file check)
    Preconditions: None
    Steps:
      1. Check report: `test -f apps/scraper/tests/poc/scrapegraph/EVALUATION_REPORT.md && echo "PASS" || echo "FAIL"`
      2. Check recommendation: `grep -q "Recommendation:\|GO\|NO-GO" apps/scraper/tests/poc/scrapegraph/EVALUATION_REPORT.md && echo "PASS" || echo "FAIL"`
    Expected Result: All checks pass
    Evidence: .sisyphus/evidence/t15-report-check.sh
  ```

  **Commit**: YES (commit report only, not POC code)
  - Message: `docs(poc): add ScrapeGraphAI evaluation report`
  - Files: `apps/scraper/tests/poc/scrapegraph/EVALUATION_REPORT.md`

---

- [x] T16. Decision Gate (Implement or Defer)

  **What to do**:
  - Review T15 evaluation report
  - If GO: Create follow-up tasks for production integration
  - If NO-GO: Document decision and archive POC
  - User must approve decision before proceeding

  **Must NOT do**:
  - Do NOT skip decision gate
  - Do NOT proceed with integration without explicit approval

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: Decision point, no implementation

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T15)
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4 (if GO, includes ScrapeGraphAI work)
  - **Blocked By**: T15 (needs report)

  **Acceptance Criteria**:
  - [ ] Decision recorded in plan
  - [ ] If GO: follow-up tasks created
  - [ ] If NO-GO: rationale documented

  **QA Scenarios**:

  ```
  Scenario: Decision is recorded
    Tool: Review plan
    Preconditions: T15 complete
    Steps:
      1. Check decision recorded in T16
    Expected Result: Decision stated clearly
    Evidence: .sisyphus/evidence/t16-decision-recorded.txt
  ```

  **Commit**: N/A (decision only)

---


## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [x] F1. **Plan Compliance Audit** — `oracle`
  
  **What to do**:
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  
  **Acceptance Criteria**:
  - [ ] `/metrics` endpoint responds
  - [ ] Sentry SDK initialized
  - [ ] Proxy configuration works
  - [ ] Pandera validates data
  - [ ] No core engine changes detected
  - [ ] All evidence files present
  
  **Output**: `Must Have [5/5] | Must NOT Have [8/8] | Tasks [16/16] | VERDICT: APPROVE/REJECT`
  
  **Evidence**: `.sisyphus/evidence/f1-compliance-report.md`

- [x] F2. **Code Quality Review** — `unspecified-high`
  
  **What to do**:
  Run `pytest` + `ruff check` + `mypy`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `print()` (use logger), commented-out code, unused imports. Check for AI slop: excessive comments, over-abstraction.
  
  **Acceptance Criteria**:
  - [ ] All tests pass
  - [ ] Ruff linting passes
  - [ ] No `print()` statements (only structured logging)
  - [ ] No unused imports
  
  **Output**: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`
  
  **Evidence**: `.sisyphus/evidence/f2-quality-report.txt`

- [x] F3. **Real Manual QA** — `unspecified-high`
  
  **What to do**:
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (Sentry + Prometheus both working, proxy + metrics, etc.). Test edge cases: empty config, missing env vars, invalid data.
  
  **Acceptance Criteria**:
  - [ ] All T1-T16 QA scenarios pass
  - [ ] Integration tests pass (multi-component)
  - [ ] Edge cases handled gracefully
  
  **Output**: `Scenarios [16/16 pass] | Integration [4/4] | Edge Cases [5/5] | VERDICT`
  
  **Evidence**: `.sisyphus/evidence/f3-qa-evidence/` (directory)

- [x] F4. **Scope Fidelity Check** — `deep`
  
  **What to do**:
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  
  **Acceptance Criteria**:
  - [ ] All tasks implemented as specified
  - [ ] No feature creep detected
  - [ ] No changes to forbidden areas (core engine, DSL)
  
  **Output**: `Tasks [16/16 compliant] | Contamination [CLEAN/N issues] | VERDICT`
  
  **Evidence**: `.sisyphus/evidence/f4-scope-report.md`

---

## Commit Strategy

| Wave | Commit Message | Files |
|------|---------------|-------|
| W1 | `feat(monitoring): add Prometheus metrics endpoint` | `daemon.py`, `metrics_endpoint.py` |
| W1 | `feat(monitoring): add Sentry error tracking` | `sentry.py`, `daemon.py`, `requirements.txt` |
| W1 | `docs(monitoring): add monitoring setup documentation` | `monitoring.md`, `README.md`, `.env.example` |
| W1 | `feat(proxy): add proxy configuration schema` | `config.py` |
| W2 | `feat(proxy): implement proxy rotation logic` | `proxy_rotator.py` |
| W2 | `feat(proxy): add set_proxy action handler` | `set_proxy.py` |
| W2 | `test(proxy): add proxy integration tests` | `test_proxy_integration.py`, `proxy_server.py` |
| W2 | `docs(proxy): add proxy configuration documentation` | `crawl4ai-config.md` |
| W3 | `feat(validation): add Pandera schemas for data quality` | `schemas.py`, `requirements.txt` |
| W3 | `feat(validation): integrate Pandera at callback boundary` | `callback.py` |
| W3 | `feat(validation): add validation error handling` | `errors.py` |
| W3 | `docs(validation): add validation rules documentation` | `crawl4ai-config.md` |
| W4 | `docs(poc): add ScrapeGraphAI evaluation report` | `EVALUATION_REPORT.md` |

---

## Success Criteria

### Verification Commands

```bash
# Prometheus metrics endpoint
curl -s http://localhost:8000/metrics | grep "crawl4ai_extractions_total" && echo "✓ Metrics OK"

# Sentry SDK initialized
python -c "import sentry_sdk; sentry_sdk.init(dsn='test'); print('✓ Sentry OK')"

# Proxy rotation working
python -c "from utils.proxy_rotator import ProxyRotator; r = ProxyRotator(['http://p1:8080']); print('✓ Proxy OK')"

# Pandera validation
python -c "from validation.schemas import ScrapedResultSchema; print('✓ Pandera OK')"

# All tests pass
cd apps/scraper && pytest tests/unit/ -v --tb=short

# Linting passes
ruff check apps/scraper/src apps/scraper/scrapers
```

### Final Checklist

- [ ] All "Must Have" present (4/4)
- [ ] All "Must NOT Have" absent (8/8)
- [ ] All tests pass (pytest)
- [ ] All linting passes (ruff)
- [ ] Documentation complete (monitoring.md, crawl4ai-config.md updated)
- [ ] ScrapeGraphAI POC evaluated (decision recorded)
- [ ] Final verification wave (F1-F4) approved
- [ ] No breaking changes to existing scrapers

---

## Post-Completion Actions

After `/start-work` completes this plan:

1. **Review ScrapeGraphAI POC Report** (T15)
   - If GO: Create follow-up plan for production integration
   - If NO-GO: Archive POC directory

2. **Set up Production Monitoring**
   - Configure Prometheus to scrape `/metrics`
   - Set Sentry DSN in production environment
   - Verify alerts working

3. **Enable Proxy Support**
   - Test with Bright Data/Oxylabs credentials in staging
   - Document rotation strategy per scraper

4. **Enable Validation**
   - Set `ENABLE_PANDERA_VALIDATION=true` in production
   - Monitor validation error rates in Sentry

---

## Notes

### Skills Available for Implementation

The following skills have been installed and are available to assist with implementation:

- `web-scraping` - General web scraping patterns
- `site-crawler` - Site crawling strategies
- `playwright-explore-website` - Playwright automation
- `playwright-best-practices` - Playwright best practices
- `firecrawl` - Firecrawl AI extraction
- `langchain-architecture` - LangChain agent patterns

### External Services Required

| Service | Purpose | Cost Estimate |
|---------|---------|---------------|
| Sentry | Error tracking | Free tier: 5k errors/month |
| Prometheus | Metrics storage | Self-hosted: free |
| Bright Data | Proxy rotation | ~$5-15/GB |
| Oxylabs | Proxy rotation | ~$10-20/GB |

### Rollback Plan

If any wave causes issues:

1. **Wave 1 (Monitoring)**: Set `SENTRY_DSN=""` to disable Sentry
2. **Wave 2 (Proxy)**: Remove `proxy_config` from YAML configs
3. **Wave 3 (Validation)**: Set `ENABLE_PANDERA_VALIDATION=false`
4. **Wave 4 (ScrapeGraphAI)**: Not integrated, just delete POC directory

All changes are additive and can be disabled via environment variables.

---

*Plan generated by Prometheus with Metis consultation*
*Last updated: March 2026*
