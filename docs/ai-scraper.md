# AI Scraper Documentation

This guide covers the implementation, configuration, and maintenance of AI-powered scrapers within the BayState network.

## Overview

AI Scrapers use Large Language Models (LLMs) and agentic browser control to extract product information without relying solely on fragile CSS selectors. They can navigate complex websites, solve minor interaction challenges, and identify official manufacturer sources automatically.

### Key Components

- **AIDiscoveryScraper**: A universal scraper that searches the web (via Brave Search) and identifies official product pages to extract data.
- **Agentic Workflows**: YAML-defined scrapers that use the `ai_extract`, `ai_search`, and `ai_validate` actions.
- **Cost Tracker**: Monitors token usage and enforces USD budgets per extraction.
- **Metrics & Alerts**: Tracks success rates and circuit breaker status for AI operations.

---

## Installation

The AI scraper features are built into the `BayStateScraper` runner but require additional environment variables for API access.

### 1. API Keys
Ensure the following keys are set in your runner's `.env` file:

```bash
# Required for agentic extraction and source identification
OPENAI_API_KEY=sk-...

# Required for AI Discovery search functionality
BRAVE_API_KEY=bs-...
```

### 2. Dependencies
AI features require the `browser-use` library and its dependencies (installed automatically via `get.sh` or `requirements.txt`).

```bash
pip install browser-use
playwright install chromium
```

---

## Configuration

AI scrapers are defined in YAML with the `scraper_type: "agentic"` attribute.

### Global AI Settings
Defined under the `ai_config` block:

| Option | Default | Description |
|--------|---------|-------------|
| `tool` | `browser-use` | The underlying agentic library. |
| `llm_model` | `gpt-4o-mini` | Model to use (`gpt-4o-mini`, `gpt-4o`, `gpt-4`). |
| `max_steps` | `10` | Maximum actions an agent can take per step. |
| `confidence_threshold` | `0.7` | Minimum score to accept extracted data (0.0 to 1.0). |
| `use_vision` | `true` | Enable GPT-4 Vision for analyzing complex UI elements. |

### AI Actions

#### `ai_search`
Searches for product pages using templates.
```yaml
- action: "ai_search"
  params:
    query: "{sku} {brand} product page"
    max_results: 5
```

#### `ai_extract`
The core extraction engine.
```yaml
- action: "ai_extract"
  params:
    task: "Extract price, name, and availability"
    schema:  # Optional custom schema
      price: str
      name: str
    visit_top_n: 1
```

#### `ai_validate`
Verifies extracted data against constraints.
```yaml
- action: "ai_validate"
  params:
    required_fields: ["name", "price"]
    sku_must_match: true
```

---

## Cost Tracking & Optimization

AI scraping is significantly more expensive than static scraping. The system includes protections to prevent runaway costs.

### Budget Limits
- **Hard Limit**: $0.15 per page extraction.
- **Warning Threshold**: $0.10 per page.
- **Circuit Breaker**: After 3 consecutive overruns, AI features are disabled for that scraper, triggering fallback to static methods.

### Best Practices for Cost Savings
1. **Use `gpt-4o-mini`**: It handles 90% of product pages at 1/50th the cost of GPT-4.
2. **Limit `max_steps`**: Set to 5-10 for simple extraction; only use 15+ for multi-step navigation.
3. **Minimize Vision usage**: Set `use_vision: false` for text-heavy sites.
4. **Cache Search Results**: The system automatically caches Brave search results to prevent duplicate API calls for the same query.

---

## Monitoring & Metrics

AI performance is monitored via the `AIMetricsCollector`.

- **Success Rate**: Monitored over a 1-hour sliding window.
- **Alerts**: Triggered for low success rates (<70%), high costs, or circuit breaker activation.
- **Prometheus**: Metrics are exported for visualization in the Admin Dashboard.

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| **Cost budget exceeded** | Complex page or high `max_steps`. | Switch to `gpt-4o-mini` or reduce `max_steps`. |
| **Low confidence results** | Ambiguous page or vague `task`. | Improve the natural language `task` description in YAML. |
| **Anti-bot blocks** | Site detected agentic patterns. | Enable `anti_detection` in YAML and use `user_agent_rotation`. |
| **Search returns 0 results** | Poor query template. | Update `ai_search` query to be more specific (e.g., add "official site"). |

### Circuit Breaker Reset
If a scraper's AI features are disabled by the circuit breaker, they can be manually reset via the Admin Portal or by restarting the runner process.

---

## Migration Guide: Static to AI

Converting a static scraper to an AI scraper is a three-step process:

1. **Change Scraper Type**: Set `scraper_type: "agentic"` in the YAML header.
2. **Add `ai_config`**: Define your preferred model and task.
3. **Replace Workflow**: Swap `navigate` and `extract` actions with `ai_extract`.

**Example Migration:**

*Before (Static):*
```yaml
workflows:
  - action: "navigate"
    params: { url: "https://site.com/p/{sku}" }
  - action: "extract"
    params: { fields: ["product_name", "price"] }
```

*After (AI):*
```yaml
workflows:
  - action: "ai_extract"
    params:
      task: "Go to site.com, find SKU {sku}, and extract details"
```

---

## Examples

### 1. Simple Product Page Extraction
Used when you already have the product URL.
```yaml
workflows:
  - action: "ai_extract"
    params:
      task: "Extract the current price and stock status from this page."
      confidence_threshold: 0.8
```

### 2. Universal Discovery (No URL)
Used for new products where the manufacturer site is unknown.
```yaml
workflows:
  - action: "ai_search"
    params:
      query: "{brand} {sku} official site"
  - action: "ai_extract"
    params:
      task: "Find the official product page and extract specs."
      visit_top_n: 1
```

### 3. Hybrid Workflow
Uses static navigation with AI extraction for robustness.
```yaml
workflows:
  - action: "navigate"
    params: { url: "https://retailer.com/search?q={sku}" }
  - action: "click"
    params: { selector: ".first-result" }
  - action: "ai_extract"
    params:
      task: "Extract the full product description and ingredients list."
```
