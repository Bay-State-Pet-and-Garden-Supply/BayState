# UPC Resolution proof-required rule replaces found-wins for V2 sources

When UPC Resolution V2 is active (via `job.config.upc_resolution_policy: 'proof_required'` or
`job.config.upc_resolution_v2: true`), a source result with outcome `found` no longer
automatically advances the product to `processed`. Instead, the found evidence must
satisfy strict UPC identity gates before acceptance. This is an exception to and
extension of ADR 0002 for V2-enabled extraction jobs.

**Why**: The original found-wins rule (ADR 0002) was designed for the distributor-only
cascade where any source finding product data was a reliable signal. With the staged
UPC resolution cascade — distributors → official brand → licensed feeds → SERP candidates →
packaging VLM — a `found` from a lower-confidence stage (e.g., a SERP result without
exact UPC match) does not provide sufficient identity proof. Requiring accepted UPC
evidence before advancing prevents catalog identity errors.

## Status

- **Accepted** (MVP 0, June 2026)
- Feature-flagged: V2 behavior is inactive unless the job explicitly enables it.

## V2 behavior change

### Execution
- Source cascade runs all stages in order (unchanged from ADR 0001).
- The found-wins short-circuit for the cascade execution is replaced by a
  proof-gated short-circuit: if a stage returns `found` with accepted UPC evidence
  (exact UPC/GTIN echo at sufficient confidence), the cascade stops and the product
  is `confirmed`.
- If a stage returns `found` without accepted UPC evidence, the cascade continues
  to later stages.

### Final status (override to ADR 0002)
| Resolution Decision | Pipeline Status |
|---|---|
| `confirmed` (accepted proof) | `processed` |
| `manual_override` (admin action) | `processed` |
| `private_label` (admin exception) | `processed` |
| `unresolved` (no evidence) | `needs_attention` |
| `candidate` (below-gate evidence) | `needs_attention` |
| `conflict` (conflicting UPCs) | `needs_attention` |

## Schema additions
- `products_ingestion.upc_resolution_status` — resolution state
- `products_ingestion.upc_resolution_evidence` — evidence list
- `products_ingestion.upc_resolution_stage`, `confidence`, `updated_at`, `resolved_by`
- `upc_resolution_events` — event log for source outcomes per UPC

## Feature flags and config

| Key | Type | Effect |
|---|---|---|
| `job.config.upc_resolution_policy` | `"proof_required"` | Enables V2 proof gates on this job |
| `job.config.upc_resolution_v2` | `boolean` | Alternative flag; `true` enables V2 |

## Rollback

- Remove `upc_resolution_policy: 'proof_required'` from job configs.
- New columns/tables remain; no behavior change without the flag.
- Full schema rollback: `DROP TABLE IF EXISTS upc_resolution_events;`
  and `ALTER TABLE products_ingestion DROP COLUMN IF EXISTS ...` for each added column.

## Evidence gates (accepted proof)

| Kind | Required signals | Min confidence |
|---|---|---|
| `distributor_exact_upc` | Distributor page matches exact expected UPC | 0.95 |
| `official_exact_upc` | Official domain page contains exact expected UPC | 0.98 |
| `official_high_confidence_no_upc` | Official domain, brand matched, no conflicting UPC | 0.90 |
| `gs1_validation` | GTIN valid and licensed to compatible brand | 0.95 |
| `icecat_exact_gtin` | Exact GTIN plus brand/manufacturer match | 0.90 |
| `licensed_exact_upc` | Provider echoes exact UPC, brand/title gates pass | 0.86 |
| `open_pet_food_facts_exact_barcode` | Exact barcode + category/brand compatibility | 0.82 |
| `serp_exact_upc` | Crawled page contains exact UPC + brand gates | 0.85 |
| `packaging_vlm_exact_upc` | Extracted digits match, check digit passes | 0.95 |
| `manual_override` | Admin selects evidence with note | 1.0 |
| `private_label` | Admin marks private-label exception | 1.0 |

## Non-proof outcomes

- `candidate_below_gate`: Found evidence but no exact UPC echo or below min confidence.
  Cap confidence at 0.69. Outcome `not_stocked` at the source level, product stays
  `unresolved` or `candidate`.
- `conflicting_upc`: Credible source returned a different valid UPC.
  Product status becomes `conflict`, pipeline `needs_attention`.
- `no_upc_evidence`: Source ran cleanly but contributed no UPC-related data.
  Outcome `not_stocked`, `source_error`, or `skipped`.

## Prior art

- ADR 0001: Automated source cascade — run all, keep all.
- ADR 0002: Source errors block SERP fallback, found-wins final status rule.
- MVP 0 of this ADR implements only the schema, type gates, and feature-flagged
  callback persistence. The staged cascade execution (MVP 1) and provider bakeoff
  (MVP 2) are separate milestones.
