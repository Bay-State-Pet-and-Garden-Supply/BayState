# BayStateScraper Development Setup

## Overview
BayStateScraper is a distributed Python scraping engine using crawl4ai v0.3.0. It executes AI-driven extraction workflows and communicates with the BayStateApp coordinator via API.

## Prerequisites
- **Python**: 3.10 or higher
- **Playwright**: For browser automation
- **Bun**: (Optional) For running monorepo root commands

## Quick Start

### 1. Create Virtual Environment
```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
playwright install chromium
```

### 3. Configure Environment
Copy `.env.example` to `.env` and configure `SCRAPER_API_URL` and `SCRAPER_API_KEY`.

## Project Structure
- `daemon.py`: Main polling entry point.
- `runner/__init__.py`: Job dispatcher.
- `src/crawl4ai_engine/`: Extraction engine logic.
- `scrapers/`: Domain logic (ai_search, cohort, URL extraction).
- `core/`: API client, events, and retry logic.
- `api/`: Shared Pydantic models.
- `cli/`: Local testing CLI (`bsr`).

## Local Testing
Use the `bsr` CLI for local testing:
```bash
# See all commands
python cli/main.py --help

# Test a cohort locally
python cli/main.py cohort test <cohort_id>
```

Or use the legacy `runner.py` for direct config testing:
```bash
python runner.py --local --config scrapers/config/sample_config.yaml --sku 12345
```

## Related Documentation
- [AGENTS.md](AGENTS.md) - Project architecture and conventions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Deep dive into system design
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) - API contract details
