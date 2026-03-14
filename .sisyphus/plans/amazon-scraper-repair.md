# Amazon Scraper Repair Plan

## TL;DR

> **Quick Summary**: Fix Amazon scraper returning wrong products by improving sponsored product filtering, adding product validation, and implementing result scoring to select the best match instead of just the first result.
> 
> **Deliverables**: 
> - Updated `apps/scraper/scrapers/configs/amazon.yaml` with improved workflow
> - Enhanced click handler with attribute-based sponsored detection
> - New validation action to verify product matches search query
> 
> **Estimated Effort**: Medium (3-4 hours)
> **Parallel Execution**: NO - sequential dependencies
> **Critical Path**: Config analysis → Handler enhancements → Validation logic → Testing

---

## Context

### Original Request
User reported Amazon scraper returns completely unrelated products:
- **Input**: `{"name": "BENTLEY SEED BROCCOL I GREEN SPROUTING", "price": 2.49}`
- **Output**: Label stickers product ("9527 Product 30 up 1 x 2-5/8 Sticker Labels...")
- **Expected**: Broccoli seeds product matching the search

### Interview Summary
**Key Findings**:
- Scraper uses product NAME as search query (`{{sku}}` contains full product name)
- Current sponsored filtering only checks text content (`filter_text_exclude: sponsored`)
- No validation that clicked result matches search query
- No result scoring - just clicks first non-sponsored link

**Research Findings**:
- Amazon sponsored products use CSS classes like `.AdHolder`, `[data-sponsored]`, not just text
- The `click` action supports `filter_text_exclude` but not attribute-based filtering
- No existing `validate_search_result` action for Amazon (unlike other scrapers)
- Config file: `apps/scraper/scrapers/configs/amazon.yaml`
- Click handler: `apps/scraper/scrapers/actions/handlers/click.py`

---

## Work Objectives

### Core Objective
Fix the Amazon scraper to return correct products by:
1. Properly filtering sponsored products using CSS selectors
2. Validating that the found product matches the search query
3. Implementing result scoring to select the best match

### Concrete Deliverables
- Updated `amazon.yaml` with improved selectors and workflow
- Enhanced click handler with attribute-based exclusion
- New validation action to verify product-title match

### Definition of Done
- [ ] Scraper correctly filters sponsored products
- [ ] Scraper validates product matches search query
- [ ] Scraper picks best matching result from search results
- [ ] Test with provided example returns broccoli seeds, not labels

### Must Have
- Sponsored product filtering by CSS class/attribute
- Product validation step after extraction
- Result scoring based on title similarity
- Fallback to try next result if first doesn't match

### Must NOT Have (Guardrails)
- NO changes to how SKU is passed (data issue, separate from scraper)
- NO changes to selector schema structure
- NO breaking changes to existing action handlers
- NO AI/LLM-based extraction (keep it fast and deterministic)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES - pytest configured
- **Automated tests**: YES (Tests after) - Add tests for new validation logic
- **Framework**: pytest
- **Agent-Executed QA**: YES - Run actual scraper against test products

### QA Policy
Every task includes agent-executed QA scenarios:
- **Scraper tests**: Run scraper with test SKUs, verify correct products returned
- **Unit tests**: Test validation logic with mock data
- **Integration tests**: Test full workflow end-to-end

---

## Execution Strategy

### Sequential Execution (Dependencies Required)

All tasks must run sequentially due to dependencies:

```
Wave 1: Analysis and Config Updates
├── Task 1: Analyze current config and Amazon page structure
└── Task 2: Update amazon.yaml with improved selectors

Wave 2: Handler Enhancements
├── Task 3: Enhance click handler with attribute-based filtering
└── Task 4: Create new validate_product_match action

Wave 3: Integration and Testing
├── Task 5: Add result scoring logic to workflow
└── Task 6: Test with provided example and test SKUs

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6
```

### Agent Dispatch Summary
- **All tasks**: `unspecified-high` - Complex scraper logic requiring deep understanding

---

## TODOs


- [ ] 1. Analyze Current Config and Amazon Page Structure

  **What to do**:
  - Read `apps/scraper/scrapers/configs/amazon.yaml` and document current workflow
  - Research Amazon search result page structure:
    - Find CSS selectors for sponsored products (`.AdHolder`, `[data-sponsored]`, etc.)
    - Find selectors for organic search results
    - Find selectors for product titles in search results
    - Document ASIN extraction from search results
  - Identify all points where sponsored products can be detected
  - Document the current click action parameters and their limitations

  **Must NOT do**:
  - Do NOT make any code changes yet
  - Do NOT modify the YAML file
  - Do NOT skip documenting the findings

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires deep understanding of scraper architecture and HTML/CSS
  - **Skills**: []
    - No special skills needed for analysis

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential - first task
  - **Blocks**: Task 2, Task 3, Task 4, Task 5, Task 6
  - **Blocked By**: None

  **References**:
  - `apps/scraper/scrapers/configs/amazon.yaml` - Current Amazon scraper config
  - `apps/scraper/scrapers/actions/handlers/click.py` - Click action implementation
  - Amazon search results page structure (research via browser or documentation)
  - Look at other scrapers with `validate_search_result` action for patterns

  **WHY Each Reference Matters**:
  - Current config shows the workflow that needs improvement
  - Click handler shows current filtering capabilities and limitations
  - Amazon page structure is needed to write correct selectors
  - Other scrapers show validation patterns we can adapt

  **Acceptance Criteria**:
  - [ ] Documented current workflow steps from amazon.yaml
  - [ ] Documented Amazon sponsored product CSS selectors
  - [ ] Documented organic result selectors
  - [ ] Documented current filtering limitations
  - [ ] Written analysis saved to `.sisyphus/evidence/task-1-analysis.md`

  **QA Scenarios**:

  ```
  Scenario: Verify analysis is complete
    Tool: Bash (file check)
    Preconditions: Analysis document exists
    Steps:
      1. cat .sisyphus/evidence/task-1-analysis.md
      2. Verify document contains: current workflow, sponsored selectors, organic selectors, limitations
    Expected Result: Document exists and contains all required sections
    Evidence: .sisyphus/evidence/task-1-analysis.md
  ```

  **Evidence to Capture**:
  - [ ] Analysis document with findings

  **Commit**: NO


- [ ] 2. Update amazon.yaml with Improved Selectors

  **What to do**:
  - Update the search result click selector to exclude sponsored products by CSS class
  - Add new selectors for extracting multiple search results with titles
  - Add workflow step to extract and score search results before clicking
  - Add validation step after extraction to verify product matches
  - Update the click action parameters to use new selectors

  **Key Changes Needed**:
  1. Change click selector from:
     ```yaml
     selector: div[data-component-type="s-search-result"] h2 a
     ```
     To exclude sponsored:
     ```yaml
     selector: div[data-component-type="s-search-result"]:not(.AdHolder):not([data-sponsored]) h2 a
     ```

  2. Add new selector for extracting search result titles:
     ```yaml
     - name: search_result_titles
       selector: div[data-component-type="s-search-result"]:not(.AdHolder) h2 a span
       attribute: text
       multiple: true
     ```

  3. Add validation workflow step after extraction

  **Must NOT do**:
  - Do NOT change the schema structure
  - Do NOT remove existing selectors (keep backward compatibility)
  - Do NOT change timeout values without testing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires understanding of YAML config structure and Playwright selectors
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5, Task 6
  - **Blocked By**: Task 1

  **References**:
  - Analysis from Task 1
  - `apps/scraper/scrapers/configs/amazon.yaml` - File to modify
  - Sample configs: `apps/scraper/scrapers/config/sample_config.yaml` - For patterns
  - `apps/scraper/scrapers/schemas/scraper_config_schema.py` - For schema validation

  **Acceptance Criteria**:
  - [ ] Updated click selector excludes sponsored products
  - [ ] Added selector for extracting multiple result titles
  - [ ] YAML validates against schema
  - [ ] Config file syntax is valid (no YAML errors)

  **QA Scenarios**:

  ```
  Scenario: Validate YAML syntax
    Tool: Bash (Python YAML parser)
    Preconditions: amazon.yaml updated
    Steps:
      1. python -c "import yaml; yaml.safe_load(open('apps/scraper/scrapers/configs/amazon.yaml'))"
    Expected Result: No YAML parsing errors
    Evidence: .sisyphus/evidence/task-2-yaml-valid.txt
  ```

  **Evidence to Capture**:
  - [ ] YAML validation output
  - [ ] Diff of changes made

  **Commit**: YES
  - Message: `fix(scraper): update amazon.yaml with improved sponsored filtering`
  - Files: `apps/scraper/scrapers/configs/amazon.yaml`


- [ ] 3. Enhance Click Handler with Attribute-Based Filtering

  **What to do**:
  - Modify `apps/scraper/scrapers/actions/handlers/click.py`
  - Add support for `filter_selector_exclude` parameter
  - This parameter accepts a CSS selector and excludes elements that match it
  - Use case: `filter_selector_exclude: ".AdHolder, [data-sponsored]"` to skip sponsored products

  **Implementation**:
  1. Add new parameter `filter_selector_exclude` to execute method
  2. After finding elements, filter out any that match the exclusion selector
  3. Keep the existing `filter_text_exclude` for backward compatibility
  4. Apply both filters if both are provided

  **Code Changes**:
  ```python
  filter_selector_exclude = params.get("filter_selector_exclude")
  
  # After finding elements, filter by selector
  if filter_selector_exclude:
      filtered_by_selector = []
      for el in filtered_elements:
          # Check if element or any parent matches exclusion selector
          try:
              is_excluded = await el.locator(filter_selector_exclude).count() > 0
              if not is_excluded:
                  filtered_by_selector.append(el)
          except Exception:
              filtered_by_selector.append(el)  # Keep on error
      filtered_elements = filtered_by_selector
  ```

  **Must NOT do**:
  - Do NOT remove existing `filter_text` or `filter_text_exclude` parameters
  - Do NOT change the default behavior (must be opt-in)
  - Do NOT break existing scrapers using click action

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core action handler modification requiring careful testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5, Task 6
  - **Blocked By**: Task 1

  **References**:
  - `apps/scraper/scrapers/actions/handlers/click.py` - File to modify
  - `apps/scraper/scrapers/actions/base.py` - Base action class
  - Other action handlers for patterns

  **Acceptance Criteria**:
  - [ ] `filter_selector_exclude` parameter added and working
  - [ ] Existing `filter_text_exclude` still works
  - [ ] Both filters can be used together
  - [ ] Handler doesn't break existing configs

  **QA Scenarios**:

  ```
  Scenario: Test new filter_selector_exclude parameter
    Tool: Bash (pytest)
    Preconditions: click.py modified
    Steps:
      1. cd apps/scraper && python -m pytest tests/ -v -k "click" 2>&1 | head -50
    Expected Result: Tests pass or no click-related test failures
    Evidence: .sisyphus/evidence/task-3-click-test.txt
  ```

  **Evidence to Capture**:
  - [ ] Test output showing click handler works
  - [ ] Code diff showing changes

  **Commit**: YES
  - Message: `feat(scraper): add filter_selector_exclude to click action`
  - Files: `apps/scraper/scrapers/actions/handlers/click.py`


- [ ] 4. Create New validate_product_match Action

  **What to do**:
  - Create new action handler `apps/scraper/scrapers/actions/handlers/validate_product_match.py`
  - This action validates that extracted product matches the search query
  - Compares product title against searched keywords
  - Sets result flag `product_match_valid` to True/False
  - Optionally sets `no_results_found` if no match

  **Action Parameters**:
  ```yaml
  - action: validate_product_match
    params:
      search_query_field: "sku"  # Field in context containing search query
      product_title_field: "Name"  # Field in results containing product title
      minimum_match_score: 0.6  # Minimum similarity score (0-1)
      set_no_results_on_fail: true  # Set no_results_found if validation fails
  ```

  **Implementation**:
  1. Get search query from context (usually `sku` field)
  2. Get product title from results
  3. Calculate similarity score (keyword overlap, fuzzy matching)
  4. Set `product_match_valid` result flag
  5. If score < minimum and `set_no_results_on_fail`, set `no_results_found`

  **Similarity Algorithm**:
  ```python
  def calculate_match_score(query: str, title: str) -> float:
      query_words = set(query.lower().split())
      title_words = set(title.lower().split())
      if not query_words:
          return 0.0
      overlap = len(query_words & title_words)
      return overlap / len(query_words)
  ```

  **Must NOT do**:
  - Do NOT use AI/LLM for matching (too slow, too expensive)
  - Do NOT require external libraries (use standard library only)
  - Do NOT change existing validation action

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New action handler requiring careful implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5, Task 6
  - **Blocked By**: Task 1

  **References**:
  - `apps/scraper/scrapers/actions/handlers/validation.py` - Similar actions for reference
  - `apps/scraper/scrapers/actions/base.py` - Base action class
  - `apps/scraper/scrapers/actions/registry.py` - Action registration

  **Acceptance Criteria**:
  - [ ] New action file created and registered
  - [ ] Action calculates match score correctly
  - [ ] Action sets result flags appropriately
  - [ ] Works with the provided example (broccoli seeds)

  **QA Scenarios**:

  ```
  Scenario: Test validate_product_match action
    Tool: Bash (Python unit test)
    Preconditions: Action created
    Steps:
      1. Create test script that calls action with mock data
      2. Test with "BENTLEY SEED BROCCOLI" vs "Bentley Seed Co. Broccoli Seeds"
      3. Test with "BENTLEY SEED BROCCOLI" vs "9527 Product Labels" (should fail)
    Expected Result: First test passes, second test fails validation
    Evidence: .sisyphus/evidence/task-4-validation-test.txt
  ```

  **Evidence to Capture**:
  - [ ] Unit test results
  - [ ] Action implementation code

  **Commit**: YES
  - Message: `feat(scraper): add validate_product_match action`
  - Files: `apps/scraper/scrapers/actions/handlers/validate_product_match.py`


- [ ] 5. Add Result Scoring Logic to Workflow

  **What to do**:
  - Update `amazon.yaml` workflow to:
    1. Extract multiple search results with titles
    2. Score each result against search query
    3. Click the best matching result
    4. Validate the product page matches
    5. If not, try the next best result (fallback)

  **New Workflow Steps**:
  ```yaml
  workflows:
    # ... existing steps ...
    
    - action: extract
      name: get_search_results
      params:
        fields:
          - name: search_titles
            selector: 'div[data-component-type="s-search-result"]:not(.AdHolder) h2 a span'
            attribute: text
            multiple: true
          - name: search_links
            selector: 'div[data-component-type="s-search-result"]:not(.AdHolder) h2 a'
            attribute: href
            multiple: true
    
    - action: score_and_click
      name: click_best_result
      params:
        search_query: "{{sku}}"
        titles_field: "search_titles"
        links_field: "search_links"
        minimum_score: 0.5
    
    - action: wait_for
      name: wait_for_pdp
      params:
        selector: "#productTitle"
        timeout: 20
    
    - action: extract_and_transform
      name: extract_product_data
      # ... existing extraction ...
    
    - action: validate_product_match
      params:
        search_query_field: "sku"
        product_title_field: "Name"
        minimum_match_score: 0.6
        set_no_results_on_fail: true
  ```

  **Note**: If `score_and_click` action doesn't exist, we may need to create it OR modify the approach to use existing actions with conditional logic.

  **Alternative Approach** (if new action not feasible):
  - Use conditional_click with validation
  - If validation fails, use script action to navigate back and try next result

  **Must NOT do**:
  - Do NOT make workflow overly complex
  - Do NOT break existing successful scrapes
  - Do NOT add steps that significantly slow down scraping

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Workflow design requiring understanding of all action handlers
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 6
  - **Blocked By**: Task 2, Task 3, Task 4

  **References**:
  - Updated `apps/scraper/scrapers/configs/amazon.yaml` from Task 2
  - `apps/scraper/scrapers/actions/handlers/conditional.py` - For conditional logic
  - `apps/scraper/scrapers/actions/handlers/script.py` - For custom JavaScript

  **Acceptance Criteria**:
  - [ ] Workflow extracts multiple results
  - [ ] Workflow validates product match
  - [ ] Workflow handles mismatches gracefully
  - [ ] YAML syntax is valid

  **QA Scenarios**:

  ```
  Scenario: Validate updated workflow syntax
    Tool: Bash (Python YAML parser)
    Preconditions: amazon.yaml updated
    Steps:
      1. python -c "import yaml; yaml.safe_load(open('apps/scraper/scrapers/configs/amazon.yaml'))"
    Expected Result: No YAML parsing errors
    Evidence: .sisyphus/evidence/task-5-workflow-valid.txt
  ```

  **Evidence to Capture**:
  - [ ] YAML validation output
  - [ ] Workflow diff

  **Commit**: YES
  - Message: `feat(scraper): add result scoring and validation to amazon workflow`
  - Files: `apps/scraper/scrapers/configs/amazon.yaml`


- [ ] 6. Test with Provided Example and Test SKUs

  **What to do**:
  - Test the updated scraper with the problematic example:
    - Input: `{"name": "BENTLEY SEED BROCCOL I GREEN SPROUTING", "price": 2.49}`
    - Expected: Product related to broccoli seeds (NOT label stickers)
  - Test with existing test SKUs from config:
    - "035585499741" (UPC)
    - "079105116708" (UPC)
    - "B08N5WRWNW" (ASIN)
  - Verify sponsored products are filtered
  - Verify product validation works

  **Testing Steps**:
  1. Run scraper locally with test SKU
  2. Check output product title
  3. Verify title contains keywords from search query
  4. Check that no sponsored products were selected
  5. Document results

  **Test Command**:
  ```bash
  cd apps/scraper
  python -m scraper_backend.runner --job-id test-amazon-001 --sku "BENTLEY SEED BROCCOL I GREEN SPROUTING"
  ```

  **Must NOT do**:
  - Do NOT test only with working SKUs (must test the problematic case)
  - Do NOT skip verifying sponsored filtering
  - Do NOT commit without testing

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: End-to-end testing requiring full scraper knowledge
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential - final task
  - **Blocks**: None
  - **Blocked By**: Task 2, Task 3, Task 4, Task 5

  **References**:
  - `apps/scraper/scrapers/configs/amazon.yaml` - Final config
  - `apps/scraper/scrapers/actions/handlers/click.py` - Updated handler
  - `apps/scraper/scrapers/actions/handlers/validate_product_match.py` - New action
  - `apps/scraper/runner.py` - Test runner

  **Acceptance Criteria**:
  - [ ] Problematic example returns broccoli-related product
  - [ ] Test SKUs return correct products
  - [ ] Sponsored products are filtered
  - [ ] Product validation catches mismatches
  - [ ] Test results documented

  **QA Scenarios**:

  ```
  Scenario: Test with problematic example
    Tool: Bash (scraper runner)
    Preconditions: All changes committed
    Steps:
      1. cd apps/scraper
      2. Run scraper with "BENTLEY SEED BROCCOL I GREEN SPROUTING"
      3. Check output JSON for product title
      4. Verify title contains "broccoli" or "seed" (case insensitive)
    Expected Result: Product title contains relevant keywords, NOT label/sticker related
    Evidence: .sisyphus/evidence/task-6-test-results.json
  
  Scenario: Test sponsored filtering
    Tool: Bash (scraper with debug)
    Preconditions: Scraper running
    Steps:
      1. Run scraper with debug logging
      2. Check logs for sponsored product detection
      3. Verify sponsored products were skipped
    Expected Result: Logs show sponsored products filtered, organic result selected
    Evidence: .sisyphus/evidence/task-6-sponsored-filter.log
  ```

  **Evidence to Capture**:
  - [ ] Test output JSON for problematic example
  - [ ] Test output for test SKUs
  - [ ] Debug logs showing sponsored filtering
  - [ ] Screenshot of search results if possible

  **Commit**: NO (testing only)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `ruff check apps/scraper/scrapers/actions/handlers/` + `mypy apps/scraper/scrapers/actions/handlers/`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `print()` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 2**: `fix(scraper): update amazon.yaml with improved sponsored filtering`
- **Task 3**: `feat(scraper): add filter_selector_exclude to click action`
- **Task 4**: `feat(scraper): add validate_product_match action`
- **Task 5**: `feat(scraper): add result scoring and validation to amazon workflow`

---

## Success Criteria

### Verification Commands
```bash
# Test the problematic example
cd apps/scraper && python -m scraper_backend.runner --job-id test-broccoli --sku "BENTLEY SEED BROCCOL I GREEN SPROUTING"

# Check output contains relevant keywords
# Expected: Product title contains "broccoli" or "seed"
# Should NOT contain: "label", "sticker", "9527"

# Lint check
ruff check apps/scraper/scrapers/actions/handlers/

# Type check
mypy apps/scraper/scrapers/actions/handlers/
```

### Final Checklist
- [ ] All "Must Have" present
  - [ ] Sponsored product filtering by CSS class/attribute
  - [ ] Product validation step after extraction
  - [ ] Result scoring based on title similarity
  - [ ] Fallback to try next result if first doesn't match
- [ ] All "Must NOT Have" absent
  - [ ] No changes to how SKU is passed
  - [ ] No changes to selector schema structure
  - [ ] No breaking changes to existing action handlers
  - [ ] No AI/LLM-based extraction
- [ ] All tests pass
  - [ ] Problematic example returns correct product type
  - [ ] Test SKUs work correctly
  - [ ] Sponsored products are filtered
  - [ ] Product validation works