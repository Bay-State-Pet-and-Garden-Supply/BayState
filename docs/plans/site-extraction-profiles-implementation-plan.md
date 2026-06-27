# Site Extraction Profiles & Brand Source Setup — Implementation Plan

Date: 2026-06-25
Status: Draft ready for implementation sequencing

## Summary

Build a governed extraction-learning path around **Brand Source Setup**, **Site Extraction Profiles**, **Image Candidates**, and dedicated **profile-maintenance jobs**. The first practical target is reliable product-image extraction for official brand / known Product Detail Page sources, without weakening the existing product enrichment pipeline or storing Browser Profile identity data in Supabase.

The implementation keeps the existing coordinator/runner boundary:

- `apps/web` owns configuration, profile versions, approvals, job leasing, and artifacts.
- `apps/scraper` claims async work, runs Crawl4AI/Playwright/model jobs, sanitizes evidence, and posts results back through API callbacks.
- Product enrichment jobs consume only approved immutable profile snapshots and validated Browser Profile references.

## Decisions already settled

References:

- `docs/adr/0007-embed-site-extraction-profiles-in-jobs.md`
- `docs/adr/0008-declarative-field-evidence-rules.md`
- `docs/adr/0009-first-class-site-extraction-profile-tables.md`
- `docs/adr/0010-browser-profile-registry-runtime-storage.md`
- `docs/adr/0011-dedicated-profile-maintenance-jobs.md`
- `apps/scraper/CONTEXT.md`

Important accepted constraints:

- Site Extraction Profile owner: `brand_id + source_slug + canonical_domain`.
- Browser Profile is separate from Site Extraction Profile.
- Browser Profile data stays in runner/runtime storage; coordinator stores registry/setup metadata only.
- Brand Source Setup can save official domain without a PDP seed.
- AI Schema Draft requires at least one verified trusted Product Detail Page seed.
- PDP seed verification, AI Schema Drafting, Profile Version validation, Browser Profile setup, and Browser Profile revalidation are async profile-maintenance jobs.
- Profile-maintenance artifacts are immutable evidence records with shared envelope + typed payload; bulky evidence lives in object storage and excludes secrets/identity state.
- Required Browser Profiles fail closed if stale, missing, or failed validation.

## Current code anchors

| Area | Existing anchor |
| --- | --- |
| Imported tab UI | `apps/web/components/admin/pipeline/ImportedResultsView.tsx` |
| Existing source cascade UI | `apps/web/components/admin/brands/BrandSourceCascadeEditor.tsx` |
| Brand/source schema | `brands.official_domains`, `brands.preferred_domains`, `brand_sources` in `apps/web/supabase/migrations/20250101000000_baseline.sql` |
| Source planning | `apps/web/lib/approved-sources/source-plan.ts` and `source-cascade.ts` |
| Product enrichment queue | `enrichment_jobs`, `enrichment_attempts` |
| Runner claim/callback pattern | `apps/scraper/core/api_client.py`, `apps/scraper/daemon.py`, `apps/scraper/runner/__init__.py` |
| Capability-gated runner example | `apps/web/app/api/scraper/v1/packaging-extractions/claim/route.ts` |
| Product image selection | `apps/scraper/scrapers/product_url_extraction/media_selector.py` |
| Crawl4AI execution | `apps/scraper/src/crawl4ai_engine/engine.py` |

## Non-goals

- Do not infer reusable profile knowledge from passive approvals.
- Do not put cookies, localStorage, Browser Profile files, or token-bearing request headers in Supabase or artifact blobs.
- Do not replace source ranking/cascade policy with extraction profiles.
- Do not invent an executable selector language; Field Evidence Rules compile to allowlisted Crawl4AI config/schema primitives.
- Do not make profile-maintenance job failures directly advance/fail product pipeline status.

## Phase 1 — Coordinator data model and storage

Add timestamped Supabase migrations under `apps/web/supabase/migrations/`.

### 1.1 Site Extraction Profile tables

Create first-class profile tables:

- `site_extraction_profiles`
  - `id`
  - `brand_id`
  - `brand_source_id` nullable FK to `brand_sources`
  - `source_slug`
  - `source_type`
  - `canonical_domain`
  - `commerce_platform` nullable
  - `status`: `draft`, `active`, `disabled`, `needs_attention`
  - `active_version_id` nullable
  - `metadata jsonb`
  - timestamps
  - unique index on `(brand_id, source_slug, canonical_domain)`

- `site_extraction_profile_versions`
  - `id`, `profile_id`, `version_number`
  - `status`: `draft`, `validating`, `approved`, `active`, `retired`, `rejected`
  - `rules jsonb` — BayState Field Evidence Rules
  - `compiled_crawl4ai_schema jsonb` nullable
  - `version_hash`
  - `created_from`: `ai_schema_draft`, `explicit_correction`, `manual`, `rollback`
  - `created_by`, `approved_by`, `approved_at`, `approval_note`
  - timestamps
  - unique `(profile_id, version_number)` and unique active partial index per profile

- `explicit_extraction_corrections`
  - field-level deliberate reusable corrections
  - links to brand/source/domain/profile/version when applicable
  - stores accepted and rejected evidence summaries, not raw browser identity state

### 1.2 Validation and seed tables

Create:

- `product_detail_page_seeds`
  - `brand_id`, `source_slug`, `canonical_domain`, `url`, `normalized_url`
  - `trust_status`: `candidate`, `verified`, `rejected`, `expired`
  - `verification_artifact_id`
  - `validation_case_id`
  - timestamps and actor metadata

- `profile_validation_sets`
  - profile-scoped curated set metadata

- `profile_validation_cases`
  - case type: `seed`, `correction`, `known_good`, `nearby_variant`, `gold`
  - product identifiers: UPC/name/variant where available
  - source URL
  - assertions JSON
  - latest artifact refs

- `profile_validation_runs`
  - profile version + validation set + status + artifact summary

Verified PDP seeds should automatically create seed validation cases with lightweight assertions.

### 1.3 Browser Profile registry tables

Create coordinator registry/setup state only:

- `browser_profiles`
  - `id`
  - `brand_id`, `source_slug`, `canonical_domain`
  - `status`: `requested`, `assigned`, `in_progress`, `validated`, `validation_failed`, `expired`, `revoked`
  - `required boolean`
  - `runner_name` / `runner_pool`
  - `environment`: `local`, `staging`, `production`, etc.
  - `storage_ref` — opaque non-secret runner-local lookup key
  - `last_validated_at`, `stale_after`
  - `last_validation_artifact_id`
  - metadata/timestamps

- `browser_profile_setup_requests`
  - request lifecycle and assignment history
  - verification target PDP seed IDs
  - target capabilities/pool

### 1.4 Profile-maintenance job and artifact tables

Create dedicated queue:

- `profile_maintenance_jobs`
  - `kind`: `verify_pdp_seed`, `draft_site_extraction_profile`, `validate_profile_version`, `browser_profile_setup`, `browser_profile_revalidate`
  - `status`: `queued`, `claimed`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`
  - scope columns: `brand_id`, `source_slug`, `canonical_domain`, `profile_id`, `profile_version_id`, `browser_profile_id`
  - `payload jsonb`
  - `required_capabilities jsonb`
  - `claimed_by`, `lease_token`, `lease_expires_at`, `attempt_count`, `max_attempts`
  - result/error/progress fields and timestamps

- `profile_maintenance_artifacts`
  - shared envelope: `id`, `artifact_version`, `kind`, `job_id`, `attempt_number`, scope, runner/environment, `status`, `schema_version`, hash, timestamps
  - `payload jsonb` typed by artifact kind, kept compact
  - `evidence_refs jsonb` pointing to object storage
  - review metadata: `review_status`, `reviewed_by`, `reviewed_at`, comments
  - immutable evidence payload; only review/workflow metadata mutable

- optional `profile_maintenance_job_logs`, mirroring `enrichment_job_logs` if existing UI needs live logs.

### 1.5 Object storage

Create a Supabase Storage bucket such as `profile-maintenance-evidence`.

Store bulky evidence there:

- screenshots/thumbnails
- sanitized HTML/markdown snapshots
- crawl traces
- large Image Candidate dumps

DB rows store durable refs, content hash, size, content type, and retention metadata.

## Phase 2 — Web APIs and job leasing

### 2.1 Admin APIs

Add admin-facing route handlers under `apps/web/app/api/admin/`:

- `GET/PUT /api/admin/brands/[brandId]/source-setup`
  - save official domain evidence
  - ensure/return source setup summary
  - expose source cascade readiness and profile readiness

- `POST /api/admin/brands/[brandId]/source-setup/pdp-seeds`
  - create seed candidate and enqueue `verify_pdp_seed`

- `POST /api/admin/site-extraction-profiles/[profileId]/draft`
  - enqueue `draft_site_extraction_profile`

- `POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/validate`
  - enqueue `validate_profile_version`

- `POST /api/admin/site-extraction-profiles/[profileId]/versions/[versionId]/approve`
  - require validation run and human approval note
  - atomically activate version

- `POST /api/admin/browser-profiles/setup-requests`
  - create setup request and enqueue `browser_profile_setup`

- `POST /api/admin/browser-profiles/[id]/revalidate`
  - enqueue `browser_profile_revalidate`

- `GET /api/admin/profile-maintenance/jobs/[id]`
- `GET /api/admin/profile-maintenance/artifacts/[id]`

### 2.2 Scraper runner APIs

Add runner endpoints under `apps/web/app/api/scraper/v1/profile-maintenance/`:

- `POST /claim`
  - validate runner API key
  - load runner metadata from `scraper_runners`
  - merge advertised capabilities like packaging claim does
  - atomically claim queued/expired jobs whose `required_capabilities` are satisfied

- `POST /[jobId]/progress`
  - update phase/message/details while claimed lease is valid

- `POST /[jobId]/result`
  - validate lease token
  - write/attach artifact envelope + typed payload
  - mark job succeeded/failed/timed out
  - update target rows like PDP seed, Browser Profile, Profile Version validation status

- `POST /[jobId]/evidence-upload-url` or coordinator-mediated upload
  - provide signed upload target for sanitized bulky evidence

## Phase 3 — Scraper runner support

### 3.1 Shared schemas

Add Pydantic models in `apps/scraper/api/`, e.g. `profile_maintenance.py`:

- claimed job model
- capability model
- artifact envelope model
- typed payload models for each job kind
- Image Candidate model

Mirror critical TypeScript types in `apps/web/lib/profile-maintenance/types.ts` or generated Zod schemas.

### 3.2 API client and daemon loop

Extend:

- `apps/scraper/core/api_client.py`
  - `claim_profile_maintenance()`
  - `submit_profile_maintenance_progress()`
  - `submit_profile_maintenance_result()`
  - artifact upload helpers

- `apps/scraper/daemon.py`
  - advertise capabilities from env/config, e.g. `crawl4ai`, `crawl4ai_model_schema_draft`, `browser_profile_setup`, `browser_profile_runtime`
  - claim profile-maintenance jobs with separate concurrency limits so product enrichment is not starved

### 3.3 Job handlers

Create `apps/scraper/runner/profile_maintenance.py` with handlers:

- `verify_pdp_seed`
  - crawl target with Crawl4AI/Playwright
  - use Browser Profile only if job explicitly references a validated profile
  - verify canonical/allowed domain
  - classify page as Product Detail Page vs listing/search/home/blog
  - check brand/name overlap and obvious variant conflicts
  - build Image Candidates
  - produce verification artifact

- `draft_site_extraction_profile`
  - require verified seed artifacts
  - use Crawl4AI `JsonCssExtractionStrategy.generate_schema()` or configured strong model to draft schema/rules
  - output draft Field Evidence Rules and compiled Crawl4AI schema
  - create draft Profile Version through result callback

- `validate_profile_version`
  - compile rules to Crawl4AI config/schema
  - run fixture/snapshot and live validation cases
  - distinguish rule failures from crawl/access/identity/source mismatch failures
  - produce validation run artifact

- `browser_profile_setup`
  - only claim on interactive-capable runner/pool
  - use Crawl4AI BrowserProfiler or equivalent local provisioning flow
  - return only registry metadata/storage ref and validation artifact

- `browser_profile_revalidate`
  - resolve local runtime profile by opaque storage ref
  - verify target seed URLs
  - mark validated/expired/revoked through callback

## Phase 4 — Image Candidate pipeline

### 4.1 Normalize candidate shape

Add a reusable candidate builder, e.g.:

```text
apps/scraper/scrapers/product_url_extraction/image_candidates.py
```

`ImageCandidate` should include:

- `url`, `canonical_url`, `source_url`
- source type: DOM image, `srcset`, JSON-LD, OpenGraph, product schema, CSS/background, Crawl4AI schema field
- DOM context: selector/path, nearby text, alt/title/aria, gallery hints, product-detail container hints
- media metadata: width/height/content type/bytes when available
- scoring fields, matched rule IDs, rejection reasons
- evidence refs for debug artifacts

### 4.2 Extend ProductMediaSelector, do not replace it

Update `apps/scraper/scrapers/product_url_extraction/media_selector.py` to accept normalized candidates while preserving backward compatibility with raw URL input.

Selection order:

1. hard negative Field Evidence Rules reject candidates
2. positive profile rules boost candidates
3. existing deterministic selector scores gallery/product-image signals
4. optional LLM arbitration among ambiguous candidates
5. output selected/rejected candidates with Field Evidence Provenance

PDP seed verification must call the same Image Candidate builder.

## Phase 5 — Brand Source Setup UI

Replace or wrap the existing cascade dialog launched from `ImportedResultsView.tsx` with a guided Brand Source Setup drawer/modal.

Recommended component shape:

```text
apps/web/components/admin/brands/BrandSourceSetupDrawer.tsx
apps/web/components/admin/brands/BrandSourceSetupDomainStep.tsx
apps/web/components/admin/brands/BrandSourceSetupPdpSeedStep.tsx
apps/web/components/admin/brands/BrandSourceSetupBrowserProfileStep.tsx
apps/web/components/admin/brands/BrandSourceSetupProfileStep.tsx
```

Flow:

1. Save official/canonical domain.
2. Show source cascade readiness; embed or link to `BrandSourceCascadeEditor`.
3. Paste Product Detail Page seed.
4. Enqueue verification job and show queued/running/succeeded/failed artifact summary.
5. If access/identity blocks verification, recommend Browser Profile setup.
6. If seed is verified, enable Draft Profile.
7. Show draft Profile Version and validation status.
8. Allow approval with a short note only after validation.

The Imported tab remains the launch point for immediate brand setup. A later profile-maintenance workspace becomes the cross-brand queue/review surface.

## Phase 6 — Product enrichment integration

### 6.1 Embed active profile snapshots in source plans

Extend `apps/web/lib/approved-sources/source-plan.ts` so job creation resolves active profile versions for each source/domain and embeds immutable snapshots in `enrichment_jobs.config.source_plans_by_upc`.

Snapshot should include:

- profile id
- version id
- version hash
- owner scope
- rules snapshot
- compiled Crawl4AI schema/config snapshot
- Browser Profile requirement/reference if required and validated

### 6.2 Runner executes snapshots only

Update runner extraction path so it:

- uses embedded snapshot from job payload
- never queries Supabase directly for profiles
- compiles Field Evidence Rules to Crawl4AI strategy/config
- fails closed if a required Browser Profile is stale/missing/failed
- falls back field-by-field only when allowed by Field Quality Gates
- emits compact Field Evidence Provenance and Profile Extraction Status

### 6.3 Callback persistence

Update `apps/web/app/api/scraper/v1/enrichment-callback/route.ts` and `apps/web/lib/scraper-callback/enrichment-result.ts` to persist:

- profile ids/version/hash used
- Profile Extraction Status
- compact Field Evidence Provenance
- image selected/rejected candidate summaries where compact enough
- Profile Attention Items for repeated quality/access failures

## Phase 7 — Profile Maintenance workspace and corrections

Add a separate admin workspace after the MVP drawer is functional:

```text
apps/web/app/admin/profile-maintenance/page.tsx
apps/web/components/admin/profile-maintenance/*
```

Surfaces:

- attention items
- queued/running maintenance jobs
- verified/rejected PDP seeds
- draft Profile Versions
- validation runs/artifacts
- Browser Profile setup/revalidation status
- Explicit Corrections awaiting promotion

Admin image correction UI should offer an explicit “teach extractor” action. That creates an Explicit Correction and draft Profile Version; passive image edits remain merchandising choices.

## Rollout order

1. **DB foundation**: migrations for profiles, validation, jobs, artifacts, Browser Profile registry, storage bucket.
2. **Profile-maintenance API skeleton**: admin create/read endpoints + scraper claim/result endpoints with capability routing.
3. **Image Candidate models and tests**: pure candidate builder/scoring tests from fixture HTML.
4. **PDP seed verification MVP**: runner job + artifacts + Brand Source Setup UI status.
5. **AI Schema Draft MVP**: generated draft rules from verified seeds, not active by default.
6. **Validation/approval**: validation set execution, approval note, atomic active version switch, rollback path.
7. **Product enrichment snapshot consumption**: embed active profile snapshots in source plans; runner uses them behind feature flag.
8. **Browser Profile support**: setup/revalidate jobs, validated registry refs, required-profile fail-closed behavior.
9. **Profile Maintenance workspace**: cross-brand queue and artifact review.
10. **Explicit Corrections**: reusable correction capture and draft Profile Version creation.

## Feature flags

Add server/runtime flags to reduce rollout risk:

- `PROFILE_MAINTENANCE_JOBS_ENABLED`
- `BRAND_SOURCE_SETUP_ENABLED`
- `IMAGE_CANDIDATES_V2_ENABLED`
- `SITE_EXTRACTION_PROFILES_IN_ENRICHMENT_ENABLED`
- `BROWSER_PROFILE_RUNTIME_ENABLED`

Default product enrichment behavior should remain unchanged until profile snapshot execution is explicitly enabled.

## Test plan

### Web

- Migration sanity with local Supabase.
- API tests for:
  - official domain save without seed
  - seed creation enqueues verification job
  - claim endpoint filters by capabilities
  - result endpoint validates lease token and creates immutable artifact
  - approve endpoint requires validation and approval note
  - active Profile Version is unique/atomic
- Component tests for Brand Source Setup drawer states.

Focused commands:

```bash
bun run web test -- --testPathPatterns="profile-maintenance|brand-source-setup|source-plan"
bun run web lint
```

### Scraper

- Unit tests for Image Candidate builder and ProductMediaSelector scoring.
- Fixture-based seed verification tests: product page, category page, wrong domain, blocked/login page, variant mismatch.
- Pydantic contract tests for job/result payloads.
- Browser Profile fail-closed tests.
- Profile Version hash stability tests.

Focused commands:

```bash
uv run pytest tests/unit/test_profile_maintenance_jobs.py tests/unit/test_image_candidates.py
uv run pytest tests/unit/test_gold_dataset_schema.py tests/unit/test_gold_gates.py
ruff check . --output-format=github
```

### End-to-end smoke

1. Imported tab opens Brand Source Setup for a branded group.
2. Save official domain.
3. Add verified PDP seed.
4. Draft profile.
5. Validate and approve Profile Version.
6. Create product enrichment job.
7. Confirm job payload includes active profile snapshot.
8. Runner selects product image via Image Candidate pipeline and reports provenance.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Profile rules overfit one seed | Require validation set and make seed cases lightweight until stronger assertions exist. |
| Browser Profile leakage | Store Browser Profile data only on runner; sanitize artifacts; exclude cookies/storage/headers. |
| Product pipeline regressions | Keep profile execution behind feature flag; fallback current extraction when no required profile. |
| Queue starvation | Separate profile-maintenance concurrency from enrichment concurrency. |
| Large artifact storage growth | Default retention with explicit purge controls, content hashing, and object storage lifecycle policy. |
| AI-generated bad schema | Treat as draft only; require validation and human approval before activation. |

## First implementation PR recommendation

Start with the smallest vertical foundation:

1. Migration for `profile_maintenance_jobs` and `profile_maintenance_artifacts`.
2. Runner claim/result endpoints with capability filtering.
3. Scraper ApiClient methods and daemon polling behind `PROFILE_MAINTENANCE_JOBS_ENABLED`.
4. A no-op/test job kind or `verify_pdp_seed` skeleton returning a typed artifact from a static fixture.
5. Tests for lease handling, capability routing, and immutable artifacts.

This proves the new async maintenance queue before adding profile rules, Browser Profiles, or production extraction behavior.
