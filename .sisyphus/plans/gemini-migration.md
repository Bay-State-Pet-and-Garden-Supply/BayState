# OpenAI to Gemini API Migration Plan

## TL;DR

> **Objective**: Migrate from OpenAI API to Gemini API with built-in Google Search Grounding to achieve 85-90% cost savings on AI operations.
>
> **Deliverables**: 
> - Python scraper modules migrated to Gemini (AI Search + crawl4ai Engine)
> - TypeScript batch consolidation migrated to Gemini Batch API
> - Feature flags for independent module rollout
> - Parallel run validation system
> - Comprehensive test coverage for all migration paths
>
> **Estimated Effort**: Large (40-50 hours across 4 phases)
> **Parallel Execution**: YES - 5 waves with dependencies
> **Critical Path**: Validation Phase → Adapter Layer → Python Migration → TypeScript Migration → Optimization

---

## Context

### Original Request
User asked to evaluate whether migrating from OpenAI API to Gemini API is worthwhile, given Gemini's built-in Google Search Tools that could eliminate expensive SerpAPI workarounds. After analysis confirmed 85-90% cost savings, user requested full migration plan.

### Interview Summary
**Key Discussions**:
- Migration scope: Full migration including Python scraper and TypeScript web consolidation
- Cost is primary driver (SerpAPI at $0.01/search adds up quickly)
- User chose "Full Migration - Create Plan" option
- No explicit constraints on timeline or rollback strategy

**Research Findings**:
- Current OpenAI usage spans 10+ files across Python and TypeScript
- SerpAPI + OpenAI two-step search costs ~$0.021-0.023 per product
- Gemini with search grounding costs ~$0.001-0.003 per product
- Batch APIs have significant architectural differences (OpenAI vs Gemini)
- Crawl4AI compatibility is a critical unknown

### Metis Review
**Identified Gaps** (addressed in plan):
- Crawl4AI compatibility must be verified first (potentially blocking)
- Batch API requires complete architectural rewrite (GCS integration)
- Search quality validation needed (grounding ≠ ranked results)
- Feature flags required for safe rollback
- Golden dataset needed for regression testing
- Parallel running required for 2+ weeks validation
- GCS setup needed for Gemini batch operations

---

## Work Objectives

### Core Objective
Migrate all OpenAI API usage to Gemini API with built-in Google Search Grounding, achieving 85-90% cost reduction while maintaining or improving current functionality and quality.

### Concrete Deliverables
1. **Python Scraper AI Search Module**
   - `scrapers/ai_search/search.py` - Replace SerpAPI/Brave with Gemini search grounding
   - `scrapers/ai_search/llm_runtime.py` - Replace OpenAI client with Gemini client
   - `scrapers/ai_search/name_consolidator.py` - Update LLM calls
   - `scrapers/ai_search/source_selector.py` - Update LLM calls
   - `scrapers/ai_search/crawl4ai_extractor.py` - Update or replace based on compatibility

2. **TypeScript Web Consolidation Module**
   - `lib/consolidation/openai-client.ts` - Replace with Gemini client
   - `lib/consolidation/batch-service.ts` - Rewrite for Gemini Batch API
   - `lib/consolidation/prompt-builder.ts` - Adjust prompts for Gemini
   - `lib/consolidation/taxonomy-validator.ts` - Update JSON schema handling

3. **Infrastructure & Configuration**
   - Feature flags for all three modules (independent rollout)
   - Environment variable management for Gemini API keys
   - GCS bucket setup and integration
   - Cost tracking updates for Gemini pricing

4. **Testing & Validation**
   - Golden dataset creation (1000 products with known-good consolidations)
   - Side-by-side evaluation harness
   - Regression test suite for both OpenAI and Gemini
   - Parallel run monitoring system

### Definition of Done
- [ ] All three modules (AI Search, crawl4ai, Batch Consolidation) work with Gemini
- [ ] Feature flags allow independent enable/disable of each module
- [ ] Parallel run completed with 2+ weeks of data showing quality parity
- [ ] Cost tracking shows 85%+ savings vs OpenAI + SerpAPI baseline
- [ ] All existing tests pass with both OpenAI and Gemini providers
- [ ] Rollback procedure tested and documented
- [ ] SerpAPI dependency can be safely removed (optional but recommended)

### Must Have
- [ ] Crawl4AI compatibility verified or alternative implemented
- [ ] Feature flags for safe rollout
- [ ] Golden dataset for regression testing
- [ ] Parallel run validation (minimum 2 weeks)
- [ ] GCS integration for batch operations
- [ ] Cost tracking updated for Gemini pricing
- [ ] Backward compatibility maintained (can revert to OpenAI instantly)

### Must NOT Have (Guardrails)
- ❌ Simultaneous migration of all three modules (sequential only)
- ❌ Removal of OpenAI code paths until Gemini validated for 30 days
- ❌ Migration without feature flags
- ❌ Skipping regression testing on existing product catalog
- ❌ LangChain migration (out of scope)
- ❌ Prompt optimization during migration (only migrate, don't optimize)
- ❌ Browser-use updates (out of scope)
- ❌ Model fine-tuning (out of scope)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (pytest for Python, Jest for TypeScript)
- **Automated tests**: Tests-after (migration first, comprehensive tests second)
- **Framework**: pytest (Python), Jest + React Testing Library (TypeScript)
- **Strategy**: Validate migration preserves existing behavior, then add Gemini-specific tests

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Python Modules**: Use Bash (pytest) - Run tests, assert pass/fail, capture output
- **TypeScript Modules**: Use Bash (Jest) - Run tests, assert pass/fail, capture output
- **Integration Testing**: Use Bash (curl) - Test API endpoints with both providers
- **Cost Validation**: Use Bash (custom scripts) - Verify cost calculations match expected

---

## Execution Strategy

### Phase Overview

```
Phase 1: Validation & Preparation (1-2 weeks)
├── Task 1: Verify crawl4ai Gemini compatibility
├── Task 2: Create golden dataset for regression testing
├── Task 3: Set up GCS bucket and credentials
├── Task 4: Build side-by-side evaluation harness
└── Task 5: Create provider-agnostic interfaces

Phase 2: Adapter Layer (2-3 weeks)
├── Task 6: Implement Gemini client adapter (Python)
├── Task 7: Implement Gemini client adapter (TypeScript)
├── Task 8: Add feature flag infrastructure
├── Task 8a: Create feature flags API endpoint
├── Task 9: Implement search grounding adapter
└── Task 10: Implement batch API adapter (TypeScript)
├── Task 6: Implement Gemini client adapter (Python)
├── Task 7: Implement Gemini client adapter (TypeScript)
├── Task 8: Add feature flag infrastructure
├── Task 9: Implement search grounding adapter
└── Task 10: Implement batch API adapter (TypeScript)

Phase 3: Python Migration (3 weeks)
├── Task 11: Migrate AI Search - search module
├── Task 12: Migrate AI Search - name consolidator
├── Task 13: Migrate AI Search - source selector
├── Task 14: Migrate AI Search - update cost tracking
├── Task 15: Migrate crawl4ai Engine (or alternative)
└── Task 16: Add Python regression tests

Phase 4: TypeScript Migration (3-4 weeks)
├── Task 17: Migrate consolidation - Gemini client
├── Task 18: Migrate consolidation - batch service
├── Task 19: Migrate consolidation - prompt builder
├── Task 20: Migrate consolidation - taxonomy validator
├── Task 21: Migrate consolidation - webhook handler
└── Task 22: Add TypeScript regression tests

Phase 5: Optimization & Validation (2 weeks)
├── Task 23: Implement parallel run system
├── Task 24: Build monitoring dashboard
├── Task 25: Gradual traffic shift (10% → 50% → 100%)
└── Task 26: Document rollback procedures

Phase FINAL (After ALL tasks)
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Parallel Execution Waves

```
Wave 1 (Validation Phase - Sequential dependencies):
├── Task 1: Verify crawl4ai Gemini compatibility [critical]
├── Task 2: Create golden dataset [parallel with T1]
└── Task 3: Set up GCS bucket and credentials [parallel with T1]

Wave 2 (Adapter Layer - After Wave 1):
├── Task 4: Build side-by-side evaluation harness [depends: T1]
├── Task 5: Create provider-agnostic interfaces [depends: T1]
├── Task 6: Implement Gemini client adapter (Python) [depends: T5]
├── Task 7: Implement Gemini client adapter (TypeScript) [depends: T5]
├── Task 8: Add feature flag infrastructure [depends: T5]
└── Task 8a: Create feature flags API endpoint [parallel with T8]
├── Task 4: Build side-by-side evaluation harness [depends: T1]
├── Task 5: Create provider-agnostic interfaces [depends: T1]
├── Task 6: Implement Gemini client adapter (Python) [depends: T5]
├── Task 7: Implement Gemini client adapter (TypeScript) [depends: T5]
└── Task 8: Add feature flag infrastructure [depends: T5]

Wave 3 (Search Adapter - After Wave 2):
├── Task 9: Implement search grounding adapter [depends: T6]
└── Task 10: Implement batch API adapter (TypeScript) [depends: T7]

Wave 4 (Python Migration - After Wave 3):
├── Task 11: Migrate AI Search - search module [depends: T9]
├── Task 12: Migrate AI Search - name consolidator [depends: T6]
├── Task 13: Migrate AI Search - source selector [depends: T6]
├── Task 14: Migrate AI Search - update cost tracking [depends: T6]
├── Task 15: Migrate crawl4ai Engine [depends: T1]
└── Task 16: Add Python regression tests [depends: T11-15]

Wave 5 (TypeScript Migration - After Wave 4):
├── Task 17: Migrate consolidation - Gemini client [depends: T7]
├── Task 18: Migrate consolidation - batch service [depends: T10]
├── Task 19: Migrate consolidation - prompt builder [parallel]
├── Task 20: Migrate consolidation - taxonomy validator [parallel]
├── Task 21: Migrate consolidation - webhook handler [depends: T10]
└── Task 22: Add TypeScript regression tests [depends: T17-21]

Wave 6 (Optimization - After Wave 5):
├── Task 23: Implement parallel run system [depends: T16, T22]
├── Task 24: Build monitoring dashboard [parallel]
├── Task 25: Gradual traffic shift [depends: T23]
└── Task 26: Document rollback procedures [parallel]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1 → T5 → T6 → T9 → T11 → T16 → T23 → F1-F4 → user okay
```

### Dependency Matrix

- **T1**: - - T4, T5, T15, 1
- **T2**: - - T4, 1
- **T3**: - - T10, 1
- **T4**: T1, T2 - T23, 2
- **T5**: T1 - T6, T7, T8, 2
- **T6**: T5 - T9, T12, T13, T14, T17, 2
- **T7**: T5 - T10, T17, 2
- **T8**: T5 - T11-15, T17-21, 2
- **T8a**: T5, T8 - T25, 2
- **T9**: T6 - T11, 3
- **T9**: T6 - T11, 3
- **T10**: T3, T7 - T18, T21, 3
- **T11**: T9 - T16, 4
- **T12**: T6 - T16, 4
- **T13**: T6 - T16, 4
- **T14**: T6 - T16, 4
- **T15**: T1 - T16, 4
- **T16**: T11-15 - T23, 5
- **T17**: T6, T7, T8 - T22, 5
- **T18**: T10 - T22, 5
- **T19**: - - T22, 5
- **T20**: - - T22, 5
- **T21**: T10 - T22, 5
- **T22**: T17-21 - T23, 6
- **T23**: T4, T16, T22 - T25, 6
- **T24**: - - T25, 6
- **T25**: T23, T24 - F1, 6
- **T26**: - - F1, 6

### Agent Dispatch Summary

- **Wave 1**: **3** - T1, T2, T3 → `quick` (research/setup tasks)
- **Wave 2**: **6** - T4-T8, T8a → `quick`/`unspecified-high` (adapter infrastructure)
- **Wave 3**: **2** - T9, T10 → `unspecified-high` (API adapters)
- **Wave 4**: **6** - T11-T16 → `unspecified-high`/`quick` (Python migration)
- **Wave 5**: **6** - T17-T22 → `unspecified-high`/`quick` (TypeScript migration)
- **Wave 6**: **4** - T23-T26 → `deep`/`visual-engineering` (optimization)
- **FINAL**: **4** - F1-F4 → `oracle`/`unspecified-high`/`deep`

---

## TODOs


- [ ] 1. Verify crawl4ai Gemini Compatibility (CRITICAL - Blocking Task)

  **What to do**:
  - Research crawl4ai's provider support matrix for Gemini
  - Test if `LLMExtractionStrategy` accepts `provider="gemini/gemini-2.5-flash"`
  - If not supported, test OpenAI-compatible Gemini endpoint
  - If both fail, document alternative implementation approach
  - Create decision document with recommended path forward

  **Must NOT do**:
  - Do NOT proceed with other migration tasks until this is resolved
  - Do NOT assume crawl4ai supports Gemini without verification
  - Do NOT implement workarounds without documenting why

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (research and validation task)
  - **Skills**: `gemini-api-dev`, `crawl4ai`
    - `gemini-api-dev`: Understanding Gemini provider options and endpoints
    - `crawl4ai`: Deep knowledge of LLMExtractionStrategy and provider configuration
  - **Skills Evaluated but Omitted**: None - both critical for this task

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete first)
  - **Parallel Group**: Sequential (Wave 1)
  - **Blocks**: Tasks 4, 5, 15 (all depend on this verification)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):
  **Code References** (what to examine):
  - `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py:279-303` - LLMExtractionStrategy usage with OpenAI provider
  - `apps/scraper/docs/crawl4ai-guide.md` - Current crawl4ai documentation

  **External References** (documentation):
  - Official crawl4ai docs on LLM providers: https://docs.crawl4ai.com/
  - Gemini OpenAI-compatible endpoint: https://ai.google.dev/gemini-api/docs/openai
  - crawl4ai GitHub issues for Gemini support queries

  **WHY Each Reference Matters**:
  - crawl4ai_extractor.py: Shows exactly how provider string is used - need to understand if crawl4ai has hardcoded OpenAI support only
  - crawl4ai docs: Official provider support list
  - Gemini OpenAI-compatible endpoint: Fallback option if native support doesn't exist

  **Acceptance Criteria**:
  - [ ] Research complete: Documented whether crawl4ai supports Gemini natively
  - [ ] Test complete: Actually tested `provider="gemini/gemini-2.5-flash"` or equivalent
  - [ ] Fallback tested: If native fails, tested OpenAI-compatible endpoint
  - [ ] Decision documented: Clear recommendation in `.sisyphus/evidence/task-1-decision.md`
  - [ ] Path forward: Either "Proceed with crawl4ai" or "Replace crawl4ai extraction" with justification

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify crawl4ai accepts Gemini provider
    Tool: Bash (Python test script)
    Preconditions: Python environment with crawl4ai and google-genai installed
    Steps:
      1. Create test script that instantiates LLMExtractionStrategy with provider="gemini/gemini-2.5-flash"
      2. Run script and capture any errors
      3. If errors, try provider="openai/gemini-2.5-flash" with base_url pointing to Gemini OpenAI endpoint
    Expected Result: Either (a) successful instantiation OR (b) documented error with fallback working
    Failure Indicators: Script crashes without clear error message, or both methods fail without documentation
    Evidence: .sisyphus/evidence/task-1-crawl4ai-test.log

  Scenario: Document decision and path forward
    Tool: Read/Write (markdown file)
    Preconditions: Test results from previous scenario
    Steps:
      1. Create decision document at .sisyphus/evidence/task-1-decision.md
      2. Document: test results, chosen approach, rationale, risks
      3. Get user sign-off if replacing crawl4ai extraction
    Expected Result: Decision document exists with clear next steps
    Failure Indicators: Ambiguous recommendation, missing risk assessment
    Evidence: .sisyphus/evidence/task-1-decision.md
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-1-crawl4ai-test.log` - Test output
  - [ ] `.sisyphus/evidence/task-1-decision.md` - Decision document

  **Commit**: NO (research task, no code changes yet)

- [ ] 2. Create Golden Dataset for Regression Testing

  **What to do**:
  - Extract 1000 products with known-good consolidations from production
  - Include diverse categories: Dog, Cat, Bird, SmallAnimal
  - Include edge cases: abbreviated names, ambiguous products, multi-word brands
  - Store in structured format (JSONL) with expected outputs
  - Include both successful consolidations and known failures
  - Document data selection criteria and methodology

  **Must NOT do**:
  - Do NOT use synthetic/test data - must be real production data
  - Do NOT include PII or sensitive customer information
  - Do NOT skip edge cases (they're most important for validation)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (data engineering task)
  - **Skills**: None (pure data extraction and formatting)
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4 (evaluation harness needs this data)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):
  **Database Schema** (to understand data structure):
  - `apps/web/supabase/migrations/` - Recent migrations showing product schema
  - `apps/web/lib/consolidation/types.ts` - TypeScript types for consolidation

  **API References** (how to extract data):
  - `apps/web/lib/consolidation/batch-service.ts` - How products are currently processed
  - `apps/web/app/api/admin/consolidation/` - API endpoints for batch operations

  **WHY Each Reference Matters**:
  - Database migrations: Shows exact schema to query
  - Types: Shows expected data structure for golden dataset
  - batch-service.ts: Shows how to identify successfully consolidated products

  **Acceptance Criteria**:
  - [ ] Golden dataset created at `tests/fixtures/golden-dataset.jsonl`
  - [ ] 1000 products minimum (500+ different SKUs)
  - [ ] Diverse categories represented (minimum 4 pet types)
  - [ ] Edge cases included (at least 100 abbreviated/ambiguous products)
  - [ ] Expected outputs documented (what consolidation SHOULD produce)
  - [ ] Data provenance documented (where data came from, when extracted)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Validate golden dataset structure and completeness
    Tool: Bash (Python script)
    Preconditions: Dataset file exists
    Steps:
      1. Load dataset and verify JSON structure
      2. Count total products (must be >= 1000)
      3. Verify category distribution (at least 4 pet types)
      4. Check for required fields (sku, product_name, brand, category, expected_output)
      5. Verify no PII (no emails, phone numbers, addresses)
    Expected Result: All checks pass, validation report generated
    Failure Indicators: Missing fields, insufficient diversity, PII detected
    Evidence: .sisyphus/evidence/task-2-validation-report.json

  Scenario: Sample validation against current OpenAI output
    Tool: Bash (curl or API client)
    Preconditions: Golden dataset exists, OpenAI API configured
    Steps:
      1. Select 10 random samples from golden dataset
      2. Run through current OpenAI consolidation
      3. Compare actual output to expected output in dataset
      4. Calculate accuracy rate
    Expected Result: Accuracy >= 90% (validates dataset quality)
    Failure Indicators: Accuracy < 90% suggests dataset has wrong expected outputs
    Evidence: .sisyphus/evidence/task-2-sample-validation.log
  ```

  **Evidence to Capture**:
  - [ ] `tests/fixtures/golden-dataset.jsonl` - The dataset itself
  - [ ] `.sisyphus/evidence/task-2-validation-report.json` - Structure validation
  - [ ] `.sisyphus/evidence/task-2-sample-validation.log` - Quality check

  **Commit**: YES
  - Message: `test(consolidation): add golden dataset for regression testing`
  - Files: `tests/fixtures/golden-dataset.jsonl`
  - Pre-commit: `python scripts/validate_golden_dataset.py` (must pass)

- [ ] 3. Set Up GCS Bucket and Credentials

  **What to do**:
  - Create Google Cloud Storage bucket for Gemini batch operations
  - Set up service account with appropriate permissions (Storage Object Admin)
  - Generate and download service account key (JSON)
  - Add GCS configuration to environment variables
  - Test GCS upload/download from both Python and TypeScript
  - Document bucket structure and naming conventions

  **Must NOT do**:
  - Do NOT use personal Google account - must be service account
  - Do NOT commit service account keys to git (use environment variables)
  - Do NOT use overly broad permissions (principle of least privilege)

  **Recommended Agent Profile**:
  - **Category**: `quick` (infrastructure setup)
  - **Skills**: None (straightforward GCS setup)
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 10 (batch API adapter needs GCS)
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):
  **External References** (GCS documentation):
  - GCS bucket creation: https://cloud.google.com/storage/docs/creating-buckets
  - Service account setup: https://cloud.google.com/iam/docs/creating-managing-service-accounts
  - GCS permissions: https://cloud.google.com/storage/docs/access-control/iam-permissions

  **Code References** (where GCS will be used):
  - `apps/web/lib/consolidation/batch-service.ts` - Will need GCS integration
  - `apps/scraper/scrapers/ai_search/` - May need GCS for large batch operations

  **WHY Each Reference Matters**:
  - GCS docs: Official setup instructions
  - batch-service.ts: Shows where GCS integration will be needed

  **Acceptance Criteria**:
  - [ ] GCS bucket created with name `baystate-gemini-batches` (or similar)
  - [ ] Service account created with `roles/storage.objectAdmin` role
  - [ ] Service account key downloaded and stored securely (NOT in repo)
  - [ ] Environment variables configured: `GCS_BUCKET_NAME`, `GCS_SERVICE_ACCOUNT_KEY`
  - [ ] Test upload from Python succeeds
  - [ ] Test download from TypeScript succeeds
  - [ ] Documentation created at `docs/gcs-setup.md`

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test GCS upload from Python
    Tool: Bash (Python script)
    Preconditions: GCS bucket and credentials configured
    Steps:
      1. Create test file with sample content
      2. Upload to GCS bucket using google-cloud-storage library
      3. Verify upload succeeded (check GCS console or list objects)
      4. Clean up test file
    Expected Result: Upload succeeds, file appears in GCS bucket
    Failure Indicators: Authentication error, permission denied, upload timeout
    Evidence: .sisyphus/evidence/task-3-gcs-upload-test.log

  Scenario: Test GCS download from TypeScript
    Tool: Bash (Node.js/Bun script)
    Preconditions: GCS bucket and credentials configured, test file uploaded
    Steps:
      1. Download test file from GCS using @google-cloud/storage
      2. Verify content matches original
      3. Clean up test file
    Expected Result: Download succeeds, content matches
    Failure Indicators: Authentication error, permission denied, download timeout
    Evidence: .sisyphus/evidence/task-3-gcs-download-test.log

  Scenario: Verify environment variables configured
    Tool: Bash (shell script)
    Preconditions: None
    Steps:
      1. Check `.env.local` or environment for GCS_BUCKET_NAME
      2. Check for GCS_SERVICE_ACCOUNT_KEY (or GOOGLE_APPLICATION_CREDENTIALS)
      3. Verify values are non-empty and valid
    Expected Result: All required env vars present and valid
    Failure Indicators: Missing env vars, empty values
    Evidence: .sisyphus/evidence/task-3-env-check.log
  ```

  **Evidence to Capture**:
  - [ ] `.sisyphus/evidence/task-3-gcs-upload-test.log` - Python upload test
  - [ ] `.sisyphus/evidence/task-3-gcs-download-test.log` - TypeScript download test
  - [ ] `.sisyphus/evidence/task-3-env-check.log` - Environment validation
  - [ ] `docs/gcs-setup.md` - Setup documentation

  **Commit**: NO (infrastructure only, no code yet)
  - Note: Add env vars to `.env.local.example` but NOT real values

- [ ] 4. Build Side-by-Side Evaluation Harness

  **What to do**:
  - Create evaluation framework to compare OpenAI vs Gemini outputs
  - Implement scoring system for consolidation quality (accuracy, completeness, taxonomy correctness)
  - Support running same inputs through both providers
  - Generate comparison reports showing differences
  - Include statistical analysis (confidence intervals, significance testing)
  - Design for automated batch evaluation of golden dataset

  **Must NOT do**:
  - Do NOT evaluate on just 5-10 samples (need statistical significance)
  - Do NOT skip edge cases in evaluation
  - Do NOT evaluate on data that's in training set for either model

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (complex evaluation framework)
  - **Skills**: None (custom evaluation logic)
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1, T2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 23 (parallel run system needs this)
  - **Blocked By**: Task 1 (crawl4ai decision), Task 2 (golden dataset)

  **References** (CRITICAL):
  **Pattern References** (existing evaluation code):
  - `apps/scraper/tests/evaluation/` - Existing evaluation metrics and scoring
  - `apps/web/lib/consolidation/taxonomy-validator.ts` - How taxonomy validation works

  **External References** (evaluation best practices):
  - LLM evaluation frameworks: promptfoo, TruLens, RAGAS

  **WHY Each Reference Matters**:
  - Existing evaluation: Shows current quality metrics and scoring approach
  - Taxonomy validator: Defines "correct" consolidation (must match taxonomy rules)

  **Acceptance Criteria**:
  - [ ] Evaluation harness created at `scripts/evaluate_consolidation.py` (or .ts)
  - [ ] Supports both OpenAI and Gemini providers (configurable)
  - [ ] Implements scoring: accuracy (0-1), taxonomy correctness (0-1), completeness (0-1)
  - [ ] Can process entire golden dataset (batch mode)
  - [ ] Generates comparison report: OpenAI scores vs Gemini scores
  - [ ] Statistical analysis: mean, std dev, confidence intervals

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Run evaluation on golden dataset
    Tool: Bash (evaluation script)
    Preconditions: Golden dataset exists (Task 2), both APIs configured
    Steps:
      1. Run evaluation harness on 100-sample subset of golden dataset
      2. Process with OpenAI provider
      3. Process with Gemini provider
      4. Generate comparison report
    Expected Result: Both providers complete, report shows scores for each
    Failure Indicators: Script crashes, provider errors, missing metrics
    Evidence: .sisyphus/evidence/task-4-evaluation-report.json

  Scenario: Verify evaluation metrics are meaningful
    Tool: Read (evaluation report)
    Preconditions: Evaluation completed
    Steps:
      1. Review report for accuracy, taxonomy, completeness scores
      2. Verify scores are in valid range (0-1)
      3. Check that differences between providers are quantified
      4. Validate statistical calculations (confidence intervals reasonable)
    Expected Result: All metrics valid and meaningful
    Failure Indicators: Invalid scores, missing metrics, impossible statistics
    Evidence: .sisyphus/evidence/task-4-metrics-validation.log
  ```

  **Evidence to Capture**:
  - [ ] `scripts/evaluate_consolidation.py` (or .ts) - Evaluation harness code
  - [ ] `.sisyphus/evidence/task-4-evaluation-report.json` - Sample evaluation report
  - [ ] `.sisyphus/evidence/task-4-metrics-validation.log` - Metrics validation

  **Commit**: YES
  - Message: `test(consolidation): add side-by-side evaluation harness`
  - Files: `scripts/evaluate_consolidation.py`, `tests/evaluation/`
  - Pre-commit: `python scripts/evaluate_consolidation.py --dry-run` (must not crash)

- [ ] 5. Create Provider-Agnostic Interfaces

  **What to do**:
  - Design abstract base classes/interfaces for LLM provider, Search provider, and Batch provider
  - Implement provider-agnostic interfaces that work with both OpenAI and Gemini
  - Create factory pattern for instantiating correct provider based on config
  - Ensure interfaces hide provider-specific details from calling code
  - Support feature flag integration for runtime provider switching
  - Document interface contracts and usage patterns

  **Must NOT do**:
  - Do NOT leak provider-specific types into interface definitions
  - Do NOT create monolithic "AI Provider" interface (separate concerns)
  - Do NOT break existing code (implement alongside, not instead of)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (architectural design task)
  - **Skills**: None (design patterns)
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 6, 7, 8, 9, 10 (all adapters depend on these interfaces)
  - **Blocked By**: Task 1 (need to know Gemini capabilities)

  **References** (CRITICAL):
  **Pattern References** (existing abstraction patterns):
  - `apps/web/lib/consolidation/openai-client.ts` - Current OpenAI client abstraction
  - `apps/scraper/scrapers/ai_search/llm_runtime.py` - Current Python LLM runtime
  - `apps/scraper/scrapers/ai_search/search.py` - Current search abstraction

  **External References** (design patterns):
  - Strategy pattern: https://refactoring.guru/design-patterns/strategy
  - Factory pattern: https://refactoring.guru/design-patterns/factory-method

  **WHY Each Reference Matters**:
  - Existing clients: Show current abstraction level and pain points
  - Design patterns: Proven approaches for provider abstraction

  **Acceptance Criteria**:
  - [ ] TypeScript interfaces created: `LLMProvider`, `SearchProvider`, `BatchProvider`
  - [ ] Python abstract base classes created: `BaseLLMProvider`, `BaseSearchProvider`, `BaseBatchProvider`
  - [ ] Factory classes created: `LLMProviderFactory`, `SearchProviderFactory`, `BatchProviderFactory`
  - [ ] Feature flag integration: Can switch providers at runtime via config
  - [ ] Documentation: `docs/provider-interfaces.md` with usage examples
  - [ ] No breaking changes: Existing code still works (backward compatible)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Verify interface abstraction works for OpenAI
    Tool: Bash (unit tests)
    Preconditions: Interfaces implemented
    Steps:
      1. Instantiate OpenAI provider via factory
      2. Call common methods (generate, search, batch_submit)
      3. Verify responses match interface contracts
    Expected Result: OpenAI provider works through abstraction layer
    Failure Indicators: Type errors, method not implemented, wrong return types
    Evidence: .sisyphus/evidence/task-5-openai-interface-test.log

  Scenario: Verify interface abstraction works for Gemini
    Tool: Bash (unit tests)
    Preconditions: Interfaces implemented, Gemini adapters exist
    Steps:
      1. Instantiate Gemini provider via factory
      2. Call common methods (generate, search, batch_submit)
      3. Verify responses match interface contracts
    Expected Result: Gemini provider works through abstraction layer
    Failure Indicators: Type errors, method not implemented, wrong return types
    Evidence: .sisyphus/evidence/task-5-gemini-interface-test.log

  Scenario: Test runtime provider switching
    Tool: Bash (integration test)
    Preconditions: Interfaces and factories implemented
    Steps:
      1. Start with OpenAI provider configured
      2. Switch to Gemini provider via feature flag
      3. Verify system uses Gemini without restart
    Expected Result: Provider switches at runtime successfully
    Failure Indicators: System crashes, keeps using old provider, config not respected
    Evidence: .sisyphus/evidence/task-5-runtime-switch-test.log
  ```

  **Evidence to Capture**:
  - [ ] `apps/web/lib/providers/interfaces.ts` - TypeScript interfaces
  - [ ] `apps/scraper/scrapers/providers/base.py` - Python base classes
  - [ ] `.sisyphus/evidence/task-5-openai-interface-test.log` - OpenAI abstraction test
  - [ ] `.sisyphus/evidence/task-5-gemini-interface-test.log` - Gemini abstraction test
  - [ ] `.sisyphus/evidence/task-5-runtime-switch-test.log` - Runtime switching test

  **Commit**: YES
  - Message: `feat(providers): add provider-agnostic interfaces and factories`
  - Files: `apps/web/lib/providers/`, `apps/scraper/scrapers/providers/`
  - Pre-commit: `bun test providers` and `python -m pytest tests/providers/` (must pass)

- [ ] 6. Implement Gemini Client Adapter (Python)

  **What to do**:
  - Implement Python Gemini client using `google-genai` SDK
  - Create adapter that conforms to `BaseLLMProvider` interface from Task 5
  - Support synchronous and asynchronous operations
  - Implement error handling with retry logic compatible with existing retry system
  - Support all required features: chat completions, embeddings, batch operations
  - Add comprehensive logging for debugging

  **Must NOT do**:
  - Do NOT use deprecated `google-generativeai` SDK (use `google-genai`)
  - Do NOT hardcode model names (use configuration)
  - Do NOT skip retry logic (must match existing OpenAI retry behavior)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (SDK integration)
  - **Skills**: `gemini-api-dev`
    - `gemini-api-dev`: Critical for correct SDK usage and patterns
  - **Skills Evaluated but Omitted**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 12, 13, 14, 17 (all need Gemini client)
  - **Blocked By**: Task 5 (provider interfaces)

  **References** (CRITICAL):
  **Pattern References** (existing code to follow):
  - `apps/scraper/scrapers/ai_search/llm_runtime.py:48-87` - Current OpenAI runtime configuration
  - `apps/scraper/scrapers/ai_search/source_selector.py:64-76` - How LLM is currently called

  **API/Type References** (contracts to implement):
  - `apps/scraper/scrapers/providers/base.py` (from Task 5) - Abstract base class

  **External References** (Gemini SDK):
  - Gemini Python SDK docs: https://github.com/googleapis/python-genai
  - Gemini model list: gemini-2.5-flash, gemini-2.5-pro, gemini-3.1-flash-preview

  **WHY Each Reference Matters**:
  - llm_runtime.py: Shows current configuration pattern (api_key, model, etc.)
  - source_selector.py: Shows actual usage pattern (chat.completions.create)
  - Gemini SDK docs: Official API reference for implementation

  **Acceptance Criteria**:
  - [ ] Python adapter created at `apps/scraper/scrapers/providers/gemini.py`
  - [ ] Implements all methods from `BaseLLMProvider` interface
  - [ ] Supports async operations (`generate_content_async`)
  - [ ] Error handling with exponential backoff retry
  - [ ] Logging for all operations (start, success, failure, timing)
  - [ ] Unit tests at `tests/providers/test_gemini.py` (>80% coverage)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test basic text generation
    Tool: Bash (pytest)
    Preconditions: Gemini adapter implemented, GEMINI_API_KEY configured
    Steps:
      1. Create test case calling `generate_content()` with simple prompt
      2. Verify response contains expected text
      3. Check logs for request/response details
    Expected Result: Text generated successfully, logs show complete flow
    Failure Indicators: API error, empty response, timeout
    Evidence: .sisyphus/evidence/task-6-text-generation-test.log

  Scenario: Test async operations
    Tool: Bash (pytest)
    Preconditions: Gemini adapter async methods implemented
    Steps:
      1. Create async test calling `generate_content_async()`
      2. Run multiple concurrent requests (test async behavior)
      3. Verify all requests complete without blocking
    Expected Result: All async requests complete successfully
    Failure Indicators: Blocking behavior, timeout, race conditions
    Evidence: .sisyphus/evidence/task-6-async-test.log

  Scenario: Test error handling and retry
    Tool: Bash (pytest with mocking)
    Preconditions: Gemini adapter implemented
    Steps:
      1. Mock API to return rate limit error (429)
      2. Verify retry logic triggers with exponential backoff
      3. Test that after max retries, proper exception raised
    Expected Result: Retry works as expected, final failure raises exception
    Failure Indicators: No retry, infinite loop, wrong exception type
    Evidence: .sisyphus/evidence/task-6-retry-test.log
  ```

  **Evidence to Capture**:
  - [ ] `apps/scraper/scrapers/providers/gemini.py` - Adapter implementation
  - [ ] `tests/providers/test_gemini.py` - Unit tests
  - [ ] `.sisyphus/evidence/task-6-text-generation-test.log` - Generation test
  - [ ] `.sisyphus/evidence/task-6-async-test.log` - Async test
  - [ ] `.sisyphus/evidence/task-6-retry-test.log` - Retry logic test

  **Commit**: YES
  - Message: `feat(providers): add Python Gemini client adapter`
  - Files: `apps/scraper/scrapers/providers/gemini.py`, `tests/providers/test_gemini.py`
  - Pre-commit: `python -m pytest tests/providers/test_gemini.py -v` (must pass)

- [ ] 7. Implement Gemini Client Adapter (TypeScript)

  **What to do**:
  - Implement TypeScript Gemini client using `@google/genai` SDK
  - Create adapter that conforms to `LLMProvider` interface from Task 5
  - Support streaming and non-streaming operations
  - Implement structured output support (JSON mode)
  - Add error handling with retry logic
  - Support batch operations preparation (formatting for Gemini Batch API)

  **Must NOT do**:
  - Do NOT use deprecated `@google/generative-ai` SDK (use `@google/genai`)
  - Do NOT skip structured output support (required for consolidation)
  - Do NOT ignore TypeScript types (must be fully typed)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (SDK integration)
  - **Skills**: `gemini-api-dev`
    - `gemini-api-dev`: Critical for correct SDK usage and patterns
  - **Skills Evaluated but Omitted**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 10, 17 (need Gemini client)
  - **Blocked By**: Task 5 (provider interfaces)

  **References** (CRITICAL):
  **Pattern References** (existing code to follow):
  - `apps/web/lib/consolidation/openai-client.ts:1-104` - Current OpenAI client implementation
  - `apps/web/lib/consolidation/batch-service.ts:1-1821` - How batch operations work

  **API/Type References** (contracts to implement):
  - `apps/web/lib/providers/interfaces.ts` (from Task 5) - TypeScript interfaces

  **External References** (Gemini SDK):
  - Gemini TypeScript SDK docs: https://github.com/google/generative-ai-js
  - Structured outputs: https://ai.google.dev/gemini-api/docs/structured-output

  **WHY Each Reference Matters**:
  - openai-client.ts: Shows current client pattern (caching, signature checking, etc.)
  - batch-service.ts: Shows batch operation requirements
  - Structured outputs docs: Critical for consolidation use case

  **Acceptance Criteria**:
  - [ ] TypeScript adapter created at `apps/web/lib/providers/gemini-client.ts`
  - [ ] Implements all methods from `LLMProvider` interface
  - [ ] Supports streaming and non-streaming generation
  - [ ] Structured output support with JSON schema validation
  - [ ] Error handling with retry logic
  - [ ] Unit tests at `__tests__/lib/providers/gemini-client.test.ts` (>80% coverage)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test basic generation with structured output
    Tool: Bash (Jest)
    Preconditions: Gemini adapter implemented, GEMINI_API_KEY configured
    Steps:
      1. Create test case with JSON schema for structured output
      2. Call generate with schema validation enabled
      3. Verify response matches schema
    Expected Result: Valid JSON returned matching schema
    Failure Indicators: Invalid JSON, schema mismatch, API error
    Evidence: .sisyphus/evidence/task-7-structured-output-test.log

  Scenario: Test streaming generation
    Tool: Bash (Jest)
    Preconditions: Gemini adapter streaming implemented
    Steps:
      1. Create test case requesting streaming response
      2. Consume stream and aggregate chunks
      3. Verify complete response matches non-streaming version
    Expected Result: Stream aggregates to complete, valid response
    Failure Indicators: Stream errors, incomplete response, timeout
    Evidence: .sisyphus/evidence/task-7-streaming-test.log

  Scenario: Test batch operation preparation
    Tool: Bash (Jest)
    Preconditions: Gemini adapter batch methods implemented
    Steps:
      1. Create multiple requests for batch processing
      2. Call batch preparation method to format for Gemini Batch API
      3. Verify output format matches Gemini Batch API specification
    Expected Result: Correctly formatted batch request payload
    Failure Indicators: Wrong format, missing fields, invalid JSON
    Evidence: .sisyphus/evidence/task-7-batch-prep-test.log
  ```

  **Evidence to Capture**:
  - [ ] `apps/web/lib/providers/gemini-client.ts` - Adapter implementation
  - [ ] `__tests__/lib/providers/gemini-client.test.ts` - Unit tests
  - [ ] `.sisyphus/evidence/task-7-structured-output-test.log` - Structured output test
  - [ ] `.sisyphus/evidence/task-7-streaming-test.log` - Streaming test
  - [ ] `.sisyphus/evidence/task-7-batch-prep-test.log` - Batch preparation test

  **Commit**: YES
  - Message: `feat(providers): add TypeScript Gemini client adapter`
  - Files: `apps/web/lib/providers/gemini-client.ts`, `__tests__/lib/providers/gemini-client.test.ts`
  - Pre-commit: `bun test lib/providers/gemini-client` (must pass)

- [ ] 8. Add Feature Flag Infrastructure

  **What to do**:
  - Implement feature flag system for runtime provider switching
  - Support independent flags for each module: AI Search, crawl4ai, Batch Consolidation
  - Create configuration management (environment variables, database, or config file)
  - Implement flag evaluation logic (can be async for DB-based flags)
  - Add admin UI or API for toggling flags (if not using env vars only)
  - Document flag behavior and rollback procedures

  **Must NOT do**:
  - Do NOT require restart to change flags (must be runtime)
  - Do NOT use complex feature flag service (keep it simple)
  - Do NOT skip audit logging (track when flags change)

  **Recommended Agent Profile**:
  - **Category**: `quick` (configuration management)
  - **Skills**: None
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 11-15, 17-21 (all migrations need feature flags)
  - **Blocked By**: Task 5 (provider interfaces, need to know what to flag)

  **References** (CRITICAL):
  **Pattern References** (existing config patterns):
  - `apps/web/lib/ai-scraping/credentials.ts` - How AI credentials are managed
  - `apps/scraper/scrapers/models/config.py` - Configuration models in Python

  **External References** (feature flag patterns):
  - Feature flag best practices: https://martinfowler.com/articles/feature-toggles.html

  **WHY Each Reference Matters**:
  - credentials.ts: Shows existing configuration management approach
  - Fowler article: Best practices for feature flags

  **Acceptance Criteria**:
  - [ ] Feature flags defined: `GEMINI_AI_SEARCH_ENABLED`, `GEMINI_CRAWL4AI_ENABLED`, `GEMINI_BATCH_ENABLED`
  - [ ] Flag evaluation logic in both Python and TypeScript
  - [ ] Default values: all flags default to `false` (safe)
  - [ ] Runtime evaluation: Can check flags without restart
  - [ ] Audit logging: Log when flags are checked (for debugging)
  - [ ] Documentation: `docs/feature-flags.md` with usage examples

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test feature flag evaluation
    Tool: Bash (unit tests)
    Preconditions: Feature flag system implemented
    Steps:
      1. Set GEMINI_AI_SEARCH_ENABLED=false
      2. Call flag evaluation function
      3. Verify returns false
      4. Change to true (without restart if possible)
      5. Verify returns true
    Expected Result: Flag reflects current value
    Failure Indicators: Stale values, requires restart, wrong value
    Evidence: .sisyphus/evidence/task-8-flag-evaluation-test.log

  Scenario: Test audit logging
    Tool: Read (log files)
    Preconditions: Feature flag system with logging implemented
    Steps:
      1. Check application logs for feature flag evaluation entries
      2. Verify log includes flag name, value, timestamp, context
      3. Confirm logs are at appropriate level (debug/info)
    Expected Result: Audit trail of flag usage exists
    Failure Indicators: No logs, incomplete information, wrong log level
    Evidence: .sisyphus/evidence/task-8-audit-log.log
  ```

  **Evidence to Capture**:
  - [ ] `apps/web/lib/config/feature-flags.ts` - TypeScript flag logic
  - [ ] `apps/scraper/scrapers/config/feature_flags.py` - Python flag logic
  - [ ] `.sisyphus/evidence/task-8-flag-evaluation-test.log` - Flag test
  - [ ] `.sisyphus/evidence/task-8-audit-log.log` - Audit log sample

  **Commit**: YES
  - Message: `feat(config): add feature flag infrastructure for provider switching`
  - Files: `apps/web/lib/config/feature-flags.ts`, `apps/scraper/scrapers/config/feature_flags.py`
  - Pre-commit: `bun test config/feature-flags` and `python -m pytest tests/config/` (must pass)


- [ ] 8a. Create Feature Flags API Endpoint

  **What to do**:
  - Create REST API endpoint at `/api/admin/flags` for reading/writing feature flags
  - Support GET to retrieve current flag states
  - Support POST/PATCH to update flag values
  - Add authentication (admin only)
  - Integrate with feature flag system from Task 8
  - Add audit logging for flag changes

  **Must NOT do**:
  - Do NOT allow unauthorized access to flag endpoints
  - Do NOT skip audit logging

  **Recommended Agent Profile**:
  - **Category**: `quick` (API endpoint)
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T8)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 25 (rollout needs flag API)
  - **Blocked By**: Task 8 (flag infrastructure)

  **Acceptance Criteria**:
  - [ ] GET /api/admin/flags returns current flag states as JSON
  - [ ] POST /api/admin/flags updates flag values
  - [ ] Authentication enforced (admin role required)
  - [ ] Audit logs capture flag changes
  - [ ] Unit tests at `__tests__/app/api/admin/flags/route.test.ts`

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test flag API GET endpoint
    Tool: Bash (curl)
    Preconditions: API endpoint implemented, authenticated admin session
    Steps:
      1. curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/admin/flags
      2. Verify response contains all feature flags (GEMINI_AI_SEARCH_ENABLED, etc.)
      3. Verify response is valid JSON
    Expected Result: Returns current flag states
    Failure Indicators: 404 error, auth failure, invalid JSON
    Evidence: .sisyphus/evidence/task-8a-get-flags.log

  Scenario: Test flag API POST endpoint
    Tool: Bash (curl)
    Preconditions: API endpoint implemented, authenticated admin session
    Steps:
      1. curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
           -H "Content-Type: application/json" \
           -d '{"GEMINI_AI_SEARCH_ENABLED": true}' \
           http://localhost:3000/api/admin/flags
      2. Verify response confirms flag update
      3. GET flags again and verify change persisted
    Expected Result: Flag updated successfully and persisted
    Failure Indicators: 404/403 error, update not persisted
    Evidence: .sisyphus/evidence/task-8a-post-flags.log
  ```

  **Evidence to Capture**:
  - [ ] `apps/web/app/api/admin/flags/route.ts` - API endpoint implementation
  - [ ] `__tests__/app/api/admin/flags/route.test.ts` - Unit tests
  - [ ] `.sisyphus/evidence/task-8a-get-flags.log` - GET test
  - [ ] `.sisyphus/evidence/task-8a-post-flags.log` - POST test

  **Commit**: YES
  - Message: `feat(api): add feature flags admin endpoint`
  - Files: `apps/web/app/api/admin/flags/route.ts`, `__tests__/app/api/admin/flags/route.test.ts`
  - Pre-commit: `bun test app/api/admin/flags` (must pass)
- [ ] 9. Implement Search Grounding Adapter

  **What to do**:
  - Create adapter that uses Gemini's `google_search_retrieval` tool
  - Convert Gemini search grounding responses to current SerpAPI/Brave result format
  - Handle citations and source URLs from Gemini responses
  - Implement result ranking/normalization to match existing behavior
  - Add caching layer for search results (reuse existing cache if possible)
  - Support configurable search parameters (location, language, safe search)

  **Must NOT do**:
  - Do NOT change calling code's expected format (maintain backward compatibility)
  - Do NOT skip result ranking (grounding doesn't provide ranking like SerpAPI)
  - Do NOT ignore citations (they're critical for source verification)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (complex adapter with format conversion)
  - **Skills**: `gemini-api-dev`
    - `gemini-api-dev`: Critical for correct grounding tool usage
  - **Skills Evaluated but Omitted**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 10)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 11 (search module migration needs this)
  - **Blocked By**: Task 6 (Python Gemini client)

  **References** (CRITICAL):
  **Pattern References** (existing search code):
  - `apps/scraper/scrapers/ai_search/search.py:102-126` - Current result format (normalize_result)
  - `apps/scraper/scrapers/ai_search/search.py:296-407` - SearchClient class

  **External References** (Gemini search grounding):
  - Grounding docs: https://ai.google.dev/gemini-api/docs/google-search

  **WHY Each Reference Matters**:
  - search.py: Shows exact format that calling code expects (must match)
  - Grounding docs: How to invoke and parse Gemini search results

  **Acceptance Criteria**:
  - [ ] Adapter created at `apps/scraper/scrapers/providers/gemini_search.py`
  - [ ] Implements `BaseSearchProvider` interface from Task 5
  - [ ] Converts Gemini citations to current result format
  - [ ] Result ranking heuristic (since grounding doesn't rank like SerpAPI)
  - [ ] Caching integration (reuse existing SearchClient cache)
  - [ ] Unit tests at `tests/providers/test_gemini_search.py` (>80% coverage)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test search grounding basic functionality
    Tool: Bash (pytest)
    Preconditions: Gemini search adapter implemented, GEMINI_API_KEY configured
    Steps:
      1. Call search with product query
      2. Verify response contains results with URLs, titles, descriptions
      3. Check that citations are included in metadata
    Expected Result: Results returned in expected format with citations
    Failure Indicators: Empty results, missing fields, wrong format
    Evidence: .sisyphus/evidence/task-9-search-basic-test.log

  Scenario: Test result format compatibility
    Tool: Bash (pytest)
    Preconditions: Gemini search adapter implemented
    Steps:
      1. Call both SerpAPI and Gemini search with same query
      2. Compare result formats field by field
      3. Verify Gemini results can be used by existing code
    Expected Result: Formats compatible, existing code works with Gemini results
    Failure Indicators: Missing fields, type mismatches, code crashes
    Evidence: .sisyphus/evidence/task-9-format-compat-test.log

  Scenario: Test caching behavior
    Tool: Bash (pytest with timing)
    Preconditions: Gemini search adapter with caching
    Steps:
      1. Call search with query (should hit API)
      2. Call same search again immediately (should hit cache)
      3. Verify second call is significantly faster
      4. Check cache storage
    Expected Result: Cache hit on second call, much faster response
    Failure Indicators: Both calls hit API, no performance improvement
    Evidence: .sisyphus/evidence/task-9-caching-test.log
  ```

  **Evidence to Capture**:
  - [ ] `apps/scraper/scrapers/providers/gemini_search.py` - Search adapter
  - [ ] `tests/providers/test_gemini_search.py` - Unit tests
  - [ ] `.sisyphus/evidence/task-9-search-basic-test.log` - Basic search test
  - [ ] `.sisyphus/evidence/task-9-format-compat-test.log` - Format compatibility
  - [ ] `.sisyphus/evidence/task-9-caching-test.log` - Caching test

  **Commit**: YES
  - Message: `feat(providers): add Gemini search grounding adapter`
  - Files: `apps/scraper/scrapers/providers/gemini_search.py`, `tests/providers/test_gemini_search.py`
  - Pre-commit: `python -m pytest tests/providers/test_gemini_search.py -v` (must pass)

- [ ] 10. Implement Batch API Adapter (TypeScript)

  **What to do**:
  - Create adapter for Gemini Batch API that conforms to `BatchProvider` interface
  - Implement job submission (upload to GCS, submit batch job)
  - Implement status polling (check batch job status)
  - Implement result retrieval (download from GCS, parse results)
  - Handle error cases (failed jobs, partial failures, GCS errors)
  - Add webhook support (Gemini supports batch webhooks, OpenAI doesn't)

  **Must NOT do**:
  - Do NOT try to make Gemini Batch API look exactly like OpenAI Batch API (architecturally different)
  - Do NOT skip GCS integration (required for Gemini Batch)
  - Do NOT ignore webhook support (useful for faster completion detection)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (complex API integration with GCS)
  - **Skills**: `gemini-api-dev`
    - `gemini-api-dev`: Critical for Batch API correctness
  - **Skills Evaluated but Omitted**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 9)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 18 (batch service migration needs this)
  - **Blocked By**: Task 3 (GCS setup), Task 7 (TypeScript Gemini client)

  **References** (CRITICAL):
  **Pattern References** (existing batch code):
  - `apps/web/lib/consolidation/batch-service.ts:612-667` - OpenAI batch submission format
  - `apps/web/lib/consolidation/batch-service.ts:800-950` - Batch status polling and retrieval

  **External References** (Gemini Batch API):
  - Gemini Batch API docs: https://ai.google.dev/gemini-api/docs/batch

  **WHY Each Reference Matters**:
  - batch-service.ts: Shows current batch workflow that must be adapted
  - Gemini Batch docs: Shows new API structure and requirements

  **Acceptance Criteria**:
  - [ ] Adapter created at `apps/web/lib/providers/gemini-batch.ts`
  - [ ] Implements `BatchProvider` interface from Task 5
  - [ ] Job submission: Upload to GCS, create batch job
  - [ ] Status polling: Check job status until complete/failed
  - [ ] Result retrieval: Download from GCS, parse Gemini response format
  - [ ] Webhook support: Handle batch completion webhooks
  - [ ] Error handling: Failed jobs, GCS errors, timeout handling
  - [ ] Unit tests at `__tests__/lib/providers/gemini-batch.test.ts` (>80% coverage)

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test batch job submission
    Tool: Bash (Jest with mocking)
    Preconditions: Gemini batch adapter implemented
    Steps:
      1. Create sample batch requests (2-3 items)
      2. Call submit method
      3. Verify GCS upload occurs
      4. Verify batch job creation API called
      5. Check returned job ID
    Expected Result: Job submitted successfully, valid job ID returned
    Failure Indicators: Upload fails, API error, no job ID
    Evidence: .sisyphus/evidence/task-10-submit-test.log

  Scenario: Test batch status polling
    Tool: Bash (Jest with mocking)
    Preconditions: Gemini batch adapter implemented
    Steps:
      1. Create batch job and get job ID
      2. Poll for status (mock different states: QUEUED, RUNNING, COMPLETED)
      3. Verify correct status returned at each stage
    Expected Result: Accurate status throughout job lifecycle
    Failure Indicators: Wrong status, polling errors, infinite loop
    Evidence: .sisyphus/evidence/task-10-polling-test.log

  Scenario: Test result retrieval
    Tool: Bash (Jest with mocking)
    Preconditions: Gemini batch adapter implemented, completed batch job
    Steps:
      1. Mock completed batch job with GCS result URI
      2. Call result retrieval method
      3. Verify GCS download occurs
      4. Verify results parsed correctly
      5. Check format matches expected structure
    Expected Result: Results retrieved and parsed successfully
    Failure Indicators: Download fails, parse error, wrong format
    Evidence: .sisyphus/evidence/task-10-retrieval-test.log
  ```

  **Evidence to Capture**:
  - [ ] `apps/web/lib/providers/gemini-batch.ts` - Batch adapter implementation
  - [ ] `__tests__/lib/providers/gemini-batch.test.ts` - Unit tests
  - [ ] `.sisyphus/evidence/task-10-submit-test.log` - Submission test
  - [ ] `.sisyphus/evidence/task-10-polling-test.log` - Polling test
  - [ ] `.sisyphus/evidence/task-10-retrieval-test.log` - Retrieval test

  **Commit**: YES
  - Message: `feat(providers): add Gemini Batch API adapter`
  - Files: `apps/web/lib/providers/gemini-batch.ts`, `__tests__/lib/providers/gemini-batch.test.ts`
  - Pre-commit: `bun test lib/providers/gemini-batch` (must pass)

- [ ] 11. Migrate AI Search - Search Module

  **What to do**:
  - Update `apps/scraper/scrapers/ai_search/search.py` to use Gemini search grounding via adapter from Task 9
  - Replace SerpAPI/Brave client instantiation with Gemini search provider
  - Maintain backward compatibility (existing code should still work)
  - Add feature flag check to toggle between SerpAPI and Gemini
  - Update cost tracking to reflect Gemini pricing (no per-search cost)
  - Test with feature flag enabled and disabled

  **Must NOT do**:
  - Do NOT remove SerpAPI/Brave code yet (keep as fallback)
  - Do NOT change result format (maintain backward compatibility)
  - Do NOT skip feature flag (must be toggleable)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (integration task)
  - **Skills**: None
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T12, T13, T14)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 16 (regression tests need this)
  - **Blocked By**: Task 8 (feature flags), Task 9 (search adapter)

  **References** (CRITICAL):
  **Pattern References** (existing code):
  - `apps/scraper/scrapers/ai_search/search.py:296-407` - SearchClient implementation
  - `apps/scraper/scrapers/ai_search/search.py:16` - SUPPORTED_SEARCH_PROVIDERS

  **API/Type References** (what to implement against):
  - `apps/scraper/scrapers/providers/gemini_search.py` (from Task 9) - Gemini search provider

  **WHY Each Reference Matters**:
  - SearchClient: Shows current provider selection and fallback logic
  - SUPPORTED_SEARCH_PROVIDERS: Where to add "gemini" option

  **Acceptance Criteria**:
  - [ ] SearchClient updated to support Gemini provider
  - [ ] Feature flag `GEMINI_AI_SEARCH_ENABLED` controls provider selection
  - [ ] Gemini provider added to SUPPORTED_SEARCH_PROVIDERS
  - [ ] Cost tracking updated (Gemini search included in LLM cost, not separate)
  - [ ] Unit tests updated to test both SerpAPI and Gemini paths
  - [ ] Integration test passes with feature flag on and off

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test search with Gemini provider
    Tool: Bash (pytest)
    Preconditions: Gemini search adapter implemented, feature flag enabled
    Steps:
      1. Set GEMINI_AI_SEARCH_ENABLED=true
      2. Call SearchClient.search() with test query
      3. Verify Gemini grounding is used (check logs)
      4. Verify results returned in expected format
    Expected Result: Search uses Gemini, returns valid results
    Failure Indicators: Still uses SerpAPI, errors, wrong format
    Evidence: .sisyphus/evidence/task-11-search-gemini-test.log

  Scenario: Test fallback to SerpAPI when feature flag off
    Tool: Bash (pytest)
    Preconditions: Search module migrated
    Steps:
      1. Set GEMINI_AI_SEARCH_ENABLED=false
      2. Call SearchClient.search() with test query
      3. Verify SerpAPI is used (check logs)
    Expected Result: Falls back to SerpAPI when flag disabled
    Failure Indicators: Still tries to use Gemini, no fallback
    Evidence: .sisyphus/evidence/task-11-fallback-test.log
  ```

  **Evidence to Capture**:
  - [ ] Updated `apps/scraper/scrapers/ai_search/search.py`
  - [ ] `.sisyphus/evidence/task-11-search-gemini-test.log`
  - [ ] `.sisyphus/evidence/task-11-fallback-test.log`

  **Commit**: YES
  - Message: `feat(ai_search): integrate Gemini search grounding with feature flag`
  - Files: `apps/scraper/scrapers/ai_search/search.py`
  - Pre-commit: `python -m pytest tests/test_ai_search.py -v` (must pass)

- [ ] 12. Migrate AI Search - Name Consolidator

  **What to do**:
  - Update `apps/scraper/scrapers/ai_search/name_consolidator.py` to use Gemini client
  - Replace OpenAI client calls with Gemini provider from Task 6
  - Maintain prompt compatibility (test that prompts work with Gemini)
  - Add feature flag check to toggle between OpenAI and Gemini
  - Update cost tracking to reflect Gemini pricing
  - Ensure temperature=0 behavior is equivalent

  **Must NOT do**:
  - Do NOT change prompts unless absolutely necessary
  - Do NOT remove OpenAI code path
  - Do NOT skip temperature validation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (integration task)
  - **Skills**: `gemini-api-dev`
  - **Skills Evaluated but Omitted**: N/A

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T11, T13, T14)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 16
  - **Blocked By**: Task 6 (Python Gemini client), Task 8 (feature flags)

  **References** (CRITICAL):
  - `apps/scraper/scrapers/ai_search/name_consolidator.py:76-84` - Current OpenAI usage

  **Acceptance Criteria**:
  - [ ] NameConsolidator updated to support Gemini provider
  - [ ] Feature flag controls provider selection
  - [ ] Prompts tested with Gemini (output quality comparable)
  - [ ] Cost tracking updated for Gemini
  - [ ] Unit tests pass with both providers

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test name consolidation with Gemini
    Tool: Bash (pytest)
    Preconditions: Name consolidator migrated
    Steps:
      1. Create test case with abbreviated product name
      2. Run name consolidation with Gemini
      3. Compare output to expected canonical name
    Expected Result: Canonical name extracted correctly
    Failure Indicators: Wrong name, errors, format issues
    Evidence: .sisyphus/evidence/task-12-consolidation-test.log
  ```

  **Commit**: YES

- [ ] 13. Migrate AI Search - Source Selector

  **What to do**:
  - Update `apps/scraper/scrapers/ai_search/source_selector.py` to use Gemini client
  - Replace OpenAI client calls with Gemini provider
  - Test that LLM-based source ranking works with Gemini
  - Add feature flag check
  - Update cost tracking

  **Must NOT do**:
  - Do NOT change selection algorithm
  - Do NOT remove OpenAI code path

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `gemini-api-dev`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T11, T12, T14)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 16
  - **Blocked By**: Task 6, Task 8

  **Acceptance Criteria**:
  - [ ] SourceSelector updated for Gemini
  - [ ] Feature flag controls provider
  - [ ] Ranking quality validated
  - [ ] Tests pass with both providers

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test source selection with Gemini
    Tool: Bash (pytest)
    Steps:
      1. Provide search results to source selector
      2. Run with Gemini provider
      3. Verify best source selected correctly
    Expected Result: High-quality source selected
    Evidence: .sisyphus/evidence/task-13-selection-test.log
  ```

  **Commit**: YES

- [ ] 14. Migrate AI Search - Update Cost Tracking

  **What to do**:
  - Update `apps/scraper/scrapers/ai_cost_tracker.py` to track Gemini costs
  - Add Gemini pricing constants (input/output per 1M tokens)
  - Implement cost calculation for Gemini operations
  - Ensure cost tracking works for both OpenAI and Gemini
  - Update cost attribution (search cost now included in LLM cost for Gemini)

  **Must NOT do**:
  - Do NOT break existing OpenAI cost tracking
  - Do NOT skip Gemini cost calculation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T11, T12, T13)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 16
  - **Blocked By**: Task 6, Task 8

  **References** (CRITICAL):
  - `apps/scraper/scrapers/ai_cost_tracker.py:58-64` - Current OpenAI pricing

  **Acceptance Criteria**:
  - [ ] Gemini pricing added to cost tracker
  - [ ] Cost calculation supports both providers
  - [ ] Tests verify correct cost calculation

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test Gemini cost calculation
    Tool: Bash (pytest)
    Steps:
      1. Track Gemini operation with known token counts
      2. Verify calculated cost matches expected
    Expected Result: Accurate cost calculation
    Evidence: .sisyphus/evidence/task-14-cost-test.log
  ```

  **Commit**: YES

- [ ] 15. Migrate crawl4ai Engine (or Alternative)

  **What to do**:
  - Based on Task 1 findings, either:
    a) Update crawl4ai to use Gemini provider (if supported)
    b) Replace crawl4ai LLM extraction with direct Gemini calls
  - Implement chosen approach in `crawl4ai_extractor.py`
  - Add feature flag for crawl4ai provider selection
  - Ensure extraction quality maintained

  **Must NOT do**:
  - Do NOT break crawl4ai functionality
  - Do NOT proceed without Task 1 decision

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (depends on Task 1)
  - **Skills**: `gemini-api-dev`, `crawl4ai`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T1)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 16
  - **Blocked By**: Task 1 (crawl4ai compatibility decision)

  **Acceptance Criteria**:
  - [ ] crawl4ai extraction works with chosen approach
  - [ ] Feature flag controls provider
  - [ ] Extraction quality validated against baseline

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test crawl4ai extraction
    Tool: Bash (pytest)
    Steps:
      1. Run crawl4ai extraction with test page
      2. Verify extraction succeeds
      3. Compare output to baseline
    Expected Result: Extraction works, quality maintained
    Evidence: .sisyphus/evidence/task-15-crawl4ai-test.log
  ```

  **Commit**: YES

- [ ] 16. Add Python Regression Tests

  **What to do**:
  - Create comprehensive regression tests for all Python migrations
  - Test both OpenAI and Gemini providers for each component
  - Use golden dataset from Task 2 for validation
  - Add tests for feature flag behavior
  - Ensure >80% test coverage

  **Must NOT do**:
  - Do NOT skip edge cases
  - Do NOT test only happy paths

  **Recommended Agent Profile**:
  - **Category**: `quick` (test writing)
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T11-15)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 23 (parallel run system)
  - **Blocked By**: Tasks 11-15

  **Acceptance Criteria**:
  - [ ] Regression tests created for all migrated components
  - [ ] Tests cover both OpenAI and Gemini paths
  - [ ] Golden dataset used for validation
  - [ ] >80% code coverage

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Run full regression suite
    Tool: Bash (pytest)
    Steps:
      1. Run all regression tests
      2. Verify coverage report
      3. Check all tests pass
    Expected Result: All tests pass, coverage >80%
    Evidence: .sisyphus/evidence/task-16-regression-report.html
  ```

  **Commit**: YES


- [ ] 17. Migrate Consolidation - Gemini Client Integration

  **What to do**:
  - Update `apps/web/lib/consolidation/openai-client.ts` to support Gemini provider
  - Replace hardcoded OpenAI with provider-agnostic client from Task 7
  - Add feature flag check to select provider
  - Maintain client caching behavior
  - Ensure error handling works for both providers

  **Must NOT do**:
  - Do NOT break existing OpenAI client functionality
  - Do NOT remove OpenAI code path

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (integration task)
  - **Skills**: `gemini-api-dev`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T18-21)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 22
  - **Blocked By**: Task 7 (TypeScript Gemini client), Task 8 (feature flags)

  **Acceptance Criteria**:
  - [ ] OpenAI client updated to support Gemini
  - [ ] Feature flag controls provider selection
  - [ ] Client caching works for both providers
  - [ ] Tests pass with both providers

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test client with Gemini
    Tool: Bash (Jest)
    Steps:
      1. Enable GEMINI_BATCH_ENABLED flag
      2. Get client instance
      3. Verify Gemini client returned
    Expected Result: Gemini client configured correctly
    Evidence: .sisyphus/evidence/task-17-client-test.log
  ```

  **Commit**: YES

- [ ] 18. Migrate Consolidation - Batch Service

  **What to do**:
  - Update `apps/web/lib/consolidation/batch-service.ts` to use Gemini Batch API adapter from Task 10
  - Replace OpenAI batch submission logic with Gemini batch flow
  - Implement GCS integration for file upload/download
  - Add webhook handler for Gemini batch completion
  - Maintain backward compatibility with existing batch workflow
  - Add feature flag check to toggle between OpenAI and Gemini

  **Must NOT do**:
  - Do NOT remove OpenAI batch code (keep as fallback)
  - Do NOT skip GCS integration (required for Gemini)
  - Do NOT break existing batch job monitoring

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (complex integration)
  - **Skills**: `gemini-api-dev`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T19-21)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 22
  - **Blocked By**: Task 10 (batch adapter), Task 8 (feature flags)

  **Acceptance Criteria**:
  - [ ] Batch service uses Gemini Batch API when flag enabled
  - [ ] GCS integration working (upload/download)
  - [ ] Webhook handler implemented for batch completion
  - [ ] Existing monitoring still works
  - [ ] Tests pass with both OpenAI and Gemini

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test batch submission with Gemini
    Tool: Bash (Jest with mocking)
    Steps:
      1. Create test batch requests
      2. Submit with Gemini enabled
      3. Verify GCS upload and job creation
    Expected Result: Batch submitted successfully
    Evidence: .sisyphus/evidence/task-18-batch-submit-test.log

  Scenario: Test batch retrieval with Gemini
    Tool: Bash (Jest with mocking)
    Steps:
      1. Mock completed Gemini batch job
      2. Call retrieval method
      3. Verify results downloaded from GCS
    Expected Result: Results retrieved successfully
    Evidence: .sisyphus/evidence/task-18-batch-retrieval-test.log
  ```

  **Commit**: YES

- [ ] 19. Migrate Consolidation - Prompt Builder

  **What to do**:
  - Update `apps/web/lib/consolidation/prompt-builder.ts` for Gemini compatibility
  - Test existing prompts with Gemini (may need minor adjustments)
  - Ensure system prompts work correctly with Gemini
  - Verify structured output formatting

  **Must NOT do**:
  - Do NOT rewrite prompts (only adjust if absolutely necessary)
  - Do NOT change output format requirements

  **Recommended Agent Profile**:
  - **Category**: `quick` (prompt validation)
  - **Skills**: `gemini-api-dev`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T18, T20, T21)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 22
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Prompts tested with Gemini
  - [ ] Output quality validated against OpenAI baseline
  - [ ] Any adjustments documented

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test prompts with Gemini
    Tool: Bash (Jest)
    Steps:
      1. Build prompt using prompt-builder
      2. Send to Gemini
      3. Verify output quality
    Expected Result: Quality matches OpenAI baseline
    Evidence: .sisyphus/evidence/task-19-prompt-test.log
  ```

  **Commit**: YES

- [ ] 20. Migrate Consolidation - Taxonomy Validator

  **What to do**:
  - Update `apps/web/lib/consolidation/taxonomy-validator.ts` for Gemini structured outputs
  - Adapt JSON schema for Gemini (responseSchema vs json_schema)
  - Handle Gemini's "ANY mode enum limitation" if applicable
  - Test taxonomy validation with Gemini outputs

  **Must NOT do**:
  - Do NOT simplify schema unless necessary
  - Do NOT skip enum validation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` (structured output handling)
  - **Skills**: `gemini-api-dev`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T18, T19, T21)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 22
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Taxonomy validator works with Gemini structured outputs
  - [ ] JSON schema adapted for Gemini format
  - [ ] Enum limitations handled if encountered
  - [ ] Tests pass with both providers

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test taxonomy validation with Gemini
    Tool: Bash (Jest)
    Steps:
      1. Generate structured output with Gemini
      2. Run taxonomy validator
      3. Verify validation passes for valid data
    Expected Result: Validation works correctly
    Evidence: .sisyphus/evidence/task-20-taxonomy-test.log
  ```

  **Commit**: YES

- [ ] 21. Migrate Consolidation - Webhook Handler

  **What to do**:
  - Update `apps/web/app/api/admin/consolidation/webhook/route.ts` to handle Gemini batch webhooks
  - Implement webhook verification (Gemini webhooks have different auth than OpenAI)
  - Process batch completion notifications from Gemini
  - Trigger result retrieval on webhook receipt

  **Must NOT do**:
  - Do NOT remove existing webhook handling (may be used by other systems)
  - Do NOT skip webhook verification (security risk)

  **Recommended Agent Profile**:
  - **Category**: `quick` (webhook implementation)
  - **Skills**: `gemini-api-dev`

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T18, T19, T20)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 22
  - **Blocked By**: Task 10 (batch adapter webhook support)

  **Acceptance Criteria**:
  - [ ] Webhook handler supports Gemini batch notifications
  - [ ] Webhook verification implemented
  - [ ] Result retrieval triggered on completion
  - [ ] Tests verify webhook handling

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test Gemini webhook handling
    Tool: Bash (curl or Jest)
    Steps:
      1. Mock Gemini batch completion webhook
      2. Send to webhook endpoint
      3. Verify result retrieval triggered
    Expected Result: Webhook processed, results retrieved
    Evidence: .sisyphus/evidence/task-21-webhook-test.log
  ```

  **Commit**: YES

- [ ] 22. Add TypeScript Regression Tests

  **What to do**:
  - Create comprehensive regression tests for all TypeScript migrations
  - Test both OpenAI and Gemini providers for each component
  - Use golden dataset from Task 2 for validation
  - Add integration tests for batch workflow
  - Ensure >80% test coverage

  **Must NOT do**:
  - Do NOT skip edge cases
  - Do NOT test only happy paths

  **Recommended Agent Profile**:
  - **Category**: `quick` (test writing)
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T17-21)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 17-21

  **Acceptance Criteria**:
  - [ ] Regression tests for all TypeScript migrations
  - [ ] Tests cover both OpenAI and Gemini paths
  - [ ] Golden dataset used for validation
  - [ ] >80% code coverage

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Run full TypeScript regression suite
    Tool: Bash (Jest)
    Steps:
      1. Run all consolidation tests
      2. Verify coverage report
      3. Check all tests pass
    Expected Result: All tests pass, coverage >80%
    Evidence: .sisyphus/evidence/task-22-regression-report.html
  ```

  **Commit**: YES

- [ ] 23. Implement Parallel Run System

  **What to do**:
  - Create system to run OpenAI and Gemini in parallel for comparison
  - Implement result comparison and scoring
  - Store parallel run results for analysis
  - Build alerting for significant quality differences
  - Support configurable sample rate (e.g., 10% of traffic)

  **Must NOT do**:
  - Do NOT run 100% parallel (too expensive)
  - Do NOT skip result storage (need historical data)

  **Recommended Agent Profile**:
  - **Category**: `deep` (complex system)
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T16, T22)
  - **Parallel Group**: Wave 6
  - **Blocks**: Task 25
  - **Blocked By**: Task 4 (evaluation harness), Task 16 (Python tests), Task 22 (TypeScript tests)

  **Acceptance Criteria**:
  - [ ] Parallel run system implemented
  - [ ] Results comparison working
  - [ ] Alerting for quality degradation
  - [ ] Historical data storage

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Test parallel run with sample
    Tool: Bash (integration test)
    Steps:
      1. Enable parallel run for 10% of traffic
      2. Process batch of products
      3. Verify both OpenAI and Gemini results captured
      4. Check comparison scores generated
    Expected Result: Parallel run works, results comparable
    Evidence: .sisyphus/evidence/task-23-parallel-test.log
  ```

  **Commit**: YES

- [ ] 24. Build Monitoring Dashboard

  **What to do**:
  - Create dashboard for monitoring migration progress
  - Show cost comparison (OpenAI vs Gemini)
  - Display quality metrics (accuracy, confidence)
  - Show feature flag status
  - Add alerting for issues

  **Must NOT do**:
  - Do NOT build complex UI (simple is fine)
  - Do NOT skip cost tracking

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` (dashboard UI)
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T23)
  - **Parallel Group**: Wave 6
  - **Blocks**: Task 25
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Dashboard created at /admin/monitoring/gemini-migration
  - [ ] Cost metrics displayed
  - [ ] Quality metrics displayed
  - [ ] Feature flag status shown

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: View monitoring dashboard
    Tool: Playwright
    Steps:
      1. Navigate to dashboard
      2. Verify metrics load
      3. Check cost comparison visible
    Expected Result: Dashboard loads with all metrics
    Evidence: .sisyphus/evidence/task-24-dashboard.png
  ```

  **Commit**: YES

- [ ] 25. Gradual Traffic Shift

  **What to do**:
  - Implement gradual rollout: 10% → 50% → 100% of traffic to Gemini
  - Monitor quality and cost at each stage
  - Build automatic rollback on quality degradation
  - Document rollback procedure
  - Get approval before each stage increase
  - Create `scripts/verify_rollout.sh` for automated rollout verification

  **Must NOT do**:
  - Do NOT skip monitoring between stages
  - Do NOT proceed to next stage without approval

  **Recommended Agent Profile**:
  - **Category**: `deep` (orchestration)
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T23, T24)
  - **Parallel Group**: Wave 6
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Task 8a (flags API), Task 23 (parallel run), Task 24 (monitoring)

  **Acceptance Criteria**:
  - [ ] 10% rollout completed with monitoring
  - [ ] 50% rollout completed with monitoring
  - [ ] 100% rollout completed
  - [ ] Rollback procedure tested
  - [ ] `scripts/verify_rollout.sh` created and tested

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Execute traffic shift stages
    Tool: Bash (scripts/verify_rollout.sh)
    Preconditions: Monitoring dashboard operational, feature flags configured
    Steps:
      1. Run script to set GEMINI_TRAFFIC_PERCENT=10
      2. Verify metrics show 10% Gemini traffic via monitoring API
      3. Wait 48 hours (or simulate for testing)
      4. Run quality check: compare OpenAI vs Gemini accuracy scores
      5. If quality >= threshold, set GEMINI_TRAFFIC_PERCENT=50
      6. Verify metrics show 50% traffic
      7. Wait 48 hours, run quality check
      8. If quality >= threshold, set GEMINI_TRAFFIC_PERCENT=100
      9. Verify all traffic using Gemini
    Expected Result: Successful staged rollout with quality validation at each stage
    Failure Indicators: Quality degradation below threshold, errors in traffic split
    Evidence: .sisyphus/evidence/task-25-rollout-metrics.json
  ```

  **Commit**: YES
  - Message: `feat(scripts): add rollout verification script`
  - Files: `scripts/verify_rollout.sh`

- [ ] 26. Document Rollback Procedures

  **What to do**:
  - Document step-by-step rollback procedure
  - Include feature flag changes needed
  - Document data consistency considerations
  - Create runbook for incident response
  - Test rollback procedure (dry run)
  - Create `scripts/test_rollback.sh` and `scripts/rollback_to_openai.sh`

  **Must NOT do**:
  - Do NOT skip testing rollback
  - Do NOT make documentation vague

  **Recommended Agent Profile**:
  - **Category**: `quick` (documentation)
  - **Skills**: None

  **Parallelization**:
  - **Can Run In Parallel**: YES (with T23-T25)
  - **Parallel Group**: Wave 6
  - **Blocks**: F1-F4
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Rollback runbook created at `docs/runbooks/gemini-rollback.md`
  - [ ] Feature flag procedures documented
  - [ ] Incident response steps documented
  - [ ] Dry run completed successfully
  - [ ] `scripts/test_rollback.sh` created and tested
  - [ ] `scripts/rollback_to_openai.sh` created and tested

  **QA Scenarios (MANDATORY):**
  ```
  Scenario: Execute rollback dry run
    Tool: Bash (scripts/test_rollback.sh)
    Preconditions: Rollback runbook created, feature flags configured, test environment ready
    Steps:
      1. Set GEMINI_TRAFFIC_PERCENT=100 to simulate full Gemini deployment
      2. Verify system is using Gemini via monitoring API
      3. Trigger simulated incident (set SIMULATE_INCIDENT=true)
      4. Execute rollback script: ./scripts/rollback_to_openai.sh
      5. Verify GEMINI_TRAFFIC_PERCENT=0 and all feature flags disabled
      6. Verify system returns to OpenAI via monitoring API
      7. Verify data consistency: check no partial/incomplete consolidations
      8. Verify response time < 5 minutes from incident to full rollback
      9. Capture logs and evidence
    Expected Result: Successful rollback in < 5 minutes, system fully on OpenAI
    Failure Indicators: Rollback takes > 5 min, data inconsistency, flags not properly set
    Evidence: .sisyphus/evidence/task-26-rollback-test.log
  ```

  **Commit**: YES
  - Message: `docs(runbook): add Gemini migration rollback procedures`
  - Files: `docs/runbooks/gemini-rollback.md`, `scripts/test_rollback.sh`, `scripts/rollback_to_openai.sh`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | Evidence [N files] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `ruff check .` + `pytest` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [N files] | VERDICT`

---

## Commit Strategy

### Phase 1 (Validation)
- T1: `research(crawl4ai): verify Gemini compatibility`
- T2: `test(consolidation): add golden dataset for regression`
- T3: `chore(infra): setup GCS bucket for Gemini batch operations`
- T4: `test(consolidation): add side-by-side evaluation harness`
- T5: `feat(providers): add provider-agnostic interfaces`

### Phase 2 (Adapters)
- T6: `feat(providers): add Python Gemini client adapter`
- T7: `feat(providers): add TypeScript Gemini client adapter`
- T8: `feat(config): add feature flag infrastructure`
- T8a: `feat(api): add feature flags admin endpoint`
- T9: `feat(providers): add Gemini search grounding adapter`
- T10: `feat(providers): add Gemini Batch API adapter`

### Phase 3 (Python Migration)
- T11: `feat(ai_search): integrate Gemini search grounding`
- T12: `feat(ai_search): migrate name consolidator to Gemini`
- T13: `feat(ai_search): migrate source selector to Gemini`
- T14: `feat(ai_search): update cost tracking for Gemini`
- T15: `feat(crawl4ai): migrate extraction to Gemini` (or alternative)
- T16: `test(ai_search): add regression tests`

### Phase 4 (TypeScript Migration)
- T17: `feat(consolidation): integrate Gemini client`
- T18: `feat(consolidation): migrate batch service to Gemini`
- T19: `feat(consolidation): validate prompts with Gemini`
- T20: `feat(consolidation): migrate taxonomy validator`
- T21: `feat(consolidation): add Gemini webhook handler`
- T22: `test(consolidation): add regression tests`

### Phase 5 (Optimization)
- T23: `feat(monitoring): add parallel run system`
- T24: `feat(admin): add migration monitoring dashboard`
- T25: `feat(scripts): add rollout verification script`
- T26: `docs(runbook): add rollback procedures and scripts`

---

## Success Criteria

### Verification Commands
```bash
# Python tests
cd apps/scraper && python -m pytest tests/ -v --tb=short

# TypeScript tests
cd apps/web && bun test

# Type checking
cd apps/web && tsc --noEmit
cd apps/scraper && mypy scrapers/ || true

# Linting
cd apps/scraper && ruff check .

# Feature flag validation
curl http://localhost:3000/api/admin/flags
```

### Final Checklist
- [ ] All 27 tasks complete
- [ ] All 4 final verification agents approve
- [ ] Cost savings validated (85%+ vs baseline)
- [ ] Quality parity validated (within 5% of OpenAI)
- [ ] Rollback procedure tested
- [ ] Documentation complete
- [ ] Monitoring dashboard operational
- [ ] User approval obtained
