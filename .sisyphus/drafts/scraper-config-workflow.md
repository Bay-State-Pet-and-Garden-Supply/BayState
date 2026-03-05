# Draft: Scraper Config Workflow Architecture

## Requirements (confirmed)
- **Problem**: Admin Panel-based config editing is flawed and difficult for quick edits/testing
- **Goal**: Local-first development workflow with sync to Supabase
- **Desired Flow**: Work locally → test locally → push to Supabase → other scrapers get updates

## Research Findings

### 1. Current Architecture (from explore agent)

**Storage:**
- **Primary**: Supabase tables (`scraper_configs`, `scraper_config_versions`, `scraper_config_test_skus`)
- **Local**: `BayStateScraper/scrapers/configs/*.yaml` (11 configs, partially deprecated)
- **Legacy**: `scrapers` table with JSONB config column

**Admin Panel Components:**
- `ConfigEditorClient.tsx` — Main config editor
- `ConfigList.tsx` — Config listing
- `GitHubSyncPanel.tsx` — GitHub sync (deprecated)
- Routes: `/admin/scrapers/configs`, `/admin/scrapers/configs/[id]/edit`, `/admin/scrapers/configs/[id]/history`

**Runner Config Fetching:**
- `/api/scraper/v1/poll` — Legacy polling endpoint
- `/api/internal/scraper-configs/[slug]` — Direct config fetch by slug (newer)
- Runners fetch via `core/api_client.py` → `get_published_config()`

**Current Testing:**
- `python -m scrapers --test` — Uses test_skus from YAML configs
- `python -m scrapers --test --scrapers amazon` — Test specific scraper
- Admin Panel: `/admin/scrapers/studio` — New test interface
- CI/CD: No specific config testing in CI

**Pain Points Identified:**
1. Local runner requires job ID from Supabase (can't run purely locally)
2. No dry-run or validation-only mode for YAML configs
3. Config validation happens via sync script, not before push
4. `run_local_job.sh` references deprecated `scraper_backend.runner` path

### 2. Industry Best Practices (from librarian agent)

**Recommended Pattern: One-Way Sync with Runtime Override**
```
Git (source) → CI/CD → Supabase (cache) → Runner reads at startup
```

**Key Principles:**
- Git as single source of truth (audit, code review)
- Supabase provides fast runtime access (no git clone in runners)
- Environment variables allow emergency overrides without code changes

**Testing Strategy (3-Tier):**
1. **Tier 1: Schema Validation** — JSON Schema in CI, fail invalid PRs
2. **Tier 2: Structural Tests** — Config loads, required fields, cross-references
3. **Tier 3: Integration Tests** — Dry-run scraper, verify selectors, test retry logic

**Anti-Patterns to Avoid:**
- Manual override without audit
- Configuration in multiple places without precedence
- Bidirectional sync without conflict resolution
- No rollback mechanism

### 3. Test Infrastructure (from explore agent)

**Current Local Testing:**
- `test_skus`, `fake_skus`, `edge_case_skus` in YAML configs
- `python -m scrapers --test` — Test mode using local YAML files
- `python runner.py --mode full --job-id <uuid>` — Requires job ID from API

**Gaps:**
- No standalone local test command that runs YAML configs directly
- No dry-run/validation-only mode
- CI/CD runs pytest but no config-specific tests

## Technical Decisions

### Decision: One-Way Sync Pattern (Git → Supabase)
**Rationale:**
- Matches industry best practices (ArgoCD, Supabase CLI pattern)
- Single source of truth eliminates drift
- Git history provides natural versioning
- CI validation catches errors before sync

### Decision: Local-First Development Workflow
**Flow:**
1. Edit YAML configs locally in `BayStateScraper/scrapers/configs/`
2. Run local tests: `python -m scrapers --test --scrapers <name>`
3. Validate schema: `yamllint` + JSON Schema validation
4. Commit & push to Git
5. CI runs validation tests
6. On merge to main, GitHub Actions syncs to Supabase
7. Runners fetch from Supabase at runtime

### Decision: Keep Existing YAML Files as Source of Truth
**Rationale:**
- Already exist and are structured
- Developers are familiar with format
- Works with existing `--test` mode
- Git history already present

## Open Questions (for user)

1. **Admin Panel role**: Should Admin Panel remain as a viewer only, or allow emergency edits?
   - Option A: Admin Panel becomes read-only (view configs, history)
   - Option B: Admin Panel can make emergency edits that sync back to Git (complex)

2. **Test SKU management**: Should test_skus live in YAML or Supabase?
   - Currently in YAML files
   - Supabase has `scraper_config_test_skus` table
   - Recommendation: Keep in YAML for version control

3. **Rollback strategy**: How should rollbacks work?
   - Git revert → re-sync to Supabase?
   - Database-level version switching?
   - Both?

## Scope Boundaries
- INCLUDE:
  - YAML config validation in CI
  - GitHub Actions sync workflow
  - Local testing improvements
  - Schema definition (JSON Schema)
  - Rollback mechanism
- EXCLUDE:
  - Admin Panel rewrite (minor updates only)
  - Scraper engine changes
  - New scraper development

## Next Steps
1. Confirm decisions with user
2. Create work plan for implementation
