# Action Types Comparison: BayStateApp vs BayStateScraper

**Generated:** 2026-02-12  
**Task:** task-12-action-sync  

---

## Summary

| Metric | Count |
|--------|-------|
| Actions in App (action-definitions.ts) | 20 |
| Handlers in Scraper | 33 |
| **In Sync** | 17 |
| **Missing in Scraper** | 3 |
| **Extra in Scraper** | 16 |

---

## Actions Defined in BayStateApp

| Action Type | Category | Description |
|-------------|----------|-------------|
| `navigate` | navigation | Navigate to a URL |
| `wait` | navigation | Wait for a fixed duration |
| `wait_for` | navigation | Wait until an element appears |
| `click` | interaction | Click an element |
| `conditional_click` | interaction | Click only if element exists |
| `input_text` | interaction | Type text into input |
| `scroll` | interaction | Scroll page or element |
| `login` | interaction | Execute login flow |
| `execute_script` | interaction | Run JavaScript |
| `extract` | extraction | Extract data using selectors |
| `extract_and_transform` | extraction | Extract with inline transforms |
| `transform_value` | transform | Transform extracted value |
| `process_images` | transform | Filter/upgrade image URLs |
| `combine_fields` | transform | Merge fields using format string |
| `parse_weight` | transform | Parse/normalize weight |
| `extract_from_json` | transform | Parse JSON from string |
| `check_no_results` | validation | Detect "no results" state |
| `verify` | validation | Verify page content |
| `conditional_skip` | flow | Stop if flag set |
| `conditional` | flow | If/then/else branching |

---

## Action Handlers in BayStateScraper

### Handler Files and Registered Actions

| Handler File | Registered Actions |
|--------------|-------------------|
| `browser.py` | `configure_browser` |
| `click.py` | `click` |
| `conditional.py` | `conditional` |
| `wait.py` | `wait` |
| `navigate.py` | `navigate` |
| `extract.py` | `extract_single`, `extract_multiple`, `extract` |
| `validation.py` | `validate_http_status`, `check_no_results`, `conditional_skip`, `scroll`, `conditional_click`, `verify` |
| `wait_for.py` | `wait_for` |
| `input.py` | `input_text` |
| `transform.py` | `transform_value` |
| `extract_transform.py` | `extract_and_transform` |
| `script.py` | `execute_script` |
| `login.py` | `login` |
| `image.py` | `process_images` |
| `verify.py` | `verify_value`, `filter_brand` |
| `table.py` | `parse_table` |
| `sponsored.py` | `check_sponsored` |
| `json.py` | `extract_from_json` |
| `combine.py` | `combine_fields` |
| `weight.py` | `parse_weight` |
| `anti_detection.py` | `detect_captcha`, `handle_blocking`, `rate_limit`, `simulate_human`, `rotate_session` |

---

## Mismatch Analysis

### Actions in App but NOT in Scraper (3)

| Action | Impact | Notes |
|--------|--------|-------|
| `wait` | LOW | Handler exists in `wait.py` as `@ActionRegistry.register("wait")` - **IN SYNC** |
| `scroll` | LOW | Handler exists in `validation.py` as `@ActionRegistry.register("scroll")` - **IN SYNC** |
| `conditional_click` | LOW | Handler exists in `validation.py` as `@ActionRegistry.register("conditional_click")` - **IN SYNC** |

**Verdict:** All App actions are actually present in Scraper. They were placed in `validation.py` instead of separate files.

### Actions in Scraper but NOT in App (16)

| Action | Handler File | Purpose | Recommendation |
|--------|--------------|---------|----------------|
| `configure_browser` | `browser.py` | Dynamic browser settings | Consider adding to App for advanced users |
| `extract_single` | `extract.py` | Extract one value (internal) | Internal - no App UI needed |
| `extract_multiple` | `extract.py` | Extract list (internal) | Internal - no App UI needed |
| `validate_http_status` | `validation.py` | HTTP status validation | Consider adding to App |
| `verify_value` | `verify.py` | Verify result field value | Consider adding to App |
| `filter_brand` | `verify.py` | Remove brand from name | Consider adding to App |
| `parse_table` | `table.py` | Parse HTML table | **Should add to App** |
| `check_sponsored` | `sponsored.py` | Detect sponsored content | **Should add to App** |
| `detect_captcha` | `anti_detection.py` | CAPTCHA detection | Consider for debug/testing mode |
| `handle_blocking` | `anti_detection.py` | Handle blocking pages | Internal/debug use |
| `rate_limit` | `anti_detection.py` | Apply rate limiting | Internal - runner manages this |
| `simulate_human` | `anti_detection.py` | Human behavior simulation | Internal - runner manages this |
| `rotate_session` | `anti_detection.py` | Force session rotation | Internal - runner manages this |

### Key Findings

1. **All 20 App actions have corresponding Scraper handlers** - The sync is actually complete for the UI-exposed actions.

2. **13 Scraper-only actions exist** - These are mostly:
   - Internal/helper actions (`extract_single`, `extract_multiple`)
   - Anti-detection features (5 actions for bot evasion)
   - Validation utilities (`validate_http_status`, `verify_value`, `filter_brand`)
   - Data extraction helpers (`parse_table`, `check_sponsored`)

3. **Most critical gap:** `parse_table` and `check_sponsored` are production-ready features not exposed in the App UI.

4. **Anti-detection actions** (`detect_captcha`, `handle_blocking`, `rate_limit`, `simulate_human`, `rotate_session`) are designed for internal use by the runner and don't need UI exposure in normal operation.

---

## Recommendations

### Priority: Low
- All core actions are in sync between App and Scraper

### Priority: Medium  
1. **Add `parse_table` to App** - Useful for scraping spec tables
2. **Add `check_sponsored` to App** - Useful for filtering ad content
3. **Add `validate_http_status` to App** - Useful for debugging scrapers

### Priority: Low
- Anti-detection actions can remain Scraper-only (internal runner use)
- `extract_single`/`extract_multiple` are internal implementations covered by `extract`

---

## Verification

```bash
# App actions count
grep -E "^\s+\w+: {" BayStateApp/lib/admin/scrapers/action-definitions.ts | wc -l
# Output: 20

# Scraper handlers count
grep -r "@ActionRegistry.register" BayStateScraper/scrapers/actions/handlers/*.py | wc -l
# Output: 33
```

---

*Report generated by task-12-action-sync*
