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
6. [Anti-Detection](#anti-detection)
7. [Schema Definition](#schema-definition)
8. [Actions](#actions)
9. [Advanced Configuration](#advanced-configuration)
10. [Proxy Configuration](#proxy-configuration)
11. [Data Validation](#data-validation)
12. [Troubleshooting](#troubleshooting)
13. [Examples](#examples)
11. [Troubleshooting](#troubleshooting)
12. [Examples](#examples)
7. [Actions](#actions)
8. [Advanced Configuration](#advanced-configuration)
9. [Proxy Configuration](#proxy-configuration)
10. [Data Validation](#data-validation)
11. [Troubleshooting](#troubleshooting)
12. [Examples](#examples)
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

## Proxy Configuration

The scraper supports proxy configuration for outbound requests and Playwright browser automation. Use proxies to distribute requests across multiple IP addresses, avoid rate limiting, and access geo-restricted content.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxy_url` | string | `null` | Single proxy URL (`http://host:port` or `https://host:port`) |
| `proxy_username` | string | `null` | Username for proxy authentication |
| `proxy_password` | string | `null` | Password for proxy authentication |
| `rotation_strategy` | string | `"off"` | Rotation strategy: `per_request`, `per_site`, or `off` |
| `proxy_list` | array | `null` | List of proxy URLs to rotate through |

### Proxy URL Format

Proxy URLs must include the protocol prefix:

```
http://proxy.example.com:8080
https://proxy.example.com:8080
http://user:pass@proxy.example.com:8080
```

### Rotation Strategies

#### `off` - No Rotation

Uses the first available proxy for all requests. Best for single proxy setups or when session persistence is critical.

**When to use:**
- Single proxy configuration
- Session-based scraping requiring IP consistency
- Testing and development

```yaml
proxy_config:
  proxy_url: "http://proxy.example.com:8080"
  rotation_strategy: "off"
```

#### `per_request` - Rotate Per Request

Cycles through the proxy list for each request. Best for distributing load and avoiding rate limits.

**When to use:**
- High-volume scraping
- Load balancing across multiple proxies
- Avoiding IP-based rate limits
- Multiple proxy providers

```yaml
proxy_config:
  proxy_list:
    - "http://proxy1.example.com:8080"
    - "http://proxy2.example.com:8080"
    - "http://proxy3.example.com:8080"
  rotation_strategy: "per_request"
```

#### `per_site` - Same Proxy Per Site

Returns the same proxy for requests to the same site (based on hostname hash). Best for maintaining session state across multiple requests to the same domain.

**When to use:**
- Session-based authentication
- Shopping cart workflows
- Multi-step forms
- Sites tracking sessions by IP

```yaml
proxy_config:
  proxy_list:
    - "http://proxy1.example.com:8080"
    - "http://proxy2.example.com:8080"
  rotation_strategy: "per_site"
```

### Provider Examples

#### Bright Data

Bright Data (formerly Luminati) provides residential and datacenter proxies.

```yaml
proxy_config:
  proxy_url: "http://user:pass@proxy.brightdata.io:22225"
  rotation_strategy: "per_request"
```

**Format**: `http://{customer_id}:{password}@proxy.brightdata.io:22225`

**Common ports:**
- 22225: Residential rotating
- 24000: Datacenter rotating

#### Oxylabs

Oxylabs provides residential and datacenter proxy solutions.

```yaml
proxy_config:
  proxy_url: "http://user:pass@pr.oxylabs.io:7777"
  rotation_strategy: "per_request"
```

**Format**: `http://{username}:{password}@pr.oxylabs.io:7777`

**Common ports:**
- 7777: Residential rotating
- 10000: Datacenter rotating

#### Multiple Proxy Rotation

Rotate through a list of proxies from any provider:

```yaml
proxy_config:
  proxy_list:
    - "http://user1:pass1@proxy1.brightdata.io:22225"
    - "http://user2:pass2@proxy2.brightdata.io:22225"
    - "http://user:pass@pr.oxylabs.io:7777"
  rotation_strategy: "per_request"
```

#### Separate Credentials

If your proxy provider gives you credentials separately:

```yaml
proxy_config:
  proxy_url: "http://proxy.example.com:8080"
  proxy_username: "my_username"
  proxy_password: "my_password"
  rotation_strategy: "per_request"
```

### Integration with Scrapers

Add `proxy_config` to your scraper configuration:

```yaml
name: "proxied-scraper"
scraper_type: "crawl4ai"
base_url: "https://example.com"

proxy_config:
  proxy_list:
    - "http://user:pass@proxy.brightdata.io:22225"
  rotation_strategy: "per_request"

crawl4ai_config:
  extraction_mode: "auto"
  anti_detection:
    enabled: true

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

### Troubleshooting Proxies

#### Connection Errors

**Symptom**: `Proxy connection timeout` or `Cannot connect to proxy`

**Solutions:**
1. Verify proxy URL format includes protocol (`http://` or `https://`)
2. Check firewall rules allow outbound connections to proxy port
3. Test proxy connectivity with curl:

```bash
curl -x http://user:pass@proxy.example.com:8080 http://httpbin.org/ip
```

#### Authentication Failures

**Symptom**: `Proxy authentication required` or `407 Proxy Authentication Required`

**Solutions:**
1. Verify username and password are correct
2. URL-encode special characters in credentials
3. Use separate `proxy_username` and `proxy_password` fields instead of embedding in URL

```yaml
# Instead of:
proxy_url: "http://user:p@ss@proxy.example.com:8080"

# Use:
proxy_url: "http://proxy.example.com:8080"
proxy_username: "user"
proxy_password: "p@ss"
```

#### Rotation Not Working

**Symptom**: All requests use the same proxy

**Solutions:**
1. Verify `rotation_strategy` is set to `per_request` or `per_site`
2. Ensure `proxy_list` has multiple entries
3. Check that proxy URLs are valid and unique

```yaml
proxy_config:
  proxy_list:
    - "http://proxy1.example.com:8080"
    - "http://proxy2.example.com:8080"  # Must have multiple
  rotation_strategy: "per_request"     # Must not be "off"
```

---

## Data Validation

The scraper uses Pandera to validate extracted data before sending results to the coordinator. Validation runs automatically at the callback boundary to catch malformed payloads early and prevent bad data from entering the system.

### Overview

Validation ensures scraped results meet minimum quality standards:

- **Required fields** are present (name or title)
- **Price values** are numeric and non-negative
- **URLs** follow proper http/https format
- **SKUs** contain only alphanumeric characters

When validation fails, the scraper reports detailed errors back to the coordinator so you can identify and fix data issues quickly.

### Validation Rules

| Field | Rule | Example Valid | Example Invalid |
|-------|------|---------------|-----------------|
| price | Positive number or null | `29.99`, `0`, `null` | `"free"`, `"N/A"`, `-5` |
| name | Required string (or title as fallback) | `"Dog Food"`, `"Premium Cat Litter"` | `""`, `null` (when title also null) |
| url | Valid URL with http/https scheme | `https://example.com/product/123` | `"not-a-url"`, `"ftp://files.example.com"` |
| sku | Alphanumeric characters only | `"ABC123"`, `"PROD456"` | `"ABC-123!"`, `"SKU 789"` |

**Notes:**
- The `name` field accepts either `name` or `title` from extracted data. If both are missing, validation fails.
- Price can be `null` for out-of-stock or unavailable items, but cannot be negative.
- URLs must have a valid scheme (`http` or `https`) and a network location (domain).
- SKUs must pass `isalnum()` check, meaning only letters and digits, no spaces or special characters.

### Configuration

Control validation behavior with environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_PANDERA_VALIDATION` | `true` | Enable or disable Pandera validation |

To disable validation (not recommended for production):

```bash
ENABLE_PANDERA_VALIDATION=false
```

Disabling validation may allow malformed data to reach the coordinator, causing downstream processing errors. Only disable temporarily during development or debugging.

### Validation Examples

#### Valid Data

```json
{
  "name": "Premium Dog Food - Chicken Flavor",
  "price": 29.99,
  "url": "https://example.com/products/ABC123",
  "sku": "ABC123"
}
```

```json
{
  "title": "Cat Litter Box",
  "price": null,
  "url": "https://example.com/products/DEF456",
  "sku": "DEF456"
}
```

#### Invalid Data with Error Messages

**Missing name/title:**
```json
{
  "price": 15.99,
  "url": "https://example.com/products/GHI789",
  "sku": "GHI789"
}
```
*Error:* `Missing required field: name or title`

**Invalid price format:**
```json
{
  "name": "Bird Seed",
  "price": "Out of stock",
  "url": "https://example.com/products/JKL012",
  "sku": "JKL012"
}
```
*Error:* `Column price must have type Float`

**Negative price:**
```json
{
  "name": "Fish Tank",
  "price": -10.00,
  "url": "https://example.com/products/MNO345",
  "sku": "MNO345"
}
```
*Error:* `Column price failed check greater_than_or_equal_to(0)`

**Invalid URL scheme:**
```json
{
  "name": "Hamster Wheel",
  "price": 12.99,
  "url": "ftp://files.example.com/products/PQR678",
  "sku": "PQR678"
}
```
*Error:* `Invalid url: ftp://files.example.com/products/PQR678`

**Invalid SKU with special characters:**
```json
{
  "name": "Rabbit Hutch",
  "price": 89.99,
  "url": "https://example.com/products/STU-901",
  "sku": "STU-901!"
}
```
*Error:* `Invalid sku (must be alphanumeric): STU-901!`

### Troubleshooting Validation Errors

#### Common Validation Failures

**"Missing required field: name or title"**
- The scraper could not extract a product name from the page
- Check that your schema includes a `name` or `title` field
- Verify CSS selectors are correct and match the page structure
- Try adding fallback selectors for different page layouts

**"Column price must have type Float"**
- Price was extracted as text instead of a number
- Use the `parse_price` transform in your schema:
  ```yaml
  price:
    type: "number"
    selector: ".price"
    transform: "parse_price"
  ```

**"Invalid url"**
- The URL field contains an invalid value
- Ensure the URL includes `http://` or `https://`
- Check for relative URLs (should be absolute)

**"Invalid sku (must be alphanumeric)"**
- SKU contains spaces, dashes, or special characters
- Clean the SKU in your extraction schema if needed
- Contact the site administrator if SKUs should contain special characters

#### Debugging Validation Issues

1. **Enable verbose logging** to see the exact data being validated:
   ```bash
   LOG_LEVEL=debug python daemon.py
   ```

2. **Test extraction locally** to inspect raw output:
   ```bash
   python -m scraper_backend.test_extraction --config my-scraper.yaml --sku TEST123
   ```

3. **Check the callback payload** in the coordinator logs to see what data was sent

4. **Temporarily disable validation** only for debugging (do not use in production):
   ```bash
   ENABLE_PANDERA_VALIDATION=false
   ```

---

## Troubleshooting

## Troubleshooting

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
