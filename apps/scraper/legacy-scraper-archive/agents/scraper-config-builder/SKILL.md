---
name: scraper-config-builder
description: >
  Build BayState scraper YAML configs for vendor product catalogs. Triggers on
  "build a scraper for X", "new scraper config", "add vendor Y", "scrape site Z",
  "fix my scraper", "update selectors", or any request to create/edit a
  `scrapers/configs/*.yaml` file. Uses playwright-cli to discover selectors,
  writes YAML, bootstraps test_assertions from dry-run extraction, and runs
  `--test-mode` until all assertions pass. Extracts product details only
  (name, brand, description, images, UPC, ingredients, features, weight).
  NEVER extracts price, availability, stock, or store-specific selling data.
  Do NOT use for price comparison, stock monitoring, or inventory checks.
---

# scraper-config-builder

Build working BayState scraper YAML configs with end-to-end TDD verification.

This skill uses **playwright-cli** (Playwright-based browser automation — the same engine
BayState's scraper uses) to discover page structure and selectors. It then generates a
complete YAML config, bootstraps `test_assertions` from a dry-run extraction, and runs
`runner.py --test-mode` in a TDD loop until all assertions pass.

## Why playwright-cli?

Unlike agent-browser (Chrome/CDP), playwright-cli uses **Playwright** — the exact same
browser engine, stealth settings, and `wait_until` behavior as the BayState scraper. This
eliminates the cross-browser selector mismatch that plagues other approaches.

## Workflow Overview

```
User provides vendor info
        ↓
Phase A: DISCOVER (playwright-cli)
  - Open product page, snapshot, mine selectors
  - Detect login/anti-bot needs
  - Detect no-results patterns
        ↓
Phase B: GENERATE (template-based YAML)
  - Pick workflow template (Direct PDP / Search→Click / Login)
  - Seed selectors from platform library (Shopify/BigCommerce/etc.)
  - Fill in discovered selectors
        ↓
Phase C: BOOTSTRAP (dry-run assertions)
  - Run scraper once without --test-mode
  - Use actual extracted values as expected baseline
        ↓
Phase D: VERIFY (TDD loop)
  - Run --test-mode
  - On failure: re-inspect with playwright-cli, fix YAML, re-run
  - On pass: present final config
```

---

## Phase A: Discovery with playwright-cli

### Prerequisites
- `playwright-cli` must be installed (`npm install -g @playwright/cli`)
- The BayState scraper repo must be at `apps/scraper/`
- For all local YAML operations, set `export USE_YAML_CONFIGS=true` (required by BayState's parser)

## Login Playbook (for login-required sites)

If the site requires authentication, you MUST log in BEFORE attempting product page
discovery. The BayState scraper handles login via the `login` action + `credential_refs`,
but for discovery you need a live authenticated session.

### Step 0a: Discover login page fields

```bash
# Open the login page
playwright-cli open "https://vendor.com/login"

# Take snapshot to find form fields
playwright-cli snapshot --filename=login_snapshot.yaml

# Read the snapshot to identify:
# - Username field ref (e.g., e1)
# - Password field ref (e.g., e2)
# - Submit button ref (e.g., e3)
# - Any CAPTCHA or 2FA elements
```

### Step 0b: Log in and save session state

```bash
# Fill credentials (ask user for them)
playwright-cli fill e1 "USERNAME_FROM_USER"
playwright-cli fill e2 "PASSWORD_FROM_USER"

# Submit the form
playwright-cli click e3

# Wait for navigation or success indicator
playwright-cli wait ".account-menu"  # or whatever indicates logged-in state

# Save the authenticated session state (cookies, localStorage)
playwright-cli state-save auth.json

# Verify login worked by checking for logout link or account menu
playwright-cli --raw eval "document.querySelector('.logout-link') !== null"
```

### Step 0c: Reuse saved session for discovery

```bash
# Open browser with saved auth state
playwright-cli open "https://vendor.com/product/SKU123" --state=auth.json

# Now you can discover selectors on authenticated pages
playwright-cli snapshot --filename=product_page.yaml
```

### Important notes for login sites
- **Always save state after login.** Re-authenticating for every discovery command
  is slow and may trigger rate limits or CAPTCHAs.
- **Session expiry:** Saved state may expire (cookie timeout). If the site returns
  login page during discovery, re-run the login sequence.
- **CAPTCHA handling:** If the login page has CAPTCHA, the user must solve it manually.
  Instruct the user: "The login page has a CAPTCHA. Please solve it in the browser
  window, then tell me to continue."
- **2FA/MFA:** If the site uses 2FA, ask the user for the code after they enter
  username/password. The sequence becomes:
  ```bash
  playwright-cli fill e1 "username"
  playwright-cli fill e2 "password"
  playwright-cli click e3
  # Wait for 2FA page
  playwright-cli wait "[name='otp']"
  # Ask user for 2FA code
  playwright-cli fill e4 "CODE_FROM_USER"
  playwright-cli click e5
  playwright-cli state-save auth.json
  ```

---

### Step 1: Open the page
```bash
playwright-cli open "https://vendor.com/product/SKU123"
```

If you saved auth state in Step 0c, reuse it:
```bash
playwright-cli open "https://vendor.com/product/SKU123" --state=auth.json
```

### Step 2: Snapshot for structure
```bash
playwright-cli snapshot --filename=page.yaml
```

Read the snapshot to identify:
- Product title heading (Name)
- Brand indicators
- Description areas
- Image elements
- SKU/UPC displays
- Ingredients / Features lists
- ⚠️  Do NOT extract price, availability, stock, or store-specific data

### Step 3: Mine selectors with eval

**Discover data attributes:**
```bash
playwright-cli --raw eval "
  JSON.stringify({
    testids: [...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')),
    skus: [...document.querySelectorAll('[data-sku]')].map(e => e.getAttribute('data-sku')),
    productIds: [...document.querySelectorAll('[data-product-id]')].map(e => e.getAttribute('data-product-id')),
    classes: [...new Set([...document.querySelectorAll('*')].map(e => e.className).filter(Boolean))].slice(0,50)
  })
"
```

**Test candidate selectors:**
```bash
playwright-cli --raw eval "document.querySelectorAll('h1').length"
playwright-cli --raw eval "document.querySelectorAll('.brand').length"
playwright-cli --raw eval "document.querySelectorAll('[data-testid=\"product-title\"]').length"
```

**Extract sample values:**
```bash
playwright-cli --raw eval "document.querySelector('h1')?.textContent?.trim()"
playwright-cli --raw eval "document.querySelector('.brand')?.textContent?.trim()"
playwright-cli --raw eval "document.querySelector('.description')?.textContent?.trim()"
```

### Step 4: Detect workflow pattern

Ask the user (or infer):
- **Direct PDP**: Product URL contains SKU, page loads directly → Template 1
- **Search→Click**: SKU search returns results list, must click to PDP → Template 2
- **Login required**: Gated pricing, login wall → Template 3

URL heuristics:
- `/products/`, `/p/` paths → often Direct PDP
- Search URLs with `?q=`, `?k=`, `?search=` → often Search→Click
- Wholesale/B2B domains → often Login required

### Step 5: Detect no-results pattern

Search a fake SKU that definitely doesn't exist:
```bash
playwright-cli goto "https://vendor.com/search?q=FAKE12345XYZ"
playwright-cli snapshot --filename=no_results.yaml"
```

Capture:
- CSS selectors for "no results" messages
- Text patterns ("no results found", "0 items", etc.)

---

## Phase B: Generate YAML Config

### Platform Selector Libraries

Before running discovery, check if the site matches a known platform. Seed selectors from
the platform library, then validate/refine with playwright-cli.

Read `references/selector_patterns.md` for the full library. Common platforms:

| Platform | Name | Image | Brand |
|----------|------|-------|-------|
| Shopify | `h1` or `[data-testid='product-title']` | `.product-media img` | `.vendor` or `[data-vendor]` |
| BigCommerce | `h1.productView-title` | `[data-image-gallery-main-image]` | `.productView-brand` |
| Magento | `.page-title` | `.fotorama__stage img` | `.product-brand` |
| WooCommerce | `.product_title` | `.woocommerce-product-gallery img` | N/A |

**Important:** We do NOT extract price, availability, stock, or other store-specific data. BayState manages pricing and availability independently.

### Workflow Templates

Read `references/workflow_templates.md` for full templates. Summary:

**Template 1: Direct PDP**
```yaml
workflows:
  - action: navigate
    params:
      url: "{base_url}/products/{sku}"
  - action: wait_for
    params:
      selector: ["h1", ".product-title", "[data-testid='product-title']"]
  - action: extract
    params:
      fields: [Name, Brand, Image URLs, Description]
  - action: process_images
    params:
      field: Image URLs
```

**Template 2: Search → Click → PDP**
```yaml
workflows:
  - action: navigate
    params:
      url: "{base_url}/search?q={sku}"
  - action: wait
    params:
      seconds: 2
  - action: wait_for
    params:
      selector: [".search-result", ".product-card", ".no-results"]
  - action: check_no_results
  - action: conditional_skip
    params:
      if_flag: no_results_found
  - action: extract_single
    params:
      field: search_result_link
  - action: click
    params:
      selector: "{{search_result_link}}"
  - action: wait_for
    params:
      selector: ["h1", ".product-title"]
  - action: extract
    params:
      fields: [Name, Brand, Image URLs, Description]
```

**Template 3: Login → Search → PDP**
```yaml
# Include login block and credential_refs
# Then use Template 1 or 2
```

### ⚠️  REQUIRED CHECKLIST — Every config MUST have these

Before finishing any config, verify ALL of the following are present.
A missing item means the config is incomplete.

| # | Required Item | Why | Check |
|---|--------------|-----|-------|
| 1 | `schema_version: "1.0"` | Model validation | ✅ |
| 2 | `name` (lowercase slug) | Scraper identity | ✅ |
| 3 | `base_url` | Root URL for all navigation | ✅ |
| 4 | `selectors` (≥1) | Fields to extract | ✅ |
| 5 | `workflows` (≥1) | Actions to execute | ✅ |
| 6 | `validation.no_results_selectors` | Detects missing products | ✅ |
| 7 | **`test_skus`** (≥1) | Real SKUs for functional testing | ✅ |
| 8 | **`fake_skus`** (≥1) | Non-existent SKUs for no-results validation | ✅ |
| 9 | **`test_assertions`** (≥1) | Structured expected values for TDD | ✅ |
| 10 | `fallback_selectors` on every field | Resilience against DOM changes | ✅ |

**Items 7, 8, 9 are NOT optional.** They are required for the TDD verification loop.
Without them, `runner.py --test-mode` has nothing to validate.

### YAML Structure

Always generate configs with these sections:

```yaml
schema_version: "1.0"
name: {vendor_slug}          # lowercase, no spaces
display_name: {Vendor Name}
base_url: {https://...}
scraper_type: static
use_stealth: true            # set false only if site breaks with stealth
# ⚠️  WARNING: Do NOT add `requires_login` as a top-level field.
# requires_login is inferred AUTOMATICALLY from the presence of a `login:` block.
# Adding it manually will cause the config to be silently rejected.

credential_refs: []          # populated if login required
test_skus: []                # REQUIRED: real SKUs for testing
fake_skus: []                # REQUIRED: non-existent SKUs for no-results testing
edge_case_skus: []           # boundary cases

selectors:
  - name: Name
    selector: "..."
    attribute: text
    required: true
    fallback_selectors:
      - "..."
      - "..."
  # ... more selectors

workflows:
  # ... from selected template

validation:
  no_results_selectors:
    - "..."
  no_results_text_patterns:
    - "no results found"
    - "0 items"
    # ⚠️ All entries must be strings. Numbers will be auto-coerced by the parser.

test_assertions: []          # populated in Phase C

anti_detection:
  enable_rate_limiting: false
  enable_human_simulation: false
  enable_session_rotation: false
  enable_blocking_handling: false
  enable_captcha_detection: false

normalization:              # add if transforms needed
  - field: Name
    rules:
      - type: strip
      - type: title_case

    rules:
      - type: regex_extract
        pattern: "\\$([0-9,.]+)"
# NOTE: The old `action` + `params` format (field/action/params) still works
# for backward compatibility, but `rules` format is preferred.
```

### Selector Naming Conventions
- `Name` — product title
- `Brand` — brand name

- `Image URLs` — primary images (plural, `multiple: true`)
- `UPC` — UPC/EAN code
- `ItemNumber` — vendor SKU/item number
- `Description` — product description
- `Features` — bullet points
- `Weight` — product weight
- `search_result_link` — for Search→Click template

### Fallback Selectors
**Always generate 2-3 fallback selectors per field.** Sites change class names frequently.
Example:
```yaml
- name: Name
  selector: "h1[data-testid='product-title']"
  fallback_selectors:
    - "h1"
    - ".product-title"
    - "[data-product-title]"
```

---

## Phase C: Bootstrap Test Assertions from Dry Run

This breaks the circular dependency: you can't know expected values without extracting,
and you can't extract without correct selectors.

### Step 1: Generate loose config
Write the YAML with candidate selectors (from Phase B).

### Step 2: Dry-run extraction
```bash
cd apps/scraper
export USE_YAML_CONFIGS=true
python runner.py --local --config scrapers/configs/{vendor}.yaml --sku {REAL_SKU} --output dry_run.json
```

### Step 3: Read actual values
Parse `dry_run.json` to get the actual extracted fields:
```json
{
  "data": {
    "SKU123": {
      "vendor": {
        "Name": "Acme Widget Pro",
        "Brand": "Acme",
        
        "Image URLs": ["https://..."]
      }
    }
  }
}
```

### Step 4: Write test_assertions
Use the actual values as the `expected` baseline:
```yaml
test_assertions:
  - sku: "SKU123"
    expected:
      Name: "Acme Widget Pro"
      Brand: "Acme"
      
      Image URLs: "https://..."
```

**Flag to user:** "These assertions were auto-generated from the current page structure.
Verify they look correct — they will catch regressions when the vendor changes their site."

### Step 5: Add fake SKU assertion
```yaml
  - sku: "FAKE12345XYZ"
    expected:
      Name: null
      Brand: null
```
Fake SKUs should produce empty/null results. The test mode handles this automatically.

---

## Phase D: TDD Verification Loop

### Run test mode
```bash
cd apps/scraper
export USE_YAML_CONFIGS=true
python runner.py --local --config scrapers/configs/{vendor}.yaml --test-mode
```

### Parse results
The output includes:
```
SKU: SKU123 - ✅ PASSED
SKU: FAKE12345XYZ - ✅ PASSED

FINAL SCORE: 2/2 (100.0%)
```

Or on failure:
```
SKU: SKU123 - ❌ FAILED
  Failures:
  
        Expected: $29.99
        Actual:   ""

FINAL SCORE: 1/2 (50.0%)
```

### On failure: inspect and fix

1. **Identify the failing field** (e.g., `Brand` returning `""`).
2. **Re-inspect with playwright-cli:**
   ```bash
   playwright-cli open "https://vendor.com/product/SKU123"
   playwright-cli --raw eval "document.querySelector('.price')?.outerHTML"
   playwright-cli --raw eval "document.querySelectorAll('.price, [data-price], .product-price').length"
   ```
3. **Determine the fix:**
   - Selector doesn't match? → Update selector or add fallback
   - Element exists but attribute is wrong? → Change `attribute: text` to `attribute: data-brand`
   - Value has extra text? → Add `transform_value` with `strip` or `regex_extract` (or use normalization rules)
   - Element loads late? → Add `wait_for` before `extract`
4. **Update the YAML** and re-run `--test-mode`.
5. **Loop until all assertions pass.**

### Max retries
If the loop doesn't converge after 5 iterations, **stop and ask the user**.
Some sites require human judgment (complex conditionals, dynamic loading, anti-bot).

---

## Phase E: Validation & Handoff

### Run config validation
```bash
cd apps/scraper
export USE_YAML_CONFIGS=true
python scripts/validate_config.py scrapers/configs/{vendor}.yaml
```

### Run existing tests
```bash
cd apps/scraper
export USE_YAML_CONFIGS=true
python -m pytest tests/unit/models/test_config_assertions.py -v
```

### Present the final config
```
✅ Scraper config generated: scrapers/configs/{vendor}.yaml

Workflow pattern: Direct PDP
Selectors discovered:
  - Name: h1[data-testid='product-title'] (fallback: h1, .product-title)
 [data-price] (fallback: .price)
  - Image URLs: .product-media img (multiple: true)

Test results:
  - SKU123: ✅ PASSED
  - FAKE12345XYZ: ✅ PASSED

⚠️  Note: test_assertions were bootstrapped from the current page.
     Please verify expected values look correct before publishing.

Next step: Publish via BayStateApp Admin UI (local YAML is deprecated for production).
```

---

## Handling Edge Cases

### Login-required sites
1. Ask user for `credential_refs` ID (e.g., `phillips`, `orgill`).
2. Generate `login:` block with:
   - `url` — login page URL
   - `username_field`, `password_field` — discovered via playwright-cli
   - `submit_button` — discovered via playwright-cli
   - `success_indicator` — selector that appears after login
   - `failure_indicators` — selectors/texts/urls for failed login
3. The scraper will automatically detect that login is required because the `login:` block is present.
   **⚠️  NEVER add `requires_login: true` to the YAML. It is not a real field.**

### Anti-bot / Cloudflare
1. Try with `use_stealth: true` (default).
2. If snapshot shows bot-blocked page, try `use_stealth: false`.
3. If still blocked, add `anti_detection` block with:
   - `enable_rate_limiting: true`
   - `enable_human_simulation: true`
   - `enable_blocking_handling: true`
4. **Warn user:** "This site has anti-bot protection. The config may need manual tuning."

### Search→Click workflows
1. Use Template 2.
2. Discover `search_result_link` selector:
   ```bash
   playwright-cli goto "https://vendor.com/search?q=SKU123"
   playwright-cli --raw eval "document.querySelector('.search-result a')?.href"
   ```
3. Add `validate_search_result` after clicking to verify SKU match.

### Transforms needed
When dry-run shows messy values:
- `"Visit the Acme Store"` → needs `regex_extract` for Brand

- `"/_thumbnail.jpg"` → needs `replace` or `prefix` for Image URLs

Generate **normalization rules** (preferred) or `transform_value` / `extract_and_transform` steps accordingly.

**Using normalization rules (preferred):**
```yaml
normalization:

    rules:
      - type: regex_extract
        pattern: "\\$([0-9,.]+)"
```

**Using workflow transform (legacy):**
```yaml
workflows:
  - action: transform_value
    params:

      transformations:
        - type: regex_extract
          pattern: "\\$([0-9,.]+)"
```

### Complex sites (conditional logic, tables, weight parsing)
If the site requires:
- `conditional` branching
- `parse_table` for specs
- `parse_weight` for weight normalization
- `process_images` with quality_patterns

**Flag to user:** "This site has complex extraction needs beyond basic selectors.
The generated config covers the core fields. You may need to add:
- conditional logic for search results
- parse_table for specification tables
- process_images for quality upgrades
"

---

## Bundled Scripts

### `scripts/discover.py`
Python script that orchestrates playwright-cli commands.
```bash
python scripts/discover.py --url https://vendor.com/product/SKU123 --output discover.json
```
Outputs structured JSON with discovered selectors, workflow recommendation, no-results indicators.

### `scripts/validate_config.py`
Validates YAML against Pydantic `ScraperConfig` model.
```bash
python scripts/validate_config.py scrapers/configs/{vendor}.yaml
```

### `scripts/run_test_loop.py`
Runs the TDD loop: test mode → parse failures → inspect → fix → re-run.
```bash
python scripts/run_test_loop.py --config scrapers/configs/{vendor}.yaml --max-retries 5
```

---

## Reference Files

- `references/selector_patterns.md` — Platform-specific selector libraries (Shopify, BigCommerce, Magento, WooCommerce)
- `references/workflow_templates.md` — Full YAML for Direct PDP, Search→Click, Login templates
- `references/yaml_schema.md` — Complete schema reference for all config fields

Load the relevant reference file based on the platform detected or template selected.
