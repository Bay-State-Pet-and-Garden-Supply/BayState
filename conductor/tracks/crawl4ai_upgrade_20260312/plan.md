# Implementation Plan: crawl4ai_upgrade_20260312

## Phase 1: Core Engine Upgrades (Anti-Bot & Stealth) [checkpoint: ca5ad83]
This phase focuses on upgrading the `Crawl4AIEngine` to support advanced stealth and session features.

- [x] **Task: Update `Crawl4AIEngine` for Stealth & Persistence** 6875053
    - [ ] Write unit tests in `tests/unit/crawl4ai_engine/test_engine_stealth.py` to verify `BrowserConfig` receives `enable_stealth=True` and handles `use_persistent_context` based on domain.
    - [ ] Implement `enable_stealth` and domain-specific `use_persistent_context` in `apps/scraper/src/crawl4ai_engine/engine.py`.
    - [ ] Verify tests pass and ensure no regressions in existing `crawl` and `crawl_many` methods.
- [x] **Task: Conductor - User Manual Verification 'Phase 1: Core Engine Upgrades' (Protocol in workflow.md)** 2547323

## Phase 2: LLM Efficiency (Pruning & Fit Markdown)
This phase integrates content filtering and markdown optimization to reduce token costs.

- [ ] **Task: Implement `PruningContentFilter` in `Crawl4AIEngine`**
    - [ ] Write unit tests in `tests/unit/crawl4ai_engine/test_pruning.py` to verify `PruningContentFilter` is applied to `CrawlerRunConfig` and effectively reduces markdown size.
    - [ ] Integrate `PruningContentFilter` into `apps/scraper/src/crawl4ai_engine/engine.py`.
    - [ ] Verify tests pass and check for content integrity (ensure product names/prices aren't accidentally pruned).
- [ ] **Task: Update `Crawl4AIExtractor` for LLM Optimization**
    - [ ] Write unit tests in `tests/unit/test_extractor_optimization.py` to verify `LLMExtractionStrategy` uses `input_format="fit_markdown"`, `chunk_token_threshold`, and `overlap_rate`.
    - [ ] Update `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` to pass these optimized parameters to the strategy.
    - [ ] Verify tests pass and compare token usage in telemetry logs (simulated or real).
- [ ] **Task: Conductor - User Manual Verification 'Phase 2: LLM Efficiency' (Protocol in workflow.md)**

## Phase 3: Escalation Chain & Fallback Integration
This phase automates the fallback process when primary crawling methods fail.

- [ ] **Task: Integrate Built-in Escalation & Fallback**
    - [ ] Write unit tests in `tests/unit/crawl4ai_engine/test_escalation.py` to verify `fallback_fetch_function` is triggered on 403 errors and correctly returns content.
    - [ ] Implement `fallback_fetch_function` in `apps/scraper/src/crawl4ai_engine/engine.py` by wrapping the existing `FallbackExtractor` logic.
    - [ ] Configure `Immediate Escalation` triggers in `CrawlerRunConfig`.
    - [ ] Verify tests pass by mocking 403 responses.
- [ ] **Task: Final Integration & Telemetry Update**
    - [ ] Update `Crawl4AIExtractor` telemetry to log new metrics (e.g., `pruning_enabled`, `fit_markdown_used`, `fallback_triggered`).
    - [ ] Run a small-scale integration test against a real supplier (e.g., PetEdge) to verify end-to-end functionality.
- [ ] **Task: Conductor - User Manual Verification 'Phase 3: Escalation Chain' (Protocol in workflow.md)**
