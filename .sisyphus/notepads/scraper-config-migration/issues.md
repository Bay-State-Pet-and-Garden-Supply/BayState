# Scraper Config Migration - Issues

- Date: 2026-03-12
- Issue: ScraperConfig model did not support AI scraper types used in YAML configs (agentic, crawl4ai). Validation script failed.
- Action: Updated apps/scraper/scrapers/models/config.py:
  - Added scraper_type Literal["static", "agentic", "crawl4ai"] (default "static").
  - Added AIConfig nested model matching ai_config YAML structure (provider, task, max_steps, confidence_threshold, llm_model, use_vision, headless).
  - Added credential_refs: list[str] for runtime credential lookups.
- Result: Ran validation script. All 12 AI configs validated successfully.

Next steps:
- Ensure runtime code reads ai_config and credential_refs where appropriate (executor and daemon). 
- Add unit tests for AI-config parsing.
