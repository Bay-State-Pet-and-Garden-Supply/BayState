# Selector Workshop uses a synchronous extraction endpoint, not the async job queue

The Selector Workshop (interactive profile editor) needs fast-turnaround extraction results to provide live visual feedback as admins edit selectors. All existing profile-maintenance interactions use async claim/callback jobs, but the workshop's interactive UX requires sub-10s response times that the polling-based job queue cannot deliver.

**Status**: accepted

## Context

Profile-maintenance jobs (`verify_pdp_seed`, `draft_site_extraction_profile`, `validate_profile_version`, `browser_profile_setup`, `browser_profile_revalidate`) all use the same claim/callback pattern: the web coordinator enqueues a job with `status: 'queued'`, a runner polls and claims it, executes the work (often 30-90s), and posts results back via `POST /api/scraper/v1/profile-maintenance/[jobId]/result`.

The Selector Workshop is fundamentally different. Admins need to:
1. Enter a PDP URL, click "Test"
2. See per-selector extraction results within seconds
3. Edit a selector, click "Test again"
4. Iterate rapidly

The async job queue adds 2-3s of polling latency minimum, plus the job lifecycle overhead (claim, lease, callback). For an interactive editing session with 20+ test cycles, this compounds to minutes of wasted waiting.

## Decision

Add a dedicated synchronous extraction endpoint on the scraper runner:

```
POST {runner}/api/scraper/v1/workshop/extract
  X-API-Key: bsr_*
  Body: {
    url: string,
    selectors: [{ name, selector, type }],
    browser_profile_ref?: string
  }
  Response: {
    results: [{ field, selector, extracted_value, confidence, error }],
    images: [{ url, alt, dimensions, source }]
  }
  Timeout: 15s (hard cap)
```

The web coordinator calls this endpoint directly — not through the job queue. The runner executes a crawl + extraction synchronously and returns results in the HTTP response.

Key design properties:
- **Stateless**: No job row, no lease, no artifact created server-side. The web coordinator is responsible for persisting results if needed.
- **Authenticated**: Uses the same `X-API-Key: bsr_*` header-based runner auth as all other scraper endpoints (not an `Authorization` header).
- **Timeout-gated**: The runner caps execution at 15s. If extraction takes longer, it returns partial results with a timeout error.
- **Image support**: Runs the same image candidate detection pipeline used by `verify_pdp_seed`, returning primary/gallery/rejected images with URLs.
- **Browser profile support**: Accepts an optional `browser_profile_ref` for sites that require authenticated browser profiles.

## Consequences

**Positive:**
- Admins get interactive, sub-10s feedback when editing selectors
- No job queue overhead — faster iteration, less infrastructure noise
- Clean separation: async jobs are for batch/automated work; sync endpoint is for interactive tooling
- The endpoint can be reused by future interactive tools (e.g., a "test extraction on this URL" feature in other admin surfaces)

**Negative:**
- Two communication patterns between web and runner (sync endpoint + async job queue) — future developers must understand when to use each
- The web coordinator now has a hard dependency on runner availability for the workshop to function (async jobs degrade gracefully; sync calls fail immediately)
- The 15s timeout means very slow sites or complex extractions might exceed the cap — admins would need to retry or use a different URL
- No built-in retry or durability — if the call fails, the admin must click Test again
- **Runner saturation risk**: Repeated live tests from multiple admins could exhaust runner capacity. Requires rate limiting and concurrency caps on the sync endpoint.

## Mitigations

- The workshop UI shows a clear loading state with elapsed time, so admins know the system is working
- If the sync endpoint is unavailable or times out, the UI shows a specific error message (not a generic "failed") with a retry button
- Future: add a "slow test" option that falls back to the async job queue for URLs that consistently exceed the 15s sync cap
- Document the two communication patterns clearly in the scraper's AGENTS.md and the web's admin AGENTS.md

## Alternatives considered

**Async job with UI polling**: Rejected — adds 2-3s minimum latency per test cycle, unacceptable for interactive editing

**Web-side direct crawl (run crawl4ai in Node.js)**: Rejected — adds Playwright/crawl4ai dependency to the web server, violates the coordinator/runner boundary, and complicates the deployment model

**Reuse existing claim/callback but with synchronous claim-execute**: Rejected — still requires job row mutation and lease management, adds unnecessary state to what should be a stateless request
