## Review
- **Correct:** I read the requested `plan.md` and `progress.md`; both are stale for this slice, so I used `handoff/ai-schema-draft-validation-next-slice-guardrails.md`, `handoff/ai-schema-draft-validation-next-slice-plan.md`, and ADRs 0008/0009/0011 as the applicable guardrails.
- **Correct:** The draft route has the expected admin/staff auth gate and seed guard: `requireAdminAuth()` runs before the service client (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts:24-30`), profiles must be `draft` (`:43-48`), and it requires at least one `product_detail_page_seeds.trust_status='verified'` in the profile scope before enqueueing (`:51-64`). The queued draft job includes profile/brand/source/domain scope, verified seed ids/urls, and model-schema/crawl4ai capabilities (`:118-143`).
- **Correct:** The validation route links a validation run to the target profile version and embeds that run id in the runner job payload: run insert at `apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:127-136`, payload fields at `:149-163`, and required validation/crawl capabilities at `:165-183`.
- **Correct:** The runner result route still enforces runner auth, lease token, lease expiry, runner ownership, terminal-state guards, and conditional stale-callback update before processing side effects (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:45-185`).
- **Correct:** Focused route/helper/runner tests pass: web profile-maintenance draft/validate/approve/result/version-update/claim suites passed, and scraper `test_draft_profile.py` + `test_profile_maintenance.py` passed.
- **Fixed:** None. Review-only; no source files were modified by this reviewer. This report artifact was written to the requested validation path.

- **Blocker:** The web source does not typecheck. `apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts` uses `effectiveCapability.validate_profile_version` (`:104`) but the route-local `ProfileMaintenanceCapability` interface omits that property (`:26-33`). `bun run web typecheck -- --pretty false` fails with `TS2339: Property 'validate_profile_version' does not exist on type 'ProfileMaintenanceCapability'`. **Smallest fix:** add the property to the local interface or import/reuse the shared `ProfileMaintenanceCapabilities` type; fix the new test mock `SupabaseClient` casts if full typecheck remains in scope.
- **Blocker:** Approval can bypass the required passed latest validation. The route supports `force=true` to skip validation entirely (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts:43-105`), and when not forced it queries the latest *passed* run (`.eq('status','passed')` at `:86-93`) rather than fetching the latest run and requiring that run to be passed. This allows activation after a newer failed/error validation and conflicts with the guardrail that approval rejects missing/failed validation. The test suite enshrines the bypass (`apps/web/__tests__/profile-maintenance/approve.test.ts:309-365`). **Smallest fix:** remove or reject `force`, fetch the most recent validation run for the version, require `status='passed'`, and add a regression test where an older passed run plus newer failed run must be rejected.
- **Blocker:** The activation RPC is a `SECURITY DEFINER` public-schema function with no `REVOKE/GRANT` hardening and no in-function auth/validation checks (`apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:10-80`). Because PostgreSQL functions are executable by `PUBLIC` by default, an exposed Supabase RPC could activate any draft/validating version directly, bypassing the admin route, approval note policy, and validation-run checks. **Smallest fix:** add `SET search_path`, revoke execute from `PUBLIC`/`anon`/`authenticated`, grant only to `service_role` (or add equivalent in-function admin/validation checks if it must be callable by authenticated roles).
- **Blocker:** Draft/validation result side effects are not tied to durable artifact success. The result route marks the job terminal before artifact insertion (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:148-176`), treats artifact insert failure as non-fatal (`:223-235`), and still calls draft/validation side-effect helpers with `artifactId` possibly `null` (`:238-271`). `updateVersionFromDraft()` ignores `artifactId` and can create a profile version solely from `body.result` (`apps/web/lib/profile-maintenance/version-update.ts:70-118`), while `updateValidationRunFromValidation()` can mark a run passed/failed with `summary_artifact_id: null` (`:149-185`). This violates the guardrail not to create a Profile Version or mark validation passed without a durable artifact. **Smallest fix:** for `draft_site_extraction_profile` and `validate_profile_version`, require artifact insertion to return an id before side effects; pass/use `body.artifact.payload` as the source of truth; fail or keep the job non-succeeded if artifact/target update fails.
- **Blocker:** A caller-supplied validation set is not checked for profile ownership. `validation_set_id` from the request body is accepted as-is (`apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:68-81`), then cases are fetched only by that id (`:114-118`). This allows validating one profile version against another profile’s validation cases. The same job insert also omits brand/source/domain scope (`:171-183`), producing unscoped validation artifacts. **Smallest fix:** when a validation set id is provided, select it with both `.eq('id', validationSetId)` and `.eq('profile_id', profileId)`; reject if absent; load profile scope and write `brand_id`, `source_slug`, and `canonical_domain` into the job/artifact scope.
- **Blocker:** The validation runner advertises live validation without actually executing the compiled Crawl4AI schema. It labels non-empty validation runs as `validation_mode: 'live'` (`apps/scraper/runner/profile_maintenance.py:944-963`), but field extraction is a regex placeholder (`:1078-1101`) rather than a thin reuse of Crawl4AI `JsonCssExtractionStrategy`. It also returns a passed validation for an empty case list (`:856-901`). This makes approval evidence misleading. **Smallest fix:** either execute the compiled schema through Crawl4AI’s extraction strategy for live mode, or label this as fixture/snapshot/compile-only and prevent approval from treating it as a passed live validation; reject/hold empty validation case sets instead of passing them.

- **Note:** The API client default profile-maintenance capabilities include `model_schema_draft` but not `validate_profile_version` (`apps/scraper/core/api_client.py:793-814`), while validation jobs require `profile_maintenance.validate_profile_version` (`validate/route.ts:165-168`). This is safe if validation-capable runners explicitly set `PROFILE_MAINTENANCE_CAPABILITIES`, but it should be documented in `.env.example` or configured intentionally so validation jobs do not sit unclaimed.
- **Note:** `updateSeedFromVerification()` now requires a durable artifact id and PDP page classification before trusting a seed (`apps/web/lib/profile-maintenance/seed-update.ts:62-87`) and auto-creates a validation case after verified updates (`:128-131`). It still does not verify that the scoped seed update affected exactly one row before creating the validation case, so a scope-mismatch no-op can be hard to detect.

### Commands run
- `git status --short && git diff --stat` — inspected dirty worktree and scoped diff; many unrelated pre-existing changes are present.
- `bun run web test -- --testPathPatterns="profile-maintenance/(draft|validate|approve|version-update|result)"` — passed; 6 suites / 53 tests.
- `bun run web test -- --testPathPatterns="profile-maintenance/claim"` — passed; 1 suite / 9 tests.
- `cd apps/scraper && uv run pytest tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py -q` — passed; 36 tests, warnings only.
- `cd apps/scraper && uv run ruff check runner/profile_maintenance.py tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py --output-format=github` — passed; no diagnostics.
- `bun run web typecheck -- --pretty false` — failed; source error `app/api/scraper/v1/profile-maintenance/claim/route.ts(104,29): TS2339` plus new test mock Supabase type errors and one pre-existing logs test mock type error.
- `git diff --cached --name-only` — no staged files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Review-only task completed without source edits; scope was limited to AI schema draft, profile version validation/approval, result side effects, runner handlers, capability routing, tests, and guardrails."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Findings include file/line evidence, focused command results, validation output, smallest fixes, and residual risks for independent review."
    }
  ],
  "changedFiles": [
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/draft/route.ts",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts",
    "apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts",
    "apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts",
    "apps/web/lib/profile-maintenance/seed-update.ts",
    "apps/web/lib/profile-maintenance/types.ts",
    "apps/web/lib/profile-maintenance/version-update.ts",
    "apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql",
    "apps/scraper/core/api_client.py",
    "apps/scraper/daemon.py",
    "apps/scraper/runner/profile_maintenance.py"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/draft.test.ts",
    "apps/web/__tests__/profile-maintenance/validate.test.ts",
    "apps/web/__tests__/profile-maintenance/approve.test.ts",
    "apps/web/__tests__/profile-maintenance/version-update.test.ts",
    "apps/web/__tests__/profile-maintenance/result.test.ts",
    "apps/web/__tests__/profile-maintenance/result-seed-update.test.ts",
    "apps/web/__tests__/profile-maintenance/claim.test.ts",
    "apps/scraper/tests/unit/test_draft_profile.py",
    "apps/scraper/tests/unit/test_profile_maintenance.py"
  ],
  "commandsRun": [
    {
      "command": "git status --short && git diff --stat",
      "result": "passed",
      "summary": "Inspected current dirty worktree and diff summary; many unrelated changed/untracked files exist."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance/(draft|validate|approve|version-update|result)\"",
      "result": "passed",
      "summary": "6 Jest suites passed; 53 tests passed."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance/claim\"",
      "result": "passed",
      "summary": "Claim route focused Jest suite passed; 9 tests passed."
    },
    {
      "command": "cd apps/scraper && uv run pytest tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py -q",
      "result": "passed",
      "summary": "36 pytest tests passed; warnings only."
    },
    {
      "command": "cd apps/scraper && uv run ruff check runner/profile_maintenance.py tests/unit/test_draft_profile.py tests/unit/test_profile_maintenance.py --output-format=github",
      "result": "passed",
      "summary": "No ruff diagnostics."
    },
    {
      "command": "bun run web typecheck -- --pretty false",
      "result": "failed",
      "summary": "Failed with source error TS2339 on claim route validate_profile_version capability plus test mock typing errors."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Web focused Jest: PASS __tests__/profile-maintenance/result.test.ts, validate.test.ts, result-seed-update.test.ts, draft.test.ts, approve.test.ts, version-update.test.ts; 53/53 tests passed.",
    "Claim Jest: PASS __tests__/profile-maintenance/claim.test.ts; 9/9 tests passed.",
    "Scraper pytest: tests/unit/test_draft_profile.py and tests/unit/test_profile_maintenance.py passed; 36/36 tests passed.",
    "Ruff focused check: no diagnostics.",
    "Typecheck: failed; claim route TS2339 source error and test mock typing errors."
  ],
  "residualRisks": [
    "Full repo worktree contains many unrelated dirty/untracked files, so this review only attests to the requested profile-maintenance slice.",
    "Focused Jest suites are heavily mocked and did not catch the latest-validation approval rule, RPC exposure, artifact durability, validation-set ownership, or live-validation semantic issues.",
    "Validation jobs require explicit validate_profile_version runner capability unless default capabilities or environment documentation are updated."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed the AI schema draft/validation/approval implementation slice; no source edits were applied by this reviewer. The implementation adds admin draft/validate/approve routes, profile-maintenance version side-effect helpers, an activation RPC, runner draft/validate handlers, capability wiring, and focused tests, but has blockers around typecheck, approval validation guarantees, RPC auth hardening, durable artifact side effects, validation-set ownership/scope, and runner validation semantics.",
  "reviewFindings": [
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:26-33,104 - validate_profile_version capability is used but omitted from the local type, causing TS2339 typecheck failure.",
    "blocker: apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve/route.ts:84-105 - force=true bypasses validation and the query finds any passed run rather than requiring the latest run to pass.",
    "blocker: apps/web/supabase/migrations/20260627000000_activate_profile_version_rpc.sql:10-80 - SECURITY DEFINER activation RPC lacks execute revocation/grants and in-function approval validation, allowing direct RPC bypass risk.",
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:148-271 and apps/web/lib/profile-maintenance/version-update.ts:70-185 - draft/validation side effects can happen or jobs can succeed without a durable artifact-backed target update.",
    "blocker: apps/web/app/api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate/route.ts:68-118,171-183 - caller-provided validation_set_id is not constrained to the profile and validation jobs omit brand/source/domain scope.",
    "blocker: apps/scraper/runner/profile_maintenance.py:944-963,1078-1101 - validation artifacts label mode live while using a regex placeholder instead of executing the compiled Crawl4AI schema; empty cases pass at :856-901."
  ],
  "manualNotes": "Report written to validation/ai-draft-validation-correctness-review.md. The requested plan.md/progress.md are unrelated/stale for this slice; guardrails and ADRs were used as source of truth."
}
```