# T7 Findings: LLM Fallback Integration

## Implemented

- Added LLM strategy wrapper at `BayStateScraper/scraper_backend/src/crawl4ai_engine/strategies/llm.py`.
  - Wraps crawl4ai `LLMExtractionStrategy`.
  - Supports LiteLLM provider strings (`<provider>/<model>`), `api_token`, optional `base_url`.
  - Supports schema extraction settings (`schema`, `extraction_type`, chunking, input format, extra args).
  - Adds confidence scoring and threshold filtering.
  - Integrates existing `scrapers/ai_cost_tracker.py` via `AICostTracker.track_extraction(...)`.
  - Tracks token usage from `total_usage` / `usages` and falls back to estimation when usage is unavailable.

- Added fallback chain at `BayStateScraper/scraper_backend/src/crawl4ai_engine/strategies/fallback.py`.
  - Implements ordered fallback: **CSS -> XPath -> LLM**.
  - Includes configurable `confidence_threshold`.
  - Includes `ExtractionFallbackChain.from_config(...)` to build chain from config blocks.
  - Returns structured result metadata with winning strategy and confidence.

- Updated `BayStateScraper/scraper_backend/src/crawl4ai_engine/types.py`.
  - `CrawlConfig.schema` widened from `dict[str, str] | None` to `dict[str, Any] | None` to support richer fallback configuration payloads.

- Extended tests in `BayStateScraper/scraper_backend/tests/unit/crawl4ai_engine/test_strategies.py`.
  - Added tests for:
    - LiteLLM provider forwarding and cost tracker integration.
    - LLM confidence threshold filtering.
    - Fallback order CSS -> XPath before LLM.
    - LLM fallback when CSS/XPath fail.
  - Added local crawl4ai test stubs to keep tests runnable when crawl4ai is not installed in CI/dev env.

## Verification

- Targeted tests:
  - `python -m pytest scraper_backend/tests/unit/crawl4ai_engine/test_strategies.py`
  - Result: **6 passed**.

- Broader crawl4ai_engine unit suite:
  - `python -m pytest scraper_backend/tests/unit/crawl4ai_engine`
  - Result: **59 passed, 3 failed**.
  - Failing tests are in `test_retry.py` and appear pre-existing / unrelated to T7 changes:
    - `test_recovery_handler`
    - `test_failure_context_integration`
    - `test_scenario_anti_bot_escalation`

## Blockers / Notes

- LSP diagnostics tool in this environment cannot run because it cannot resolve `basedpyright-langserver` (tool-level executable resolution issue). The command is installed in user scripts, but LSP integration still reports it as unavailable.
