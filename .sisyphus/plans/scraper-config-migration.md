# Scraper Config Migration: Supabase to File-Based YAML

## TL;DR

> **Core Objective**: Migrate scraper configurations from Supabase to YAML files in the scraper repository, deprecating the admin editing UI while preserving monitoring and test run capabilities.
>
> **Key Deliverables**:
> - Credential resolution API endpoint (`/api/scraper/v1/credentials/{id}`)
> - YAML export of all Supabase configs
> - File-based config discovery in scraper backend
> - Simplified admin panel (read-only + test triggers)
> - Minimal `scraper_configs` table for audit trail
> - CI validation for YAML configs
>
> **Estimated Effort**: Large (5-phase rollout, ~15-20 tasks)
> **Parallel Execution**: YES - Phased approach with dependencies
> **Critical Path**: Phase 1 → Phase 2 → Phase 4 → Phase 5

---

## Context

### Original Request
Migrate scraper configurations from Supabase to file-based YAML storage to simplify debugging and enable rapid iteration. Deprecate the frontend test-lab editing interface while maintaining health monitoring capabilities. Reconsider credential storage for static scrapers.

### Interview Summary
**Key Discussions**:
- Config migration: One-time export from Supabase to YAML files
- Frontend scope: Monitoring + test triggers only; remove editing UI
- Credential strategy: Keep in Supabase, add API endpoint for resolution
- Test run history: Keep minimal `scraper_configs` table for audit trail
- Versioning: Git-based with tags/branches
- Rollout: Phased 5-phase approach for lower risk

**Research Findings**:
- Scraper backend already uses YAML files in `/apps/scraper/scrapers/configs/`
- Frontend has extensive test-lab and config editor components to remove
- Supabase tables: `scraper_configs`, `scraper_config_versions`, `scraper_runs`, `scraper_tests`
- Credentials currently use AES-256-GCM encryption in `ai_provider_credentials` table

### Metis Review
**Identified Gaps** (addressed):
- Credential resolution mechanism via new API endpoint
- Test run audit trail via minimal config table
- Config validation in CI pipeline
- Feature flag for rollback capability
- 5-phase coordination timing

---

## Work Objectives

### Core Objective
Migrate scraper configurations from Supabase to YAML files, deprecate frontend editing UI, and establish a simplified read-only admin experience with test run triggers.

### Concrete Deliverables
1. `/api/scraper/v1/credentials/{id}` endpoint for credential resolution
2. YAML export script for existing Supabase configs
3. File-based config discovery in scraper backend
4. Simplified admin panel (monitoring + test triggers only)
5. Minimal `scraper_configs` table (slug, name, file_path)
6. CI validation pipeline for YAML configs
7. Feature flag for rollback capability

### Definition of Done
- [ ] All configs stored as YAML files in `/apps/scraper/scrapers/configs/`
- [ ] Admin panel shows read-only monitoring + test triggers
- [ ] Scraper backend loads configs from files (not API)
- [ ] Credential resolution works via API endpoint
- [ ] YAML validation in CI passes
- [ ] Old Supabase tables archived and dropped

### Must Have
- File-based YAML configs in scraper repo
- Simplified admin panel (no editing)
- Test run trigger functionality
- Credential resolution API
- Config validation in CI

### Must NOT Have (Guardrails)
- No editing UI in admin panel (read-only only)
- No credentials stored in YAML files (reference IDs only)
- No migration of historical run data (archive only)
- No breaking changes during rollout (feature flag required)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Jest + pytest)
- **Automated tests**: Tests-after (complex migration, validate after implementation)
- **Framework**: Jest (frontend), pytest (scraper)

### QA Policy
Every task MUST include agent-executed QA scenarios with specific steps, selectors, data, and assertions. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Phase 1: Preparation (Foundation + Scaffolding)
├── Task 1.1: Create credential storage schema [quick]
├── Task 1.2: Build credential resolution API [quick]
├── Task 1.3: Add credential reference to YAML schema [quick]
├── Task 1.4: Create YAML validation utilities [quick]
├── Task 1.5: Add CI validation pipeline [quick]
└── Task 1.6: Implement feature flag for rollback [quick]

Phase 2: Dual-Mode (Backward Compatible)
├── Task 2.1: Export all Supabase configs to YAML [quick]
├── Task 2.2: Update scraper backend for file-based loading [deep]
├── Task 2.3: Implement dual-mode config discovery [deep]
├── Task 2.4: Add credential resolution to scraper [unspecified-high]
├── Task 2.5: Update minimal scraper_configs table [quick]
└── Task 2.6: Validate YAML configs match DB content [unspecified-high]

Phase 3: Frontend Simplification
├── Task 3.1: Remove test-lab components [quick]
├── Task 3.2: Remove config editor components [quick]
├── Task 3.3: Update scraper admin to read-only [visual-engineering]
├── Task 3.4: Add redirect for edit routes [quick]
├── Task 3.5: Clean up state management stores [quick]
└── Task 3.6: Update navigation and menus [quick]

Phase 4: Backend Migration
├── Task 4.1: Switch scraper to YAML-only mode [deep]
├── Task 4.2: Remove API fallback logic [quick]
├── Task 4.3: Update internal API endpoints [unspecified-high]
├── Task 4.4: Update test run trigger mechanism [unspecified-high]
└── Task 4.5: Production validation [unspecified-high]

Phase 5: Cleanup
├── Task 5.1: Archive scraper_runs data [quick]
├── Task 5.2: Archive scraper_tests data [quick]
├── Task 5.3: Drop scraper_config_versions table [quick]
├── Task 5.4: Drop scraper_selectors table [quick]
├── Task 5.5: Drop scraper_workflow_steps table [quick]
├── Task 5.6: Drop scraper_config_test_skus table [quick]
├── Task 5.7: Simplify scraper_configs table [quick]
├── Task 5.8: Remove deprecated API endpoints [quick]
└── Task 5.9: Final cleanup and documentation [writing]
```

### Dependency Matrix

- **Phase 1**: — → Phase 2
- **Phase 2**: Phase 1 → Phase 3, Phase 4
- **Phase 3**: Phase 2 → Phase 4
- **Phase 4**: Phase 2, Phase 3 → Phase 5
- **Phase 5**: Phase 4 → —

### Agent Dispatch Summary

- **Phase 1**: `quick` (6 tasks) - Foundation setup
- **Phase 2**: `deep` (2), `unspecified-high` (3), `quick` (1) - Backend changes
- **Phase 3**: `visual-engineering` (1), `quick` (5) - Frontend cleanup
- **Phase 4**: `deep` (1), `unspecified-high` (3), `quick` (1) - Backend migration
- **Phase 5**: `quick` (8), `writing` (1) - Cleanup

---

## TODOs



### Phase 1: Preparation (Foundation + Scaffolding)

- [x] 1.1. Create credential storage schema

  **What to do**:
  - Create new Supabase migration for `scraper_credentials` table
  - Schema: `id` (uuid), `scraper_slug` (text), `credential_type` (text), `encrypted_value` (text), `iv` (text), `auth_tag` (text), `key_version` (int), `created_at`, `updated_at`
  - Add RLS policies: only admin/staff can read/write
  - Use same AES-256-GCM encryption as `ai_provider_credentials`

  **Must NOT do**:
  - Don't store plaintext credentials
  - Don't skip RLS policies

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 (Tasks 1.1-1.6)
  - **Blocks**: Task 1.2
  - **Blocked By**: None

  **References**:
  - `apps/web/supabase/migrations/20260220061000_add_ai_provider_credentials.sql` - Pattern for credential encryption
  - `apps/web/lib/scrapers/types.ts` - TypeScript types
  - Supabase docs for RLS policies

  **Acceptance Criteria**:
  - [ ] Migration file created: `apps/web/supabase/migrations/20260312000000_create_scraper_credentials.sql`
  - [ ] Table exists with correct columns
  - [ ] RLS policies applied
  - [ ] Migration applies successfully: `supabase db push`

  **QA Scenarios**:
  ```
  Scenario: Credential table exists with correct schema
    Tool: Bash
    Steps:
      1. cd apps/web && npx supabase migration list | grep 20260312000000
    Expected Result: Migration is applied
    Evidence: .sisyphus/evidence/task-1-1-migration-applied.txt

  Scenario: RLS policies restrict access
    Tool: Bash (psql via supabase)
    Steps:
      1. Query scraper_credentials as anon user
      2. Verify access denied
    Expected Result: 403 or empty result
    Evidence: .sisyphus/evidence/task-1-1-rls-working.txt
  ```

  **Commit**: YES
  - Message: `feat(db): create scraper_credentials table for config migration`
  - Files: `apps/web/supabase/migrations/20260312000000_create_scraper_credentials.sql`

---

- [x] 1.2. Build credential resolution API

  **What to do**:
  - Create new API endpoint: `/api/scraper/v1/credentials/[id]/route.ts`
  - Implement GET handler that returns decrypted credentials
  - Validate `X-API-Key` header (use existing `runner_api_keys` verification)
  - Return format: `{ "username": "...", "password": "...", "type": "basic" }`

  **Must NOT do**:
  - Don't log credentials to console
  - Don't return credentials without valid API key
  - Don't cache decrypted credentials

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1.1)
  - **Parallel Group**: Phase 1 (Tasks 1.1-1.6)
  - **Blocks**: Task 1.3, Task 2.4
  - **Blocked By**: Task 1.1

  **References**:
  - `apps/web/app/api/admin/scrapers/route.ts` - API endpoint pattern
  - `apps/web/lib/auth/api-key.ts` - API key verification
  - `apps/web/lib/encryption.ts` - AES-256-GCM decryption

  **Acceptance Criteria**:
  - [ ] Endpoint created: `apps/web/app/api/scraper/v1/credentials/[id]/route.ts`
  - [ ] API key validation works
  - [ ] Credentials decrypted and returned
  - [ ] curl test passes

  **QA Scenarios**:
  ```
  Scenario: API returns decrypted credentials with valid key
    Tool: Bash (curl)
    Steps:
      1. curl -s -H "X-API-Key: $SCRAPER_API_KEY" \
         "http://localhost:3000/api/scraper/v1/credentials/amazon" | jq
    Expected Result: JSON with username/password fields
    Evidence: .sisyphus/evidence/task-1-2-credential-api.json

  Scenario: API rejects request without valid key
    Tool: Bash (curl)
    Steps:
      1. curl -s -w "%{http_code}" -H "X-API-Key: invalid" \
         "http://localhost:3000/api/scraper/v1/credentials/amazon"
    Expected Result: HTTP 401 or 403
    Evidence: .sisyphus/evidence/task-1-2-unauthorized.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add credential resolution endpoint for scrapers`
  - Files: `apps/web/app/api/scraper/v1/credentials/[id]/route.ts`

---

- [x] 1.3. Add credential reference to YAML schema

  **What to do**:
  - Update Python `ScraperConfig` Pydantic model to include `credential_refs` field
  - Field format: `credential_refs: List[str]` (list of credential IDs)
  - Update YAML examples in `/apps/scraper/scrapers/configs/`
  - Document schema in scraper AGENTS.md

  **Must NOT do**:
  - Don't store actual credentials in YAML
  - Don't break existing YAML files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1.2)
  - **Parallel Group**: Phase 1 (Tasks 1.1-1.6)
  - **Blocks**: Task 2.4
  - **Blocked By**: Task 1.2

  **References**:
  - `apps/scraper/scrapers/models/config.py` - ScraperConfig Pydantic model
  - `apps/scraper/scrapers/configs/*.yaml` - Existing YAML examples
  - `apps/scraper/AGENTS.md` - Documentation

  **Acceptance Criteria**:
  - [ ] `credential_refs` field added to ScraperConfig model
  - [ ] Example YAML updated with credential_refs
  - [ ] Schema validation passes

  **QA Scenarios**:
  ```
  Scenario: YAML with credential_refs validates correctly
    Tool: Bash
    Steps:
      1. cd apps/scraper && python -c "
         from scrapers.models.config import ScraperConfig
         config = ScraperConfig.parse_file('scrapers/configs/ai-amazon.yaml')
         assert 'credential_refs' in config.dict()
         print('PASS')
         "
    Expected Result: PASS
    Evidence: .sisyphus/evidence/task-1-3-yaml-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): add credential_refs to ScraperConfig model`
  - Files: `apps/scraper/scrapers/models/config.py`, `apps/scraper/scrapers/configs/*.yaml`

---

- [x] 1.4. Create YAML validation utilities

  **What to do**:
  - Create Python script to validate YAML configs against Pydantic schema
  - Script should report validation errors with file paths
  - Support validating all configs in directory
  - Exit code 0 if all valid, non-zero if any errors

  **Must NOT do**:
  - Don't silently skip invalid files
  - Don't require database connection for validation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 (Tasks 1.1-1.6)
  - **Blocks**: Task 1.5, Task 2.6
  - **Blocked By**: None

  **References**:
  - `apps/scraper/scrapers/models/config.py` - ScraperConfig model
  - `apps/scraper/scrapers/executor/validator.py` - Existing validation
  - Python Pydantic validation docs

  **Acceptance Criteria**:
  - [ ] Validation script created: `apps/scraper/scripts/validate_configs.py`
  - [ ] Script validates all YAML files
  - [ ] Returns exit code 0 on success
  - [ ] Returns non-zero and reports errors on failure

  **QA Scenarios**:
  ```
  Scenario: Validation script passes for all configs
    Tool: Bash
    Steps:
      1. cd apps/scraper && python scripts/validate_configs.py
    Expected Result: Exit code 0, "All X configs valid"
    Evidence: .sisyphus/evidence/task-1-4-validation-pass.txt

  Scenario: Validation script fails on invalid config
    Tool: Bash
    Steps:
      1. Create invalid YAML with syntax error
      2. Run validation script
    Expected Result: Exit code 1, error message with file path
    Evidence: .sisyphus/evidence/task-1-4-validation-fail.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): add YAML config validation script`
  - Files: `apps/scraper/scripts/validate_configs.py`

---

- [x] 1.5. Add CI validation pipeline

  **What to do**:
  - Add GitHub Actions workflow to validate YAML configs on PR
  - Add pre-commit hook to validate configs before commit
  - Use validation script from Task 1.4
  - Run on all changes to `apps/scraper/scrapers/configs/*.yaml`

  **Must NOT do**:
  - Don't allow commits that break config validation
  - Don't require external services for validation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1.4)
  - **Parallel Group**: Phase 1 (Tasks 1.1-1.6)
  - **Blocks**: Task 2.1
  - **Blocked By**: Task 1.4

  **References**:
  - `.github/workflows/*.yml` - Existing workflow patterns
  - `.pre-commit-config.yaml` - Pre-commit configuration
  - Validation script from Task 1.4

  **Acceptance Criteria**:
  - [ ] GitHub Actions workflow validates configs on PR
  - [ ] Pre-commit hook validates configs before commit
  - [ ] Invalid configs block merge

  **QA Scenarios**:
  ```
  Scenario: CI validates configs on PR
    Tool: Bash
    Steps:
      1. Create test PR with invalid YAML
      2. Check GitHub Actions results
    Expected Result: CI check fails, PR blocked
    Evidence: .sisyphus/evidence/task-1-5-ci-validation.png

  Scenario: Pre-commit hook blocks invalid config
    Tool: Bash
    Steps:
      1. Modify YAML to be invalid
      2. Try to commit
    Expected Result: Commit blocked with error message
    Evidence: .sisyphus/evidence/task-1-5-precommit-block.txt
  ```

  **Commit**: YES
  - Message: `ci: add YAML config validation to CI and pre-commit`
  - Files: `.github/workflows/validate-scraper-configs.yml`, `.pre-commit-config.yaml`

---

- [x] 1.6. Implement feature flag for rollback

  **What to do**:
  - Add `USE_YAML_CONFIGS` environment variable
  - Default: `false` (use existing API mode)
  - Update scraper backend to check flag before loading YAML
  - Add flag to deployment config

  **Must NOT do**:
  - Don't enable flag in production until Phase 4
  - Don't break existing functionality when flag is false

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Phase 1 (Tasks 1.1-1.6)
  - **Blocks**: Task 2.2, Task 2.3
  - **Blocked By**: None

  **References**:
  - `apps/scraper/core/config.py` - Configuration loading
  - `apps/scraper/.env.example` - Environment variables
  - Feature flag pattern in codebase

  **Acceptance Criteria**:
  - [ ] `USE_YAML_CONFIGS` env var added
  - [ ] Flag respected in scraper backend
  - [ ] Default behavior unchanged (flag = false)

  **QA Scenarios**:
  ```
  Scenario: Feature flag controls YAML loading
    Tool: Bash
    Steps:
      1. Set USE_YAML_CONFIGS=false
      2. Start scraper, verify it uses API
      3. Set USE_YAML_CONFIGS=true
      4. Restart scraper, verify it uses YAML
    Expected Result: Behavior changes based on flag
    Evidence: .sisyphus/evidence/task-1-6-feature-flag.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): add USE_YAML_CONFIGS feature flag`
  - Files: `apps/scraper/core/config.py`, `apps/scraper/.env.example`

---


### Phase 2: Dual-Mode (Backward Compatible)

- [ ] 2.1. Export all Supabase configs to YAML

  **What to do**:
  - Create script to export all configs from Supabase to YAML files
  - Use existing `assembleScraperConfig()` logic
  - Save to `apps/scraper/scrapers/configs/{slug}.yaml`
  - Ensure all existing configs have YAML equivalents
  - Add to git and commit

  **Must NOT do**:
  - Don't export test/draft configs (only published)
  - Don't lose any config data during export

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 1)
  - **Parallel Group**: Phase 2 (Tasks 2.1-2.6)
  - **Blocks**: Task 2.2, Task 2.3, Task 2.6
  - **Blocked By**: Phase 1 completion, Task 1.5

  **References**:
  - `apps/web/lib/admin/scraper-configs/assemble-config.ts` - Config assembly logic
  - `apps/web/app/api/internal/scraper-configs/route.ts` - Config listing API
  - `apps/scraper/scrapers/configs/*.yaml` - Existing YAML format

  **Acceptance Criteria**:
  - [ ] Export script created: `apps/web/scripts/export-configs-to-yaml.ts`
  - [ ] All published configs exported to YAML
  - [ ] YAML files pass validation (Task 1.4)
  - [ ] Files committed to git

  **QA Scenarios**:
  ```
  Scenario: All Supabase configs exported to YAML
    Tool: Bash
    Steps:
      1. Run export script
      2. Count YAML files
      3. Count Supabase configs
    Expected Result: YAML count >= Supabase published configs
    Evidence: .sisyphus/evidence/task-2-1-export-counts.txt

  Scenario: Exported YAML passes validation
    Tool: Bash
    Steps:
      1. cd apps/scraper && python scripts/validate_configs.py
    Expected Result: Exit code 0
    Evidence: .sisyphus/evidence/task-2-1-yaml-valid.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): export all Supabase configs to YAML`
  - Files: `apps/scraper/scrapers/configs/*.yaml` (new/modified)

---
- [x] 2.4. Add credential resolution to scraper
- [x] 2.1. Export all Supabase configs to YAML

  **What to do**:
  - Update `ScraperAPIClient` to support file-based config loading
  - Add `load_from_file()` method
  - Ensure config validation works for file-loaded configs
  - Handle credential_refs resolution

  **Must NOT do**:
  - Don't break existing API-based loading
  - Don't bypass config validation

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 1, Task 2.1)
  - **Parallel Group**: Phase 2 (Tasks 2.1-2.6)
  - **Blocks**: Task 2.3, Task 2.4, Task 4.1
  - **Blocked By**: Task 1.6, Task 2.1

  **References**:
  - `apps/scraper/core/api_client.py` - ScraperAPIClient
  - `apps/scraper/scrapers/executor/config_loader.py` - Config loading
  - `apps/scraper/scrapers/models/config.py` - ScraperConfig model

  **Acceptance Criteria**:
  - [ ] File-based config loading implemented
  - [ ] Credential resolution integrated
  - [ ] Validation passes for file-loaded configs

  **QA Scenarios**:
  ```
  Scenario: Scraper loads config from file
    Tool: Bash (Python)
    Steps:
      1. cd apps/scraper && python -c "
         from core.api_client import ScraperAPIClient
         client = ScraperAPIClient()
         config = client.load_config_from_file('ai-amazon')
         print(config.name)
         "
    Expected Result: Config name printed
    Evidence: .sisyphus/evidence/task-2-2-file-load.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): add file-based config loading to ScraperAPIClient`
  - Files: `apps/scraper/core/api_client.py`

---

- [x] 2.2. Update scraper backend for file-based loading

  **What to do**:
  - Update `ScraperAPIClient.list_published_configs()` to check `USE_YAML_CONFIGS` flag
  - If flag is true: list YAML files from `scrapers/configs/`
  - If flag is false: use existing API listing
  - Ensure both modes return same format

  **Must NOT do**:
  - Don't change return format (maintain backward compatibility)
  - Don't enable new mode in production yet

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 2.2)
  - **Parallel Group**: Phase 2 (Tasks 2.1-2.6)
  - **Blocks**: Task 2.6, Task 4.1
  - **Blocked By**: Task 1.6, Task 2.2

  **References**:
  - `apps/scraper/core/api_client.py` - ScraperAPIClient
  - `apps/scraper/scrapers/configs/` - Config directory
  - Feature flag from Task 1.6

  **Acceptance Criteria**:
  - [ ] Dual-mode discovery implemented
  - [ ] Feature flag controls mode
  - [ ] Both modes return same format

  **QA Scenarios**:
  ```
  Scenario: Config discovery works in both modes
    Tool: Bash (Python)
    Steps:
      1. USE_YAML_CONFIGS=false python -c "list configs via API"
      2. USE_YAML_CONFIGS=true python -c "list configs via files"
      3. Compare results
    Expected Result: Both return same list of slugs
    Evidence: .sisyphus/evidence/task-2-3-dual-mode.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): implement dual-mode config discovery`
  - Files: `apps/scraper/core/api_client.py`

---

- [x] 2.3. Implement dual-mode config discovery

  **What to do**:
  - Update scraper to fetch credentials from API endpoint (Task 1.2)
  - Resolve `credential_refs` from config before execution
  - Cache credentials for duration of job (don't refetch)
  - Handle credential resolution errors gracefully

  **Must NOT do**:
  - Don't store credentials in logs
  - Don't cache credentials beyond job lifetime

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1.2, Task 1.3)
  - **Parallel Group**: Phase 2 (Tasks 2.1-2.6)
  - **Blocks**: Task 4.1
  - **Blocked By**: Task 1.2, Task 1.3

  **References**:
  - `/api/scraper/v1/credentials/[id]` endpoint from Task 1.2
  - `apps/scraper/scrapers/executor/` - Executor logic
  - `apps/scraper/core/api_client.py` - API client

  **Acceptance Criteria**:
  - [ ] Scraper fetches credentials from API
  - [ ] Credentials resolved before execution
  - [ ] Errors handled gracefully

  **QA Scenarios**:
  ```
  Scenario: Scraper resolves credentials before execution
    Tool: Bash (Python)
    Steps:
      1. Start test job with credential_refs
      2. Verify scraper fetches credentials
      3. Verify credentials used in auth
    Expected Result: Job authenticates successfully
    Evidence: .sisyphus/evidence/task-2-4-credential-resolution.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): add credential resolution from API`
  - Files: `apps/scraper/scrapers/executor/`, `apps/scraper/core/api_client.py`

---

- [x] 2.5. Update minimal scraper_configs table

  **What to do**:
  - Create migration to add `file_path` column to `scraper_configs`
  - Populate with paths to YAML files
  - Remove columns that won't be used (current_version_id, etc.)
  - Keep: `id`, `slug`, `name`, `file_path`, `created_at`, `updated_at`

  **Must NOT do**:
  - Don't drop table entirely (needed for audit trail)
  - Don't lose slug-name mapping

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 2.1)
  - **Parallel Group**: Phase 2 (Tasks 2.1-2.6)
  - **Blocks**: Task 3.2, Task 5.7
  - **Blocked By**: Task 2.1

  **References**:
  - `apps/web/supabase/migrations/20240112_create_scraper_configs.sql` - Original schema
  - Supabase migration docs

  **Acceptance Criteria**:
  - [ ] Migration adds file_path column
  - [ ] Migration populates file_path for all configs
  - [ ] Table simplified to minimal fields

  **QA Scenarios**:
  ```
  Scenario: scraper_configs table has file_path for all configs
    Tool: Bash (psql)
    Steps:
      1. Query: SELECT slug, file_path FROM scraper_configs
      2. Verify no NULL file_path values
    Expected Result: All rows have file_path
    Evidence: .sisyphus/evidence/task-2-5-file-paths.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add file_path column and simplify scraper_configs`
  - Files: `apps/web/supabase/migrations/20260312000001_update_scraper_configs.sql`

---

- [x] 2.6. Validate YAML configs match DB content

  **What to do**:
  - Compare exported YAML configs with Supabase content
  - Verify all fields match (selectors, workflow steps, metadata)
  - Document any discrepancies
  - Fix any issues before proceeding

  **Must NOT do**:
  - Don't proceed to Phase 3 if discrepancies exist
  - Don't ignore validation failures

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 2.1, 2.2, 2.5)
  - **Parallel Group**: Phase 2 (Tasks 2.1-2.6)
  - **Blocks**: Phase 3, Phase 4
  - **Blocked By**: Tasks 2.1, 2.2, 2.5

  **References**:
  - Export script from Task 2.1
  - Supabase schema
  - YAML validation from Task 1.4

  **Acceptance Criteria**:
  - [ ] Validation script compares YAML to DB
  - [ ] All configs match (or discrepancies documented)
  - [ ] Issues resolved before Phase 3

  **QA Scenarios**:
  ```
  Scenario: YAML configs match Supabase content
    Tool: Bash (Node.js/TypeScript)
    Steps:
      1. Run validation script
      2. Check for mismatches
    Expected Result: "All configs match" or documented exceptions
    Evidence: .sisyphus/evidence/task-2-6-validation-report.txt
  ```

  **Commit**: YES
  - Message: `test: validate exported YAML matches Supabase content`
  - Files: `apps/web/scripts/validate-yaml-export.ts`

---


### Phase 3: Frontend Simplification

- [x] 3.1. Remove test-lab components

  **What to do**:
  - Delete all test-lab related components:
    - `/apps/web/components/admin/scrapers/test-lab/test-lab-client.tsx`
    - `/apps/web/components/admin/scrapers/test-lab/results-table.tsx`
    - `/apps/web/components/admin/scrapers/test-lab/results-panel.tsx`
    - `/apps/web/components/admin/scrapers/test-lab/log-terminal.tsx`
    - `/apps/web/components/admin/scrapers/test-lab/test-run-controls.tsx`
    - `/apps/web/components/admin/scrapers/test-lab/sku-sidebar.tsx`
    - `/apps/web/components/admin/scrapers/test-lab/test-sku-panel.tsx`
  - Delete test-lab routes:
    - `/apps/web/app/admin/scrapers/[slug]/test-lab/page.tsx`
    - `/apps/web/app/admin/scrapers/test-lab/page.tsx`
  - Archive (don't delete) to `/_deprecated/` folder

  **Must NOT do**:
  - Don't delete monitoring/health components
  - Don't break existing imports without updating references

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 2)
  - **Parallel Group**: Phase 3 (Tasks 3.1-3.6)
  - **Blocks**: Task 3.4
  - **Blocked By**: Phase 2 completion

  **References**:
  - Files listed in draft
  - `apps/web/components/admin/scrapers/` directory

  **Acceptance Criteria**:
  - [ ] Test-lab components archived
  - [ ] Test-lab routes removed
  - [ ] No broken imports

  **QA Scenarios**:
  ```
  Scenario: Test-lab routes return 404
    Tool: Playwright
    Steps:
      1. Navigate to /admin/scrapers/amazon/test-lab
      2. Verify 404 or redirect
    Expected Result: 404 or redirect to scraper overview
    Evidence: .sisyphus/evidence/task-3-1-test-lab-removed.png
  ```

  **Commit**: YES
  - Message: `refactor(admin): remove test-lab components and routes`
  - Files: See list above (moved to `/_deprecated/`)

---

- [x] 3.2. Remove config editor components

  **What to do**:
  - Delete all config editor components:
    - `/apps/web/components/admin/scrapers/config-editor/ConfigEditorClient.tsx`
    - `/apps/web/components/admin/scrapers/config-editor/ConfigEditor.tsx`
    - `/apps/web/components/admin/scrapers/config-editor/tabs/WorkflowTab.tsx`
    - `/apps/web/components/admin/scrapers/config-editor/tabs/SelectorsTab.tsx`
    - `/apps/web/components/admin/scrapers/config-editor/tabs/MetadataTab.tsx`
    - `/apps/web/components/admin/scrapers/config-editor/tabs/AdvancedTab.tsx`
    - `/apps/web/components/admin/scrapers/config-editor/tabs/TestingTab.tsx`
    - `/apps/web/components/admin/scrapers/config-editor/tabs/PreviewTab.tsx`
    - `/apps/web/components/admin/scrapers/selector-editor.tsx`
    - `/apps/web/components/admin/scrapers/workflow-step-editor.tsx`
  - Delete config editor routes:
    - `/apps/web/app/admin/scrapers/configs/[id]/edit/page.tsx`
    - `/apps/web/app/admin/scrapers/configs/dashboard/page.tsx`
  - Archive to `/_deprecated/` folder

  **Must NOT do**:
  - Don't delete read-only config display components
  - Don't break imports

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 2, Task 3.1)
  - **Parallel Group**: Phase 3 (Tasks 3.1-3.6)
  - **Blocks**: Task 3.3, Task 3.4
  - **Blocked By**: Phase 2 completion, Task 2.5, Task 3.1

  **References**:
  - Files listed in draft
  - Config listing components (preserve these)

  **Acceptance Criteria**:
  - [ ] Config editor components archived
  - [ ] Config editor routes removed
  - [ ] No broken imports

  **QA Scenarios**:
  ```
  Scenario: Config editor routes return 404
    Tool: Playwright
    Steps:
      1. Navigate to /admin/scrapers/configs/123/edit
      2. Verify 404 or redirect
    Expected Result: 404 or redirect
    Evidence: .sisyphus/evidence/task-3-2-editor-removed.png
  ```

  **Commit**: YES
  - Message: `refactor(admin): remove config editor components and routes`
  - Files: See list above (moved to `/_deprecated/`)

---

- [x] 3.3. Update scraper admin to read-only

  **What to do**:
  - Update `/apps/web/app/admin/scrapers/page.tsx` to read-only view
  - Update `/apps/web/app/admin/scrapers/[slug]/page.tsx` to remove edit buttons
  - Show config metadata (name, slug, file path, status)
  - Show "View on GitHub" link to YAML file
  - Keep test run trigger button
  - Show monitoring/health information

  **Must NOT do**:
  - Don't add editing functionality
  - Don't break existing monitoring features

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 3.1, 3.2)
  - **Parallel Group**: Phase 3 (Tasks 3.1-3.6)
  - **Blocks**: Task 3.5, Task 3.6
  - **Blocked By**: Tasks 3.1, 3.2

  **References**:
  - `/apps/web/app/admin/scrapers/page.tsx`
  - `/apps/web/app/admin/scrapers/[slug]/page.tsx`
  - Monitoring components (preserve these)

  **Acceptance Criteria**:
  - [ ] Admin pages show read-only config info
  - [ ] "View on GitHub" link works
  - [ ] Test run trigger button present
  - [ ] Monitoring/health displayed

  **QA Scenarios**:
  ```
  Scenario: Admin shows read-only config view
    Tool: Playwright
    Steps:
      1. Navigate to /admin/scrapers
      2. Verify no "Edit" buttons
      3. Verify "View on GitHub" links present
      4. Click test run trigger
    Expected Result: Read-only view with test trigger
    Evidence: .sisyphus/evidence/task-3-3-readonly-view.png
  ```

  **Commit**: YES
  - Message: `feat(admin): simplify scraper admin to read-only + test triggers`
  - Files: `apps/web/app/admin/scrapers/page.tsx`, `apps/web/app/admin/scrapers/[slug]/page.tsx`

---

- [x] 3.4. Add redirect for edit routes

  **What to do**:
  - Create redirects from old edit routes to new read-only view
  - `/admin/scrapers/configs/[id]/edit` → `/admin/scrapers/[slug]`
  - `/admin/scrapers/[slug]/test-lab` → `/admin/scrapers/[slug]`
  - Use Next.js redirects or middleware

  **Must NOT do**:
  - Don't leave 404s for old URLs
  - Don't redirect to unrelated pages

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 3.1, 3.2)
  - **Parallel Group**: Phase 3 (Tasks 3.1-3.6)
  - **Blocks**: None
  - **Blocked By**: Tasks 3.1, 3.2

  **References**:
  - Next.js redirects documentation
  - `apps/web/next.config.js`

  **Acceptance Criteria**:
  - [ ] Redirects configured for all removed routes
  - [ ] Redirects work correctly

  **QA Scenarios**:
  ```
  Scenario: Old edit URLs redirect to read-only view
    Tool: Playwright
    Steps:
      1. Navigate to /admin/scrapers/configs/123/edit
      2. Verify redirect to /admin/scrapers/amazon
    Expected Result: 308 redirect to new URL
    Evidence: .sisyphus/evidence/task-3-4-redirects.txt
  ```

  **Commit**: YES
  - Message: `feat(admin): add redirects for deprecated editing routes`
  - Files: `apps/web/next.config.js` or `apps/web/middleware.ts`

---

- [x] 3.5. Clean up state management stores

  **What to do**:
  - Review and clean up Zustand stores:
    - `/apps/web/lib/admin/scraper-configs/store.ts`
    - `/apps/web/lib/admin/scrapers/store.ts`
  - Remove editing-related state
  - Keep monitoring/test run state
  - Remove unused actions (save, publish, rollback)

  **Must NOT do**:
  - Don't break monitoring functionality
  - Don't remove stores entirely (keep minimal state)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 3.3)
  - **Parallel Group**: Phase 3 (Tasks 3.1-3.6)
  - **Blocks**: None
  - **Blocked By**: Task 3.3

  **References**:
  - Store files listed above
  - Zustand documentation

  **Acceptance Criteria**:
  - [ ] Editing state removed from stores
  - [ ] Monitoring state preserved
  - [ ] No broken imports

  **QA Scenarios**:
  ```
  Scenario: Stores work without editing actions
    Tool: Bash
    Steps:
      1. Build frontend
      2. Check for TypeScript errors
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-3-5-store-cleanup.txt
  ```

  **Commit**: YES
  - Message: `refactor(admin): clean up scraper state management stores`
  - Files: `apps/web/lib/admin/scraper-configs/store.ts`, `apps/web/lib/admin/scrapers/store.ts`

---

- [x] 3.6. Update navigation and menus

  **What to do**:
  - Remove "Edit" links from navigation
  - Remove "Test Lab" links from navigation
  - Update sidebar/menu items to reflect read-only mode
  - Keep monitoring links (Dashboard, Network, Health)

  **Must NOT do**:
  - Don't break navigation structure
  - Don't remove monitoring links

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 3.3)
  - **Parallel Group**: Phase 3 (Tasks 3.1-3.6)
  - **Blocks**: None
  - **Blocked By**: Task 3.3

  **References**:
  - Admin sidebar components
  - Navigation configuration

  **Acceptance Criteria**:
  - [ ] Navigation updated (no edit/test-lab links)
  - [ ] Monitoring links preserved

  **QA Scenarios**:
  ```
  Scenario: Navigation shows read-only menu
    Tool: Playwright
    Steps:
      1. Navigate to admin panel
      2. Check sidebar navigation
    Expected Result: No "Edit" or "Test Lab" links
    Evidence: .sisyphus/evidence/task-3-6-navigation.png
  ```

  **Commit**: YES
  - Message: `feat(admin): update navigation for read-only scraper admin`
  - Files: Admin sidebar/navigation components

---


### Phase 4: Backend Migration

- [x] 4.1. Switch scraper to YAML-only mode

  **What to do**:
  - Set `USE_YAML_CONFIGS=true` in production environment
  - Monitor for errors or issues
  - Ensure scraper loads configs from files exclusively
  - Verify credential resolution works

  **Must NOT do**:
  - Don't switch without monitoring
  - Don't proceed if errors occur

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 2, Phase 3)
  - **Parallel Group**: Phase 4 (Tasks 4.1-4.5)
  - **Blocks**: Task 4.2, Task 4.3, Task 4.4, Task 4.5
  - **Blocked By**: Phase 2 completion, Phase 3 completion

  **References**:
  - Feature flag from Task 1.6
  - Scraper backend deployment
  - Monitoring dashboards

  **Acceptance Criteria**:
  - [ ] Flag enabled in production
  - [ ] Scraper loads from YAML files
  - [ ] No errors in logs

  **QA Scenarios**:
  ```
  Scenario: Scraper uses YAML configs in production
    Tool: Bash (logs)
    Steps:
      1. Check scraper logs for config loading
      2. Verify "Loading from file" messages
      3. Verify no "Loading from API" messages
    Expected Result: File-based loading confirmed
    Evidence: .sisyphus/evidence/task-4-1-yaml-mode.txt
  ```

  **Commit**: YES
  - Message: `feat(scraper): enable USE_YAML_CONFIGS in production`
  - Files: Deployment config

---

- [x] 4.2. Remove API fallback logic

  **What to do**:
  - Remove fallback to API when file loading fails
  - Remove `USE_YAML_CONFIGS` flag checks (always use YAML)
  - Clean up dual-mode code
  - Keep error handling for file loading

  **Must NOT do**:
  - Don't remove file loading error handling
  - Don't break existing functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 4.1 validated)
  - **Parallel Group**: Phase 4 (Tasks 4.1-4.5)
  - **Blocks**: Task 4.3
  - **Blocked By**: Task 4.1

  **References**:
  - `apps/scraper/core/api_client.py`
  - Dual-mode code from Task 2.3

  **Acceptance Criteria**:
  - [ ] API fallback removed
  - [ ] Code simplified
  - [ ] Tests pass

  **QA Scenarios**:
  ```
  Scenario: Scraper only uses file loading
    Tool: Bash (grep)
    Steps:
      1. grep -r "USE_YAML_CONFIGS" apps/scraper/
      2. Verify flag removed from production code
    Expected Result: No flag references in production paths
    Evidence: .sisyphus/evidence/task-4-2-fallback-removed.txt
  ```

  **Commit**: YES
  - Message: `refactor(scraper): remove API fallback, use YAML exclusively`
  - Files: `apps/scraper/core/api_client.py`

---

- [x] 4.3. Update internal API endpoints

  **What to do**:
  - Update `/api/internal/scraper-configs` to read from YAML files
  - Update `/api/internal/scraper-configs/[slug]` to read from YAML
  - Return same format as before
  - Keep API for monitoring/other consumers

  **Must NOT do**:
  - Don't break API contract
  - Don't change response format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 4.2)
  - **Parallel Group**: Phase 4 (Tasks 4.1-4.5)
  - **Blocks**: None
  - **Blocked By**: Task 4.2

  **References**:
  - `apps/web/app/api/internal/scraper-configs/route.ts`
  - YAML parsing utilities

  **Acceptance Criteria**:
  - [ ] Endpoints read from YAML files
  - [ ] Response format unchanged
  - [ ] Tests pass

  **QA Scenarios**:
  ```
  Scenario: Internal API returns YAML content
    Tool: Bash (curl)
    Steps:
      1. curl /api/internal/scraper-configs
      2. Verify response structure
    Expected Result: Same format as before
    Evidence: .sisyphus/evidence/task-4-3-internal-api.json
  ```

  **Commit**: YES
  - Message: `feat(api): update internal endpoints to read from YAML`
  - Files: `apps/web/app/api/internal/scraper-configs/route.ts`

---

- [x] 4.4. Update test run trigger mechanism

  **What to do**:
  - Update test run endpoint to reference YAML configs
  - Remove `config_id`/`version_id` references
  - Use `scraper_slug` to identify config
  - Update job metadata to include file_path

  **Must NOT do**:
  - Don't break test run functionality
  - Don't lose test run history

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 2.5, Task 4.1)
  - **Parallel Group**: Phase 4 (Tasks 4.1-4.5)
  - **Blocks**: Task 4.5
  - **Blocked By**: Task 2.5, Task 4.1

  **References**:
  - `/api/admin/scrapers/studio/test/route.ts`
  - Minimal `scraper_configs` table from Task 2.5

  **Acceptance Criteria**:
  - [ ] Test runs work with YAML configs
  - [ ] Job metadata references file_path
  - [ ] Test history preserved

  **QA Scenarios**:
  ```
  Scenario: Test run triggers with YAML config
    Tool: Playwright + Bash
    Steps:
      1. Trigger test run from admin
      2. Verify job created with correct metadata
      3. Verify job completes successfully
    Expected Result: Test run works end-to-end
    Evidence: .sisyphus/evidence/task-4-4-test-run.txt
  ```

  **Commit**: YES
  - Message: `feat(admin): update test run trigger for YAML configs`
  - Files: `apps/web/app/api/admin/scrapers/studio/test/route.ts`

---

- [x] 4.5. Production validation

  **What to do**:
  - Run comprehensive validation in production
  - Test all scrapers with YAML configs
  - Monitor error rates
  - Verify credential resolution
  - Document any issues

  **Must NOT do**:
  - Don't proceed to Phase 5 if issues exist
  - Don't ignore production errors

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Tasks 4.1-4.4)
  - **Parallel Group**: Phase 4 (Tasks 4.1-4.5)
  - **Blocks**: Phase 5
  - **Blocked By**: Tasks 4.1-4.4

  **References**:
  - Monitoring dashboards
  - Scraper run history
  - Error logs

  **Acceptance Criteria**:
  - [ ] All scrapers tested
  - [ ] Error rates acceptable
  - [ ] Credential resolution verified
  - [ ] No critical issues

  **QA Scenarios**:
  ```
  Scenario: Production validation passes
    Tool: Bash (monitoring)
    Steps:
      1. Run scrapers for 24 hours
      2. Check error rates
      3. Verify all configs load
    Expected Result: Error rate < 1%, all configs functional
    Evidence: .sisyphus/evidence/task-4-5-production-validation.txt
  ```

  **Commit**: NO (validation only)

---


### Phase 5: Cleanup

- [x] 5.1. Archive scraper_runs data

  **What to do**:
  - Export `scraper_runs` table data to NDJSON or Parquet
  - Store in object storage (S3) with lifecycle policies
  - Document archive location and format
  - Verify data integrity after export

  **Must NOT do**:
  - Don't delete data before verifying export
  - Don't lose historical run data

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 4)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: Task 5.7
  - **Blocked By**: Phase 4 completion

  **References**:
  - `scraper_runs` table schema
  - Object storage configuration
  - Data export tools (pg_dump, etc.)

  **Acceptance Criteria**:
  - [ ] Data exported to archive
  - [ ] Export verified for integrity
  - [ ] Archive location documented

  **QA Scenarios**:
  ```
  Scenario: scraper_runs data archived
    Tool: Bash
    Steps:
      1. Export scraper_runs to NDJSON
      2. Verify file size and row count
      3. Sample check data integrity
    Expected Result: All rows exported, data intact
    Evidence: .sisyphus/evidence/task-5-1-archive-runs.txt
  ```

  **Commit**: YES
  - Message: `chore(db): archive scraper_runs data`
  - Files: Archive files, documentation

---

- [x] 5.2. Archive scraper_tests data

  **What to do**:
  - Export `scraper_tests` table data to NDJSON or Parquet
  - Store alongside scraper_runs archive
  - Document format and location

  **Must NOT do**:
  - Don't delete before verifying export

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 4, with Task 5.1)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: Task 5.6
  - **Blocked By**: Phase 4 completion

  **Acceptance Criteria**:
  - [ ] Data exported to archive
  - [ ] Export verified

  **QA Scenarios**:
  ```
  Scenario: scraper_tests data archived
    Tool: Bash
    Steps:
      1. Export scraper_tests to NDJSON
      2. Verify export
    Expected Result: All data archived
    Evidence: .sisyphus/evidence/task-5-2-archive-tests.txt
  ```

  **Commit**: YES
  - Message: `chore(db): archive scraper_tests data`
  - Files: Archive files

---

- [x] 5.3. Drop scraper_config_versions table

  **What to do**:
  - Create migration to drop `scraper_config_versions` table
  - Backup before dropping (if not already backed up)
  - Verify no references in code

  **Must NOT do**:
  - Don't drop before Phase 4 validation
  - Don't lose data unexpectedly

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 4)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: None
  - **Blocked By**: Phase 4 completion

  **Acceptance Criteria**:
  - [ ] Migration created to drop table
  - [ ] Table dropped successfully

  **QA Scenarios**:
  ```
  Scenario: scraper_config_versions table dropped
    Tool: Bash (psql)
    Steps:
      1. Query information_schema.tables
      2. Verify table no longer exists
    Expected Result: Table not found
    Evidence: .sisyphus/evidence/task-5-3-table-dropped.txt
  ```

  **Commit**: YES
  - Message: `chore(db): drop scraper_config_versions table`
  - Files: `apps/web/supabase/migrations/20260312000002_drop_scraper_config_versions.sql`

---

- [x] 5.4. Drop scraper_selectors table

  **What to do**:
  - Create migration to drop `scraper_selectors` table
  - Verify no active references

  **Must NOT do**:
  - Don't drop if still referenced in code

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 4)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: None
  - **Blocked By**: Phase 4 completion

  **Acceptance Criteria**:
  - [ ] Table dropped

  **QA Scenarios**:
  ```
  Scenario: scraper_selectors table dropped
    Tool: Bash (psql)
    Steps:
      1. Verify table doesn't exist
    Expected Result: Table dropped
    Evidence: .sisyphus/evidence/task-5-4-selectors-dropped.txt
  ```

  **Commit**: YES
  - Message: `chore(db): drop scraper_selectors table`

---

- [x] 5.5. Drop scraper_workflow_steps table

  **What to do**:
  - Create migration to drop `scraper_workflow_steps` table

  **Must NOT do**:
  - Don't drop if referenced

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 4)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: None
  - **Blocked By**: Phase 4 completion

  **Commit**: YES
  - Message: `chore(db): drop scraper_workflow_steps table`

---

- [x] 5.6. Drop scraper_config_test_skus table

  **What to do**:
  - Create migration to drop `scraper_config_test_skus` table
  - Verify after archiving data (Task 5.2)

  **Must NOT do**:
  - Don't drop before archiving

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 5.2)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: None
  - **Blocked By**: Task 5.2

  **Commit**: YES
  - Message: `chore(db): drop scraper_config_test_skus table`

---

- [x] 5.7. Simplify scraper_configs table

  **What to do**:
  - Remove columns no longer needed (current_version_id, etc.)
  - Keep minimal columns: `id`, `slug`, `name`, `file_path`, `created_at`, `updated_at`
  - Update RLS policies if needed

  **Must NOT do**:
  - Don't drop table entirely (needed for audit trail)
  - Don't lose slug-name mapping

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 5.1)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: None
  - **Blocked By**: Task 5.1

  **Commit**: YES
  - Message: `chore(db): simplify scraper_configs table to minimal schema`

---

- [x] 5.8. Remove deprecated API endpoints

  **What to do**:
  - Remove endpoints no longer needed:
    - `POST /api/admin/scraper-configs` (create)
    - `PUT /api/admin/scraper-configs/[id]` (update)
    - `POST /api/admin/scraper-configs/[id]/publish` (publish)
    - `POST /api/admin/scraper-configs/[id]/rollback` (rollback)
  - Archive to `/_deprecated/` folder
  - Update API documentation

  **Must NOT do**:
  - Don't remove endpoints still in use
  - Don't break internal API

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 4)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: None
  - **Blocked By**: Phase 4 completion

  **References**:
  - API route files in `apps/web/app/api/`
  - API documentation

  **Acceptance Criteria**:
  - [ ] Deprecated endpoints removed
  - [ ] No broken references

  **QA Scenarios**:
  ```
  Scenario: Deprecated endpoints return 404
    Tool: Bash (curl)
    Steps:
      1. curl -X POST /api/admin/scraper-configs
    Expected Result: HTTP 404
    Evidence: .sisyphus/evidence/task-5-8-endpoints-removed.txt
  ```

  **Commit**: YES
  - Message: `chore(api): remove deprecated scraper config endpoints`

---

- [x] 5.9. Final cleanup and documentation

  **What to do**:
  - Update documentation (AGENTS.md, README)
  - Document new YAML-based workflow
  - Add migration notes
  - Clean up any remaining TODOs
  - Final code review

  **Must NOT do**:
  - Don't leave undocumented changes
  - Don't skip code review

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Phase 4)
  - **Parallel Group**: Phase 5 (Tasks 5.1-5.9)
  - **Blocks**: None
  - **Blocked By**: Phase 4 completion

  **Acceptance Criteria**:
  - [ ] Documentation updated
  - [ ] Migration notes added
  - [ ] Code reviewed

  **QA Scenarios**:
  ```
  Scenario: Documentation reflects new workflow
    Tool: Read (manual)
    Steps:
      1. Review AGENTS.md updates
      2. Verify workflow documentation
    Expected Result: Docs match new implementation
    Evidence: .sisyphus/evidence/task-5-9-docs-updated.md
  ```

  **Commit**: YES
  - Message: `docs: update documentation for YAML-based scraper configs`

---

## Final Verification Wave

### F1. Plan Compliance Audit — `oracle`

Read the plan end-to-end. Verify:
- All "Must Have" items implemented
- All "Must NOT Have" items absent
- All TODOs completed
- Evidence files exist in `.sisyphus/evidence/`

**Output**: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

### F2. Code Quality Review — `unspecified-high`

Run quality checks:
- `tsc --noEmit` (TypeScript)
- `bun test` (frontend tests)
- `python -m pytest` (scraper tests)
- `python scripts/validate_configs.py` (YAML validation)
- Check for `any`, `@ts-ignore`, `console.log` in production

**Output**: `Build [PASS/FAIL] | Tests [N pass/N fail] | Lint [PASS/FAIL] | VERDICT`

### F3. Integration QA — `unspecified-high` (+ `playwright` skill)

Execute end-to-end scenarios:
1. Trigger test run from admin panel
2. Verify scraper loads YAML config
3. Verify credential resolution works
4. Verify results stored correctly
5. Test error handling (invalid YAML, missing credentials)

Save evidence to `.sisyphus/evidence/final-qa/`.

**Output**: `Scenarios [N/N pass] | Integration [PASS/FAIL] | VERDICT`

### F4. Scope Fidelity Check — `deep`

For each task:
- Read "What to do", verify implementation
- Check "Must NOT do" compliance
- Detect cross-task contamination
- Verify no scope creep

**Output**: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

### Phase 1 Commits
1. `feat(db): create scraper_credentials table for config migration`
2. `feat(api): add credential resolution endpoint for scrapers`
3. `feat(scraper): add credential_refs to ScraperConfig model`
4. `feat(scraper): add YAML config validation script`
5. `ci: add YAML config validation to CI and pre-commit`
6. `feat(scraper): add USE_YAML_CONFIGS feature flag`

### Phase 2 Commits
7. `feat(scraper): export all Supabase configs to YAML`
8. `feat(scraper): add file-based config loading to ScraperAPIClient`
9. `feat(scraper): implement dual-mode config discovery`
10. `feat(scraper): add credential resolution from API`
11. `feat(db): add file_path column and simplify scraper_configs`
12. `test: validate exported YAML matches Supabase content`

### Phase 3 Commits
13. `refactor(admin): remove test-lab components and routes`
14. `refactor(admin): remove config editor components and routes`
15. `feat(admin): simplify scraper admin to read-only + test triggers`
16. `feat(admin): add redirects for deprecated editing routes`
17. `refactor(admin): clean up scraper state management stores`
18. `feat(admin): update navigation for read-only scraper admin`

### Phase 4 Commits
19. `feat(scraper): enable USE_YAML_CONFIGS in production`
20. `refactor(scraper): remove API fallback, use YAML exclusively`
21. `feat(api): update internal endpoints to read from YAML`
22. `feat(admin): update test run trigger for YAML configs`

### Phase 5 Commits
23. `chore(db): archive scraper_runs data`
24. `chore(db): archive scraper_tests data`
25. `chore(db): drop scraper_config_versions table`
26. `chore(db): drop scraper_selectors table`
27. `chore(db): drop scraper_workflow_steps table`
28. `chore(db): drop scraper_config_test_skus table`
29. `chore(db): simplify scraper_configs table to minimal schema`
30. `chore(api): remove deprecated scraper config endpoints`
31. `docs: update documentation for YAML-based scraper configs`

---

## Success Criteria

### Verification Commands
```bash
# Verify all configs are YAML files
cd apps/scraper && ls scrapers/configs/*.yaml | wc -l
# Expected: > 0

# Verify YAML validation passes
python scripts/validate_configs.py
# Expected: Exit code 0

# Verify admin has no editing UI
curl -s http://localhost:3000/admin/scrapers | grep -i "edit"
# Expected: No matches

# Verify credential endpoint works
curl -s -H "X-API-Key: $KEY" http://localhost:3000/api/scraper/v1/credentials/amazon | jq '.username'
# Expected: Non-null value

# Verify scraper loads from YAML
cd apps/scraper && python -c "
from core.api_client import ScraperAPIClient
client = ScraperAPIClient()
config = client.load_config_from_file('ai-amazon')
print(config.name)
"
# Expected: Config name

# Verify minimal table exists
psql -c "\d scraper_configs"
# Expected: id, slug, name, file_path columns only

# Verify deprecated tables dropped
psql -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'scraper_config_versions');"
# Expected: false
```

### Final Checklist
- [ ] All configs stored as YAML files
- [ ] Admin panel is read-only + test triggers only
- [ ] Scraper loads configs from files
- [ ] Credential resolution works via API
- [ ] YAML validation in CI passes
- [ ] Old Supabase tables archived and dropped
- [ ] Documentation updated
- [ ] Production validation complete (24h monitoring)
- [ ] Rollback procedure documented

---

**Plan Generated**: 2026-03-12
**Ready for Execution**: Run `/start-work` to begin with Sisyphus
