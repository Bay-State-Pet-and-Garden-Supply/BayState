# Scraper Agent Context (apps/scraper)

## Core Facts
- **Stack**: Python 3.10+, Playwright, YAML DSL, Docker, crawl4ai v0.3.0.
- **Role**: API-only runner. Authenticates via `X-API-Key: bsr_*`. No direct database access.
- **Entry Point**: `daemon.py` (persistent polling/realtime service).
- **Core Engine**: `src/crawl4ai_engine/` (async-only, high-performance extraction).
- **Phase 10 Status**: **Static scraping is deactivated** in `runner/__init__.py`. All work is now dispatched to the enrichment path (AI-only extraction via crawl4ai).

## Structure
- `runner/`: Polling and task dispatch logic. `__init__.py` is the dispatcher.
- `scrapers/`: Scraper domain logic.
  - `ai_search/`: AI-driven discovery and search providers (Serper).
  - `cohort/`: Cohort processing and batch search.
  - `product_url_extraction/`: Extracting target URLs for products.
  - `config/`: Scraper YAML templates (mostly for local reference/testing).
- `src/crawl4ai_engine/`: The v0.3.0 extraction engine. Handles rendering, LLM-free vs LLM modes, and failure classification.
- `core/`: Infrastructure (API client, events, retries, hmac).
- `api/`: Shared schemas and Pydantic models.
- `cli/`: Local testing tools (`bsr` command).

## Where to look
| Goal | Path | Context |
| :--- | :--- | :--- |
| **Fix Extraction Bug** | `src/crawl4ai_engine/` | Logic for content cleaning, LLM prompting, or rendering. |
| **Modify Job Dispatch** | `runner/__init__.py` | How jobs are claimed and sent to enrichment paths. |
| **Adjust Retry/API** | `core/` | Base client, event bus, and failure classification. |
| **Test Locally** | `cli/` | Local cohort/batch testing commands. |
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
