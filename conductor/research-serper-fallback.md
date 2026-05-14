# Research: Static-First → SERPER Fallback Pipeline for Distributor Product Scraping

## Summary

Serper.dev provides a real-time Google Search API (1–2s typical latency, up to 300 qps on Ultimate tier) that can serve as an on-demand fallback when static distributor scrapers (Playwright/Crawl4AI with JSON-CSS extraction) miss a SKU. The reliable pattern is: use **Crawl4AI `JsonCssExtractionStrategy`** as the cheap deterministic path, and gate to **Serper Shopping/Web search → LLM extraction** only when products are not found or confidence is low. Crawl4AI's own documentation explicitly advises this exact tiered approach — JSON-CSS first (fast, repeatable, zero LLM cost), LLM extraction reserved for complex/unstructured pages with schema-guided chunking and token monitoring.

## Findings

1. **Serper API capabilities directly relevant to fallback product search** — Serper provides Shopping-specific search results (via `https://google.serper.dev/shopping`) plus general Web Search and a dedicated scrape endpoint (`https://scrape.serper.dev`). The Shopping endpoint returns structured product results (title, price, seller, link, rating) with up to 20 results per query, making it a natural first step when a static scraper misses a SKU. Country/language customization (`gl`, `hl` params) matters for regional distributor searches. [Source](https://serper.dev/)

2. **Serper pricing and rate limits are well-suited for fallback-only usage** — The free tier includes 2,500 queries; production pricing starts at roughly $0.30 per 1,000 queries at high volume. With a fallback-only design (hit only when static scrape fails), query volume should be a fraction of total SKU volume. The Ultimate tier supports 300 queries per second, essentially unbounded for sub-second fallback bursts. Credits are deducted only on successful responses, and typical response times are 1–2s (2–4s on retries). [Source](https://serper.dev/)

3. **Crawl4AI's own docs recommend the exact tiered approach (non-LLM first)** — The `JsonCssExtractionStrategy` and `JsonXPathExtractionStrategy` are explicitly recommended for "consistent, repetitive data structures" — precisely what distributor product pages are. Fast, cheap, deterministic, scalable. `LLMExtractionStrategy` is advised only for "complex or unstructured pages" where CSS selectors fail. The docs also provide chunking parameters (`chunk_token_threshold`, `overlap_rate`) and `show_usage()` for token monitoring when LLM extraction is needed. [Source](https://docs.crawl4ai.com/extraction/no-llm-strategies/), [Source](https://docs.crawl4ai.com/extraction/llm-strategies/)

4. **Confidence/scoring for fallback gating** — Crawl4AI's `CrawlResult` exposes `success` (boolean), `status_code` (int), and the extracted data itself. A practical confidence heuristic: (a) if `JsonCssExtractionStrategy` returns ≥1 product record with a valid SKU/UPC and price → **high confidence, publish**. (b) If zero results or missing required fields → **fallback to Serper search**. (c) After Serper returns results and LLM extraction completes, compare extracted fields against a schema (e.g., must have at minimum title + price + identifier) and assign a confidence score based on field completeness. Multiple runs that disagree (e.g., different prices) should flag for human review. [Source](https://docs.crawl4ai.com/core/simple-crawling/)

5. **Provenance tracking is straightforward with this architecture** — Each product record can carry a `source` field: `"distributor_static"`, `"serper_shopping"`, `"serper_web+llm"`. The `scrape.serper.dev` endpoint returns raw HTML that can be stored alongside extracted data. LLM extractions should log the model, prompt, token count, and chunking config used. This creates an audit trail without substantial overhead.

6. **Cost controls for the LLM extraction path** — Key levers: (a) Use a cheap/fast model (e.g., `gpt-4o-mini` or similar small model) for the extraction fallback, reserving large models for human review assistance. (b) Set `chunk_token_threshold` to limit context per chunk. (c) Cache Serper results per query (identical SKU search within a time window). (d) Add a cost-per-SKU budget: e.g., max 2 LLM extraction attempts per SKU before flagging for human review. (e) Monitor token usage via `show_usage()` and alert if aggregate exceeds threshold.

7. **Retry strategy for fallback** — Serper recommends exponential backoff (2–4s on retries). For the combined Serper→LLM path: (1) Retry Serper search up to 2 times with backoff if response is empty or errors. (2) On Serper success but LLM extraction failure, retry LLM extraction once with adjusted chunking. (3) After 2 total failures on the fallback path, mark SKU as "needs_review" rather than infinitely retrying. This avoids cost explosions from bad pages.

8. **Human review gating** — Products with low confidence scores, field incompleteness, mismatched prices between static and fallback results, or repeated fallback failures should be routed to a review queue. The existing BayState pipeline already has "Review/Publish" as a stage, so this is a natural extension of existing workflow.

## Decision Implications for Static-First/SERPER-Fallback Pipeline

- **Architecture is well-supported by existing tools**: Crawl4AI already handles the static path; Serper handles the search fallback; LLM extraction (via any provider) handles the unstructured → structured conversion. No new infrastructure required.
- **The fallback path should be clearly bounded**: Serper calls should be gated by a confidence threshold from the static path, not used preemptively. This keeps the fallback path as truly exceptional (<10–20% of SKUs in normal operation) rather than routine.
- **Shopping endpoint vs. Web+LLM**: Serper Shopping returns pre-structured product data (title, price, seller) — if this is sufficient, it may eliminate the LLM step entirely for many fallback cases. The Web+LLM path is only needed when Shopping results are inadequate.
- **Batch vs. on-demand fallback**: For bulk imports, run static scrapers for all SKUs first, batch the misses, then run Serper fallback in a single batch. This minimizes per-SKU latency and allows cost budgeting before execution.

## Cost/Reliability/Privacy/Compliance Considerations

| Dimension | Assessment |
|-----------|-----------|
| **Serper cost** | At fallback-only volumes (assume 10–20% of SKUs), cost is minimal. 50,000 SKUs/month → 5,000–10,000 fallback queries → ~$1.50–$3.00/month at $0.30/1k. Mostly irrelevant to budget. |
| **LLM extraction cost** | The dominant cost if used. At 5,000–10,000 fallback extractions/month, each using ~5K tokens → roughly $0.50–$2.00/month with gpt-4o-mini. Still small. Monitor with `show_usage()`. |
| **Reliability** | Serper has no SLA on free tier. For production, consider a paid plan or a secondary fallback (e.g., direct Bing API). Single SKU shouldn't block pipeline — use async/review queue. |
| **Rate limits** | Ultimate tier's 300 qps is comfortable for bursty fallback. But if a bulk import triggers fallback for thousands of SKUs simultaneously, throttle to ≤50 qps to avoid downstream blocking. |
| **Privacy** | Serper sends queries and receives Google search results. Do not send PII in search queries (SKU numbers are fine; customer data is not). Serper's privacy policy should be reviewed for data retention. |
| **Compliance/Attribution** | If product data is republished, verify Google's ToS for API-derived shopping data. Serper is a third-party reseller; Google's own APIs have more restrictive terms. If results include competitor pricing or MAP violations, ensure review before publishing. Distributor agreement terms may restrict automated data collection — static scrapers already present this risk; Serper fallback doesn't materially change it. |

## Gaps (What Could Not Be Verified / Remaining Clarification Questions)

1. **Serper Shopping result quality**: How often does Serper Shopping return actual distributor/wholesale results vs. consumer retail results? A manufacturer SKU search may surface Amazon/Walmart instead of the distributor's catalog. The `gl` (country) and `hl` (language) parameters help, but testing with actual distributor SKUs is essential.
2. **LLM extraction schema reliability**: Can a small/cheap LLM reliably extract structured product fields (price, availability, specs) from raw HTML of a distributor product page returned by `scrape.serper.dev`? Schema-guided extraction works well for uniform pages, but distributor page layouts vary significantly. Need to test with representative samples.
3. **Serper scrape.serper.dev vs. direct Crawl4AI fetch for fallback**: If a static scraper misses a SKU, the distributor page URL is likely known. Is Serper's scrape endpoint needed, or should the pipeline directly fetch the known URL with Crawl4AI + LLM extraction? The scrape endpoint may be redundant if the crawler can already reach the URL.
4. **Cost ceiling for worst-case scenario**: If static scrapers degrade or break (e.g., site redesign), 100% of SKUs could hit the fallback path. What's the acceptable cost ceiling, and at what point should the pipeline stop and alert rather than silently incurring costs?
5. **Human review queue sizing**: How many flagged SKUs per day can the team reasonably review? This determines the confidence threshold and when the pipeline should auto-publish vs. defer.
6. **Crawl4AI cache behavior**: Crawl4AI supports cache modes (`CrawlerRunConfig` with `cache_mode`). Can the fallback path share the same crawl cache to avoid re-fetching pages that the static path already crawled? This would save LLM token costs by reusing existing markdown/HTML.

## Sources

- **Kept: Serper.dev homepage** (https://serper.dev/) — Official API docs for pricing, capabilities, rate limits, and endpoint reference. Primary source.
- **Kept: Serper.dev playground JS asset** (https://serper.dev/_next/static/chunks/pages/playground-845a571149b2fbde.js) — Reveals endpoint base URLs, header requirements, and default parameter values as official asset evidence.
- **Kept: Crawl4AI No-LLM Extraction Strategies** (https://docs.crawl4ai.com/extraction/no-llm-strategies/) — Official docs recommending JsonCssExtractionStrategy/JsonXPathExtractionStrategy for consistent data; directly supports the tiered approach.
- **Kept: Crawl4AI LLM Extraction Strategies** (https://docs.crawl4ai.com/extraction/llm-strategies/) — Official docs for schema-guided chunking, token monitoring, and when to use LLM extraction.
- **Kept: Crawl4AI Simple Crawling** (https://docs.crawl4ai.com/core/simple-crawling/) — Official docs for `CrawlResult` fields (`success`, `status_code`), content filtering, and cache configuration.

## Supervisor coordination note

Research complete. All findings derived from the primary-source evidence provided by the supervisor. No web-search tools were available to this session; the supervisor supplied direct official-doc evidence which forms the basis of this brief. Key gaps requiring testing with real distributor SKUs are noted in the Gaps section.
