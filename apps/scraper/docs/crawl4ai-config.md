# crawl4ai Configuration Guide

**Version**: v0.3.0  
**Last Updated**: March 2026

Complete configuration reference for the crawl4ai extraction engine.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Configuration Schema](#configuration-schema)
4. [Extraction Modes](#extraction-modes)
5. [Anti-Detection](#anti-detection)
6. [Schema Definition](#schema-definition)
7. [Actions](#actions)
8. [Advanced Configuration](#advanced-configuration)
9. [Troubleshooting](#troubleshooting)
10. [Examples](#examples)

---

## Overview

crawl4ai is a high-performance extraction engine that supports three extraction modes:

- **LLM-Free**: Fast DOM parsing with zero AI costs
- **LLM**: AI-powered extraction for complex pages
- **Auto**: Intelligent mode selection (recommended)

### Key Features

| Feature | Benefit |
|---------|---------|
| **Hybrid Extraction** | Automatically selects optimal mode |
| **Zero-Cost Mode** | LLM-free parsing for most pages |
| **Advanced Anti-Bot** | Fingerprint rotation and stealth |
| **Schema Validation** | JSON Schema-based extraction |
| **Caching** | Content caching for repeat extractions |

---

## Quick Start

### Minimal Configuration

```yaml
name: "basic-extractor"
scraper_type: "crawl4ai"

crawl4ai_config:
  extraction_mode: "auto"

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"
```

### With Anti-Detection

```yaml
name: "protected-site-extractor"
scraper_type: "crawl4ai"

crawl4ai_config:
  extraction_mode: "auto"
  anti_detection:
    enabled: true
    simulate_user: true
    fingerprint_rotation: true

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/p/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"
```

---

## Configuration Schema

### Root Configuration

```yaml
name: string                    # Unique scraper identifier
scraper_type: "crawl4ai"        # Must be "crawl4ai"
base_url: string               # Default base URL (optional)
timeout: integer               # Request timeout in seconds (default: 30)
retries: integer               # Number of retries (default: 3)

crawl4ai_config:               # crawl4ai-specific settings
  extraction_mode: string      # "auto", "llm-free", or "llm"
  llm_model: string           # Model for LLM mode (default: "gpt-4o-mini")
  use_vision: boolean         # Enable vision capabilities (default: false)
  
  anti_detection:             # Anti-bot configuration
    enabled: boolean
    simulate_user: boolean
    random_delay: boolean
    fingerprint_rotation: boolean
    tls_fingerprint: string
  
  cache:                      # Caching configuration
    enabled: boolean
    ttl: integer             # Cache TTL in seconds
  
  rate_limit:                 # Rate limiting
    requests_per_minute: integer
    burst_size: integer

workflows:                    # List of extraction steps
  - action: string
    name: string              # Step identifier (optional)
    params: object

validation:                   # Result validation (optional)
  required_fields: array
  price_range: object

test_skus:                    # Test SKUs (optional)
  - string
```

### crawl4ai_config Reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `extraction_mode` | string | `"auto"` | Extraction mode: `auto`, `llm-free`, `llm` |
| `llm_model` | string | `"gpt-4o-mini"` | LLM model for LLM mode |
| `use_vision` | boolean | `false` | Enable GPT-4 Vision |
| `cache.enabled` | boolean | `true` | Enable content caching |
| `cache.ttl` | integer | `3600` | Cache TTL in seconds |

---

## Extraction Modes

### LLM-Free Mode

Uses DOM parsing without AI calls. Fastest and free.

```yaml
crawl4ai_config:
  extraction_mode: "llm-free"
  
workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
          selector: "h1.product-title"  # Optional CSS hint
```

**When to Use**:
- Structured e-commerce pages
- Product detail pages
- Sites with clean HTML
- High-volume scraping

**Limitations**:
- Struggles with unstructured content
- Cannot handle complex comparisons
- No semantic understanding

### LLM Mode

Always uses AI extraction. Most accurate but costs money.

```yaml
crawl4ai_config:
  extraction_mode: "llm"
  llm_model: "gpt-4o-mini"
  
workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
        description:
          type: "string"
```

**When to Use**:
- Complex comparison tables
- Unstructured product descriptions
- Pages requiring semantic understanding
- PDF or image-based content

**Cost Considerations**:
- gpt-4o-mini: $0.01-0.03 per page
- gpt-4o: $0.05-0.15 per page

### Auto Mode (Recommended)

Intelligently selects mode based on page complexity.

```yaml
crawl4ai_config:
  extraction_mode: "auto"
  
workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"
```

**Decision Logic**:
```
1. Try LLM-Free extraction
   ↓ (if confidence < 0.7)
2. Try LLM extraction
   ↓ (if cost exceeds $0.05)
3. Use static selectors (if defined)
   ↓ (if all fail)
4. Queue for manual review
```

**Benefits**:
- Optimal cost/accuracy balance
- Automatically adapts to page complexity
- Falls back gracefully

---

## Anti-Detection

### Basic Configuration

```yaml
crawl4ai_config:
  anti_detection:
    enabled: true
```

### Standard Configuration

```yaml
crawl4ai_config:
  anti_detection:
    enabled: true
    simulate_user: true        # Human-like mouse movements
    random_delay: true         # Random delays between actions
```

### Aggressive Configuration

```yaml
crawl4ai_config:
  anti_detection:
    enabled: true
    simulate_user: true
    random_delay: true
    fingerprint_rotation: true  # Rotate browser fingerprints
    tls_fingerprint: "chrome_120"  # Chrome 120 TLS fingerprint
    viewport_rotation: true    # Rotate viewport sizes
    user_agent_rotation: true  # Rotate user agents
```

### Anti-Detection Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable anti-detection |
| `simulate_user` | boolean | `false` | Human-like behavior |
| `random_delay` | boolean | `false` | Random action delays |
| `fingerprint_rotation` | boolean | `false` | Rotate fingerprints |
| `tls_fingerprint` | string | `"default"` | TLS fingerprint profile |
| `viewport_rotation` | boolean | `false` | Rotate viewports |
| `user_agent_rotation` | boolean | `false` | Rotate user agents |

### TLS Fingerprint Profiles

| Profile | Description |
|---------|-------------|
| `"chrome_120"` | Chrome 120 TLS fingerprint |
| `"firefox_121"` | Firefox 121 TLS fingerprint |
| `"safari_17"` | Safari 17 TLS fingerprint |
| `"default"` | System default |

---

## Schema Definition

### JSON Schema Format

Schemas use JSON Schema format:

```yaml
schema:
  name:
    type: "string"
    description: "Product name"
  
  price:
    type: "number"
    minimum: 0
  
  in_stock:
    type: "boolean"
  
  tags:
    type: "array"
    items:
      type: "string"
  
  specifications:
    type: "object"
    properties:
      weight:
        type: "string"
      dimensions:
        type: "string"
```

### Supported Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Text values | `"Product Name"` |
| `number` | Numeric values | `29.99` |
| `integer` | Whole numbers | `42` |
| `boolean` | True/false | `true` |
| `array` | List of items | `["tag1", "tag2"]` |
| `object` | Nested structure | `{key: value}` |
| `null` | Null values | `null` |

### CSS Selector Hints

Add CSS selectors to help LLM-free extraction:

```yaml
schema:
  name:
    type: "string"
    selector: "h1.product-title"      # Primary selector
    fallback_selectors:               # Fallback selectors
      - ".product-name"
      - "[data-testid='product-name']"
  
  price:
    type: "number"
    selector: ".price-current"
    transform: "parse_price"          # Built-in transforms
```

### Built-in Transforms

| Transform | Description | Input | Output |
|-----------|-------------|-------|--------|
| `parse_price` | Parse price string | `"$29.99"` | `29.99` |
| `parse_number` | Parse numeric string | `"1,234"` | `1234` |
| `strip` | Remove whitespace | `"  text  "` | `"text"` |
| `lowercase` | Convert to lowercase | `"TEXT"` | `"text"` |
| `uppercase` | Convert to uppercase | `"text"` | `"TEXT"` |
| `extract_first` | Get first element | `["a", "b"]` | `"a"` |
| `extract_last` | Get last element | `["a", "b"]` | `"b"` |

---

## Actions

### crawl4ai_extract

Main extraction action.

```yaml
- action: "crawl4ai_extract"
  name: "extract_product"
  params:
    url: "{base_url}/product/{sku}"
    extraction_mode: "auto"           # Override global setting
    schema:
      name:
        type: "string"
      price:
        type: "number"
    wait_for:
      selector: ".product-loaded"     # Wait for element
      timeout: 10                     # Wait timeout
    javascript: |
      // Custom JavaScript to execute
      window.scrollTo(0, document.body.scrollHeight);
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | URL to extract from |
| `extraction_mode` | string | No | Override global mode |
| `schema` | object | Yes | Extraction schema |
| `wait_for` | object | No | Wait conditions |
| `javascript` | string | No | JavaScript to execute |
| `headers` | object | No | Custom headers |

### crawl4ai_navigate

Navigate to a URL with anti-detection.

```yaml
- action: "crawl4ai_navigate"
  params:
    url: "{base_url}/products"
    wait_until: "networkidle"         # load | domcontentloaded | networkidle
    timeout: 30
```

### crawl4ai_click

Click an element.

```yaml
- action: "crawl4ai_click"
  params:
    selector: "button.load-more"
    wait_for_navigation: true
    timeout: 10
```

### crawl4ai_scroll

Scroll the page.

```yaml
- action: "crawl4ai_scroll"
  params:
    direction: "down"                 # down | up | bottom
    amount: 1000                      # Pixels to scroll
    simulate_human: true              # Human-like scrolling
```

### crawl4ai_wait

Wait for conditions.

```yaml
- action: "crawl4ai_wait"
  params:
    selector: ".product-loaded"       # Wait for element
    timeout: 10
    # OR
    duration: 2                       # Wait N seconds
```

---

## Advanced Configuration

### Caching

```yaml
crawl4ai_config:
  cache:
    enabled: true
    ttl: 3600                       # Cache for 1 hour
    max_size: 100                   # Max cached entries
    key_pattern: "{url}_{schema_hash}"
```

### Rate Limiting

```yaml
crawl4ai_config:
  rate_limit:
    requests_per_minute: 30
    burst_size: 5
    retry_after: "rate_limit_header"  # Use server's Retry-After header
```

### Retry Configuration

```yaml
crawl4ai_config:
  retry:
    max_attempts: 3
    backoff_factor: 2.0               # Exponential backoff
    max_delay: 60                     # Max delay between retries
    retry_on:
      - "timeout"
      - "network_error"
      - "rate_limit"
      - "anti_bot_detected"
```

### Proxy Configuration

```yaml
crawl4ai_config:
  proxy:
    enabled: true
    rotation: "per_request"           # per_request | per_site | off
    proxies:
      - "http://proxy1:8080"
      - "http://proxy2:8080"
```

### Custom Headers

```yaml
crawl4ai_config:
  headers:
    Accept: "text/html,application/xhtml+xml"
    Accept-Language: "en-US,en;q=0.9"
```

---

## Troubleshooting

### Extraction Returns Empty Data

**Cause 1**: Page not fully loaded
```yaml
workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      wait_for:
        selector: ".product-loaded"
        timeout: 10
```

**Cause 2**: Anti-bot detection
```yaml
crawl4ai_config:
  anti_detection:
    enabled: true
    simulate_user: true
    random_delay: true
```

**Cause 3**: Schema mismatch
```yaml
# Add fallback selectors
schema:
  name:
    type: "string"
    selector: "h1.product-title"
    fallback_selectors:
      - "h1"
      - ".title"
```

### High LLM Usage in Auto Mode

**Diagnostics**:
```bash
python -m src.crawl4ai_engine.metrics --report
```

**Solutions**:
1. Improve schema with CSS selectors
2. Use LLM-free mode for simple pages
3. Adjust confidence threshold

### Slow Extraction Speeds

**Check caching**:
```yaml
crawl4ai_config:
  cache:
    enabled: true
    ttl: 7200                       # Increase TTL
```

**Use LLM-free mode**:
```yaml
crawl4ai_config:
  extraction_mode: "llm-free"
```

### Anti-Bot Detection

**Enable all protections**:
```yaml
crawl4ai_config:
  anti_detection:
    enabled: true
    simulate_user: true
    random_delay: true
    fingerprint_rotation: true
    tls_fingerprint: "chrome_120"
```

**Add delays**:
```yaml
workflows:
  - action: "crawl4ai_navigate"
    params:
      url: "{base_url}"
  
  - action: "crawl4ai_wait"
    params:
      duration: 3                   # Wait 3 seconds
  
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
```

---

## Examples

### Example 1: Simple Product Scraper

```yaml
name: "simple-product"
scraper_type: "crawl4ai"
base_url: "https://example.com"

crawl4ai_config:
  extraction_mode: "llm-free"

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
          selector: "h1.product-title"
        price:
          type: "number"
          selector: ".price"
          transform: "parse_price"
        brand:
          type: "string"
          selector: ".brand"

test_skus:
  - "ABC-123"
  - "XYZ-789"
```

### Example 2: Complex Product with Variants

```yaml
name: "complex-product"
scraper_type: "crawl4ai"

crawl4ai_config:
  extraction_mode: "auto"
  anti_detection:
    enabled: true
    simulate_user: true

workflows:
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/p/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"
        variants:
          type: "array"
          items:
            type: "object"
            properties:
              size:
                type: "string"
              color:
                type: "string"
              price:
                type: "number"
        specifications:
          type: "object"
          properties:
            weight:
              type: "string"
            material:
              type: "string"

test_skus:
  - "VARIANT-001"
```

### Example 3: Protected Site

```yaml
name: "protected-site"
scraper_type: "crawl4ai"

crawl4ai_config:
  extraction_mode: "auto"
  anti_detection:
    enabled: true
    simulate_user: true
    random_delay: true
    fingerprint_rotation: true
    tls_fingerprint: "chrome_120"
  
  rate_limit:
    requests_per_minute: 10
    burst_size: 2

workflows:
  - action: "crawl4ai_navigate"
    params:
      url: "{base_url}"
      wait_until: "networkidle"
  
  - action: "crawl4ai_wait"
    params:
      duration: 5
  
  - action: "crawl4ai_extract"
    params:
      url: "{base_url}/product/{sku}"
      schema:
        name:
          type: "string"
        price:
          type: "number"
```

### Example 4: Multi-Page Product

```yaml
name: "multi-page-product"
scraper_type: "crawl4ai"

crawl4ai_config:
  extraction_mode: "auto"

workflows:
  - action: "crawl4ai_navigate"
    params:
      url: "{base_url}/product/{sku}"
  
  - action: "crawl4ai_extract"
    name: "basic_info"
    params:
      schema:
        name:
          type: "string"
        price:
          type: "number"
  
  - action: "crawl4ai_click"
    params:
      selector: "a.specifications-tab"
      wait_for_navigation: false
  
  - action: "crawl4ai_extract"
    name: "specifications"
    params:
      schema:
        specifications:
          type: "object"
```

### Example 5: Comparison Site

```yaml
name: "comparison-scraper"
scraper_type: "crawl4ai"

crawl4ai_config:
  extraction_mode: "llm"              # LLM needed for complex tables
  llm_model: "gpt-4o-mini"

workflows:
  - action: "crawl4ai_navigate"
    params:
      url: "{base_url}/compare/{sku}"
  
  - action: "crawl4ai_extract"
    params:
      schema:
        retailers:
          type: "array"
          items:
            type: "object"
            properties:
              name:
                type: "string"
              price:
                type: "number"
              availability:
                type: "string"
              shipping:
                type: "string"
```

---

## Best Practices

1. **Start with LLM-free mode** for structured pages
2. **Use Auto mode** for mixed content
3. **Enable anti-detection** for protected sites
4. **Add CSS selectors** to help extraction
5. **Cache aggressively** for repeat URLs
6. **Test with multiple SKUs** including edge cases
7. **Monitor metrics** to optimize costs
8. **Use rate limiting** to avoid blocks

---

## See Also

- [Migration Guide](migration-guide.md) - Migrating from browser-use
- [Architecture](ARCHITECTURE.md) - System architecture
- [API Reference](API_PROPOSAL.md) - API documentation

---

*Last updated: March 2026*
