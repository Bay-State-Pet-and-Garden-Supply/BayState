## Review
- Correct:
  - Blocker 1 — PASS. Shared domain helpers are exported from `apps/web/lib/approved-sources/source-plan.ts:69` and `apps/web/lib/approved-sources/source-plan.ts:107`; `normalizeDomain` strips leading `www.` at `apps/web/lib/approved-sources/source-plan.ts:77`; source setup imports/uses them at `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:14` and rejects disallowed domains at `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:190`. PDP seed host matching imports the same helper at `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:15` and uses it at `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:43`. Tests cover disallowed + `www` normalization at `apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:448` and `apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:553`.
  - Blocker 2 — PASS. PUT body validation only accepts `official_domain` at `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:43`; server derives `brandSlug` from the fetched brand and forces `sourceType = 'official_brand'` at `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:217`, then writes those values into `brand_sources`/`site_extraction_profiles` at `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:237` and `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:267`. Test coverage at `apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:481`.
  - Blocker 3 — PASS. Duplicate/non-verified PDP seeds ensure a verification job: existing active jobs are checked at `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:184`, and a new job is enqueued when none exists at `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:201`; unique-violation duplicate reuse calls this path at `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:286`. Test coverage at `apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:939`.
  - Blocker 4 — PASS. PDP seed creation is insert-first at `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:223`, then catches PostgreSQL unique violation `23505` and fetches/reuses the existing row at `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:256`. Tests model the race at `apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:896` and `apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:976`.
  - Blocker 5 — PASS. Verified seed updates now require `page_classification === 'product_detail_page'` before writing trusted status at `apps/web/lib/profile-maintenance/seed-update.ts:79`. Unit tests cover both wrong and missing classifications at `apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts:70` and `apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts:85`; result-route coverage includes the positive PDP case at `apps/web/__tests__/profile-maintenance/result-seed-update.test.ts:149`.
  - Blocker 6 — PASS. Result artifact insertion is guarded so `body.artifact.kind` must match `job.kind`; mismatches log and skip artifact creation at `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:187`. Test coverage at `apps/web/__tests__/profile-maintenance/result-seed-update.test.ts:353`.
- Fixed: None by this reviewer; review-only task.
- Blocker: None. All 6 requested blockers pass the narrow final check.
- Note: Focused profile-maintenance suite passed: 3 suites / 46 tests. Narrow scope honored; unrelated `source-plan.ts` V2 diff was not assessed beyond the requested `normalizeDomain`/`isDisallowed` exports.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Returned pass/fail findings for all 6 blockers with concrete file/line references and no residual blockers."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short -- apps/web/app/api/admin/brands/[id]/source-setup/route.ts apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts apps/web/lib/profile-maintenance/seed-update.ts apps/web/lib/approved-sources/source-plan.ts apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts apps/web/__tests__/profile-maintenance/result-seed-update.test.ts apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts",
      "result": "passed",
      "summary": "Confirmed target file status; all target files except source-plan.ts are untracked additions, source-plan.ts is modified."
    },
    {
      "command": "git diff -- apps/web/app/api/admin/brands/[id]/source-setup/route.ts apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts apps/web/lib/profile-maintenance/seed-update.ts apps/web/lib/approved-sources/source-plan.ts apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts apps/web/__tests__/profile-maintenance/result-seed-update.test.ts apps/web/__tests__/lib/profile-maintenance/seed-update.test.ts",
      "result": "passed",
      "summary": "Inspected current tracked diff; source-plan.ts exports normalizeDomain/isDisallowed. Untracked target files were inspected directly."
    },
    {
      "command": "bun run web test -- __tests__/profile-maintenance/brand-source-setup.test.ts __tests__/profile-maintenance/result-seed-update.test.ts __tests__/lib/profile-maintenance/seed-update.test.ts",
      "result": "passed",
      "summary": "PASS: 3 test suites, 46 tests."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "PASS __tests__/profile-maintenance/result-seed-update.test.ts",
    "PASS __tests__/profile-maintenance/brand-source-setup.test.ts",
    "PASS __tests__/lib/profile-maintenance/seed-update.test.ts",
    "Test Suites: 3 passed, 3 total; Tests: 46 passed, 46 total"
  ],
  "residualRisks": [
    "Narrow review only: unrelated V2 changes in apps/web/lib/approved-sources/source-plan.ts were not assessed beyond the requested normalizeDomain/isDisallowed exports.",
    "Focused tests are mocked unit/API-route tests; no live database uniqueness/integration test was run."
  ],
  "noStagedFiles": true,
  "diffSummary": "Narrow review of brand source setup, PDP seed, seed-update, result callback, and profile-maintenance tests. All 6 requested blocker fixes are present; no source edits made by reviewer.",
  "reviewFindings": [
    "no blockers",
    "pass: blocker-1 domain normalization/shared helper/disallowed rejection fixed",
    "pass: blocker-2 source setup PUT forces official_brand and brand.slug",
    "pass: blocker-3 duplicate non-verified PDP seed ensures verification job",
    "pass: blocker-4 PDP seed insert is race-safe via insert-first plus 23505 handling",
    "pass: blocker-5 verified seed updates require product_detail_page classification",
    "pass: blocker-6 artifact.kind mismatch is not persisted"
  ],
  "manualNotes": "Required validation report written to /Users/nickborrello/Desktop/Projects/BayState/validation/brand-source-setup-api-final-narrow-review.md. Review-only; no source files modified."
}
```
