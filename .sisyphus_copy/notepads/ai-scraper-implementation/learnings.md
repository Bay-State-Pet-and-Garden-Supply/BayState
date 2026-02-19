## 2026-02-19
- `WorkflowExecutor` can support agentic scrapers without constructor changes by introducing internal `scraper_type`, `ai_context`, and `ai_browser` attributes.
- Initializing browser-use through `importlib.import_module("browser_use")` avoids static import resolution issues while preserving runtime behavior.
- Sharing an executor-level browser-use browser with AI handlers (via `ctx.ai_browser`) prevents per-step browser churn and reduces setup overhead.

- Comprehensive documentation created in `docs/ai-scraper.md`, covering installation, configuration, cost tracking, and migration.
- Main `README.md` updated with AI feature overview and links to detailed docs.
- Documented `AIDiscoveryScraper`, `AICostTracker`, and `AIMetricsCollector` integration for a complete operational overview.
