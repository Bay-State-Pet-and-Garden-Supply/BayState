"""
Legacy scraper code — retained for archival reference only.

These modules are not imported by the active enrichment pipeline (Phase 10).
See enrichment_models.py and the new enrichment extraction path.

What was moved here:
- 15 YAML scraper configs (configs/*.yaml)
- 24 Playwright action handlers (actions/handlers/*.py)
- Executor/workflow engine (executor/)
- YAML config parser (parser/)
- Legacy Pydantic models (result.py, assertions.py, scraper_config_schema.py)
- Anti-detection manager (core/anti_detection_manager.py)
- Legacy runtime and context modules (runtime.py, context.py, __main__.py)
"""
