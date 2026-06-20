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

## Packaging Vision (OCR/VLM for product titles)

Optional: extract product packaging text to improve consolidation titles.

### Prerequisites (Mac)

Recommended — Qwen2.5-VL (single-pass, ~6GB, best quality):
```bash
brew install ollama
brew services start ollama
ollama pull qwen2.5vl
```

Fallback — Two-stage for low memory (GLM-OCR + llama3.2, ~2GB):
```bash
ollama pull glm-ocr && ollama pull llama3.2:3b
```

### Prerequisites (Linux/Docker)

Option A — Host Ollama:
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull glm-ocr llama3.2:3b
```

Option B — Docker Compose sidecar:
```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d
```

### Enable in .env

Recommended (Qwen2.5-VL single-pass):
```env
PACKAGING_VISION_ENABLED=true
PACKAGING_VISION_BASE_URL=http://127.0.0.1:11434/v1
PACKAGING_VISION_MODEL=qwen2.5vl
PACKAGING_VISION_API_KEY=ollama
PACKAGING_VISION_PIPELINE=structured_vlm
PACKAGING_VISION_TIMEOUT_SECONDS=180
PACKAGING_VISION_MAX_IMAGES=1
PACKAGING_VISION_MAX_CONCURRENCY=1
```

Fallback (two-stage, ~2GB total for low-memory Macs):
```env
PACKAGING_VISION_PIPELINE=ocr_then_parse
PACKAGING_VISION_MODEL=glm-ocr
PACKAGING_TEXT_MODEL=llama3.2:3b
PACKAGING_TEXT_API_KEY=ollama
```

Docker: use `http://host.docker.internal:11434/v1` (Mac) or `http://ollama:11434/v1` (sidecar).

The daemon runs a preflight check on startup. If Ollama is unreachable or models are missing, it logs a warning and skips packaging jobs.

### Verify readiness

```bash
# Check Ollama is running and models are available
curl -s http://127.0.0.1:11434/v1/models | python3 -c "import sys,json; [print(m['id']) for m in json.load(sys.stdin).get('data',[])]"

# Start daemon and check log for preflight
python daemon.py --env dev 2>&1 | grep -i packaging
```

## Scrape-Time OCR (raw packaging text during enrichment)

Extracts raw text from product images **during enrichment** (at scrape time),
before consolidation ever runs. This is separate from the
`PACKAGING_VISION_*` pipeline, which is a later high-quality structured extraction step.

| Pipeline | When | What |
|----------|------|------|
| **Scrape-time OCR** | During enrichment | Raw text → `sources[].image_text` |
| **Packaging vision** | During consolidation | Structured JSON → title suggestions |

### Enable

Requires a vision-capable OpenAI-compatible API key (not DeepSeek text-only).
```env
IMAGE_OCR_ENABLED=true
IMAGE_OCR_MODEL=gpt-4o-mini
IMAGE_OCR_API_KEY=sk-...
IMAGE_OCR_BASE_URL=https://api.openai.com/v1
IMAGE_OCR_MAX_IMAGES=1
```

If `IMAGE_OCR_API_KEY` is unset, falls back to `LLM_API_KEY`. If
`IMAGE_OCR_BASE_URL` is unset, falls back to `LLM_BASE_URL`.

### Behavior

- Runs only on successful/partial enrichment results
- Runs on images captured by the approved-source executor
- Non-blocking: OCR failure never fails the enrichment job
- Selects best image(s) per source, filters out logos/icons/thumbnails
- Writes `image_text` into per-source evidence, which flows into
  `products_ingestion.sources[*].image_text` and becomes prompt-visible
  in consolidation

## Local Testing

Test AI extraction (Enrichment) directly using `runner.py`:
```bash
python runner.py --sku "TEST-UPC" --url "https://example.com" --debug
```

## Related Documentation
- [AGENTS.md](AGENTS.md) - Project architecture and conventions
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Deep dive into system design
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md) - API contract details
