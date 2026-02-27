## 2026-02-19
- `WorkflowExecutor` can support agentic scrapers without constructor changes by introducing internal `scraper_type`, `ai_context`, and `ai_browser` attributes.
- Initializing browser-use through `importlib.import_module("browser_use")` avoids static import resolution issues while preserving runtime behavior.
- Sharing an executor-level browser-use browser with AI handlers (via `ctx.ai_browser`) prevents per-step browser churn and reduces setup overhead.

- Comprehensive documentation created in `docs/ai-scraper.md`, covering installation, configuration, cost tracking, and migration.
- Main `README.md` updated with AI feature overview and links to detailed docs.
- Documented `AIDiscoveryScraper`, `AICostTracker`, and `AIMetricsCollector` integration for a complete operational overview.

## 2026-02-19 (Task 16 - Site Selection)
- Site selection analysis completed for AI scraper PoC
- Selected 5 problematic sites meeting 2+ criteria:
  - Amazon (4/5 criteria): anti-bot, JS-heavy, selector breakage
  - Walmart (4/5 criteria): Cloudflare, React, frequent selector changes
  - Central Pet (3/5 criteria): AngularJS, complex selectors
  - Mazuri (2/5 criteria): Shopify variants, dynamic content
  - Coastal (2/5 criteria): JS variants, cookie handling

Key insight: Sites with anti-bot measures (Amazon, Walmart) are highest value targets because traditional scrapers struggle most there. AI's ability to adapt to UI changes provides ongoing maintenance savings beyond just handling anti-bot.

Created configs:
- ai-walmart.yaml
- ai-central-pet.yaml
- ai-mazuri.yaml
- ai-coastal.yaml
(ai-amazon.yaml already existed)

Total SKU lists prepared: 65 test SKUs, 15 fake SKUs, 10 edge cases across 5 sites
