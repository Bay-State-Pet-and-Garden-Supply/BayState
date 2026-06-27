# Missing-Distributor-UPC Decision Framework & Target Architecture

## Problem Statement

Products enter BayState with a UPC (GTIN-12) from the distributor feed or import spreadsheet. Many official brand product pages and secondary distributor sites do not surface that UPC in their page markup (structured data, meta, or visible text), so the extinction pipeline (`processed → grouping → merging`) cannot verify the identity match through its existing scraping alone. When the UPC is absent from every available distributor source, the system must decide which fallback resolution methods to attempt, in what order, under what confidence gates, and when to fail closed for manual review.

---

## 1. Recommended Cascade Stages

The cascade is an ordered sequence of resolution stages. Each stage records its outcome and confidence in `enrichment_source_attempts`. A stage that produces a **confirmed match** (confidence ≥ gate threshold) ends the cascade for that UPC. A stage that produces a **candidate match** (confidence below gate but above minimum) is stored as `needs_review` and the cascade continues. A stage that fails or finds nothing records `source_error` or `not_stocked` and the cascade falls through to the next stage.

### Stage 0 — Distributor Feed / Import Data (already done)

The UPC arrives with the product during import (`products_ingestion.input`). This is the **authoritative seed** — not a resolution method, but the anchor against which all later stages are validated.

### Stage 1 — Distributor Scraping (current cascade)

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Brand source cascade per ADR 0001: walk configured distributor sources top-to-bottom, scrape all, keep all |
| **Integration** | `apps/web/lib/pipeline.ts`, `brand_sources` table, `enrichment_source_attempts` table |
| **UPC presence check** | The verifier in `apps/research-agent/src/pipeline/verification/candidate-verifier.ts` checks if the expected UPC (via `normalizeBarcode()`) appears in extracted facts (JSON-LD `gtin`, `gtin12`, `sku`, heuristic text matches) |
| **Outcome when absent** | Records `upc_not_found` warning; identity confidence drops to title/brand overlap scoring |
| **When this stage ends** | If any distributor source records `found` with UPC confirmed → **done**. If all distributors return `not_stocked` or `source_error` → fall through. |

### Stage 2 — Official Brand Site Crawling

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Research agent's `OfficialDomainDiscovery` + `SerperCandidateDiscovery` with `site:` operator targeting the official brand domain |
| **Integration** | `apps/research-agent/src/pipeline/discovery/official-domain-discovery.ts`, `serper-candidate-discovery.ts`, `sitemap-url-discovery.ts` |
| **UPC resolution path** | Search official site sitemap for URL fragments containing the UPC digits. Use `site:brand.com "upc_digits"` via Serper. Crawl product pages and extract JSON-LD `gtin` / `sku` fields via `JsonLdExtractor` |
| **Confidence gate** | UPC found in JSON-LD on official domain → confidence 0.98 (from verifier). UPC not found but strong brand/title overlap → confidence ~0.75, marked `needs_review` |
| **Data model** | Results stored in `official_brand_url_candidates` and `product_scraped_sites` tables |
| **Fall-through** | Official site doesn't carry the product or requires login → drop to Stage 3 |

### Stage 3 — SERP Discovery (Broad Web Search)

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Research agent's `SerperCandidateDiscovery` with quoted UPC search (`"012345678905"`). Discovers candidate URLs from any domain (retailers, aggregators, marketplaces) that mention the UPC |
| **Implementation** | `apps/research-agent/src/pipeline/discovery/serper-candidate-discovery.ts` - `buildSkuDiscoveryQuery()` produces quoted UPC query |
| **Candidate classification** | URLs are deduped, ranked by `rankCandidates()` (authority, path score, relevance), and the top N are acquired for fact extraction |
| **Verification** | `DefaultCandidateVerifier` checks: (1) does extracted facts contain our UPC? If yes → confidence 0.98. (2) Does brand overlap exist? If yes → confidence boost. (3) Title descriptor overlap |
| **Confidence gates** | Direct UPC match on any domain → 0.98, auto-select. Brand + descriptor match without UPC → 0.5–0.85, `needs_review` |
| **Guardrail** | `isCandidateUnsafeForCanonicalSelection()` blocks auto-selection on search pages, collections, blogs, PDFs |
| **Official-domain promotion** | If an off-domain candidate wins, `pickPromotableOfficialCandidate()` tries to find a safe official-domain candidate with slightly lower thresholds |
| **Fall-through** | No candidates or all rejected → Stage 4 |

### Stage 4 — Licensed Barcode Database Query

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Query one or more paid/licensed barcode databases (GS1 US Product API, Go-UPC, etc.) for product name, brand, and attributes associated with the UPC |
| **GS1 US Product API** | Requires GS1 US Data Hub View/Use subscription. Returns brand name, product description, GPC category, company info. ~$1,000–5,000/yr depending on volume (tiered) |
| **Go-UPC API** | Commercial barcode database, ~$50–200/mo. Returns product name, brand, images, category. Good secondary source |
| **brocade.io** | Open-source GTIN database (Ruby/Rails, MIT). Self-hostable. Currently ~139 GitHub stars — coverage is limited but grows with contributions. Free |
| **Confidence** | GS1 = authoritative (0.95+), Go-UPC = high (0.85+), brocade.io = moderate (0.7+). Must cross-reference retrieved brand name against expected brand (soft match) |
| **Data model** | Add `source_type: 'licensed_feed'` rows to `brand_sources`. Store result in `products_ingestion.sources.licensed_{provider}`. Use existing `normalizeProductSources()` pipeline |
| **Cost optimization** | Batch queries by UPC prefix (GS1 company prefix). Cache results in a local `barcode_lookups` table with TTL. GS1 API has rate limits; stagger |
| **Fall-through** | No match or no subscription → Stage 5 |

### Stage 5 — OCR / VLM Packaging Image Extraction

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Pass product packaging images to a Vision Language Model (Qwen2.5-VL via local OpenAI-compatible endpoint, or Gemini Vision) to extract text from the label/packaging — including the UPC barcode digits |
| **Integration** | `apps/scraper/src/ocr/image_selector.py` selects best images (UPC-aware). `product_packaging_extractions` table tracks attempts. `product_title_suggestions` stores results |
| **UPC extraction path** | VLM is prompted to read the barcode digits from the packaging image. `structured_facts` JSON includes `upc` field. `field_confidence` provides per-field confidence |
| **Validation** | Extracted UPC digits are validated via GS1 check digit algorithm (`apps/scraper/scrapers/utils/upc_utils.py`: `validate_check_digit()`). If check digit passes AND the extracted digits match the expected UPC → extremely high confidence (0.97+). If they differ but both pass check digit → conflict → manual review |
| **Confidence gate** | UPC digit match + check digit pass + overall_confidence ≥ 0.85 → accepted. No UPC found in image but other fields match → `needs_review` |
| **Conflict detection** | `product_packaging_extractions.conflicts` column stores detected conflicts between packaging evidence and existing text sources |
| **Fall-through** | No images available, VLM fails, or confidence too low → Stage 6 |

### Stage 6 — AI-SERP / LLM-Heuristic Resolution

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Use an LLM (DeepSeek/Gemini) with web search tool access to research the product. The LLM is given the UPC, brand, register name, and instructed to find the product's canonical identity by browsing |
| **Integration** | Not yet implemented. Would extend the `consolidation` pipeline (`apps/web/lib/consolidation/`) or the `research-agent` with a new discovery provider that uses tool-calling LLM |
| **Confidence** | LLM must cite the source URL where it found the UPC or enough evidence to confirm identity. Without a verifiable source URL, confidence caps at 0.5 |
| **Guardrail** | Requires explicit human review before any auto-promotion. Output must include `evidence_url` and `matched_fields` for audit |
| **Fall-through** | LLM cannot confirm → Stage 7 |

### Stage 7 — Manual Review / Research

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Product enters `needs_attention` pipeline status. Admin is presented with all evidence gathered by stages 1–6, plus tools to: contact distributor, search brand catalog, assign a different UPC, mark as "private label / no UPC available", or manually enter a canonical URL |
| **Integration** | `products_ingestion.pipeline_status = 'needs_attention'`. Admin UI under `/admin/pipeline` shows "Needs Attention" tab with collated evidence |
| **Resolution options** | (1) Assign UPC manually — operator finds the UPC from brand catalog/packaging. (2) Mark as `private_label` — brand owns the product, no GS1 UPC exists. (3) Reassign to a corrected UPC (data entry error). (4) Escalate to brand outreach — contact manufacturer for master data |
| **Exit** | Operator resolves or marks as known dead end (UPC truly unrecoverable → flag for deletion/discontinuation) |

---

## 2. Confidence / Evidence Gates

Each resolution stage must produce a confidence score and one or more evidence signals before its result is trusted. The following gates determine how the system treats each stage's output:

### Gate Definitions

| Gate Tier | Score Range | Treatment |
|-----------|-------------|-----------|
| **Authoritative** | ≥ 0.95 | Auto-accepted. Pipeline continues normally. Requires: UPC check-digit validation OR GS1 verified source + brand match |
| **High Confidence** | 0.85 – 0.94 | Auto-accepted but flagged for sampling review (1 in 20). Requires: UPC match on official domain JSON-LD OR VLM extraction with check-digit pass |
| **Moderate Confidence** | 0.70 – 0.84 | Accepted but enters a "low-certainty review queue". Admin must validate. UPC match without brand corroboration. Strong brand + descriptor overlap without UPC |
| **Low Confidence** | 0.40 – 0.69 | Not accepted. Candidate stored for reference. Product marked `needs_attention` |
| **Rejected** | < 0.40 | Ignored entirely. No evidence recorded |

### Evidence Provenance Model

Every resolved UPC identity field must carry provenance, matching the existing `EvidenceValue<T>` schema (`apps/research-agent/src/schemas/Evidence.ts`):

```typescript
interface EvidenceValue<T> {
  value: T;
  confidence: number;           // 0.0–1.0
  sourceType: EvidenceSourceType; // "input" | "candidate" | "heuristic" | "jsonld" | "meta" | "scraper" | "manual" | "licensed_feed" | "vlm"
  sourceUrl?: string;           // Where the evidence was found
  evidence: string;             // Human-readable justification
}
```

The `ProductResearchReport.productIdentity.upc` field already uses this schema. Extend `EvidenceSourceType` to add `"licensed_feed"` and `"vlm"` for the new stages.

### Fail-Closed Rules

1. **No distributor source ran successfully → block SERP.** ADR 0001 already enforces this: if a distributor returns `source_error` (not `not_stocked`), the SERP stage is skipped. The UPC goes to `needs_attention`.

2. **No UPC match anywhere → no auto-publish.** A product MUST have a UPC confirmed by at least one stage at ≥ 0.70 confidence before it can leave `reviewing` → `publishing`. Products below this threshold remain `needs_attention`.

3. **Conflicting UPCs → block cascade, manual triage.** If two stages produce different UPCs that both pass check-digit validation, the conflicting evidence is stored and the product goes to `needs_attention`. The operator must resolve the conflict.

4. **VLM extraction with check-digit failure → reject.** If the VLM reads barcode digits from packaging but the check digit fails, it's likely a misread. Store the raw text but do not use the UPC.

5. **Private label / no-UPC → product flag.** Some brands produce products without GS1 UPCs (private label, store brand, sample/trial sizes). These should be flagged with `upc_source: 'private_label'` and allowed to publish with the distributor's internal SKU as the identity anchor, but they must be explicitly marked so the system doesn't keep trying to resolve them.

---

## 3. Data Model & Instrumentation

### New Columns / Tables Required

#### `products_ingestion` additions

```sql
-- Track the confidence of the UPC resolution, separate from overall consolidation confidence
ALTER TABLE public.products_ingestion
  ADD COLUMN upc_resolution_stage text,     -- 'distributor_feed' | 'distributor_scrape' | 'official_brand_site' | 'serp_discovery' | 'licensed_database' | 'vlm_packaging' | 'llm_research' | 'manual_review'
  ADD COLUMN upc_resolution_confidence numeric,  -- 0.0–1.0
  ADD COLUMN upc_resolved_at timestamptz,
  ADD COLUMN upc_resolved_by uuid,               -- FK to auth.users (if manual)
  ADD COLUMN upc_source_type text,               -- 'gs1' | 'private_label' | 'distributor_sku' | 'unresolved'
  ADD COLUMN upc_provenance jsonb;               -- Array of EvidenceValue<upc> for audit trail
```

#### `enrichment_source_attempts` — already exists, use as-is

```sql
-- Existing columns cover cascade tracking:
-- source_type (official_brand | distributor | internal | licensed_feed)
-- outcome (found | not_stocked | source_error | skipped)
-- confidence, matched_fields, evidence_url, error_code, error_message
```

Add new `outcome` value if needed:
```sql
ALTER TYPE public.enrichment_outcome ADD VALUE IF NOT EXISTS 'upc_match_only';
ALTER TYPE public.enrichment_outcome ADD VALUE IF NOT EXISTS 'conflict';
```

#### `barcode_lookups` — new cache table (optional, for licensed feeds)

```sql
CREATE TABLE IF NOT EXISTS public.barcode_lookups (
  upc text PRIMARY KEY,
  provider text NOT NULL,           -- 'gs1_us' | 'go_upc' | 'brocade'
  product_name text,
  brand text,
  category text,
  description text,
  image_url text,
  raw_response jsonb,
  confidence numeric NOT NULL,
  queried_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL   -- TTL-based expiry for cache freshness
);
CREATE INDEX idx_barcode_lookups_expires ON public.barcode_lookups (expires_at)
  WHERE expires_at < now();
```

#### `product_upc_resolution_log` — new audit table

```sql
CREATE TABLE IF NOT EXISTS public.product_upc_resolution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upc text NOT NULL,
  product_id uuid REFERENCES public.products(id),
  stage text NOT NULL,               -- Which cascade stage ran
  outcome text NOT NULL,             -- 'match' | 'no_match' | 'conflict' | 'error' | 'skipped'
  confidence numeric,
  evidence jsonb NOT NULL DEFAULT '{}',  -- Full evidence chain
  source_urls text[],
  matched_fields text[],
  error_message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_upc_resolution_log_upc ON public.product_upc_resolution_log (upc, created_at DESC);
CREATE INDEX idx_upc_resolution_log_outcome ON public.product_upc_resolution_log (outcome);
```

#### Extend EvidenceSourceType

```typescript
// In apps/research-agent/src/schemas/Evidence.ts
const evidenceSourceTypeSchema = z.enum([
  "input",
  "candidate",
  "heuristic",
  "jsonld",
  "meta",
  "scraper",
  "manual",
  "licensed_feed",    // NEW
  "vlm",              // NEW — Vision Language Model
]);
```

### Key Metrics to Track

| Metric | Source | Purpose |
|--------|--------|---------|
| Stage hit rate | `product_upc_resolution_log` | % of UPCs resolved by each stage |
| Stage latency p50/p95 | `product_upc_resolution_log.duration_ms` | Runtime cost per stage |
| Confidence distribution | `products_ingestion.upc_resolution_confidence` | How confident are our UPCs overall? |
| Needs-attention rate | `products_ingestion.pipeline_status = 'needs_attention'` | How many products require manual UPC resolution? |
| Barcode DB hit rate | `barcode_lookups` | GS1/Go-UPC cache efficiency |
| VLM check-digit pass rate | `product_packaging_extractions.field_confidence->'upc'` | VLM reliability for barcode digits |
| Conflict rate | `product_upc_resolution_log.outcome = 'conflict'` | Rate of cross-source UPC conflicts |
| Private-label rate | `products_ingestion.upc_source_type = 'private_label'` | Prevalence of non-GS1 products |

---

## 4. Operational Workflow for Ambiguous Cases

### Resolution Flow

```
All distributor sources exhausted, UPC not confirmed
                    │
                    ▼
         ┌──────────────────────┐
         │  Stage 2: Official   │
         │  Brand Site Crawl    │
         └──────────┬───────────┘
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
    UPC found          UPC not found
    (≥0.95)            (or site down)
          │                    │
     ┌────┘           ┌────────┘
     ▼                ▼
  Done         ┌──────────────────────┐
        │  Stage 3: SERP Discovery│
        └──────────┬───────────────┘
                   │
          ┌────────┴───────────┐
          ▼                    ▼
    UPC on any         No UPC found
    domain (≥0.98)          │
          │                 │
     ┌────┘        ┌────────┘
     ▼             ▼
  Done     ┌──────────────────────┐
           │  Stage 4: Licensed   │
           │  Barcode DB Query    │
           └──────────┬───────────┘
                      │
             ┌────────┴───────────┐
             ▼                    ▼
       Brand match         No match or
       + description       subscription
       (≥0.85)             unavailable
             │                    │
        ┌────┘           ┌────────┘
        ▼                ▼
     Done       ┌──────────────────────┐
                │  Stage 5: VLM/OCR    │
                │  Packaging Extract   │
                └──────────┬───────────┘
                           │
                  ┌────────┴────────────┐
                  ▼                     ▼
            Barcode digits        No digits
            + check-digit OK      or check fail
            (≥0.85)                     │
                  │                     │
             ┌────┘            ┌────────┘
             ▼                 ▼
          Done      ┌──────────────────────┐
                    │  Stage 6: LLM/Web    │
                    │  Research            │
                    └──────────┬───────────┘
                               │
                      ┌────────┴──────────┐
                      ▼                   ▼
                LLM confirms         Cannot confirm
                with source URL      with source URL
                (≥0.70)              (<0.70)
                      │                   │
                 ┌────┘          ┌────────┘
                 ▼               ▼
          Done (review)  ┌──────────────────────┐
                         │  Stage 7: Manual     │
                         │  Review              │
                         └──────────┬───────────┘
                                    ▼
                           Operator resolves or
                           marks private_label
```

### Admin UI Integration Points

| UI Component | File | What to Add |
|---|---|---|
| Pipeline tab "Needs Attention" | `apps/web/components/admin/pipeline/` | New tab showing products with `upc_resolution_confidence < 0.70` or `pipeline_status = 'needs_attention'` |
| UPC resolution panel | `apps/web/app/api/admin/pipeline/[upc]/route.ts` | Add `upc_provenance` to GET response. Add `upc_source_type` to PATCH for manual overrides |
| Consolidation review UI | `apps/web/components/admin/pipeline/consolidation/` | Display UPC provenance evidence chain alongside consolidated data |
| UPC resolution health dashboard | New page or widget | Hit rate per stage, needs-attention count, VLM accuracy, barcode DB cache stats |

### Escalation Rules

1. **Auto-escalate to `needs_attention` after stage 4** if no UPC found. Stages 5–7 are gated (require images or human time), so the product sits in `needs_attention` while stages 5–6 are attempted asynchronously.

2. **Stale cascade retry** — products in `needs_attention` for >7 days due to "no images available for VLM" should be flagged for manual review with a suggestion to acquire packaging photos.

3. **Brand-level UPC health threshold** — if >10% of a brand's products enter `needs_attention` from UPC resolution failures, alert the admin. The brand's cascade configuration may need adjustment (e.g., add a licensed feed, fix official domain).

### Cross-Source Conflict Resolution

When two sources disagree on the UPC for the same product:

1. **Check-digit wins** — if only one candidate UPC passes the GS1 check digit, trust it.
2. **GS1 wins over heuristic** — if one candidate comes from GS1 API or official brand JSON-LD, trust it over heuristic text extraction.
3. **VLM wins over SERP** — if packaging VLM read the barcode directly, that's harder to fake than web text.
4. **First-seen wins** — at equal confidence, the first source that produced the match is kept (prevents oscillation).
5. **Manual override** — operator can select the correct UPC, which overrides all automatic resolution. Recorded with `upc_resolved_by`.

---

## 5. Phased Rollout Plan

### Phase 1 — Instrumentation & Visibility (2–3 weeks)

**Goal:** Understand current UPC resolution gap without changing behavior.

| Task | Area | Details |
|------|------|---------|
| Add `upc_resolution_stage` etc. columns to `products_ingestion` | DB migration | Columns listed in §3 above |
| Backfill `upc_provenance` from existing `products_ingestion.sources` data | Script | Extract which sources had UPC in JSON-LD vs heuristic only |
| Build UPC resolution log table | DB migration | `product_upc_resolution_log` |
| Add UPC provenance to admin pipeline API response | `apps/web/app/api/admin/pipeline/[upc]/route.ts` | Return `upc_provenance` evidence array |
| Build "UPC Resolution Health" dashboard | New page | `apps/web/app/admin/pipeline/upc-health/` — hit rates, confidence distribution, needs-attention queue size |
| Ship Phase 1 — observe for 1 week | | Measure: what % of products have UPC confirmed vs unresolved? What's the per-brand breakdown? |

### Phase 2 — Official Brand Site + SERP Integration (3–4 weeks)

**Goal:** Route unresolved UPCs through the existing research-agent pipeline.

| Task | Area | Details |
|------|------|---------|
| Wire research-agent discovery into source cascade | `apps/web/lib/pipeline-scraping.ts` | When distributors exhaust, trigger `runProductResearchPipeline()` for UPC resolution specifically |
| Add UPC-search search_mode to brand sources | DB + UI | Per brand_sources, support `search_mode: 'upc_search'` to enable SERP discovery |
| Ensure verifier UPC check gates trigger correct cascade outcomes | `apps/research-agent/src/pipeline/verification/candidate-verifier.ts` | Without UPC match, `identityConfidence` caps at 0.7 (title+brand overlap only). This creates the `needs_review` signal |
| Store SERP results in `enrichment_source_attempts` | `apps/web/lib/pipeline-scraping.ts` | Record `source_type: 'serp_discovery'` with outcome, evidence URL, confidence |
| Extend pipeline status transitions for `needs_attention` → `extracting` (retry) | `apps/web/lib/pipeline.ts` | Allow re-extraction for UPC resolution |
| Ship Phase 2 — observe for 2 weeks | | Measure: SERP hit rate, identity confidence distribution improvement, needs-attention reduction |

### Phase 3 — Licensed Barcode Database (2–3 weeks)

**Goal:** Add GS1/Go-UPC resolution for products that SERP couldn't find.

| Task | Area | Details |
|------|------|---------|
| Evaluate and purchase GS1 US Data Hub subscription | Ops | Required for GS1 Product API access |
| Build `barcode_lookups` cache table | DB migration | With TTL expiry |
| Build GS1 Product API client | New module `apps/web/lib/barcode-providers/gs1-us.ts` | Implements lookup, rate limiting, error handling |
| Build Go-UPC API client (secondary) | New module `apps/web/lib/barcode-providers/go-upc.ts` | Implements lookup, rate limiting |
| Add `licensed_feed` source type to cascade orchestration | `apps/web/lib/pipeline-scraping.ts` | After SERP, query barcode databases. Record in `enrichment_source_attempts` |
| Ship Phase 3 — observe for 1 week | | Measure: licensed feed hit rate, cost per resolved UPC, overlap with SERP |

### Phase 4 — VLM Packaging Extraction (3–4 weeks)

**Goal:** Extract UPC from product packaging images for products still unresolved.

| Task | Area | Details |
|------|------|---------|
| Ensure `product_packaging_extractions` trigger `image_selection` for UPC resolution | `apps/web/lib/pipeline-workflow.ts` | Trigger VLM extraction when UPC is the target, not just for title generation |
| Add UPC-specific VLM prompt | VLM prompt config | "Read the barcode number printed on this product package. Output the 12-digit UPC." |
| Wire check-digit validation into VLM outcome | `apps/scraper/scrapers/utils/upc_utils.py` | Validate extracted barcode digits; reject on check-digit failure |
| Route VLM `upc` field into `product_upc_resolution_log` | `apps/scraper/core/api_client.py` | When submitting results, include resolution stage metadata |
| Add UI for VLM UPC evidence | Admin pipeline detail page | Show extracted UPC from packaging alongside confidence score and field_confidence |
| Ship Phase 4 — observe for 2 weeks | | Measure: VLM UPC extraction success rate, check-digit pass rate, conflict rate with text sources |

### Phase 5 — LLM Research & Self-Healing (2–3 weeks)

**Goal:** Catch remaining unresolved UPCs with tool-using LLM, and build automated retry/alert loops.

| Task | Area | Details |
|------|------|---------|
| Build tool-calling LLM discovery provider | New provider in `apps/research-agent/src/pipeline/discovery/` | LLM with web search tool, instructed to find the UPC, gets candidate URL and evidence |
| Integrate into cascade as stage 6 | `apps/web/lib/pipeline-scraping.ts` | After VLM, before manual |
| Build retry scheduler for `needs_attention` products | New cron job or inngest function | Products in `needs_attention` due to "images not yet available" get retried weekly |
| Build UPC health alerts | Monitoring | When a brand's needs-attention rate exceeds threshold, alert admin |
| Ship Phase 5 | | Full cascade operational |

### Phase 6 — Closed-Loop Quality (ongoing)

| Task | Details |
|------|---------|
| Track and analyze UPC resolution accuracy | Compare manual corrections against auto-resolved to refine confidence gates |
| Feed corrected UPCs back into VLM training (if fine-tuning) | Improve barcode digit extraction accuracy |
| Build "UPC Confidence Score" into product listing quality gamut | Surface UPC provenance in admin product cards |
| Consider private-label detection | Heuristic: UPC prefix maps to known GS1 company prefix that doesn't match brand, or product has no offers with GTINs on any page |

---

## 6. File References to Integration Points

### Existing Code — Read & Understand First

| File | Relevance |
|------|-----------|
| `apps/research-agent/src/pipeline/runProductResearchPipeline.ts` | The full research pipeline (discovery → acquisition → extraction → verification → assembly). Main orchestration to reuse/modify for UPC resolution |
| `apps/research-agent/src/pipeline/discovery/serper-candidate-discovery.ts` | SERP-based candidate discovery with UPC-quoted search. `buildSkuDiscoveryQuery()` and `buildOfficialDomainQuery()` are key functions |
| `apps/research-agent/src/pipeline/discovery/official-domain-discovery.ts` | Sitemap-based discovery from official brand domain. Scans URLs for UPC digit fragments |
| `apps/research-agent/src/pipeline/verification/candidate-verifier.ts` | The verifier that checks UPC against extracted facts. Where `upcMatched` is decided, identity confidence computed |
| `apps/research-agent/src/pipeline/extraction/jsonld-extractor.ts` | Extracts `gtin`, `gtin12`, `sku` from page JSON-LD. Primary structured data source for UPC confirmation |
| `apps/research-agent/src/pipeline/extraction/text-heuristic-extractor.ts` | Heuristic UPC detection from page text (`\b\d{12,14}\b` regex). Fallback for pages without structured data |
| `apps/research-agent/src/lib/barcode.ts` | `normalizeBarcode()` — strips non-digits, validates length. Used by verifier to compare expected vs found UPC |
| `apps/research-agent/src/schemas/Evidence.ts` | The `EvidenceValue<T>` schema with `sourceType` — needs `licensed_feed` and `vlm` values added |
| `apps/research-agent/src/schemas/ProductResearchReport.ts` | `productIdentity.upc` field is an `EvidenceValue<string>` carrying provenance |
| `apps/web/lib/pipeline.ts` | Status transition validation, pipeline queries. Extend for `needs_attention` handling |
| `apps/web/lib/pipeline/types.ts` | `PERSISTED_PIPELINE_STATUSES` includes `needs_attention`. `PipelineProduct` interface defines the full product shape |
| `apps/web/lib/product-sources.ts` | `normalizeProductSources()`, `mergeProductSources()` — source field aliasing and provenance merge logic. The `upc` field is already aliased here |
| `apps/web/lib/consolidation/` | DeepSeek consolidation pipeline. The `consolidated` JSON object gets written after AI processing; need to include `upc_resolution_*` fields |
| `apps/web/app/api/admin/pipeline/[upc]/route.ts` | The GET/PATCH route for pipeline product. Already returns `consolidated`, `sources`, `image_candidates`. Add `upc_provenance` |
| `apps/web/supabase/migrations/20260611120000_automated_source_cascade.sql` | Source cascade migration: `enrichment_source_attempts` table, `needs_attention` status, `upc_search` mode |
| `apps/web/supabase/migrations/20260618_packaging_extraction_tables.sql` | `product_packaging_extractions` and `product_title_suggestions` tables — VLM infrastructure |
| `apps/scraper/scrapers/utils/upc_utils.py` | UPC normalization, check-digit validation, prefix extraction. GS1 standards compliance |
| `apps/scraper/src/ocr/image_selector.py` | Image selection for VLM — UPC-aware scoring (line 70: `if upc and upc in filename: score += 100`) |
| `apps/scraper/validation/result_quality.py` | `sanitize_product_payload()` with `_normalize_upc()` — cleans noisy OCR-extracted UPCs from scraper results |
| `supabase/migrations/20260521204047_rename_sku_to_upc_v5.sql` | The SKU→UPC rename migration. Shows the full schema scope of UPC across 20+ tables |
| `docs/adr/0001-automated-source-cascade.md` | Current source cascade design: run all, keep all, SERP is terminal fallback, distributor errors block SERP |

### New Code — Where to Write

| New/Modified File | Purpose |
|--------------------|---------|
| `apps/web/lib/barcode-providers/gs1-us.ts` | GS1 US Product API client |
| `apps/web/lib/barcode-providers/go-upc.ts` | Go-UPC API client |
| `apps/web/lib/barcode-providers/brocade.ts` | brocade.io client (optional, if self-hosting) |
| `apps/web/lib/barcode-providers/index.ts` | Barrel export with provider selection logic |
| Apps `research-agent` discovery provider | New class: `LLMWebResearchDiscovery` (stage 6) |
| `apps/web/lib/pipeline/upc-resolution.ts` | Cascade orchestrator: walks stages, gates, retry logic |
| `apps/web/app/admin/pipeline/upc-health/page.tsx` | UPC resolution health dashboard |
| `apps/web/app/api/admin/pipeline/upc-resolution/route.ts` | API endpoint to trigger re-resolution for a UPC |
| `apps/web/lib/pipeline/types.ts` — extend `PipelineProduct` | Add `upc_resolution_stage`, `upc_resolution_confidence`, `upc_provenance` |
| `apps/research-agent/src/schemas/Evidence.ts` | Add `"licensed_feed"` and `"vlm"` to `evidenceSourceTypeSchema` |

---

## 7. Residual Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **GS1 API cost at scale** | Medium | High | Cache aggressively (TTL-based `barcode_lookups`). Batch by company prefix. Negotiate GS1 US volume pricing. Use Go-UPC as cheaper secondary. brocade.io as free fallback |
| **VLM barcode digit hallucination** | Medium | Medium | Check-digit validation is mandatory. Also require secondary confirmation (brand name match extracted from same image). Never accept VLM-only UPC without check-digit pass |
| **Private-label products without UPCs** | High | Medium | Create explicit `upc_source_type: 'private_label'` flag. Don't keep re-resolving. Use distributor SKU + brand as identity anchor. GS1 company prefix check as heuristic detector |
| **SERP noise / wrong product match** | Medium | High | `isCandidateUnsafeForCanonicalSelection()` blocks search pages, collections, blogs. Official-domain promotion prefers brand site. `hasHardMismatchWarnings()` catches brand conflicts. Review queue catches the rest |
| **Distributor feed error blocking cascade** | Low | High | ADR 0002 already requires distributor errors to block SERP. Monitor `enrichment_source_attempts.outcome = 'source_error'` rate. Add automated retry with exponential backoff for transient errors |
| **Upc absence is the norm for certain brand categories** | Medium | Low | Phase 6 adds private-label detection. Admin can configure per-brand `upc_optional: true` flag. Products still flow through pipeline but use `upc_source_type: 'private_label'` |
| **Acquisition budget exhaustion from too many cascade stages** | Medium | Medium | Each stage has a cost budget. SERP acquisition caps at top N candidates. Licensed feeds are cached. VLM only runs if images exist. Stage 6 (LLM) is costliest — run only after all others exhausted, with explicit budget |
| **Race condition when two stages resolve simultaneously** | Low | Low | Use `SELECT ... FOR UPDATE` on `products_ingestion` row (already used in `merge_enrichment_attempt_result()`). Resolution log serializes per-UPC |
| **Feedback loop: cascade keeps retrying and failing same products** | Medium | Medium | After 3 failed resolution attempts, product enters `needs_attention` permanently (never auto-retries). Must be manually resolved or marked `private_label` / `unresolvable` |
| **Regulatory risk from incorrect UPC on published product** | Low | High | Never publish with `upc_resolution_confidence < 0.70`. `upc_provenance` audit trail provides full chain of custody. Manual override requires admin authentication |

---

## Summary of Decision

> **Recommended cascade**: Distributor Feed (authoritative seed) → Distributor Scrape → Official Brand Site Crawl → SERP Discovery → Licensed Barcode Database (GS1 / Go-UPC) → VLM Packaging Extraction → LLM Web Research → Manual Review.

> **Confidence gating**: ≥0.95 authoritative (auto-accept), 0.85–0.94 high (auto + sampling), 0.70–0.84 moderate (review queue), <0.70 needs_attention.

> **Fail-closed**: No auto-publish without ≥0.70 confidence. Distributor errors block downstream. Conflicts trigger manual triage. Check-digit failures on VLM are rejected outright.

> **Data model**: Extend `products_ingestion` with `upc_resolution_stage`, `upc_resolution_confidence`, `upc_provenance` (EvidenceValue array). Add `barcode_lookups` cache table. Add `product_upc_resolution_log` audit table. Extend `EvidenceSourceType` enum with `licensed_feed` and `vlm`.

> **Rollout**: Phase 1 (instrument, observe) → Phase 2 (official site + SERP) → Phase 3 (licensed feeds) → Phase 4 (VLM) → Phase 5 (LLM research) → Phase 6 (closed-loop quality). Each phase ships with measurable gates before proceeding.
