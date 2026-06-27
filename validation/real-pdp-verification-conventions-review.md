## Review

- **Correct:** I read `plan.md`, `progress.md`, `handoff/real-pdp-verification-next-slice-guardrails.md`, `apps/scraper/AGENTS.md`, and the more specific scraper module notes. Root `plan.md` / `progress.md` are unrelated to this PDP slice; the handoff guardrails are the relevant requirements.
- **Correct:** The reviewed target files do not use `print()` in production paths. Focused grep of `apps/scraper/runner/profile_maintenance.py`, `apps/scraper/scrapers/product_url_extraction/image_candidates.py`, and `apps/scraper/scrapers/product_url_extraction/page_classifier.py` found no `print()` calls.
- **Correct:** Focused scraper tests currently pass: `tests/unit/test_page_classifier.py`, `tests/unit/test_image_candidates.py`, and `tests/unit/test_profile_maintenance.py` reported 67 passed. Focused Ruff check on the same implementation/test files emitted no findings.
- **Fixed:** None. Review-only; no source files or tests were modified.

- **Blocker:** `apps/scraper/runner/profile_maintenance.py:167-177` still constructs `Crawl4AIEngine` with `EngineConfig`. `Crawl4AIEngine._normalize_config()` only carries `timeout`, `concurrency_limit`, and retries into `crawler` settings (`apps/scraper/src/crawl4ai_engine/engine.py:60-67`), while `_build_run_config()` defaults `wait_for_images` and `scan_full_page` to `False` (`apps/scraper/src/crawl4ai_engine/engine.py:297-298`). The handler constants `_CRAWL_WAIT_FOR_IMAGES` / `_CRAWL_SCAN_FULL_PAGE` are unused, so real PDP crawls will not use the image/full-page settings required by the handoff. **Smallest fix:** pass a dict config with `crawler.wait_for_images: True`, `crawler.scan_full_page: True`, bounded timeout/page_timeout, and add a unit test asserting the config passed to `Crawl4AIEngine`.

- **Blocker:** Image candidate de-dupe/selection drops provenance and context before calling `ProductMediaSelector`. `build_image_candidates()` processes Crawl4AI media first and skips duplicate JSON-LD URLs (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:238-289`), while `select_image_candidates()` only sends `jsonld_images` for candidates whose surviving `source_type == "jsonld"` and converts every candidate to generic `group_id: 0` (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:397-423`). Diagnostic proof: a media image with score `0` plus a duplicate JSON-LD Product image was reduced to `[('https://example.com/product.jpg', 'dom_image', 0.0)]` and then rejected instead of receiving JSON-LD context. A candidate marked `non_product_context=True` was selected as primary because that context is not passed through. **Smallest fix:** either let `ProductMediaSelector` consume raw media/jsonld/html directly, or merge duplicate provenance into candidates (e.g. `source_types`, `jsonld_context`) and preserve `gallery_context`, `non_product_context`, and `duplicate_context` through selection. Add regression tests for duplicate media+JSON-LD and non-product DOM context.

- **Blocker:** JSON-LD extraction can crash on valid Schema.org `@type` arrays. `_extract_jsonld_images()` assumes each JSON-LD item is a dict and that `item.get("@type")` is a string, then calls `.lower()` (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:96-109`). Diagnostic proof with `{"@type":["Product","Thing"],"image":"https://example.com/p.jpg"}` raised `AttributeError 'list' object has no attribute 'lower'`. **Smallest fix:** guard `isinstance(item, dict)` and normalize `@type` as string/list before membership checks; add a test for `@type` arrays and non-dict `@graph` entries.

- **Blocker:** Artifact image evidence omits selection roles and rejection reasons. The `ImageCandidate` model has URL/source/context fields but no `selection_role` or `rejection_reasons` (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:27-44`), `select_image_candidates()` maps selected/rejected images back to the original candidates without copying `SelectedImage.role` or `SelectedImage.reasons` (`apps/scraper/scrapers/product_url_extraction/image_candidates.py:431-442`), and `_build_verified_result()` stores `artifact.payload.image_candidates` from the original candidates only (`apps/scraper/runner/profile_maintenance.py:409-443`). The local `rejected_candidates` variable is computed but unused (`apps/scraper/runner/profile_maintenance.py:409-411`). This misses the handoff requirement for selected candidates plus rejection evidence. **Smallest fix:** add role/reason fields or a compact `rejected_summaries` list populated from `ProductMediaSelector` results, then assert those fields in the artifact schema test.

- **Note:** `_extract_observed_selectors()` searches for literal `.class` / `#id` text in raw HTML (`apps/scraper/runner/profile_maintenance.py:245-270`), so normal markup like `class="product-title"`, `class="add-to-cart"`, or `id="product-form"` returns `[]`. Diagnostic proof with representative HTML returned an empty selector list. **Smallest fix:** parse `class=`/`id=` attributes or update the regexes to match HTML attributes, and add an artifact test that expects observed selectors.

- **Note:** The runner bypasses `classify_page()` whenever `crawl_result.success` is false (`apps/scraper/runner/profile_maintenance.py:84-93`), so a 403/blocked crawl is emitted as `error_page` through `_build_failed_result()` (`apps/scraper/runner/profile_maintenance.py:281-325`) instead of `blocked_page` evidence. The test named “blocked classification” only asserts rejected status, not the classification (`apps/scraper/tests/unit/test_profile_maintenance.py:466-485`). **Smallest fix:** classify failed crawl results or at least map 403/429/captcha/access-denied failures to `blocked_page`, and tighten the test.

- **Note:** Test quality is mostly focused and non-live, but key guardrail gaps remain: no test asserts `wait_for_images`/`scan_full_page` config; no image candidate tests for `@type` arrays, JSON-LD provenance surviving de-dupe, rejected reason/role evidence, observed selectors, or strict non-product-context rejection. `test_select_multiple_candidates` currently allows the logo/non-product candidate to be either rejected or in the gallery (`apps/scraper/tests/unit/test_image_candidates.py:323-350`), so it cannot catch the context-loss regression.

- **Note:** Structured logging is present via `logger`, but `_crawl_target()` logs only a string message (`apps/scraper/runner/profile_maintenance.py:178-179`) and collapses all crawl exceptions into succeeded/rejected results. For retryable failures, consider using the existing failure classification pattern or returning a failed job result when retry is desired.

## Commands run

- `git status --short && git diff --name-only -- apps/scraper && git ls-files --others --exclude-standard apps/scraper` — passed; showed existing modified/untracked scraper files.
- `cd apps/scraper && uv run pytest tests/unit/test_page_classifier.py tests/unit/test_image_candidates.py tests/unit/test_profile_maintenance.py` — passed; 67 tests passed, with Python 3.14/pytest-asyncio deprecation warnings.
- `cd apps/scraper && uv run ruff check runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py --output-format=github` — passed; no output.
- `cd apps/scraper && uv run mypy runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py --ignore-missing-imports` — failed; `mypy` executable is not installed in this environment.
- `git diff --cached --name-only` — passed; no staged files.
- Diagnostic one-liners with `uv run --with-requirements requirements.txt python ...` confirmed: JSON-LD `@type` array raises `AttributeError`, non-product context is lost by selection, and observed selector extraction returns `[]` for normal class/id markup.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete findings include severities and file paths/line numbers for runner crawl config, image candidate provenance/context, JSON-LD parsing, artifact evidence, observed selectors, and test gaps."
    }
  ],
  "changedFiles": [
    "validation/real-pdp-verification-conventions-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short && git diff --name-only -- apps/scraper && git ls-files --others --exclude-standard apps/scraper",
      "result": "passed",
      "summary": "Inspected working tree and relevant scraper changed/untracked files."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_page_classifier.py tests/unit/test_image_candidates.py tests/unit/test_profile_maintenance.py",
      "result": "passed",
      "summary": "67 tests passed; warnings from Python 3.14/pytest_asyncio and requests dependency versions."
    },
    {
      "command": "cd apps/scraper && uv run ruff check runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py --output-format=github",
      "result": "passed",
      "summary": "No Ruff findings emitted for reviewed files."
    },
    {
      "command": "cd apps/scraper && uv run mypy runner/profile_maintenance.py scrapers/product_url_extraction/image_candidates.py scrapers/product_url_extraction/page_classifier.py tests/unit/test_profile_maintenance.py tests/unit/test_image_candidates.py tests/unit/test_page_classifier.py --ignore-missing-imports",
      "result": "failed",
      "summary": "mypy executable is not installed in this environment."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Focused scraper tests: 67 passed.",
    "Focused Ruff check: passed with no output.",
    "Diagnostic: JSON-LD @type array raises AttributeError in image candidate builder.",
    "Diagnostic: non_product_context=True candidate can be selected as primary by wrapper.",
    "Diagnostic: observed selector extraction returns [] for normal class/id markup."
  ],
  "residualRisks": [
    "mypy could not be run because it is not installed.",
    "Focused tests pass but do not cover the blocking image provenance/context and crawl-config regressions.",
    "Working tree includes many pre-existing modified/untracked files outside this review artifact."
  ],
  "noStagedFiles": true,
  "diffSummary": "Review artifact only; no source code or tests modified by this run.",
  "reviewFindings": [
    "blocker: apps/scraper/runner/profile_maintenance.py:167 - Crawl4AIEngine config does not enable wait_for_images or scan_full_page.",
    "blocker: apps/scraper/scrapers/product_url_extraction/image_candidates.py:238 - de-dupe and selection drop JSON-LD provenance and DOM context before ProductMediaSelector.",
    "blocker: apps/scraper/scrapers/product_url_extraction/image_candidates.py:107 - JSON-LD @type arrays crash with AttributeError.",
    "blocker: apps/scraper/runner/profile_maintenance.py:409 - artifact image_candidates omit selection roles and rejection reasons.",
    "note: apps/scraper/runner/profile_maintenance.py:245 - observed selector regexes do not match normal class/id attributes.",
    "note: apps/scraper/runner/profile_maintenance.py:84 - failed crawls bypass page_classifier, so blocked pages are reported as error_page.",
    "note: apps/scraper/tests/unit/test_image_candidates.py:323 - selector-wrapper test allows non-product candidate in gallery and misses context-loss regression."
  ],
  "manualNotes": "No source edits were made. The output file was written because the task explicitly required this validation artifact path."
}
```
