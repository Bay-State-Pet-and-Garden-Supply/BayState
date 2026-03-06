# AI Scraper Documentation

This guide covers the implementation, configuration, and maintenance of AI-powered scrapers within the BayState network, specifically focusing on the **Crawl4AI** engine.

## Overview

AI Scrapers use Large Language Models (LLMs) and the high-performance **Crawl4AI** library to extract product information. Unlike legacy methods, they leverage "agentic" browser control and structured AI extraction to handle complex sites and bypass bot detection.

### Key Components

- **Crawl4AIEngine**: The centralized core that manages browser sessions, anti-bot "Magic Mode," and concurrent crawling.
- **AIDiscoveryScraper**: A universal scraper that searches the web (via Brave Search) and uses parallel crawling to identify official sources.
- **Extraction Strategies**: Supports a fallback chain (CSS -> XPath -> LLM) to balance speed and data quality.
- **Cost Tracker**: Monitors OpenAI token usage and enforces USD budgets per extraction.

---

## Installation

The AI scraper features are built into the `BayStateScraper` runner.

### 1. API Keys
Ensure the following keys are set in your runner's `.env` file:

```bash
# Required for AI extraction
OPENAI_API_KEY=sk-...

# Required for AI Discovery search functionality
BRAVE_API_KEY=bs-...
```

### 2. Dependencies
Ensure `crawl4ai` is installed and the Playwright browsers are initialized:

```bash
pip install crawl4ai
python -m playwright install chromium
```

---

## Core Engine Features (v0.4+)

Our implementation leverages advanced **Crawl4AI** tools to ensure the best quality data:

### Advanced Anti-Bot ("Magic Mode")
The engine defaults to `magic=True`, which automatically handles:
- **User Simulation**: Mimics human mouse movements and scroll patterns.
- **Fingerprint Masking**: Bypasses browser detection walls (Cloudflare, etc.).
- **Overlay Removal**: Automatically strips newsletter popups and cookie banners.

### Content Filtering & Cost Optimization
To reduce LLM token costs by up to 40%, the engine prunes the HTML before processing:
- **CSS Selectors**: Focuses extraction on the product container (e.g., `#main`).
- **Excluded Tags**: Strips noise like `nav`, `footer`, `aside`, and `header`.
- **Markdown Output**: Converts pages to clean Markdown for faster AI analysis.

### Domain-Persistent Sessions
The engine manages `session_id` dynamically based on the target domain. This allows for session reuse across multiple product pages from the same supplier, improving speed and avoiding detection.

---

## AI Discovery (Brand-Less Scraping)

When a brand is unknown at the start, the **AIDiscoveryScraper** performs **Parallel Candidate Discovery**:
1. **Search**: Queries Brave Search for the SKU and Product Name.
2. **Parallel Crawl**: Uses `arun_many` to crawl the top 3-5 candidates simultaneously.
3. **AI Inference**: The LLM analyzes all candidates at once to identify the correct manufacturer and extract the official brand.

---

## Configuration

AI features are configured via the `crawler` block in YAML or Python configs.

| Option | Default | Description |
|--------|---------|-------------|
| `magic` | `true` | Enable advanced stealth and user simulation. |
| `simulate_user` | `true` | Mimics human browser interactions. |
| `cache_mode` | `ENABLED` | Caches raw HTML and LLM extractions. |
| `concurrency_limit` | `3` | Maximum parallel tabs for bulk crawling. |
| `css_selector` | `null` | Target specific HTML elements for extraction. |

---

## Best Practices for Cost Savings

1. **Use `gpt-4o-mini`**: Default model for structured extraction; highly cost-effective.
2. **Target Content**: Always provide a `css_selector` for known sites to minimize LLM input.
3. **Enable Caching**: Ensure `cache_mode: ENABLED` is used during testing to avoid redundant AI costs.
4. **Prune HTML**: Use `excluded_tags` to remove non-product content.

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **403 Forbidden** | Anti-bot detection. | Ensure `magic: true` is enabled in configuration. |
| **Token limit reached** | Page too large for LLM. | Use `css_selector` to narrow the scope or `excluded_tags` to prune noise. |
| **Missing Brand** | Discovery failed to infer. | Update search query template or use parallel discovery mode. |
| **SSL Errors** | Certificate validation. | Set `ignore_https_errors: true` in `browser_config`. |
