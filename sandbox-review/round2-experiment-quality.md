# Round 2 product-page-extraction sandbox review — experiment quality

Scope reviewed: `sandbox/product-page-extraction` fixtures, comparison output design, summaries, generated Round 2 evidence, and whether the experiment can answer: “can Crawl4AI close the image gap vs agent-browser?”

Context note: `/Users/nickborrello/Desktop/Projects/BayState/plan.md` was not present. `/Users/nickborrello/Desktop/Projects/BayState/progress.md` is about LM Studio research, not the Round 2 sandbox implementation.

Checks run/read-only:
- `python3 scripts/run_fixture.py --fixture fixtures/products.round2.jsonl --dry-run` → valid JSONL, 12 rows.
- `python3 scripts/validate_packet.py .../packet.json`, `.../comparison.json`, and `agent-browser-runs/.../dom-extract.json` → all schema-valid for the latest Round 2 sample artifacts.

## Review

### Correct
- The sandbox remains isolated and documented as non-production: `README.md` explicitly says no `apps/web`, scraper daemon, Supabase, coordinator, production YAML, or Turbo wiring changes (`README.md:5-15`).
- The comparison artifact has the right core shape for the image-gap question: default/rendered/agent-browser counts, Jaccard overlap, unique agent-browser count, and a close-enough boolean are computed in `scripts/compare_results.py:55-70` and emitted at `scripts/compare_results.py:104-110`.
- The latest live comparison demonstrates the current result clearly: Crawl4AI rendered found 41 images, agent-browser found 109, overlap was 0.351, and `crawl4ai_rendered_close_enough` was false (`outputs/20260525T180110Z-fixture-batch/20260525T180110Z-fromm-four-star-dog/comparison.json:3-8`).
- Round 2 also records useful supporting metrics: field scores and LLM metrics are included in fixture results (`scripts/run_fixture.py:115-124`), and the latest packet/comparison/agent-browser artifacts validate against their schemas.

### Blocker
- The Round 2 fixture matrix is not yet a valid benchmark matrix. It advertises “15+ rows” (`fixtures/products.round2.jsonl:1`, `README.md:149`) but dry-run reports only 12 valid rows. Several group labels also do not match the data: “Canonical PDP with JSON-LD Product (5+ fixtures)” has only two rows and both expect `page_type: collection` (`fixtures/products.round2.jsonl:4-7`); the “PDP without JSON-LD” group uses the homepage and expects `brand_home` (`fixtures/products.round2.jsonl:9-10`). This prevents a balanced answer about PDP success, collection false positives, and image-gap closure.
- The Crawl4AI rendered pass is not using the shared DOM JS that would make it comparable to agent-browser. `RENDERED_EVIDENCE_JS` exists with `data-src`, `data-srcset`, background image, and product-card extraction (`scripts/common.py:42-104`), but `extract_product_page.py` instead parses rendered HTML with BeautifulSoup and forces `productCards: []` / `productCardCount: 0` / `method: scroll+bs4` (`scripts/extract_product_page.py:430-447`). The generated evidence confirms this (`rendered-evidence.json:46-48`) while agent-browser found `imageCount: 109` and `productCardCount: 50` (`agent-browser-runs/20260525T180139Z-fromm-four-star-dog/dom-extract.json:677-679`). Until Crawl4AI runs the same JS extraction or captures its return value, this experiment cannot answer whether Crawl4AI can close the agent-browser gap.
- Aggregate summaries are too thin for benchmark-level conclusions. `run_fixture.py` only aggregates counts by page type/recommendation and LLM timeouts (`scripts/run_fixture.py:143-159`); it does not aggregate rendered-vs-agent ratios, close-enough pass rate, unique agent-browser images, overlap, default→rendered gain, or field-score pass rates. The latest summary also contains only one fixture (`summary.json:94`). A reader still has to inspect per-fixture comparison JSONs manually.

### Note
- Image counts are noisy because they include non-product assets. The rendered Crawl4AI evidence includes a Facebook tracking pixel and a relative logo path (`rendered-evidence.json:4`, `rendered-evidence.json:44`), while agent-browser absolutizes the logo (`agent-browser-runs/20260525T180139Z-fromm-four-star-dog/dom-extract.json:14`). This can understate overlap and overstate useful product-image coverage. For the final answer, compare product-card/product-gallery images separately from all DOM images.
- The page classifier can report high confidence for an unknown page type: a deep product URL signal sets confidence to 0.8 (`scripts/page_classifier.py:110-111`) even when the decision falls through to `page_type = "unknown"` (`scripts/page_classifier.py:102`). The latest packet shows `confidence: 0.8` with `page_type: unknown` and `product_card_count: 0` (`packet.json:11-14`). That makes classifier quality harder to interpret.
- Fixture `required_fields` are documented (`fixtures/README.md:16`) but not enforced by field scoring. `score_fixture` maps specific expected values and image minima only (`scripts/field_scoring.py:151-160`), so a required field without an explicit expected value can be scored as acceptable even when missing. This weakens per-field benchmark conclusions.
- Comparison output does not include product-card comparison, even though agent-browser captures cards. `page_type_comparison` only reports the packet page type (`scripts/compare_results.py:112-114`). Product-card counts, matched-card titles/hrefs, and card-image overlap would be important for distinguishing useful product images from menus, hero art, and footer assets.
- Validation logic can disagree internally on brand evidence: the latest packet has `fields.brand = "Fromm"` (`packet.json:57-58`) but `validation.brand_match = false` (`packet.json:257-258`) because `brand_match` only uses JSON-LD `page_brand` (`scripts/extract_product_page.py:250`). This lowers confidence and makes fixture scoring vs packet recommendation harder to interpret.

## Fixes worth doing now
1. Replace the Crawl4AI rendered BS4 pass with execution/capture of the existing `RENDERED_EVIDENCE_JS`, or otherwise make Crawl4AI and agent-browser use the same normalization and product-card extraction path. This is the main blocker for the image-gap question.
2. Rebuild `fixtures/products.round2.jsonl` into the advertised matrix: at least 15 rows, real PDP JSON-LD positives, real PDP no-JSON-LD positives, SPA/lazy collection pages, marketing-only pages, and false-positive traps. Add explicit `image_min`, `rendered_image_min`, and `agent_browser_image_min` where image-gap assertions matter.
3. Add benchmark aggregate image metrics to `summary.json`: total fixtures with agent-browser, mean/median rendered/agent counts, rendered/agent coverage ratio, close-enough pass rate, Jaccard overlap, unique agent-browser image count, and default→rendered improvement. Group them by fixture group/page type.
4. Enforce fixture `required_fields` in `field_scoring.py`, and include field pass-rate aggregates in `summary.json`.
5. Normalize and filter images before comparison: absolutize relative URLs, remove tracking pixels/logos/menu/support assets where possible, and separately report all-images vs product-card/product-gallery images.

Bottom line: the current Round 2 sandbox shows Crawl4AI improved from default extraction but did not close the gap on the one live Fromm sample. However, because the fixtures are incomplete, the aggregate summary is insufficient, and Crawl4AI is not yet running the same DOM evidence extraction as agent-browser, the experiment is not yet strong enough to answer the broader question conclusively.
