# Implementation Plan: url_selection_refinement_20260312

## Phase 1: Trusted Retailer Update [checkpoint: 560dee4]
Expand the list of boosted domains to include more relevant pet and garden suppliers.

- [x] **Task: Update `SearchScorer.TRUSTED_RETAILERS`** [eb3bbd3]
    - [ ] Add new unit tests in `tests/unit/test_trusted_retailers.py` to verify that the new domains receive the correct boost.
    - [ ] Expand the `TRUSTED_RETAILERS` set in `apps/scraper/scrapers/ai_search/scoring.py`.
    - [ ] Verify all tests pass.
- [x] **Task: Conductor - User Manual Verification 'Phase 1: Trusted Retailers' (Protocol in workflow.md)** [560dee4]

## Phase 2: LLM Source Selector Implementation
Introduce the LLM-powered pre-ranking component.

- [ ] **Task: Create `LLMSourceSelector` Class**
    - [ ] Write unit tests in `tests/unit/test_source_selector.py` mocking OpenAI responses to verify correct ranking logic.
    - [ ] Create `apps/scraper/scrapers/ai_search/source_selector.py`.
    - [ ] Implement the `gpt-4o-mini` prompt logic to analyze search snippets and return the best URL.
- [ ] **Task: Integrate `LLMSourceSelector` into `AISearchScraper`**
    - [ ] Update `AISearchScraper` in `apps/scraper/scrapers/ai_search/scraper.py` to call the selector after fetching search results.
    - [ ] Implement the override logic (LLM choice takes precedence).
    - [ ] Update unit tests to verify the integration.
- [ ] **Task: Conductor - User Manual Verification 'Phase 2: LLM Source Selection' (Protocol in workflow.md)**

## Phase 3: Telemetry & Final Integration
Ensure visibility into the new selection process and perform final validation.

- [ ] **Task: Update Telemetry for Source Selection**
    - [ ] Modify `AISearchScraper._log_telemetry` to include a `selection_method` field (heuristic vs. llm).
    - [ ] Add tracking for heuristic vs. LLM agreement.
- [ ] **Task: Final Integration Test**
    - [ ] Run a test scrape for a known product to confirm the LLM correctly selects the best manufacturer page.
    - [ ] Verify logs and telemetry output.
- [ ] **Task: Conductor - User Manual Verification 'Phase 3: Final Integration' (Protocol in workflow.md)**
