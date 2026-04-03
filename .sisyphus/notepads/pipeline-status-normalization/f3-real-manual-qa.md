## 2026-04-02 — F3 Real Manual QA

- `bun run web build` passed for the current admin pipeline app routes.
- The requested targeted Jest commands are stale in this repo: Jest rejects `--testPathPattern` and requires `--testPathPatterns`.
- Corrected pipeline/publish runs still fail on `__tests__/lib/pipeline/publish.test.ts`, where legacy `approved` rows are no longer publishable even though the compatibility test expects success.
- Corrected pipeline run also hits `__tests__/components/admin/pipeline/status-filter.test.tsx` worker termination (`SIGSEGV`), so pipeline status-filter verification is unstable.
- Passing coverage still confirms canonical export mapping, published export actions, storefront publish lookup by SKU, and finalized -> scraped rejection/rework behavior.
- QA verdict for this batch is `REJECT` until the stale test command, legacy publish compatibility mismatch, and status-filter crash are resolved.
