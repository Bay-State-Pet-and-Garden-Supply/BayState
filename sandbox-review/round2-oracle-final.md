# Round 2 Oracle Final Review

## Inherited decisions

- This is still **sandbox-only** work. Do not touch `apps/web`, `apps/scraper`, `packages`, migrations, root package scripts, or production configuration.
- Production architecture remains pipeline-native: `products_ingestion`, `brand_sources`, approved-source extraction, scraper callbacks, and existing review UI remain the real lifecycle.
- Crawl4AI remains the default/primary crawler unless evidence proves a specific gap.
- agent-browser is currently an investigation/comparison tool, not an approved production runtime dependency.
- Gemma/LM Studio is an evidence interpreter only. UPC, price, ingredients, images, etc. must remain source-evidence-bound and must not be invented.
- Fromm category/collection pages are not successful PDP matches. They should remain `conflict`/`review` unless product-card-level evidence is isolated.

## Diagnosis

The latest Round 2 fixes materially improved the sandbox:

- validation passes;
- `products.round2.jsonl` now has 16 rows;
- output containment and private LM Studio guardrails were added;
- field scoring now enforces required fields;
- packet schemas are tighter;
- Gemma metrics are recorded;
- Fromm dog run correctly remains `conflict` because there is no PDP evidence.

The live Fromm result is now strong evidence for a specific capability gap:

| Path | Images | Product cards | Notes |
|---|---:|---:|---|
| Crawl4AI default | 0 | 0 | no useful media evidence |
| Crawl4AI rendered scroll + HTML fallback | 41 | 0 | large improvement, but cannot see dynamic card evidence |
| agent-browser direct JS eval | 109 | 50 | captures lazy/data-attribute images and product cards |

This means the current Crawl4AI sandbox path is not equivalent to agent-browser. It improved from default extraction, but it still does **not** answer the core Round 2 question because Crawl4AI did not successfully capture the return value of the shared rendered-evidence JS. It fell back to parsing `result.html`, and the sentinel DOM write was not present in the captured HTML.

So the result proves more than “image extraction is weak,” but less than “agent-browser CLI must be adopted.” It proves that these sites need **interactive rendered-page evaluation** — direct access to the browser page at runtime — to capture lazy media and product cards.

## Drift / contradiction check

- No drift: Crawl4AI-first remains the right default for text/meta/markdown extraction.
- No drift: Gemma is useful and conservative; it should remain an evidence interpreter, not a source of unsupported facts.
- Potential drift to avoid: do not equate “agent-browser found 109 images and 50 cards” with “production must use the agent-browser CLI.” The proven requirement is direct interactive JS evaluation, not a specific CLI implementation.
- Potential drift to avoid: do not keep doing broad Crawl4AI retries. The remaining Crawl4AI question should be one narrow technical spike: can Crawl4AI expose `page.evaluate` results through hooks/strategy/session access?
- Potential drift to avoid: do not classify Fromm as a product match without product-card isolation. Current `conflict` is correct.

## Recommendation

We are **ready to conclude that interactive eval is needed for Fromm-like sites**.

We are **not yet ready to conclude that agent-browser CLI is the production answer**.

Before deciding on agent-browser as a dependency, attempt exactly one more narrow Crawl4AI-native technique:

1. Use Crawl4AI’s hook/strategy surface, not `js_code` + sentinel-in-HTML.
2. Specifically test `before_retrieve_html` or `before_return_html` hooks with direct Playwright `page.evaluate(RENDERED_EVIDENCE_JS)` and capture the result into Python state.
3. If hook capture is awkward, test persistent `session_id` + `js_only` or direct access to the underlying crawler strategy page/evaluate API.
4. Success threshold: Crawl4AI-native direct eval should get near agent-browser on Fromm dog/cat — roughly ≥80% image count or high overlap, and nonzero product-card extraction close to the 50 cards agent-browser sees.
5. Timebox this as a small spike. If it fails, stop trying to force Crawl4AI’s normal result object/html path to do eval-return work.

Why this one more attempt is justified: installed Crawl4AI exposes a Playwright-backed hook system (`before_retrieve_html`, `before_return_html`, `on_execution_ended`) and internal `page.evaluate` usage. The failed sentinel approach may be the wrong integration point, not proof that Crawl4AI’s browser cannot evaluate the page.

## Best next step

Run a **Round 2.1 “direct eval spike”** in the sandbox:

```text
sandbox/product-page-extraction only
→ add a minimal Crawl4AI hook/direct-evaluate probe
→ run shared RENDERED_EVIDENCE_JS against Fromm dog/cat pages
→ compare against agent-browser using the existing comparison script
→ record whether Crawl4AI-native direct eval can capture images/cards
```

If the direct-eval spike succeeds:

```text
Production implication later: implement rendered evidence extraction inside the existing Python scraper/Crawl4AI runner path.
No agent-browser production dependency needed.
```

If the direct-eval spike fails:

```text
Production implication later: approve an interactive extraction fallback requirement.
Prefer raw Playwright/page.evaluate inside the Python runner first; consider agent-browser CLI only if it is operationally cleaner than maintaining direct Playwright code.
```

## Specific acceptance criteria for Round 2.1

- Crawl4AI-native direct eval writes a rendered evidence JSON with:
  - `imageCount`
  - `productCardCount`
  - `images`
  - `productCards`
  - `extractionMethod: crawl4ai_page_evaluate` or similar.
- Fromm dog/cat pages produce nonzero product cards if direct eval works.
- Comparison reports:
  - Crawl4AI direct-eval image count vs agent-browser image count;
  - product-card count vs agent-browser product-card count;
  - overlap and unique agent-browser count.
- Experiment log explicitly says one of:
  - “Crawl4AI hook/direct eval matches agent-browser closely enough”; or
  - “Crawl4AI result/html path and hook/direct eval cannot capture equivalent rendered evidence; interactive fallback remains necessary.”

## Risks

- agent-browser image/card counts include noise: logos, menu images, tracking pixels, and category art. Product-card/gallery-specific comparison still matters more than raw image count.
- Crawl4AI hooks may be version-sensitive in v0.8. A result here should be documented with exact Crawl4AI version.
- Even if Crawl4AI direct eval works locally, production runner constraints still matter: Docker image, async orchestration, callback payload size, and rate limits.
- Fromm may be an outlier, so this should not trigger brand-wide indexing or product lifecycle changes by itself.

## Need from main agent

No production architecture decision yet.

Approve a small sandbox-only Round 2.1 worker task to test Crawl4AI hook/direct `page.evaluate` capture. Do **not** start implementing production agent-browser support.

## Suggested execution prompt

Implementation handoff is warranted, but only for a narrow sandbox spike:

> Update only `sandbox/product-page-extraction/**`. Add a minimal Crawl4AI direct-eval rendered evidence spike that uses Crawl4AI hooks or strategy/session access to run the existing `RENDERED_EVIDENCE_JS` via Playwright `page.evaluate` and capture its return value directly, not through sentinel HTML parsing. Preserve the existing HTML fallback for comparison. Run it on Fromm dog/cat pages and compare against agent-browser output. Report image count, product-card count, overlap, runtime, and whether Crawl4AI direct eval reaches the acceptance threshold. Do not touch production app, scraper, packages, migrations, or root scripts. Update `docs/experiment-log.md` with the conclusion.
