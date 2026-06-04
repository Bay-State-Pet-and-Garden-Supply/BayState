# Crawl4AI Engine LLM Extraction Investigation

## Files Retrieved
1. `apps/scraper/src/crawl4ai_engine/engine.py` (all 558 lines) — Main engine
2. `apps/scraper/src/crawl4ai_engine/strategies/__init__.py` (50 lines) — Strategy chain builder
3. `apps/scraper/src/crawl4ai_engine/strategies/css_strategy.py` (implied via __init__)
4. `apps/scraper/src/crawl4ai_engine/strategies/xpath_strategy.py` (implied via __init__)
5. `apps/scraper/src/crawl4ai_engine/config.py` (60 lines) — YAML config loader
6. `apps/scraper/src/crawl4ai_engine/types.py` (100 lines) — Type definitions
7. `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` (>1800 lines) — **The actual LLM caller**

## Key Code

### Engine: `Crawl4AIEngine` (`engine.py`)
- Imports: `AsyncWebCrawler`, `BrowserConfig`, `CrawlerRunConfig`, `CacheMode`, but **NOT** `LLMExtractionStrategy`
- Constructor docstring explicitly says: *"AI/Agentic features are deprecated for static scrapers"*
- `crawl()` method signature: `async def crawl(self, url: str) -> dict[str, Any]` — **only takes a URL**, no extraction_strategy parameter
- The strategy IS passed through `CrawlerRunConfig.extraction_strategy` (line ~230), and IS forwarded to crawl4ai's `arun()`
- But **nothing sets it** — the strategy comes from `config.get("crawler", {}).get("extraction_strategy")` which is always `None`

### Strategy module (`strategies/__init__.py`)
- Exports `CSSExtractionStrategy` and `XPathExtractionStrategy`
- `build_fallback_chain()` explicitly says: *"AI/LLM strategies are deprecated for static scrapers and removed from the chain"*
- Returns only CSS + XPath strategies, never LLM

### The actual LLM extraction happens in `Crawl4AIExtractor` (`crawl4ai_extractor.py`)
This is NOT part of the `Crawl4AIEngine` — it's a higher-level wrapper in `scrapers/ai_search/`:
- Creates a `Crawl4AIEngine` for the first-pass crawl (HTML + JSON-LD + meta tags)
- **LLM extraction is a SECOND PASS** after the engine, fallback extractor, and completeness check:
  1. Crawl with `Crawl4AIEngine` → get HTML + markdown
  2. Extract JSON-LD from HTML
  3. Extract meta tags (og:, twitter:, product:) 
  4. If both fail → `FallbackExtractor` (HTTP GET + regex)
  5. **If fallback is incomplete** (missing description, size, or generic content) → `LLMExtractionStrategy` second pass
  6. `LLMExtractionStrategy` is called **asynchronously via `asyncio.to_thread()`**, not through the engine
  7. It reuses the **first crawl's markdown** (no second browser navigation)
  8. Extracts against `ProductData` JSON schema

### LLM extraction parameters (line ~1132-1148):
```python
LLMExtractionStrategy(
    llm_config=LLMConfig(
        provider=self._llm_runtime.crawl4ai_provider,
        api_token=self._llm_runtime.api_key,
        base_url=self._llm_runtime.base_url,
    ),
    schema=self._product_schema,
    extraction_type="schema",
    instruction=instruction,
    input_format="fit_markdown",
    chunk_token_threshold=12000,
    overlap_rate=0.15,
    extra_args={"max_tokens": 4000, "temperature": 0.01},
)
```

## Architecture

```
ProductPageExtractor
  └─ Crawl4AIExtractor.extract(url, upc, product_name, brand)
       │
       ├── [1] Crawl4AIEngine.crawl(url)       ← No LLM, markdown + HTML only
       │       └─ AsyncWebCrawler.arun(url, extraction_strategy=None)
       │
       ├── [2] JSON-LD extraction from HTML
       ├── [3] Meta tag extraction
       │
       ├── [4] FallbackExtractor.extract()      ← HTTP GET if engine failed
       │
       ├── [5] Completeness check
       │       if incomplete → LLMExtractionStrategy (asyncio.to_thread)
       │       reuse 1st crawl markdown
       │
       └── [6] Image enrichment → return result
```

## Start Here
Open `apps/scraper/scrapers/ai_search/crawl4ai_extractor.py` — it's the actual LLM extraction pipeline. The `Crawl4AIEngine` in `src/crawl4ai_engine/` is deliberately LLM-free.

## Key Findings

1. **Is LLMExtractionStrategy used in our engine?** NO. `Crawl4AIEngine.crawl()` never has an extraction_strategy set. The docstring says "AI/Agentic features are deprecated for static scrapers."

2. **What extraction strategies ARE we using?** CSS/XPath strategies exist in `strategies/` module but are **never called** by the engine. The engine is only used for raw HTML/markdown fetching. The actual product extraction is done by `Crawl4AIExtractor` which uses its own pipeline (JSON-LD → meta → fallback HTTP → LLM).

3. **Is there an LLM fallback path?** YES, but only deep in `Crawl4AIExtractor` as step 5 of 6. It only triggers when:
   - The product URL was fetched successfully (step 1)
   - JSON-LD extraction returned no data (step 2)
   - Meta tag extraction returned no data (step 3)
   - HTTP fallback extraction ran but returned incomplete results (step 4)
   - The completeness check found missing description, size metrics, or generic-only content
   
4. **Does the engine accept extraction_strategy?** The `CrawlerRunConfig` does, but `crawl()` has signature `async def crawl(self, url: str)` — only URL. The extraction_strategy must be set in the config dict at construction time. No caller uses this.

5. **Bottleneck**: The LLM extraction reuses the first crawl's markdown. If the first crawl failed (no markdown), the LLM has nothing to work with. This means LLM extraction quality depends entirely on Crawl4AI's markdown generation, which uses BM25 or Pruning content filters that may filter out the very content we need (specs tables, structured attributes).

6. **Opportunity**: The LLM extraction is only triggered by a heuristic completeness check (`_check_extraction_completeness`). If the check passes incorrectly (false positive), the LLM is skipped entirely. And the LLM runs on `fit_markdown` (filtered), not raw HTML — meaning filtered-out spec data is invisible to it.
