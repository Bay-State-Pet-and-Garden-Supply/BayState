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
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Configure your API keys in `.env`:
   - `LLM_API_KEY`: For AI extraction (OpenAI, DeepSeek, etc.)
   - `LLM_MODEL`: The model to use (default: `gpt-4o-mini`)
   - `LLM_BASE_URL`: (Optional) Custom API endpoint
   - `SERPER_API_KEY`: For the Official Brand Scraper fallback
   - `SCRAPER_API_URL`: URL of your BayStateApp instance (e.g., `http://localhost:3000`)
   - `SCRAPER_API_KEY`: Your runner API key (from Admin UI)

## Project Structure
- `daemon.py`: Main polling entry point.
- `runner/__init__.py`: Job dispatcher.
- `src/crawl4ai_engine/`: Extraction engine logic.
- `scrapers/`: Domain logic (ai_search, cohort, URL extraction, approved sources).
- `core/`: API client, events, and retry logic.
- `api/`: Shared Pydantic models.

## Local Testing

Test AI extraction (Enrichment) directly using `runner.py`:
```bash
python runner.py --sku "TEST-SKU" --url "https://example.com" --debug
```

## Related Documentation
- [AGENTS.md](AGENTS.md) - Project architecture and conventions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Deep dive into system design
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) - API contract details
