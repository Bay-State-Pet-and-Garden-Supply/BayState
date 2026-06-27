## Review
- Correct: PASS — the max-attempt failure update is no longer keyed only by `id`. `tryClaimCandidate` now chains `eq('id', rowId)`, `eq('attempt_count', attemptCount)`, and an expected-status guard before awaiting the update (`apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts:302-315`). Queued candidates pass `expectedStatus: 'queued'` (`route.ts:248`); expired-lease candidates pass `['claimed', 'running']` (`route.ts:280`), so cancelled/terminal rows are not eligible for this failure overwrite.
- Correct: PASS — focused test coverage exists for the blocker. The test `guards max-attempt failure updates with attempt count and expected status` sets up a maxed job (`apps/web/__tests__/profile-maintenance/claim.test.ts:264-286`) and asserts the failed update is constrained by `id`, `attempt_count`, and `status: 'queued'` (`claim.test.ts:322-328`). This would fail against the prior `.eq('id')`-only behavior.
- Correct: PASS — the shared capability type matches the runtime enabled-based contract. `ProfileMaintenanceCapabilities` requires `enabled: boolean` and optional feature booleans (`apps/web/lib/profile-maintenance/types.ts:63-70`), matching the route-local capability shape (`route.ts:26-33`) and runtime checks for `storedCapability?.enabled` / request-body `enabled` (`route.ts:80-92`).
- Correct: Focused test command passed: `bun run web test -- __tests__/profile-maintenance/claim.test.ts` — 1 suite, 9 tests passed.
- Note: `git diff --cached --quiet` reported no staged files. Relevant scoped files are currently untracked in git status, so there is no staged diff to review.
- Blocker: none found in the requested narrow final check.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Narrow review only inspected the requested route, test, and shared type files; no code changes were made by this review. The max-attempt failure update is guarded by id, attempt_count, and expected status in route.ts:302-315, with queued and expired callers supplying expected statuses at route.ts:248 and route.ts:280."
    }
  ],
  "changedFiles": [
    "apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts",
    "apps/web/__tests__/profile-maintenance/claim.test.ts",
    "apps/web/lib/profile-maintenance/types.ts"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/claim.test.ts"
  ],
  "commandsRun": [
    {
      "command": "git status --short -- apps/web/app/api/scraper/v1/profile-maintenance/claim/route.ts apps/web/__tests__/profile-maintenance/claim.test.ts apps/web/lib/profile-maintenance/types.ts",
      "result": "passed",
      "summary": "Scoped files reported as untracked."
    },
    {
      "command": "bun run web test -- __tests__/profile-maintenance/claim.test.ts",
      "result": "passed",
      "summary": "PASS: 1 test suite, 9 tests passed."
    },
    {
      "command": "git diff --cached --quiet",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "PASS: max-attempt failure overwrite blocker fixed in route.ts:302-315 and status-scoped by callers at route.ts:248 and route.ts:280.",
    "PASS: blocker regression covered by claim.test.ts:264-328.",
    "PASS: capability type shape matches runtime enabled-based contract at types.ts:63-70 and route.ts:26-33,80-92.",
    "Focused Jest output: PASS __tests__/profile-maintenance/claim.test.ts; Tests: 9 passed, 9 total."
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "Scoped profile-maintenance route/test/type files are untracked in git status. Route guards max-attempt failed updates with attempt_count and expected status; test asserts the guard; shared types use the enabled boolean capability object.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "No files were modified except writing this requested validation report."
}
```