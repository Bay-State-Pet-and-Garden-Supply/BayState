# Source errors block SERP fallback

When a distributor source in the cascade errors (auth expired, network timeout, site
structure change), the SERP Fallback for that UPC is blocked. The UPC enters
**Needs Attention** status instead of falling through to AI-powered search.

**Why**: A Source Error is not the same as "not stocked" — we don't know whether the
product was available. Running SERP in this state wastes AI credits on an uncertain
situation and risks presenting incomplete extraction results as complete.

**Key rules**:
- All Source Errors are treated equally — no distinction between retryable
  (network timeout) and permanent (expired credentials). Both block SERP and
  require human attention.
- "Not stocked" (clean: source ran fine, product not found) does NOT block SERP.
- `Needs Attention` UPCs surface in a dedicated pipeline tab, grouped by error type.
- Re-extraction only retries sources that previously errored or were never attempted.

**Status**: accepted

**Considered options**:
- Distinguish retryable vs permanent errors: rejected — adds complexity and
  requires the system to classify error types, which is fragile.
- Let errors fall through to SERP: rejected — wastes AI credits and masks the
  fact that a source was unavailable.
