# Crawl4AI Configuration Guide

Complete guide for configuring AI-powered scrapers using Crawl4AI in BayStateScraper v0.3.0+.

## Overview

Crawl4AI is the AI extraction engine for BayStateScraper, replacing the previous browser-use implementation. It provides fast, reliable content extraction with clean markdown output that's optimized for LLM processing.

## Quick Start

### 1. Environment Setup

Add to your `.env` file:

```bash
# Required for AI extraction
OPENAI_API_KEY=sk-your-key-here

# Optional: Crawl4AI cloud features
CRAWL4AI_API_KEY=your_crawl4ai_key_here
```

Get your OpenAI API key from: https://platform.openai.com/api-keys

### 2. Minimal Configuration

Create a new scraper config:

```yaml
name: "my-crawl4ai-scraper"
display_name: "My Crawl4AI Scraper"
base_url: "https://example.com"
scraper_type: "agentic"

ai_config:
  provider: "crawl4ai"
  task: "Extract product information"
  llm_model: "gpt-4o-mini"
  confidence_threshold: 0.7
  extraction_type: "markdown"

workflows:
  - action: "ai_extract"
    params:
      task: "Extract product name, price, and description"

test_skus:
  - "12345"
  - "ABC-67890"
```

## YAML Schema Reference

### Root Configuration

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Unique identifier for this scraper |
| `display_name` | string | No | `name` | Human-readable name shown in UI |
| `base_url` | string | Yes | - | Base URL for relative link resolution |
| `scraper_type` | string | Yes | - | Must be `"agentic"` for AI scrapers |
| `ai_config` | object | Yes | - | Crawl4AI-specific configuration |
| `workflows` | array | Yes | - | List of action steps |
| `timeout` | number | No | 60 | Seconds per step timeout |
| `retries` | number | No | 0 | Number of retry attempts |
| `test_skus` | array | No | [] | SKUs for testing |
| `fake_skus` | array | No | [] | SKUs that should return no results |
| `edge_case_skus` | array | No | [] | Boundary test cases |

### ai_config Section

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `provider` | string | Yes | - | Must be `"crawl4ai"` |
| `task` | string | Yes | - | Natural language description of extraction goal |
| `llm_model` | string | No | `"gpt-4o-mini"` | OpenAI model to use |
| `confidence_threshold` | number | No | 0.7 | Minimum confidence (0.0-1.0) |
| `extraction_type` | string | No | `"markdown"` | Output format: `"markdown"` or `"html"` |
| `max_steps` | number | No | 10 | Maximum extraction attempts per page |
| `use_vision` | boolean | No | true | Enable GPT-4 Vision for complex pages |
| `headless` | boolean | No | true | Run browser in headless mode |

### LLM Model Options

| Model | Cost | Speed | Best For |
|-------|------|-------|----------|
| `gpt-4o-mini` | $0.0006/1K tokens | Fast | Simple extractions, high volume |
| `gpt-4o` | $0.005/1K tokens | Medium | Complex pages, better accuracy |
| `gpt-4` | $0.03/1K tokens | Slow | Most complex pages |

Recommendation: Start with `gpt-4o-mini` and upgrade if extraction quality is insufficient.

### Workflows

Workflows define the sequence of actions to execute:

```yaml
workflows:
  - action: "ai_search"      # Optional: Find product pages
    name: "find_product"
    params:
      query: "{sku} {brand} product"
      max_results: 5

  - action: "ai_extract"     # Extract data from page(s)
    name: "extract_details"
    params:
      task: "Extract product information"
      schema:
        name: str
        price: str
        brand: str
      visit_top_n: 1
      confidence_threshold: 0.75

  - action: "ai_validate"    # Validate extraction results
    name: "validate"
    params:
      required_fields:
        - name
        - price
      min_confidence: 0.7
```

## Actions

### ai_extract

Primary action for AI-powered data extraction.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task` | string | Yes | - | Natural language extraction instruction |
| `schema` | object | No | Auto-detected | Expected output fields |
| `visit_top_n` | number | No | 1 | Number of search results to visit |
| `max_steps` | number | No | 10 | Maximum extraction attempts |
| `confidence_threshold` | number | No | 0.7 | Minimum confidence score |
| `extraction_type` | string | No | `"markdown"` | Format: `"markdown"` or `"html"` |

**Example:**

```yaml
- action: "ai_extract"
  name: "extract_product"
  params:
    task: "Extract product name, brand, price, description, and images"
    schema:
      name: str
      brand: str
      price: str
      description: str
      images: list
    visit_top_n: 2
    confidence_threshold: 0.8
```

**Result Storage:**

- `ctx.results["ai_extract_results"]` - Array of successful extractions
- `ctx.results["ai_extract_failures"]` - Array of failed URLs with errors
- `ctx.results["ai_extract_cost"]` - Cost summary object

### ai_search

Searches for product pages using Brave Search API.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Search query (supports template variables) |
| `max_results` | number | No | 5 | Maximum results to return |

**Template Variables:**

- `{sku}` - Replaced with current SKU
- `{placeholder_name}` - Replaced with product name placeholder

**Example:**

```yaml
- action: "ai_search"
  name: "find_product_pages"
  params:
    query: "{sku} {placeholder_name} official site"
    max_results: 5
```

**Result Storage:**

- `ctx.results["ai_search_results"]` - Array of search results with url, title, description

### ai_validate

Validates AI-extracted data against requirements.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `required_fields` | array | No | [] | Fields that must be present |
| `sku_must_match` | boolean | No | false | Validate SKU matches query |
| `min_confidence` | number | No | 0.7 | Minimum confidence threshold |

**Example:**

```yaml
- action: "ai_validate"
  name: "validate_extraction"
  params:
    required_fields:
      - name
      - price
      - brand
    sku_must_match: true
    min_confidence: 0.7
```

**Result Storage:**

- `ctx.results["validation_passed"]` - Boolean pass/fail
- `ctx.results["validation_errors"]` - Array of error messages
- `ctx.results["validation_report"]` - Full validation report

## Complete Examples

### Simple Single-Page Extractor

```yaml
name: "simple-product-extractor"
display_name: "Simple Product Extractor"
base_url: "https://example.com"
scraper_type: "agentic"

ai_config:
  provider: "crawl4ai"
  task: "Extract basic product information"
  llm_model: "gpt-4o-mini"
  confidence_threshold: 0.7

workflows:
  - action: "ai_extract"
    params:
      task: "Extract product name, price, and description from this page"
      schema:
        name: str
        price: str
        description: str

test_skus:
  - "12345"
  - "67890"

timeout: 30
retries: 1
```

### Multi-Step Search and Extract

```yaml
name: "search-then-extract"
display_name: "Search Then Extract"
base_url: "https://example.com"
scraper_type: "agentic"

ai_config:
  provider: "crawl4ai"
  task: "Find and extract product information"
  llm_model: "gpt-4o-mini"
  confidence_threshold: 0.75

workflows:
  - action: "ai_search"
    name: "find_product"
    params:
      query: "{sku} {placeholder_name} buy"
      max_results: 3

  - action: "ai_extract"
    name: "extract_details"
    params:
      task: "Extract complete product information from the best matching page"
      schema:
        name: str
        brand: str
        price: str
        description: str
        images: list
        specifications: str
      visit_top_n: 2
      confidence_threshold: 0.8

  - action: "ai_validate"
    name: "check_quality"
    params:
      required_fields:
        - name
        - price
      min_confidence: 0.75

test_skus:
  - "PROD-001"
  - "PROD-002"
  - "PROD-003"

fake_skus:
  - "FAKE123"
  - "NOTREAL"

timeout: 60
retries: 2
```

### E-Commerce Site with Anti-Detection

```yaml
name: "ecommerce-extractor"
display_name: "E-Commerce Product Extractor"
base_url: "https://shop-example.com"
scraper_type: "agentic"

ai_config:
  provider: "crawl4ai"
  task: "Extract product data from e-commerce site"
  llm_model: "gpt-4o"
  confidence_threshold: 0.8
  use_vision: true

workflows:
  - action: "ai_search"
    name: "find_product"
    params:
      query: "site:shop-example.com {sku}"
      max_results: 5

  - action: "ai_extract"
    name: "extract_product"
    params:
      task: "Extract product name, price, availability, images, and specifications"
      schema:
        name: str
        price: str
        availability: str
        images: list
        specifications: dict
      visit_top_n: 1
      confidence_threshold: 0.8

anti_detection:
  enabled: true
  user_agent_rotation: true
  request_delay: 2.0

validation:
  no_results_selectors:
    - ".no-results"
    - ".out-of-stock-message"
  no_results_text_patterns:
    - "no products found"
    - "out of stock"

test_skus:
  - "SKU123"
  - "SKU456"

timeout: 90
retries: 2
```

## Best Practices

### 1. Start Simple

Begin with a basic configuration and add complexity only when needed:

```yaml
# Start with this
ai_config:
  provider: "crawl4ai"
  task: "Extract product information"
  llm_model: "gpt-4o-mini"

# Add these only if needed
  confidence_threshold: 0.7
  extraction_type: "markdown"
  use_vision: true
```

### 2. Use Schema Hints

Even with AI extraction, providing a schema improves accuracy:

```yaml
schema:
  name: str          # Product name
  brand: str         # Brand/manufacturer
  price: str         # Price with currency
  description: str   # Full product description
  images: list       # List of image URLs
  weight: str        # Weight/dimensions
```

### 3. Set Appropriate Confidence Thresholds

- **0.8+**: Strict validation, use for critical data
- **0.6-0.7**: Balanced (recommended starting point)
- **0.4-0.5**: Lenient, accepts partial data

### 4. Test with Diverse SKUs

```yaml
test_skus:
  - "NORMAL-SKU-123"     # Standard product
  - "SKU-WITH-DASHES"    # Special characters
  - "123456789"          # Numeric only

fake_skus:
  - "THIS-IS-FAKE"       # Should return no results
  - "XYZ-NOT-REAL"

edge_case_skus:
  - ""                   # Empty string
  - "A"                  # Single character
  - "special!@#chars"    # Special characters
```

### 5. Cost Optimization

**Use gpt-4o-mini for most cases:**

```yaml
ai_config:
  llm_model: "gpt-4o-mini"  # 10x cheaper than gpt-4o
```

**Limit search results:**

```yaml
- action: "ai_search"
  params:
    max_results: 3  # Instead of 10
```

**Set appropriate timeouts:**

```yaml
timeout: 45  # Don't wait too long for slow pages
```

## Troubleshooting

### "Low confidence" warnings

**Solutions:**
- Lower `confidence_threshold` (try 0.6)
- Improve task description with more specifics
- Enable `use_vision: true` for image-heavy sites
- Add schema hints for expected fields

### "Cost exceeded budget" errors

**Solutions:**
- Use `gpt-4o-mini` instead of `gpt-4o`
- Reduce `max_steps` (try 5-8 instead of 10)
- Lower `visit_top_n` (process fewer pages)
- Set `extraction_type: "markdown"` (faster than HTML)

### Anti-bot blocks (CAPTCHA)

**Solutions:**

```yaml
anti_detection:
  enabled: true
  user_agent_rotation: true
  request_delay: 3.0  # Increase delay
```

- Enable anti_detection settings
- Add delays between requests
- Consider using residential proxies
- Set `headless: false` temporarily for debugging

### Missing fields in extraction

**Solutions:**
- Add more specific task description
- Provide explicit schema with all expected fields
- Increase `max_steps` for complex pages
- Use `use_vision: true` for better context

### Empty or garbled results

**Solutions:**
- Check if site requires JavaScript (Crawl4AI handles this)
- Verify `base_url` is correct
- Try `extraction_type: "html"` for raw HTML
- Check site accessibility with browser

## Migration from browser-use

If you have existing browser-use configurations:

### Old (browser-use):

```yaml
scraper_type: "agentic"
ai_config:
  tool: "browser-use"
  task: "Extract products"
  max_steps: 10
```

### New (Crawl4AI):

```yaml
scraper_type: "agentic"
ai_config:
  provider: "crawl4ai"
  task: "Extract products"
  max_steps: 10
  extraction_type: "markdown"
```

**Key changes:**
- `tool: "browser-use"` → `provider: "crawl4ai"`
- `extraction_type` is now available (defaults to "markdown")
- Same actions (`ai_extract`, `ai_search`, `ai_validate`) work the same way
- Better performance and reliability

## Cost Tracking

Each extraction is tracked automatically:

```python
# Access cost data after extraction
cost_summary = ctx.results["ai_extract_cost"]
print(f"Total cost: ${cost_summary['total_cost_usd']}")
print(f"Average per page: ${cost_summary['average_cost_usd']}")
```

**Typical costs:**

| Scenario | Model | Estimated Cost |
|----------|-------|----------------|
| Simple product page | gpt-4o-mini | $0.005-0.02 |
| Complex page | gpt-4o-mini | $0.02-0.05 |
| Complex page | gpt-4o | $0.05-0.15 |
| Multi-page search+extract | gpt-4o-mini | $0.05-0.10 |

## API Reference

For programmatic access to Crawl4AI scrapers:

```python
from scrapers.ai_discovery import AIDiscoveryScraper

scraper = AIDiscoveryScraper()
results = await scraper.scrape_product(
    sku="12345",
    config={
        "provider": "crawl4ai",
        "task": "Extract product info",
        "llm_model": "gpt-4o-mini"
    }
)
```

## Support

For issues or questions:

1. Check this guide first
2. Review example configs in `scrapers/configs/`
3. Check logs for detailed error messages
4. Consult the archived browser-use docs at `docs/ai-scraper.md` for migration help
