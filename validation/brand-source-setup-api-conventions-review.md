## Review

- **Correct:** Admin source-setup routes live under the existing `apps/web/app/api/admin/brands/[id]/source-setup` tree and use Next async params. They also call `requireAdminAuth` before creating the service-role Supabase client (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:84-92`, `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:189-214`, `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:54-89`).
- **Correct:** The PDP seed POST path validates http/https PDP URLs and enqueues `verify_pdp_seed` with the expected capability keys and payload target id on the new-seed path (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:78-86`, `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:201-231`).
- **Correct:** The runner result route keeps the established runner-auth and lease/ownership checks before accepting a terminal callback (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:51-135`), and target seed updates only run for `body.status === 'succeeded'` + `job.kind === 'verify_pdp_seed'` after artifact insertion attempts (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:215-243`).
- **Fixed:** None. Review-only; no source files were modified.

- **Blocker:** Duplicate/reused PDP seeds are returned without enqueuing verification. `POST /pdp-seeds` exits early for any existing non-verified seed and returns `verificationJob: null` (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:146-175`). This breaks the contract that the endpoint creates/reuses a seed and enqueues `verify_pdp_seed`, and it also strands the seed if the original enqueue failed or a rejected/candidate seed needs a retry. The current test locks in the wrong behavior (`apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:827-891`). **Smallest fix:** factor the job insert into a helper and call it for new seeds and reusable non-verified seeds, ideally after checking for an existing active queued/claimed/running job to keep retries idempotent.
- **Blocker:** Official-domain normalization is weaker than existing source-plan conventions and can reject valid seeds. The new normalizer only returns `url.hostname.toLowerCase()` (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:23-27`), while existing source-plan normalization strips `www.`, paths, and ports and applies disallowed-domain filtering (`apps/web/lib/approved-sources/source-plan.ts:68-119`). Because PDP host matching only accepts exact host/subdomain matches (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:40-47`), saving `https://www.example.com/` as the official domain stores `www.example.com` and a later `https://example.com/product` seed is rejected. **Smallest fix:** share/export one canonical domain helper that strips leading `www.`, path/query/fragment/port, rejects disallowed marketplace domains, and use it for both saved official domains and PDP host comparisons.
- **Blocker:** `updateSeedFromVerification` trusts `verification_status: 'verified'` without requiring PDP page-classification evidence. The helper only checks that `verification_status` is in `['verified', 'rejected', 'expired']` and sets `trust_status='verified'`/`verified_at` when the value is `verified` (`apps/web/lib/profile-maintenance/seed-update.ts:61-88`). The guardrails require `succeeded + verified` plus PDP classification evidence before marking a seed trusted. **Smallest fix:** require the verified branch to also see the expected typed evidence (for example `page_classification === 'product_detail_page'` in `result` or artifact payload) and add a negative test proving `verification_status: 'verified'` without PDP evidence does not verify the seed.

- **Note:** `PUT /source-setup` accepts caller-provided `source_slug`/`source_type` and writes them to `brand_sources`/`site_extraction_profiles` (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:68-77`, `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:227-280`), but `GET` and `POST /pdp-seeds` later query only `brand.slug` + `source_type='official_brand'` (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:102-112`). That is over-flexible for an official Brand Source Setup endpoint and can create rows the rest of the API cannot see. Prefer ignoring/removing those body fields or validating them to the canonical official-brand values.
- **Note:** The PUT response claims to return the same shape as GET but does not select the upserted profile id; it hard-codes `siteExtractionProfile.id: null` after a successful profile upsert (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:286-328`). Select the profile row from the upsert or reload the summary so clients can rely on the returned profile metadata.
- **Note:** Test quality is mostly good and the focused suite passes, but one existing result test mock no longer matches the real artifact insert chain: the route calls `.insert(...).select('id').maybeSingle()` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:215-219`), while `result.test.ts` still mocks `artifactInsert` as a Promise (`apps/web/__tests__/profile-maintenance/result.test.ts:72-73`). The focused test run passes only because the route catches the resulting TypeError as non-fatal; the run emitted that warning. Update the mock/assertion so the artifact-id path is genuinely exercised there too.

## Validation commands run

- `git -C /Users/nickborrello/Desktop/Projects/BayState status --short` — passed; confirmed the worktree is dirty with many unrelated pre-existing changes and the reviewed target files are untracked/new.
- `git -C /Users/nickborrello/Desktop/Projects/BayState diff -- apps/web/app/api/admin/brands/[id]/source-setup apps/web/lib/profile-maintenance/seed-update.ts apps/web/lib/profile-maintenance/types.ts apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts apps/web/__tests__/profile-maintenance apps/web/__tests__/lib/profile-maintenance && git -C /Users/nickborrello/Desktop/Projects/BayState ls-files --others --exclude-standard -- <same paths>` — passed; target implementation files are currently untracked.
- `bun run web test -- --testPathPatterns="profile-maintenance"` — passed; 6 suites / 72 tests passed. Output included expected route warnings plus the stale artifact mock warning described above.
- `bun run web typecheck` — failed; TypeScript errors were in pre-existing/unrelated files (`__tests__/app/api/scraper/v1/logs.test.ts`, `lib/consolidation/brand-resolver.ts`), not in the reviewed source-setup/profile-maintenance files.
- `git -C /Users/nickborrello/Desktop/Projects/BayState diff --cached --name-only` — passed; no staged files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete review findings are listed with severity, file paths, and line references; residual risks are included."
    }
  ],
  "changedFiles": [
    "validation/brand-source-setup-api-conventions-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git -C /Users/nickborrello/Desktop/Projects/BayState status --short",
      "result": "passed",
      "summary": "Confirmed dirty worktree and target files present as untracked/new among many unrelated changes."
    },
    {
      "command": "git -C /Users/nickborrello/Desktop/Projects/BayState diff -- <target paths> && git -C /Users/nickborrello/Desktop/Projects/BayState ls-files --others --exclude-standard -- <target paths>",
      "result": "passed",
      "summary": "Reviewed target paths; target implementation/test files are untracked."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance\"",
      "result": "passed",
      "summary": "6 test suites and 72 tests passed; output included route warnings and a stale artifact mock warning."
    },
    {
      "command": "bun run web typecheck",
      "result": "failed",
      "summary": "Failed on unrelated existing errors in __tests__/app/api/scraper/v1/logs.test.ts and lib/consolidation/brand-resolver.ts."
    },
    {
      "command": "git -C /Users/nickborrello/Desktop/Projects/BayState diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Focused Jest profile-maintenance suite passed: 6 suites, 72 tests.",
    "Typecheck failed outside the reviewed files: logs.test.ts mock shape and brand-resolver nullability."
  ],
  "residualRisks": [
    "No database-backed/manual API smoke test was run; review was limited to code inspection and Jest/typecheck commands.",
    "The worktree has many unrelated modified/untracked files, so this review only attests to the requested target paths.",
    "Result processing remains non-transactional: job terminal status, artifact insertion, and seed update can be partially applied if a non-fatal later step fails."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed new Brand Source Setup admin API skeleton, profile-maintenance seed update helper/types, result route integration, and focused Jest coverage; no source edits applied.",
  "reviewFindings": [
    "blocker: apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:146-175 - existing candidate/rejected/expired seeds return verificationJob:null instead of enqueuing verify_pdp_seed; current test at apps/web/__tests__/profile-maintenance/brand-source-setup.test.ts:827-891 enshrines this behavior.",
    "blocker: apps/web/app/api/admin/brands/[id]/source-setup/route.ts:23-27 and apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:40-47 - domain normalization does not strip www/use disallowed-domain conventions, so common official-domain saves can reject valid PDP seeds.",
    "blocker: apps/web/lib/profile-maintenance/seed-update.ts:61-88 - verified seed updates do not require PDP page-classification evidence before setting trust_status='verified'.",
    "note: apps/web/app/api/admin/brands/[id]/source-setup/route.ts:68-77 and :227-280 - source_slug/source_type are over-flexible for an official-brand setup route and can create rows later GET/POST paths ignore.",
    "note: apps/web/app/api/admin/brands/[id]/source-setup/route.ts:286-328 - PUT response hard-codes siteExtractionProfile.id:null after successful upsert.",
    "note: apps/web/__tests__/profile-maintenance/result.test.ts:72-73 - artifact insert mock does not match route .insert().select('id').maybeSingle() chain."
  ],
  "manualNotes": "No source files were modified. The required review artifact was written to validation/brand-source-setup-api-conventions-review.md."
}
```
