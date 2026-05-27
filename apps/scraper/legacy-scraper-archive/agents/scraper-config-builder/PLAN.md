# Plan: `scraper-config-builder` Skill (Revised v2)

## Objective
Create a pi skill that automates building working BayState scraper YAML configs using
**playwright-cli** (Playwright-based, same engine as the scraper) for page discovery,
with end-to-end TDD via `runner.py --test-mode`.

---

## 1. Skill Identity

| Field | Value |
|-------|-------|
| **name** | `scraper-config-builder` |
| **description** | Build working BayState scraper YAML configs from vendor URLs. Use when the user says "build a scraper for X", "new scraper config", "add vendor Y", "scrape site Z", or needs to create/edit a `scrapers/configs/*.yaml` file. Triggers on any request to create, update, fix, or port a scraper configuration. Uses playwright-cli (Playwright-based browser automation) to discover selectors, writes the YAML config, bootstraps test_assertions from a dry-run extraction, and runs `--test-mode` to verify. Repeats until all assertions pass. |
| **compatibility** | Requires `playwright-cli` (Playwright-based CLI) and BayState scraper repo (`apps/scraper`). |

---

## 2. Core Workflow (The Skill Instructions)

### Phase A: Discovery (playwright-cli)
Given a vendor name + base URL + 1-3 example product URLs/SKUs:

1. **Open example PDP** with `playwright-cli open <url>`.
2. **Snapshot** the page (`playwright-cli snapshot`) → understand layout, headings, images, prices.
3. **Mine selectors** via `playwright-cli eval`:
   - Discover `data-testid`, `data-sku`, `data-product-id`, class/id patterns.
   - Identify product name, brand, price, image, UPC/ItemNumber, description.
   - Test each candidate selector with `playwright-cli eval "document.querySelectorAll('...').length"`.
4. **Detect workflow pattern**:
   - Direct PDP (navigate → wait → extract)
   - Search → click → PDP (navigate search URL → wait → click → wait → extract)
   - Login required? (check for login wall, gated pricing)
   - Anti-detection needs? (Cloudflare, bot checks)
5. **Detect no-results pattern** (search a fake SKU, capture the "not found" state).
6. **Use same browser engine as scraper** — playwright-cli uses Playwright, eliminating cross-browser mismatch.

### Phase B: Template-Based Config Generation
Instead of auto-detecting workflow patterns, use **3 pre-built templates**:

1. **Direct PDP** — navigate to product URL → wait_for → extract
2. **Search → Click → PDP** — navigate to search URL → wait_for results → click first result → wait_for PDP → extract
3. **Login → Search → PDP** — login → navigate → wait_for → extract

Ask the user (or infer from URL heuristics):
- "Does the site have direct product URLs?" → Template 1
- "Do you search for SKUs and click results?" → Template 2
- "Is login required?" → Template 3

Platform-specific selector libraries (Shopify, BigCommerce, Magento, WooCommerce) seed initial guesses before discovery.

Write `scrapers/configs/{vendor}.yaml` with:
- `schema_version: "1.0"`
- `name`, `display_name`, `base_url`
- `selectors:` list with `name`, `selector`, `attribute`, `multiple`, `required`, `fallback_selectors`
- `workflows:` from the selected template, filled with discovered selectors
- `validation:` with `no_results_selectors` and `no_results_text_patterns`
- `test_skus:` and `fake_skus:` for broader coverage
- `credential_refs:` if login detected
- `anti_detection:` block (default all false)
- `normalization:` rules (trim, strip, regex_replace) if transforms detected

### Phase C: Dry-Run Assertion Bootstrap
Break the circular dependency:

1. Generate a **loose initial config** with candidate selectors.
2. Run `python runner.py --local --config scrapers/configs/{vendor}.yaml --sku REAL_SKU --output dry_run.json` (NOT `--test-mode`).
3. Read `dry_run.json`, extract actual field values (Name, Brand, Price, Image, etc.).
4. Write these actual values into `test_assertions` as the `expected` baseline.
5. Now run `--test-mode` to verify the config is **consistent**.

This makes `test_assertions` a **regression test** — it will catch when the vendor changes their site.

### Phase D: TDD Verification Loop
1. Run `python runner.py --local --config scrapers/configs/{vendor}.yaml --test-mode`.
2. Parse JSON output / console summary.
3. If any assertion **fails**:
   - Read the failure diff (expected vs actual).
   - Use `playwright-cli` to re-inspect the page at the failing selector.
   - Update selector, fallback, or transform in the YAML.
   - Re-run `--test-mode`.
4. If **passes** → run with `--no-headless` once for visual sanity check (optional).
5. Run `ruff check .` and `python -m pytest tests/unit/models/test_config_assertions.py` to ensure no regressions.

### Phase E: Handoff
- Present the final YAML.
- Summarize selectors discovered, workflow pattern used, test results (pass/fail count).
- Flag auto-generated assertions: "These assertions were bootstrapped from the current page structure — verify they look correct."
- Advise: publish via BayStateApp Admin UI (local YAML is deprecated for production).

---

## 3. Skill File Structure

```
scraper-config-builder/
├── SKILL.md                 # Main instructions
├── scripts/
│   ├── discover.py          # playwright-cli wrapper: open, snapshot, mine selectors
│   ├── validate_config.py   # Run ScraperConfig.model_validate on generated YAML
│   └── run_test_loop.py     # Wrapper around runner.py --test-mode with retry logic
├── references/
│   ├── yaml_schema.md       # Full schema reference (from scout research)
│   ├── action_handlers.md   # Action type quick-reference
│   ├── selector_patterns.md # Platform-specific selector libraries
│   └── workflow_templates.md # 3 workflow templates (Direct PDP, Search→Click, Login)
└── evals/
    └── evals.json           # Test prompts for skill evaluation
```

---

## 4. Bundled Scripts

### `scripts/discover.py`
Orchestrates playwright-cli commands for a given URL:
- `open`, `snapshot`, `eval` for data attributes, `eval` for selector validation (`querySelectorAll.length`).
- Uses `--raw` flag for structured JSON output.
- Outputs JSON with discovered selectors, workflow pattern recommendation, no-results indicators.
- **Same Playwright engine as scraper** — no cross-browser mismatch.

### `scripts/validate_config.py`
Loads generated YAML and runs `ScraperConfig.model_validate()` to catch Pydantic errors before testing.

### `scripts/run_test_loop.py`
Runs `runner.py --test-mode`, parses output, and if failures found:
1. Emits a structured diff JSON.
2. Re-runs playwright-cli to inspect the failing selector.
3. Suggests selector/fallback/transform fixes.
4. Loops until pass or max retries.

---

## 5. Test Cases (Eval Prompts)

| ID | Prompt | Expected |
|----|--------|----------|
| 1 | "Build a scraper for PetEdge. Base URL is https://www.petedge.com. Example product: https://www.petedge.com/product/ABC123" | Working `petedge.yaml` with selectors for Name, Brand, Price, Image. `test-mode` passes. |
| 2 | "Add a new scraper for a gardening supply site: https://www.gardeners.com, product page https://www.gardeners.com/p/GW-12345" | Working `gardeners.yaml` (or update existing). Uses Search→Click template if needed. |
| 3 | "Fix the price selector in scrapers/configs/phillips.yaml — it's returning empty" | Reads existing YAML, uses playwright-cli to inspect Phillips page, updates selector + fallback, re-runs test mode, asserts pass. |
| 4 | "Port amazon.yaml to use extract_and_transform instead of separate extract + transform_value steps" | Refactors YAML, validates, test mode still passes. |
| 5 | "Create a scraper config for a login-required wholesale site" | Includes `login:` block, `credential_refs`, uses Login→Search template. |

---

## 6. Integration Points

| System | How |
|--------|-----|
| BayState scraper runner | Calls `python runner.py --local --config ... --test-mode` |
| BayState config parser | Uses `ScraperConfigParser.load_from_file()` for validation |
| playwright-cli | Shell commands: `open`, `snapshot`, `eval`, `--raw` for structured output |
| pytest (existing) | Runs `tests/unit/models/test_config_assertions.py` after config changes |

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Site blocks headless | `--no-headless` toggle in discover script; anti_detection block scaffolding |
| Flaky selectors | Always generate 2-3 `fallback_selectors` per field |
| Test assertions out of sync | Dry-run bootstrap ensures assertions match current page structure |
| Login-required sites | Skill detects login wall, asks user for credential_refs, generates login block |
| Config already exists | Skill reads existing config, diffs changes, asks user before overwrite |
| Over-simplified configs | Template-based workflows + platform heuristics cover 70-80% of real configs; flag remaining complexity for human refinement |

---

## 8. Next Steps (Skill-Creator Process)

1. **Draft SKILL.md** from this plan.
2. **Write bundled scripts** (`discover.py`, `validate_config.py`, `run_test_loop.py`).
3. **Write references** (`selector_patterns.md`, `workflow_templates.md`).
4. **Write evals.json** with 5 test prompts.
5. **Run iteration 1**: spawn with-skill + without-skill subagents on eval prompts.
6. **Grade & review**: use `eval-viewer/generate_review.py`.
7. **Iterate** based on feedback.
8. **Optimize description** for triggering accuracy.
9. **Package** as `.skill` file.
