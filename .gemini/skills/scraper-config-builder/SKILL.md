---
name: scraper-config-builder
description: Skill for building, debugging, and testing BayState scraper configuration YAML files. Use when you need to create a new scraper, update selectors, or debug a failing scraper by ensuring all edge cases (results, no results, timeouts) are handled.
---

# Scraper Config Builder

This skill provides the workflow and guidelines for creating, debugging, and comprehensively testing scraper configuration files (YAML) for the BayStateScraper project.

## Core Principles

1. **Timeouts are Failures**: A scraper timing out waiting for a selector is a hard failure. Scrapers must handle all outcomes (success, "no results", login required, captcha) gracefully.
2. **Comprehensive Testing**: You must test against all scenarios:
   - **Standard SKUs** (expected to find results)
   - **Fake/Invalid SKUs** (expected to trigger "no results" handling)
   - **Edge Cases** (multiple results, generic errors, site-specific anomalies)
3. **Exploration is Mandatory**: Never assume selectors work without verifying them on the live site.

## Workflow: Building & Debugging Scrapers

### 1. Exploration & Selector Discovery
First, understand the website's structure and behavior (especially for anonymous vs. logged-in users).
- **Tool Selection**:
  - **Playwright MCP (Preferred)**: Use Playwright-based exploration for interactive discovery.
  - **`web_fetch`**: Use for quick checks of static content or status codes.
  - **Local CLI `--debug`**: Run the scraper locally and inspect `debug_dump.html` if a timeout occurs.
- **Identify Critical States**:
  - **Login Required**: Does the site hide data (e.g., price, description) for guest users?
  - **No Results**: What specific text or element appears for an invalid SKU?
  - **Validation**: What element uniquely identifies a successful product match?

### 2. Configuration Structure
Scrapers are defined in YAML files (`apps/scraper/scrapers/configs/<supplier>.yaml`).

#### Key Validation Blocks
```yaml
validation:
  no_results_selectors:
    - "//h2[contains(text(), 'No results found')]"
    - ".no-results"
    - "span.no-results-found"
  no_results_text_patterns:
    - "your search returned no results"
    - "no products were found"
```

#### Example Robust Workflow
```yaml
workflows:
  - action: navigate
    params:
      url: https://www.example.com/search?q={{sku}}
  - action: wait_for
    params:
      timeout: 30
      selector:
        - ".product-title"           # Success
        - ".no-results-container"    # Failure (No Results)
        - ".login-prompt"            # Failure (Login Required)
  - action: check_no_results
  - action: conditional_skip
    params:
      if_flag: no_results_found
  - action: extract
    params:
      fields: [Name, Brand, Price]
```

### 3. Local CLI Testing
Iteratively verify the scraper configuration against real target sites.

**Command:**
```bash
cd apps/scraper
uv run python runner.py --local --config scrapers/configs/<your_scraper>.yaml --sku <TEST_SKU> --no-headless
```

**Testing Requirements:**
1. **Positive Test**: Verify all `required: true` fields are extracted for a valid SKU.
2. **Negative Test (No Results)**: Use a fake SKU (e.g., `xyzabc123`). The scraper must exit gracefully via `check_no_results`, NOT time out.
3. **Login Check**: If a site requires login, ensure `credential_refs` and `login` actions are correctly configured.

### 4. Troubleshooting Timeouts
If a `TimeoutError` occurs during `wait_for`:
1. The page likely loaded a state not covered by your `wait_for` selectors.
2. Inspect the `debug_dump.html` generated in the `apps/scraper` directory.
3. Update the `wait_for` list and `validation.no_results_selectors` with the discovered elements.

### Summary of Commands
- **Investigate Site**: `activate_skill` -> `playwright-explore-website`
- **Run Local Scraper**: `uv run python runner.py --local --config scrapers/configs/<name>.yaml --sku <sku> --debug`
- **Full Config Test**: `uv run python runner.py --local --config scrapers/configs/<name>.yaml` (Runs all `test_skus`).