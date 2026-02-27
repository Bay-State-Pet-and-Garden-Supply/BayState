# BayStateScraper crawl4ai Migration + GitHub Actions Deprecation

## TL;DR

> **Migrate BayStateScraper from browser-use/OpenAI to crawl4ai** while **deprecating GitHub Actions self-hosted runner integration**. The new architecture uses direct Docker-based runners with polling/realtime job dispatch (already implemented in v0.2.0) and crawl4ai's LLM-Free extraction + anti-bot capabilities.
> 
> **Deliverables**:
> - crawl4ai-powered scraper engine (`src/crawl4ai_engine/`)
> - YAML-to-crawl4ai transpiler (`lib/transpiler/`)
> - Deprecated GitHub Actions workflows (`.github/workflows/scrape.yml` deleted)
> - Migration guide for existing scraper configs
> - Cost reduction: 85-98% (OpenAI tokens → infrastructure only)
> 
> **Estimated Effort**: Large (6-8 weeks)  
> **Parallel Execution**: YES - 4 waves  
> **Critical Path**: T1 → T5 → T10 → T15 → F1-F4

---

## Context

### Original Request
Migrate BayStateScraper's AI Agentic scraper (browser-use + OpenAI) to crawl4ai to improve reliability and reduce costs. Also deprecate GitHub Actions integration in favor of the newer direct runner system.

### Interview Summary
**Key Discussions**:
- Current system uses browser-use library wrapping OpenAI GPT models for "agentic" extraction
- 1,106+ failure records showing `element_missing` errors—even AI scrapers rely on brittle selectors
- GitHub Actions workflow (`scrape.yml`) triggers Docker runs on self-hosted runners
- New v0.2.0 runner system already supports polling + Supabase Realtime (deprecates GitHub Actions need)
- User wants to: 1) Migrate to crawl4ai, 2) Deprecate GitHub Actions integration

**Research Findings**:
- crawl4ai offers LLM-Free CSS/XPath extraction (near-instant, zero API cost)
- crawl4ai has superior anti-bot features (stealth mode, fingerprint rotation)
- Issue #1754 (Docker deadlock) and #1757 (Cloudflare bypass) are known concerns
- Adaptive crawling is useful for research but not primary need for product catalogs
- Potential cost reduction: 85-98%

### Metis Review
**Identified Gaps** (addressed in plan):
- GitHub Actions deprecation needs clear migration path for existing runners
- crawl4ai Docker stability concerns require monitoring/health checks
- YAML DSL migration needs automated transpiler
- Anti-bot effectiveness must be tested against specific target sites
- Fallback strategy needed for complex sites that may still need LLM

---

## Work Objectives

### Core Objective
Replace BayStateScraper's browser-use/OpenAI extraction engine with crawl4ai's LLM-Free + anti-bot capabilities, while deprecating GitHub Actions integration in favor of direct Docker-based runners with polling/realtime dispatch.

### Concrete Deliverables
1. **crawl4ai Engine** (`src/crawl4ai_engine/`): New extraction engine using crawl4ai
2. **YAML Transpiler** (`lib/transpiler/`): Convert existing YAML configs to crawl4ai schemas
3. **Deprecated Workflows**: Remove `.github/workflows/scrape.yml`, update docs
4. **Migration Guide**: Step-by-step guide for existing scraper configs
5. **Monitoring**: Health checks for Docker stability (Issue #1754 mitigation)

### Definition of Done
- [ ] All existing scraper configs run via crawl4ai engine
- [ ] GitHub Actions `scrape.yml` workflow deleted
- [ ] 80%+ of SKUs extracted via LLM-Free strategies
- [ ] Anti-bot success rate improved vs. current system
- [ ] Cost reduction >80% validated
- [ ] All tests pass

### Must Have
- crawl4ai CSS/XPath extraction as primary strategy
- LLM fallback for truly unstructured data
- Anti-bot stealth mode enabled
- Docker health checks (Issue #1754 mitigation)
- Backward compatibility during migration

### Must NOT Have (Guardrails)
- NO continued reliance on browser-use/OpenAI for standard extraction
- NO GitHub Actions workflow_dispatch after deprecation
- NO removal of existing callback API contract
- NO breaking changes to consolidation pipeline
- NO deployment without Docker stability verification

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest in BayStateScraper)
- **Automated tests**: YES (TDD for new engine, tests-after for transpiler)
- **Framework**: pytest + Playwright mocking
- **Agent-Executed QA**: Playwright for UI validation, tmux for CLI, curl for API

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Week 1):
├── T1: crawl4ai engine scaffolding
├── T2: Project structure + dependencies
├── T3: Docker health checks (Issue #1754)
├── T4: YAML parser adaptation
└── T5: Anti-bot config module

Wave 2 (Core Implementation - Weeks 2-3):
├── T6: CSS/XPath extraction strategies
├── T7: LLM fallback integration
├── T8: YAML-to-crawl4ai transpiler
├── T9: Error handling + retries
├── T10: Integration with existing callback
└── T11: Test suite for engine

Wave 3 (Migration + Deprecation - Weeks 4-5):
├── T12: Migrate 3 pilot scrapers
├── T13: GitHub Actions deprecation
├── T14: Runner migration guide
├── T15: Documentation updates
└── T16: Monitoring dashboard updates

Wave 4 (Validation + Rollout - Weeks 6-8):
├── T17: A/B testing (crawl4ai vs old)
├── T18: Performance benchmarking
├── T19: Cost validation
├── T20: Gradual rollout (all scrapers)
└── T21: Final cleanup

Wave FINAL (Review - 4 parallel):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix

- **T1-5**: — — T6-11
- **T6-11**: 1-5 — T12-16
- **T12-16**: 6-11 — T17-21
- **T17-21**: 12-16 — F1-F4

### Agent Dispatch Summary

- **W1**: **5** tasks → `quick`, `unspecified-high`
- **W2**: **6** tasks → `deep`, `unspecified-high`, `quick`
- **W3**: **5** tasks → `writing`, `quick`, `unspecified-high`
- **W4**: **5** tasks → `unspecified-high`, `deep`
- **FINAL**: **4** tasks → `oracle`, `unspecified-high`, `deep`

---

## TODOs

- [x] **T1. crawl4ai Engine Scaffolding** ✅

  **What to do**:
  - Create `src/crawl4ai_engine/` directory structure
  - Define main crawler class interface
  - Set up async context manager pattern matching existing executor
  - Implement basic configuration loading

  **Must NOT do**:
  - Don't change existing executor interface yet
  - Don't remove browser-use code
  - Don't modify callback contract

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Reason**: Scaffolding task, simple file structure

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T6, T7, T10
  - **Blocked By**: None

  **References**:
  - `BayStateScraper/scraper_backend/scrapers/executor/workflow_executor.py` - existing interface
  - crawl4ai docs: https://docs.crawl4ai.com/api/async-webcrawler/
  - crawl4ai `AsyncWebCrawler` initialization pattern

  **Acceptance Criteria**:
  - [ ] Directory structure created
  - [ ] `Crawl4AIEngine` class with async context manager
  - [ ] Config loading from YAML
  - [ ] pytest: `test_engine_scaffolding.py` passes

  **QA Scenarios**:
  ```
  Scenario: Engine initializes correctly
    Tool: Bash (python)
    Steps:
      1. python -c "from src.crawl4ai_engine import Crawl4AIEngine; print('OK')"
    Expected: No ImportError, "OK" printed
    Evidence: .sisyphus/evidence/t1-engine-init.log
  ```

  **Commit**: YES
  - Message: `feat(crawl4ai): add engine scaffolding`
  - Files: `src/crawl4ai_engine/`

- [x] **T2. Project Dependencies + Docker Setup** ✅

  **What to do**:
  - Add crawl4ai to `requirements.txt`
  - Update `Dockerfile` with crawl4ai dependencies
  - Add browser installation for Playwright (crawl4ai uses Playwright)
  - Test Docker build locally

  **Must NOT do**:
  - Don't remove existing dependencies yet
  - Don't change base image unless necessary

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T3
  - **Blocked By**: None

  **References**:
  - `BayStateScraper/requirements.txt`
  - `BayStateScraper/Dockerfile`
  - crawl4ai installation docs

  **Acceptance Criteria**:
  - [ ] crawl4ai in requirements.txt
  - [ ] Docker build succeeds
  - [ ] crawl4ai imports work in container
  - [ ] `docker build -t baystate-scraper:test .` completes

  **QA Scenarios**:
  ```
  Scenario: Docker image builds with crawl4ai
    Tool: Bash
    Steps:
      1. docker build -t baystate-scraper:test .
      2. docker run --rm baystate-scraper:test python -c "import crawl4ai; print(crawl4ai.__version__)"
    Expected: Build succeeds, version printed
    Evidence: .sisyphus/evidence/t2-docker-build.log
  ```

  **Commit**: YES
  - Message: `deps(crawl4ai): add crawl4ai dependency`
  - Files: `requirements.txt`, `Dockerfile`

- [x] **T3. Docker Health Checks (Issue #1754 Mitigation)** ✅

  **What to do**:
  - Research crawl4ai Issue #1754 (Docker deadlock)
  - Implement container health checks
  - Add memory monitoring
  - Set up automatic restart on deadlock detection
  - Document known issue and workaround

  **Must NOT do**:
  - Don't rely solely on crawl4ai's built-in recovery
  - Don't ignore the issue (production risk)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Production stability critical

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T17 (validation)
  - **Blocked By**: T2

  **References**:
  - crawl4ai GitHub Issue #1754
  - `BayStateScraper/docker-compose.yml`
  - Docker health check documentation

  **Acceptance Criteria**:
  - [ ] Health check endpoint/script created
  - [ ] Docker Compose health check configured
  - [ ] Auto-restart on failure enabled
  - [ ] Memory limits set
  - [ ] Documentation updated with Issue #1754 workaround

  **QA Scenarios**:
  ```
  Scenario: Health check detects unhealthy container
    Tool: Bash (docker)
    Steps:
      1. Start container with health check
      2. Simulate high memory (or wait for natural condition)
      3. Check health status: docker inspect --format='{{.State.Health.Status}}' <container>
    Expected: Status transitions to "unhealthy" before deadlock
    Evidence: .sisyphus/evidence/t3-health-check.log
  ```

  **Commit**: YES
  - Message: `ops(health): add Docker health checks for crawl4ai`
  - Files: `docker-compose.yml`, `scripts/health_check.py`

- [x] **T4. YAML Parser Adaptation** ✅

  **What to do**:
  - Analyze existing YAML DSL structure
  - Create parser that reads existing configs
  - Map existing fields to crawl4ai concepts
  - Maintain backward compatibility

  **Must NOT do**:
  - Don't change existing YAML schema
  - Don't break existing configs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8 (transpiler)
  - **Blocked By**: None

  **References**:
  - `BayStateScraper/scraper_backend/scrapers/parser/yaml_parser.py`
  - `BayStateScraper/scrapers/configs/*.yaml`
  - crawl4ai schema format

  **Acceptance Criteria**:
  - [ ] Existing YAML configs parse correctly
  - [ ] Parser returns structured config object
  - [ ] All existing config variations handled
  - [ ] Tests pass for all sample configs

  **QA Scenarios**:
  ```
  Scenario: Parse existing YAML configs
    Tool: Bash (python)
    Steps:
      1. python -c "from lib.parser import parse_yaml; parse_yaml('configs/example.yaml')"
    Expected: Returns valid config object, no errors
    Evidence: .sisyphus/evidence/t4-yaml-parser.log
  ```

  **Commit**: YES
  - Message: `feat(parser): adapt YAML parser for crawl4ai`
  - Files: `lib/parser/`

- [x] **T5. Anti-Bot Configuration Module** ✅

  **What to do**:
  - Create reusable anti-bot configuration
  - Implement stealth mode settings
  - Add proxy rotation support
  - Create browser fingerprinting options
  - Document anti-bot best practices

  **Must NOT do**:
  - Don't hardcode specific site workarounds
  - Don't rely on a single anti-bot strategy

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Anti-bot is critical differentiator

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T6, T7
  - **Blocked By**: T2

  **References**:
  - `BayStateScraper/scraper_backend/core/anti_detection.py`
  - crawl4ai anti-bot docs
  - crawl4ai `BrowserConfig` stealth options

  **Acceptance Criteria**:
  - [ ] Anti-bot config module created
  - [ ] Stealth mode configurable per-scraper
  - [ ] Proxy rotation supported
  - [ ] Browser fingerprint options documented

  **QA Scenarios**:
  ```
  Scenario: Anti-bot config generates valid crawl4ai BrowserConfig
    Tool: Bash (python)
    Steps:
      1. python -c "from lib.antibot import create_config; cfg = create_config(stealth=True); print(cfg)"
    Expected: Returns valid crawl4ai BrowserConfig object
    Evidence: .sisyphus/evidence/t5-antibot-config.log
  ```

  **Commit**: YES
  - Message: `feat(antibot): add anti-bot configuration module`
  - Files: `lib/antibot/`

- [x] **T6. CSS/XPath Extraction Strategies** ✅

  **What to do**:
  - Implement `JsonCssExtractionStrategy` wrapper
  - Implement `JsonXPathExtractionStrategy` wrapper
  - Create schema generator from YAML selectors
  - Add support for nested/list fields
  - Implement sibling data extraction (`source` field)

  **Must NOT do**:
  - Don't use LLM for simple structured data
  - Don't ignore existing selector definitions

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Core extraction logic, needs thorough testing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T12
  - **Blocked By**: T1, T4, T5

  **References**:
  - crawl4ai `JsonCssExtractionStrategy` docs
  - crawl4ai `JsonXPathExtractionStrategy` docs
  - `BayStateScraper/scraper_backend/scrapers/actions/handlers/extract.py`

  **Acceptance Criteria**:
  - [ ] CSS strategy extracts data from test pages
  - [ ] XPath strategy extracts data from test pages
  - [ ] Nested structures handled correctly
  - [ ] Sibling data extraction works
  - [ ] All existing selector patterns supported

  **QA Scenarios**:
  ```
  Scenario: Extract products using CSS selectors
    Tool: Bash (python)
    Steps:
      1. Run extraction on test HTML with known product structure
      2. Validate extracted JSON matches expected schema
    Expected: All fields extracted, correct types
    Evidence: .sisyphus/evidence/t6-css-extraction.json
  ```

  **Commit**: YES
  - Message: `feat(extraction): add CSS/XPath strategies`
  - Files: `src/crawl4ai_engine/strategies/`

- [x] **T7. LLM Fallback Integration** ✅

  **What to do**:
  - Implement `LLMExtractionStrategy` for complex pages
  - Add fallback chain: CSS → XPath → LLM
  - Configure cost tracking (reuse existing `ai_cost_tracker.py`)
  - Add confidence thresholds
  - Support multiple LLM providers via LiteLLM

  **Must NOT do**:
  - Don't use LLM as primary strategy
  - Don't exceed cost thresholds
  - Don't remove existing cost tracking integration

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Cost management critical

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T12
  - **Blocked By**: T1, T5

  **References**:
  - crawl4ai `LLMExtractionStrategy` docs
  - `BayStateScraper/scrapers/ai_cost_tracker.py`
  - `BayStateScraper/scrapers/actions/handlers/ai_extract.py`
  - LiteLLM provider docs

  **Acceptance Criteria**:
  - [ ] LLM fallback triggers when CSS/XPath fails
  - [ ] Cost tracked per extraction
  - [ ] Budget enforcement works
  - [ ] Multiple providers supported
  - [ ] Confidence threshold respected

  **QA Scenarios**:
  ```
  Scenario: LLM fallback extracts unstructured data
    Tool: Bash (python)
    Steps:
      1. Configure scraper with CSS strategy (will fail on test page)
      2. Enable LLM fallback
      3. Run extraction
    Expected: CSS fails, LLM succeeds, cost tracked
    Evidence: .sisyphus/evidence/t7-llm-fallback.log
  ```

  **Commit**: YES
  - Message: `feat(llm): add LLM fallback with cost tracking`
  - Files: `src/crawl4ai_engine/strategies/llm_fallback.py`

- [x] **T8. YAML-to-crawl4ai Transpiler** ✅

  **What to do**:
  - Build automated transpiler from YAML DSL to crawl4ai schemas
  - Handle all YAML config variations
  - Generate Python code or runtime schemas
  - Add validation and error reporting
  - Create migration CLI command

  **Must NOT do**:
  - Don't require manual rewriting of all configs
  - Don't break configs that can't be transpiled (flag for manual review)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Complex transformation logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T12
  - **Blocked By**: T4, T6, T7

  **References**:
  - `BayStateScraper/scrapers/configs/*.yaml` - all existing configs
  - crawl4ai schema format examples
  - `lib/transpiler/` (new)

  **Acceptance Criteria**:
  - [ ] Transpiler handles 80%+ of existing configs automatically
  - [ ] Remaining 20% flagged for manual review
  - [ ] Generated schemas are valid crawl4ai configs
  - [ ] CLI command: `python -m transpiler migrate <config.yaml>`

  **QA Scenarios**:
  ```
  Scenario: Transpile existing YAML to crawl4ai schema
    Tool: Bash (python)
    Steps:
      1. python -m transpiler migrate configs/walmart.yaml --output test_output.py
      2. Validate output is valid Python with crawl4ai schema
    Expected: Valid schema generated, no errors
    Evidence: .sisyphus/evidence/t8-transpiler-output.py
  ```

  **Commit**: YES
  - Message: `feat(transpiler): add YAML-to-crawl4ai transpiler`
  - Files: `lib/transpiler/`

- [x] **T9. Error Handling + Retries** ✅

  **What to do**:
  - Implement retry logic with exponential backoff
  - Add circuit breaker pattern
  - Handle crawl4ai-specific errors
  - Integrate with existing failure classifier
  - Add detailed error logging

  **Must NOT do**:
  - Don't remove existing retry logic until verified
  - Don't ignore anti-bot detection errors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T10, T11
  - **Blocked By**: T1

  **References**:
  - `BayStateScraper/scrapers/ai_retry.py`
  - `BayStateScraper/scraper_backend/core/retry.py`
  - crawl4ai error handling patterns

  **Acceptance Criteria**:
  - [ ] Retry logic handles transient failures
  - [ ] Circuit breaker prevents cascade failures
  - [ ] crawl4ai errors classified correctly
  - [ ] Error logs include context for debugging

  **QA Scenarios**:
  ```
  Scenario: Retry on transient failure
    Tool: Bash (python)
    Steps:
      1. Mock crawl4ai to fail twice then succeed
      2. Run extraction
    Expected: Retries twice, then succeeds
    Evidence: .sisyphus/evidence/t9-retry.log
  ```

  **Commit**: YES
  - Message: `feat(retry): add error handling and retries`
  - Files: `src/crawl4ai_engine/retry.py`

- [x] **T10. Integration with Existing Callback API** ✅

  **What to do**:
  - Ensure crawl4ai engine outputs match existing callback format
  - Implement result transformation if needed
  - Maintain HMAC signature generation
  - Test end-to-end flow with BayStateApp callback
  - Verify idempotency handling

  **Must NOT do**:
  - Don't change callback API contract
  - Don't break existing BayStateApp integration

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Reason**: Critical integration point

  **Parallelization**:
  - **Can Run In Parallel**: YES (early)
  - **Parallel Group**: Wave 2
  - **Blocks**: T12, T17
  - **Blocked By**: T1, T9

  **References**:
  - `BayStateApp/app/api/admin/scraping/callback/route.ts`
  - `BayStateScraper/lib/callback.py`
  - `BayStateScraper/lib/scraper-auth.py`

  **Acceptance Criteria**:
  - [ ] crawl4ai output format matches callback expectations
  - [ ] HMAC signatures generated correctly
  - [ ] End-to-end test passes
  - [ ] Idempotency keys handled

  **QA Scenarios**:
  ```
  Scenario: Callback receives crawl4ai results
    Tool: Bash (curl + python)
    Steps:
      1. Start local callback server (mock)
      2. Run crawl4ai extraction
      3. Verify callback receives valid payload with HMAC signature
    Expected: Valid callback, correct signature
    Evidence: .sisyphus/evidence/t10-callback.log
  ```

  **Commit**: YES
  - Message: `feat(integration): wire crawl4ai to callback API`
  - Files: `src/crawl4ai_engine/callback.py`

- [x] **T11. Test Suite for Engine** ✅

  **What to do**:
  - Write comprehensive unit tests for crawl4ai engine
  - Add integration tests with mocked crawl4ai
  - Create test fixtures for various page types
  - Test error conditions and edge cases
  - Achieve 80%+ coverage

  **Must NOT do**:
  - Don't skip testing anti-bot logic
  - Don't ignore error paths

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T17
  - **Blocked By**: T6, T7, T9, T10

  **References**:
  - `BayStateScraper/tests/unit/`
  - pytest documentation
  - Playwright mocking patterns

  **Acceptance Criteria**:
  - [ ] Unit tests for all engine components
  - [ ] Integration tests for full flow
  - [ ] Test fixtures for 5+ page types
  - [ ] 80%+ code coverage
  - [ ] CI passes

  **QA Scenarios**:
  ```
  Scenario: Test suite passes
    Tool: Bash
    Steps:
      1. cd BayStateScraper && python -m pytest tests/unit/crawl4ai_engine/ -v
    Expected: All tests pass, coverage >80%
    Evidence: .sisyphus/evidence/t11-test-results.xml
  ```

  **Commit**: YES
  - Message: `test(engine): add comprehensive test suite`
  - Files: `tests/unit/crawl4ai_engine/`

- [x] **T12. Migrate 3 Pilot Scrapers** ✅

  **What to do**:
  - Select 3 problematic scrapers from failure logs
  - Run transpiler on each config
  - Fix any transpilation issues
  - Test against live sites
  - Document migration process

  **Must NOT do**:
  - Don't migrate all scrapers at once (risky)
  - Don't skip manual review of transpiled configs

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Production sites, needs care

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential for safety)
  - **Parallel Group**: Wave 3
  - **Blocks**: T20
  - **Blocked By**: T8, T10, T11

  **References**:
  - `BayStateScraper/data/analytics/failure_records.json` - pick top 3 failures
  - `BayStateScraper/scrapers/configs/`
  - Pilot migration results

  **Acceptance Criteria**:
  - [ ] 3 pilot scrapers migrated
  - [ ] Each tested against live site
  - [ ] Success rate >= current system
  - [ ] Cost reduction validated per scraper
  - [ ] Migration issues documented

  **QA Scenarios**:
  ```
  Scenario: Pilot scraper extracts successfully
    Tool: Bash (curl)
    Steps:
      1. Deploy migrated scraper to staging
      2. Trigger test run
      3. Verify results in BayStateApp
    Expected: Products ingested, no errors
    Evidence: .sisyphus/evidence/t12-pilot-results.json
  ```

  **Commit**: YES (per scraper)
  - Message: `migrate(scraper): migrate <retailer> to crawl4ai`
  - Files: `scrapers/configs/<retailer>.yaml`

- [x] **T13. GitHub Actions Deprecation** ✅

  **What to do**:
  - Delete `.github/workflows/scrape.yml`
  - Update documentation to remove GitHub Actions references
  - Add deprecation notice to CHANGELOG
  - Update runner setup guide
  - Verify no code references `workflow_dispatch`

  **Must NOT do**:
  - Don't delete `cd.yml` (still needed for Docker builds)
  - Don't break existing runner deployments
  - Don't remove until direct runners confirmed working

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None (cleanup)
  - **Blocked By**: T12 (verify direct runners work)

  **References**:
  - `.github/workflows/scrape.yml` - DELETE THIS
  - `.github/workflows/cd.yml` - KEEP THIS
  - `BayStateScraper/docs/runner-setup.md`
  - `BayStateApp/docs/runner-setup.md`

  **Acceptance Criteria**:
  - [ ] `scrape.yml` deleted
  - [ ] Documentation updated
  - [ ] CHANGELOG updated
  - [ ] No `workflow_dispatch` references in codebase
  - [ ] CI still passes (cd.yml intact)

  **QA Scenarios**:
  ```
  Scenario: GitHub Actions scrape workflow removed
    Tool: Bash
    Steps:
      1. ls .github/workflows/
      2. grep -r "workflow_dispatch" --include="*.yml" .github/
    Expected: scrape.yml gone, no workflow_dispatch for scraping
    Evidence: .sisyphus/evidence/t13-gha-removed.log
  ```

  **Commit**: YES
  - Message: `chore(gha): deprecate GitHub Actions scrape workflow`
  - Files: `.github/workflows/scrape.yml` (deleted)

- [x] **T14. Runner Migration Guide** ✅

  **What to do**:
  - Write migration guide for existing GitHub Actions users
  - Document new direct runner setup
  - Create troubleshooting section
  - Add FAQ for common issues
  - Include rollback instructions

  **Must NOT do**:
  - Don't assume all users are technical
  - Don't skip rollback procedures

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T13

  **References**:
  - `BayStateScraper/README.md`
  - `BayStateScraper/docs/`
  - `BayStateApp/docs/runner-setup.md`

  **Acceptance Criteria**:
  - [ ] Migration guide created
  - [ ] Direct runner setup documented
  - [ ] Troubleshooting section complete
  - [ ] FAQ covers 10+ common questions
  - [ ] Rollback instructions clear

  **QA Scenarios**:
  ```
  Scenario: Migration guide is complete
    Tool: Read
    Steps:
      1. Read docs/migration-guide.md
      2. Verify all sections present
    Expected: Complete guide with examples
    Evidence: .sisyphus/evidence/t14-guide.md
  ```

  **Commit**: YES
  - Message: `docs(migration): add runner migration guide`
  - Files: `docs/migration-guide.md`

- [x] **T15. Documentation Updates** ✅

  **What to do**:
  - Update main README with crawl4ai info
  - Update architecture docs
  - Document new YAML schema options
  - Update API documentation
  - Add crawl4ai-specific configuration guide

  **Must NOT do**:
  - Don't leave stale references to browser-use
  - Don't remove old docs (archive them)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T12

  **References**:
  - `BayStateScraper/README.md`
  - `BayStateScraper/docs/ARCHITECTURE.md`
  - `BayStateScraper/docs/ai-scraper.md` - update or archive

  **Acceptance Criteria**:
  - [ ] README updated
  - [ ] Architecture docs current
  - [ ] YAML schema documented
  - [ ] crawl4ai config guide complete
  - [ ] Old docs archived with deprecation notices

  **QA Scenarios**:
  ```
  Scenario: Documentation is accurate
    Tool: Read
    Steps:
      1. Review README and key docs
      2. Verify no stale browser-use references
    Expected: All docs reference crawl4ai
    Evidence: .sisyphus/evidence/t15-docs-review.md
  ```

  **Commit**: YES
  - Message: `docs: update all documentation for crawl4ai`
  - Files: `README.md`, `docs/`

- [x] **T16. Monitoring Dashboard Updates** ✅

  **What to do**:
  - Update BayStateApp monitoring to track crawl4ai metrics
  - Add LLM vs LLM-Free extraction ratio
  - Track crawl4ai-specific errors
  - Update cost tracking for new pricing model
  - Add anti-bot effectiveness metrics

  **Must NOT do**:
  - Don't remove existing metrics (backward compatibility)
  - Don't break existing dashboards

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: T10

  **References**:
  - `BayStateApp/components/admin/scraping/`
  - `BayStateApp/lib/admin/scrapers.ts`
  - `BayStateApp/hooks/use-job-stats.ts`

  **Acceptance Criteria**:
  - [ ] Dashboard shows crawl4ai metrics
  - [ ] LLM vs LLM-Free ratio visible
  - [ ] Cost tracking updated
  - [ ] Anti-bot metrics added

  **QA Scenarios**:
  ```
  Scenario: Dashboard displays crawl4ai metrics
    Tool: Playwright
    Steps:
      1. Navigate to admin/scrapers
      2. Verify crawl4ai stats visible
    Expected: Metrics displayed correctly
    Evidence: .sisyphus/evidence/t16-dashboard.png
  ```

  **Commit**: YES
  - Message: `feat(dashboard): add crawl4ai monitoring metrics`
  - Files: `components/admin/scraping/`

- [ ] **T17. A/B Testing (crawl4ai vs Old)**

  **What to do**:
  - Set up A/B test comparing crawl4ai vs browser-use
  - Run parallel extractions on same SKUs
  - Compare success rates, speed, cost
  - Document differences
  - Make go/no-go decision

  **Must NOT do**:
  - Don't skip A/B testing (validation critical)
  - Don't use different SKUs (apples-to-apples)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Production validation

  **Parallelization**:
  - **Can Run In Parallel**: NO (requires coordination)
  - **Parallel Group**: Wave 4
  - **Blocks**: T20
  - **Blocked By**: T3, T11, T12, T16

  **References**:
  - Pilot scraper results from T12
  - `BayStateScraper/data/analytics/`
  - Existing success rate baselines

  **Acceptance Criteria**:
  - [ ] A/B test plan created
  - [ ] 100+ SKUs tested in parallel
  - [ ] Success rates compared
  - [ ] Cost savings validated
  - [ ] Go/no-go decision documented

  **QA Scenarios**:
  ```
  Scenario: A/B test completes successfully
    Tool: Bash
    Steps:
      1. Run A/B test script
      2. Generate comparison report
    Expected: Report shows crawl4ai success >= old, cost < old
    Evidence: .sisyphus/evidence/t17-ab-test-report.md
  ```

  **Commit**: YES
  - Message: `test(ab): add A/B testing results`
  - Files: `docs/ab-test-results.md`

- [ ] **T18. Performance Benchmarking**

  **What to do**:
  - Benchmark crawl4ai vs old system performance
  - Measure extraction time per SKU
  - Test concurrent extraction limits
  - Profile memory usage
  - Document performance characteristics

  **Must NOT do**:
  - Don't benchmark on different hardware
  - Don't ignore memory leaks (Issue #1754)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T12

  **References**:
  - crawl4ai performance docs
  - `BayStateScraper/tests/performance/`

  **Acceptance Criteria**:
  - [ ] Benchmark suite created
  - [ ] Per-SKU timing data collected
  - [ ] Concurrent limits determined
  - [ ] Memory profiling completed
  - [ ] Performance report generated

  **QA Scenarios**:
  ```
  Scenario: Benchmark shows acceptable performance
    Tool: Bash (python)
    Steps:
      1. python -m pytest tests/performance/ --benchmark-only
      2. Review benchmark results
    Expected: crawl4ai speed >= old system
    Evidence: .sisyphus/evidence/t18-benchmark.json
  ```

  **Commit**: YES
  - Message: `perf(benchmark): add performance benchmarks`
  - Files: `tests/performance/`

- [ ] **T19. Cost Validation**

  **What to do**:
  - Calculate actual cost reduction achieved
  - Compare OpenAI spend before/after
  - Factor in infrastructure costs
  - Project annual savings
  - Document ROI

  **Must NOT do**:
  - Don't ignore infrastructure cost increases
  - Don't project unrealistic savings

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T12

  **References**:
  - OpenAI billing dashboard
  - `BayStateScraper/scrapers/ai_cost_tracker.py` data
  - Infrastructure cost estimates

  **Acceptance Criteria**:
  - [ ] Cost data collected
  - [ ] Savings calculated
  - [ ] ROI projected
  - [ ] Report shared with stakeholders

  **QA Scenarios**:
  ```
  Scenario: Cost validation shows savings
    Tool: Read (spreadsheet)
    Steps:
      1. Review cost-comparison.xlsx
      2. Verify calculations
    Expected: Savings >= 80% validated
    Evidence: .sisyphus/evidence/t19-cost-validation.xlsx
  ```

  **Commit**: NO (data only)

- [ ] **T20. Gradual Rollout (All Scrapers)**

  **What to do**:
  - Roll out crawl4ai to remaining scrapers
  - Use transpiler for bulk migration
  - Monitor success rates
  - Fix issues as they arise
  - Archive old browser-use code

  **Must NOT do**:
  - Don't migrate all at once
  - Don't delete old code until 100% migrated

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Reason**: Production rollout

  **Parallelization**:
  - **Can Run In Parallel**: NO (batch for safety)
  - **Parallel Group**: Wave 4
  - **Blocks**: T21
  - **Blocked By**: T17

  **References**:
  - All configs in `scrapers/configs/`
  - Transpiler from T8
  - Migration guide from T14

  **Acceptance Criteria**:
  - [ ] All scrapers migrated
  - [ ] Success rates maintained
  - [ ] No critical issues
  - [ ] Old code archived

  **QA Scenarios**:
  ```
  Scenario: All scrapers migrated
    Tool: Bash
    Steps:
      1. Count migrated configs
      2. Verify no browser-use references
    Expected: 100% migrated
    Evidence: .sisyphus/evidence/t20-rollout-complete.log
  ```

  **Commit**: YES (per batch)
  - Message: `migrate(all): complete crawl4ai migration`
  - Files: `scrapers/configs/`

- [ ] **T21. Final Cleanup**

  **What to do**:
  - Remove browser-use dependencies
  - Archive old AI action handlers
  - Clean up unused code
  - Final documentation review
  - Celebrate completion

  **Must NOT do**:
  - Don't delete anything still referenced
  - Don't skip final testing

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: T20

  **References**:
  - `BayStateScraper/scrapers/actions/handlers/ai_*.py`
  - `requirements.txt`
  - `Dockerfile`

  **Acceptance Criteria**:
  - [ ] browser-use removed from requirements
  - [ ] Old AI handlers archived
  - [ ] No unused code
  - [ ] Final tests pass
  - [ ] Documentation complete

  **QA Scenarios**:
  ```
  Scenario: Cleanup complete
    Tool: Bash
    Steps:
      1. grep -r "browser-use" --include="*.txt" --include="*.py"
      2. Run full test suite
    Expected: No browser-use references, all tests pass
    Evidence: .sisyphus/evidence/t21-cleanup.log
  ```

  **Commit**: YES
  - Message: `chore(cleanup): remove browser-use and old code`
  - Files: Multiple

---

## Final Verification Wave

- [ ] **F1. Plan Compliance Audit** — `oracle`
  Read plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] **F2. Code Quality Review** — `unspecified-high`
  Run `ruff check .`, `mypy scraper_backend/`, `python -m pytest`. Review all changed files for: `as any`, bare `except:`, `print()` statements, unused imports. Check AI slop patterns.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] **F3. Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Execute EVERY QA scenario from EVERY task. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] **F4. Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **W1**: `feat(crawl4ai): <description>` — foundation files
- **W2**: `feat(engine): <description>` — core implementation
- **W3**: `migrate(scraper): <retailer>` + `chore(gha): deprecate` — migration + cleanup
- **W4**: `test(ab):`, `perf(benchmark):`, `migrate(all):` — validation + rollout
- **Cleanup**: `chore(cleanup): <description>` — final removal

---

## Success Criteria

### Verification Commands
```bash
# In BayStateScraper/
ruff check .                    # Expected: 0 errors
mypy scraper_backend/           # Expected: 0 errors
python -m pytest               # Expected: All pass
docker build -t baystate-scraper:test .  # Expected: Success

# crawl4ai specific
python -c "from src.crawl4ai_engine import Crawl4AIEngine; print('OK')"
grep -r "browser-use" --include="*.txt" --include="*.py"  # Expected: No matches
ls .github/workflows/scrape.yml  # Expected: File not found (deprecated)
```

### Final Checklist
- [ ] All 21 tasks complete
- [ ] All 4 final verification agents approve
- [ ] GitHub Actions scrape.yml deleted
- [ ] crawl4ai engine functional
- [ ] 80%+ cost reduction validated
- [ ] All scrapers migrated
- [ ] Documentation complete
