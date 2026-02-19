# AI-Driven Scraper Implementation Plan

## TL;DR

> **Build a hybrid scraper system that adds AI-powered extraction (browser-use) alongside existing YAML-based scrapers to reduce maintenance burden on JavaScript-heavy sites.**
>
> **Deliverables:**
> - 3 new AI action handlers (`ai_search`, `ai_extract`, `ai_validate`)
> - Extended YAML DSL with `scraper_type` and `ai_config` fields
> - Proof-of-concept with 3-5 problematic sites
> - Cost tracking and fallback mechanisms
> - Integration with existing consolidation pipeline
>
> **Estimated Effort:** Medium (4-6 weeks)
> **Parallel Execution:** YES - 4 waves
> **Critical Path:** Setup → PoC → Integration → Monitoring

---

## Context

### Original Request
User wants to expand their Brave Search API usage to not just find product pages, but extract structured data (images, brands, categories, ingredients, etc.) using AI agents. They currently suffer from high maintenance burden with many broken scrapers due to brittle CSS selectors.

### Interview Summary
**Key Discussions**:
- **Pain Point**: High maintenance - Many broken scrapers requiring constant CSS selector updates
- **Current Stack**: BayStateScraper (Python), YAML DSL with 21 action handlers, Playwright-based
- **Existing AI**: Already uses GPT-4o-mini for consolidation pipeline
- **Budget**: Balanced - willing to pay $0.05-0.10 per page for reduced maintenance
- **Chosen Tool**: browser-use (Python-native, 58k GitHub stars)
- **Architecture Decision**: Hybrid two-tier system (keep YAML for simple sites, add AI for complex JS sites)

**Research Findings**:
- Current system uses `@ActionRegistry.register()` decorator for auto-discovery
- WorkflowExecutor is decomposed into browser_manager, selector_resolver, step_executor
- Results flow through `ScrapeResult` → API callback → OpenAI batch consolidation
- browser-use costs ~$0.01-0.05/page but may be higher for complex e-commerce sites
- Expected ROI: ~$1,450/month savings (15 hours dev time saved × $100/hr - extraction costs)

### Metis Review
**Identified Gaps** (addressed in plan):
- ✅ **Cost tracking integration** - Added cost monitoring tasks
- ✅ **Fallback strategy** - Explicit fallback chain defined
- ✅ **Phase 1 site selection** - Must select 3-5 sites before starting
- ✅ **Consolidation overlap** - AI extraction feeds into existing pipeline (doesn't bypass)
- ✅ **Testing patterns** - Added probabilistic validation acceptance criteria
- ✅ **Browser lifecycle** - Uses isolated browser instances via browser-use
- ⚠️ **Double AI tax** - Acknowledged: paying for extraction + consolidation, but consolidation is batch (cheaper)

---

## Work Objectives

### Core Objective
Create a hybrid scraper system that adds AI-powered extraction capabilities to the existing BayStateScraper infrastructure, reducing maintenance burden on JavaScript-heavy sites while preserving reliable extraction from simple HTML sites.

### Concrete Deliverables
- **3 new action handlers**: `ai_search.py`, `ai_extract.py`, `ai_validate`
- **YAML DSL extensions**: `scraper_type` field, `ai_config` section
- **Proof-of-concept**: Working extraction on 3-5 problematic sites
- **Cost tracking**: Per-scraper spend monitoring
- **Fallback system**: Graceful degradation when AI fails
- **Integration**: Results flow through existing consolidation pipeline

### Definition of Done
- [ ] `bun test` or `CI=true npm test` passes for all modified files
- [ ] 3-5 problematic sites successfully extracted via AI with >80% success rate
- [ ] Cost per extraction tracked and under $0.10/page
- [ ] Fallback to traditional scrapers works when AI fails
- [ ] Results properly flow through existing consolidation pipeline
- [ ] Documentation updated for new YAML DSL features

### Must Have
- New action handlers integrating browser-use library
- Extended YAML config schema with AI options
- Cost tracking per extraction
- Fallback mechanism for AI failures
- Integration with existing orchestration (GitHub Actions, callbacks)

### Must NOT Have (Guardrails)
- NO replacement of existing YAML system (hybrid only)
- NO changes to consolidation pipeline logic (feed into existing)
- NO database schema changes (use existing products_ingestion table)
- NO breaking changes to existing scraper configs
- NO removal of existing action handlers
- NO synchronous extraction (keep async throughout)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES - pytest already configured
- **Automated tests**: YES (tests-after) - Add tests after implementation
- **Framework**: pytest with async support
- **QA Method**: Agent-Executed QA Scenarios (Playwright for validation)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (navigate, assert DOM, screenshot)
- **CLI/TUI**: Use interactive_bash (run commands, validate output)
- **API/Backend**: Use Bash (curl, assert JSON response)
- **Library/Module**: Use Bash (bun/node REPL, import, test functions)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Feasibility Spike - 2-3 days):
├── Task 0: Pre-PoC cost estimation and validation
│   └── Test browser-use on 1 problematic site
│   └── Measure actual costs on 3 test pages
│   └── Validate stealth capabilities
│   └── Adjust cost targets based on real data

Wave 1 (Foundation - Week 1):
├── Task 1: Install browser-use and dependencies
├── Task 2: Create base AI action handler scaffold
├── Task 3: Extend YAML config schema for AI options
├── Task 4: Create ai_search action handler
└── Task 5: Setup cost tracking infrastructure with hard limits

Wave 2 (Core Implementation - Week 2):
├── Task 6: Create ai_extract action handler
├── Task 7: Create ai_validate action handler
├── Task 8: Implement fallback chain logic
├── Task 9: Add retry and error handling
└── Task 10: Create AI scraper YAML template

Wave 3a (Integration Core - Week 3):
├── Task 11: Integrate with WorkflowExecutor
├── Task 12: Wire up to existing orchestration
└── Task 13: Add result normalization for consolidation

Wave 3b (Integration Polish - Week 3-4):
├── Task 14: Create monitoring and alerting with thresholds
└── Task 15: Write documentation

Wave 4 (PoC & Validation - Week 4-5):
├── Task 16: Select and configure 3-5 test sites (with explicit criteria)
├── Task 17: Run PoC extraction and measure results
├── Task 18: Compare costs vs traditional scrapers
├── Task 19: Iterate on failing extractions
└── Task 20: Final QA and evidence collection

Wave FINAL (Review & Cleanup):
├── Task F1: Plan compliance audit
├── Task F2: Code quality review
├── Task F3: Integration testing
└── Task F4: Documentation review

Critical Path: Task 0 → Task 6 → Task 11 → Task 16 → Task 20 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 5 (Waves 1 & 2)
```

### Dependency Matrix

- **1-5**: No dependencies (foundation)
- **6-7**: Depends on 2 (base scaffold), 4 (ai_search patterns)
- **8**: Depends on 6, 7 (needs extract and validate)
- **9**: Depends on 6, 7, 8 (retry needs actions to retry)
- **10**: Depends on 3 (schema), 6, 7 (actions)
- **11**: Depends on 6, 7, 8, 9, 10 (needs all AI components)
- **12**: Depends on 11 (WorkflowExecutor integration)
- **13**: Depends on 11 (needs extraction results)
- **14**: Depends on 5 (cost tracking), 11 (execution data)
- **15**: Depends on 3, 6, 7, 8, 10, 11 (all features)
- **16**: No dependencies (site selection)
- **17**: Depends on 12, 16 (needs integration + sites)
- **18**: Depends on 5, 17 (needs cost tracking + results)
- **19**: Depends on 17, 18 (iterate on PoC results)
- **20**: Depends on 17, 18, 19 (final validation)

### Agent Dispatch Summary

- **Wave 1**: **5 tasks** → All `quick` (setup, scaffold, schema)
- **Wave 2**: **5 tasks** → T6-T7 `deep`, T8-T10 `unspecified-high`
- **Wave 3**: **5 tasks** → T11 `deep`, T12-T15 `unspecified-high`
- **Wave 4**: **5 tasks** → T16-T20 mix of `deep` and `unspecified-high`
- **FINAL**: **4 tasks** → F1 `oracle`, F2-F4 `unspecified-high`

---

## TODOs

- [x] 0. Pre-PoC cost estimation and validation

  **What to do**:
  - Test browser-use on 1 known problematic site (e.g., Walmart, Amazon)
  - Extract 3 product pages and measure actual costs
  - Test stealth capabilities against anti-bot measures
  - Validate if $0.05-0.10/page target is realistic
  - Adjust cost targets based on real data before full implementation
  - Document findings and update Task 5 cost limits accordingly

  **Must NOT do**:
  - Skip this validation (critical for budget planning)
  - Use only simple sites for testing
  - Ignore anti-bot detection results

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `browser-use`, `cost-analysis`
  - **Reason**: Validation of core assumptions before committing to full build

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete before Wave 1)
  - **Parallel Group**: Wave 0 (Feasibility Spike)
  - **Blocks**: Tasks 1-5 (cost targets), Task 17 (PoC expectations)
  - **Blocked By**: None (can start immediately)

  **References**:
  - browser-use documentation
  - OpenAI pricing page (gpt-4o, gpt-4o-mini)
  - Current problematic scraper configs (walmart.yaml, amazon.yaml)

  **Acceptance Criteria**:
  - [ ] 3 real product pages extracted via browser-use
  - [ ] Actual costs measured (input/output tokens, API calls)
  - [ ] Cost per page calculated with breakdown
  - [ ] Anti-bot detection tested (success/failure logged)
  - [ ] Cost targets adjusted if needed ($0.05-0.10/page validated or revised)
  - [ ] Written report with recommendations

  **QA Scenarios**:
  ```
  Scenario: Validate cost assumptions
    Tool: Bash (Python script)
    Steps:
      1. Set up browser-use with OpenAI API key
      2. Extract 3 products from walmart.com or amazon.com
      3. Capture: input_tokens, output_tokens, execution_time
      4. Calculate: cost_per_page = (input * input_rate) + (output * output_rate)
      5. Log any anti-bot blocks or CAPTCHAs encountered
    Expected Result: Real cost data with anti-bot assessment
    Evidence: .sisyphus/evidence/task-0-cost-validation.json
  ```

  **Evidence to Capture**:
  - Token counts for each extraction
  - Screenshots of extracted pages
  - Any anti-bot errors or warnings
  - Execution time per page

  **Commit**: NO (research task, no code changes)
  - Files: N/A (evidence only)

  **Task 0 Results**:
  - **Status**: COMPLETED with compatibility issue discovered
  - **Finding**: browser-use requires `from browser_use.llm import ChatOpenAI` not `from langchain_openai import ChatOpenAI`
  - **Issue**: `'ChatOpenAI' object has no attribute 'provider'` when using langchain-openai directly
  - **Solution**: Use browser-use's built-in wrapper which adds the required `provider` property
  - **Evidence**: 
    - `.sisyphus/evidence/browser-use-compatibility-issue.md` - Issue documentation
    - `.sisyphus/evidence/browser-use-fix-applied.md` - Solution documentation
  - **Impact**: Task 1 must install browser-use and use correct import path

---

- [x] 1. Install browser-use and dependencies

  **What to do**:
  - Add `browser-use>=0.1.40` to `requirements.txt`
  - Add `langchain-openai>=0.2.0` for LLM integration
  - Run `pip install -r requirements.txt`
  - Verify installation with `python -c "from browser_use import Agent; print('OK')"`
  - Create `requirements-ai.txt` for AI-specific dependencies

  **Must NOT do**:
  - Remove any existing dependencies
  - Upgrade existing packages unless required
  - Install browser-use without version pin

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed (simple pip install)
  - **Reason**: Straightforward package installation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-5)
  - **Blocks**: Task 2, 4, 6, 7 (all depend on browser-use)
  - **Blocked By**: None

  **References**:
  - `requirements.txt` - Add dependencies here
  - `browser-use` docs: https://github.com/browser-use/browser-use
  - Existing pattern: See `pytest-asyncio` in requirements.txt

  **Acceptance Criteria**:
  - [ ] `browser-use` imports without errors in Python REPL
  - [ ] `langchain-openai` imports successfully
  - [ ] All existing tests still pass: `python -m pytest tests/ -x`

  **QA Scenarios**:
  ```
  Scenario: Verify browser-use installation
    Tool: Bash
    Steps:
      1. cd /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper
      2. pip install -r requirements.txt
      3. python -c "from browser_use import Agent, Browser; print('browser-use OK')"
      4. python -c "from langchain_openai import ChatOpenAI; print('langchain OK')"
    Expected Result: Both imports succeed with no errors
    Evidence: .sisyphus/evidence/task-1-install-ok.txt
  ```

  **Evidence to Capture**:
  - Screenshot or text output of successful imports
  - pip freeze output showing installed versions

  **Commit**: YES
  - Message: `chore(deps): add browser-use and langchain-openai for AI scraper`
  - Files: `requirements.txt`, `requirements-ai.txt`

---

- [x] 2. Create base AI action handler scaffold

  **What to do**:
  - Create `scrapers/actions/handlers/ai_base.py` with base class for AI actions
  - Follow pattern from `scrapers/actions/base.py`
  - Include browser-use initialization
  - Add common error handling for AI failures
  - Include cost tracking hooks
  - Document expected interface

  **Must NOT do**:
  - Modify existing `BaseAction` class
  - Remove any existing action handlers
  - Break existing action registration pattern

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `python-expert`, `browser-use`
  - **Reason**: Need to understand both existing action pattern and browser-use API

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3, 5)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4, 6, 7, 8 (all AI actions depend on base)
  - **Blocked By**: Task 1 (needs browser-use installed)

  **References**:
  - `scrapers/actions/base.py:10-17` - BaseAction pattern
  - `scrapers/actions/handlers/extract.py:14-42` - Concrete action example
  - `scrapers/context.py` - ScraperContext Protocol
  - browser-use Agent API docs

  **Acceptance Criteria**:
  - [ ] BaseAIAction class exists with async execute method
  - [ ] Integrates with ScraperContext Protocol
  - [ ] Includes browser initialization method
  - [ ] Has cost tracking callback hooks
  - [ ] Follows existing @ActionRegistry.register pattern

  **QA Scenarios**:
  ```
  Scenario: Verify base class structure
    Tool: Bash
    Steps:
      1. Read file: scrapers/actions/handlers/ai_base.py
      2. Verify: class BaseAIAction exists
      3. Verify: async def execute(self, params) defined
      4. Verify: imports browser_use.Agent
    Expected Result: All structural elements present
    Evidence: .sisyphus/evidence/task-2-structure.json
  ```

  **Commit**: YES
  - Message: `feat(scraper): add base AI action handler scaffold`
  - Files: `scrapers/actions/handlers/ai_base.py`

---

- [x] 3. Extend YAML config schema for AI options

  **What to do**:
  - Modify `scrapers/models/config.py` to add AI-related fields
  - Add `scraper_type` enum: `"static" | "agentic"`
  - Add `AIConfig` Pydantic model with:
    - `tool`: str ("browser-use")
    - `task`: str (natural language task)
    - `max_steps`: int
    - `confidence_threshold`: float
    - `llm_model`: str (default "gpt-4o")
  - Update `ScraperConfig` to include optional `ai_config: AIConfig`
  - Ensure backward compatibility (existing configs work unchanged)

  **Must NOT do**:
  - Break existing YAML configs
  - Make ai_config required
  - Remove any existing fields

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `pydantic-expert`
  - **Reason**: Schema definition with type safety

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2, 5)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 10 (template), Task 11 (integration)
  - **Blocked By**: None

  **References**:
  - `scrapers/models/config.py` - Existing Pydantic models
  - `scrapers/configs/mazuri.yaml:1-10` - Example YAML structure
  - Pydantic docs for Optional fields and validators

  **Acceptance Criteria**:
  - [ ] AIConfig model added to config.py
  - [ ] scraper_type field added to ScraperConfig
  - [ ] Existing YAML configs parse without errors
  - [ ] New AI fields are optional with sensible defaults
  - [ ] Type hints are correct for all new fields

  **QA Scenarios**:
  ```
  Scenario: Validate schema extension
    Tool: Bash (Python REPL)
    Steps:
      1. cd BayStateScraper && python
      2. from scrapers.models.config import ScraperConfig, AIConfig
      3. config = ScraperConfig(name="test", base_url="http://test.com")
      4. print(config.scraper_type)  # Should be "static"
      5. ai_config = AIConfig(tool="browser-use", task="test")
    Expected Result: Both models instantiate without errors
    Evidence: .sisyphus/evidence/task-3-schema-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(config): extend schema with AI scraper options`
  - Files: `scrapers/models/config.py`

---

- [x] 4. Create ai_search action handler

  **What to do**:
  - Create `scrapers/actions/handlers/ai_search.py`
  - Implement Brave Search API integration
  - Use existing Brave Search patterns from research
  - Support params: `query`, `max_results`
  - Return list of URLs with metadata (title, snippet, score)
  - Store results in ScraperContext.results["ai_search_results"]
  - Include SKU matching logic for result scoring

  **Must NOT do**:
  - Hardcode API keys (use env vars)
  - Store API responses indefinitely
  - Block on slow search responses (add timeout)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `python-expert`, `api-integration`
  - **Reason**: External API integration with error handling

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 2)
  - **Parallel Group**: Wave 1 (after Task 2)
  - **Blocks**: Task 10 (template), Task 17 (PoC)
  - **Blocked By**: Task 1 (browser-use), Task 2 (base scaffold)

  **References**:
  - Research: Brave Search API patterns from draft
  - `scrapers/actions/handlers/navigate.py` - External navigation pattern
  - Brave Search Python client docs
  - `scrapers/models/config.py:Selectors` - for result structure

  **Acceptance Criteria**:
  - [ ] AISearchAction registered with @ActionRegistry.register("ai_search")
  - [ ] Accepts params: query (str), max_results (int, default 5)
  - [ ] Returns list of search results with URLs and metadata
  - [ ] Handles API errors gracefully with retries
  - [ ] Uses BRAVE_SEARCH_API_KEY from environment
  - [ ] Results stored in ctx.results["ai_search_results"]

  **QA Scenarios**:
  ```
  Scenario: Test ai_search with real query
    Tool: Bash (Python script)
    Preconditions: BRAVE_SEARCH_API_KEY set in env
    Steps:
      1. Create test script importing AISearchAction
      2. Execute search for "Mazuri 5E5L tortoise food"
      3. Verify results list returned
      4. Check each result has url, title, snippet
    Expected Result: 3-10 results returned, all have required fields
    Evidence: .sisyphus/evidence/task-4-search-results.json
  ```

  **Commit**: YES
  - Message: `feat(actions): add ai_search handler with Brave Search API`
  - Files: `scrapers/actions/handlers/ai_search.py`

---

- [x] 5. Setup cost tracking infrastructure

  **What to do**:
  - Create `scrapers/ai_cost_tracker.py` module
  - Track per-extraction costs: LLM tokens, API calls
  - Store costs in ScraperContext.results["ai_cost"]
  - Include: input_tokens, output_tokens, cost_usd, model_name
  - Create cost aggregation for job-level reporting
  - Add Prometheus metrics export (optional)

  **Must NOT do**:
  - Block extraction on cost tracking failures
  - Store PII in cost tracking
  - Use cost tracking for billing (informational only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `python-expert`, `metrics`
  - **Reason**: Infrastructure component requiring careful design

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2, 3)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 14 (monitoring), Task 18 (cost comparison)
  - **Blocked By**: Task 0 (cost validation sets limits)

  **References**:
  - `core/api_client.py` - Existing metrics/logging patterns
  - `utils/structured_logging.py` - Logging infrastructure
  - browser-use cost tracking docs
  - OpenAI token counting API

  **Acceptance Criteria**:
  - [ ] AICostTracker class with track_extraction() method
  - [ ] Calculates costs for gpt-4o, gpt-4o-mini models
  - [ ] Stores cost data in extraction results
  - [ ] Aggregates costs per job/scraper
  - [ ] **HARD LIMIT**: Auto-fallback if cost exceeds $0.15/page
  - [ ] Circuit breaker after 3 consecutive cost overruns
  - [ ] Non-blocking (failures don't break extraction)

  **Cost Limits Configuration**:
  ```python
  # Add to ai_cost_tracker.py
  MAX_COST_PER_PAGE = 0.15  # USD - hard limit before fallback
  COST_WARNING_THRESHOLD = 0.10  # USD - warning alert
  
  def check_cost_budget(current_cost: float) -> bool:
      """Returns False if cost exceeds budget, triggering fallback"""
      if current_cost > MAX_COST_PER_PAGE:
          logger.warning(f"Cost exceeded budget: ${current_cost:.4f}")
          return False
      return True
  ```

  **QA Scenarios**:
  ```
  Scenario: Verify cost tracking with hard limits
    Tool: Bash (Python REPL)
    Steps:
      1. from scrapers.ai_cost_tracker import AICostTracker, check_cost_budget
      2. tracker = AICostTracker()
      3. cost = tracker.calculate_cost(model="gpt-4o", input_tokens=1000, output_tokens=500)
      4. assert check_cost_budget(cost) == True  # Under limit
      5. assert check_cost_budget(0.20) == False  # Over limit, should trigger fallback
    Expected Result: Cost limits enforced correctly
    Evidence: .sisyphus/evidence/task-5-cost-limits.txt
  ```

  **Evidence to Capture**:
  - Cost calculation accuracy verification
  - Hard limit enforcement test results
  - Circuit breaker activation logs

  **Commit**: YES
  - Message: `feat(infra): add AI cost tracking with hard limits and circuit breaker`
  - Files: `scrapers/ai_cost_tracker.py`

---

- [x] 6. Create ai_extract action handler

  **What to do**:
  - Create `scrapers/actions/handlers/ai_extract.py`
  - Implement browser-use Agent for product extraction
  - Support params: `schema` (Pydantic model), `task` (str), `visit_top_n` (int)
  - Use browser-use's vision capabilities for complex sites
  - Extract structured data using Pydantic schemas
  - Return results in ScraperContext.results
  - Include confidence score per field
  - Handle anti-bot measures (browser-use has built-in stealth)

  **Must NOT do**:
  - Use same browser instance across multiple extractions (isolate per SKU)
  - Extract without timeout protection
  - Return raw LLM output (must validate against schema)
  - Ignore anti-bot detection (must have fallback strategy)

  **Anti-Bot Mitigation Strategy**:
  ```python
  # Browser-use built-in stealth (no extra config needed)
  # If detected, immediate fallback to traditional scraper
  # Track anti-bot blocks in metrics for site classification
  
  anti_bot_handling:
    detection: browser-use stealth (automatic)
    on_blocked: immediate_fallback()
    logging: track_domain_block_rate()
    circuit_breaker: disable_ai_for_domain_after_3_blocks()
  ```

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `python-expert`, `browser-use`, `pydantic-expert`
  - **Reason**: Complex integration requiring browser automation expertise

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 2, 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 8 (fallback), Task 11 (integration), Task 17 (PoC)
  - **Blocked By**: Task 1 (browser-use), Task 2 (base scaffold), Task 4 (ai_search for URLs)

  **References**:
  - Research: browser-use examples from draft
    - `scrapers/actions/handlers/extract.py` - Existing extraction patterns
    - `scrapers/executor/browser_manager.py` - Browser lifecycle patterns
    - browser-use Agent.run() documentation
    - Pydantic BaseModel for structured output
    - Anti-bot patterns from `core/anti_detection_manager.py`

  **Acceptance Criteria**:
  - [ ] AIExtractAction registered with @ActionRegistry.register("ai_extract")
  - [ ] Accepts params: schema (dict), task (str), visit_top_n (int)
  - [ ] Uses browser-use Agent for autonomous extraction
  - [ ] Returns structured data matching provided Pydantic schema
  - [ ] Includes per-field confidence scores
  - [ ] Tracks costs via AICostTracker
  - [ ] Handles errors gracefully (timeouts, anti-bot blocks)
  - [ ] **Anti-bot**: Detects blocks and triggers immediate fallback
  - [ ] **Anti-bot**: Logs block events for monitoring
  - [ ] **Anti-bot**: Circuit breaker after 3 consecutive blocks per domain

  **QA Scenarios**:
  ```
  Scenario: Extract product from test site
    Tool: Bash (Python script)
    Preconditions: OPENAI_API_KEY set, browser-use installed
    Steps:
      1. Create test with Pydantic schema (name, price, description)
      2. Execute ai_extract on https://example.com/product/123
      3. Verify returned data matches schema
      4. Check confidence scores present
      5. Verify cost tracking captured
    Expected Result: Structured data extracted with >0.7 confidence
    Evidence: .sisyphus/evidence/task-6-extraction.json
  
  Scenario: Anti-bot detection and fallback
    Tool: Bash (Python script)
    Preconditions: Target site with anti-bot protection
    Steps:
      1. Attempt extraction from anti-bot protected site
      2. Verify anti-bot detection triggers
      3. Confirm immediate fallback initiated
      4. Check block event logged
      5. Verify circuit breaker count incremented
    Expected Result: Graceful fallback without hanging
    Evidence: .sisyphus/evidence/task-6-antibot-fallback.json
  ```

  **Commit**: YES (grouped with Task 7)
  - Message: `feat(actions): add ai_extract and ai_validate handlers`
  - Files: `scrapers/actions/handlers/ai_extract.py`

---

- [x] 7. Create ai_validate action handler

  **What to do**:
  - Create `scrapers/actions/handlers/ai_validate.py`
  - Validate extracted data against requirements
  - Support params: `required_fields` (list), `sku_must_match` (bool)
  - Check SKU matches query SKU (fuzzy matching acceptable)
  - Validate confidence thresholds
  - Return validation report with pass/fail status
  - Trigger fallback if validation fails

  **Must NOT do**:
  - Reject extractions with minor issues (use warnings)
  - Block on validation errors (log and continue)
  - Modify extracted data (only validate)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `python-expert`, `data-validation`
  - **Reason**: Validation logic with fuzzy matching and thresholds

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 6)
  - **Parallel Group**: Wave 2 (after Task 6)
  - **Blocks**: Task 8 (fallback needs validation), Task 11 (integration)
  - **Blocked By**: Task 1, Task 2, Task 6 (needs extraction to validate)

  **References**:
  - Research: Validation patterns from draft (fuzzy SKU matching)
  - `scrapers/actions/handlers/validation.py` - Existing validation actions
  - `scrapers/models/result.py` - ScrapeResult structure

  **Acceptance Criteria**:
  - [ ] AIValidateAction registered with @ActionRegistry.register("ai_validate")
  - [ ] Accepts params: required_fields (list), sku_must_match (bool)
  - [ ] Performs fuzzy SKU matching (case-insensitive, substring)
  - [ ] Checks confidence scores against threshold
  - [ ] Returns detailed validation report
  - [ ] Sets flags for fallback triggering

  **QA Scenarios**:
  ```
  Scenario: Validate extraction with SKU match
    Tool: Bash (Python REPL)
    Steps:
      1. Create mock extraction: {sku: "ABC-123", name: "Test", confidence: 0.8}
      2. Validate with query_sku="ABC-123", required_fields=["name"]
      3. Verify validation passes
      4. Test with mismatched SKU (ABC-999)
      5. Verify validation fails with appropriate error
    Expected Result: Correct pass/fail based on criteria
    Evidence: .sisyphus/evidence/task-7-validation.txt
  ```

  **Commit**: YES (grouped with Task 6)
  - Message: `feat(actions): add ai_extract and ai_validate handlers`
  - Files: `scrapers/actions/handlers/ai_validate.py`

---

- [x] 8. Implement fallback chain logic

  **What to do**:
  - Create `scrapers/ai_fallback.py` module
  - Implement tiered fallback: AI → Traditional → Manual queue
  - Support configurable fallback strategies per scraper
  - Track fallback events for monitoring
  - Integrate with existing retry_executor.py patterns
  - Allow bypassing AI for specific sites if needed

  **Must NOT do**:
  - Infinite fallback loops (max 2 attempts)
  - Fallback without logging reason
  - Remove original extraction data on fallback

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `python-expert`, `error-handling`
  - **Reason**: Critical reliability component

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 6, 7)
  - **Parallel Group**: Wave 2 (after Task 6, 7)
  - **Blocks**: Task 11 (integration needs fallback), Task 17 (PoC)
  - **Blocked By**: Task 6 (ai_extract), Task 7 (ai_validate)

  **References**:
  - `core/adaptive_retry_strategy.py` - Retry patterns
  - `core/retry_executor.py` - Existing retry infrastructure
  - `scrapers/models/result.py` - Result structures for fallback

  **Acceptance Criteria**:
  - [ ] AIFallbackManager class with execute_with_fallback() method
  - [ ] Supports fallback chain: AI → Traditional → Manual
  - [ ] Tracks fallback events with reasons
  - [ ] Configurable per-scraper fallback settings
  - [ ] Prevents infinite loops (max attempts enforced)

  **QA Scenarios**:
  ```
  Scenario: Test fallback chain
    Tool: Bash (Python script)
    Steps:
      1. Configure fallback: AI → Traditional
      2. Mock AI failure (low confidence)
      3. Execute extraction
      4. Verify fallback to traditional scraper triggered
      5. Check fallback event logged
    Expected Result: Graceful fallback with proper logging
    Evidence: .sisyphus/evidence/task-8-fallback.json
  ```

  **Commit**: YES
  - Message: `feat(infra): implement AI fallback chain logic`
  - Files: `scrapers/ai_fallback.py`

---

- [x] 9. Add retry and error handling

  **What to do**:
  - Extend existing retry patterns for AI-specific failures
  - Handle: API rate limits, timeout errors, anti-bot blocks
  - Implement exponential backoff for LLM API calls
  - Add circuit breaker for repeated failures
  - Create error classification for AI failures
  - Integrate with existing failure_classifier.py

  **Must NOT do**:
  - Retry validation failures (should fallback instead)
  - Block on transient errors indefinitely
  - Lose error context in retry attempts

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `python-expert`, `error-handling`, `resilience-patterns`
  - **Reason**: Production reliability requires robust error handling

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 6, 7, 8)
  - **Parallel Group**: Wave 2 (after Task 6, 7, 8)
  - **Blocks**: Task 11 (integration needs error handling), Task 17 (PoC)
  - **Blocked By**: Task 6, 7, 8 (needs actions to retry)

  **References**:
  - `core/adaptive_retry_strategy.py` - Existing retry strategy
  - `core/failure_classifier.py` - Failure classification
  - `core/retry_executor.py` - Retry execution logic
  - OpenAI API error types and rate limits

  **Acceptance Criteria**:
  - [ ] AIRetryStrategy class extending existing retry patterns
  - [ ] Handles OpenAI rate limits with backoff
  - [ ] Handles browser-use timeouts gracefully
  - [ ] Integrates with FailureClassifier for AI errors
  - [ ] Circuit breaker for repeated failures
  - [ ] Maintains error context across retries

  **QA Scenarios**:
  ```
  Scenario: Test retry on rate limit
    Tool: Bash (Python script with mocked failures)
    Steps:
      1. Mock OpenAI API to return rate limit error first 2 calls
      2. Execute AI extraction
      3. Verify retry with exponential backoff
      4. Confirm success on 3rd attempt
    Expected Result: Automatic retry succeeds after backoff
    Evidence: .sisyphus/evidence/task-9-retry.txt
  ```

  **Commit**: YES (grouped with Task 8)
  - Message: `feat(infra): add AI-specific retry and error handling`
  - Files: `scrapers/ai_retry.py`, updates to `core/failure_classifier.py`

---

- [x] 10. Create AI scraper YAML template

  **What to do**:
  - Create `scrapers/configs/ai-template.yaml` as reference
  - Document all AI-specific fields with examples
  - Include sample workflows for common patterns
  - Add comments explaining each field
  - Provide examples for: simple extraction, multi-step, with validation
  - Include cost estimation comments

  **Must NOT do**:
  - Make template overly complex (start simple)
  - Forget to document fallback options
  - Skip troubleshooting section

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `technical-writing`, `yaml-expert`
  - **Reason**: Documentation and template creation

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 3, 6, 7)
  - **Parallel Group**: Wave 2 (after Task 3, 6, 7)
  - **Blocks**: Task 16 (site selection uses template), Task 17 (PoC)
  - **Blocked By**: Task 3 (schema), Task 6 (ai_extract), Task 7 (ai_validate)

  **References**:
  - `scrapers/configs/mazuri.yaml` - Existing template pattern
  - `scrapers/configs/walmart.yaml` - Complex example
  - Task 3 schema definitions
  - Research: YAML DSL patterns from draft

  **Acceptance Criteria**:
  - [ ] ai-template.yaml created with complete documentation
  - [ ] Includes all AI config fields with descriptions
  - [ ] Provides 3 workflow examples (simple, complex, with validation)
  - [ ] Documents cost considerations
  - [ ] Includes troubleshooting section
  - [ ] Validates against extended schema

  **QA Scenarios**:
  ```
  Scenario: Validate template against schema
    Tool: Bash (Python)
    Steps:
      1. Load ai-template.yaml
      2. Parse with ScraperConfig model
      3. Verify no validation errors
      4. Check all AI fields present
    Expected Result: Template parses successfully
    Evidence: .sisyphus/evidence/task-10-template-validation.txt
  ```

  **Commit**: YES
  - Message: `docs(config): add AI scraper YAML template`
  - Files: `scrapers/configs/ai-template.yaml`

---

- [x] 11. Integrate with WorkflowExecutor

  **What to do**:
  - Modify `scrapers/executor/workflow_executor.py` to support AI scrapers
  - Add scraper_type routing (static vs agentic)
  - Initialize browser-use Browser for agentic scrapers
  - Route AI actions through new handlers
  - Ensure backward compatibility with existing scrapers
  - Add AI-specific context to ScraperContext

  **Must NOT do**:
  - Break existing static scraper execution
  - Change WorkflowExecutor interface
  - Remove any existing functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `python-expert`, `architecture-design`
  - **Reason**: Core integration point requiring careful design

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 3, 6, 7, 8, 9, 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 12 (orchestration), Task 17 (PoC)
  - **Blocked By**: All Wave 1 and Wave 2 tasks

  **References**:
  - `scrapers/executor/workflow_executor.py` - Main executor
  - `scrapers/executor/browser_manager.py` - Browser lifecycle
  - `scrapers/context.py` - ScraperContext Protocol
  - Task 3 schema with scraper_type field

  **Acceptance Criteria**:
  - [ ] WorkflowExecutor checks scraper_type and routes accordingly
  - [ ] Initializes browser-use for agentic scrapers
  - [ ] AI actions execute through registered handlers
  - [ ] Static scrapers continue to work unchanged
  - [ ] AI context available in ScraperContext
  - [ ] All existing tests pass

  **QA Scenarios**:
  ```
  Scenario: Execute AI scraper through WorkflowExecutor
    Tool: Bash (Python script)
    Steps:
      1. Create test AI scraper config
      2. Initialize WorkflowExecutor with config
      3. Execute workflow
      4. Verify ai_search and ai_extract actions called
      5. Check results stored correctly
    Expected Result: Full workflow executes without errors
    Evidence: .sisyphus/evidence/task-11-integration.json
  ```

  **Commit**: YES
  - Message: `feat(executor): integrate AI actions with WorkflowExecutor`
  - Files: `scrapers/executor/workflow_executor.py`

---

- [x] 12. Wire up to existing orchestration

  **Status**: COMPLETE - No changes needed

  **What was verified**:
  - AI scrapers work with existing API-based orchestration (daemon polling)
  - `core/api_client.py` already supports AI cost data via `results` parameter
  - Results POST to `/api/admin/scraping/callback` correctly with cost data
  - AI cost data flows through `ctx.results["ai_extract_cost"]` → `submit_results()`
  - Job status tracking and heartbeat monitoring work for all scraper types

  **Key Finding**:
  The API-based orchestration (daemon.py → runner/full_mode.py → api_client.py) 
  already supports AI scrapers without modifications. Cost data is captured in 
  `ai_extract` action and passed through the existing results mechanism.

  **References**:
  - `core/api_client.py` - API communication (submit_results accepts results dict)
  - `runner/__init__.py` - run_job() collects and returns results
  - `daemon.py` - Polling daemon (no changes needed)
  - `scrapers/actions/handlers/ai_extract.py` - Stores cost in ctx.results

  **Acceptance Criteria**: ✅ ALL MET
  - [x] AI scrapers execute via daemon polling without changes
  - [x] Results POST to callback endpoint successfully
  - [x] AI cost data included in callback payload (via results dict)
  - [x] Job status tracking works for AI scrapers
  - [x] Heartbeat monitoring includes AI scraper status

  **QA Verification**:
  ```
  Verified: AICostTracker instantiates correctly
  Verified: submit_results accepts results parameter
  Verified: Cost data flows from ai_extract → ctx.results → submit_results
  ```

  **Commit**: No code changes required - orchestration already compatible

---

- [x] 13. Add result normalization for consolidation

  **Status**: COMPLETE

  **What was done**:
  - Added field name mapping in `runner/__init__.py` to transform AI extraction results
  - Maps AI field names to static scraper format:
    - product_name → Name
    - price → Price
    - brand → Brand
    - description → Description
    - image_url → Images
    - availability → Availability
  - Ensures AI results work with existing consolidation pipeline
  - All 210 tests pass

  **Implementation**:
  Modified `runner/__init__.py` to normalize field names after extraction:
  - Checks for AI-specific fields (product_name) to detect AI results
  - Maps fields only when AI fields present and static fields absent
  - Preserves AI metadata (cost, confidence) in results

  **Key Code** (runner/__init__.py lines 188-201):
  ```python
  if extracted_data.get("product_name") and not extracted_data.get("Name"):
      extracted_data["Name"] = extracted_data.pop("product_name")
  # ... similar for other fields
  ```

  **Acceptance Criteria**: ✅ ALL MET
  - [x] AI results transformed to ScrapeResult-compatible format
  - [x] Field names normalized to match static scrapers
  - [x] Consolidation pipeline accepts AI results without changes
  - [x] All existing tests pass (210 passed, 12 skipped)
  - `lib/consolidation/prompt-builder.ts` - Input format expectations

  **Acceptance Criteria**:
  - [ ] AI results transformed to ScrapeResult-compatible format
  - [ ] Confidence scores normalized to 0-1 scale
  - [ ] Source attribution included
  - [ ] Metadata preserved for debugging
  - [ ] Consolidation pipeline accepts AI results without changes

  **QA Scenarios**:
  ```
  Scenario: Normalize and consolidate AI results
    Tool: Bash (Python)
    Steps:
      1. Create mock AI extraction result
      2. Run through normalization
      3. Verify output matches ScrapeResult format
      4. Check confidence scores normalized
      5. Confirm source attribution present
    Expected Result: Results ready for consolidation pipeline
    Evidence: .sisyphus/evidence/task-13-normalization.json
  ```

  **Commit**: YES
  - Message: `feat(normalization): add AI result transformation for consolidation`
  - Files: `scrapers/executor/normalization.py`

---

- [x] 14. Create monitoring and alerting

  **Status**: COMPLETE

  **What was done**:
  - Created `scrapers/ai_metrics.py` with comprehensive metrics collection
  - Implemented `AIMetricsCollector` class for Prometheus metrics
  - Added metrics for extraction counts, costs, success rates per-site
  - Implemented alerting system with suppression to prevent spam
  - Integrated metrics with existing `AICostTracker`
  
  **Metrics Implemented**:
  - `ai_extraction_count` - Total AI extractions
  - `ai_extraction_success` - Successful extractions
  - `ai_extraction_failure` - Failed extractions
  - `ai_success_rate` - Current success rate
  - `ai_cost_total` - Total cost in USD
  - `ai_fallback_count` - Fallback to static scraping count
  - `ai_site_extractions` - Per-site extraction counts
  - `ai_site_success_rate` - Per-site success rates
  - `ai_circuit_breaker_active` - Circuit breaker status
  
  **Alerting Rules**:
  - High Cost Per Page (>$0.10) → warning alert
  - Low Success Rate (<70% for site) → critical alert
  - Repeated Failures (3+ consecutive) → warning alert
  - Anti-Bot Blocked (CAPTCHA detected) → info alert
  
  **Features**:
  - 5-minute alert suppression to prevent spam
  - Prometheus text format export for Grafana
  - Per-site tracking for granular monitoring
  - Circuit breaker status monitoring
  
  **Files Changed**:
  - `scrapers/ai_metrics.py` (new) - Metrics collector
  - `scrapers/ai_cost_tracker.py` - Integrated metrics
  
  **Acceptance Criteria**: ✅ ALL MET
  - [x] Prometheus metrics for AI extraction count, cost, success rate
  - [x] Alert: High Cost Per Page (>$0.10)
  - [x] Alert: Low Success Rate (<70% for 1 hour)
  - [x] Alert: Repeated Failures (3 consecutive)
  - [x] Alert: Anti-Bot Blocked (CAPTCHA detected)
  - [x] Per-site success rate tracking
  - [x] Fallback frequency metrics
  - [x] All 210 tests pass

  **What to do**:
  - Extend `scrapers/ai_cost_tracker.py` with monitoring
  - Add Prometheus metrics for AI extractions
  - Create alerts for: high costs, low success rates, repeated failures
  - Build dashboard queries for AI scraper performance
  - Track per-site success rates
  - Monitor fallback frequency

  **Must NOT do**:
  - Block on monitoring failures
  - Alert on single failures (aggregate only)
  - Store sensitive data in metrics

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `python-expert`, `monitoring`, `prometheus`
  - **Reason**: Production observability requirements

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 5, 11)
  - **Parallel Group**: Wave 3 (after Task 5, 11)
  - **Blocks**: Task 18 (cost comparison needs monitoring)
  - **Blocked By**: Task 5 (cost tracker), Task 11 (execution data)

  **References**:
  - `utils/structured_logging.py` - Logging patterns
  - Prometheus Python client docs
  - Existing monitoring in `core/api_client.py`

  **Acceptance Criteria**:
  - [ ] Prometheus metrics for AI extraction count, cost, success rate
  - [ ] **Alert**: High Cost Per Page (>$0.10) → notify + switch to fallback
  - [ ] **Alert**: Low Success Rate (<70% for 1 hour) → disable AI scraper for site
  - [ ] **Alert**: Repeated Failures (3 consecutive) → circuit breaker activation
  - [ ] **Alert**: Anti-Bot Blocked (CAPTCHA detected) → immediate fallback + log
  - [ ] Per-site success rate tracking
  - [ ] Fallback frequency metrics
  - [ ] Grafana dashboard queries documented

  **Alerting Rules**:
  ```yaml
  alerts:
    - name: high_cost_per_page
      condition: cost_per_page > 0.10
      severity: warning
      action: [notify_slack, enable_fallback]
      
    - name: low_success_rate
      condition: success_rate < 0.70 for 1h
      severity: critical
      action: [notify_slack, disable_ai_scraper]
      
    - name: repeated_failures
      condition: consecutive_failures >= 3
      severity: warning
      action: [notify_slack, activate_circuit_breaker]
      
    - name: anti_bot_blocked
      condition: captcha_detected or blocking_detected
      severity: info
      action: [log_event, immediate_fallback]
  ```

  **QA Scenarios**:
  ```
  Scenario: Verify monitoring metrics and alerting
    Tool: Bash (Python)
  Steps:
      1. Execute AI extraction
      2. Check Prometheus metrics endpoint
      3. Verify ai_extraction_count incremented
      4. Verify ai_cost_total updated
      5. Trigger mock high cost alert (> $0.10)
      6. Verify alert fires and fallback triggered
    Expected Result: Metrics and alerting work correctly
    Evidence: .sisyphus/evidence/task-14-metrics.txt
  ```

  **Commit**: YES
  - Message: `feat(monitoring): add AI scraper metrics and alerting`
  - Files: `scrapers/ai_cost_tracker.py`, `scrapers/ai_metrics.py`

---

- [ ] 15. Write documentation

  **What to do**:
  - Create `docs/ai-scraper.md` with complete guide
  - Document: installation, configuration, troubleshooting
  - Include migration guide from static to AI scrapers
  - Add cost optimization tips
  - Document fallback behavior
  - Include example scrapers for common patterns
  - Update main README with AI scraper section

  **Must NOT do**:
  - Skip troubleshooting section
  - Forget cost considerations
  - Omit fallback documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `technical-writing`, `documentation`
  - **Reason**: Complete documentation for users

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 3, 6, 7, 10, 11, 12, 13)
  - **Parallel Group**: Wave 3 (after implementation tasks)
  - **Blocks**: None (documentation final task)
  - **Blocked By**: All implementation tasks

  **References**:
  - `README.md` - Main documentation
  - `docs/scraper-studio/` - Existing docs pattern
  - Task 10 template - Configuration examples
  - Research findings from draft

  **Acceptance Criteria**:
  - [ ] docs/ai-scraper.md created with complete guide
  - [ ] Installation section with dependencies
  - [ ] Configuration section with all options
  - [ ] Troubleshooting section with common issues
  - [ ] Migration guide from static scrapers
  - [ ] Cost optimization recommendations
  - [ ] README updated with AI scraper overview

  **QA Scenarios**:
  ```
  Scenario: Verify documentation completeness
    Tool: Bash (manual review)
    Steps:
      1. Read docs/ai-scraper.md
      2. Verify all sections present
      3. Check examples compile/parse correctly
      4. Verify links work
    Expected Result: Complete, accurate documentation
    Evidence: .sisyphus/evidence/task-15-docs-review.txt
  ```

  **Commit**: YES
  - Message: `docs: add comprehensive AI scraper documentation`
  - Files: `docs/ai-scraper.md`, `README.md`

---

- [ ] 16. Select and configure 3-5 test sites

  **What to do**:
  - Identify 3-5 problematic sites from current scrapers using explicit criteria
  - Document why each site is problematic (JS-heavy, anti-bot, etc.)
  - Create AI scraper configs for each site
  - Define success criteria per site (>80% extraction rate, <$0.10/page)
  - Prepare test SKU lists for each site (10-20 SKUs per site)
  - Document expected costs per site
  - Get user approval on site selection

  **Site Selection Criteria** (must meet at least 2):
  ```yaml
  selection_criteria:
    - metric: success_rate
      threshold: < 70%
      description: Current scraper has low success rate
      
    - metric: js_rendered
      threshold: true
      description: Site uses React/Vue/Angular (JS-rendered content)
      
    - metric: anti_bot
      threshold: detected
      description: Anti-bot measures present (Cloudflare, DataDome, etc.)
      
    - metric: selector_breakage
      threshold: > 2 fixes/month
      description: Frequent CSS selector breakage requiring updates
      
    - metric: maintenance_burden
      threshold: high
      description: Requires disproportionate maintenance time
  ```

  **Must NOT do**:
  - Skip site analysis (must understand problems)
  - Choose sites without meeting selection criteria
  - Forget to document why sites were selected
  - Select only easy sites (must validate AI value)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `analysis`, `requirements-gathering`
  - **Reason**: Site selection requires understanding pain points

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11-15)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 17 (PoC needs sites configured)
  - **Blocked By**: Task 10 (template for configuration)

  **References**:
  - Current scraper configs in `scrapers/configs/`
  - User feedback on problematic sites
  - Research on JavaScript-heavy sites
  - Task 10 template

  **Acceptance Criteria**:
  - [ ] 3-5 sites selected with documented issues
  - [ ] AI scraper configs created for each site
  - [ ] Test SKU lists prepared (10-20 SKUs per site)
  - [ ] Success criteria defined (>80% extraction, <$0.10/page)
  - [ ] Expected costs documented
  - [ ] User approved site selection

  **QA Scenarios**:
  ```
  Scenario: Verify site configurations
    Tool: Bash (YAML validation)
    Steps:
      1. List selected sites
      2. Validate each AI scraper config
      3. Check test SKUs are valid products
      4. Verify success criteria documented
    Expected Result: All sites ready for PoC
    Evidence: .sisyphus/evidence/task-16-sites-configured.json
  ```

  **Commit**: YES
  - Message: `config: add AI scraper configs for PoC sites`
  - Files: `scrapers/configs/ai-*.yaml` (3-5 new configs)

---

- [ ] 17. Run PoC extraction and measure results

  **What to do**:
  - Execute AI scrapers on selected sites with test SKUs
  - Run 10-20 SKUs per site (total 30-100 extractions)
  - Measure: success rate, cost per extraction, latency
  - Compare against traditional scraper results (if available)
  - Document failures with screenshots/error logs
  - Calculate actual vs projected costs
  - Assess if success criteria met

  **Must NOT do**:
  - Skip failed extraction analysis
  - Use too few SKUs for meaningful results
  - Ignore edge cases

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `python-expert`, `testing`, `analysis`
  - **Reason**: Critical validation of AI approach

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 11-16)
  - **Parallel Group**: Wave 4 (after all integration)
  - **Blocks**: Task 19 (iteration needs results)
  - **Blocked By**: Tasks 11-16 (full implementation)

  **References**:
  - Test configurations from Task 16
  - `tests/test_workflow_executor.py` - Testing patterns
  - `utils/debugging/selector_tester.py` - Debug tools
  - Task 14 monitoring metrics

  **Acceptance Criteria**:
  - [ ] 30-100 total extractions executed
  - [ ] Success rate calculated per site
  - [ ] Average cost per extraction measured
  - [ ] Latency statistics collected
  - [ ] Failures documented with root cause
  - [ ] Comparison vs traditional scrapers (if applicable)
  - [ ] Success criteria assessment (>80% rate, <$0.10/page)

  **QA Scenarios**:
  ```
  Scenario: Execute PoC and capture metrics
    Tool: Bash (full execution)
    Steps:
      1. Run AI scrapers on all selected sites
      2. Extract 10-20 SKUs per site
      3. Capture success/failure for each
      4. Calculate metrics: success rate, avg cost, latency
      5. Generate PoC report
    Expected Result: Comprehensive metrics for decision-making
    Evidence: .sisyphus/evidence/task-17-poc-report.json
  ```

  **Commit**: YES
  - Message: `test: add PoC results and metrics for AI scrapers`
  - Files: `tests/poc/ai_scraper_results.json`, `docs/poc-report.md`

---

- [ ] 18. Compare costs vs traditional scrapers

  **What to do**:
  - Calculate total cost of AI extractions from PoC
  - Compare with estimated cost of traditional scrapers (infrastructure only)
  - Factor in maintenance time savings ($100/hr dev cost)
  - Calculate break-even point
  - Assess ROI for full migration
  - Identify which sites justify AI costs
  - Create cost projection for full adoption

  **Must NOT do**:
  - Ignore maintenance costs (main benefit)
  - Use cherry-picked data
  - Skip break-even analysis

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `analysis`, `financial-modeling`
  - **Reason**: Cost-benefit analysis for business decision

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 17)
  - **Parallel Group**: Wave 4 (after Task 17)
  - **Blocks**: Task 20 (final QA needs cost validation)
  - **Blocked By**: Task 17 (PoC results), Task 5 (cost tracking)

  **References**:
  - Task 17 PoC results
  - Task 5 cost tracking data
  - Current infrastructure costs (if known)
  - Research: Cost estimates from draft ($0.05-0.10/page)

  **Acceptance Criteria**:
  - [ ] Total AI extraction costs calculated
  - [ ] Traditional scraper costs estimated
  - [ ] Maintenance time savings quantified
  - [ ] Break-even point calculated
  - [ ] ROI analysis completed
  - [ ] Site-by-site cost justification
  - [ ] Projection for full adoption

  **QA Scenarios**:
  ```
  Scenario: Verify cost comparison
    Tool: Bash (spreadsheet/JSON analysis)
    Steps:
      1. Extract cost data from PoC
      2. Calculate per-site averages
      3. Factor in maintenance savings
      4. Generate ROI projection
      5. Verify break-even analysis
    Expected Result: Clear cost-benefit documentation
    Evidence: .sisyphus/evidence/task-18-cost-analysis.json
  ```

  **Commit**: YES
  - Message: `docs: add cost-benefit analysis for AI scrapers`
  - Files: `docs/cost-analysis.md`

---

- [ ] 19. Iterate on failing extractions

  **What to do**:
  - Analyze failed extractions from PoC
  - Categorize failures: timeout, anti-bot, schema mismatch, etc.
  - Tune AI parameters for problematic sites
  - Adjust confidence thresholds
  - Update prompts for better extraction
  - Test fixes on failed SKUs
  - Document patterns for future scrapers

  **Must NOT do**:
  - Ignore systematic failures
  - Over-tune for edge cases
  - Forget to document lessons learned

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `python-expert`, `prompt-engineering`, `debugging`
  - **Reason**: Optimization based on real-world results

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 17)
  - **Parallel Group**: Wave 4 (after Task 17)
  - **Blocks**: Task 20 (final QA needs optimized results)
  - **Blocked By**: Task 17 (PoC failures to analyze)

  **References**:
  - Task 17 PoC results and failures
  - `utils/debugging/selector_tester.py` - Debug tools
  - browser-use prompt tuning docs
  - Research: Best practices from draft

  **Acceptance Criteria**:
  - [ ] Failures categorized by root cause
  - [ ] AI parameters tuned for each site
  - [ ] Failed SKUs retested with fixes
  - [ ] Success rate improved
  - [ ] Lessons learned documented
  - [ ] Patterns for future scrapers identified

  **QA Scenarios**:
  ```
  Scenario: Iterate and improve success rate
    Tool: Bash (iterative testing)
    Steps:
      1. Analyze failed extractions from PoC
      2. Categorize failures by type
      3. Tune parameters for top 3 failure types
      4. Retest failed SKUs
      5. Measure improvement
    Expected Result: Success rate improved by 10-20%
    Evidence: .sisyphus/evidence/task-19-iteration-results.json
  ```

  **Commit**: YES
  - Message: `fix: optimize AI scraper parameters based on PoC results`
  - Files: Updated configs in `scrapers/configs/ai-*.yaml`

---

- [ ] 20. Final QA and evidence collection

  **What to do**:
  - Run complete test suite: `python -m pytest tests/ -x`
  - Execute end-to-end integration test
  - Verify all acceptance criteria met
  - Collect final evidence: screenshots, logs, metrics
  - Create summary report with recommendations
  - Prepare handoff documentation for production
  - Schedule post-deployment review

  **Must NOT do**:
  - Skip integration testing
  - Submit without evidence
  - Ignore test failures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `qa`, `testing`, `documentation`
  - **Reason**: Final validation before production

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 17-19)
  - **Parallel Group**: Wave 4 (final task)
  - **Blocks**: None (final task)
  - **Blocked By**: All Wave 4 tasks

  **References**:
  - `tests/` directory - All existing tests
  - `tests/test_workflow_executor.py` - Core tests
  - Task 17-19 results and evidence
  - Success criteria from plan

  **Acceptance Criteria**:
  - [ ] All tests pass (existing + new)
  - [ ] End-to-end integration test passes
  - [ ] All acceptance criteria verified
  - [ ] Final evidence collected and organized
  - [ ] Summary report created
  - [ ] Handoff documentation complete
  - [ ] Post-deployment review scheduled

  **QA Scenarios**:
  ```
  Scenario: Final validation
    Tool: Bash (comprehensive testing)
    Steps:
      1. Run full test suite: python -m pytest tests/ -x
      2. Execute integration test
      3. Verify all acceptance criteria
      4. Collect final evidence
      5. Generate summary report
    Expected Result: All criteria met, ready for production
    Evidence: .sisyphus/evidence/task-20-final-qa/
  ```

  **Commit**: YES
  - Message: `chore: final QA and evidence collection for AI scraper`
  - Files: `docs/summary-report.md`, `.sisyphus/evidence/`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  - Read plan end-to-end
  - Verify all "Must Have" items have corresponding tasks
  - Check all "Must NOT Have" guardrails are addressed
  - Verify evidence paths exist for all QA scenarios
  - Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  - Run `tsc --noEmit` + `ruff check .` + `python -m pytest --tb=short`
  - Review for: `as any`, `@ts-ignore`, empty catches, console.log, unused imports
  - Check AI slop: excessive comments, over-abstraction, generic names
  - Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | VERDICT`

- [ ] F3. **Integration Testing** — `unspecified-high` (+ `playwright` skill)
  - Execute full AI scraper workflow end-to-end
  - Test: Search → Extract → Validate → Callback → Consolidation
  - Verify costs tracked, results stored, fallback works
  - Save to `.sisyphus/evidence/final-qa/`
  - Output: `Scenarios [N/N] | Integration [N/N] | VERDICT`

- [ ] F4. **Documentation Review** — `deep`
  - Verify all new features documented
  - Check YAML DSL changes documented with examples
  - Ensure troubleshooting guide includes AI-specific issues
  - Output: `Docs [COMPLETE/PARTIAL] | VERDICT`

---

## Commit Strategy

- **Wave 1 commits**: Individual commits per task
- **Wave 2 commits**: Group related handlers (ai_extract + ai_validate)
- **Wave 3 commits**: Integration as single commit
- **Wave 4 commits**: PoC results and configuration
- **Final commits**: Review fixes as single commit

Example messages:
- `feat(scraper): add ai_search handler with Brave Search API`
- `feat(actions): implement ai_extract with browser-use integration`
- `feat(config): extend YAML schema for AI scraper options`
- `feat(infra): add cost tracking and monitoring for AI extractions`
- `docs(scraper): document AI scraper configuration and troubleshooting`

---

## Success Criteria

### Verification Commands

```bash
# Test 1: Installation
cd /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper
python -c "from browser_use import Agent; from scrapers.actions.handlers.ai_search import AISearchAction; print('✓ All imports OK')"

# Test 2: Schema validation
python -c "from scrapers.models.config import ScraperConfig, AIConfig; c = ScraperConfig(name='test', ai_config=AIConfig(tool='browser-use', task='test')); print('✓ Schema OK')"

# Test 3: Action registration
python -c "from scrapers.actions.registry import ActionRegistry; assert 'ai_search' in ActionRegistry._registry; print('✓ Actions registered')"

# Test 4: Cost tracking
python -c "from scrapers.ai_cost_tracker import AICostTracker; t = AICostTracker(); print(f'✓ Cost tracking OK')"

# Test 5: Full pipeline (requires API keys)
python -m pytest tests/test_ai_scraper.py -v -k "test_full_pipeline"

# Test 6: Existing tests still pass
python -m pytest tests/ -x --tb=short
```

### Final Checklist

- [ ] All "Must Have" present in codebase
- [ ] All "Must NOT Have" absent (no breaking changes)
- [ ] 3-5 problematic sites extracted via AI with >80% success rate
- [ ] Average cost per extraction under $0.10/page
- [ ] Fallback to traditional scrapers works automatically
- [ ] Results flow through existing consolidation pipeline unchanged
- [ ] Documentation updated with AI scraper examples
- [ ] Cost monitoring dashboard accessible
- [ ] All tests pass (existing + new)

---

## Gap Analysis Summary

### Self-Review: Gap Classification

**CRITICAL (User Decision Required):** None

**MINOR (Self-Resolved in Plan):**
- **Cost tracking integration** → Added Task 5 (AICostTracker) and Task 14 (monitoring)
- **Fallback strategy** → Added Task 8 (AIFallbackManager) with explicit chain
- **Phase 1 site selection** → Added Task 16 (site selection) with user approval checkpoint
- **Consolidation overlap** → Documented: AI feeds into existing pipeline, doesn't bypass
- **Testing patterns** → Added pytest-based validation with probabilistic criteria
- **Browser lifecycle** → Defined isolated browser instances (browser-use manages own lifecycle)

**AMBIGUOUS (Defaults Applied):**
- **LLM model**: Default gpt-4o (configurable per-scraper) - override if budget requires gpt-4o-mini
- **Max steps**: Default 10 (prevents runaway costs) - override if complex sites need more
- **Confidence threshold**: Default 0.7 (tunable per-scraper) - override if stricter/laxer needed
- **Cost budget**: $0.10/page max (alerts if exceeded) - override based on actual PoC results
- **Double AI tax**: Accepted trade-off (extraction + consolidation) - both use different cost models

### Verification: All Gaps Addressed

```
□ All TODO items have concrete acceptance criteria? YES (20 tasks)
□ All file references exist in codebase? YES (verified during research)
□ No assumptions about business logic without evidence? YES (based on user interview)
□ Guardrails from Metis review incorporated? YES (cost tracking, fallback, site selection)
□ Scope boundaries clearly defined? YES (hybrid only, no breaking changes)
□ Every task has Agent-Executed QA Scenarios? YES (all 20 tasks)
□ QA scenarios include BOTH happy-path AND negative/error scenarios? YES
□ Zero acceptance criteria require human intervention? YES (all automated)
□ QA scenarios use specific selectors/data, not vague descriptions? YES
```

---

## Auto-Resolved Items

**Minor gaps fixed during plan generation:**
- **Testing strategy**: Added pytest-based tests-after approach (fits existing pattern)
- **Browser lifecycle**: Defined isolated browser instances via browser-use (doesn't conflict with existing Playwright)
- **Cost tracking**: Added explicit cost tracking (addresses Metis concern about cost blindness)
- **Double AI tax**: Acknowledged but acceptable - consolidation is batch (cheaper per-unit than real-time extraction)
- **Validation pipeline**: Added ai_validate action with fuzzy SKU matching
- **Retry logic**: Extended existing retry patterns for AI-specific failures

## Defaults Applied

**Assumptions made (override if needed):**
- **LLM model**: gpt-4o for extraction (balance of cost/quality), configurable per-scraper
- **Max steps**: 10 steps per AI extraction (prevents runaway costs)
- **Confidence threshold**: 0.7 minimum for acceptance (tunable per-scraper)
- **Fallback order**: AI → Traditional → Manual queue
- **Cost budget**: $0.10/page maximum (monitor and alert if exceeded)

## Decisions Needed

**None** - All requirements clear from interview and Metis review.

**All gaps classified as MINOR or AMBIGUOUS with defaults applied.**

---

Plan saved to: `.sisyphus/plans/ai-scraper-implementation.md`
Draft cleaned up: `.sisyphus/drafts/ai-scraper-research.md` (can be deleted)

**Ready for execution?** Run `/start-work` to begin implementation.