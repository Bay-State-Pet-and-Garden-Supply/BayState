# Oracle Review: Sandbox Results and Next Step

## Inherited decisions

- Keep production architecture pipeline-native: `products_ingestion`, `brand_sources`, approved-source extraction, scraper callbacks, and existing review UI remain the real lifecycle.
- UPC and price stay protected input fields; enrichment may provide evidence, not overwrite them.
- Crawl4AI remains the primary crawler/extractor in production unless evidence proves a gap it cannot cover.
- Do not introduce `product_creation_drafts`, a new brand schema, or a parallel resolver lifecycle from the original proposal.
- agent-browser was only allowed as a sandbox/fallback investigation tool; adding it as a production runtime dependency remains unapproved.
- The current work is intentionally local sandbox work, not real app implementation.

## Diagnosis

The sandbox result is useful, but it should be interpreted narrowly.

The experiment did **not** prove that production needs the `agent-browser` CLI. It proved that a **rendered DOM image extraction pass** is necessary for some official brand sites. agent-browser happened to be the tool that demonstrated the gap: on Fromm category pages it found ~100 lazy-loaded/CDN images while the default Crawl4AI packet found 1.

Because Crawl4AI already runs browser-backed rendering and supports JavaScript execution, the next question is not “should we add agent-browser to production?” The next question is:

> Can Crawl4AI, with the same scroll/wait/DOM image extraction script, match most of the agent-browser image result?

If yes, the production path stays simpler: improve the existing Crawl4AI runner/extraction strategy. If no, then we have stronger evidence for a separate interactive extraction fallback, but even then the production shape should probably be “interactive Playwright/Crawl4AI fallback inside the Python runner,” not necessarily the agent-browser CLI.

The Fromm finding is also important architecturally: some brands may not expose canonical product detail pages. Fromm appears to behave more like category/listing pages with client-side product rendering and limited/no JSON-LD. That means the resolver cannot assume every official brand site has a URL-per-product PDP that can be matched by UPC. For these brands, the best available official evidence may be a category/collection page plus product-card evidence, and those cases should remain lower-confidence/manual-review unless the specific product card can be isolated.

Gemma performed well as an evidence interpreter: conservative, structured, and willing to return null. That supports using a local LLM in sandbox evaluation, but the timeout on the cat page shows it needs retries/timing metrics before relying on it heavily even in local batch experiments.

## Drift / contradiction check

- **No drift:** Crawl4AI-first remains correct. The text extraction and markdown evidence worked well enough for Gemma to interpret.
- **No drift:** LLM output should remain evidence-bound. Gemma’s null behavior is encouraging and consistent with the no-hallucination rule.
- **Potential drift to avoid:** Do not translate “agent-browser found 100x more images” into “add agent-browser to production.” The proven need is rendered/lazy image extraction; the implementation mechanism is still undecided.
- **Potential drift to avoid:** Do not treat Fromm category pages as successful PDP matches. The sandbox correctly marked them `conflict`; that should remain true until product-card-level matching is demonstrated.
- **Potential drift to avoid:** Do not build a brand-wide URL index yet. The experiment set is too small and only used category pages from one brand.

## Recommendation

### Best next concrete step

Run a **Benchmark Round 2** in the sandbox before any production code changes.

Round 2 should answer three specific questions:

1. **Can Crawl4AI close the image gap without agent-browser?**
   - Add a Crawl4AI “rendered image pass” that uses the same DOM image extraction JavaScript as agent-browser.
   - Include scroll/wait behavior for lazy-loaded images.
   - Compare image count, unique CDN URLs, product-image relevance, and runtime against agent-browser.

2. **Can we reliably distinguish PDPs from collection/category pages?**
   - Add page-type classification: `pdp`, `collection`, `category`, `brand_home`, `blog/support`, `unknown`.
   - Require stronger evidence before `accept`: product JSON-LD, product-specific H1/title, SKU/UPC/GTIN, product-card isolation, or exact product token/size match.
   - Keep Fromm-like collection pages as `review`, not `accept`, unless a product card is isolated.

3. **How well does Gemma behave across real product pages, not only Fromm category pages?**
   - Build a fixture matrix with actual PDPs and actual no-PDP/category brands.
   - Record model id, latency, timeout, extracted fields, null correctness, and hallucination warnings.

### Why this is the best move

It preserves the prior architecture decision while using the sandbox evidence productively. It converts the agent-browser result into a testable technical hypothesis:

> “The production extractor needs a rendered DOM/media extraction mode.”

That hypothesis can likely be satisfied inside the existing Crawl4AI/Playwright stack. Only if that fails should agent-browser become a serious production dependency candidate.

## Fixture/benchmark set to build next

Create 15–25 fixtures, split intentionally:

1. **Canonical PDP with JSON-LD Product** — 5+ fixtures
   - Goal: establish the happy path and field-evidence schema.
   - Expected: high confidence without LLM or agent-browser.

2. **Canonical PDP without JSON-LD but good meta/HTML** — 5 fixtures
   - Goal: test Crawl4AI markdown/meta + Gemma extraction.
   - Expected: medium/high confidence with field evidence.

3. **SPA/lazy-loaded PDP or collection pages** — 5 fixtures
   - Include Fromm dog/cat Four-Star.
   - Goal: test rendered image pass, page classification, product-card isolation.
   - Expected: review/conflict unless a product card is isolated.

4. **No official PDP / marketing-only brand pages** — 3–5 fixtures
   - Goal: ensure unresolved/review behavior is safe.
   - Expected: no hallucinated draft; clear missing evidence.

5. **Known false-positive traps** — 3 fixtures
   - Wrong species, wrong size, related recipe/blog page, store locator, or retailer/distributor page.
   - Goal: tune negative scoring.

Each fixture should include:

- brand
- official domain
- register name
- UPC
- expected tokens/species/size
- known URL if available
- expected page type
- expected required evidence
- whether LLM is allowed
- whether rendered image fallback is expected to help

## Specific sandbox improvements before more live runs

1. **Add Crawl4AI rendered media extraction**
   - Use the current image JS from `agent_browser_capture.sh` inside a Crawl4AI pass.
   - Scroll before extraction.
   - Persist `rendered_images`, `media_extraction_method`, and `image_count_by_method`.

2. **Add page-type classifier**
   - Deterministic first: URL path, title/H1, JSON-LD type, product-card count, collection/category markers.
   - Gemma may assist, but page type should not depend only on LLM.

3. **Add product-card extraction for collection pages**
   - Extract card titles, image URLs, hrefs, onclick handlers, data attributes, and nearby text.
   - For Fromm, inspect rendered DOM/network for Umbraco product IDs and product-card data.

4. **Add per-field benchmark scoring**
   - Separate field accuracy from packet recommendation.
   - Score name, brand, species, size, UPC, description, ingredients, images, and page type independently.

5. **Add LLM reliability metrics**
   - latency_ms
   - timeout/retry count
   - model id
   - schema validation pass/fail
   - null correctness
   - hallucination flags

## Production implication, for later

If Round 2 shows Crawl4AI rendered media extraction matches agent-browser within an acceptable margin, the production next step would be to improve the existing official-brand extraction path / `SerpDiscoveryAdapter` with:

```text
Crawl4AI text/meta/JSON-LD extraction
→ rendered DOM media extraction when default images are weak
→ optional LLM evidence interpretation
→ existing products_ingestion.sources evidence payload
→ existing pipeline review UI
```

If Crawl4AI cannot match agent-browser after scroll/wait/JS extraction, then propose an “interactive extraction fallback” decision. But do not name agent-browser as production dependency until that comparison is complete.

## Risks

- Fromm may be an outlier; do not overfit the architecture to one brand.
- Image count alone can be misleading; menus/logos/category art are not product images.
- Collection pages can look product-rich while still lacking exact UPC/size/variant evidence.
- Gemma’s conservative behavior is promising, but network timeout means local batch reliability is not proven.
- A local sandbox can hide production constraints: runner environment, Docker image size, async orchestration, resource usage, callback payload limits.

## Need from main agent

No production architecture decision yet. The main decision needed now is only:

**Approve another sandbox-only benchmark round focused on Crawl4AI rendered image extraction vs agent-browser, plus PDP/category fixture coverage.**

## Suggested execution prompt

Implementation handoff is warranted for sandbox-only work:

> Update only `sandbox/product-page-extraction/**`. Add a Crawl4AI rendered media extraction pass using the same DOM image extraction JS currently used by `agent_browser_capture.sh`, including scroll/wait behavior. Add page-type classification and product-card extraction for collection pages. Extend fixture output and comparison summaries with image counts by method, page type, per-field scores, LLM latency/timeout/model metadata, and whether agent-browser added unique useful images. Do not touch `apps/web`, `apps/scraper`, `packages`, migrations, root package scripts, or production config. Run compile/dry-run validation and at least one Fromm dog/cat live benchmark. Update `docs/experiment-log.md` with results and remaining gaps.
