# BayState Missing-Distributor-UPC Fallback Implementation Plan

## Target product/engineering decision
BayState should replace the current “distributors cleanly missed, then SERP Discovery may solve it” behavior with a proof-first UPC resolution cascade: distributor scrape → official brand crawl → licensed/barcode lookup → SERP candidate evidence → packaging OCR/VLM → manual review. SERP remains useful only as a candidate/evidence source; it must not publish or advance a product unless the selected evidence satisfies strict UPC identity gates. The coordinator (`apps/web`) remains the owner of persistence, status transitions, provider credentials, review UI, and schema; the scraper (`apps/scraper`) remains an API-only runner that receives source plans and returns evidence via callbacks.

## Goal
Ship an auditable UPC-resolution cascade that proves product identity before advancement/publish, measures provider coverage, and fails closed to admin review when proof is missing or conflicting.

## Current constraints to preserve
- Current source attempts only support `found | not_stocked | source_error | skipped`; do not add new attempt outcomes for candidate/conflict states.
- Existing callback status rule is “found wins”; under UPC Resolution V2, only proof-gated matches may emit `found`.
- Distributor `source_error` should continue to block downstream fallback when no source has already proven the product.
- Scraper must not read/write Supabase directly; it only receives job/source-plan config and posts results to web callbacks.
- Do not import Python internals into TypeScript or make `apps/research-agent` a runtime dependency of scraper/web.

---

## MVP Milestones

### MVP 0 — Evidence model, gates, and fail-closed instrumentation
**Goal:** Add UPC-proof state and reusable evidence gates without changing live cascade behavior until feature flags are enabled.

**Likely files/modules changed**
- `apps/web/supabase/migrations/20260624xxxx_upc_resolution_v2.sql` — additive schema.
- `apps/web/lib/upc-resolution/types.ts` — normalized evidence/result types.
- `apps/web/lib/upc-resolution/upc.ts` — TS UPC/GTIN normalization + check digit validation.
- `apps/web/lib/upc-resolution/gates.ts` — confidence/evidence classification.
- `apps/web/lib/upc-resolution/source-results.ts` — converts `source_results[]` to product-level UPC resolution state.
- `apps/web/lib/scraper-callback/enrichment-result.ts` — parse/store resolution evidence and V2 final status option.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` — pass job config into V2 status/evidence persistence.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` — optional `resolutionStage` / `resolutionEvidence` on `SourceResultInfo`.
- `apps/scraper/scrapers/approved_sources/result_builder.py` — helper for skipped and proof-gated no-match source results.
- `docs/adr/0006-upc-resolution-proof-required.md` — document V2 exception to ADR 0002.

**Schema changes**
- Add nullable/product-level columns to `products_ingestion`:
  - `upc_resolution_status text` with allowed values: `unresolved`, `candidate`, `confirmed`, `conflict`, `manual_override`, `private_label`.
  - `upc_resolution_stage text`.
  - `upc_resolution_confidence numeric` checked 0–1.
  - `upc_resolution_evidence jsonb not null default '[]'`.
  - `upc_resolution_updated_at timestamptz`.
  - `upc_resolution_resolved_by uuid` nullable for manual actions.
- Add `upc_resolution_events` for unified measurement across source attempts, packaging jobs, and manual actions:
  - `upc`, `stage`, `source_slug`, `outcome` checked against `found | not_stocked | source_error | skipped`, `confidence`, `evidence jsonb`, optional `source_attempt_id`, optional `packaging_extraction_id`, `created_at`.
- Add indexes on `products_ingestion(upc_resolution_status)` and `upc_resolution_events(upc, created_at desc)`.

**Smallest safe tasks**
1. Create additive migration only; no backfill behavior change.
2. Implement TS UPC utilities with tests using valid/invalid GTIN-8/12/13/14.
3. Define `UpcResolutionEvidence` and `UpcResolutionDecision` types.
4. Extend callback parsing so unknown/absent resolution evidence is tolerated.
5. Add V2 status helper: when `job.config.upc_resolution_policy === 'proof_required'`, no proof after exhausted stages becomes `needs_attention`; otherwise keep ADR 0002 behavior.
6. Persist `products_ingestion.upc_resolution_*` only when V2 job config is present.
7. Log a `upc_resolution_events` row per source result in V2 mode.

**Acceptance criteria**
- Legacy jobs with no `upc_resolution_policy` behave exactly as today.
- V2 job with one proof-gated `found` sets `upc_resolution_status='confirmed'`, confidence/stage/evidence populated, product can move to `processed`.
- V2 job with only `not_stocked`/`skipped` sets `upc_resolution_status='unresolved'` and product `pipeline_status='needs_attention'`.
- V2 job with conflict evidence sets `upc_resolution_status='conflict'` and `needs_attention`.

**Tests/validation commands**
- `bun run web test -- --testPathPatterns="upc-resolution|enrichment-result"`
- `bun run web typecheck`
- `bun run web lint`
- `cd apps/scraper && uv run pytest tests/unit/test_approved_sources_result_builder.py tests/unit/test_upc_resolution_gates.py`

**Rollback / feature flag**
- Default `upc_resolution_policy` remains unset/legacy.
- Disable by setting `UPC_RESOLUTION_V2_ENABLED=false` and not sending V2 job config.
- Migration is additive; rollback is operationally “ignore new columns/tables.”

**Risks**
- Callback status changes can accidentally route products to `needs_attention`; gate all new behavior strictly on job config.
- Source evidence may be too large; cap stored candidate arrays/snippets and store full raw provider payload only in provider cache/debug tables where needed.

---

### MVP 1 — Strict staged cascade: distributors → official brand → licensed placeholder → SERP candidates
**Goal:** Change source planning/execution so SERP is a late candidate stage, not the official-brand solution, while preserving distributor error blocking.

**Likely files/modules changed**
- `apps/web/lib/approved-sources/types.ts`
- `apps/web/lib/approved-sources/source-plan.ts`
- `apps/web/lib/pipeline-scraping-types.ts`
- `apps/web/lib/pipeline-scraping.ts`
- `apps/web/__tests__/lib/approved-sources/source-plan-modes.test.ts`
- `apps/scraper/scrapers/approved_sources/types.py`
- `apps/scraper/scrapers/approved_sources/executor.py`
- `apps/scraper/scrapers/approved_sources/adapters/registry.py`
- `apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py` (new)
- `apps/scraper/scrapers/approved_sources/adapters/serp_discovery.py` or new `serp_candidate_discovery.py`
- `apps/scraper/scrapers/approved_sources/upc_resolution.py` (new shared Python gates)
- `apps/scraper/tests/unit/test_approved_sources_executor.py`

**Schema changes**
- None beyond MVP 0.

**Smallest safe tasks**
1. Add source-plan option `upcResolutionV2Enabled` and job config `upc_resolution_policy: 'proof_required'`.
2. In V2 mode, synthesize fallback entries in this order after distributors:
   - `official_brand` / `official_brand_crawl` for brand official domains.
   - `licensed_feed` entries only when enabled providers are configured; otherwise emit no provider entries.
   - `official_brand` or `serp_discovery` slug with adapter `serp_candidate_discovery` as the late candidate stage.
3. Keep legacy `crawl4ai_direct -> serp_discovery` synthesis only when V2 is disabled.
4. Refactor executor grouping:
   - Run all distributor entries first.
   - If any distributor returns accepted `found`, stop later stages.
   - If any non-Amazon distributor returns `source_error`, stop later stages and fail closed if no `found`.
   - Run official crawl stage; stop on accepted `found` or hard conflict.
   - Run licensed stage entries if present; stop on accepted `found` unless provider shadow mode says continue measuring.
   - Run SERP candidate stage only if still unconfirmed.
5. Implement `OfficialBrandCrawlAdapter`:
   - Restrict to `entry.domains` / brand official domains.
   - Discover candidates from official URL/search URL, sitemap URLs, URLs containing UPC digits, and optionally `site:domain "UPC"` search.
   - Crawl top candidates and return `found` only for exact UPC evidence or high-confidence official identity evidence.
   - Return `not_stocked` with candidate evidence when pages are plausible but below gate.
6. Harden SERP stage:
   - Existing SERP discovery may discover URLs, but V2 must return `found` only when exact UPC evidence is present on a crawled candidate/Google product result and brand/title gates pass.
   - SERP without exact UPC evidence returns `not_stocked` with candidates in `resolutionEvidence`, not `found`.
   - Arbitrary SERP/retailer pages may prove identity but should not contribute public marketing copy/images unless source is licensed/open/official.
7. Add tests for every stage transition and proof/no-proof outcome.

**Acceptance criteria**
- Distributor `found` skips official/licensed/SERP stages.
- Distributor `source_error` skips official/licensed/SERP stages unless another distributor already emitted accepted `found`.
- All distributors `not_stocked` runs official crawl before SERP.
- Official brand exact UPC evidence emits `found` with confidence ~0.98.
- Official brand plausible but no UPC and below high-confidence gate emits `not_stocked`, not `found`.
- SERP candidate without exact UPC emits `not_stocked` and product stays/ends `needs_attention` in V2 mode.

**Tests/validation commands**
- `bun run web test -- --testPathPatterns="source-plan-modes|upc-resolution"`
- `bun run web typecheck`
- `cd apps/scraper && uv run pytest tests/unit/test_approved_sources_executor.py tests/unit/test_official_brand_crawl_adapter.py tests/unit/test_serp_candidate_discovery.py`
- `cd apps/scraper && ruff check . --output-format=github`

**Rollback / feature flag**
- `UPC_RESOLUTION_V2_ENABLED=false` restores legacy source-plan synthesis and executor policy.
- `SERP_CANDIDATE_DISCOVERY_ENABLED=false` skips SERP candidate stage entirely.
- Keep legacy adapter aliases in `registry.py` to avoid breaking old jobs already queued.

**Risks**
- Official sites often omit UPCs; strict gates may increase `needs_attention` initially. That is expected and should be measured.
- Existing `SerpDiscoveryAdapter` is large/untested; prefer adding strict wrapper/new adapter over invasive edits when possible.

---

### MVP 2 — Provider bakeoff and shadow licensed/barcode lookup
**Goal:** Measure coverage/cost/legal fit before broad automation; then enable barcode/licensed lookup in shadow or limited production.

**Likely files/modules changed**
- `apps/web/supabase/migrations/20260624xxxx_upc_provider_bakeoff.sql`
- `apps/web/lib/upc-providers/types.ts` (new, for bakeoff/provider result normalization)
- `apps/web/scripts/upc-provider-bakeoff.ts` (new)
- `apps/scraper/scrapers/approved_sources/adapters/barcode_lookup.py` (new runtime adapter)
- `apps/scraper/scrapers/approved_sources/adapters/barcode_providers/*.py` (new provider clients)
- `apps/scraper/scrapers/approved_sources/adapters/registry.py`
- `apps/web/lib/scraper-callback/enrichment-result.ts` (write provider cache/evidence)

**Schema changes**
- `upc_provider_lookup_cache`:
  - `upc`, `provider`, `provider_product_id`, `outcome`, `confidence`, `brand`, `title`, `category`, `image_urls`, `license_profile`, `raw_response`, `queried_at`, `expires_at`.
- `upc_provider_bakeoff_results`:
  - `batch_id`, `upc`, `provider`, `outcome`, `exact_upc_echo`, `brand_match_score`, `title_overlap_score`, `has_image`, `latency_ms`, `estimated_cost_usd`, `license_profile`, `raw_summary`, `created_at`.

**Smallest safe tasks**
1. Build a normalized provider result shape: exact UPC echo, brand/title/size evidence, provider confidence, license profile, raw response pointer/summary.
2. Implement provider clients for bakeoff/runtime with per-provider credentials supplied by web config/env to scraper job config; scraper still does no DB reads.
3. Implement providers in this initial order for evaluation, not final enablement:
   - EcomSource
   - ShopAPIS
   - Open Icecat
   - Open Pet Food Facts
   - GS1 validation
   - Optional Scale SERP / Google Products
4. Run the bakeoff script on a stratified sample of 500–1,000 UPCs:
   - Known distributor-found UPCs.
   - Current distributor-`not_stocked` UPCs.
   - Pet food, pet supplies/accessories, hardware/DIY if present.
   - At least 100 manually inspected hits across providers for false-positive estimate.
5. Keep runtime barcode lookup in `UPC_PROVIDER_SHADOW_MODE=true` until bakeoff winner(s) are approved.
6. After approval, add V2 source-plan licensed entries for selected provider order.

**Provider acceptance criteria**
- A provider can become production-primary only if:
  - Exact UPC/GTIN echo rate on missing-distributor sample is high enough to materially reduce manual review (target ≥80% for the selected domain, or documented narrower category fit).
  - Manual false-positive rate ≤1% in inspected hits.
  - p95 latency and cost fit job budgets.
  - Terms permit BayState’s intended catalog enrichment use, or use is limited to internal identity validation.
- GS1 can be used for validation/confidence even if its data is not republished.

**Tests/validation commands**
- `cd apps/web && bun scripts/upc-provider-bakeoff.ts --sample artifacts/upc-bakeoff-sample.csv --providers ecomsource,shopapis,icecat,opff,gs1,scale-serp --shadow --limit 1000`
- `bun run web typecheck`
- `cd apps/scraper && uv run pytest tests/unit/test_barcode_lookup_adapter.py tests/unit/test_barcode_providers.py`
- `cd apps/scraper && ruff check . --output-format=github`

**Rollback / feature flag**
- `BARCODE_LOOKUP_ENABLED=false` removes licensed stage entries.
- `UPC_PROVIDER_SHADOW_MODE=true` records evidence but never emits `found`.
- Provider-level flags: `ECOMSOURCE_ENABLED`, `SHOPAPIS_ENABLED`, `ICECAT_OPEN_ENABLED`, `OPEN_PET_FOOD_FACTS_ENABLED`, `GS1_VALIDATION_ENABLED`, `SCALE_SERP_PRODUCTS_ENABLED`.

**Risks**
- Marketplace-aggregated providers may return wrong variants; require exact UPC echo plus brand/title gates.
- GS1 Data Hub terms are internal-use focused; do not publish GS1-sourced content without legal approval.
- Open Pet Food Facts is pet-food-only and community-sourced; gate by category and confidence.

---

### MVP 3 — Minimal admin review and publish guard
**Goal:** Give admins enough evidence/actions to resolve unresolved UPCs and prevent publish without proof, without building a full new workflow.

**Likely files/modules changed**
- `apps/web/lib/pipeline/publish.ts`
- `apps/web/app/api/admin/pipeline/[upc]/route.ts`
- `apps/web/app/api/admin/pipeline/source-attempts/route.ts`
- `apps/web/app/api/admin/upc-resolution/[upc]/route.ts` (new manual actions endpoint)
- `apps/web/components/admin/pipeline/NeedsAttentionView.tsx`
- `apps/web/components/admin/pipeline/UpcResolutionPanel.tsx` (new)
- `apps/web/components/admin/pipeline/PipelineProductDetail.tsx`
- `apps/web/lib/pipeline/core.ts` only if transition guard is added before publish.

**Schema changes**
- Uses MVP 0 columns/tables. No additional schema unless manual notes need a dedicated audit field.

**Smallest safe tasks**
1. Add `assertPublishableUpcIdentity(upc/product)` in `apps/web/lib/upc-resolution/gates.ts`.
2. In `publishToStorefront()`, block publish when V2 is enabled and `upc_resolution_status` is not `confirmed`, `manual_override`, or `private_label`.
3. Add manual actions:
   - Confirm selected evidence (`manual_override`, requires evidence URL/source and admin note).
   - Correct UPC (update product UPC only if existing product constraints allow; otherwise create explicit “needs data correction” note).
   - Mark `private_label` / “no GS1 UPC available” with reason.
   - Requeue UPC resolution V2.
   - Requeue packaging UPC extraction when images exist.
4. Extend Needs Attention grouping to show reason buckets, not only `source_error`:
   - `Distributor source error`
   - `No UPC proof`
   - `Conflicting UPC evidence`
   - `Provider credentials/rate limit`
   - `Packaging image needed`
5. Add compact UPC evidence panel in product detail:
   - Expected UPC and check-digit status.
   - Best confirmed/candidate evidence cards.
   - Source outcome timeline from `upc_resolution_events` / latest `enrichment_source_attempts`.
   - Candidate URLs with source stage and reason below/above gate.
   - Manual action buttons.

**Acceptance criteria**
- A V2 unresolved/conflict product cannot publish even if it reaches `reviewing`.
- Admin can see why the product needs attention without reading raw JSON.
- Admin can mark a valid exception (`manual_override` or `private_label`) and then publish.
- Manual actions write actor, timestamp, note, and evidence into product fields/events.

**Tests/validation commands**
- `bun run web test -- --testPathPatterns="publish|upc-resolution|pipeline"`
- `bun run web test -- --testPathPatterns="NeedsAttention|UpcResolutionPanel"`
- `bun run web typecheck`
- `bun run web lint`

**Rollback / feature flag**
- `UPC_PUBLISH_GUARD_ENABLED=false` disables publish guard in emergency, while still showing evidence.
- Manual action endpoint can remain present; hiding UI actions is enough to stop use.

**Risks**
- Blocking publish may surprise users for legacy products. Apply guard only to V2-attempted products at first, then backfill gradually.
- UPC correction may touch many related tables due historical SKU→UPC rename; treat correction as separate explicit workflow if constraints are unclear.

---

## Later improvements

### Later 1 — Production provider enablement and cache optimization
**Goal:** Enable the bakeoff winner(s) in production, reduce repeated provider calls, and monitor cost.

**Tasks**
1. Add provider TTL policy per provider (`GS1` longer, marketplace providers shorter).
2. Short-circuit provider stage from `upc_provider_lookup_cache` when fresh and still license-safe.
3. Add per-provider rate limit/backoff and circuit breaker in scraper adapter.
4. Add cost/latency dashboard cards to admin health view.

**Acceptance**
- Cache hit rate visible.
- Provider errors do not break distributor/official stages.
- Cost per confirmed UPC is tracked.

### Later 2 — Packaging OCR/VLM UPC extraction
**Goal:** Use product/package images to read barcode digits only after text/licensed/SERP evidence fails.

**Likely files/modules changed**
- `apps/web/supabase/migrations/20260624xxxx_packaging_upc_resolution.sql`
- `apps/web/lib/packaging/workflow.ts`
- `apps/web/app/api/scraper/v1/packaging-extractions/[id]/result/route.ts`
- `apps/web/app/api/admin/packaging/[upc]/route.ts`
- `apps/web/components/admin/pipeline/PackagingEvidencePanel.tsx`
- `apps/scraper/runner/packaging_extraction.py`
- `apps/scraper/src/ocr/image_selector.py`
- `apps/scraper/scrapers/utils/upc_utils.py`

**Schema changes**
- Extend `product_packaging_extractions.trigger_check` to include `upc_resolution`.
- No new table required if MVP 0 `upc_resolution_events` exists.

**Tasks**
1. Add prompt/schema version `packaging-upc-v1` that asks specifically for barcode/UPC digits and visible evidence.
2. Add `upc`, `barcode_digits`, `barcode_visible`, and per-field confidence to `structured_facts`.
3. In scraper, validate extracted digits with `validate_check_digit()` and compare to expected UPC before submitting success evidence.
4. In web callback, validate again with TS UPC helper.
5. If extracted UPC matches expected and confidence ≥0.85, set `upc_resolution_status='confirmed'`, stage `vlm_packaging`, confidence ~0.97.
6. If VLM extracts a different valid UPC, set `conflict` and keep product in manual review.
7. If no images are available, record `skipped` with reason `no_images`.

**Acceptance**
- VLM cannot confirm UPC unless check digit passes and digits match expected UPC.
- Different valid UPC from packaging always routes to manual review.
- Existing packaging-title workflow remains unaffected.

**Rollback**
- `PACKAGING_UPC_ENABLED=false` and do not queue `trigger='upc_resolution'` jobs.

### Later 3 — Optional Scale SERP / Google Products evidence
**Goal:** Evaluate Google Products as a structured candidate/evidence source after licensed feeds.

**Tasks**
1. Add provider in bakeoff only first.
2. Accept `found` only if the product result or linked merchant page contains exact GTIN/UPC and brand/title gates pass.
3. Treat non-exact Google Shopping matches as candidates only.

**Risk**
- SERP/Google scraping terms are higher risk; use primarily for identity evidence, not content ingestion.

### Later 4 — Research-agent alignment without runtime coupling
**Goal:** Reuse proven scoring ideas from `apps/research-agent` without making it a scraper/web dependency.

**Tasks**
1. Keep research-agent as local/shadow pipeline per `apps/research-agent/AGENTS.md`.
2. If official-domain/SERP scoring stabilizes, promote small pure schemas/helpers to `packages/api` rather than importing app internals.
3. Use research-agent tests (`candidate-verifier`, `serper-candidate-discovery`, `jsonld-extractor`) as reference cases for scraper adapter tests.

---

## Provider bakeoff plan

### Providers to evaluate
| Provider | Role in cascade | Acceptance posture |
|---|---|---|
| EcomSource | Broad commercial UPC resolver | Good primary candidate if exact UPC echo + low false positives. Marketplace-derived content should be license-reviewed before publishing. |
| ShopAPIS | Broad marketplace + Chewy-relevant pet data | Strong pet vertical contender; exact UPC/GTIN echo required. |
| Open Icecat | Brand-authorized structured content | Low licensing risk; likely category-limited. Exact GTIN or manufacturer product ID + brand evidence required. |
| Open Pet Food Facts | Open pet-food barcode database | Pet food only; ODbL attribution if content is reused. Exact barcode evidence required. |
| GS1 validation | Authoritative GTIN/licensee validation | Use for internal identity validation and brand/licensee confidence; do not republish restricted GS1 content without legal approval. |
| Scale SERP / Google Products (optional) | Candidate/evidence source after licensed feeds | Exact GTIN/UPC evidence required; no content publishing from arbitrary merchant pages. |

### Bakeoff dataset
- 500–1,000 UPCs, stratified by:
  - Current distributor `found` vs all-distributor `not_stocked`.
  - Pet food, pet supplies/accessories, hardware/DIY categories.
  - Top brands and long-tail brands.
  - Known valid UPC check digit and intentionally suspicious/import-error UPCs.
- Keep a manually reviewed gold subset of at least 100 provider hits.

### Metrics
- Exact UPC/GTIN echo rate.
- Brand compatibility score.
- Title/size/flavor descriptor overlap.
- Image availability and field completeness.
- Conflict rate against distributor/official evidence.
- False positive rate in gold subset.
- p50/p95 latency.
- Estimated cost per lookup and per confirmed UPC.
- License profile: `publish_allowed`, `internal_validation_only`, `attribution_required`, `unknown_review_required`.

### Decision rule
- Choose no automatic provider until legal posture and gold false-positive review pass.
- Prefer the cheapest provider that meets accuracy/terms for BayState’s categories; use others as secondary/category-specific.
- Keep GS1 as validation, not enrichment, unless terms are explicitly upgraded.

---

## Confidence and evidence gates

### Accepted proof gates
| Evidence kind | Required signals | Confidence guidance | Auto-advance? |
|---|---|---:|---|
| Distributor exact UPC | Distributor page/result explicitly matches expected UPC/GTIN or source adapter verified UPC search result | 0.95–0.98 | Yes |
| Official exact UPC | Official domain page JSON-LD/meta/text/variant offer contains expected UPC/GTIN | 0.98 | Yes |
| Official high-confidence no UPC | Official product page, official domain, brand/domain match, strong descriptor + variant/size match, no conflicting GTIN/SKU | 0.90–0.94 | Yes, with sampling review flag |
| GS1 validation | Expected GTIN valid and licensed to compatible brand/company | 0.95 | Identity validation only; content restricted |
| Open Icecat exact GTIN | Exact GTIN plus brand/manufacturer match | 0.90–0.94 | Yes |
| EcomSource/ShopAPIS exact UPC | Provider echoes exact UPC/GTIN, brand/title/variant gates pass | 0.86–0.92 | Yes, depending bakeoff/legal |
| Open Pet Food Facts exact barcode | Exact barcode plus pet-food/category/brand compatibility | 0.82–0.88 | Yes for identity, content with attribution only |
| SERP exact UPC | Crawled candidate page/Google product evidence contains exact expected UPC and brand/title gates pass | 0.85–0.90 | Yes for identity only; do not use arbitrary-page content publicly |
| Packaging VLM exact UPC | Extracted digits match expected UPC, check digit passes, field confidence ≥0.85 | 0.95–0.97 | Yes |
| Manual override | Admin selects evidence/enters note | 1.0 manual | Yes |
| Private label/no UPC | Admin explicitly marks exception | 1.0 manual | Yes, publish with alternate identity anchor |

### Rejected/candidate gates
- SERP result without exact UPC: cap confidence at 0.69, outcome `not_stocked`, status `candidate` or `unresolved`.
- Official page without UPC and weak variant match: cap confidence at 0.75, outcome `not_stocked`, manual review.
- Licensed provider response that does not echo the queried UPC/GTIN: candidate only unless provider contract/API guarantees exact lookup semantics and bakeoff proves safety.
- Any valid but different UPC from a credible source: conflict, fail closed.
- Any failed check digit from OCR/VLM: reject as proof; store raw text only.

---

## Source outcome/status handling rules

Use existing source attempt outcomes only:

- `found`
  - Only when the stage meets an accepted proof gate.
  - Must include `confidence`, `matchedFields`, `evidenceUrl` when applicable, and `resolutionEvidence` with `evidence_kind`, `stage`, `expected_upc`, observed UPC if present, and gate reason.
- `not_stocked`
  - Stage ran cleanly but did not prove the expected UPC.
  - Also used for “candidate(s) found but below gate”; store candidates in `resolutionEvidence`, not as a found product.
- `source_error`
  - Stage could not run or evidence is unsafe/hard-conflicting.
  - Use `error_code` values like `auth_required`, `rate_limited`, `network_error`, `policy_blocked`, `upc_conflict`, `brand_conflict`, `invalid_provider_response`.
- `skipped`
  - Stage intentionally not attempted due disabled flag, no credentials, category not applicable, no images, or budget cap.

Product-level V2 status:
- Any accepted proof → `upc_resolution_status='confirmed'`, pipeline may advance to `processed`.
- Candidate evidence but no proof → `candidate` or `unresolved`, pipeline `needs_attention`.
- Conflicting credible UPCs → `conflict`, pipeline `needs_attention`.
- Admin exception → `manual_override` or `private_label`, publish allowed with audit note.

---

## Admin/manual-review UX requirements

Keep this minimal and integrated into existing pipeline UI:

1. **Needs Attention reason grouping**
   - Extend `NeedsAttentionView` to group by UPC-resolution reason, not just source errors.
2. **UPC Resolution panel**
   - Show expected UPC and check-digit validity.
   - Show best evidence cards by stage/source, with confidence and matched fields.
   - Show candidate URLs/results that were rejected below gate.
   - Show conflicts prominently.
3. **Actions**
   - Retry UPC Resolution V2.
   - Requeue packaging UPC extraction if images exist.
   - Confirm selected evidence manually with required note.
   - Mark private label/no GS1 UPC with required note.
   - Correct UPC only through an explicit guarded workflow.
4. **Publish guard messaging**
   - If publish is blocked, show the exact missing proof/conflict reason and link back to the UPC Resolution panel.

Do not build a broad dashboard in MVP; use the existing `NeedsAttentionView`, product detail pane, and source attempts endpoint.

---

## Files to Modify
- `apps/web/lib/approved-sources/source-plan.ts` — synthesize V2 staged fallback entries and stop legacy SERP-as-official behavior when enabled.
- `apps/web/lib/approved-sources/types.ts` — extend source plan/job option types as needed.
- `apps/web/lib/pipeline-scraping.ts` — send `upc_resolution_policy`, provider flags, and V2 source plans in job config.
- `apps/web/lib/pipeline-scraping-types.ts` — add V2 scrape options.
- `apps/web/lib/scraper-callback/enrichment-result.ts` — parse resolution evidence, V2 status rules, source attempt raw evidence.
- `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` — persist product-level UPC state and events.
- `apps/web/lib/pipeline/publish.ts` — enforce no publish without UPC proof/manual exception.
- `apps/web/app/api/admin/pipeline/[upc]/route.ts` — expose UPC resolution fields and manual update support.
- `apps/web/app/api/admin/pipeline/source-attempts/route.ts` — include evidence fields for review UI.
- `apps/web/components/admin/pipeline/NeedsAttentionView.tsx` — reason grouping and retry actions.
- `apps/web/components/admin/pipeline/PipelineProductDetail.tsx` — add UPC evidence panel.
- `apps/scraper/scrapers/approved_sources/executor.py` — staged V2 cascade execution.
- `apps/scraper/scrapers/approved_sources/types.py` — source plan/source result schema parity.
- `apps/scraper/scrapers/approved_sources/result_builder.py` — skipped/proof-gated result helpers.
- `apps/scraper/scrapers/approved_sources/adapters/registry.py` — register new adapters.
- `apps/scraper/scrapers/approved_sources/adapters/serp_discovery.py` — strict candidate mode or wrapper.
- `apps/scraper/scrapers/ai_search/enrichment_models.py` — optional resolution evidence fields.
- `apps/scraper/scrapers/utils/upc_utils.py` — add comparison helpers if needed.
- `apps/web/supabase/migrations/*.sql` — additive UPC resolution/provider schema.

## New Files
- `apps/web/lib/upc-resolution/types.ts` — evidence and decision types.
- `apps/web/lib/upc-resolution/upc.ts` — TS UPC validation.
- `apps/web/lib/upc-resolution/gates.ts` — product/source proof gates and publish guard helper.
- `apps/web/lib/upc-resolution/source-results.ts` — source result to product resolution reducer.
- `apps/web/app/api/admin/upc-resolution/[upc]/route.ts` — manual review actions.
- `apps/web/components/admin/pipeline/UpcResolutionPanel.tsx` — compact evidence/review UI.
- `apps/web/lib/upc-providers/types.ts` — normalized provider response types for bakeoff/cache.
- `apps/web/scripts/upc-provider-bakeoff.ts` — provider bakeoff runner.
- `apps/scraper/scrapers/approved_sources/upc_resolution.py` — Python proof gates used by adapters.
- `apps/scraper/scrapers/approved_sources/adapters/official_brand_crawl.py` — official-domain UPC resolver.
- `apps/scraper/scrapers/approved_sources/adapters/serp_candidate_discovery.py` — strict SERP candidate resolver, if not wrapping existing adapter.
- `apps/scraper/scrapers/approved_sources/adapters/barcode_lookup.py` — licensed/barcode stage adapter.
- `apps/scraper/scrapers/approved_sources/adapters/barcode_providers/*.py` — provider clients.
- `docs/adr/0006-upc-resolution-proof-required.md` — accepted V2 behavior.

## Dependencies
- MVP 1 depends on MVP 0 evidence schema/gates.
- MVP 2 provider production enablement depends on bakeoff/legal review; shadow mode can be implemented before final provider selection.
- MVP 3 publish guard depends on MVP 0 product-level resolution fields.
- Packaging VLM depends on existing packaging extraction runner and MVP 0 event/status model.
- Research-agent reuse is later only and must not become a scraper dependency.

## Risks
- **False positives**: Mitigate by exact UPC/GTIN gates, strict official/licensed rules, and manual false-positive bakeoff review.
- **Legal/licensing**: Treat GS1 as internal validation unless contract allows more; do not publish arbitrary SERP/marketplace content by default.
- **Increased manual review**: Expected initially. Measure by stage hit rate and add providers only after bakeoff.
- **Provider cost/rate limits**: Shadow mode, cache, TTL, circuit breaker, and per-provider budget caps.
- **Async packaging races**: Packaging UPC success may arrive after source cascade sets `needs_attention`; callbacks must re-read current product status and only advance when still unresolved/conflict-free.
- **Legacy behavior regressions**: Keep all V2 logic behind explicit job config and environment flags until validated.

---

## Final worker meta-prompt

```text
Implement BayState UPC Resolution V2 MVP. Read root AGENTS.md plus apps/scraper/AGENTS.md before editing. Keep apps/web as coordinator/persistence/UI and apps/scraper as API-only runner; do not add direct DB access to scraper and do not import Python internals into TypeScript. Start with MVP 0 and MVP 1 from plans/upc-fallback-implementation-plan.md: additive UPC resolution schema, TS/Python UPC proof gates, callback persistence gated by job_config.upc_resolution_policy='proof_required', V2 source-plan staging, executor staged cascade, official_brand_crawl adapter, and strict SERP candidate behavior. Preserve legacy behavior when UPC_RESOLUTION_V2_ENABLED is false. Do not add new source attempt outcomes beyond found/not_stocked/source_error/skipped. Add focused web Jest tests and scraper pytest tests listed in the plan, then run the focused commands. Leave provider bakeoff, production provider enablement, packaging UPC VLM, and broad admin dashboard work for later milestones unless explicitly assigned.
```
