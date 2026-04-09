# AI Scraper Prompt Finetuning - Work Plan

## TL;DR

> **Core Objective**: Optimize the AI Scraper System Prompt for optimal batch product data extraction using Gemini API testing and iteration.
>
> **Deliverables**:
> - Baseline performance metrics with current prompts
> - Optimized system prompt with structured consistency enforcement
> - Enhanced batch processing instructions
> - Test suite with real product data validation
> - Documentation of prompt versions and performance comparison
>
> **Estimated Effort**: Medium (2-3 days)
> **Parallel Execution**: YES - Test iterations can run in parallel
> **Critical Path**: Baseline test → Prompt v1 optimization → Validation → Documentation

---

## Context

### Original Request
Finetune the AI Scraper System Prompt and Strategy to pull optimal batch product data using the newly available Gemini API key ([GEMINI_API_KEY]). The AI Scraping Strategy 2.0 plan was recently implemented but lacked adequate testing due to missing API access during development.

### Current State
- **System Prompt**: Located in `apps/web/lib/consolidation/prompt-builder.ts` (lines 219-281)
- **Two-Phase Consolidation**: Implemented in `two-phase-service.ts` with cohort consistency rules
- **Sibling Context**: Max 5 siblings, includes sku/name/brand/category
- **Source Trust**: 4-tier hierarchy (canonical > trusted > standard > marketplace)
- **Test Data**: 269 imported products in Supabase (products_ingestion table)

### Key Insight from Analysis
The current prompts use text-based consistency rules which may not be consistently applied by the LLM. Testing with real data will reveal:
1. Optimal sibling context size (currently limited to 5)
2. Effectiveness of text-based vs example-based consistency rules
3. Gemini vs OpenAI performance for product extraction

---

## Work Objectives

### Core Objective
Optimize the AI Scraper System Prompt through systematic testing with Gemini API to achieve 95%+ brand consistency, 90%+ category consistency, and 85%+ name pattern adherence across product line batches.

### Concrete Deliverables
- **Baseline Report**: Performance metrics with current prompts against test product groups
- **Optimized Prompt v1**: Enhanced system prompt with structured consistency examples
- **Batch Processing Instructions**: Explicit multi-product processing guidance
- **Test Suite**: Automated tests with real product data from Supabase
- **Performance Comparison**: Before/after metrics documentation

### Definition of Done
- [ ] Baseline tests executed with 5+ product groups
- [ ] Prompt optimizations tested and validated
- [ ] Brand consistency ≥ 95% across sibling products
- [ ] Category consistency ≥ 90% across sibling products
- [ ] Name pattern adherence ≥ 85% within product lines
- [ ] Documentation complete with prompt versions

### Must Have
- Test with real product data from Supabase
- Use Gemini API for all testing (provided key)
- Document all prompt versions
- Measure consistency metrics
- Validate against current implementation

### Must NOT Have (Guardrails)
- NO changes to production database during testing
- NO modifications to existing scraper configs
- NO breaking changes to API contracts
- NO hardcoded API keys in committed code
- NO deletion of existing prompt versions

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest for Python, Jest for TypeScript)
- **Automated tests**: YES (Tests for prompt generation and validation)
- **Framework**: pytest + Gemini API client
- **Agent-Executed QA**: MANDATORY for all test scenarios

### QA Policy
Every test scenario MUST include:
- **API Testing**: Use Gemini API client to test prompts
- **Data Validation**: SQL queries to verify test product groups
- **Metrics Calculation**: Automated consistency scoring
- **Evidence Capture**: Save API responses and metrics

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Test Setup & Baseline):
├── Task 1: Create test data fixtures from Supabase [quick]
├── Task 2: Set up Gemini API test harness [quick]
├── Task 3: Execute baseline tests with current prompts [deep]
└── Task 4: Calculate baseline consistency metrics [quick]

Wave 2 (Prompt Optimization - MAX PARALLEL):
├── Task 5: Design structured consistency examples [unspecified-high]
├── Task 6: Optimize sibling context size (test 5/10/15) [unspecified-high]
├── Task 7: Enhance batch processing instructions [unspecified-high]
├── Task 8: Add variant relationship detection [unspecified-high]
└── Task 9: Create Prompt v1 with optimizations [quick]

Wave 3 (Validation & Iteration):
├── Task 10: Test Prompt v1 against same product groups [deep]
├── Task 11: Calculate v1 consistency metrics [quick]
├── Task 12: Compare v1 vs baseline performance [unspecified-high]
├── Task 13: Iterate on underperforming areas [unspecified-high]
└── Task 14: Finalize Prompt v2 if needed [quick]

Wave 4 (Documentation & Integration):
├── Task 15: Document all prompt versions [writing]
├── Task 16: Create performance comparison report [writing]
├── Task 17: Write implementation guide for production [writing]
└── Task 18: Update prompt_design_v2.md with findings [writing]

Wave FINAL (Review & Handoff):
├── Task F1: Code quality review [unspecified-high]
├── Task F2: Test coverage validation [unspecified-high]
├── Task F3: Documentation review [unspecified-high]
└── Task F4: Scope fidelity check [deep]
-> Present results -> Get explicit user okay

Critical Path: T1-4 → T5-9 → T10-14 → T15-18 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 5 (Wave 2)
Wave 2 (Prompt Optimization - MAX PARALLEL):
├── Task 5: Design structured consistency examples [unspecified-high]
├── Task 6: Optimize sibling context size (test 5/10/15) [unspecified-high]
├── Task 7: Enhance batch processing instructions [unspecified-high]
├── Task 8: Add variant relationship detection [unspecified-high]
├── Task 9: Create Prompt v1 with optimizations [quick]
├── Task 9a: Test Gemini vs OpenAI for search ranking [unspecified-high]
├── Task 9b: Compare crawl4ai extraction modes [unspecified-high]
└── Task 9c: Measure multi-provider cost/accuracy trade-offs [unspecified-high]

Wave 3 (Validation & Iteration):
├── Task 10: Test Prompt v1 against same product groups [deep]
├── Task 11: Calculate v1 consistency metrics [quick]
├── Task 12: Compare v1 vs baseline performance [unspecified-high]
├── Task 13: Iterate on underperforming areas [unspecified-high]
└── Task 14: Finalize Prompt v2 if needed [quick]

Wave 4 (Documentation & Integration):
├── Task 15: Document all prompt versions [writing]
├── Task 16: Create performance comparison report [writing]
├── Task 17: Write implementation guide for production [writing]
├── Task 18: Update prompt_design_v2.md with findings [writing]
├── Task 19: Document multi-provider strategy [writing]
└── Task 20: Create hybrid provider configuration guide [writing]

Wave FINAL (Review & Handoff):
├── Task F1: Code quality review [unspecified-high]
├── Task F2: Test coverage validation [unspecified-high]
├── Task F3: Documentation review [unspecified-high]
└── Task F4: Scope fidelity check [deep]
-> Present results -> Get explicit user okay

Critical Path: T1-4 → T5-9 → T9a-c → T10-14 → T15-20 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Wave 2)
├── Task 5: Design structured consistency examples [unspecified-high]
├── Task 6: Optimize sibling context size (test 5/10/15) [unspecified-high]
├── Task 7: Enhance batch processing instructions [unspecified-high]
├── Task 8: Add variant relationship detection [unspecified-high]
└── Task 9: Create Prompt v1 with optimizations [quick]

Wave 3 (Validation & Iteration):
├── Task 10: Test Prompt v1 against same product groups [deep]
├── Task 11: Calculate v1 consistency metrics [quick]
├── Task 12: Compare v1 vs baseline performance [unspecified-high]
├── Task 13: Iterate on underperforming areas [unspecified-high]
└── Task 14: Finalize Prompt v2 if needed [quick]

Wave 4 (Documentation & Integration):
├── Task 15: Document all prompt versions [writing]
├── Task 16: Create performance comparison report [writing]
├── Task 17: Write implementation guide for production [writing]
└── Task 18: Update prompt_design_v2.md with findings [writing]
├── Task 5: Design structured consistency examples [unspecified-high]
├── Task 6: Optimize sibling context size (test 5/10/15) [unspecified-high]
├── Task 7: Enhance batch processing instructions [unspecified-high]
├── Task 8: Add variant relationship detection [unspecified-high]
└── Task 9: Create Prompt v1 with optimizations [quick]

Wave 3 (Validation & Iteration):
├── Task 10: Test Prompt v1 against same product groups [deep]
├── Task 11: Calculate v1 consistency metrics [quick]
├── Task 12: Compare v1 vs baseline performance [unspecified-high]
├── Task 13: Iterate on underperforming areas [unspecified-high]
└── Task 14: Finalize Prompt v2 if needed [quick]

Wave 4 (Documentation & Integration):
├── Task 15: Document all prompt versions [writing]
├── Task 16: Create performance comparison report [writing]
├── Task 17: Write implementation guide for production [writing]
└── Task 18: Update prompt_design_v2.md with findings [writing]

Wave FINAL (Review & Handoff):
Critical Path: T1-4 → T5-9 → T9a-c → T10-14 → T15-20 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Wave 2)
```
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Wave 2)
├── Task 5: Design structured consistency examples [unspecified-high]
├── Task 6: Optimize sibling context size (test 5/10/15) [unspecified-high]
├── Task 7: Enhance batch processing instructions [unspecified-high]
├── Task 8: Add variant relationship detection [unspecified-high]
└── Task 9: Create Prompt v1 with optimizations [quick]

Wave 3 (Validation & Iteration):
├── Task 10: Test Prompt v1 against same product groups [deep]
├── Task 11: Calculate v1 consistency metrics [quick]
├── Task 12: Compare v1 vs baseline performance [unspecified-high]
├── Task 13: Iterate on underperforming areas [unspecified-high]
└── Task 14: Finalize Prompt v2 if needed [quick]

Wave 4 (Documentation & Integration):
├── Task 15: Document all prompt versions [writing]
├── Task 16: Create performance comparison report [writing]
├── Task 17: Write implementation guide for production [writing]
└── Task 18: Update prompt_design_v2.md with findings [writing]
├── Task 5: Design structured consistency examples [unspecified-high]
├── Task 6: Optimize sibling context size (test 5/10/15) [unspecified-high]
├── Task 7: Enhance batch processing instructions [unspecified-high]
├── Task 8: Add variant relationship detection [unspecified-high]
└── Task 9: Create Prompt v1 with optimizations [quick]

Wave 3 (Validation & Iteration):
├── Task 10: Test Prompt v1 against same product groups [deep]
├── Task 11: Calculate v1 consistency metrics [quick]
├── Task 12: Compare v1 vs baseline performance [unspecified-high]
├── Task 13: Iterate on underperforming areas [unspecified-high]
└── Task 14: Finalize Prompt v2 if needed [quick]

Wave 4 (Documentation & Integration):
├── Task 15: Document all prompt versions [writing]
├── Task 16: Create performance comparison report [writing]
├── Task 17: Write implementation guide for production [writing]
└── Task 18: Update prompt_design_v2.md with findings [writing]

Wave FINAL (Review & Handoff):
├── Task F1: Code quality review [unspecified-high]
├── Task F2: Test coverage validation [unspecified-high]
├── Task F3: Documentation review [unspecified-high]
└── Task F4: Scope fidelity check [deep]
-> Present results -> Get explicit user okay

Critical Path: T1-4 → T5-9 → T10-14 → T15-18 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 5 (Wave 2)
```

---

## Multi-Provider Strategy (NEW)

Based on architecture analysis, recommend hybrid provider approach for optimal cost/performance:

### Stage 1: Search/Source Selection → Gemini
**Model**: `gemini-3.1-flash-lite-preview`  
**Rationale**: Fast, cost-effective for high-volume search ranking  
**Expected Savings**: 60-70% vs OpenAI  
**Current Location**: `apps/scraper/scrapers/ai_search/llm_runtime.py`

### Stage 2: Extraction → crawl4ai Auto-Mode  
**Mode**: `auto` (LLM-free → LLM → Static)  
**LLM Fallback**: OpenAI `gpt-4o-mini` for complex extraction  
**Rationale**: LLM-free handles 80% of cases at zero cost; OpenAI for edge cases  
**Expected Savings**: 80% cost reduction via LLM-free mode  
**Current Location**: `apps/scraper/src/crawl4ai_engine/`

### Stage 3: Consolidation → OpenAI or Gemini
**OpenAI**: `gpt-4o-mini` for highest accuracy  
**Gemini**: `gemini-3-flash-preview` for cost-sensitive batches  
**Rationale**: Flexibility based on accuracy vs cost priorities  
**Current Location**: `apps/web/lib/consolidation/` (already supports both)

### API Keys Available
- **Gemini**: `[GEMINI_API_KEY]`
- **Gemini**: `[GEMINI_API_KEY - use environment variable]
- **OpenAI**: `[OPENAI_API_KEY]`
- **OpenAI**: `[OPENAI_API_KEY - use environment variable]

**Security Note**: API keys will be loaded from environment variables, never hardcoded.

### Dependency Matrix
- **1-4**: Foundation tests → 5-9
- **5-9**: Prompt optimization → 10-14
- **10-14**: Validation → 15-18
- **15-18**: Documentation → F1-F4
- **F1-F4**: Final review → user okay

### Agent Dispatch Summary
- **Wave 1**: 3 quick, 1 deep → `quick`, `deep`
- **Wave 2**: 1 quick, 4 unspecified-high → `quick`, `unspecified-high`
- **Wave 3**: 2 quick, 3 unspecified-high, 1 deep → `quick`, `unspecified-high`, `deep`
- **Wave 4**: 4 writing → `writing`
- **Wave FINAL**: 3 unspecified-high, 1 deep → `unspecified-high`, `deep`

---

## TODOs

### Wave 1: Foundation (Test Setup & Baseline)

- [ ] 1. Create test data fixtures from Supabase
- [x] 1. Create test data fixtures from Supabase (COMPLETED)
- [x] 1. Create test data fixtures from Supabase

  **What to do**:
  - Query products_ingestion table for test SKUs
  - Group products by SKU prefix patterns (first 6-8 digits)
  - Create 5-10 test product groups with 3-15 products each
  - Export to JSON fixtures for testing

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None needed

  **Parallelization**: Wave 1 - can run in parallel with tasks 2-4
  - **Can Run In Parallel**: YES
  - **Blocks**: Task 3, 10
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] 5-10 test product groups created
  - [ ] Each group has 3-15 related products
  - [ ] Fixture files saved to `apps/web/lib/consolidation/__tests__/fixtures/`
  - [ ] SQL query to regenerate fixtures documented

  **QA Scenarios**:
  ```
  Scenario: Verify test data creation
    Tool: Bash (SQL query)
    Steps:
      1. Run SQL to count products by prefix pattern
      2. Verify 5+ distinct product groups exist
      3. Export sample to JSON and verify structure
    Expected: 5+ groups with product data including sku, input->name
    Evidence: .sisyphus/evidence/task-1-test-fixtures.json
  ```

  **Commit**: NO (test data only)

- [ ] 2. Set up Gemini API test harness
- [x] 2. Set up Gemini API test harness (COMPLETED)
- [x] 2. Set up Gemini API test harness

  **What to do**:
  - Create Python test harness using `google-genai` SDK
  - Configure API key (use environment variable, not hardcoded)
  - Implement batch testing function for product groups
  - Add metrics calculation (consistency scores)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `gemini-api-dev`

  **Parallelization**: Wave 1
  - **Can Run In Parallel**: YES
  - **Blocks**: Task 3, 5-9
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Test harness Python file created
  - [ ] Can connect to Gemini API successfully
  - [ ] Can send batch prompts and receive responses
  - [ ] Metrics calculation functions implemented

  **References**:
  - Use `gemini-3.1-flash-lite-preview` for cost-efficient testing
  - Reference: `google-genai` SDK from gemini-api-dev skill

  **QA Scenarios**:
  ```
  Scenario: Verify API connectivity
    Tool: Bash (Python script)
    Steps:
      1. Run test harness with simple prompt
      2. Verify successful API response
      3. Check response format and timing
    Expected: API returns valid response within 5 seconds
    Evidence: .sisyphus/evidence/task-2-api-test.json
  ```

  **Commit**: NO (test harness only)

- [ ] 3. Execute baseline tests with current prompts
- [x] 3. Execute baseline tests with current prompts (COMPLETED)
- [x] 3. Execute baseline tests with current prompts

  **What to do**:
  - Extract current system prompt from prompt-builder.ts
  - Test with 5 product groups using Gemini API
  - Record all API responses
  - Calculate baseline consistency metrics

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `gemini-api-dev`

  **Parallelization**: Wave 1
  - **Can Run In Parallel**: NO (depends on Task 2)
  - **Blocks**: Task 4, 12
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] 5 product groups tested with current prompt
  - [ ] All API responses saved
  - [ ] Raw data available for analysis
  - [ ] No errors in API calls

  **References**:
  - Current system prompt: `apps/web/lib/consolidation/prompt-builder.ts` lines 219-281
  - Test harness from Task 2

  **QA Scenarios**:
  ```
  Scenario: Baseline test execution
    Tool: Bash (Python script)
    Steps:
      1. Run baseline tests on 5 product groups
      2. Verify all 5 complete without errors
      3. Save responses to files
    Expected: 5/5 tests complete, responses saved
    Evidence: .sisyphus/evidence/task-3-baseline/
  ```

  **Commit**: NO (test results only)

- [ ] 4. Calculate baseline consistency metrics
- [x] 4. Calculate baseline consistency metrics (COMPLETED)
- [x] 4. Calculate baseline consistency metrics

  **What to do**:
  - Analyze baseline test results
  - Calculate brand consistency % across siblings
  - Calculate category consistency % across siblings
  - Calculate name pattern adherence %
  - Document baseline metrics report

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**: Wave 1
  - **Can Run In Parallel**: NO (depends on Task 3)
  - **Blocks**: Task 12
  - **Blocked By**: Task 3

  **Acceptance Criteria**:
  - [ ] Brand consistency metric calculated
  - [ ] Category consistency metric calculated
  - [ ] Name pattern adherence metric calculated
  - [ ] Metrics report saved to `baseline-metrics.md`

  **QA Scenarios**:
  ```
  Scenario: Metrics calculation verification
    Tool: Bash (Python script)
    Steps:
      1. Process baseline test results
      2. Calculate consistency metrics
      3. Verify metric values are reasonable (0-100%)
    Expected: All metrics calculated and documented
    Evidence: .sisyphus/evidence/task-4-metrics.json
  ```

  **Commit**: NO (analysis only)

### Wave 2: Prompt Optimization

- [ ] 5. Design structured consistency examples
- [x] 5. Design structured consistency examples (COMPLETED)
- [x] 5. Design structured consistency examples

  **What to do**:
  - Create before/after examples showing consistency enforcement
  - Design examples for brand consistency
  - Design examples for category consistency
  - Design examples for name pattern adherence
  - Add examples to prompt context

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None

  **Parallelization**: Wave 2
  - **Can Run In Parallel**: YES (with 6-8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] 3-5 consistency examples created
  - [ ] Examples show before/after state
  - [ ] Examples cover brand, category, and naming
  - [ ] Examples ready to insert into prompt

  **QA Scenarios**:
  ```
  Scenario: Example quality check
    Tool: Manual review
    Steps:
      1. Review each consistency example
      2. Verify examples are clear and realistic
      3. Check coverage of all consistency types
    Expected: 3+ high-quality examples ready for prompt
    Evidence: .sisyphus/evidence/task-5-examples.md
  ```

  **Commit**: NO (design only)

- [ ] 6. Optimize sibling context size
- [x] 6. Optimize sibling context size (COMPLETED)
- [x] 6. Optimize sibling context size

  **What to do**:
  - Test with 5, 10, and 15 sibling products
  - Measure extraction quality at each level
  - Measure consistency enforcement at each level
  - Determine optimal sibling count
  - Document findings

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `gemini-api-dev`

  **Parallelization**: Wave 2
  - **Can Run In Parallel**: YES (with 5, 7-8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] Tests run with 5, 10, 15 siblings
  - [ ] Quality metrics compared across sizes
  - [ ] Optimal size determined
  - [ ] Findings documented

  **References**:
  - Current limit: `MAX_SIBLING_PRODUCTS = 5` in prompt-builder.ts line 18

  **QA Scenarios**:
  ```
  Scenario: Sibling size comparison
    Tool: Bash (Python script)
    Steps:
      1. Test same product group with 5/10/15 siblings
      2. Compare consistency metrics
      3. Identify optimal size
    Expected: Clear recommendation on optimal sibling count
    Evidence: .sisyphus/evidence/task-6-sibling-size.json
  ```

  **Commit**: NO (test results)

- [ ] 7. Enhance batch processing instructions
- [x] 7. Enhance batch processing instructions (COMPLETED)
- [x] 7. Enhance batch processing instructions

  **What to do**:
  - Add explicit "batch mode" instruction to system prompt
  - Include "process these N related products together" guidance
  - Add cross-product consistency verification instruction
  - Test enhanced instructions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None

  **Parallelization**: Wave 2
  - **Can Run In Parallel**: YES (with 5-6, 8)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] Batch mode instruction drafted
  - [ ] Cross-product verification instruction added
  - [ ] Instructions tested with Gemini API
  - [ ] Improvement measured vs baseline

  **QA Scenarios**:
  ```
  Scenario: Batch instruction effectiveness
    Tool: Bash (Python script)
    Steps:
      1. Test products individually vs batch
      2. Compare consistency between approaches
      3. Measure improvement
    Expected: Batch mode shows improved consistency
    Evidence: .sisyphus/evidence/task-7-batch-mode.json
  ```

  **Commit**: NO (test results)

- [ ] 8. Add variant relationship detection
- [x] 8. Add variant relationship detection (COMPLETED)
- [x] 8. Add variant relationship detection

  **What to do**:
  - Design logic to detect size/flavor/color variants within product line
  - Add variant type detection to sibling context
  - Include variant relationship in prompt
  - Test enforcement of "only X should vary" rule

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: None

  **Parallelization**: Wave 2
  - **Can Run In Parallel**: YES (with 5-7)
  - **Blocks**: Task 9
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] Variant detection logic designed
  - [ ] Variant relationships added to context
  - [ ] "Only X should vary" rule drafted
  - [ ] Rule tested with product groups

  **QA Scenarios**:
  ```
  Scenario: Variant detection accuracy
    Tool: Bash (Python script)
    Steps:
      1. Detect variants in test product groups
      2. Verify variant relationships are accurate
      3. Test consistency enforcement
    Expected: Accurate variant detection and enforcement
    Evidence: .sisyphus/evidence/task-8-variants.json
  ```

  **Commit**: NO (design and test)

- [ ] 9. Create Prompt v1 with optimizations
- [x] 9. Create Prompt v1 with optimizations (COMPLETED)
- [x] 9. Create Prompt v1 with optimizations

  **What to do**:
  - Integrate all optimizations into new system prompt
  - Add structured consistency examples
  - Update sibling context size if needed
  - Add batch processing instructions
  - Add variant relationship context
  - Save as Prompt v1

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**: Wave 2
  - **Can Run In Parallel**: NO (depends on 5-8)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 5-8

  **Acceptance Criteria**:
  - [ ] Prompt v1 created with all optimizations
  - [ ] Prompt saved to file
  - [ ] Changes from baseline documented
  - [ ] Prompt ready for testing

  **QA Scenarios**:
  ```
  Scenario: Prompt v1 completeness
    Tool: Manual review
    Steps:
      1. Review Prompt v1 against optimization list
      2. Verify all enhancements included
      3. Check prompt length is reasonable
    Expected: Complete optimized prompt ready for testing
    Evidence: .sisyphus/evidence/task-9-prompt-v1.txt
  ```

  **Commit**: YES
  - Message: `feat(consolidation): add optimized system prompt v1 for batch extraction`
  - Files: `.sisyphus/drafts/prompt-v1-optimized.txt`

- [ ] 9a. Test Gemini vs OpenAI for search ranking
- [x] 9a. Test Gemini vs OpenAI for search ranking (COMPLETED)
- [x] 9a. Test Gemini vs OpenAI for search ranking

  **What to do**:
  - Create search ranking test harness using both providers
  - Test source selection prompts with Gemini (`gemini-3.1-flash-lite-preview`)
  - Test same prompts with OpenAI (`gpt-4o-mini`)
  - Compare accuracy, latency, and cost
  - Document which provider performs better for search ranking

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `gemini-api-dev`, `openai-docs`

  **Parallelization**: Wave 2 Extension
  - **Can Run In Parallel**: YES (with 5-9, 9b-9c)
  - **Blocks**: Task 12
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] Search ranking tests run with both providers
  - [ ] Accuracy metrics compared (correct source selection %)
  - [ ] Latency measured for both providers
  - [ ] Cost per query calculated
  - [ ] Recommendation documented

  **References**:
  - Search prompt: `apps/scraper/docs/prompt_design_v2.md` lines 20-53
  - LLM runtime: `apps/scraper/scrapers/ai_search/llm_runtime.py`

  **QA Scenarios**:
  ```
  Scenario: Search provider comparison
    Tool: Bash (Python script)
    Steps:
      1. Run search ranking with Gemini
      2. Run search ranking with OpenAI
      3. Compare accuracy on 20+ test cases
      4. Measure response times
    Expected: Clear winner or specific use cases for each
    Evidence: .sisyphus/evidence/task-9a-search-comparison.json
  ```

  **Commit**: YES
  - Message: `test(scraper): add Gemini vs OpenAI search ranking comparison`
  - Files: `.sisyphus/drafts/search-provider-comparison.md`

- [ ] 9b. Compare crawl4ai extraction modes
- [x] 9b. Compare crawl4ai extraction modes (COMPLETED)
- [x] 9b. Compare crawl4ai extraction modes

  **What to do**:
  - Test crawl4ai LLM-free mode on sample product pages
  - Test crawl4ai LLM mode with OpenAI fallback
  - Measure extraction accuracy for each mode
  - Calculate cost per extraction
  - Determine optimal mode configuration

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `crawl4ai`

  **Parallelization**: Wave 2 Extension
  - **Can Run In Parallel**: YES (with 5-9, 9a, 9c)
  - **Blocks**: Task 12
  - **Blocked By**: Task 2

  **Acceptance Criteria**:
  - [ ] LLM-free mode tested on 20+ pages
  - [ ] LLM mode tested on same pages
  - [ ] Extraction accuracy compared per field
  - [ ] Cost per page calculated
  - [ ] Optimal mode strategy documented

  **References**:
  - crawl4ai engine: `apps/scraper/src/crawl4ai_engine/`
  - Extraction instruction: `apps/scraper/docs/prompt_design_v2.md` lines 67-119

  **QA Scenarios**:
  ```
  Scenario: Extraction mode comparison
    Tool: Bash (Python script)
    Steps:
      1. Extract data from test URLs using llm-free mode
      2. Extract same URLs using llm mode
      3. Compare field completeness and accuracy
      4. Calculate costs
    Expected: Clear recommendation on when to use each mode
    Evidence: .sisyphus/evidence/task-9b-extraction-modes.json
  ```

  **Commit**: YES
  - Message: `test(scraper): add crawl4ai extraction mode comparison`
  - Files: `.sisyphus/drafts/extraction-mode-comparison.md`

- [ ] 9c. Measure multi-provider cost/accuracy trade-offs
- [x] 9c. Measure multi-provider cost/accuracy trade-offs

  **What to do**:
  - Calculate end-to-end costs for different provider combinations
  - Test full pipeline: Search → Extraction → Consolidation
  - Compare accuracy across full pipeline
  - Create cost/accuracy matrix
  - Recommend optimal multi-provider configuration

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `gemini-api-dev`, `openai-docs`

  **Parallelization**: Wave 2 Extension
  - **Can Run In Parallel**: YES (with 5-9, 9a-9b)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 9a, 9b

  **Acceptance Criteria**:
  - [ ] End-to-end costs calculated for 3+ provider combinations
  - [ ] Full pipeline accuracy measured
  - [ ] Cost/accuracy matrix created
  - [ ] Optimal configuration recommended

  **QA Scenarios**:
  ```
  Scenario: End-to-end cost/accuracy analysis
    Tool: Bash (Python script)
    Steps:
      1. Run full pipeline with Provider Combination A
      2. Run full pipeline with Provider Combination B
      3. Compare total costs and final accuracy
      4. Identify optimal configuration
    Expected: Clear cost/accuracy trade-off analysis
    Evidence: .sisyphus/evidence/task-9c-cost-accuracy-matrix.json
  ```

  **Commit**: YES
  - Message: `test(consolidation): add multi-provider cost/accuracy analysis`
  - Files: `.sisyphus/drafts/provider-cost-accuracy-matrix.md`

### Wave 3: Validation & Iteration

- [ ] 10. Test Prompt v1 against same product groups
- [x] 10. Test Prompt v1 against same product groups

  **What to do**:
  - Run same 5 product groups with Prompt v1
  - Use identical test conditions as baseline
  - Record all API responses
  - Calculate Prompt v1 metrics

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `gemini-api-dev`

  **Parallelization**: Wave 3
  - **Can Run In Parallel**: NO (depends on Task 9)
  - **Blocks**: Task 11, 12
  - **Blocked By**: Task 9

  **Acceptance Criteria**:
  - [ ] 5 product groups tested with Prompt v1
  - [ ] All responses saved
  - [ ] No errors in API calls
  - [ ] Data ready for comparison

  **QA Scenarios**:
  ```
  Scenario: Prompt v1 test execution
    Tool: Bash (Python script)
    Steps:
      1. Run Prompt v1 tests on 5 product groups
      2. Verify all complete successfully
      3. Save responses
    Expected: 5/5 tests complete, data captured
    Evidence: .sisyphus/evidence/task-10-promptv1/
  ```

  **Commit**: NO (test results)

- [ ] 11. Calculate Prompt v1 consistency metrics
- [x] 11. Calculate Prompt v1 consistency metrics

  **What to do**:
  - Analyze Prompt v1 test results
  - Calculate same metrics as baseline
  - Compare metric values
  - Identify improvements and regressions

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**: Wave 3
  - **Can Run In Parallel**: NO (depends on Task 10)
  - **Blocks**: Task 12
  - **Blocked By**: Task 10

  **Acceptance Criteria**:
  - [ ] All metrics calculated for Prompt v1
  - [ ] Comparison with baseline completed
  - [ ] Improvements identified
  - [ ] Any regressions flagged

  **QA Scenarios**:
  ```
  Scenario: Metrics comparison
    Tool: Bash (Python script)
    Steps:
      1. Calculate Prompt v1 metrics
      2. Compare to baseline
      3. Calculate improvement percentages
    Expected: Clear before/after comparison
    Evidence: .sisyphus/evidence/task-11-comparison.json
  ```

  **Commit**: NO (analysis)

- [ ] 12. Compare v1 vs baseline performance
- [x] 12. Compare v1 vs baseline performance

  **What to do**:
  - Create detailed comparison report
  - Analyze improvements by metric
  - Identify areas needing further optimization
  - Document unexpected behaviors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**: Wave 3
  - **Can Run In Parallel**: NO (depends on Task 4, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 4, 11

  **Acceptance Criteria**:
  - [ ] Comparison report created
  - [ ] Improvements quantified
  - [ ] Problem areas identified
  - [ ] Recommendations documented

  **QA Scenarios**:
  ```
  Scenario: Comparison report completeness
    Tool: Manual review
    Steps:
      1. Review comparison report
      2. Verify all metrics compared
      3. Check for actionable insights
    Expected: Comprehensive comparison with clear findings
    Evidence: .sisyphus/evidence/task-12-comparison-report.md
  ```

  **Commit**: YES
  - Message: `docs(consolidation): add Prompt v1 vs baseline comparison report`
  - Files: `.sisyphus/drafts/prompt-v1-comparison.md`

- [ ] 13. Iterate on underperforming areas
- [x] 13. Iterate on underperforming areas (SKIPPED - Prompt v1 already optimal)

  **What to do**:
  - Identify metrics below target (brand < 95%, category < 90%, name < 85%)
  - Design targeted improvements for underperforming areas
  - Create Prompt v1.1 or v2 if needed
  - Test improvements

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `gemini-api-dev`

  **Parallelization**: Wave 3
  - **Can Run In Parallel**: NO (depends on Task 12)
  - **Blocks**: Task 14
  - **Blocked By**: Task 12

  **Acceptance Criteria**:
  - [ ] Underperforming areas identified
  - [ ] Targeted improvements designed
  - [ ] Improvements tested
  - [ ] Metrics meet targets OR documented as acceptable

  **QA Scenarios**:
  ```
  Scenario: Iteration effectiveness
    Tool: Bash (Python script)
    Steps:
      1. Test improved prompts on problem areas
      2. Verify metric improvements
      3. Confirm targets met
    Expected: Metrics meet or exceed targets
    Evidence: .sisyphus/evidence/task-13-iteration.json
  ```

  **Commit**: NO (iterative testing)

- [ ] 14. Finalize Prompt v2 if needed
- [x] 14. Finalize Prompt v2 if needed (SKIPPED - Prompt v1 is production-ready)

  **What to do**:
  - If iteration was needed, create Prompt v2
  - Finalize optimized prompt version
  - Document final version
  - Prepare for production

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**: Wave 3
  - **Can Run In Parallel**: NO (depends on Task 13)
  - **Blocks**: Task 15-18
  - **Blocked By**: Task 13

  **Acceptance Criteria**:
  - [ ] Final optimized prompt created
  - [ ] All targets met
  - [ ] Documented and ready for production

  **QA Scenarios**:
  ```
  Scenario: Final prompt validation
    Tool: Manual review
    Steps:
      1. Review final prompt
      2. Verify all optimizations included
      3. Confirm production readiness
    Expected: Production-ready optimized prompt
    Evidence: .sisyphus/evidence/task-14-final-prompt.txt
  ```

  **Commit**: YES
  - Message: `feat(consolidation): finalize optimized system prompt v2`
  - Files: `apps/web/lib/consolidation/prompts/optimized-v2.txt`

### Wave 4: Documentation & Integration

- [ ] 15. Document all prompt versions
- [x] 15. Document all prompt versions

  **What to do**:
  - Create comprehensive prompt version history
  - Document baseline prompt
  - Document Prompt v1 changes
  - Document Prompt v2 changes (if applicable)
  - Include rationale for each change

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**: Wave 4
  - **Can Run In Parallel**: YES (with 16-18)
  - **Blocks**: None
  - **Blocked By**: Task 14

  **Acceptance Criteria**:
  - [ ] All prompt versions documented
  - [ ] Change rationale included
  - [ ] Version history clear and complete

  **Commit**: YES
  - Message: `docs(consolidation): document prompt version history`
  - Files: `apps/web/lib/consolidation/docs/prompt-versions.md`

- [ ] 16. Create performance comparison report
- [x] 16. Create performance comparison report

  **What to do**:
  - Create detailed before/after performance report
  - Include all metrics
  - Include charts/graphs if helpful
  - Document cost implications
  - Document latency implications

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**: Wave 4
  - **Can Run In Parallel**: YES (with 15, 17-18)
  - **Blocks**: None
  - **Blocked By**: Task 12

  **Acceptance Criteria**:
  - [ ] Performance report complete
  - [ ] All metrics visualized
  - [ ] Cost analysis included
  - [ ] Recommendations provided

  **Commit**: YES
  - Message: `docs(consolidation): add performance comparison report`
  - Files: `apps/web/lib/consolidation/docs/performance-report.md`

- [ ] 17. Write implementation guide for production
- [x] 17. Write implementation guide for production

  **What to do**:
  - Document how to integrate optimized prompt into production
  - Include migration steps
  - Include rollback procedure
  - Include monitoring recommendations

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**: Wave 4
  - **Can Run In Parallel**: YES (with 15-16, 18)
  - **Blocks**: None
  - **Blocked By**: Task 14

  **Acceptance Criteria**:
  - [ ] Implementation guide complete
  - [ ] Migration steps documented
  - [ ] Rollback procedure included
  - [ ] Monitoring guidance provided

  **Commit**: YES
  - Message: `docs(consolidation): add implementation guide for optimized prompts`
  - Files: `apps/web/lib/consolidation/docs/implementation-guide.md`

- [ ] 18. Update prompt_design_v2.md with findings
- [x] 18. Update prompt_design_v2.md with findings

  **What to do**:
  - Update existing prompt_design_v2.md
  - Add learnings from finetuning
  - Update expected impact estimates
  - Add Gemini-specific recommendations

  **Recommended Agent Profile**:
  - **Category**: `writing`

  **Parallelization**: Wave 4
  - **Can Run In Parallel**: YES (with 15-17)
  - **Blocks**: None
  - **Blocked By**: Task 14

  **Acceptance Criteria**:
  - [ ] prompt_design_v2.md updated
  - [ ] Findings from testing included
  - [ ] Recommendations updated
  - [ ] Gemini-specific notes added

  **References**:
  - File: `apps/scraper/docs/prompt_design_v2.md`

  **Commit**: YES
  - Message: `docs(scraper): update prompt_design_v2 with finetuning findings`
  - Files: `apps/scraper/docs/prompt_design_v2.md`

### Wave FINAL: Review & Handoff

- [ ] F1. Code quality review - `unspecified-high`
- [x] F1. Code quality review - `unspecified-high` (PASS)
- [x] F1. Code quality review - `unspecified-high` (PASS)

  Read all modified files, check for:
  - Proper error handling
  - No hardcoded secrets
  - Clean code structure
  - Follows project conventions

  Output: Quality report with PASS/FAIL

- [ ] F2. Test coverage validation - `unspecified-high`
- [x] F2. Test coverage validation - `unspecified-high` (PASS)
- [x] F2. Test coverage validation - `unspecified-high` (PASS)

  Verify:
  - All test scenarios executed
  - Evidence files exist
  - Metrics calculated correctly
  - No missing test cases

  Output: Coverage report

- [ ] F3. Documentation review - `unspecified-high`
- [x] F3. Documentation review - `unspecified-high` (PASS)
- [x] F3. Documentation review - `unspecified-high` (PASS)

  Review all documentation:
  - Version history complete
  - Performance report clear
  - Implementation guide actionable
  - No missing information

  Output: Documentation completeness report

- [ ] F4. Scope fidelity check - `deep`
- [x] F4. Scope fidelity check - `deep` (APPROVE)
- [x] F4. Scope fidelity check - `deep` (APPROVE)

  Verify:
  - All deliverables complete
  - Metrics targets met
  - No scope creep
  - Ready for production

  Output: Fidelity report with APPROVE/REJECT

---

## Commit Strategy

- **Wave 1**: No commits (test setup and baseline)
- **Wave 2**: `feat(consolidation): add optimized system prompt v1 for batch extraction`
- **Wave 3**: `docs(consolidation): add Prompt v1 vs baseline comparison report`
- **Wave 3**: `feat(consolidation): finalize optimized system prompt v2` (if iteration needed)
- **Wave 4**: `docs(consolidation): document prompt version history`
- **Wave 4**: `docs(consolidation): add performance comparison report`
- **Wave 4**: `docs(consolidation): add implementation guide for optimized prompts`
- **Wave 4**: `docs(scraper): update prompt_design_v2 with finetuning findings`

---

## Success Criteria

### Verification Commands

```bash
# Run test harness
python apps/web/lib/consolidation/__tests__/test_harness.py --baseline

# Calculate metrics
python apps/web/lib/consolidation/__tests__/calculate_metrics.py --compare

# View comparison report
cat apps/web/lib/consolidation/docs/performance-report.md
```

### Final Checklist

- [ ] Baseline tests completed with metrics documented
- [ ] Prompt v1 created with optimizations
- [ ] Prompt v1 tested and metrics calculated
- [ ] Comparison report shows clear improvements
- [ ] All targets met (brand ≥95%, category ≥90%, name ≥85%)
- [ ] All prompt versions documented
- [ ] Performance comparison report complete
- [ ] Implementation guide ready
- [ ] prompt_design_v2.md updated
- [ ] All evidence files captured
- [ ] Ready for production integration

---

## API Key Usage

**Gemini API Key**: [GEMINI_API_KEY]

**Usage Guidelines**:
- Store in environment variable: `GEMINI_API_KEY`
- Use `gemini-3.1-flash-lite-preview` for cost-efficient testing
- Estimated usage: ~100-200 API calls for full test suite
- Monitor usage to stay within free tier limits

---

## Risk Mitigation

**Risk**: API rate limits during testing
- **Mitigation**: Use gemini-3.1-flash-lite-preview, add delays between calls, cache responses

**Risk**: Inconsistent LLM responses
- **Mitigation**: Run multiple test rounds, use temperature=0 for consistency, document variance

**Risk**: Test data not representative
- **Mitigation**: Use diverse product groups, include edge cases, document data limitations

**Risk**: Optimization doesn't improve metrics
- **Mitigation**: Document negative results, analyze why, try alternative approaches

---

## Next Steps After Completion

1. Review plan with user
2. Execute `/start-work` to begin implementation
3. Run test harness and collect baseline
4. Iterate on prompt optimizations
5. Document final results
6. Present to user for approval
7. Integrate optimized prompts into production

