# Implementation Plan

## Goal
Persist Pi's structured candidate decision into the canonical `ProductResearchReport` artifact/schema and add a read-only live Supabase sample runner that summarizes decision patterns and remaining gaps without adding web/frontend integration.

## Tasks
1. **Add agent decision fields to the report schema**: Extend the canonical report contract with an optional structured decision object.
   - File: `apps/research-agent/src/schemas/ProductResearchReport.ts`
   - Changes: Add `agentCandidateDecisionSchema` with fields `selectedUrl?: string.url()`, `rationale: string.min(1)`, `confidence?: number(0..1)`, `defer: boolean`, `recordedAt: datetime`, and `source: "pi_harness"`; export its type; add optional `agentDecision` to `productResearchReportSchema`.
   - Acceptance: `productResearchReportSchema.parse()` accepts existing reports with no `agentDecision` and rejects empty rationales, invalid URLs, and out-of-range confidence values when `agentDecision` is present.

2. **Create a reusable report decision attachment helper**: Normalize and validate Pi decisions before they become report state.
   - File: `apps/research-agent/src/research/agent-decision.ts`
   - Changes: Add `attachAgentDecisionToReport(report, decision, options)` that trims rationale, defaults `defer` consistently, verifies non-deferred `selectedUrl` is one of `report.candidates[].normalizedUrl`, sets `recordedAt`, sets `source: "pi_harness"`, preserves existing report fields/artifact paths, and returns a `ProductResearchReport` parsed by the schema.
   - Acceptance: Unit tests cover selected candidate, deferred decision, unknown URL rejection, and blank rationale rejection.

3. **Rewrite stored report artifacts after recording an agent decision**: Ensure the final `report.json` and `summary.md` include the structured decision, not only companion Pi files.
   - File: `apps/research-agent/src/storage/artifact-store.ts`
   - Changes: Export a function such as `rewriteStoredResearchArtifacts(report)` that requires `report.artifacts`, rewrites `report.json`, and regenerates `summary.md` in place. Update `buildSummary()` to include an `## Agent Decision` section showing selected/deferred state, confidence, recorded time, and rationale when present.
   - Acceptance: A stored report can be enriched with `agentDecision` without creating a new artifact directory; `report.json` contains `agentDecision`; `summary.md` contains the Agent Decision section.

4. **Wire the Pi `record_agent_decision` tool into report persistence**: Update the in-memory report and artifact files as soon as Pi records its final decision.
   - File: `apps/research-agent/src/pi/standalone.ts`
   - Changes: In the `onDecision` callback, call `attachAgentDecisionToReport(storedReport, decision, { recordedAt: new Date() })`, assign the returned report back to `storedReport`, assign `agentDecision`, and call `rewriteStoredResearchArtifacts(storedReport)` before returning from the tool callback.
   - Acceptance: `runAgentResearch()` returns `result.report.agentDecision`; `agent-summary.md`, `agent-details.json`, `report.json`, and `summary.md` all describe the same decision.

5. **Tighten the decision tool's runtime validation**: Keep tool output and report schema aligned.
   - File: `apps/research-agent/src/pi/tools.ts`
   - Changes: Reuse/export the schema type from `ProductResearchReport.ts` or keep the existing interface compatible; reject `params.rationale.trim()` when empty; continue enforcing `selectedUrl` membership in `storedReport.candidates[].normalizedUrl`.
   - Acceptance: Existing structured-decision tests still pass and a new test proves empty rationales fail before artifact writes.

6. **Update report and Pi harness tests**: Cover schema compatibility and artifact persistence.
   - Files: `apps/research-agent/tests/research-report.test.ts`, `apps/research-agent/tests/pi-harness.test.ts`
   - Changes: Add assertions for optional `agentDecision` schema parsing; add an integration-style helper test that writes a report, records a decision, rewrites artifacts, and reads `report.json`/`summary.md` to verify embedded decision content.
   - Acceptance: `bun --cwd apps/research-agent test` passes.

7. **Add a narrow read-only Supabase sample input loader**: Fetch current live product rows and convert them to `ProductResearchInput` objects for benchmarking only.
   - Files: `apps/research-agent/src/live/supabase-client.ts`, `apps/research-agent/src/live/sample-inputs.ts`
   - Changes: Add a Supabase client using `RESEARCH_AGENT_SUPABASE_URL` plus `RESEARCH_AGENT_SUPABASE_KEY` with fallbacks to `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`; perform only `select` queries. Query `products_ingestion` (`upc`, `input`, `sources`, `b2b_sources`, `brand_id`, `pipeline_status`, `confidence_score`, `product_line`, `updated_at`), `brands` (`id`, `name`, `slug`, `official_domains`), and recent `enrichment_attempts` source URLs. Convert each row to `ProductResearchInput` using UPC/product name/brand, official domains, expected size/variant hints from `input` or `consolidated` when available, and candidate URLs extracted from current source records and enrichment attempts.
   - Acceptance: Loader returns schema-valid inputs, skips rows without brand/name/UPC with explicit skip reasons, and does not import from `apps/web` or add an old-export import adapter.

8. **Add candidate URL extraction tests for live row mapping**: Make the live loader deterministic without requiring Supabase in CI.
   - File: `apps/research-agent/tests/live-sample-inputs.test.ts`
   - Changes: Test extraction of candidate URLs from source fields named `url`, `product_url`, and `source_url`; dedupe normalized URLs; map official-domain candidates to `official`/`serp`/`distributor` source types; verify invalid URLs are ignored with warnings.
   - Acceptance: Tests pass offline with mocked row objects and no network credentials.

9. **Add a live sample batch runner**: Run deterministic or Pi-backed research over a broader Supabase-backed sample set and write batch artifacts.
   - Files: `apps/research-agent/src/live/run-live-samples.ts`, `apps/research-agent/src/cli.ts`, `apps/research-agent/package.json`
   - Changes: Add CLI command/script `live-sample-research` with flags `--limit`, `--upc`, `--brand`, `--pipeline-status`, `--output-dir`, `--agent`, `--model`, `--thinking`, `--agent-home`, and `--use-scraper`. The runner should execute serially, write `sample-inputs.json`, write each normal report under the chosen artifact root, and when `--agent` is set call `runAgentResearch()` so `report.json` includes `agentDecision`.
   - Acceptance: With valid Supabase env vars, `bun --cwd apps/research-agent run live-sample-research --limit 5 --output-dir artifacts/live-smoke` produces per-product reports and a batch summary without any `apps/web` route/UI changes.

10. **Summarize decision patterns and remaining gaps**: Aggregate the live sample run into machine-readable and markdown summaries.
    - File: `apps/research-agent/src/live/decision-summary.ts`
    - Changes: Compute counts for deterministic statuses, Pi selected/deferred/missing decisions, agreement vs override vs defer, selected source types/domains, warning frequency, missing-candidate cases, no-official-domain cases, close-score cases, and representative examples. Write `live-sample-summary.json` and `live-sample-summary.md` in the batch output directory.
    - Acceptance: Summary files identify at least: total attempted, total completed, total failed, decision distribution, top warning categories, and concrete UPC examples for each remaining gap.

11. **Document the new report contract and live workflow**: Keep boundaries explicit.
    - File: `apps/research-agent/README.md`
    - Changes: Document that Pi decisions are now embedded in `report.json`; add live sample command examples; list required env vars; state the runner is read-only, local/CLI-only, and does not add frontend/web/coordinator integration.
    - Acceptance: README contains a copy-paste smoke command and a warning not to commit live artifacts or secrets.

12. **Validate locally and with a live smoke run**: Prove schema changes and live sampling work.
    - Files: no code file; run commands from repo root.
    - Changes: Run `bun --cwd apps/research-agent typecheck`, `bun --cwd apps/research-agent test`, `bun --cwd apps/research-agent run agent-research-product --input examples/fromm-duck.json --output-dir artifacts/manual-agent-decision`, and then a small live command such as `bun --cwd apps/research-agent run live-sample-research --limit 5 --agent --output-dir artifacts/live-smoke` with Supabase and LM Studio env configured.
    - Acceptance: Typecheck/tests pass; manual Pi run has `agentDecision` inside `report.json`; live smoke summary includes decision-pattern counts and gap examples.

## Files to Modify
- `apps/research-agent/src/schemas/ProductResearchReport.ts` - add/export embedded `agentDecision` schema and type.
- `apps/research-agent/src/storage/artifact-store.ts` - regenerate report/summary artifacts after decision attachment and show decision in markdown.
- `apps/research-agent/src/pi/standalone.ts` - persist decision into `storedReport` and rewrite canonical artifacts.
- `apps/research-agent/src/pi/tools.ts` - align decision validation with report schema.
- `apps/research-agent/src/cli.ts` - add `live-sample-research` command and flags.
- `apps/research-agent/package.json` - add script and, if needed, `@supabase/supabase-js` dependency.
- `apps/research-agent/src/index.ts` - export the new decision and live helper modules if they are intended for tests/CLI reuse.
- `apps/research-agent/tests/research-report.test.ts` - schema/report coverage for optional embedded decision.
- `apps/research-agent/tests/pi-harness.test.ts` - tool/artifact coverage for persisted decisions.
- `apps/research-agent/README.md` - document embedded decisions and live sample workflow.

## New Files
- `apps/research-agent/src/research/agent-decision.ts` - report-safe decision attachment helper.
- `apps/research-agent/src/live/supabase-client.ts` - read-only Supabase client/env resolution for local sample runs.
- `apps/research-agent/src/live/sample-inputs.ts` - current Supabase row to `ProductResearchInput` mapper and sampler.
- `apps/research-agent/src/live/run-live-samples.ts` - batch orchestration for deterministic/Pi-backed sample runs.
- `apps/research-agent/src/live/decision-summary.ts` - aggregate JSON/markdown decision-pattern summaries.
- `apps/research-agent/tests/live-sample-inputs.test.ts` - offline tests for row mapping and URL extraction.
- `apps/research-agent/tests/agent-decision.test.ts` - focused tests for attaching/rejecting structured decisions.

## Dependencies
- Tasks 2-6 depend on Task 1 because report persistence must parse through the extended schema.
- Task 4 depends on Task 3 so the Pi callback can update existing `report.json`/`summary.md` in place.
- Tasks 7-10 depend on the existing deterministic and Pi harness flows; Task 9 depends on Task 7, and Task 10 depends on Task 9 output shape.
- Task 12 depends on all implementation tasks and valid local Supabase/LM Studio credentials for the live smoke run.

## Risks
- `apps/research-agent/AGENTS.md` currently says not to add direct database access for MVP; the live sample runner should be explicitly scoped as a read-only local benchmarking tool, or this needs approval before adding `@supabase/supabase-js` here.
- Live database schema drift is likely (`sku` vs `upc` history); the loader should query current `upc` columns and fail with a clear message if the expected columns are unavailable.
- Source records may not contain product URLs for many rows; the summary must distinguish "no usable candidate URL" from scoring or agent failures.
- LM Studio/Pi runs are slow and can be nondeterministic; run live samples serially, record model/thinking metadata, and keep deterministic scores as the baseline.
- Service-role Supabase keys are sensitive; never write env vars to artifacts, and ensure live artifacts stay under ignored `apps/research-agent/artifacts/` unless intentionally sanitized.
- The live sample runner must not become frontend/web integration, a coordinator job, DB writer, or a generic import adapter for legacy exports.
