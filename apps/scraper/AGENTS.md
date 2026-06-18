# Scraper Agent Context (apps/scraper)

## Core Facts
- **Stack**: Python 3.10+, Playwright, crawl4ai v0.3.0+, Pydantic.
- **Role**: API-only runner. Authenticates via `X-API-Key: bsr_*`. No direct database access.
- **Entry Point**: `daemon.py` (persistent polling/realtime service).
- **Core Engine**: `src/crawl4ai_engine/` (async-only, high-performance extraction).
- **Current Status**: **Static YAML-based scraping is deactivated**. All work is now dispatched to the enrichment path (AI-only extraction via crawl4ai) or specialized Python adapters.

## Structure
- `runner/`: Polling and task dispatch logic. `__init__.py` is the dispatcher.
- `scrapers/`: Scraper domain logic.
  - `ai_search/`: AI-driven discovery and search providers (Serper).
  - `cohort/`: Cohort processing and batch search.
  - `approved_sources/`: Python-based adapters for trusted distributors.
  - `product_url_extraction/`: Extracting target URLs for products.
- `src/crawl4ai_engine/`: The v0.3.0 extraction engine. Handles rendering, LLM-free vs LLM modes, and failure classification.
- `core/`: Infrastructure (API client, events, retries, hmac).
- `api/`: Shared schemas and Pydantic models.

## Where to look
| Goal | Path | Context |
| :--- | :--- | :--- |
| **Fix Extraction Bug** | `src/crawl4ai_engine/` | Logic for content cleaning, LLM prompting, or rendering. |
| **Modify Job Dispatch** | `runner/__init__.py` | How jobs are claimed and sent to enrichment paths. |
| **Adjust Retry/API** | `core/` | Base client, event bus, and failure classification. |
| **Update Adapters** | `scrapers/approved_sources/` | Logic for specific trusted vendor scraping. |
| **Update Schemas** | `api/` | Pydantic models for jobs, results, and enrichment. |

## Execution Flow (Enrichment Path)
1. **Poll**: `daemon.py` calls `core/api_client.py` to claim a job.
2. **Dispatch**: `runner/__init__.py:run_job` identifies `ENRICHMENT` type.
3. **Execute**: Dispatches to `src/crawl4ai_engine/engine.py`.
   - Fetches URL using Playwright (via crawl4ai).
   - Extracts data using LLM-free (CSS/JSON) or LLM fallback.
4. **Report**: Results are posted back to coordinator via `core/api_client.py`.

## Critical Conventions
- **No `print()`**: Use `logger` with extra context.
- **Async First**: Most core logic is `async`.
- **Validation**: Every result must conform to the Pydantic models in `api/`.
- **Failure Classification**: Use `FailureClassifier` to distinguish between retryable (429, 503) and terminal (404, Auth) errors.

## Related AGENTS.md
- `runner/AGENTS.md`: Task polling and lifecycle.
- `core/AGENTS.md`: Infrastructure and API client.
- `src/crawl4ai_engine/AGENTS.md`: Extraction engine details.
- `scrapers/AGENTS.md`: Scraper domain logic and AI search.

## URL Extraction & Gold Benchmark
- **Legacy audit entries**: `benchmarks/url_extraction/dataset.json` contains legacy expected-shape benchmark cases.
- **Gold dataset**: `benchmarks/url_extraction/gold_dataset.json` contains only human-reviewed `verification_status: "gold"` rows with assertions.
- **Candidate dataset**: `benchmarks/url_extraction/gold_dataset.candidates.json` contains AI-drafted or ChatGPT-researched candidate rows awaiting review.
- **Validation & Gates**:
  - `benchmarks/url_extraction/gold_schema.py` defines the JSON structure validation.
  - `benchmarks/url_extraction/gold_gates.py` evaluates live extraction results against the assertions.
- **Commands**:
  - Run schema validation tests: `uv run pytest tests/unit/test_gold_dataset_schema.py tests/unit/test_gold_gates.py`
  - Run live benchmark extractor: `uv run python -m benchmarks.url_extraction.runner --dataset benchmarks/url_extraction/gold_dataset.candidates.json`

