## Review

- **Correct:** Admin source-setup routes are under the existing `apps/web/app/api/admin/brands/[id]` tree and use Next async params (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:84-91`, `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:54-61`), matching the route-path guardrail (`handoff/brand-source-setup-api-next-slice-guardrails.md:49-50`).
- **Correct:** Admin routes call `requireAdminAuth` before creating the service-role client or mutating data (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:88-92`, `apps/web/app/api/admin/brands/[id]/source-setup/route.ts:193-214`, `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:58-80`).
- **Correct:** The runner result route still uses runner auth, lease token, lease expiry, runner ownership, and terminal/stale guards before saving a result (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:51-58`, `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:92-128`, `apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:157-185`).
- **Correct:** New seed jobs include `pdp_seed_id` in `payload` and required capabilities including `profile_maintenance.verify_pdp_seed` and `profile_maintenance.crawl4ai` (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:201-229`).
- **Correct:** The result route now captures the inserted artifact id with `.select('id')` before attempting a target seed update (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:215-227`).
- **Fixed:** None. Review-only; no source code or tests were modified.

- **Blocker (scope mismatch):** The current worktree contains many scraper, product-enrichment, UPC-resolution, and admin UI/pipeline changes outside the allowed slice, despite the guardrail excluding scraper Crawl4AI work, enrichment behavior, and UI/workspace changes (`handoff/brand-source-setup-api-next-slice-guardrails.md:37-43`, `handoff/brand-source-setup-api-next-slice-guardrails.md:56`, `docs/plans/site-extraction-profiles-implementation-plan.md:429-439`). Evidence from `git diff --name-only`/untracked files includes `apps/scraper/**`, `apps/web/app/api/admin/enrichment/jobs/route.ts`, `apps/web/app/api/scraper/v1/enrichment-callback/route.ts`, `apps/web/components/admin/pipeline/**`, `apps/web/lib/approved-sources/**`, and `apps/web/lib/upc-resolution/**`. **Smallest fix:** split/revert those out-of-scope changes from this slice or land them separately; keep this PR to admin source setup, profile-maintenance result target updates, and focused tests.

- **Blocker (domain normalization / disallowed domains):** Official-domain save does not meet the domain handling contract. `normalizeDomain()` returns `url.hostname.toLowerCase()` and never strips a leading `www.` (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:23-31`), while the guardrail requires scheme/path/`www`/port normalization (`handoff/brand-source-setup-api-next-slice-guardrails.md:51`). Saving `https://www.example.com/path` makes the canonical domain `www.example.com`; a later seed on `https://example.com/product` fails the host match because only subdomains of `www.example.com` are accepted (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:37-47`, `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:121-129`). The same PUT path also does not reject marketplace/disallowed domains even though source planning later filters domains such as `walmart.com`, `petco.com`, `petsmart.com`, etc. (`apps/web/lib/approved-sources/types.ts:145-166`). **Smallest fix:** share/import the approved-source domain normalizer or add equivalent normalization that strips `www.` and default ports, rejects disallowed suffixes on PUT, and adds tests for `www`, ports, paths, and disallowed domains.

- **Blocker (seed enqueue/idempotency):** Duplicate candidate/rejected/expired seeds are returned with `verificationJob: null` and no enqueue (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:146-175`). If the original enqueue failed, the route returns `201` with a warning after creating the seed (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:233-249`), and every retry then hits the existing-seed branch and can never enqueue verification. The route also does a check-then-insert against a unique seed index (`apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:135-190`; `apps/web/supabase/migrations/20260626000000_site_extraction_profile_foundation.sql:140-142`), so concurrent duplicate POSTs can produce a unique-violation 500 instead of an idempotent response. This violates the seed enqueue contract to create/reuse a seed and enqueue/return a queued verify job (`handoff/brand-source-setup-api-next-slice-guardrails.md:53`). **Smallest fix:** use an upsert-or-fetch seed helper, then find an existing nonterminal `verify_pdp_seed` job for `pdp_seed_id` or enqueue a new one; catch unique conflicts by fetching the existing seed; return the active/new job id.

- **Blocker (source/profile upsert safety):** `PUT` accepts caller-provided `source_slug` and `source_type` (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:68-77`) and writes them into `brand_sources` and `site_extraction_profiles` (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:245-290`). The contract for this slice is specifically to keep/create the matching `official_brand` row (`handoff/brand-source-setup-api-next-slice-guardrails.md:52`), and the GET/seed routes only look up `source_type='official_brand'` and `source_slug=brand.slug` (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:105-116`, `apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:104-112`). An admin request with a different source type/slug can update `brands.official_domains` while creating a profile the rest of the API will not find. **Smallest fix:** force `source_type = 'official_brand'` and `source_slug = brand.slug` for this endpoint, or reject any body values that differ; add a regression test.

- **Blocker (verification semantics / artifact durability):** `updateSeedFromVerification()` marks a seed verified solely from `resultPayload.verification_status === 'verified'` (`apps/web/lib/profile-maintenance/seed-update.ts:61-88`). It does not require `page_classification === 'product_detail_page'` or any durable PDP evidence, although the plan requires verified trusted PDP seeds before AI draft/profile work (`docs/plans/site-extraction-profiles-implementation-plan.md:32-35`) and the handoff requires artifact linkage and false-verification semantics (`handoff/brand-source-setup-api-next-slice-guardrails.md:54-55`). The result route also trusts `body.artifact.kind` instead of enforcing it matches `job.kind` (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:190-206`) and can link that artifact id to the seed (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:230-243`). **Smallest fix:** reject artifact-kind mismatches, require result/artifact verification status consistency, require PDP classification/evidence before `trust_status='verified'`, and add tests for verified-without-PDP-evidence and artifact-kind mismatch.

- **Blocker (scope mismatch / partial failure behavior):** The seed update adds scope filters (`apps/web/lib/profile-maintenance/seed-update.ts:90-107`) but does not `.select()` or otherwise verify that exactly one row was updated. A bad/mismatched `pdp_seed_id` therefore silently leaves the seed unchanged while the job has already been marked terminal (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:161-185`). Artifact creation and seed update errors are treated as non-fatal after the job update (`apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:187-246`), so a transient artifact/seed failure can permanently leave `profile_maintenance_jobs.status='succeeded'` with no durable seed linkage and no retry path. **Smallest fix:** make the result save + artifact insert + seed target update atomic via an RPC/transaction, or at minimum update the seed with `.select('id')` and fail/keep retryable when zero rows match or artifact/seed persistence fails.

- **Note:** `PUT` returns `siteExtractionProfile.id: null` even after a successful profile upsert (`apps/web/app/api/admin/brands/[id]/source-setup/route.ts:286-328`). If a caller needs the profile id immediately, select it from the upsert or refetch the summary.
- **Note:** GET returns brand/profile/seed summary but not recent verification job status/progress or `can_add_seed` / `can_draft_profile` booleans, which were recommended for the setup summary (`handoff/brand-source-setup-api-next-slice-guardrails.md:1-31`, `handoff/brand-source-setup-api-next-slice-guardrails.md:67`). This may be acceptable for a skeleton but should be tracked before UI consumes it.
- **Note:** Focused Jest tests pass, but the older `result.test.ts` artifact test emits `TypeError: supabase.from(...).insert(...).select is not a function` because its mock still models the old insert shape. The pass is not a faithful check of the artifact-id path; `result-seed-update.test.ts` does cover the newer `.select('id')` chain.
- **Note:** Repo `plan.md` and `progress.md` are stale for this slice (`plan.md` describes grouping workflow; `progress.md` describes external enrichment research), so I treated `handoff/brand-source-setup-api-next-slice-guardrails.md` and the site-extraction docs/ADRs as authoritative.

## Validation commands run

- `git status --short && git diff --name-only` — passed; showed scoped files are untracked and many out-of-scope current worktree changes exist.
- `bun run web test -- --testPathPatterns="profile-maintenance"` — passed; 6 suites / 72 tests passed.
- `bun run web typecheck` — failed; current repo errors are in `__tests__/app/api/scraper/v1/logs.test.ts:39` and `apps/web/lib/consolidation/brand-resolver.ts:134-139`.
- `git diff --cached --name-only` — passed; no staged files.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Returned concrete review findings with severity, file paths, and line refs for auth/route correctness, domain normalization, source/profile upsert safety, seed enqueue idempotency, verification semantics, artifact durability, scope mismatch, and partial failure behavior."
    }
  ],
  "changedFiles": [
    "validation/brand-source-setup-api-correctness-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short && git diff --name-only",
      "result": "passed",
      "summary": "Confirmed scoped files are untracked and current worktree includes many out-of-scope scraper/enrichment/UI files."
    },
    {
      "command": "bun run web test -- --testPathPatterns=\"profile-maintenance\"",
      "result": "passed",
      "summary": "6 Jest suites and 72 tests passed; output included expected route warnings plus one stale artifact mock warning in result.test.ts."
    },
    {
      "command": "bun run web typecheck",
      "result": "failed",
      "summary": "tsc failed in unrelated current-worktree files: __tests__/app/api/scraper/v1/logs.test.ts:39 and apps/web/lib/consolidation/brand-resolver.ts:134-139."
    },
    {
      "command": "git diff --cached --name-only",
      "result": "passed",
      "summary": "No staged files."
    }
  ],
  "validationOutput": [
    "Focused profile-maintenance Jest tests passed: 6 suites / 72 tests.",
    "Typecheck failed outside the reviewed source-setup/profile-maintenance files.",
    "Current worktree contains out-of-scope scraper/product-enrichment/UI changes."
  ],
  "residualRisks": [
    "I did not modify source files; blockers remain for the implementation owner to address.",
    "The repository has many pre-existing unrelated dirty/untracked files, so scope ownership should be confirmed before merging."
  ],
  "noStagedFiles": true,
  "diffSummary": "Reviewed untracked Brand Source Setup admin API files, profile-maintenance seed update helper/types, result route, and focused tests; current worktree also includes out-of-scope scraper/enrichment/UI changes.",
  "reviewFindings": [
    "blocker: handoff/brand-source-setup-api-next-slice-guardrails.md:37-43 - current worktree includes out-of-scope scraper, product enrichment, UPC-resolution, and UI/pipeline changes.",
    "blocker: apps/web/app/api/admin/brands/[id]/source-setup/route.ts:23-31 - official-domain normalization does not strip www, causing canonical-domain mismatches.",
    "blocker: apps/web/app/api/admin/brands/[id]/source-setup/route.ts:37-66 and apps/web/lib/approved-sources/types.ts:145-166 - official-domain save does not reject disallowed marketplace/blog domains.",
    "blocker: apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:146-175 - existing candidate/rejected/expired seeds are returned without an active/new verification job.",
    "blocker: apps/web/app/api/admin/brands/[id]/source-setup/pdp-seeds/route.ts:135-190 - check-then-insert against unique seed index is not race-idempotent.",
    "blocker: apps/web/app/api/admin/brands/[id]/source-setup/route.ts:68-77 and 245-290 - source setup accepts arbitrary source_slug/source_type instead of forcing official_brand/brand.slug.",
    "blocker: apps/web/lib/profile-maintenance/seed-update.ts:61-88 - verified seed update only checks verification_status and not PDP classification/evidence.",
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:190-243 - artifact kind is not enforced against job kind before linking artifact id to the seed.",
    "blocker: apps/web/lib/profile-maintenance/seed-update.ts:90-107 - scoped seed update does not verify that any row matched/updated.",
    "blocker: apps/web/app/api/scraper/v1/profile-maintenance/[jobId]/result/route.ts:161-246 - job is marked terminal before artifact/seed target update, making partial failures non-retryable."
  ],
  "manualNotes": "Review-only. No source fixes applied. plan.md/progress.md are stale for this slice; docs/ADRs/handoff were used as scope."
}
```