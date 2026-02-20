# AI Discovery System Prompt Optimization

## TL;DR

> **Quick Summary**: Optimize AI Discovery prompts (source selection + extraction) to achieve highest accuracy on product data extraction. Run real tests with 10 live SKUs from the ingestion pipeline to validate improvements.
> 
> **Deliverables**: 
> - Optimized source selection prompt (prompt_v3_final)
> - Optimized extraction prompt with SKU validation
> - Ground truth reference JSON (user-provided)
> - Test results for v1 (baseline), v2, v3 iterations
> - Accuracy/cost comparison report
> 
> **Estimated Effort**: Medium (4-5 hours execution)
> **Parallel Execution**: NO - sequential iterations with analysis between
> **Critical Path**: Ground truth creation → Baseline test → Prompt v2 → Prompt v3 → Final verification

---

## Context

### Original Request
Optimize the AI Discovery System Prompt to be as powerful as possible. Run real tests with actual products from the ingestion pipeline before finalizing to avoid wasting resources.

### Interview Summary
**Key Decisions**:
- **Focus Area**: AI Discovery prompts (source selection + extraction), NOT consolidation
- **Success Metric**: Highest accuracy with cost balance (stop if >$0.10/product)
- **Test SKUs**: First 10 from products_ingestion table
- **Budget**: $5 total for all test iterations
- **Accuracy Thresholds**: Brand ≥90%, Name ≥85%, Price ≥80%, Images ≥90%, Description ≥70%, Availability ≥75%
- **Ground Truth**: User will manually provide correct data for all 10 SKUs
- **SKU Validation**: Yes, fuzzy match on extracted pages
- **Cost Control**: Balance accuracy/cost, optimize until cost exceeds $0.10/product

### Research Findings

**Current Implementation** (BayStateScraper/scrapers/ai_discovery.py):
- **Source Selection** (lines 332-351): GPT-4o-mini ranks Brave Search results, picks best official page
- **Extraction** (lines 430-443): browser-use Agent extracts 6 fields (product_name, brand, price, description, images, availability)
- **Confidence Calculation** (line 476): Naive field-counting (filled fields / total fields)

**Test SKUs from Ingestion Pipeline**:
| SKU | Product Name | Challenge |
|-----|--------------|-----------|
| 032247886598 | BROWN MULCH 1.5 CUFT SCOTTS NATURESCAPES | Garden product, abbreviated |
| 095668300593 | MANNA PRO DUCK START /GRO CR 8LB | Pet food, null brand |
| 032247761215 | SPREADER SCOTTS TB E DGEGUARD MINI | Tool, unclear brand |
| 032247885591 | BLACK MULCH 1.5 CUFT SCOTTS NATURESCAPES | Garden product |
| 095668001032 | MANNA PRO FRMHS FAV MINI HRSE/DNKY 3LB | Abbreviated, null brand |
| 095668225308 | MANNA PRO 16% ALL FLOCK CR W/ PRO 8LB | Abbreviated, null brand |
| 032247278140 | MIRACLE GRO POTTING MIX 25QT | Garden product, null brand |
| 032247279048 | MIRACLE GRO POTTING MIX 50QT | Garden product, null brand |
| 032247884594 | RED MULCH 1.5 CUFT SCOTTS NATURESCAPES | Garden product |
| 095668302580 | MANNA PRO NUGGETS ALF/MOL 4LB | Pet food, abbreviated |

**Critical Challenge**: All 10 SKUs have null brand in DB - AI must infer from abbreviated product names.

### Metis Review

**Identified Gaps** (addressed in plan):
- ✅ Ground truth creation required before testing
- ✅ Accuracy thresholds defined per field
- ✅ Budget cap set ($5 total)
- ✅ SKU validation with fuzzy matching
- ✅ Cost/accuracy trade-off clarified
- ✅ Scope locked to Discovery only

**Guardrails Applied**:
- MUST NOT: Modify consolidation system
- MUST NOT: Add new extraction fields
- MUST NOT: Change AI model from gpt-4o-mini
- MUST: Track all costs via AICostTracker
- MUST: Version control prompts (v1, v2, v3)

---

## Work Objectives

### Core Objective
Optimize AI Discovery system prompts to achieve ≥90% brand accuracy and ≥85% product name accuracy across 10 representative SKUs, while keeping average cost ≤$0.10 per product.

### Concrete Deliverables
1. **Ground Truth JSON** (user-provided): `test_skus_ground_truth.json` with verified correct data
2. **Baseline Results** (prompt_v1): `results_baseline.json` - current prompt performance
3. **Iteration Results** (prompt_v2, v3): `results_v2.json`, `results_v3.json` - optimized performance
4. **Optimized Prompts**: Updated source selection and extraction prompts in `ai_discovery.py`
5. **Accuracy/Cost Report**: Comparison of all iterations with recommendations

### Definition of Done
- [ ] All 10 test SKUs have ground truth data
- [ ] Baseline test completed and recorded
- [ ] Prompt v2 shows measurable improvement over baseline
- [ ] Prompt v3 meets or exceeds accuracy thresholds
- [ ] Average cost ≤$0.10 per product
- [ ] User approves final prompts

### Must Have
- Source selection prompt optimized for manufacturer site detection
- Extraction prompt with fuzzy SKU validation
- Brand inference from abbreviated product names
- Cost tracking and reporting
- Version-controlled prompt iterations

### Must NOT Have (Guardrails)
- Changes to consolidation system
- New extraction fields beyond 6 existing
- AI model changes (gpt-4o-mini only)
- Database schema modifications
- Anti-bot detection improvements (document only)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES - AIDiscoveryScraper exists in BayStateScraper
- **Automated tests**: NO - Manual verification with ground truth
- **Framework**: Direct Python execution with validation scripts
- **Agent-Executed QA**: YES - Each task includes executable verification

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **Source Selection**: Verify Brave API returns results, LLM ranks correctly
- **Extraction**: browser-use Agent extracts all fields, SKU validation passes
- **Accuracy**: Compare against ground truth JSON
- **Cost**: Verify AICostTracker reports ≤$0.10/product
- **Evidence**: All results saved to `.sisyphus/evidence/`

---

## Execution Strategy

### Sequential Iteration Plan

This work requires sequential iterations - each prompt version must be tested and analyzed before refining:

```
Phase 1 (Foundation):
├── Task 1: Create ground truth reference
├── Task 2: Verify test environment (API keys, dependencies)
└── Task 3: Run baseline test (prompt_v1)

Phase 2 (Iteration 1):
├── Task 4: Analyze baseline results
├── Task 5: Design prompt_v2 improvements
├── Task 6: Implement prompt_v2
└── Task 7: Test prompt_v2

Phase 3 (Iteration 2):
├── Task 8: Analyze v2 results
├── Task 9: Design prompt_v3 improvements
├── Task 10: Implement prompt_v3
└── Task 11: Test prompt_v3

Phase 4 (Finalization):
├── Task 12: Compare all iterations
├── Task 13: Document final recommendations
└── Task 14: Create PR with optimized prompts

Critical Path: Task 1 → Task 3 → Task 7 → Task 11 → Task 14
Budget Constraint: $5 total across all test runs
Time Constraint: ~15 min per test run, 45 min analysis per iteration
```

### Dependency Matrix

- **Task 1**: — — Task 2, 3
- **Task 3**: 1, 2 — 4, 5
- **Task 7**: 5, 6 — 8, 9
- **Task 11**: 9, 10 — 12, 13, 14

---

## TODOs

- [x] 1. Create Ground Truth Reference Data

  **What to do**:
  - User manually researches each of the 10 test SKUs to find correct product data
  - For each SKU, find: official product page, correct brand, full product name, price, description, image URLs, availability
  - Create `test_skus_ground_truth.json` with verified data
  - Format: `{ "sku": "032247886598", "brand": "Scotts", "name": "NatureScapes Brown Mulch 1.5 cu ft", ... }`

  **Must NOT do**:
  - Do NOT use AI to generate ground truth (must be human-verified)
  - Do NOT skip any of the 10 SKUs
  - Do NOT guess - only record verified data from official sources

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Task is data collection and JSON creation
  - **Skills**: []
    - No skills needed - user provides data

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3, 4, 7, 11
  - **Blocked By**: None (user task)

  **Acceptance Criteria**:
  - [ ] `test_skus_ground_truth.json` exists in BayStateScraper/tests/fixtures/
  - [ ] All 10 SKUs have complete data (brand, name, price, description, images, availability)
  - [ ] Data sourced from official manufacturer websites
  - [ ] JSON validates against schema (no missing required fields)

  **QA Scenarios**:
  ```
  Scenario: Ground truth file validation
    Tool: Bash (jq)
    Preconditions: test_skus_ground_truth.json exists
    Steps:
      1. Run: cat test_skus_ground_truth.json | jq 'length' → returns 10
      2. Run: cat test_skus_ground_truth.json | jq '.[].brand' | grep -v null | wc -l → returns 10
      3. Run: cat test_skus_ground_truth.json | jq '.[].name' | grep -v null | wc -l → returns 10
    Expected Result: All 10 SKUs have brand and name fields
    Evidence: .sisyphus/evidence/task-1-ground-truth-validation.json
  ```

  **Evidence to Capture**:
  - [ ] Ground truth JSON file
  - [ ] Validation output showing all 10 SKUs complete

  **Commit**: NO (data file, not code)

- [x] 2. Verify Test Environment

  **What to do**:
  - Check that BRAVE_API_KEY environment variable is set
  - Check that OPENAI_API_KEY environment variable is set
  - Verify browser-use package is installed
  - Run quick connectivity test to Brave Search API
  - Run quick connectivity test to OpenAI API
  - Document any missing dependencies or configuration issues

  **Must NOT do**:
  - Do NOT proceed with testing if API keys are missing
  - Do NOT modify .env files (document only)
  - Do NOT install packages without user approval

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple verification tasks
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None

  **References**:
  - `BayStateScraper/scrapers/ai_discovery.py:229-234` - Brave API key usage
  - `BayStateScraper/scrapers/ai_discovery.py:307-311` - OpenAI API key usage
  - `BayStateScraper/requirements.txt` - browser-use dependency

  **Acceptance Criteria**:
  - [ ] BRAVE_API_KEY is set and non-empty
  - [ ] OPENAI_API_KEY is set and non-empty
  - [ ] browser-use package import succeeds
  - [ ] Brave Search API returns 200 OK (test query: "test")
  - [ ] OpenAI API returns 200 OK (test request to gpt-4o-mini)

  **QA Scenarios**:
  ```
  Scenario: API connectivity check
    Tool: Bash (curl + python)
    Preconditions: Environment variables set
    Steps:
      1. Run: echo $BRAVE_API_KEY | head -c 10 → shows first 10 chars
      2. Run: python -c "import browser_use; print('OK')" → outputs "OK"
      3. Run: python scripts/test_brave_api.py → returns 200 status
      4. Run: python scripts/test_openai_api.py → returns valid response
    Expected Result: All connectivity tests pass
    Evidence: .sisyphus/evidence/task-2-api-tests.log
  ```

  **Evidence to Capture**:
  - [ ] API connectivity test results
  - [ ] Package import verification

  **Commit**: NO (verification only)

- [x] 3. Run Baseline Test (Prompt v1 - Current)

  **What to do**:
  - Execute current ai_discovery.py prompts against all 10 test SKUs
  - Record results to `results_baseline.json`
  - Track cost per SKU using AICostTracker
  - Track time per SKU
  - Record browser steps taken per extraction
  - Document any failures or errors

  **Must NOT do**:
  - Do NOT modify ai_discovery.py (use current code)
  - Do NOT skip failed extractions (record as failures)
  - Do NOT use cache (force fresh searches)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires running actual browser automation with AI
  - **Skills**: []
    - No additional skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4, 5
  - **Blocked By**: Task 1, Task 2

  **References**:
  - `BayStateScraper/scrapers/ai_discovery.py:117-191` - main scrape_product flow
  - `BayStateScraper/scrapers/ai_discovery.py:214-272` - Brave Search implementation
  - `BayStateScraper/scrapers/ai_discovery.py:288-368` - source selection
  - `BayStateScraper/scrapers/ai_discovery.py:397-499` - extraction

  **Acceptance Criteria**:
  - [ ] All 10 SKUs processed (success or failure)
  - [ ] results_baseline.json created with complete data
  - [ ] Cost tracked for each SKU (total cost ≤$1.50 for this run)
  - [ ] Time tracked for each SKU
  - [ ] Source URLs recorded for each successful extraction
  - [ ] Error messages recorded for failed extractions

  **QA Scenarios**:
  ```
  Scenario: Baseline test execution
    Tool: Bash (python)
    Preconditions: Task 1 and 2 complete, API keys set
    Steps:
      1. Run: python scripts/run_baseline_test.py --skus test_skus.json --output results_baseline.json
      2. Wait for completion (~10-15 minutes)
      3. Verify: cat results_baseline.json | jq 'length' → returns 10
      4. Verify: cat results_baseline.json | jq '[.[].cost_usd] | add' → returns total cost
    Expected Result: 10 results, total cost ≤$1.50
    Evidence: .sisyphus/evidence/task-3-baseline-results.json
  ```

  **Evidence to Capture**:
  - [ ] results_baseline.json
  - [ ] Cost summary
  - [ ] Execution time log
  - [ ] Any error screenshots or logs

  **Commit**: YES
  - Message: `test(ai-discovery): add baseline test results for prompt optimization`
  - Files: `BayStateScraper/tests/results/results_baseline.json`, `scripts/run_baseline_test.py`

- [x] 4. Analyze Baseline Results

  **What to do**:
  - Compare baseline results against ground truth
  - Calculate accuracy for each field (brand, name, price, description, images, availability)
  - Identify failure patterns:
    - Which SKUs failed completely?
    - Which fields had lowest accuracy?
    - Common source selection errors?
    - Common extraction errors?
  - Document root causes:
    - Source selection picked wrong sites?
    - Extraction missed fields?
    - Brand inference failed?
    - SKU validation would have caught errors?
  - Create analysis report with specific improvement recommendations

  **Must NOT do**:
  - Do NOT modify prompts yet (analysis only)
  - Do NOT skip failed SKUs in analysis
  - Do NOT make assumptions without evidence

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires deep analysis of results, pattern recognition, root cause analysis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:
  - `test_skus_ground_truth.json` - ground truth data
  - `results_baseline.json` - baseline results
  - Accuracy thresholds from requirements

  **Acceptance Criteria**:
  - [ ] Per-field accuracy calculated:
    - Brand: X% (target: ≥90%)
    - Name: X% (target: ≥85%)
    - Price: X% (target: ≥80%)
    - Images: X% (target: ≥90%)
    - Description: X% (target: ≥70%)
    - Availability: X% (target: ≥75%)
  - [ ] Failure patterns documented (≥3 specific issues identified)
  - [ ] Root causes explained with evidence from logs
  - [ ] Specific improvement recommendations (≥5 actionable items)
  - [ ] Analysis report saved to `analysis_baseline.md`

  **QA Scenarios**:
  ```
  Scenario: Accuracy calculation
    Tool: Bash (python)
    Preconditions: results_baseline.json and ground_truth.json exist
    Steps:
      1. Run: python scripts/analyze_results.py --baseline results_baseline.json --ground-truth ground_truth.json --output analysis_baseline.md
      2. Verify: analysis_baseline.md contains accuracy percentages
      3. Verify: analysis_baseline.md lists ≥3 failure patterns
      4. Verify: analysis_baseline.md has ≥5 improvement recommendations
    Expected Result: Complete analysis with actionable insights
    Evidence: .sisyphus/evidence/task-4-analysis-report.md
  ```

  **Evidence to Capture**:
  - [ ] analysis_baseline.md
  - [ ] Accuracy calculations
  - [ ] Failure pattern examples

  **Commit**: YES
  - Message: `docs(ai-discovery): add baseline analysis with accuracy metrics`
  - Files: `BayStateScraper/tests/analysis/analysis_baseline.md`

- [x] 5. Design Prompt v2 Improvements

  **What to do**:
  Based on baseline analysis, design specific improvements to both prompts:
  
  **Source Selection Prompt improvements**:
  - Add domain authority scoring (prioritize manufacturer sites)
  - Add retailer preference tiers (manufacturer > major retailer > affiliate)
  - Include page content quality signals in ranking
  - Better brand inference from search result titles/descriptions
  - Handle null brand gracefully (infer from product name)
  
  **Extraction Prompt improvements**:
  - Add fuzzy SKU validation instruction
  - Better brand inference rules (extract from product name if null)
  - Price normalization rules (handle ranges, currency symbols)
  - Image quality prioritization (primary image first)
  - Handle multi-variant products gracefully
  - Better error handling instructions
  
  Document the new prompt designs in `prompt_design_v2.md`.

  **Must NOT do**:
  - Do NOT implement yet (design only)
  - Do NOT add new extraction fields
  - Do NOT change AI model

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires prompt engineering expertise and understanding of LLM behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `analysis_baseline.md` - failure patterns and root causes
  - `BayStateScraper/scrapers/ai_discovery.py:332-351` - current source selection prompt
  - `BayStateScraper/scrapers/ai_discovery.py:430-443` - current extraction prompt

  **Acceptance Criteria**:
  - [ ] Source selection prompt v2 design documented
  - [ ] Extraction prompt v2 design documented
  - [ ] Each improvement linked to specific baseline failure
  - [ ] Expected accuracy improvement estimated per field

  **QA Scenarios**:
  ```
  Scenario: Prompt design validation
    Tool: Read
    Preconditions: analysis_baseline.md exists
    Steps:
      1. Read: prompt_design_v2.md
      2. Verify: Contains source selection prompt v2
      3. Verify: Contains extraction prompt v2
      4. Verify: Each improvement references analysis_baseline.md issue
    Expected Result: Complete prompt designs with rationale
    Evidence: .sisyphus/evidence/task-5-prompt-design-v2.md
  ```

  **Evidence to Capture**:
  - [ ] prompt_design_v2.md

  **Commit**: YES
  - Message: `docs(ai-discovery): design prompt v2 improvements`
  - Files: `BayStateScraper/docs/prompt_design_v2.md`

- [x] 6. Implement Prompt v2

  **What to do**:
  - Update `_identify_best_source()` method in ai_discovery.py with new source selection prompt
  - Update `_extract_product_data()` method in ai_discovery.py with new extraction prompt
  - Add SKU validation logic with fuzzy matching
  - Add brand inference from product name when null
  - Ensure all changes are backward compatible
  - Add version comment to prompts ("# Prompt v2 - Optimized for manufacturer site detection")
  - Test that code still runs without errors (syntax check)

  **Must NOT do**:
  - Do NOT change function signatures
  - Do NOT modify other methods
  - Do NOT break existing tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Implementation of documented designs, straightforward edits
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **References**:
  - `prompt_design_v2.md` - documented designs
  - `BayStateScraper/scrapers/ai_discovery.py:288-368` - _identify_best_source method
  - `BayStateScraper/scrapers/ai_discovery.py:397-499` - _extract_product_data method

  **Acceptance Criteria**:
  - [ ] Source selection prompt updated (lines ~332-351 area)
  - [ ] Extraction prompt updated (lines ~430-443 area)
  - [ ] SKU validation added to extraction logic
  - [ ] Brand inference added when null
  - [ ] Code passes syntax check

  **QA Scenarios**:
  ```
  Scenario: Prompt v2 implementation
    Tool: Bash (python + diff)
    Preconditions: prompt_design_v2.md exists
    Steps:
      1. Edit: ai_discovery.py with new prompts
      2. Run: python -m py_compile BayStateScraper/scrapers/ai_discovery.py
      3. Run: git diff BayStateScraper/scrapers/ai_discovery.py > changes_v2.diff
    Expected Result: Clean implementation, no syntax errors
    Evidence: .sisyphus/evidence/task-6-implementation-v2.diff
  ```

  **Commit**: YES
  - Message: `feat(ai-discovery): implement prompt v2 with SKU validation`
  - Files: `BayStateScraper/scrapers/ai_discovery.py`
  - Pre-commit: `python -m py_compile BayStateScraper/scrapers/ai_discovery.py`

- [ ] 7. Test Prompt v2

  **What to do**:
  - Run prompt v2 against all 10 test SKUs
  - Record results to `results_v2.json`
  - Track cost per SKU
  - Compare results to baseline
  - Verify cost is still ≤$0.10 per product average

  **Must NOT do**:
  - Do NOT modify prompts during testing
  - Do NOT skip failed SKUs
  - Do NOT exceed budget

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Running actual browser automation with AI
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:
  - `BayStateScraper/scrapers/ai_discovery.py` - updated code
  - `test_skus_ground_truth.json` - ground truth
  - `results_baseline.json` - baseline for comparison

  **Acceptance Criteria**:
  - [ ] All 10 SKUs processed with prompt v2
  - [ ] results_v2.json created
  - [ ] Cost ≤budget for this run
  - [ ] Accuracy comparison vs baseline calculated

  **QA Scenarios**:
  ```
  Scenario: Prompt v2 test execution
    Tool: Bash (python)
    Preconditions: Task 6 complete
    Steps:
      1. Run: python scripts/run_prompt_test.py --version v2 --skus test_skus.json --output results_v2.json
      2. Run: python scripts/compare_versions.py --v1 results_baseline.json --v2 results_v2.json --output comparison_v1_v2.md
    Expected Result: 10 results, comparison report generated
    Evidence: .sisyphus/evidence/task-7-v2-results.json
  ```

  **Commit**: YES
  - Message: `test(ai-discovery): add prompt v2 test results`
  - Files: `BayStateScraper/tests/results/results_v2.json`

- [ ] 8. Analyze v2 Results

  **What to do**:
  - Compare v2 results against baseline and ground truth
  - Calculate accuracy per field for v2
  - Identify which improvements worked
  - Determine if accuracy thresholds are met
  - Document findings in v2 analysis report

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Analysis and pattern recognition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 9
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - [ ] v2 accuracy calculated per field
  - [ ] Comparison vs baseline documented
  - [ ] Cost per product calculated
  - [ ] Recommendations for v3 generated

  **Commit**: YES
  - Message: `docs(ai-discovery): add v2 analysis`
  - Files: `BayStateScraper/tests/analysis/analysis_v2.md`

- [ ] 9. Design Prompt v3 Improvements

  **What to do**:
  - Based on v2 analysis, design final improvements
  - Prioritize high-impact changes that didn't work in v2
  - Document final prompt designs

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Prompt engineering final design
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 10
  - **Blocked By**: Task 8

  **Commit**: YES
  - Message: `docs(ai-discovery): design prompt v3`
  - Files: `BayStateScraper/docs/prompt_design_v3.md`

- [ ] 10. Implement Prompt v3

  **What to do**:
  - Update ai_discovery.py with final prompts
  - Add version comment ("# Prompt v3 - Final optimized version")
  - Test syntax

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Implementation work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 11
  - **Blocked By**: Task 9

  **Commit**: YES
  - Message: `feat(ai-discovery): implement prompt v3 final`
  - Files: `BayStateScraper/scrapers/ai_discovery.py`

- [ ] 11. Test Prompt v3

  **What to do**:
  - Run final prompt against all 10 SKUs
  - Record results to `results_v3.json`
  - Compare to thresholds
  - Generate final comparison report

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Final test run
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 12
  - **Blocked By**: Task 10

  **Acceptance Criteria**:
  - [ ] All 10 SKUs processed
  - [ ] Final accuracy meets thresholds
  - [ ] Cost ≤$0.10/product

  **Commit**: YES
  - Message: `test(ai-discovery): add prompt v3 final results`
  - Files: `BayStateScraper/tests/results/results_v3.json`

- [ ] 12. Compare All Iterations

  **What to do**:
  - Create comprehensive comparison of v1, v2, v3
  - Calculate ROI per iteration
  - Document final recommendations

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Final analysis and synthesis
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocked By**: Task 11

  **Commit**: YES
  - Message: `docs(ai-discovery): add final comparison`
  - Files: `BayStateScraper/tests/analysis/final_comparison.md`

- [ ] 13. Document Final Recommendations

  **What to do**:
  - Document winning prompts inline in code
  - Write README update with findings
  - Create checklist for future optimization

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation
  - **Skills**: []

  **Commit**: YES
  - Message: `docs(ai-discovery): document final recommendations`
  - Files: `BayStateScraper/scrapers/ai_discovery.py`, `BayStateScraper/README.md`

- [ ] 14. Create PR with Optimized Prompts

  **What to do**:
  - Create Pull Request with all changes
  - Include test results and analysis
  - Request review

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Git operations
  - **Skills**: [`git-master`]

  **Commit**: YES
  - Message: `feat(ai-discovery): add optimized prompts`
  - Files: All changed files

---

## Final Verification Wave

- [ ] F1. **Budget Verification** — Total cost ≤$5
- [ ] F2. **Accuracy Threshold Verification** — v3 accuracy meets thresholds
- [ ] F3. **Code Quality Review** — Prompts documented, syntax clean
- [ ] F4. **Test Results Verification** — All result files exist

---

## Success Criteria

### Verification Commands
```bash
# Verify budget
python scripts/verify_budget.py --results results_v1.json,results_v2.json,results_v3.json

# Verify accuracy
python scripts/verify_accuracy.py --results results_v3.json --ground-truth ground_truth.json
```

### Final Checklist
- [ ] $5 budget not exceeded
- [ ] Accuracy thresholds met
- [ ] All test results saved
- [ ] Prompts documented inline
- [ ] PR created