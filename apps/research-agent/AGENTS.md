# Research Agent Context

## Role
- TypeScript/Bun research orchestration CLI for candidate discovery/scoring artifacts.
- This app is becoming the **self-sufficient product research pipeline**: discovery, acquisition, extraction, verification, Pi adjudication, and storefront draft assembly.

## Boundaries
- `apps/web` owns queues, persistence, migrations, and admin review UI.
- `apps/scraper` is no longer the target dependency for this app. Existing scraper CLI integration is a legacy comparison bridge only; do not expand it as the main architecture.
- Do **not** add direct database access here for MVP.
- Do **not** import Python internals directly into TypeScript.
- Pi Coding Agent is the intended agentic harness/orchestrator for local research workflows, but deterministic scoring and evidence validation still provide guardrails.

## Current MVP expectations
- Prefer deterministic scoring and explicit evidence over agentic free-form output.
- Build new research capability behind local pipeline ports/stages under `src/pipeline`; avoid coupling new work to `apps/scraper`.
- Use the project-local `agent-browser` skill for browser/page-acquisition research in the Pi harness; load current usage with `agent-browser skills get core` before issuing browser commands.
- Target output is `ProductResearchReport` plus `StorefrontProductDraft` / `storefront-product.json`.
- Keep schemas local to this app until the report contract stabilizes; then promote to `packages/api`.
- Write local artifacts under `artifacts/`.
- Add tests for scoring, schema/report validation, and storefront assembly before expanding runtime scope.
