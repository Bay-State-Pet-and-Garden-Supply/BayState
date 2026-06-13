# Source errors block SERP fallback, not successful processing

When a distributor source in the cascade errors (auth expired, network timeout, site
structure change), the SERP Fallback for that UPC is blocked. However, if any other
configured source found usable product data, the UPC advances to **processed** — the
source error is recorded in the attempt history but does not block the product.

**Why**: A Source Error is not the same as "not stocked" — we don't know whether the
product was available. Running SERP in this state wastes AI credits on an uncertain
situation. However, holding a product hostage when another source already found data
defeats the purpose of running multiple sources.

## Rules

### Execution rule (blocks fallback)
- Genuine distributor source errors block the downstream cascade (no SERP fallback)
  when no source has found usable product data yet.
- "Not stocked" (clean: source ran fine, product not found) does NOT block SERP
  fallback.

### Final status rule (determines pipeline advancement)
- **Any source found usable data** → `processed` regardless of errors on other sources.
- **No source found data AND at least one genuine error** → `needs_attention` —
  the cascade couldn't complete exhaustively, so the product needs human review.
- **No source found data AND all sources clean `not_stocked`** → `processed` —
  the cascade ran cleanly but exhausted all options. The manual product entry flow
  handles these later.

### Error handling rules
- All Source Errors are treated equally for blocking purposes — no distinction
  between retryable (network timeout) and permanent (expired credentials). Both
  block SERP and contribute to Needs Attention when no source found data.
- `Needs Attention` UPCs surface in a dedicated pipeline tab, grouped by error type.
- Re-extraction only retries sources that previously errored or were never attempted.

## Status Transition Matrix

| Source Outcomes | Pipeline Status |
|----------------|-----------------|
| At least one `found` | `processed` |
| No `found`, some `source_error`, none `found` | `needs_attention` |
| All clean `not_stocked` (or no sources) | `processed` |

**Status**: accepted (revised June 2026)

**Considered options**:
- Any source error unconditionally forces Needs Attention: rejected — production
  experience showed products with rich data from one source were blocked by errors
  from other sources in the cascade. The found-wins rule better achieves the goal
  of running all sources and keeping all results.
- Distinguish retryable vs permanent errors: rejected — adds complexity and
  requires the system to classify error types, which is fragile.
- Let errors fall through to SERP unconditionally: rejected — wastes AI credits
  and masks the fact that a source was unavailable.
