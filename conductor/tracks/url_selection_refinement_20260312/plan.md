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

- [x] **Task: Create `LLMSourceSelector` Class** [e56cb77]
    - [ ] Write unit tests in `tests/unit/test_source_selector.py` mocking OpenAI responses to verify correct ranking logic.
    - [ ] Create `apps/scraper/scrapers/ai_search/source_selector.py`.
    - [ ] Implement the `gpt-4o-mini` prompt logic to analyze search snippets and return the best URL.
- [x] **Task: Integrate `LLMSourceSelector` into `AISearchScraper`** [20a702e]
- [x] **Task: Implement Two-Pass Name Consolidation Discovery** [1f03d56]
    - [ ] Create `NameConsolidator` component to infer canonical brand/name from initial search results.
    - [ ] Update `AISearchScraper.scrape_product` to perform an initial "reconnaissance" search.
    - [ ] Implement a second "targeted" search using the consolidated name.
    - [ ] Verify that the targeted search surfaces higher quality manufacturer results.
    - [ ] Update `AISearchScraper` in `apps/scraper/scrapers/ai_search/scraper.py` to call the selector after fetching search results.
    - [ ] Implement the override logic (LLM choice takes precedence).
    - [ ] Update unit tests to verify the integration.
- [x] **Task: Conductor - User Manual Verification 'Phase 2: LLM Source Selection' (Protocol in workflow.md)** [095de06]

## Phase 3: Telemetry & Final Integration
Ensure visibility into the new selection process and perform final validation.

- [x] **Task: Update Telemetry for Source Selection** [b244055]
    - [ ] Modify `AISearchScraper._log_telemetry` to include a `selection_method` field (heuristic vs. llm).
    - [ ] Add tracking for heuristic vs. LLM agreement.
- [x] **Task: Final Integration Test** [5e9308c]
- [x] **Task: Conductor - User Manual Verification 'Phase 3: Final Integration' (Protocol in workflow.md)** [5e9308c]
