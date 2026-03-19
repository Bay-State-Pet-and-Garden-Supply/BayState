---
name: scraper-config-builder
description: Skill for building, debugging, and testing BayState scraper configuration YAML files. Use when you need to create a new scraper, update selectors, or debug a failing scraper by ensuring all edge cases (results, no results, timeouts) are handled.
---

# Scraper Config Builder

This skill provides the workflow and guidelines for creating, debugging, and comprehensively testing scraper configuration files (YAML) for the BayStateScraper project.

## Core Principles

1. **Timeouts are Failures**: A scraper timing out waiting for a selector is considered a hard failure. Scrapers must handle all possible outcomes (e.g., success, "no results", captcha) gracefully without timing out.
2. **Comprehensive Testing**: You must test against all scenarios:
   - **Standard SKUs** (expected to find results)
   - **Fake/Invalid SKUs** (expected to trigger "no results" handling)
   - **Edge Cases** (multiple results, generic errors, site-specific anomalies)
3. **Use the Right Tools**: Use the local CLI runner to test configurations iteratively, and leverage the `agent-browser` skill to manually explore websites and discover robust selectors.

## Workflow: Building & Debugging Scrapers

### 1. Exploration & Selector Discovery
When building a new scraper or fixing an existing one, first understand the website's structure.
- **Use the `agent-browser` skill** or `web_fetch` to navigate to the target site, perform searches, and inspect the DOM.
- Identify reliable selectors for:
  - Search inputs and submit buttons (if using interactive workflow).
  - Search result validation (`#productTitle`, `.s-result-item`, etc.).
  - **No Results** indicators (`#noResultsTitle`, `.s-no-results-filler`, etc.).
  - Product data fields (Name, Brand, Images, Price, etc.).

### 2. Configuration Structure
Scrapers are defined in YAML files (e.g., `apps/scraper/scrapers/configs/<supplier>.yaml`). A standard config includes:

- **Metadata**: `name`, `base_url`, `timeout`
- **Selectors**: List of fields to extract (e.g., `Name`, `Brand`, `Images`).
- **Workflows**: The step-by-step actions to perform.
- **Validation**: Rules for handling empty results or errors.
- **Test SKUs**: Lists of `test_skus`, `fake_skus`, and `edge_case_skus`.

#### Example Workflow Snippet
```yaml
workflows:
  - action: navigate
    params:
      url: https://www.example.com/search?q={{sku}}
  - action: wait_for
    params:
      timeout: 30
      selector:
        - ".product-title" # Success path
        - ".no-results"    # Failure path (No Results)
  - action: check_no_results
  - action: conditional_skip
    params:
      if_flag: no_results_found
  - action: extract_and_transform
    params:
      fields:
        - name: Name
          selector: ".product-title"
          attribute: text
```

### 3. Local CLI Testing
You must use the local CLI runner to empirically verify the scraper configuration against real target sites. **Do not assume selectors work without testing.**

**Command:**
```bash
cd apps/scraper
uv run python runner.py --local --config scrapers/configs/<your_scraper>.yaml --sku <TEST_SKU> --no-headless
```
*(Note: Omit `--sku` to automatically run all `test_skus` defined in the YAML file).*

**Testing Requirements:**
1. **Positive Test**: Run with a valid SKU. Verify that all required fields are extracted successfully.
2. **Negative Test (No Results)**: Run with a fake SKU (e.g., `xyzabc123notexist456`). **Crucial:** The scraper must gracefully detect the "no results" state and exit, rather than hanging and timing out. If it times out, the `wait_for` selectors are missing the "no results" element.
3. **Edge Case Test**: Run with edge case SKUs if applicable to ensure robust handling.

### 4. Handling Timeouts & No Results
If the local CLI run results in a `TimeoutError`:
1. The `wait_for` action likely didn't match any provided selectors.
2. Use `agent-browser` to reproduce the exact search that timed out.
3. Identify what is actually on the screen (e.g., a "Product discontinued" message, a Captcha, or a slightly different "No results" banner).
4. Add the newly discovered selector to the `wait_for` list and the `validation.no_results_selectors` block in the YAML.

### Summary of Commands
- **Investigate Site**: `activate_skill` -> `agent-browser` (e.g., to open `<base_url>` and inspect the DOM).
- **Run Local Scraper**: `uv run python runner.py --local --config scrapers/configs/<name>.yaml --sku <sku> --debug`
- **Full Config Test**: `uv run python runner.py --local --config scrapers/configs/<name>.yaml` (Runs all `test_skus`).