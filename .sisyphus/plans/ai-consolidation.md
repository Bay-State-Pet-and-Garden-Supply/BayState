# AI Consolidation Refinement Plan

## TL;DR

> **Quick Summary**: Review and enhance existing AI consolidation system in `lib/consolidation/` to handle weight conversion ("16 oz" → "1.00"), brand exclusion from product names, and integrate image selection UI into the existing pipeline.
> 
> **Deliverables**: 
> - Enhanced weight normalization with compound unit support
> - Brand exclusion system prompt updates
> - Image selection UI integrated into `/admin/pipeline`
> - Comprehensive test suite (TDD)
> 
> **Estimated Effort**: Medium (8-10 tasks)
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: T1 (weight tests) → T2 (weight impl) → T5 (brand tests) → T6 (brand impl) → T9 (integration QA)

---

## Context

### Original Request
User wants to finish implementing AI Consolidation feature in `BayStateApp/app/admin/pipeline/`. Pass scraper results into LLM to consolidate products efficiently (no image URLs to save tokens). Requirements: proper casing, weights in LB with just the number ("16 oz" → "1.00"), brand excluded from name, and image selection UI for next step.

### Key Discovery
**The consolidation system is already 80% built** in `lib/consolidation/`:
- ✅ OpenAI Batch API integration (gpt-4o-mini)
- ✅ Image/URL filtering (token efficient)
- ✅ Result normalizer (units, decimals)
- ✅ Taxonomy validator
- ✅ Prompt builder with constraints

**What's Missing:**
- 🔄 Weight conversion: Currently standardizes units but doesn't convert "16 oz" → "1.00"
- 🔄 Brand exclusion: Not explicitly in system prompt
- 🔄 Image selection UI: Not integrated into pipeline

### Interview Summary
**Requirements Confirmed**:
1. **Weight conversion**: Two decimal places, handle compound units ("1 lb 8 oz" → "1.50")
2. **Brand exclusion**: Remove brand from ANYWHERE in name (not just start)
3. **Image source**: Raw scraped URLs from `products_ingestion.sources`
4. **Batch size**: 100-300 products (single batch, no chunking needed)
5. **Error handling**: Set weight to null on conversion failure
6. **Testing**: Mock OpenAI client, TDD approach
7. **UI location**: Integrated into existing `/admin/pipeline` UI

### Metis Review
**Identified Gaps** (addressed):
- Batch size "hundreds" = 100-300 (well within API limits, no optimization needed)
- Images filtered before LLM (efficient), raw data available for selection UI
- Need compound weight parsing ("1 lb 8 oz")
- Need anywhere-in-string brand removal

---

## Work Objectives

### Core Objective
Enhance existing AI consolidation system to properly normalize weights (with compound unit support), exclude brands from product names, and provide image selection UI integrated into the pipeline.

### Concrete Deliverables
- `lib/consolidation/__tests__/result-normalizer.test.ts` - Weight conversion tests
- `lib/consolidation/__tests__/prompt-builder.test.ts` - Brand exclusion tests
- Enhanced `result-normalizer.ts` - Weight conversion logic
- Enhanced `prompt-builder.ts` - Brand exclusion instructions
- Pipeline UI integration - Image selection component

### Definition of Done
- [ ] All weight conversion tests pass (TDD)
- [ ] All brand exclusion tests pass (TDD)
- [ ] `npm test -- --testPathPattern="consolidation"` → PASS
- [ ] Image selection UI accessible from pipeline
- [ ] End-to-end consolidation works with sample data

### Must Have
- Weight conversion with two decimal precision
- Compound unit support ("1 lb 8 oz" → "1.50")
- Brand exclusion from anywhere in product name
- Image selection UI in pipeline
- Mock-based tests (no real API calls)

### Must NOT Have (Guardrails)
- NO changes to LLM model (keep gpt-4o-mini)
- NO batch chunking (100-300 products = single batch)
- NO external image fetching (use stored URLs only)
- NO retry logic complexity (log failures, manual retry)
- NO Structured Outputs migration (keep existing response_format)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES - Jest configured in BayStateApp
- **Automated tests**: TDD (tests first)
- **Framework**: Jest + React Testing Library
- **TDD Flow**: RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

- **Unit tests**: Jest assertions
- **Component tests**: React Testing Library
- **Integration**: Sample data end-to-end
- **UI**: Playwright for image selection flow

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (TDD Foundation - all tests):
├── T1: Weight conversion tests (failing)
├── T2: Brand exclusion tests (failing)
└── T3: Image UI component tests (failing)

Wave 2 (Implementation - depends on Wave 1):
├── T4: Weight conversion implementation
├── T5: Brand exclusion implementation
└── T6: Image UI component implementation

Wave 3 (Integration & QA):
├── T7: Pipeline UI integration
├── T8: Mock OpenAI client setup
└── T9: End-to-end integration QA

Wave FINAL (Review):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
└── F3: Final QA (unspecified-high)

Critical Path: T1 → T4 → T7 → F1-F3
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| T1 (Weight tests) | — | T4 |
| T2 (Brand tests) | — | T5 |
| T3 (Image tests) | — | T6 |
| T4 (Weight impl) | T1 | T7, T9 |
| T5 (Brand impl) | T2 | T7, T9 |
| T6 (Image impl) | T3 | T7 |
| T7 (Integration) | T4, T5, T6 | T9, F1-F3 |
| T8 (Mock setup) | — | T9 |
| T9 (E2E QA) | T7, T8 | F1-F3 |

---

## TODOs



- [ ] 1. Weight Conversion Tests (TDD - RED Phase)

  **What to do**:
  - Create `lib/consolidation/__tests__/result-normalizer.test.ts`
  - Write failing tests for weight conversion scenarios
  - Test cases must cover:
    - Simple oz→lb: "16 oz" → "1.00"
    - Simple lb→lb: "5 lb" → "5.00"
    - Compound: "1 lb 8 oz" → "1.50"
    - Metric: "500 g" → "1.10" (convert to lb)
    - Edge: "N/A" → null (error handling)
    - Edge: "" → null (empty string)
    - Edge: "invalid" → null (unparseable)

  **Must NOT do**:
  - NO implementation code (this is TDD RED phase)
  - NO test file in wrong location (must be __tests__/ subdirectory)
  - NO mocking of dependencies (test the pure function)

  **Recommended Agent Profile**:
  - **Category**: `quick` (test writing is straightforward)
  - **Skills**: None needed
  - Reason: Writing unit tests is a standard task requiring no special domain knowledge

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T2, T3)
  - **Parallel Group**: Wave 1
  - **Blocks**: T4 (weight implementation)
  - **Blocked By**: None

  **References**:
  - `lib/consolidation/result-normalizer.ts` - Examine existing normalization patterns (lines 1-50)
  - `lib/consolidation/types.ts` - ConsolidatedData interface for expected output shape
  - Jest docs: https://jestjs.io/docs/getting-started - Basic test structure

  **WHY Each Reference Matters**:
  - result-normalizer.ts: Shows current normalization approach to match style
  - types.ts: Defines ConsolidatedData.weight as string | null

  **Acceptance Criteria**:
  - [ ] Test file exists at `lib/consolidation/__tests__/result-normalizer.test.ts`
  - [ ] All 7 test cases written and failing (RED phase)
  - [ ] Tests use describe/it blocks with clear names
  - [ ] Each test has clear input/output expectations
  - [ ] Run `CI=true npm test -- --testPathPattern="result-normalizer"` → shows 7 failing tests

  **QA Scenarios**:
  ```
  Scenario: Tests exist and fail as expected (RED phase)
    Tool: Bash
    Preconditions: Jest configured in BayStateApp
    Steps:
      1. cd BayStateApp && CI=true npm test -- --testPathPattern="result-normalizer" --no-coverage
      2. Check output shows "7 tests" with failures
    Expected Result: "Tests: 7 failed, 7 total" (RED phase confirmed)
    Failure Indicators: "0 tests found" or tests passing
    Evidence: .sisyphus/evidence/task-1-red-phase.log
  ```

  **Evidence to Capture**:
  - [ ] Screenshot/log of failing tests (RED phase proof)

  **Commit**: YES
  - Message: `test(consolidation): add weight conversion tests (RED phase)`
  - Files: `lib/consolidation/__tests__/result-normalizer.test.ts`
  - Pre-commit: None (tests should fail - this is RED phase)

---

- [ ] 2. Brand Exclusion Tests (TDD - RED Phase)

  **What to do**:
  - Create `lib/consolidation/__tests__/prompt-builder.test.ts`
  - Write failing tests verifying brand exclusion in prompt output
  - Test cases:
    - System prompt contains brand exclusion instruction
    - Brand at start: "Blue Buffalo Dog Food" → prompt excludes brand
    - Brand in middle: "Dog Food by Blue Buffalo" → prompt excludes brand
    - Brand at end: "Dog Food Blue Buffalo" → prompt excludes brand
    - Case insensitive: "blue buffalo" matches "Blue Buffalo"

  **Must NOT do**:
  - NO implementation of prompt builder changes (RED phase)
  - NO actual LLM calls (mock only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1, T3)
  - **Parallel Group**: Wave 1
  - **Blocks**: T5 (brand implementation)
  - **Blocked By**: None

  **References**:
  - `lib/consolidation/prompt-builder.ts` - Examine buildPrompt() function (lines 1-80)
  - Look for existing PRODUCT NAME FORMATTING RULES section

  **Acceptance Criteria**:
  - [ ] Test file exists at `lib/consolidation/__tests__/prompt-builder.test.ts`
  - [ ] All 5 test cases written and failing
  - [ ] Tests verify system prompt contains brand exclusion language
  - [ ] Run `CI=true npm test -- --testPathPattern="prompt-builder"` → shows 5 failing tests

  **QA Scenarios**:
  ```
  Scenario: Brand exclusion tests fail as expected
    Tool: Bash
    Preconditions: Jest configured
    Steps:
      1. cd BayStateApp && CI=true npm test -- --testPathPattern="prompt-builder" --no-coverage
    Expected Result: "Tests: 5 failed, 5 total"
    Evidence: .sisyphus/evidence/task-2-red-phase.log
  ```

  **Commit**: YES
  - Message: `test(consolidation): add brand exclusion tests (RED phase)`
  - Files: `lib/consolidation/__tests__/prompt-builder.test.ts`

---

- [ ] 3. Image Selection UI Tests (TDD - RED Phase)

  **What to do**:
  - Create `components/admin/pipeline/__tests__/ImageSelector.test.tsx`
  - Write failing tests for image selection component:
    - Component renders with image URLs
    - Clicking image selects it
    - Selected images are tracked
    - Save button calls callback with selected URLs
    - Empty state shows message

  **Must NOT do**:
  - NO component implementation (RED phase)
  - NO external image fetching (use props)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T1, T2)
  - **Parallel Group**: Wave 1
  - **Blocks**: T6 (image component implementation)
  - **Blocked By**: None

  **References**:
  - `components/admin/pipeline/PipelineProductCard.tsx` - Current product card patterns
  - React Testing Library docs for component testing

  **Acceptance Criteria**:
  - [ ] Test file exists at `components/admin/pipeline/__tests__/ImageSelector.test.tsx`
  - [ ] All 5 test cases written and failing
  - [ ] Run `CI=true npm test -- --testPathPattern="ImageSelector"` → shows 5 failing tests

  **QA Scenarios**:
  ```
  Scenario: Image selector tests fail as expected
    Tool: Bash
    Steps:
      1. cd BayStateApp && CI=true npm test -- --testPathPattern="ImageSelector" --no-coverage
    Expected Result: "Tests: 5 failed, 5 total"
    Evidence: .sisyphus/evidence/task-3-red-phase.log
  ```

  **Commit**: YES
  - Message: `test(pipeline): add image selector tests (RED phase)`
  - Files: `components/admin/pipeline/__tests__/ImageSelector.test.tsx`

---


---

- [ ] 4. Weight Conversion Implementation (TDD - GREEN Phase)

  **What to do**:
  - Implement weight conversion in `lib/consolidation/result-normalizer.ts`
  - Create `convertWeightToPounds(weight: string): string | null` function
  - Handle all test cases from T1:
    - Parse oz, lb, g, kg units
    - Convert compound units ("1 lb 8 oz" → "1.50")
    - Return null for unparseable values
    - Return two decimal places ("1.00", "1.50")
  - Integrate into existing normalization flow (around line 135)

  **Must NOT do**:
  - NO changes to other normalization logic
  - NO rounding beyond 2 decimal places
  - NO throwing errors (return null instead)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T5, T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: T7, T9
  - **Blocked By**: T1 (tests must exist)

  **References**:
  - `lib/consolidation/__tests__/result-normalizer.test.ts` (from T1) - Tests to pass
  - `lib/consolidation/result-normalizer.ts:135-142` - Where to add logic
  - Look at existing `normalizeUnit()` function for patterns

  **Acceptance Criteria**:
  - [ ] `convertWeightToPounds()` function implemented
  - [ ] All 7 tests from T1 now passing
  - [ ] Run `CI=true npm test -- --testPathPattern="result-normalizer"` → PASS

  **QA Scenarios**:
  ```
  Scenario: All weight conversion tests pass
    Tool: Bash
    Steps:
      1. cd BayStateApp && CI=true npm test -- --testPathPattern="result-normalizer" --no-coverage
    Expected Result: "Tests: 7 passed, 7 total"
    Evidence: .sisyphus/evidence/task-4-green-phase.log
  ```

  **Commit**: YES
  - Message: `feat(consolidation): implement weight conversion with compound unit support`
  - Files: `lib/consolidation/result-normalizer.ts`

---

- [ ] 5. Brand Exclusion Implementation (TDD - GREEN Phase)

  **What to do**:
  - Update `lib/consolidation/prompt-builder.ts` system prompt
  - Add explicit instruction to exclude brand from product name
  - Instruction should cover:
    - Remove brand from anywhere in name
    - Case-insensitive matching
    - Examples in prompt: "Blue Buffalo Dog Food" → "Dog Food"
  - Add around line 76-86 in PRODUCT NAME FORMATTING RULES

  **Must NOT do**:
  - NO post-processing to remove brand (do it in prompt)
  - NO changes to other prompt sections

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T6)
  - **Parallel Group**: Wave 2
  - **Blocks**: T7, T9
  - **Blocked By**: T2 (tests must exist)

  **References**:
  - `lib/consolidation/__tests__/prompt-builder.test.ts` (from T2) - Tests to pass
  - `lib/consolidation/prompt-builder.ts:76-86` - PRODUCT NAME FORMATTING RULES section

  **Acceptance Criteria**:
  - [ ] System prompt contains brand exclusion instruction
  - [ ] All 5 tests from T2 now passing
  - [ ] Run `CI=true npm test -- --testPathPattern="prompt-builder"` → PASS

  **QA Scenarios**:
  ```
  Scenario: Brand exclusion prompt updated and tests pass
    Tool: Bash
    Steps:
      1. grep -n "exclude.*brand\|remove.*brand" lib/consolidation/prompt-builder.ts
      2. cd BayStateApp && CI=true npm test -- --testPathPattern="prompt-builder"
    Expected Result: Grep finds instruction, tests pass
    Evidence: .sisyphus/evidence/task-5-green-phase.log
  ```

  **Commit**: YES
  - Message: `feat(consolidation): add brand exclusion to system prompt`
  - Files: `lib/consolidation/prompt-builder.ts`

---

- [ ] 6. Image Selection Component Implementation (TDD - GREEN Phase)

  **What to do**:
  - Create `components/admin/pipeline/ImageSelector.tsx`
  - Implement component matching tests from T3:
    - Props: `images: string[]`, `onSave: (selected: string[]) => void`
    - Render grid of image thumbnails
    - Click to select/deselect
    - Visual indicator for selected state
    - Save button calls onSave with selected URLs
  - Use existing UI patterns from PipelineProductCard.tsx

  **Must NOT do**:
  - NO external image fetching (use provided URLs)
  - NO complex image editing features
  - NO changes to other pipeline components yet (that's T7)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: None
  - Reason: UI component requiring proper styling and interactions

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T4, T5)
  - **Parallel Group**: Wave 2
  - **Blocks**: T7
  - **Blocked By**: T3 (tests must exist)

  **References**:
  - `components/admin/pipeline/__tests__/ImageSelector.test.tsx` (from T3) - Tests to pass
  - `components/admin/pipeline/PipelineProductCard.tsx` - UI patterns to match
  - BayStateApp design system: Forest Green (#008850), Bay State Burgundy (#66161D)

  **Acceptance Criteria**:
  - [ ] ImageSelector.tsx component created
  - [ ] All 5 tests from T3 now passing
  - [ ] Component follows existing pipeline styling
  - [ ] Run `CI=true npm test -- --testPathPattern="ImageSelector"` → PASS

  **QA Scenarios**:
  ```
  Scenario: Image selector component renders and tests pass
    Tool: Bash
    Steps:
      1. cd BayStateApp && CI=true npm test -- --testPathPattern="ImageSelector"
    Expected Result: "Tests: 5 passed, 5 total"
    Evidence: .sisyphus/evidence/task-6-green-phase.log
  ```

  **Commit**: YES
  - Message: `feat(pipeline): implement ImageSelector component`
  - Files: `components/admin/pipeline/ImageSelector.tsx`


---

- [ ] 7. Pipeline UI Integration

  **What to do**:
  - Integrate ImageSelector into existing pipeline UI
  - Add image selection button/action to PipelineProductCard or PipelineProductDetail
  - When user clicks "Select Images", open ImageSelector with product's scraped images
  - Save selected images back to product record
  - Update pipeline status flow to include image selection step

  **Must NOT do**:
  - NO new routes/pages (integrate into existing /admin/pipeline)
  - NO changes to scraper callback logic
  - NO automatic image selection (user must choose)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: None
  - Reason: UI integration requiring proper component composition

  **Parallelization**:
  - **Can Run In Parallel**: NO (must wait for T4, T5, T6)
  - **Parallel Group**: Wave 3
  - **Blocks**: T9
  - **Blocked By**: T4, T5, T6

  **References**:
  - `components/admin/pipeline/PipelineProductCard.tsx` - Where to add image selection trigger
  - `components/admin/pipeline/PipelineClient.tsx` - Pipeline state management
  - `components/admin/pipeline/ImageSelector.tsx` (from T6) - Component to integrate

  **Acceptance Criteria**:
  - [ ] Image selection accessible from pipeline product card/detail
  - [ ] Clicking opens ImageSelector with product's images
  - [ ] Saving updates product record
  - [ ] Pipeline flow shows image selection as step

  **QA Scenarios**:
  ```
  Scenario: Image selection integrated into pipeline UI
    Tool: Playwright
    Preconditions: Dev server running, sample product with images
    Steps:
      1. Navigate to /admin/pipeline
      2. Click on a consolidated product
      3. Click "Select Images" button
      4. ImageSelector modal opens with scraped images
      5. Select 2 images, click Save
      6. Modal closes, success toast shows
    Expected Result: Selected images saved to product
    Evidence: .sisyphus/evidence/task-7-ui-integration.png
  ```

  **Commit**: YES
  - Message: `feat(pipeline): integrate image selector into pipeline UI`
  - Files: `components/admin/pipeline/PipelineProductCard.tsx`, `PipelineProductDetail.tsx`

---

- [ ] 8. Mock OpenAI Client Setup

  **What to do**:
  - Create mock OpenAI client for testing
  - Mock should return predictable responses based on input
  - Support batch job creation, status polling, result retrieval
  - Use in integration tests to avoid real API calls

  **Must NOT do**:
  - NO real OpenAI API calls in tests
  - NO complex mock server (simple function mocks)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T7)
  - **Parallel Group**: Wave 3
  - **Blocks**: T9
  - **Blocked By**: None

  **References**:
  - `lib/consolidation/openai-client.ts` - Interface to mock
  - `lib/consolidation/batch-service.ts` - Uses openai-client

  **Acceptance Criteria**:
  - [ ] Mock client created in `lib/consolidation/__mocks__/openai-client.ts`
  - [ ] Mock returns predictable consolidation results
  - [ ] Batch service can use mock for testing

  **QA Scenarios**:
  ```
  Scenario: Mock client returns predictable results
    Tool: Bash
    Steps:
      1. Import mock in test file
      2. Call mock with sample product data
      3. Verify returned consolidation matches expected format
    Expected Result: Mock returns structured data without API call
    Evidence: .sisyphus/evidence/task-8-mock-setup.log
  ```

  **Commit**: YES
  - Message: `test(consolidation): add mock OpenAI client for testing`
  - Files: `lib/consolidation/__mocks__/openai-client.ts`

---

- [ ] 9. End-to-End Integration QA

  **What to do**:
  - Create end-to-end test with sample data
  - Test full flow: scraper results → consolidation → image selection
  - Verify weight conversion, brand exclusion, image selection all work together
  - Use mock OpenAI client (from T8) for predictable results

  **Must NOT do**:
  - NO real OpenAI API calls (use mock)
  - NO tests that depend on external services

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: None
  - Reason: Integration testing requires understanding full data flow

  **Parallelization**:
  - **Can Run In Parallel**: NO (must wait for T7, T8)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F3
  - **Blocked By**: T7, T8

  **References**:
  - `lib/consolidation/batch-service.ts` - Main consolidation flow
  - `lib/consolidation/__mocks__/openai-client.ts` (from T8) - Mock to use
  - Sample data: Create test fixture with realistic scraper results

  **Acceptance Criteria**:
  - [ ] E2E test file created
  - [ ] Test covers full consolidation flow
  - [ ] All assertions pass (weight, brand, images)
  - [ ] Run `CI=true npm test -- --testPathPattern="integration"` → PASS

  **QA Scenarios**:
  ```
  Scenario: End-to-end consolidation works
    Tool: Bash
    Preconditions: Mock OpenAI client configured
    Steps:
      1. Create test product with scraper data:
         - Name: "Blue Buffalo Adult Dog Food 16 oz"
         - Weight: "16 oz"
         - Images: ["url1", "url2", "url3"]
      2. Run consolidation
      3. Verify consolidated result:
         - Name: "Adult Dog Food" (brand removed)
         - Weight: "1.00" (converted)
         - Images: user can select from 3 options
    Expected Result: All transformations applied correctly
    Evidence: .sisyphus/evidence/task-9-e2e-test.log
  ```

  **Commit**: YES
  - Message: `test(consolidation): add end-to-end integration test`
  - Files: `lib/consolidation/__tests__/integration.test.ts`


---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 3 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run tests, check exports). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Verify:
  - Weight conversion handles compound units ("1 lb 8 oz" → "1.50")
  - Brand exclusion instruction in system prompt
  - Image selector integrated into pipeline UI
  - All tests passing
  Output: `Must Have [5/5] | Must NOT Have [5/5] | Tests [17/17] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `npm run lint` + `CI=true npm test`. Review all changed files for:
  - TypeScript errors
  - Lint violations
  - Test coverage for new code
  - No `any` types without justification
  - Proper error handling (null returns, not throws)
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Coverage [N%] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Test the actual UI:
  1. Navigate to /admin/pipeline
  2. Find a product with scraper data
  3. Trigger consolidation (if UI exists) or verify via API
  4. Verify consolidated data has correct weight and no brand
  5. Click image selection, choose images, save
  6. Verify images saved correctly
  Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `UI Flow [PASS/FAIL] | Data Transform [PASS/FAIL] | Image Selection [PASS/FAIL] | VERDICT`

---

## Commit Strategy

- **T1-T3**: `test(consolidation): add [weight|brand|image] tests (RED phase)` — __tests__/ files
- **T4**: `feat(consolidation): implement weight conversion with compound unit support` — result-normalizer.ts
- **T5**: `feat(consolidation): add brand exclusion to system prompt` — prompt-builder.ts
- **T6**: `feat(pipeline): implement ImageSelector component` — ImageSelector.tsx
- **T7**: `feat(pipeline): integrate image selector into pipeline UI` — PipelineProductCard.tsx, PipelineProductDetail.tsx
- **T8**: `test(consolidation): add mock OpenAI client for testing` — __mocks__/ files
- **T9**: `test(consolidation): add end-to-end integration test` — integration.test.ts
- **F1-F3**: `refactor(consolidation): address review feedback` — any fixes

---

## Success Criteria

### Verification Commands
```bash
# 1. All consolidation tests pass
cd BayStateApp && CI=true npm test -- --testPathPattern="consolidation" --no-coverage
# Expected: "Tests: 17 passed, 17 total"

# 2. TypeScript compiles
npm run typecheck
# Expected: No errors

# 3. Lint passes
npm run lint
# Expected: No errors

# 4. Weight conversion works
grep -A 20 "convertWeightToPounds" lib/consolidation/result-normalizer.ts
# Expected: Function exists with compound unit logic

# 5. Brand exclusion in prompt
grep -n "exclude.*brand\|remove.*brand" lib/consolidation/prompt-builder.ts
# Expected: Returns line number with instruction

# 6. Image selector exists
ls -la components/admin/pipeline/ImageSelector.tsx
# Expected: File exists
```

### Final Checklist
- [ ] All "Must Have" present (weight conversion, brand exclusion, image UI)
- [ ] All "Must NOT Have" absent (no model change, no chunking, no external fetching)
- [ ] All 17 tests passing (7 weight + 5 brand + 5 image)
- [ ] End-to-end integration test passes
- [ ] TypeScript compiles without errors
- [ ] No lint violations
- [ ] Code reviewed and approved (F1-F3)
