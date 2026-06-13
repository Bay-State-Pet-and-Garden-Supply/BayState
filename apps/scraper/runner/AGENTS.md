# RUNNER MODULE

**Scope:** Job dispatch — `run_job()` entry point for scraper execution.

## STRUCTURE
```
runner/
├── __init__.py          # Job dispatch (run_job entry point)
├── __main__.py          # CLI entry point
└── cli.py               # Argument parsing
```

## EXECUTION
Runner dispatch logic lives in `runner/__init__.py`. `daemon.py` imports from `core.api_client` and `core.realtime_manager` for the main event loop; runner-specific dispatch is invoked via `run_job()`.

## USAGE

```python
# Import and run
from runner import run_job

# CLI usage
python runner.py --mode <mode> --job-id <uuid>
```

## ENTRY POINTS
- `daemon.py` is the main entry point; it imports directly from `core.api_client` and `core.realtime_manager`
- `runner.py` is a thin CLI wrapper
- Docker ENTRYPOINT: `python daemon.py`

## RELATED
- Parent: `../AGENTS.md` (root scraper overview)
- Core: `../core/AGENTS.md` (infrastructure services)
- Scrapers: `../scrapers/AGENTS.md` (scraping domain)
- crawl4ai: `../src/crawl4ai_engine/AGENTS.md` (extraction engine)

## ANTI-PATTERNS
- **NO** mode-specific logic outside this package.
- **NO** static scraping logic (deactivated in Phase 10).
- **NO** direct browser manipulation (delegate to crawl4ai engine).
