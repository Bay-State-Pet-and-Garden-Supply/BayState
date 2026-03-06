# Implementation Plan: Refactor and Optimize crawl4ai Implementation

## Phase 1: Engine Refactoring (Centralization & Features) [checkpoint: a9f3424]
Refactor the core `Crawl4AIEngine` to support v0.4+ parameters and parallelism.

- [x] Task: Update `Crawl4AIEngine` to support `magic`, `simulate_user`, and `remove_overlay_elements`. a9f3424
    - [x] Add `magic` and `simulate_user` to `BrowserConfig` / `CrawlerRunConfig` in `engine.py`.
    - [x] Implement `remove_overlay_elements` in `CrawlerRunConfig`.
    - [x] Add default `excluded_tags` (nav, footer, ads) to `CrawlerRunConfig`.
- [x] Task: Implement `arun_many` in `Crawl4AIEngine` for efficient parallelism. a9f3424
    - [x] Refactor `crawl_many` to use `self.crawler.arun_many(urls, config=self._run_config)`.
    - [x] Ensure concurrency is configurable with a default limit of 3.
- [x] Task: Enhance `Crawl4AIEngine` with `session_id` and `cache_mode`. a9f3424
    - [x] Implement `domain-persistent` session ID logic in `crawl` and `arun_many`.
    - [x] Set default `cache_mode` to `ENABLED` (HTML + LLM).
- [x] Task: Add failing tests for `Crawl4AIEngine` v0.4+ features. a9f3424
- [x] Task: Conductor - User Manual Verification 'Phase 1: Engine Refactoring' (Protocol in workflow.md) a9f3424

## Phase 2: Extraction Strategy & Content Filtering [checkpoint: acbb2f8]
Implement the fallback chain and CSS-based pruning to optimize quality and cost.

- [x] Task: Update `Crawl4AIEngine` to support `css_selector` and the Extraction Strategy chain.
    - [x] Add `css_selector` to `CrawlerRunConfig` to target specific product containers.
    - [x] Integrate the `StrategyFactory` / `build_fallback_chain` logic into the engine's crawl flow.
- [x] Task: Refactor `ai_discovery` modules to use `Crawl4AIEngine`.
    - [x] Replace manual `crawl4ai` imports/logic in `ai_discovery.py` with `Crawl4AIEngine`.
    - [x] Migrate `crawl4ai_extractor.py` to use the centralized engine.
- [x] Task: Add failing tests for fallback chain and content filtering.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Extraction Strategy & Content Filtering' (Protocol in workflow.md)

## Phase 3: Integration & Validation
Verify full integration and ensure performance/cost goals are met.

- [~] Task: Perform end-to-end (E2E) testing with live product URLs.
    - [ ] Verify `magic=True` avoids 403s on a known-protected site.
    - [ ] Measure LLM token usage reduction from `css_selector` pruning.
    - [ ] Confirm concurrency speedup using `arun_many`.
- [ ] Task: Update documentation and finalize code style compliance.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Integration & Validation' (Protocol in workflow.md)
