# Research: Crawl4AI Capabilities for Repeated Brand/Domain Product Scraping

## Summary

Crawl4AI (v0.9.x) provides three major capabilities directly applicable to BayState's repeated brand/domain product scraping: (1) **managed browser profiles** via `BrowserProfiler` and `use_persistent_context` that persist cookies, local storage, and sessions across runs, enabling authenticated/repeatable crawling as specific identities; (2) **`JsonCssExtractionStrategy` with LLM-generated schemas** that can be generated once from a sample page and reused across unlimited pages with zero LLM cost; (3) **session management** via `session_id` that reuses a Playwright Page across multiple `arun()` calls for pagination and multi-page product flows. E-commerce image extraction is supported through lazy-load handling (`wait_for_images`, `scan_full_page`) and the hook system, but there is no built-in "gallery extraction" strategy — image URLs must be extracted via CSS selectors or LLM prompts within the existing extraction framework.

---

## Findings

### 1. BrowserProfiler & Managed Browser Profiles (Identity-Based Crawling)

**`BrowserProfiler` class** (in `crawl4ai/browser_profiler.py`) is the dedicated profile management system:

- **`create_profile(name)`** — Launches a visible (non-headless) browser. The human operator logs in, navigates, configures as needed, then presses `q` in the terminal. The resulting `--user-data-dir` contents are zipped and saved to `~/.crawl4ai/profiles/<name>`. Profiles store cookies, localStorage, session data, and any site-specific state.
- **`list_profiles()`** — Lists all saved profiles.
- **`delete_profile(name)`** — Removes a profile.
- **CLI shortcut**: `crwl profiles` opens an interactive TUI for list/create/delete/use operations.

**`BrowserConfig` parameters for profile usage:**

| Parameter | Type | Behavior |
|---|---|---|
| `use_persistent_context` | `bool` (default `False`) | Uses a persistent browser context, keeping cookies/sessions across runs. Implicitly sets `use_managed_browser=True`. |
| `user_data_dir` | `str or None` | Path to a Playwright user data directory for persistent profiles. Must be set for permanent sessions. |
| `use_managed_browser` | `bool` (default `False`) | Launches browser via CDP for advanced control. Auto-set based on `browser_mode`. |
| `browser_mode` | `str` (default `"dedicated"`) | `"dedicated"` = fresh instance per crawl; `"builtin"` = CDP background browser; `"custom"` = explicit CDP URL; `"docker"` = container. |

**Implications for BayState:** Profiles enable crawling as a "known" user with established sessions — critical for sites that require login, accept cookies only with consent, or serve different HTML to different user agents. A profile can be created once per brand/domain and reused across all scraping runs for that brand. Caveat: `use_persistent_context=True` implies `use_managed_browser=True`, which has different resource/speed characteristics than the default `"dedicated"` mode — testing is needed.

[Source: Identity Based Crawling](https://docs.crawl4ai.com/advanced/identity-based-crawling/)
[Source: Browser, Crawler & LLM Config](https://docs.crawl4ai.com/api/parameters/)
[Source: BrowserProfiler Source](https://github.com/unclecode/crawl4ai/blob/main/crawl4ai/browser_profiler.py)
[Source: CLI Docs](https://github.com/unclecode/crawl4ai/blob/v0.8.6/docs/codebase/cli.md)

### 2. CacheMode Semantics

The `CacheMode` enum provides five modes for controlling the local crawl cache:

| Mode | Behavior |
|---|---|
| `CacheMode.ENABLED` | Normal caching — reads cached result if available, writes to cache on fresh fetch. **Default.** |
| `CacheMode.DISABLED` | No caching at all — always fetches fresh. |
| `CacheMode.READ_ONLY` | Only reads from cache; never writes new results. Errors if no cache entry exists. |
| `CacheMode.WRITE_ONLY` | Fetches fresh and writes to cache, but never reads existing cache. |
| `CacheMode.BYPASS` | Skips reading cache for this crawl; may still write depending on internal logic. |

**Known bug (v0.7.4+):** When `cache_mode=ENABLED` and a cache entry exists, `AsyncWebCrawler.arun()` returns the cached `CrawlResult` early and **skips the extraction pipeline entirely** — `LLMExtractionStrategy` (and likely `JsonCssExtractionStrategy`) never runs. This is a critical issue for any design that caches raw HTML and expects re-extraction with different strategies. Workaround: use `CacheMode.DISABLED` or `BYPASS` when you need extraction to run, or implement your own cache-after-extraction flow.

[Source: arun() API](https://docs.crawl4ai.com/api/arun/)
[Source: Cache Modes (v0.8.x)](https://docs.crawl4ai.com/core/cache-modes/)
[Source: Bug Report #1455](https://github.com/unclecode/crawl4ai/issues/1455)

### 3. Session ID Lifecycle

`sessions_id` provides persistent Playwright page reuse across multiple `arun()` calls:

- **Creation:** Assign a `session_id` string in `CrawlerRunConfig`. The `BrowserManager` creates a new Playwright `Page` and stores it in `session_pool`.
- **Reuse:** Subsequent `arun()` calls with the same `session_id` retrieve the existing Page from the pool. Combined with `js_only=True`, this enables multi-page flows without full-page reloads (e.g., clicking "Next" via JS and re-extracting).
- **Lifecycle:** Sessions live until the `AsyncWebCrawler` async context manager exits, or until explicitly closed. They survive individual `arun()` calls but do **not** persist across different `AsyncWebCrawler` instantiations.
- **Multi-session:** Different `session_id` values can coexist for parallel handling of different page types.
- **Cleanup:** Sessions are tied to the `AsyncWebCrawler` instance lifetime.

**Typical pagination pattern:**
```python
for page in range(3):
    crawler_config = CrawlerRunConfig(
        session_id=session_id,
        extraction_strategy=strategy,
        js_code=js_next_page if page > 0 else None,
        js_only=page > 0,  # don't re-navigate, just execute JS
        cache_mode=CacheMode.BYPASS,
    )
    result = await crawler.arun(url, config=crawler_config)
```

**Implications for BayState:** Session IDs are essential for product list pagination, multi-step product detail navigation, and any flow requiring persistent in-page state across extractions. However, session-level state (cookies, local storage) does NOT survive beyond the `AsyncWebCrawler` lifecycle — for cross-run persistence, use `BrowserProfiler` profiles with `use_persistent_context` instead.

[Source: Session Management](https://docs.crawl4ai.com/advanced/session-management/)
[Source: DeepWiki Session Management](https://deepwiki.com/unclecode/crawl4ai/3.4-session-management)

### 4. JsonCssExtractionStrategy — Schema Generation & Reuse

**`JsonCssExtractionStrategy`** is the recommended approach for structured data extraction without LLM cost:

```python
schema = {
    "name": "Product List",
    "baseSelector": ".product-card",
    "fields": [
        {"name": "title", "selector": "h2.title", "type": "text"},
        {"name": "price", "selector": ".price", "type": "text"},
        {"name": "image", "selector": "img.product-image", "type": "attribute", "attribute": "src"},
        {"name": "link", "selector": "a", "type": "attribute", "attribute": "href"},
    ]
}
strategy = JsonCssExtractionStrategy(schema)
```

**Schema generation** is available as a **static method** that uses an LLM *once* to derive a schema from sample HTML:

```python
schema = JsonCssExtractionStrategy.generate_schema(
    html=sample_html,
    query="Extract product information including name, price, image, and link",
    llm_config=llm_config  # supports any LiteLLM provider
)
```

**Key properties:**
- Generated schema can be **validated** with `JsonCssExtractionStrategy.validate_schema(schema, html, schema_type="CSS")` which returns coverage stats and field-level details.
- After generation, **zero LLM calls** are needed for actual extraction — the CSS selectors do the work.
- Schema can be **cached by domain** and reused across all pages of the same brand:
  ```python
  schema = cache.get_schema(site)
  if not schema:
      schema = JsonCssExtractionStrategy.generate_schema(...)
      cache.set_schema(site, schema)
  ```
- **Nested fields** and **base element attributes** are supported for complex layouts.
- A `JsonXPathExtractionStrategy` variant exists for XPath-based extraction.

**Implications for BayState:** This is the highest-leverage feature for the product scraping use case. Flow: (1) crawl a single product listing page per brand → (2) use `generate_schema()` to create a CSS-based schema → (3) validate and cache the schema per brand → (4) use it for all subsequent product page extractions at zero LLM cost. This eliminates per-page LLM overhead while handling structural differences between brands.

[Source: LLM-Free Strategies](https://docs.crawl4ai.com/extraction/no-llm-strategies/)
[Source: Strategies API](https://docs.crawl4ai.com/api/strategies/)
[Source: Extraction Strategies Example](https://github.com/unclecode/crawl4ai/blob/main/docs/examples/extraction_strategies_examples.py)

### 5. Hooks System for Custom Extraction Logic

Crawl4AI provides a **hook pipeline** that fires at well-defined points during crawling:

| Hook | Fires | Use Case |
|---|---|---|
| `on_browser_created` | After browser instance created | Inject auth tokens, set up interception |
| `on_page_context_created` | After new context+page created | Add cookies, set up route interception |
| `before_goto` | Before navigation | Log URLs, modify request headers |
| `after_goto` | After navigation completes | Wait for dynamic content, check page state |
| `on_user_agent_updated` | When user agent changes | Rotate UA fingerprint |
| `on_execution_started` | When custom JS execution begins | Mark timing |
| `before_retrieve_html` | Before final HTML capture | Modify DOM, remove elements, add data attributes |

**Amazon product extraction example** demonstrates:
- Hook-based login flow (fill form, submit, wait for redirect)
- Search execution via JS injection
- Waiting for specific selectors before extraction
- Multiple hook chaining

**Implications for BayState:** Hooks are the mechanism for brand-specific login flows, cookie consent handling, search form submission, and DOM cleanup (e.g., removing ads/nav before extraction). Each brand's scraping config should define a hook chain that is executed during the crawl.

[Source: Hooks & Auth](https://docs.crawl4ai.com/advanced/hooks-auth/)
[Source: Amazon Hook Example](https://github.com/unclecode/crawl4ai/blob/main/docs/examples/amazon_product_extraction_using_hooks.py)

### 6. Image Extraction & E-Commerce Galleries

Crawl4AI has **no dedicated "gallery extraction" strategy** but provides several mechanisms:

**Lazy-load image handling:**
- `wait_for_images=True` (in `CrawlerRunConfig`) — waits for all images to finish loading before finalizing the page.
- `scan_full_page=True` with `scroll_delay` — forces the browser to scroll the entire page, triggering intersection-observer-based lazy loads.
- These are critical for e-commerce sites using lazy loading for product images.

**Image extraction within JsonCssExtractionStrategy:**
```python
{"name": "image", "selector": "img.product-image", "type": "attribute", "attribute": "src"}
```
- Multiple image fields can capture `src`, `data-src`, `srcset` for responsive images.
- The `type: "attribute"` field type extracts any HTML attribute.
- The built-in `Link & Media` docs cover `exclude_external_images`, `exclude_social_media_links` filters to clean up extracted media.

**`content_scraping_strategy.py` `process_image()` method:**
- Handles lazy-loaded images by checking `data-src` as fallback
- Validates image dimensions, alt text
- Can be customized via subclassing the content scraping strategy

**LLM-based image extraction:**
- LLM extraction strategies with Pydantic models can extract image URLs, alt text, and gallery metadata via natural language prompts
- The DEV.to e-commerce example uses `all_product_images: Optional[List[str]]` in its Pydantic model

**Media result structure:**
- `CrawlResult.media` contains extracted images with metadata
- `CrawlResult.media["images"]` is a dictionary keyed by URL with `alt`, `score`, `description`, `tags`

**Implications for BayState:** For product image extraction, the recommended approach is: (1) use `wait_for_images=True` + `scan_full_page` to force lazy-load triggers; (2) use `JsonCssExtractionStrategy` fields typed as `attribute` with `selector: "img[class*=product] img[class*=gallery]"` to capture `src`/`data-src`; (3) for complex galleries, use the `after_goto` hook to execute JS that expands gallery thumbnails before extraction; (4) LLM extraction is a fallback for sites where CSS selectors are unreliable.

[Source: Lazy Loading](https://docs.crawl4ai.com/advanced/lazy-loading/)
[Source: Link & Media](https://docs.crawl4ai.com/core/link-media/)
[Source: Content Scraping Strategy Source](https://github.com/unclecode/crawl4ai/blob/main/crawl4ai/content_scraping_strategy.py)
[Source: DEV.to E-Commerce Example](https://dev.to/asynchronope/building-an-async-e-commerce-web-scraper-with-pydantic-crawl4ai-gemini-4mnp)

---

## Sources

**Kept:**
- [Identity Based Crawling](https://docs.crawl4ai.com/advanced/identity-based-crawling/) — Primary documentation for profile creation/management
- [Browser, Crawler & LLM Config](https://docs.crawl4ai.com/api/parameters/) — Definitive parameter reference for `use_persistent_context`, `use_managed_browser`, `user_data_dir`
- [Session Management](https://docs.crawl4ai.com/advanced/session-management/) — Official docs on session lifecycle and pagination patterns
- [LLM-Free Strategies](https://docs.crawl4ai.com/extraction/no-llm-strategies/) — Primary docs for `JsonCssExtractionStrategy` and schema generation/reuse
- [Hooks & Auth](https://docs.crawl4ai.com/advanced/hooks-auth/) — Hook pipeline reference with brand-specific customization patterns
- [Lazy Loading](https://docs.crawl4ai.com/advanced/lazy-loading/) — Image lazy-load handling, directly relevant to e-commerce
- [Link & Media](https://docs.crawl4ai.com/core/link-media/) — Media filtering options for image extraction
- [Strategies API](https://docs.crawl4ai.com/api/strategies/) — Formal API reference for all extraction strategies
- [Bug #1455](https://github.com/unclecode/crawl4ai/issues/1455) — Documents cache-mode extraction pipeline bug, critical for design decisions
- [Amazon Hook Example](https://github.com/unclecode/crawl4ai/blob/main/docs/examples/amazon_product_extraction_using_hooks.py) — Concrete e-commerce hook usage pattern
- [BrowserProfiler Source](https://github.com/unclecode/crawl4ai/blob/main/crawl4ai/browser_profiler.py) — Source-level understanding of profile creation mechanics
- [Content Scraping Strategy Source](https://github.com/unclecode/crawl4ai/blob/main/crawl4ai/content_scraping_strategy.py) — Image processing internals

**Dropped:**
- DEV.to E-Commerce Example — Third-party blog; useful conceptually but not authoritative API reference
- fheinrich03/crawl4ai_example — Third-party example repo; useful for reference but not official
- DeepWiki session management — AI-generated documentation from source; less authoritative than official docs

---

## Gaps

1. **Cross-run profile persistence with use_persistent_context:** The docs say profiles survive across runs, but the exact mechanism (zip extraction vs. direct Playwright user_data_dir) and performance characteristics for repeated production use are not clearly benchmarked.
2. **Schema generation reliability across brand HTML variance:** No documented guidance on how `generate_schema()` handles structurally different pages from the same brand (e.g., category listing vs. product detail page). Schema validation coverage metrics help but aren't well-explained.
3. **Image gallery interactions:** No built-in support for clicking gallery thumbnails, lightbox navigation, or carousel extraction. This would require custom hooks/JS.
4. **Cache-bug impact on JsonCssExtractionStrategy:** The confirmed cache bug (#1455) only mentions `LLMExtractionStrategy`, but the early-return code path likely affects all strategies. Needs testing.
5. **Profile size/management at scale:** No guidance on profile storage size limits, cleanup policies, or concurrent access patterns for shared profile directories.

**Suggested next steps:**
- Prototype a single-brand scrape pipeline: create profile → generate schema → paginate with session_id → extract with JsonCssExtractionStrategy.
- Test cache-mode bug with JsonCssExtractionStrategy specifically.
- Profile performance benchmarks for `use_persistent_context` vs. `"dedicated"` mode.
- Evaluate whether schema generation with OpenAI vs. Ollama produces stable, reusable CSS selectors across brand site updates.

---

## Supervisor coordination

No design decisions needed at this stage. Research complete. Ready for the design discussion.

---

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Research brief covers all requested Crawl4AI capabilities: BrowserProfiler/managed profiles, CacheMode semantics, session_id lifecycle, JsonCssExtractionStrategy schema generation/reuse, hooks for image extraction, and e-commerce image best practices. No code edits were made — output is a research document only."
    }
  ],
  "changedFiles": [
    "/Users/nickborrello/Desktop/Projects/BayState/context/crawl4ai-profile-research.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "web_search with 5 queries covering all research angles",
      "result": "passed",
      "summary": "40 sources returned across BrowserProfiler, CacheMode, session management, JsonCssExtractionStrategy, hooks, and e-commerce image topics"
    },
    {
      "command": "fetch_content on 12 key documentation pages and source files",
      "result": "passed",
      "summary": "Fetched full content from official Crawl4AI docs, BrowserProfiler source, Amazon hook example, and API references"
    }
  ],
  "validationOutput": [
    "Research document written to /Users/nickborrello/Desktop/Projects/BayState/context/crawl4ai-profile-research.md (10.8KB, 120+ lines)"
  ],
  "residualRisks": [
    "CacheMode extraction pipeline bug (#1455) — confirmed for LLMExtractionStrategy, likely affects all strategies. Needs testing before relying on cache-for-speed design.",
    "Cross-run profile persistence mechanics not fully documented for production use at scale.",
    "No built-in gallery/carousel extraction — requires custom hook/JS implementation."
  ],
  "noStagedFiles": true,
  "diffSummary": "New research document only — no code changes, no existing file modifications",
  "reviewFindings": [
    "no blockers: research completed with 12 primary authoritative sources, 4 identified gaps, and concrete design implications documented"
  ],
  "manualNotes": "Key architectural recommendation: JsonCssExtractionStrategy with LLM-generated schemas per brand is the highest-leverage pattern — generate once, extract thousands of pages with zero LLM cost. Cache bug (#1455) must be tested before relying on Crawl4AI's built-in cache for JsonCssExtractionStrategy workflows."
}
```
