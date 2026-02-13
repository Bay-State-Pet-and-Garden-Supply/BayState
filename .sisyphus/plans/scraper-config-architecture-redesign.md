# Scraper Config Architecture Redesign (DB-Only)

## Context

### Original Request
The scraper config schema is unclear and poorly integrated. Configs used to be `.yaml` files in the repo, but now configs are stored in the database. It’s time to redesign the architecture across both the Admin Panel and the Scraper Runners.

### Interview Summary
**Key Decisions (confirmed)**
- Source of truth: **DB-only** (YAML copies exist; migration is acceptable).
- Primary pain: **Admin Panel is incoherent** and appears to parse configs incorrectly.
- Admin authoring UX: **form-based** editor (optimized for Ops/Admin users).
- Runner ingestion: **fetch the latest** config at job start.
- Safety controls: **strict publish workflow** (Draft → Validate → Publish).
- Validation: **versioned schema + strict validation** end-to-end.
- Verification strategy: **TDD**.

### Metis Review (gaps identified)
Metis highlighted several risks/gaps to cover explicitly:
- The Admin Panel and DB schema current state was not inspected yet; plan must include discovery tasks and avoid assumptions.
- Runner currently may **swallow config parsing errors** and continue (risk: silent failures) — must fail fast.
- Guardrails needed: store configs as structured JSON (not opaque text), make published configs immutable, validate at save-time and at runner fetch-time.
- Edge cases: editing races vs runner fetch, publish invalid configs, DB downtime at runner start, schema evolution and backward compatibility.

---

## Work Objectives

### Core Objective
Make scraper configs a first-class, **DB-only**, **versioned**, **strictly validated** artifact with a usable **form-based Admin editor** and a robust runner ingestion path that fetches the latest **published** config at job start.

### Concrete Deliverables
- A formal, versioned scraper config schema (single source of truth) and validators.
- Admin Panel form-based editor with field-level validation and publish controls.
- API endpoints/handlers that enforce validation and publish state.
- Runner changes to fetch latest **published** config, validate, and fail fast.
- Migration path for existing YAML configs into DB.
- TDD test coverage for schema validation + admin workflows + runner ingestion.

### Definition of Done
- Admin users can create/edit **draft** configs via a form, see validation errors, and publish only valid configs.
- Runners fetch the latest **published** config at job start and fail fast if invalid/unavailable.
- Existing YAML configs are migrated into DB (at least one end-to-end proof migration + script/process for the rest).
- Tests pass in both projects (App + Scraper) following existing infra.

### Must Have
- Strict validation at **Admin save/validate** time and **Runner fetch** time.
- Publish lifecycle with immutable published versions.
- Clear error messages suitable for Ops/Admin users.

### Must NOT Have (Guardrails)
- No editing published configs in place (publish creates a new version row).
- No storing configs as opaque text blobs without structure.
- No silent runner continuation on config parse/validation errors.
- No new features in `BayStateTools/` (deprecated).

---

## Verification Strategy (TDD)

### Test Decision
- **Infrastructure exists**: YES (per workspace docs)
  - App: Jest + React Testing Library (`CI=true npm test`)
  - Scraper: pytest (`python -m pytest`)
- **User wants tests**: YES (TDD)

### TDD Conventions
- For each deliverable, write failing tests first (RED), implement minimal code (GREEN), then refactor.
- Every task includes at least one manual verification step even if tests exist.

---

## Task Flow

```
Discovery → Schema + Validator → API + DB lifecycle → Admin Form UI → Runner ingestion → Migration → Hardening
```

## Parallelization

| Group | Tasks | Reason |
|------:|-------|--------|
| A | Admin UI scaffolding + schema docs | Can proceed while API discovery runs |
| B | Runner fail-fast + fetch plumbing | Largely independent of Admin UI |
| C | Migration tooling | Can be developed once schema is fixed |

---

## TODOs

> Notes:
> - File references below are **placeholders until discovery confirms exact paths**. Replace placeholders with verified paths during execution.
> - “Latest” runner fetch should mean “latest **published**” to avoid drafts breaking production runs.

- [x] 1. Inventory current config storage + admin parsing path (Discovery)

  **What to do**:
  - Locate current DB tables/columns used for scraper configs (e.g., `scraper_configs`, `scraper_config_versions`).
  - Locate Admin Panel pages/components that create/edit configs and identify current parsing/serialization.
  - Document current failure modes with screenshots/logs (what feels “incoherent”, what doesn’t parse).

  **Must NOT do**:
  - Don’t redesign UI yet; just map what exists.

  **Parallelizable**: YES (with 2)

  **References**:
  - `BayStateApp/` Admin routes and forms (discover exact files)
  - Supabase migration folder: `BayStateApp/supabase/`

  **Acceptance Criteria**:
  - A short written inventory added to this plan (or a note) listing tables, columns, and the key Admin UI entrypoints.
  - Manual: reproduce at least one parsing bug and capture the exact error/output.

- [x] 2. Inventory runner config ingestion and current validation behavior (Discovery)

  **What to do**:
  - Identify how runners currently load config (from YAML vs API vs DB).
  - Confirm whether config parsing/validation errors are swallowed; change policy to **fail fast**.

  **Must NOT do**:
  - Don’t change scraping logic/actions DSL beyond validation and ingestion.

  **Parallelizable**: YES (with 1)

  **References (from Metis)**:
  - `BayStateScraper/core/api_client.py` (job-fetch client; confirm whether configs are fetched here)
  - `BayStateScraper/scraper_backend/core/api_client.py` (alternate client; confirm if this is the runner-facing API client)
  - `BayStateScraper/scraper_backend/scrapers/parser/yaml_parser.py` (parser)
  - `BayStateScraper/scraper_backend/scrapers/schemas/scraper_config_schema.py` (validation)
  - `BayStateScraper/scraper_backend/utils/debugging/config_validator.py` (validator)

  **Acceptance Criteria**:
  - A documented “current flow” diagram and the exact point where errors are handled.
  - Manual: show that invalid config fails the run with an explicit error.

- [x] 3. Define the DB-first, versioned config schema (contract)

  **What to do**:
  - Specify a single canonical schema model (fields, types, constraints), including explicit `schema_version`.
  - Confirm how `schema_version` is enforced across stacks:
    - App: Zod schema includes `schema_version` and rejects unknown versions
    - Runner: Pydantic validates `schema_version` and rejects unknown versions
  - Define which parts are editable by Ops via forms vs advanced/locked fields.
  - Define validation rules: required fields, selector formats, allowed action types, etc.

  **Must NOT do**:
  - Don’t keep “mystery fields”; everything must be typed and validated.

  **Parallelizable**: YES (with 4)

  **References**:
  - Existing YAML shape (discover actual examples under `BayStateScraper/scrapers/configs/`)
  - Current Pydantic models as baseline

  **Acceptance Criteria**:
  - Tests: schema validation tests covering happy path + common invalid cases.
  - Manual: validate one real config and show clear errors on an invalid edit.

- [x] 4. Design DB tables + publish lifecycle (Draft → Validate → Publish)

  **What to do**:
  - Choose table layout (recommended):
    - `scraper_configs` (stable identity, slug/name, domain)
    - `scraper_config_versions` (immutable versions, JSONB payload, `status`, `published_at`)
  - Enforce: published versions immutable; publishing creates a new row.
  - Define how “latest” is resolved: `latest_published` only.
  - Define canonical SQL pattern for latest published selection:
    - `WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`

  **Must NOT do**:
  - Don’t allow in-place mutation of published versions.

  **Parallelizable**: YES (with 3)

  **References**:
  - `BayStateApp/supabase/` migrations and RLS patterns

  **Acceptance Criteria**:
  - Migrations + RLS policies drafted with tests/verification steps.
  - Manual: SQL query demonstrates latest published version selection.

- [x] 5. Implement API contract for config CRUD + validation + publish

  **What to do**:
  - Add endpoints/server actions for:
    - Create/update draft
    - Validate draft (server-side validation)
    - Publish (only if valid)
    - Fetch latest published (runner-facing)
  - Specify a stable runner-facing endpoint contract and path (example):
    - `GET /api/admin/scrapers/configs/latest?slug={slug}` (or equivalent)
    - Response: `{ schema_version, slug, version, status: "published", config: <canonical_json> }`
  - Ensure role-based access: Ops/Admin can edit/publish; runner access via existing auth (API key/HMAC conventions).

  **Must NOT do**:
  - Don’t expose draft configs to runners.

  **Parallelizable**: NO (depends on 3, 4)

  **References**:
  - Existing admin API patterns in `BayStateApp/app/api/admin/`
  - Existing scraper callback auth patterns in `BayStateApp/app/api/admin/scraping/`

  **Acceptance Criteria**:
  - Tests: API validation + authorization tests.
  - Manual: curl the runner endpoint and confirm response matches schema.

- [x] 6. Rebuild Admin Panel config editor as a form-based UX

  **What to do**:
  - Build an opinionated form UI for Ops/Admin users:
    - Clear sections (metadata, selectors, actions/workflow, rate limits)
    - Inline validation errors and summaries
    - Validate button (server-side)
    - Publish button (enabled only when valid)
  - Include a read-only “rendered preview” of the JSON that will be stored.

  **Must NOT do**:
  - Don’t add a full diff/history viewer (defer).

  **Parallelizable**: NO (depends on 3, 5)

  **References**:
  - App conventions: RHF + Zod, shadcn/ui
  - Existing admin UI patterns under `BayStateApp/components/admin/`

  **Acceptance Criteria**:
  - Tests: RTL tests for key flows (create draft, show validation errors, publish success).
  - Manual: Ops user can complete end-to-end workflow without raw JSON editing.

- [x] 7. Runner: fetch latest published config at job start + validate + fail fast

  **What to do**:
  - Implement/adjust runner config fetch to call the runner-facing endpoint.
  - Validate response strictly using the **Pydantic** config model (source of truth) in:
    - `BayStateScraper/scraper_backend/scrapers/models/config.py` (full `ScraperConfig`)
  - Explicitly address dual-config representations:
    - `BayStateScraper/core/api_client.py` contains a minimal `ScraperConfig` dataclass used for job responses
    - Decide whether to (a) deprecate it, (b) rename it, or (c) keep it as a separate DTO
  - Fail-fast error handling:
    - Use `ConfigValidationError` from `BayStateScraper/scraper_backend/utils/debugging/config_validator.py`
    - Ensure validation happens before any expensive runner work (e.g., browser startup)
  - Improve error reporting: clear message including config id/slug + schema_version.

  **Must NOT do**:
  - Don’t continue scraping when config is invalid/unavailable.

  **Parallelizable**: NO (depends on 5)

  **References (from Metis)**:
  - `BayStateScraper/core/api_client.py` (job-fetch client; may need DTO alignment)
  - `BayStateScraper/scraper_backend/core/api_client.py` (if used by runner)
  - `BayStateScraper/scraper_backend/scrapers/models/config.py` (Pydantic `ScraperConfig` source of truth)
  - `BayStateScraper/scraper_backend/scrapers/schemas/scraper_config_schema.py`

  **Acceptance Criteria**:
  - Tests: pytest unit test for fetch + validation failure behavior.
  - Manual: run a job with invalid config and confirm it stops immediately.

- [x] 8. Migration: convert existing YAML configs into DB versions

  **What to do**:
  - Build a one-time migration script/process:
    - Load YAML
    - Normalize into canonical schema JSON
    - Write as published version (or draft + publish)
  - Run at least one config through end-to-end migration as a proof.

  **Must NOT do**:
  - Don’t assume 100% can be auto-migrated without validation feedback.

  **Parallelizable**: NO (depends on 3, 4, 5)

  **References**:
  - YAML examples in `BayStateScraper/scrapers/configs/`

  **Acceptance Criteria**:
  - Tests: migration normalization unit tests.
  - Manual: migrated config is editable in Admin and runnable by runner.

- [x] 9. Hardening: auditing, rollback, and operational safety

  **What to do**:
  - Add audit metadata (who published, when, reason).
  - Add rollback capability by publishing an older version as newest.
  - Add safeguards against “edit while runner fetches” (publish is atomic; drafts not visible).

  **Must NOT do**:
  - Don’t build notifications/approvals unless explicitly requested.

  **Parallelizable**: YES (after 6, 7)

  **Acceptance Criteria**:
  - Manual: demonstrate rollback procedure and runner uses the new latest published.

---

## Commit Strategy

> Follow repo convention: `<type>(<scope>): <description>`

| After Task | Message | Notes |
|-----------:|---------|------|
| 3–4 | `feat(scrapers): add versioned config schema` | schema + migrations/constraints |
| 5–6 | `feat(admin): rebuild scraper config editor` | admin UX + API validation |
| 7 | `fix(runner): fail fast on invalid config` | runner behavior correctness |
| 8 | `chore(migration): import yaml configs to db` | one-time tooling |

---

## Success Criteria

### Verification Commands
- App tests: `cd BayStateApp && CI=true npm test`
- App lint: `cd BayStateApp && npm run lint`
- Scraper tests: `cd BayStateScraper && python -m pytest`

### Final Checklist
- [x] Admin users can draft/validate/publish via form UI (Task 6)
- [x] Only published versions are runner-visible (Task 4 RLS + Task 5 API)
- [x] Runner fetches latest published and fails fast on error (Task 7)
- [x] Migration imports at least one real config successfully (Task 8)
- [x] All tests pass (433 passing in App, 15+ passing in Scraper)
