# Complete YAML Schema Reference

This document describes every field in a BayState scraper config YAML file,
as validated by the `ScraperConfig` Pydantic model.

---

## Top-Level Fields

```yaml
schema_version: "1.0"          # REQUIRED. Must be exactly "1.0"
name: vendor_slug              # REQUIRED. Scraper identifier: lowercase, no spaces
display_name: Vendor Name      # OPTIONAL. Human-readable label for UI
base_url: https://...          # REQUIRED. Root URL of the vendor site
scraper_type: static           # OPTIONAL. Default: "static". Enum: static | agentic | crawl4ai
use_stealth: true              # OPTIONAL. Default: true. Set false if stealth scripts break the site

# The following field does NOT exist on the model:
# requires_login: true         # WRONG — inferred automatically from login block presence
```

---

## Selectors (`selectors: [SelectorConfig, ...]`)

```yaml
selectors:
  - name: Name                  # REQUIRED. Field name referenced in extract actions
    selector: "h1"              # REQUIRED. CSS selector or XPath (if starts with //)
    attribute: text             # OPTIONAL. "text"|"href"|"src"|any HTML attribute
    multiple: false             # OPTIONAL. Default: false. true = extract all matches as list
    required: true              # OPTIONAL. Default: false. If true, empty value may fail scrape
    fallback_selectors:         # OPTIONAL. Alternatives tried in order
      - "h1[data-testid='product-title']"
      - ".product-title"
    id: sel_abc123              # OPTIONAL. Unique identifier for cross-referencing
```

### Attribute Semantics
- `text` — extracts `.textContent` (or `.innerText`)
- `href`, `src` — extracts the attribute value
- Any other string — extracts that attribute
- If `attribute` is omitted, handler defaults to `text`

---

## Workflows (`workflows: [WorkflowStep, ...]`)

```yaml
workflows:
  - action: "navigate"          # REQUIRED. Registered action name
    name: "Go to product page"  # OPTIONAL. For logging/debugging
    params:                     # REQUIRED (may be empty). Action-specific parameters
      url: "{{base_url}}/product/{{sku}}"
```

### Common Actions

| Action | Key Params | Purpose |
|--------|-----------|---------|
| `navigate` | `url`, `wait_until`, `wait_after` | Go to URL. Supports `{{sku}}`, `{{base_url}}`, `{{field_name}}` |
| `wait` | `seconds` | Static sleep |
| `wait_for` | `selector` (list or string), `timeout` | Wait for ANY selector to appear |
| `click` | `selector`, `index`, `force`, `wait_after` | Click element |
| `extract` | `fields` or `selector_ids` | Extract multiple named fields |
| `extract_single` | `field`, `selector_id` | Extract one field |
| `extract_and_transform` | `fields` (with inline `transform`) | Extract + transform in one step |
| `transform_value` | `field`, `transformations` | Apply transforms (strip, replace, regex_extract, etc.) |
| `process_images` | `field`, `deduplicate` | Filter, upgrade quality, deduplicate image URLs |
| `login` | (reads from `login:` block or params) | Execute login workflow |
| `check_no_results` | `fallback_empty_search_selector` | Detect "no results" state |
| `conditional_skip` | `if_flag: no_results_found` | Skip remaining steps if flag is set |
| `conditional` | `condition_type`, `then`, `else` | Branch on field/element existence |
| `verify_sku_on_page` | `sku_field`, `strict` | Verify SKU string appears in page HTML |
| `validate_search_result` | `required_selectors` | Verify search result structure |

### Transform Types (for `transform_value` and `extract_and_transform`)

| Type | Params |
|------|--------|
| `replace` | `pattern` (regex), `replacement` |
| `strip` | `chars` (optional) |
| `lower` | — |
| `upper` | — |
| `title` | — |
| `regex_extract` | `pattern`, `group` (default=1) |
| `prefix` | `value` |
| `suffix` | `value` |
| `default` | `value` (if result is empty) |

---

## Login Block (`login: LoginConfig`)

Only include if the site requires authentication. `requires_login` is inferred
automatically from the presence of this block — do NOT set it manually.

```yaml
login:
  url: https://vendor.com/login
  timeout: 60                   # seconds to wait for login success indicator
  submit_button: "#submit"
  username_field: "#email"
  password_field: "#password"
  success_indicator: ".logout-link"
  failure_indicators:
    selectors:
      - ".error-message"
    texts:
      - "invalid username or password"
    url_contains:
      - "/login"
```

---

## Validation Block (`validation: ValidationConfig`)

```yaml
validation:
  no_results_selectors:
    - ".no-results"
    - "//h2[contains(., '0 items')]"
  no_results_text_patterns:
    - "no results found"
    - "0 items"
    - "your search returned no results"
    # ⚠️ All entries must be strings. Numbers will be auto-coerced by the parser.
```

---

## Anti-Detection Block (`anti_detection: AntiDetectionConfig`)

```yaml
anti_detection:
  enable_rate_limiting: false
  rate_limit_min_delay: 1
  rate_limit_max_delay: 3
  enable_human_simulation: false
  enable_session_rotation: false
  session_rotation_interval: 100
  enable_blocking_handling: false
  enable_captcha_detection: false
  max_retries_on_detection: 3
  captcha_selectors: []
  blocking_selectors: []
```

---

## Normalization (`normalization: [NormalizationRule, ...]`)

Normalization rules clean up extracted field values. Two formats are supported:

### (Preferred) New `rules` format — list of rule objects:

```yaml
normalization:
  - field: Name
    rules:
      - type: strip
      - type: title_case
  - field: Price
    rules:
      - type: regex_extract
        pattern: "\\$([0-9.]+)"
```

Each rule in `rules` has:
- `type` — rule type (see supported types below)
- Additional params as needed (e.g., `pattern`, `replacement`, `prefix`, `suffix`)

### Legacy `action` + `params` format (backward compatible):

```yaml
normalization:
  - field: Name
    action: title_case
    params: {}
  - field: Price
    action: regex_extract
    params:
      pattern: "\\$([0-9.]+)"
      group: 0
```

Both formats are accepted. The `rules` format is preferred because it supports chaining
multiple transforms per field in a single entry.

### Supported rule types (both formats)

| Type | Params | Description |
|------|--------|-------------|
| `strip` / `trim` | — | Remove leading/trailing whitespace |
| `lowercase` | — | Convert to lowercase |
| `uppercase` | — | Convert to uppercase |
| `title_case` | — | Convert to Title Case |
| `remove_prefix` | `prefix` (str) | Remove a leading prefix |
| `remove_suffix` | `suffix` (str) | Remove a trailing suffix |
| `replace` | `old`, `new` | Simple string replacement |
| `regex_replace` | `pattern`, `replacement` | Regex-based replacement |
| `regex_extract` | `pattern`, `group` (default=0) | Extract match group from value |
| `extract_weight` | — | Parse weight string, convert to lbs |

---

## Proxy Config (`proxy_config: ProxyConfig`)

```yaml
proxy_config:
  proxy_url: "http://proxy.example.com:8080"
  proxy_list: []
  rotation_strategy: "off"      # enum: per_request | per_site | off
```

---

## OCR Config (`ocr_config: OcrConfig`)

```yaml
ocr_config:
  max_images: 2                 # Range: 1-10
  language: "eng"
  preprocess: true
```

---

## Credential References (`credential_refs: [str, ...]`)

```yaml
credential_refs:
  - vendor_slug
```

List of credential IDs fetched at runtime from the coordinator API.
Never embed credentials in the YAML.

---

## Test SKUs

```yaml
test_skus: []                   # Real SKUs for functional testing
fake_skus: []                   # SKUs expected to return no results
edge_case_skus: []              # Boundary/edge-case SKUs
```

---

## Test Assertions (`test_assertions: [SkuAssertion, ...]`)

```yaml
test_assertions:
  - sku: "072705115310"
    expected:
      Name: "Fromm Gold Large Breed Dog 30 lb"
      Brand: "FROMM FAMILY FOODS LLC"
      Price: "$59.99"
```

**Fields supported in `expected`:**
- `name` / `Name` — Product name
- `brand` / `Brand` — Brand name

- `image` / `Image URLs` — Primary image URL
- Any field name matching a selector `name`

`null` values mean the field should be absent/empty.

---

## Runtime Settings

```yaml
timeout: 30                     # Range: 1-300 seconds. Default: 30
retries: 3                      # Range: 0-10. Default: 3
image_quality: 50               # Range: 0-100. Default: 50
```

---

## HTTP Status Monitoring (`http_status: HttpStatusConfig`)

```yaml
http_status:
  enabled: true
  expected_status: 200
  fail_on_error: true
  error_codes: [404, 500, 503]
```

---

## Common Anti-Patterns

- ❌ Do NOT add `requires_login` as a top-level field
- ❌ Do NOT embed credentials in the YAML (use `credential_refs`)
- ❌ Do NOT hardcode vendor selectors in Python (YAML only)
- ❌ Do NOT use `print()` (use structured logger)
- ❌ Do NOT use bare `except:`
