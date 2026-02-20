# Web Scraping Tools Comparison: AI Discovery Optimization

## Goal
Compare `crawl4ai` vs `Firecrawl` vs `browser-use` for fetching product pages and extracting 6 fields (Brand, Name, Price, Description, Images, Availability) using LLM extraction within a strict budget of <$0.10 per product.

## Summary of Tools

### 1. Crawl4AI
- **Type:** Open-source Python library.
- **Capabilities:** Fast, async web crawler optimized for LLMs. Converts web pages into clean Markdown or JSON. Supports executing JS, handling dynamic content (Playwright), proxy integration, chunking, and built-in LLM extraction strategies using LiteLLM (supports OpenAI, Anthropic, local models, etc.). Features "Adaptive Crawling" to stop when enough information is gathered.
- **Pricing:** Free to use (Apache 2.0 license). Costs are solely infrastructure (hosting) and the LLM API token costs used for extraction.
- **Architecture Fit:** Excellent fit for `BayStateScraper` (Python distributed engine). Runs locally or in a Docker container alongside existing Python code.

### 2. Firecrawl
- **Type:** Managed SaaS API.
- **Capabilities:** Takes a URL and returns clean markdown or structured data (JSON). Handles proxies, JS rendering, and anti-bot measures automatically. Supports LLM extraction. Extremely easy to integrate (single endpoint).
- **Pricing:** 
  - Free tier: 500 credits
  - Hobby: $16/mo (3,000 pages) -> ~$0.0053/page
  - Standard: $83/mo (100,000 pages) -> ~$0.00083/page
  - Note: Advanced features like "Search" or "Browser" operations cost multiple credits (e.g., Browser is 2 credits/minute). LLM extraction may incur additional costs or require you to pass the resulting Markdown to an LLM yourself.
- **Architecture Fit:** Good fit for delegating crawling infrastructure, but requires depending on an external API for core scraper engine functionality.

### 3. Browser-Use
- **Type:** Open-source Python library.
- **Capabilities:** Focuses on autonomous browser interaction. Agents navigate, click, fill forms, and interact with the web like a human. Slower and more resource-intensive as it simulates full browser usage step-by-step.
- **Pricing:** Open source (free), but uses significantly more LLM tokens than a pure crawler because the LLM acts as an agent deciding every step and action.
- **Architecture Fit:** Overkill for simple product page extraction. Best used for complex multi-step workflows (e.g., logging in, navigating complex UIs).

## Comparative Analysis for the Specific Use Case

**Use Case:** Fetching a product page and extracting 6 fields (Brand, Name, Price, Description, Images, Availability) using LLM extraction. Budget <$0.10 per product.

| Feature | Crawl4AI | Firecrawl | Browser-Use |
| :--- | :--- | :--- | :--- |
| **Speed** | Very Fast (Async, direct extraction) | Fast (API call) | Slow (Agentic step-by-step navigation) |
| **Cost** | Lowest (Infrastructure + LLM tokens) | Low-Medium (Subscription + usage) | Highest (High token usage per interaction) |
| **Complexity** | Medium (Requires managing infra/proxies if needed) | Low (Managed API) | High (Agent logic, potential instability) |
| **LLM Extraction** | Built-in strategies (Litellm support) | Built-in via API | Core mechanic (but overkill for this) |
| **Anti-Bot** | Configurable via Playwright/Proxies | Fully Managed | High (mimics human behavior) |

## Budget Evaluation (<$0.10 per product)

- **Browser-Use:** Likely to fail the budget constraint. Running an agent loop to load a page and extract data can easily consume thousands of tokens across multiple calls, especially with models like GPT-4o.
- **Firecrawl:** Easily fits the budget. Even on the Hobby plan ($16/3000 = ~$0.005 per page). If you do the LLM extraction yourself on their Markdown output, adding GPT-4o-mini token costs keeps it well under $0.01 per product.
- **Crawl4AI:** Easily fits the budget. Zero software cost. You pay for runner compute + LLM API costs. With `gpt-4o-mini` or similar efficient models, extraction costs fractions of a cent per product.

## Open Source Python Library vs. Paid API (Monorepo Architecture Context)

The `BayStateScraper` is a Python distributed engine using Docker and Playwright.

### Pros of Open Source Library (Crawl4AI)
- **Deep Integration:** Fits naturally into the existing `BayStateScraper` Playwright/Docker architecture.
- **No Vendor Lock-in:** Complete control over the crawling process, proxies, and data pipeline.
- **Cost Efficiency at Scale:** No monthly subscriptions or API markup. You only pay for raw compute and LLM tokens.
- **Customization:** Ability to use custom local LLMs or specific chunking strategies tailored to e-commerce products.

### Cons of Open Source Library (Crawl4AI)
- **Maintenance:** You must manage your own proxies, handle IP bans, and maintain the Docker infrastructure (which is already part of the `BayStateScraper` architecture, mitigating this con).
- **Anti-Bot Measures:** Handling advanced anti-bot protections requires manual configuration or integrating third-party proxy services like CapSolver.

### Pros of Paid API (Firecrawl)
- **Zero Infrastructure:** No need to manage Playwright, Chromium, or proxies.
- **Built-in Anti-Bot:** Automatically handles captchas and IP blocks.
- **Speed to Market:** Implementation is a single API call.

### Cons of Paid API (Firecrawl)
- **Less Control:** You rely on their parsing and markdown conversion logic.
- **Cost Scaling:** As volume grows, API costs increase predictably, which may become expensive at enterprise scale compared to raw infra costs.
- **Latency:** Extra network hop to the API service before processing.

## Conclusion & Recommendation

For the `BayStateScraper` Python distributed engine, **Crawl4AI** is the recommended choice.

1. **Why not Browser-Use?** It is an agentic automation tool, which is overkill and too expensive/slow for simple single-page data extraction.
2. **Why not Firecrawl?** While excellent, the monorepo already has a Python distributed engine using Docker and Playwright (`BayStateScraper`). Introducing a paid SaaS API duplicates capabilities you can host yourself and adds external dependency.
3. **Why Crawl4AI?** It is purpose-built for converting web pages to LLM-ready formats rapidly. It integrates perfectly into a Python/Playwright architecture, gives total control over costs (ensuring the <$0.10 target is easily met), and has built-in LLM extraction strategies. The architecture is already set up to be a stateless runner; adding Crawl4AI enhances it without changing the fundamental paradigm.


## 2026-02-20: Baseline accuracy profile (Task 4)
- Baseline v1 is strong on brand (100%) but weak on operational fields: price (10%), images (30%), availability (30%), description (60%), and name (70%).
- Main failure mode is silent partial extraction (records marked success with empty critical fields), not hard runtime failure.
- Retailer domains (Lowes/Home Depot) correlate with multi-field misses; source quality gating is required before extraction finalization.

## 2026-02-20: Prompt v2 design patterns (Task 5)
- Source ranking performs better when expressed as weighted rubric (domain tier + SKU/variant relevance + content quality signals) rather than pure relevance wording.
- Null-brand robustness requires explicit instruction to infer canonical brand from title/snippet/breadcrumb metadata.
- Extraction quality improves when checklist explicitly requires price/images/availability before considering output complete.
- Variant lock guidance must mention size/color/flavor/form terms to reduce near-match SKU errors.

## 2026-02-20: Prompt v2 measured outcomes (Task 8)
- Common-field deltas vs baseline: Brand 100%->100% (flat), Name 70%->70% (flat), Description 60%->100% (+40), Images 30%->40% (+10).
- Newly introduced field quality in v2: size_metrics performed strongly at 90% while categories were low at 10% under strict canonical set matching.
- Practical takeaway: v2 materially improves descriptive extraction quality and slightly improves images, but taxonomy canonicalization remains the primary blocker.
