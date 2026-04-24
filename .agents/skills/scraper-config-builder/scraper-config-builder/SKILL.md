---
name: scraper-config-builder
description: Skill for building, debugging, and testing BayState scraper configuration YAML files. Use when you need to create a new scraper, update selectors, or debug a failing scraper by ensuring all edge cases (results, no results, timeouts) are handled.
---

# Scraper Config Builder

This skill provides comprehensive workflows and guidelines for creating, debugging, and testing scraper configuration files (YAML) for the BayStateScraper project.

## Related Skills

- **playwright-explore-website** - Use for interactive website exploration and selector discovery
- **agent-browser** - Use for browser automation and testing
- **web-scraping** - General web scraping patterns and best practices
- **site-crawler** - For crawling and content extraction concepts

## Core Principles

1. **Timeouts are Failures**: A scraper timing out waiting for a selector is a hard failure. Scrapers must handle all possible outcomes (success, "no results", login required, captcha) gracefully without timing out.
2. **Comprehensive Testing**: You must test against all scenarios:
   - **Standard SKUs** (expected to find results)
   - **Fake/Invalid SKUs** (expected to trigger "no results" handling)
   - **Edge Cases** (multiple results, generic errors, site-specific anomalies)
3. **Exploration is Mandatory**: Never assume selectors work without verifying them on the live site using Playwright MCP or agent-browser.

## Complete Configuration Schema

```yaml
schema_version: "1.0"
name: supplier_name # Machine name (lowercase, no spaces)
display_name: "Supplier Name" # Human-readable name
base_url: https://www.example.com
scraper_type: static # static | agentic | crawl4ai (static has full executor support)
timeout: 30 # Default timeout in seconds
retries: 2 # Number of retries on failure
image_quality: 50 # Image quality score (0-100)

# Credential references for login-required sites
credential_refs:
  - supplier_name

# Selector definitions for data extraction
selectors:
  - name: Name
    selector: "#productTitle"
    attribute: text
    multiple: false
    required: true
    fallback_selectors:
      - "h1.product-title"
      - "[data-testid='product-name']"

  - name: Brand
    selector: ".brand-name"
    attribute: text
    required: false

  - name: Image URLs
    selector: ".product-images img"
    attribute: src
    multiple: true
    required: true

# Workflow steps (executed sequentially)
workflows:
  - action: navigate
    params:
      url: "https://www.example.com/search?q={{sku}}"

  - action: wait_for
    params:
      timeout: 30
      selector:
        - ".product-title" # Success indicator
        - ".no-results-message" # No results indicator
        - ".login-required" # Login required indicator

  - action: check_no_results

  - action: conditional_skip
    params:
      if_flag: no_results_found

  - action: extract_and_transform
    params:
      fields:
        - name: Name
          selector: "#productTitle"
          attribute: text
        - name: Brand
          selector: "#bylineInfo"
          transform:
            - type: regex_extract
              pattern: "Visit the (.+) Store"
              group: 1
        - name: Images
          selector: "#altImages img"
          attribute: src
          multiple: true
          transform:
            - type: replace
              pattern: "_thumb_"
              replacement: "_large_"

# Validation configuration for no-results detection
validation:
  no_results_selectors:
    - ".no-results"
    - "#noResultsTitle"
    - "//h2[contains(text(), 'No results')]"
  no_results_text_patterns:
    - "no results found"
    - "your search returned no results"
    - "0 items found"

# Login configuration (if required)
login:
  url: "https://www.example.com/login"
  username_field: "#username"
  password_field: "#password"
  submit_button: "#submit"
  success_indicator: ".logged-in-indicator"
  timeout: 60

# HTTP status monitoring
http_status:
  enabled: true
  fail_on_error_status: true
  error_status_codes: [400, 401, 403, 404, 500, 502, 503, 504]
  warning_status_codes: [301, 302, 307, 308]

# Anti-detection configuration
anti_detection:
  enable_rate_limiting: true
  rate_limit_min_delay: 1
  rate_limit_max_delay: 3
  enable_human_simulation: true
  enable_blocking_handling: true
  enable_captcha_detection: true
  max_retries_on_detection: 3

# Test SKUs for validation
test_skus:
  - "123456789"
  - "987654321"

fake_skus:
  - "xyzabc123notexist456"
  - "000000000000"

edge_case_skus:
  - "1"
  - "12345678901234567890"

# Proxy configuration (optional)
proxy_config:
  proxy_url: "http://proxy.example.com:8080"
  proxy_username: "user" # Optional
  proxy_password: "pass" # Optional
  rotation_strategy: "off" # off | per_request | per_site
  proxy_list: # Optional: list of proxies to rotate through
    - "http://proxy1.example.com:8080"
    - "http://proxy2.example.com:8080"
```

## Available Actions

### Navigation Actions

#### `navigate`

Navigate to a URL. Supports template variables like `{{sku}}` and `{{base_url}}`.

```yaml
- action: navigate
  params:
    url: "{{base_url}}/search?q={{sku}}"
```

#### `wait`

Simple fixed-duration wait (use sparingly).

```yaml
- action: wait
  params:
    seconds: 3
```

#### `wait_for`

Wait for any of multiple selectors to appear. **Critical**: Always include no-results selectors.

```yaml
- action: wait_for
  params:
    timeout: 30
    selector:
      - ".product-title" # Success path
      - ".no-results" # No results path
      - ".captcha-container" # Captcha detection
      - "#login-form" # Login required
```

#### `wait_for_hidden`

Wait for an element to disappear (e.g., loading spinner).

```yaml
- action: wait_for_hidden
  params:
    selector: ".loading-spinner"
    timeout: 10
```

#### `scroll`

Scroll the page.

> ⚠️ **Known Issue**: This action has implementation issues and may not work reliably.

```yaml
- action: scroll
  params:
    direction: down # down | up | to_bottom | to_top
    amount: 500 # pixels (optional)
    # OR scroll to element:
    selector: "#footer"
```

### Extraction Actions

#### `extract`

Basic extraction using defined selectors.

```yaml
- action: extract
  params:
    fields:
      - Name
      - Brand
      - Image URLs
```

#### `extract_and_transform` (Recommended)

Single-pass extraction with inline transformations. More efficient than separate `extract` + `transform_value`.

```yaml
- action: extract_and_transform
  params:
    fields:
      - name: Name
        selector: "#productTitle"
        attribute: text
        required: true

      - name: Brand
        selector: "#bylineInfo"
        transform:
          - type: regex_extract
            pattern: "Visit the (.+) Store"
            group: 1

      - name: Images
        selector: "#altImages img"
        attribute: src
        multiple: true
        transform:
          - type: replace
            pattern: "_AC_US40_"
            replacement: "_AC_SL1500_"

      - name: Price
        selector: ".a-price-whole"
        required: false # Won't fail if not found
        timeout_ms: 1500 # Shorter timeout for optional fields
```

#### `parse_table`

Extract data from HTML tables.

> ⚠️ **Known Issue**: This action has implementation issues and may not work reliably.

```yaml
- action: parse_table
  params:
    selector: "#product-specs-table"
    target_field: "specs_table"
    key_column: 0
    value_column: 1
```

#### `extract_from_json`

Extract and parse JSON from script tags or API responses.

```yaml
- action: extract_from_json
  params:
    source_field: "json_script_content"
    json_path: "product.name" # Use dot notation (e.g., "product.name" or "data.items.0.title")
    target_field: "ProductName"
```

#### `process_images`

Extract and process image URLs.

```yaml
- action: process_images
  params:
    field: "Image URLs"
    # Images are processed in place
```

### Interaction Actions

#### `click`

Click an element.

```yaml
- action: click
  params:
    selector: "#submit-button"
    index: 0 # Click nth matching element (default: 0)
    wait_after: 1 # Seconds to wait after click
    filter_text: "Buy" # Only click elements containing text
    exclude_sponsored: true # Skip sponsored/featured results
```

#### `conditional_click`

Click only if element exists (no error if missing). Perfect for cookie banners and optional elements.

```yaml
- action: conditional_click
  name: accept_cookies
  params:
    selector: "#cookie-accept, .accept-cookies"
    timeout: 2
```

#### `input_text`

Fill form inputs.

```yaml
- action: input_text
  params:
    selector: "#search-input"
    text: "{{sku}}"
    clear_first: true
```

#### `login`

Execute login workflow (uses `credential_refs`).

```yaml
- action: login
  params: {} # Config pulled from login section
```

#### `execute_script`

Run custom JavaScript.

> ⚠️ **Known Issue**: This action has implementation issues and may not work reliably.

```yaml
- action: execute_script
  params:
    script: "window.scrollTo(0, document.body.scrollHeight);"
    wait_after: 1
```

### Validation & Control Actions

#### `check_no_results`

Check for no-results indicators. Sets `no_results_found` flag.

```yaml
- action: check_no_results
```

Uses selectors from `validation.no_results_selectors` and text patterns from `validation.no_results_text_patterns`.

#### `conditional_skip`

Skip remaining workflow steps based on a flag.

```yaml
- action: check_no_results
- action: conditional_skip
  params:
    if_flag: no_results_found
```

#### `conditional`

Execute steps conditionally.

```yaml
- action: conditional
  params:
    condition_type: element_exists
    selector: ".search-results"
    then:
      - action: click
        params:
          selector: ".first-result"
    else:
      - action: execute_script
        params:
          script: "console.log('No search results')"
```

Condition types:

- `field_exists`: Check if a result field exists
- `value_match`: Check if field equals expected value
- `element_exists`: Check if element is on page

#### `validate_search_result`

Validate that the first search result matches the searched SKU (prevents false positives).

```yaml
- action: validate_search_result
  params:
    required_selectors:
      - "#productTitle"
      - "h1"
```

#### `verify`

Verify a value on the page matches expected value.

```yaml
- action: verify
  params:
    selector: "#product-sku"
    attribute: text
    expected_value: "{{sku}}"
    match_mode: contains # exact | contains | fuzzy_number
    on_failure: fail_workflow # fail_workflow | warn
```

#### `verify_sku_on_page`

Verify the searched SKU appears anywhere in page HTML.

```yaml
- action: verify_sku_on_page
  params:
    strict: true # Fail workflow if SKU not found
```

#### `validate_http_status`

Check HTTP status code of current page.

```yaml
- action: validate_http_status
  params:
    expected_status: 200
    fail_on_error: true
```

### Data Transformation Actions

#### `transform_value`

Transform extracted values post-extraction.

```yaml
- action: extract
  params:
    fields: [RawPrice, RawName]

- action: transform_value
  params:
    source_field: RawPrice
    target_field: Price
    transformations:
      - type: strip
        chars: "$"
      - type: replace
        pattern: ","
        replacement: ""
```

Transform types:

- `replace`: Regex replacement
- `regex_extract`: Extract pattern group
- `strip`: Strip characters
- `lower`/`upper`/`title`: Case transformation

#### `filter_brand`

Remove brand name from product name.

```yaml
- action: filter_brand
  params:
    name_field: Name
    brand_field: Brand
```

#### `combine_fields`

Combine multiple fields into one using a format string.

```yaml
- action: combine_fields
  params:
    fields: [FirstName, LastName]
    target_field: FullName
    format: "{FirstName} {LastName}"
```

### Utility Actions

#### `parse_weight`

Parse and normalize weight values.

```yaml
- action: parse_weight
  params:
    field: "RawWeight"
    target_unit: "lb" # lb, kg, oz, g
```

#### `check_sponsored`

Check if content is sponsored/ad content.

> ⚠️ **Known Issue**: This action has implementation issues and may not work reliably.

```yaml
- action: check_sponsored
  params:
    selector: ".sponsored-label"
    result_field: "is_sponsored" # Defaults to "is_sponsored"
```

### Anti-Detection Actions

#### `detect_captcha`

Detect CAPTCHA presence on current page.

```yaml
- action: detect_captcha
```

Result stored in `captcha_detected` (boolean) and `captcha_details` (object).

#### `handle_blocking`

Handle blocking pages (403, access denied, etc.).

```yaml
- action: handle_blocking
```

Result stored in `blocking_handled` (boolean).

#### `rate_limit`

Apply rate limiting delay.

```yaml
- action: rate_limit
  params:
    delay: 2.5 # Custom delay in seconds (optional)
```

If no delay specified, uses intelligent rate limiting.

#### `simulate_human`

Simulate human-like behavior.

```yaml
- action: simulate_human
  params:
    behavior: "reading" # reading | typing | navigation | random
    duration: 3.0 # Duration in seconds
```

#### `rotate_session`

Force session rotation.

```yaml
- action: rotate_session
```

Result stored in `session_rotated` (boolean).

#### `set_proxy`

Set a proxy on the current browser context.

```yaml
- action: set_proxy
  params:
    proxy:
      proxy_url: "http://proxy.example.com:8080"
      proxy_username: "user" # Optional
      proxy_password: "pass" # Optional
```

## Complete Real-World Examples

### Example 1: Simple E-commerce Site

```yaml
schema_version: "1.0"
name: simple-store
display_name: Simple Store
base_url: https://www.simplestore.com
scraper_type: static
timeout: 30
retries: 2

selectors:
  - name: Name
    selector: "h1.product-title"
    attribute: text
    required: true
    fallback_selectors:
      - "[data-testid='product-name']"

  - name: Brand
    selector: ".product-brand"
    attribute: text
    required: false

  - name: Price
    selector: ".product-price"
    attribute: text
    required: true

  - name: Image URLs
    selector: ".product-gallery img"
    attribute: src
    multiple: true
    required: true

workflows:
  - action: navigate
    params:
      url: "{{base_url}}/search?q={{sku}}"

  - action: wait_for
    params:
      timeout: 30
      selector:
        - ".product-title"
        - ".no-results-message"

  - action: check_no_results

  - action: conditional_skip
    params:
      if_flag: no_results_found

  - action: extract_and_transform
    params:
      fields:
        - name: Name
          selector: "h1.product-title"
          required: true
        - name: Brand
          selector: ".product-brand"
        - name: Price
          selector: ".product-price"
          transform:
            - type: strip
              chars: "$"
            - type: replace
              pattern: ","
              replacement: ""
        - name: Image URLs
          selector: ".product-gallery img"
          attribute: src
          multiple: true

validation:
  no_results_selectors:
    - ".no-results-message"
    - "//h2[contains(text(), 'No results')]"
  no_results_text_patterns:
    - "no results found"
    - "0 items found"

test_skus:
  - "123456789"
fake_skus:
  - "xyzabc123notexist456"
```

### Example 2: Login-Required Site

```yaml
schema_version: "1.0"
name: phillips
display_name: Phillips Pet
base_url: https://shop.phillipspet.com
scraper_type: static
timeout: 30
retries: 2

credential_refs:
  - phillips

selectors:
  - name: Name
    selector: "#plp-desktop-row .cc_product_name strong"
    attribute: text
    required: true
    fallback_selectors:
      - "h1"

  - name: UPC
    selector: "#plp-desktop-row .product-upc .cc_value"
    attribute: text
    required: false

  - name: Image URLs
    selector: "#plp-desktop-row .cc_product_image img"
    attribute: src
    multiple: true
    required: false

login:
  url: https://shop.phillipspet.com/ccrz__CCSiteLogin
  username_field: "#emailField"
  password_field: "#passwordField"
  submit_button: "#send2Dsk"
  success_indicator: "a.doLogout.cc_do_logout"
  timeout: 60

workflows:
  - action: login
    params: {}

  - action: navigate
    params:
      url: "{{base_url}}/ccrz__ProductList?operation=quickSearch&searchText={{sku}}"

  - action: wait_for
    params:
      timeout: 10
      selector:
        - "#plp-desktop-row .cc_product_name"
        - ".plp-empty-state-message-container h3"

  - action: check_no_results

  - action: conditional_skip
    params:
      if_flag: no_results_found

  - action: extract
    params:
      fields: [Name, UPC, Image URLs]

  - action: transform_value
    params:
      field: Image URLs
      transformations:
        - type: replace
          pattern: "/thumb/"
          replacement: "/large/"

validation:
  no_results_selectors:
    - ".plp-empty-state-message-container h3"
  no_results_text_patterns:
    - "no results found"
    - "0 items"

test_skus:
  - "072705115310"
fake_skus:
  - "xyzabc123notexist456"
```

### Example 3: Search Results Site (Multi-step)

```yaml
schema_version: "1.0"
name: amazon
display_name: Amazon
base_url: https://www.amazon.com
scraper_type: static
timeout: 30
retries: 2

selectors:
  - name: Name
    selector: "#productTitle"
    attribute: text
    required: true

  - name: Brand
    selector: "#bylineInfo"
    attribute: text
    required: true

  - name: Rating
    selector: "#acrPopover"
    attribute: text
    required: false

workflows:
  - action: navigate
    params:
      url: "{{base_url}}/s?k={{sku}}"

  - action: wait
    params:
      seconds: 3

  - action: conditional_click
    name: accept_cookies
    params:
      selector: "#sp-cc-accept, .a-button-input[data-value='accept']"
      timeout: 2

  - action: wait_for
    params:
      timeout: 30
      selector:
        - "#productTitle" # Direct product page
        - "div[data-asin]:not([data-asin=''])" # Search results
        - "#noResultsTitle" # No results

  - action: check_no_results

  - action: conditional_skip
    params:
      if_flag: no_results_found

  - action: validate_search_result
    params:
      required_selectors:
        - "h2"

  # If we're on search results, click first result
  - action: conditional
    params:
      condition_type: element_exists
      selector: "div[data-component-type='s-search-result']"
      then:
        - action: click
          params:
            selector: "div[data-component-type='s-search-result']:not(.AdHolder) a:has(h2)"
            index: 0
        - action: wait_for
          params:
            timeout: 10
            selector: "#productTitle"

  - action: extract_and_transform
    params:
      fields:
        - name: Name
          selector: "#productTitle"
        - name: Brand
          selector: "#bylineInfo"
          transform:
            - type: regex_extract
              pattern: "Visit the (.+) Store"
              group: 1
        - name: Rating
          selector: "span.a-icon-alt"
          required: false

validation:
  no_results_selectors:
    - "#noResultsTitle"
    - ".s-no-results-filler"
    - "[widgetId='messaging-messages-no-results']"
  no_results_text_patterns:
    - "no results for"
    - "0 results for"
    - "No results for your search query"

test_skus:
  - "035585499741"
  - "B08N5WRWNW"
fake_skus:
  - "xyzabc123notexist456"
  - "B00ZZZZZZZ"
```

## Workflow: Building & Debugging Scrapers

### Phase 1: Exploration & Selector Discovery

Use the **playwright-explore-website** skill or `agent-browser` to understand the website:

1. Navigate to the search page
2. Search for a known SKU
3. Inspect the DOM for:
   - **Product elements** (for success detection)
   - **No results indicators** (critical!)
   - **Login prompts**
   - **Cookie banners** (for conditional_click)
   - **Captcha challenges**

**Exploration Checklist:**

- [ ] Does the site redirect to product page for exact matches?
- [ ] Does it show search results page?
- [ ] What appears for invalid SKUs?
- [ ] Are there cookie consent dialogs?
- [ ] Is login required for prices?

### Phase 2: Create Initial Configuration

1. Create YAML file: `apps/scraper/scrapers/configs/<supplier>.yaml`
2. Define metadata and base selectors
3. Set up validation block with no-results selectors
4. Create basic workflow

### Phase 3: Local Testing

**Test with valid SKU:**

```bash
cd apps/scraper
uv run python runner.py --local --config scrapers/configs/<supplier>.yaml --sku <VALID_SKU> --no-headless
```

**Test with fake SKU (critical):**

```bash
uv run python runner.py --local --config scrapers/configs/<supplier>.yaml --sku xyzabc123notexist456 --no-headless
```

**Run all test SKUs:**

```bash
uv run python runner.py --local --config scrapers/configs/<supplier>.yaml
```

### Phase 4: Debug & Iterate

If timeout occurs:

1. Check `debug_dump.html` in `apps/scraper/` directory
2. Identify what's actually on the page
3. Add missing selectors to `wait_for` and `validation`
4. Re-test

## Debug CLI Commands

Built-in debugging tools for validating and testing scraper configurations.

### Config Validation

**Validate a single config:**

```bash
cd apps/scraper
python -m utils.debugging.cli validate scrapers/configs/<supplier>.yaml
```

**Validate all configs:**

```bash
cd apps/scraper
python -m utils.debugging.cli validate-all scrapers/configs/
```

**Strict validation (fail on warnings):**

```bash
python -m utils.debugging.cli validate scrapers/configs/<supplier>.yaml --strict
```

### Selector Testing

**Test a selector against a URL:**

```bash
cd apps/scraper
python -m utils.debugging.cli test-selector "#productTitle" \
  --url "https://amazon.com/dp/B08N5WRWNW"
```

**Test all selectors from a config:**

```bash
cd apps/scraper
python -m utils.debugging.cli test-config scrapers/configs/<supplier>.yaml \
  --sku "035585499741"
```

### Step-by-Step Debugging

**Debug workflow execution:**

```bash
cd apps/scraper
python -m utils.debugging.cli debug scrapers/configs/<supplier>.yaml \
  --sku "035585499741"
```

**Run debug with visible browser:**

```bash
cd apps/scraper
python -m utils.debugging.cli debug scrapers/configs/<supplier>.yaml \
  --sku "035585499741"
```

**Run debug headless:**

```bash
cd apps/scraper
python -m utils.debugging.cli debug scrapers/configs/<supplier>.yaml \
  --sku "035585499741" \
  --headless
```

### JSON Output

All commands support JSON output for integration:

```bash
python -m utils.debugging.cli validate scrapers/configs/<supplier>.yaml --json
```

## Troubleshooting Guide

### TimeoutError: Element wait timed out

**Symptoms:** Scraper hangs and eventually times out on `wait_for`

**Causes & Solutions:**

1. **Missing no-results selector**
   - **Cause:** `wait_for` doesn't include the "no results" element
   - **Solution:** Add all no-results indicators to `wait_for` selector list
   - **Debug:** Check `debug_dump.html` to see what actually loaded

2. **Selector changed**
   - **Cause:** Website updated their HTML structure
   - **Solution:** Re-explore site and update selectors
   - **Debug:** Use browser DevTools to verify selectors

3. **Page loaded different state**
   - **Cause:** Captcha, login prompt, or error page appeared
   - **Solution:** Add these states to `wait_for` selectors
   ```yaml
   selector:
     - ".product-title" # Success
     - ".no-results" # No results
     - ".captcha-container" # Captcha
     - "#login-form" # Login required
     - ".error-page" # Error
   ```

### NoResultsError: No results not properly detected

**Symptoms:** Scraper times out instead of gracefully handling "no results"

**Solution:**

1. Ensure `validation.no_results_selectors` includes the actual element
2. Ensure `validation.no_results_text_patterns` includes the actual text
3. Verify `check_no_results` action is in workflow after `wait_for`
4. Verify `conditional_skip` follows `check_no_results`

### ElementNotFound: Selector not found

**Symptoms:** Extraction fails with "element not found"

**Solutions:**

1. Add `fallback_selectors` to selector definition
2. Set `required: false` for optional fields
3. Use more robust selectors (avoid auto-generated classes)
4. Use XPath for complex queries:
   ```yaml
   selector: "//tr[.//th[contains(., 'Weight')]]/td"
   ```

### Login Failures

**Symptoms:** Login action fails or hangs

**Solutions:**

1. Verify `login` configuration in YAML
2. Ensure `credential_refs` is set
3. Check that selectors match the actual login form
4. Verify credentials are available via environment variables
   ```bash
   SUPPLIER_USERNAME=user SUPPLIER_PASSWORD=pass python runner.py ...
   ```

### Rate Limiting / Blocking

**Symptoms:** Getting 403 errors, captchas, or empty pages

**Solutions:**

1. Enable anti-detection:
   ```yaml
   anti_detection:
     enable_rate_limiting: true
     rate_limit_min_delay: 2
     rate_limit_max_delay: 5
     enable_human_simulation: true
     enable_blocking_handling: true
   ```
2. Add delays between requests
3. Use conditional_click for cookie banners
4. Check if IP is blocked (try from different network)

### Data Extraction Issues

**Symptoms:** Fields are null or incorrect

**Solutions:**

1. Check if element needs different attribute:
   ```yaml
   attribute: data-src  # For lazy-loaded images
   attribute: innerHTML # For HTML content
   ```
2. Use transformations to clean data:
   ```yaml
   transform:
     - type: regex_extract
       pattern: "Price: \\$(\\d+\\.\\d{2})"
       group: 1
   ```
3. Check if field is within iframe (requires special handling)

## Best Practices

### Selector Strategies

1. **Prefer data attributes** over CSS classes:

   ```yaml
   # Good
   selector: "[data-testid='product-name']"

   # Risky (may change)
   selector: ".sc-12dfef4d-3.bJmXkP"
   ```

2. **Use semantic HTML** when available:

   ```yaml
   selector: "h1"                    # Page title
   selector: "main article"          # Product cards
   selector: "[role='search']"       # Search container
   ```

3. **XPath for complex queries**:

   ```yaml
   # Find row with specific header
   selector: "//tr[.//th[contains(text(), 'Weight')]]/td"

   # Find element containing text
   selector: "//*[contains(text(), 'No results found')]"
   ```

### Workflow Design

1. **Always handle no-results** - Every scraper must gracefully handle "no results"
2. **Use conditional_click** for optional elements (cookies, popups)
3. **Set required: false** for truly optional fields
4. **Use fallback_selectors** for critical fields
5. **Keep selectors simple** - Complex selectors break easily

### Testing Strategy

1. **Test with valid SKUs** first - Ensure happy path works
2. **Test with fake SKUs** - Verify no-results handling
3. **Test with edge cases** - Very short/long SKUs, special characters
4. **Run headless** for speed, `--no-headless` for debugging
5. **Check debug_dump.html** when failures occur

## Quick Reference

### Common Commands

```bash
# Test specific SKU with browser visible
cd apps/scraper
uv run python runner.py --local --config scrapers/configs/<name>.yaml --sku <SKU> --no-headless

# Run all test SKUs
cd apps/scraper
uv run python runner.py --local --config scrapers/configs/<name>.yaml

# Test with credentials
SUPPLIER_USERNAME=user SUPPLIER_PASSWORD=pass uv run python runner.py --local --config scrapers/configs/<name>.yaml --sku <SKU>

# Debug mode (saves debug_dump.html)
uv run python runner.py --local --config scrapers/configs/<name>.yaml --sku <SKU> --debug
```

### Common Selector Patterns

```yaml
# Product title
"h1", "[data-testid='product-name']", "#productTitle"

# Price (various formats)
".price", "[data-testid='price']", "//span[contains(@class, 'price')]"

# Images (handle lazy loading)
"img[src]", "img[data-src]", "img[data-lazy-src]"

# Brand
".brand", "[data-testid='brand']", "a[href*='/brand']"

# No results (common patterns)
".no-results", "#noResultsTitle", "[data-testid='no-results']"
"//h2[contains(text(), 'No results')]"
"//div[contains(text(), 'Your search returned no results')]"
```

### Common Transformations

```yaml
# Clean price
transform:
  - type: strip
    chars: "$"
  - type: replace
    pattern: ","
    replacement: ""

# Extract brand from text
transform:
  - type: regex_extract
    pattern: "Visit the (.+) Store"
    group: 1

# Clean whitespace
transform:
  - type: strip
  - type: replace
    pattern: "\\s+"
    replacement: " "

# Upgrade image size
transform:
  - type: replace
    pattern: "_thumb_"
    replacement: "_large_"
```

## Summary

This skill enables you to build robust scraper configurations that:

1. Handle all page states (success, no results, errors)
2. Extract and transform data efficiently
3. Gracefully handle edge cases
4. Are thoroughly tested against real scenarios

Remember: **Never ship a scraper that hasn't been tested with fake SKUs.** Timeouts on "no results" are bugs that must be fixed before deployment.
