# Scraper Studio Overhaul

## TL;DR

> **Complete overhaul of the scraper lab into a centralized hub for managing scraper configuration files.** Create a new `/admin/scrapers/studio` route with full config management (testing + monitoring + editing), intermediate real-time testing capabilities, and standard debugging features. Modify the Python runner to emit richer step-level events with timing metadata.

**Deliverables:**
- New `/admin/scrapers/studio` page with unified config management
- Real-time test execution with live step timeline
- Config editor with version history and publish workflow
- Health monitoring dashboard with trends
- Standard debugging (step trace, selector validation, extracted data)
- Python runner event enhancements (v2 schema with backward compatibility)
- New API endpoints and database tables
- Deprecation of legacy `/lab` and `/test-lab` routes

**Estimated Effort**: Large (6-8 weeks)  
**Parallel Execution**: YES - 4 parallel workstreams (Frontend, Backend, Runner, Integration)  
**Critical Path**: Database schema → API endpoints → Runner events → Frontend → Integration testing

---

## Context

### Original Request
The current scrapers lab at `/admin/scrapers/lab/` is "unacceptable for the importance of it." Need a centralized hub for managing scraper configuration files with realtime testing and feedback to determine scraper health and identify failing configuration steps.

### Interview Summary
**Key Discussions**:
- User wants **Full Config Management** (testing + monitoring + editing)
- Real-time depth: **Intermediate** (live SKU updates, step timeline, logs)
- Debugging: **Standard** (step trace, selector validation, extracted data)
- Willing to modify Python runner: **Yes - Enhance events**
- Timeline: **Comprehensive** (6-8 weeks)

**Technical Decisions**:
- Data model: **Versioned** (`scraper_configs` + `scraper_config_versions`)
- Route strategy: **New `/admin/scrapers/studio`** (deprecate both legacy routes)
- Version history: **Database versions table**
- Test SKUs: **Persisted to database** (new table for overrides)
- Event contract: **Versioned with backward compatibility**

### Research Findings
**Critical Discovery**: Two competing implementations exist:
- `/admin/scrapers/lab/` - Legacy, uses versioned configs
- `/admin/scrapers/test-lab/` - Newer, uses flat scrapers table
- ~90% code duplication between them

**Architecture**: 
- BayStateApp: Next.js 16, Supabase, Tailwind v4, shadcn/ui
- BayStateScraper: Python with 21 action handlers
- Pattern: Coordinator (App) → Runner (Scraper) via API
- Events: Core EventBus + WebSocket + Supabase Realtime

### Metis Review
**Identified Gaps** (addressed in plan):
- Need single canonical route (`/studio`)
- Need event schema versioning for safe rollout
- Need retention policies for logs/traces
- Need migration strategy from legacy routes
- Need performance budgets for real-time features
- Need acceptance criteria for each major feature

---

## Work Objectives

### Core Objective
Create a comprehensive scraper studio that serves as the single source of truth for scraper configuration management, testing, and monitoring. Unify fragmented implementations into one cohesive experience.

### Concrete Deliverables
- New Next.js page: `BayStateApp/app/admin/scrapers/studio/page.tsx`
- Client components for: Config list, Config editor, Test runner, Timeline, Health dashboard
- Server Actions: CRUD configs, versions, test triggers
- API endpoints: 10+ new endpoints for studio operations
- Database migrations: 3 new tables for test SKUs, health metrics, version metadata
- Python runner changes: Event schema v2 with richer metadata
- Deprecation redirects from legacy routes

### Definition of Done
- [x] `/admin/scrapers/studio` fully functional with all features
- [x] Legacy `/lab` and `/test-lab` redirect to `/studio`
- [x] All acceptance criteria pass for each TODO
- [x] Runner events v2 emitting correctly with backward compat
- [x] Real-time updates working for test runs
- [x] Health dashboard showing trends and metrics
- [x] Config editing with version history functional
- [x] All TODO QA scenarios pass

### Must Have
- Config list with filtering and sorting
- Config editor with YAML validation
- Version history with publish/rollback
- Test SKU management (test/fake/edge-case)
- On-demand test execution with live updates
- Step timeline showing current progress
- Health dashboard with pass/fail rates
- Step trace for debugging
- Selector validation (found/missing)
- Extracted data per step

### Must NOT Have (Guardrails)
- NO visual selector builder (full browser IDE)
- NO screenshot capture in v1 (design for v2)
- NO multi-run comparative analytics in v1
- NO cross-environment management (dev/stage/prod)
- NO generic plugin framework
- NO complex analytics/ML for failure prediction
- NO external monitoring integrations (PagerDuty, etc.)

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> This is NOT conditional — it applies to EVERY task, regardless of test strategy.
>
> **FORBIDDEN** — acceptance criteria that require:
> - "User manually tests..." / "사용자가 직접 테스트..."
> - "User visually confirms..." / "사용자가 눈으로 확인..."
> - "User interacts with..." / "사용자가 직접 조작..."
> - "Ask user to verify..." / "사용자에게 확인 요청..."
> - ANY step where a human must perform an action
>
> **ALL verification is executed by the agent** using tools (Playwright, interactive_bash, curl, etc.). No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Jest + RTL configured in BayStateApp)
- **Automated tests**: Tests-after (unit tests for components, integration tests for features)
- **Framework**: Jest + React Testing Library

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Frontend/UI** | Playwright | Navigate, interact, assert DOM, screenshot |
| **API/Backend** | Bash (curl/httpie) | Send requests, parse responses, assert fields |
| **Database** | supabase_execute_sql | Query tables, verify schema, check data |
| **Python/Runner** | Bash (python) | Import modules, run tests, check output |

**Each Scenario Format:**
```
Scenario: [Descriptive name]
  Tool: [Playwright / Bash / supabase_execute_sql]
  Preconditions: [What must be true before]
  Steps:
    1. [Exact action with selector/command]
    2. [Assertion with expected value]
  Expected Result: [Concrete outcome]
  Evidence: [Screenshot / output path]
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - Foundation):
├── Task 1: Database Schema (test_skus, health_metrics tables)
├── Task 2: Runner Event Schema v2 Design
├── Task 3: Studio Page Shell + Layout
└── Task 4: Config List Component

Wave 2 (After Wave 1 - Core Features):
├── Task 5: Config Editor Integration
├── Task 6: Version History + Publish Workflow
├── Task 7: Test Execution API Endpoints
├── Task 8: Runner Event Implementation
└── Task 9: Real-time Timeline Component

Wave 3 (After Wave 2 - Testing & Debugging):
├── Task 10: Test SKU Management
├── Task 11: Health Dashboard
├── Task 12: Step Trace Debugging
└── Task 13: Selector Validation Display

Wave 4 (After Wave 3 - Integration & Polish):
├── Task 14: Integration Testing
├── Task 15: Legacy Route Deprecation
├── Task 16: Performance Optimization
└── Task 17: Documentation

Critical Path: Task 1 → Task 5 → Task 6 → Task 7 → Task 9 → Task 14
Parallel Speedup: ~50% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 (DB Schema) | None | 5, 6, 7, 11 | 2, 3, 4 |
| 2 (Event Design) | None | 8 | 1, 3, 4 |
| 3 (Page Shell) | None | 4, 9 | 1, 2 |
| 4 (Config List) | 3 | 5 | 1, 2 |
| 5 (Config Editor) | 1, 4 | 6 | - |
| 6 (Versions) | 1, 5 | 7 | - |
| 7 (Test API) | 1, 6 | 9 | 8 |
| 8 (Runner Events) | 2 | 9 | 7 |
| 9 (Timeline) | 3, 7, 8 | 13 | 10 |
| 10 (Test SKUs) | 1 | 9 | 7 |
| 11 (Health Dash) | 1 | 14 | 7 |
| 12 (Debugging) | 9 | 14 | 13 |
| 13 (Selector Val) | 9 | 14 | 12 |
| 14 (Integration) | 9, 11, 12 | 15 | - |
| 15 (Deprecation) | 14 | - | - |
| 16 (Performance) | 14 | - | - |
| 17 (Docs) | 15 | - | - |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1-4 | category="unspecified-high" for DB, category="visual-engineering" for UI |
| 2 | 5-9 | category="unspecified-high" for API, category="visual-engineering" for components |
| 3 | 10-13 | category="unspecified-high" for features |
| 4 | 14-17 | category="unspecified-high" for integration, category="writing" for docs |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info.

### Prerequisites

- [x] **0. Setup Evidence Directory** ✓ COMPLETED

  **What to do:**
  - Create `.sisyphus/evidence/` directory for QA artifacts
  - Add `.gitignore` rule: ignore all files in evidence dir except .gitkeep and README
  - Add README.md explaining evidence collection purpose

  **Gitignore Rule:**
  ```
  # Ignore all evidence files except markers
  .sisyphus/evidence/*
  !.sisyphus/evidence/.gitkeep
  !.sisyphus/evidence/README.md
  ```

  **Acceptance Criteria:**

  **Scenario: Evidence directory exists with correct gitignore**
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: `mkdir -p /Users/nickborrello/Desktop/Projects/BayState/.sisyphus/evidence`
      2. Run: `echo ".sisyphus/evidence/*" >> /Users/nickborrello/Desktop/Projects/BayState/.gitignore`
      3. Run: `echo "!.sisyphus/evidence/.gitkeep" >> /Users/nickborrello/Desktop/Projects/BayState/.gitignore`
      4. Run: `echo "!.sisyphus/evidence/README.md" >> /Users/nickborrello/Desktop/Projects/BayState/.gitignore`
      5. Run: `touch /Users/nickborrello/Desktop/Projects/BayState/.sisyphus/evidence/.gitkeep`
      6. Run: `echo "# Evidence Directory" > /Users/nickborrello/Desktop/Projects/BayState/.sisyphus/evidence/README.md`
      7. Run: `ls -la /Users/nickborrello/Desktop/Projects/BayState/.sisyphus/evidence/`
      8. Assert: Directory exists with .gitkeep and README.md
    Expected Result: Evidence directory ready with gitignore
    Evidence: Directory listing saved

  **Note**: All acceptance criteria in subsequent tasks will save evidence to this directory using exact paths like `.sisyphus/evidence/task-{N}-{name}.{ext}`. Playwright screenshots use `screenshot: { path: '.sisyphus/evidence/task-N-name.png' }`, curl uses `-o .sisyphus/evidence/task-N-name.json`, and SQL results are redirected to files.

  **Commit**: YES
  - Message: `chore: setup evidence directory for QA artifacts`
  - Files: `.sisyphus/evidence/.gitkeep`, `.sisyphus/evidence/README.md`, `.gitignore`

### Wave 1: Foundation

- [x] **1. Database Schema: Test SKUs and Health Metrics** ✓ COMPLETED

  **What to do:**
  - Create `scraper_config_test_skus` table for custom SKU overrides
  - Create `scraper_health_metrics` table for aggregated health data
  - Create `update_health_metrics()` PostgreSQL function to aggregate from test runs
  - Add migration to Supabase
  - Add Row Level Security (RLS) policies
  - **Note**: Health metrics will be aggregated on-demand via the function when dashboard is viewed, not via cron job (avoids pg_cron dependency)

  **Must NOT do:**
  - Do NOT modify existing `scraper_test_runs` or `scraper_test_run_steps` tables
  - Do NOT add columns to `scraper_configs` (use separate tables for extensibility)
  - Do NOT create `scraper_config_versions` or modify `scraper_configs` (these already exist in current schema)

  **Note on Dual Schema:**
  The database currently has TWO scraper tables:
  1. `scrapers` (older, flat model) - from 20260103 migration
  2. `scraper_configs` + `scraper_config_versions` (versioned model) - from 20260122 migration
  
  This plan uses `scraper_configs` as the canonical table (per user decision to use versioned model).
  The `scrapers` table exists for backward compatibility but should not be used for new features.

  **Schema Design:**
  ```sql
  -- Custom test SKU overrides per config
  CREATE TABLE scraper_config_test_skus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID REFERENCES scraper_configs(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    sku_type TEXT CHECK (sku_type IN ('test', 'fake', 'edge_case')),
    added_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(config_id, sku)
  );

  -- Aggregated health metrics for trends
  CREATE TABLE scraper_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID REFERENCES scraper_configs(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    total_runs INTEGER DEFAULT 0,
    passed_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    avg_duration_ms INTEGER,
    top_failing_step TEXT,
    selector_health JSONB, -- { selector_name: { found: N, missed: N } }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(config_id, metric_date)
  );

  -- Function to aggregate health metrics from test runs
  -- Called on-demand when dashboard is viewed, not via cron
  -- IMPORTANT: This function assumes a mapping between scraper_test_runs.scraper_id 
  -- and scraper_configs.id exists (via migration or mapping table)
  -- 
  -- Current state: scraper_test_runs.scraper_id references scrapers.id (old table)
  -- Migration needed: Either:
  --   A) Add scraper_config_id column to scraper_test_runs and migrate data, OR
  --   B) Create mapping table scraper_id_to_config_id, OR
  --   C) Update scraper_test_runs to reference scraper_configs.id directly
  CREATE OR REPLACE FUNCTION update_health_metrics()
  RETURNS void AS $$
  BEGIN
    INSERT INTO scraper_health_metrics (
      config_id, metric_date, total_runs, passed_runs, failed_runs, avg_duration_ms
    )
    SELECT 
      tr.scraper_id as config_id,  -- TODO: Update to use proper config_id mapping
      DATE(tr.created_at) as metric_date,
      COUNT(*) as total_runs,
      COUNT(*) FILTER (WHERE tr.status = 'completed') as passed_runs,
      COUNT(*) FILTER (WHERE tr.status = 'failed') as failed_runs,
      AVG(tr.duration_ms)::INTEGER as avg_duration_ms
    FROM scraper_test_runs tr
    WHERE tr.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY tr.scraper_id, DATE(tr.created_at)
    ON CONFLICT (config_id, metric_date) 
    DO UPDATE SET
      total_runs = EXCLUDED.total_runs,
      passed_runs = EXCLUDED.passed_runs,
      failed_runs = EXCLUDED.failed_runs,
      avg_duration_ms = EXCLUDED.avg_duration_ms;
  END;
  $$ LANGUAGE plpgsql;
  ```
  
  **Migration Strategy Note:**
  The `scraper_test_runs` table currently references `scrapers.id` (old flat model).
  This plan uses `scraper_configs` (new versioned model) as canonical.
  The aggregation function above needs the mapping resolved before implementation.
  Options:
  1. Add `config_id` column to `scraper_test_runs` (parallel to `scraper_id`)
  2. Create view that maps `scrapers.id` → `scraper_configs.id` via slug matching
  3. Migrate data to unify tables (larger effort)

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: `supabase`, `database-migrations`
  - **Reason**: Database schema work requires careful migration planning and RLS setup

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5, 6, 7, 11
  - **Blocked By**: None (can start immediately)

  **References:**
  - Pattern: `BayStateApp/supabase/migrations/` existing migrations
  - RLS: See existing scraper tables for policy patterns
  - Types: Generate with `npx supabase gen types typescript --local`

  **Acceptance Criteria:**

  **Scenario: Test SKU table created with proper structure**
    Tool: supabase_execute_sql
    Preconditions: Local Supabase running
    Steps:
      1. Run: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scraper_config_test_skus'`
      2. Assert: Returns columns: id, config_id, sku, sku_type, added_by, created_at
      3. Assert: config_id has foreign key constraint to scraper_configs
      4. Assert: sku_type check constraint exists
      5. Run: `SELECT * FROM pg_policies WHERE tablename = 'scraper_config_test_skus'`
      6. Assert: At least 2 RLS policies exist (SELECT, INSERT)
    Expected Result: Table exists with correct schema and RLS
    Evidence: Query output saved to .sisyphus/evidence/task-1-schema.txt

  **Scenario: Health metrics table created with proper structure**
    Tool: supabase_execute_sql
    Preconditions: Local Supabase running
    Steps:
      1. Run: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scraper_health_metrics'`
      2. Assert: Returns columns including metric_date, total_runs, selector_health (JSONB)
      3. Assert: Unique constraint on (config_id, metric_date)
      4. Run: `SELECT * FROM pg_policies WHERE tablename = 'scraper_health_metrics'`
      5. Assert: RLS policies exist
    Expected Result: Table exists with correct schema
    Evidence: Query output saved to .sisyphus/evidence/task-1-health-schema.txt

  **Commit**: YES
  - Message: `feat(db): add test_sku and health_metrics tables for scraper studio`
  - Files: `BayStateApp/supabase/migrations/YYYYMMDDTTMMSS_add_scraper_studio_tables.sql`
  - Note: Run `npx supabase gen types typescript --local` to regenerate types after migration

- [x] **2. Runner Event Schema v2 Design** ✓ COMPLETED

  **What to do:**
  - Design event schema v2 with backward compatibility
  - Define all event types and payloads
  - Create JSON Schema for validation
  - Document version negotiation strategy
  - Define timing metadata format

  **Must NOT do:**
  - Do NOT break v1 event consumers
  - Do NOT add required fields that would break existing parsers

  **Schema Design:**
  ```json
  {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Scraper Event v2",
    "type": "object",
    "required": ["version", "event_type", "timestamp", "run_id"],
    "properties": {
      "version": { "type": "string", "enum": ["2.0"] },
      "event_type": { 
        "type": "string",
        "enum": [
          "job.started", "job.completed", "job.failed",
          "scraper.started", "scraper.completed", "scraper.failed",
          "sku.processing", "sku.success", "sku.failed", "sku.no_results",
          "step.started", "step.completed", "step.failed",
          "selector.resolved", "extraction.completed"
        ]
      },
      "timestamp": { "type": "string", "format": "date-time" },
      "run_id": { "type": "string", "format": "uuid" },
      "scraper_id": { "type": "string" },
      "sku": { "type": "string" },
      "step": {
        "type": "object",
        "properties": {
          "index": { "type": "integer" },
          "action": { "type": "string" },
          "name": { "type": ["string", "null"] },
          "started_at": { "type": "string", "format": "date-time" },
          "completed_at": { "type": "string", "format": "date-time" },
          "duration_ms": { "type": "integer" },
          "status": { "type": "string", "enum": ["success", "failed", "skipped"] }
        }
      },
      "selectors": {
        "type": "object",
        "patternProperties": {
          ".*": {
            "type": "object",
            "properties": {
              "found": { "type": "boolean" },
              "count": { "type": "integer" },
              "error": { "type": ["string", "null"] }
            }
          }
        }
      },
      "extraction": {
        "type": "object",
        "patternProperties": {
          ".*": {
            "type": "object",
            "properties": {
              "value": { "type": ["string", "null"] },
              "confidence": { "type": "number" }
            }
          }
        }
      },
      "error": {
        "type": "object",
        "properties": {
          "type": { "type": "string" },
          "message": { "type": "string" },
          "traceback": { "type": ["string", "null"] }
        }
      }
    }
  }
  ```

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: None needed (design task)
  - **Reason**: This is a design/documentation task requiring architectural decisions

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 8
  - **Blocked By**: None

  **References:**
  - Core EventBus: `BayStateScraper/core/events.py` (canonical event system with EventBus, ScraperEvent, EventType)
  - Test lab events: `BayStateScraper/scrapers/events/` (WebSocket/emitter layer)
  - Event emitter: `BayStateScraper/scrapers/events/emitter.py`
  - Event handlers: `BayStateScraper/scrapers/events/handlers/`
  - Base event: `BayStateScraper/scrapers/events/base.py`
  - Existing docs: `BayStateScraper/docs/` (directory exists with ARCHITECTURE.md, GOALS.md, etc.)
  
  **Architecture Note:** 
  - `core/events.py` = Main EventBus for scraper execution (Task 8 modifies this)
  - `scrapers/events/` = WebSocket/Real-time layer for test lab UI (separate concern)

  **Acceptance Criteria:**

  **Scenario: Docs directory and event schema v2 document created**
    Tool: Bash (file check)
    Preconditions: None
    Steps:
      1. Run: `mkdir -p /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper/docs`
      2. Check: `ls /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper/docs/event-schema-v2.json`
      3. Assert: File exists
      4. Validate: `python3 -c "import json; json.load(open('/Users/nickborrello/Desktop/Projects/BayState/BayStateScraper/docs/event-schema-v2.json'))"`
      5. Assert: No JSON parse errors
      6. Check content includes: version field, step.timing, selectors, extraction
    Expected Result: Valid JSON Schema document exists
    Evidence: File content captured

  **Scenario: Backward compatibility strategy documented**
    Tool: Bash (file check)
    Preconditions: BayStateScraper/docs directory exists
    Steps:
      1. Check: `ls /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper/docs/event-versioning.md`
      2. Assert: File exists
      3. Content includes: v1 compatibility mode, version detection, migration path
    Expected Result: Versioning strategy documented
    Evidence: File content captured

  **Commit**: YES
  - Message: `docs(scraper): design event schema v2 with backward compatibility`
  - Files: `BayStateScraper/docs/event-schema-v2.json`, `BayStateScraper/docs/event-versioning.md`

- [x] **3. Studio Page Shell + Layout** ✓ COMPLETED

  **What to do:**
  - Create new route: `BayStateApp/app/admin/scrapers/studio/page.tsx`
  - Create layout component matching admin patterns
  - Add sidebar navigation item
  - Create basic page structure with tabs
  - Set up metadata and SEO

  **Must NOT do:**
  - Do NOT reuse code from `/lab` or `/test-lab` (clean implementation)
  - Do NOT implement actual features yet (just shell)

  **Page Structure:**
  ```
  /admin/scrapers/studio
  ├── Header: "Scraper Studio" + description
  ├── Tabs: [Configs, Testing, Health, History]
  ├── Tab Content (empty placeholders)
  └── Footer: version info
  ```

  **Recommended Agent Profile:**
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`
  - **Reason**: UI layout work following design system patterns

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4, 9
  - **Blocked By**: None

  **References:**
  - Layout pattern: `BayStateApp/app/admin/layout.tsx`
  - Page pattern: `BayStateApp/app/admin/scrapers/dashboard/page.tsx`
  - Tabs: `BayStateApp/components/ui/tabs.tsx`
  - Design system: AGENTS.md design system section

  **Acceptance Criteria:**

  **Scenario: Studio page loads with correct layout**
    Tool: Playwright
    Preconditions: Dev server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Wait for: header visible (timeout: 5s)
      3. Assert: h1 contains "Scraper Studio"
      4. Assert: Tabs visible: "Configs", "Testing", "Health", "History"
      5. Assert: Sidebar navigation includes "Studio" link
      6. Click: "Testing" tab
      7. Assert: Tab content area visible (empty placeholder)
      8. Screenshot: .sisyphus/evidence/task-3-studio-layout.png
    Expected Result: Studio page loads with tabs and layout
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): create scraper studio page shell with tabs`
  - Files: `BayStateApp/app/admin/scrapers/studio/page.tsx`, `BayStateApp/app/admin/scrapers/studio/layout.tsx`

- [x] **4. Config List Component** ✓ COMPLETED

  **What to do:**
  - Create server component to fetch configs with versions
  - Create client component for interactive list
  - Add filtering, sorting, pagination
  - Display: name, version count, last run status, health indicator
  - Add actions: edit, test, view history

  **Must NOT do:**
  - Do NOT implement actual edit/test functionality (links only)
  - Do NOT fetch full config content (metadata only)

  **Recommended Agent Profile:**
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`
  - **Reason**: Complex table/list component with interactions

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References:**
  - Data table: `BayStateApp/components/admin/data-table.tsx`
  - Scraper list pattern: `BayStateApp/app/admin/scrapers/configs/page.tsx`
  - Status badges: See existing status config patterns

  **Acceptance Criteria:**

  **Scenario: Config list displays with data**
    Tool: Playwright
    Preconditions: Studio page exists, test data in scraper_configs
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Wait for: config list table visible (timeout: 10s)
      3. Assert: At least 1 config row visible
      4. Assert: Columns visible: Name, Versions, Last Run, Health
      5. Assert: Action buttons visible: Edit, Test
      6. Type in filter: test config name
      7. Assert: Table filters to matching rows
      8. Screenshot: .sisyphus/evidence/task-4-config-list.png
    Expected Result: Config list displays with filtering
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add scraper config list with filtering`
  - Files: `BayStateApp/components/admin/scraper-studio/ConfigList.tsx`, `BayStateApp/components/admin/scraper-studio/ConfigListClient.tsx`

---

### Wave 2: Core Features

- [x] **5. Config Editor Integration** ✓ COMPLETED

  **What to do:**
  - Integrate existing config editor into studio
  - Add YAML validation with helpful errors
  - Implement auto-save drafts
  - Add selector validation (test against live page)
  - Add workflow visualization

  **Must NOT do:**
  - Do NOT rewrite config editor from scratch (reuse existing)
  - Do NOT implement visual selector builder

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: None needed
  - **Reason**: Integration task combining existing components

  **Parallelization:**
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1 (DB schema), Task 4 (Config List)
  - **Blocks**: Task 6

  **References:**
  - Existing editor: `BayStateApp/components/admin/scraper-lab/config-editor/`
  - YAML validation: Use `js-yaml` library

  **Acceptance Criteria:**

  **Scenario: Config editor loads and validates YAML**
    Tool: Playwright
    Preconditions: Config exists in database
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Click: Edit button on first config
      3. Wait for: Config editor visible (timeout: 5s)
      4. Assert: YAML editor visible with config content
      5. Type: Invalid YAML (missing colon)
      6. Assert: Validation error displayed
      7. Fix: Add missing colon
      8. Assert: Error cleared, valid indicator shown
      9. Screenshot: .sisyphus/evidence/task-5-config-editor.png
    Expected Result: Editor loads with validation
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): integrate config editor into studio`
  - Files: `BayStateApp/components/admin/scraper-studio/ConfigEditor.tsx`

- [x] **6. Version History + Publish Workflow** ✓ COMPLETED

  **What to do:**
  - Create version history sidebar/panel
  - Implement create version (save snapshot)
  - Implement publish version (set as current)
  - Implement rollback (restore previous version)
  - Add version comparison (diff view)
  - Add version metadata (author, timestamp, comment)

  **Must NOT do:**
  - Do NOT allow editing published versions (create new version instead)
  - Do NOT delete versions with associated test runs
  - Do NOT create new tables (use existing scraper_config_versions)

  **Note**: Uses EXISTING tables from current schema:
  - `scraper_configs` table with `current_version_id` column
  - `scraper_config_versions` table (already exists)

  **Database Operations:**
  ```sql
  -- Create new version (inserts into EXISTING table)
  INSERT INTO scraper_config_versions (config_id, config, created_by, comment)
  VALUES ($1, $2, $3, $4);

  -- Publish version (updates EXISTING table)
  UPDATE scraper_configs
  SET current_version_id = $1, updated_at = NOW()
  WHERE id = $2;
  ```

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: `supabase`
  - **Reason**: Complex database operations with versioning logic

  **Parallelization:**
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1, Task 5
  - **Blocks**: Task 7

  **References:**
  - Existing version table: `scraper_config_versions`
  - Diff library: `diff` or custom implementation

  **Acceptance Criteria:**

  **Scenario: Version history displays and publish works**
    Tool: Playwright
    Preconditions: Config exists with multiple versions
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Click: Edit button on config
      3. Click: "Versions" tab/panel
      4. Assert: Version list visible with timestamps
      5. Click: "Create Version" button
      6. Fill: Comment "Test version"
      7. Click: Save
      8. Assert: New version appears in list
      9. Click: "Publish" on previous version
      10. Assert: Confirmation dialog shown
      11. Click: Confirm
      12. Assert: Version marked as current
      13. Screenshot: .sisyphus/evidence/task-6-versions.png
    Expected Result: Version workflow functional
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add version history and publish workflow`
  - Files: `BayStateApp/components/admin/scraper-studio/VersionHistory.tsx`, `BayStateApp/app/admin/scrapers/studio/actions.ts`

- [x] **7. Test Execution API Endpoints** ✓ COMPLETED

  **What to do:**
  - Create `POST /api/admin/scrapers/studio/test` - Trigger test run
  - Create `GET /api/admin/scrapers/studio/test/[id]` - Get test status
  - Create `GET /api/admin/scrapers/studio/test/[id]/timeline` - Get step timeline
  - Integrate with existing runner API
  - Add test run metadata tracking

  **Must NOT do:**
  - Do NOT modify runner claiming logic (use existing)
  - Do NOT bypass lease-based ownership

  **API Design:**
  ```typescript
  // POST /api/admin/scrapers/studio/test
  Body: {
    config_id: string;
    version_id?: string; // defaults to current
    skus?: string[]; // optional override
    options?: {
      timeout?: number;
      priority?: 'normal' | 'high';
    }
  }
  Response: { test_run_id: string; status: 'pending' }

  // GET /api/admin/scrapers/studio/test/[id]
  Response: {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    config_id: string;
    started_at: string;
    completed_at?: string;
    sku_results: [...];
    summary: { passed: number; failed: number; total: number }
  }
  ```

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: None needed
  - **Reason**: API endpoint implementation

  **Parallelization:**
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1, Task 6
  - **Blocks**: Task 9

  **References:**
  - Existing test API: `BayStateApp/app/api/admin/scraper-network/test/route.ts`
  - Runner API: `BayStateApp/app/api/scraper/v1/poll/route.ts`

  **Acceptance Criteria:**

  **Scenario: Test execution API works end-to-end**
    Tool: Bash (curl)
    Preconditions: Server running, config exists
    Steps:
      1. POST: `curl -X POST http://localhost:3000/api/admin/scrapers/studio/test \
           -H "Content-Type: application/json" \
           -d '{"config_id":"test-config-id","skus":["12345"]}'`
      2. Assert: Response status 201
      3. Assert: Response contains test_run_id
      4. Save: test_run_id from response
      5. GET: `curl http://localhost:3000/api/admin/scrapers/studio/test/{test_run_id}`
      6. Assert: Response status 200
      7. Assert: Response contains config_id, status, summary
      8. Save: Response to .sisyphus/evidence/task-7-api-response.json
    Expected Result: API endpoints functional
    Evidence: Response JSON saved

  **Commit**: YES
  - Message: `feat(api): add test execution endpoints for studio`
  - Files: `BayStateApp/app/api/admin/scrapers/studio/test/route.ts`, `BayStateApp/app/api/admin/scrapers/studio/test/[id]/route.ts`

- [x] **8. Runner Event Implementation** ✓ COMPLETED

  **What to do:**
  - Modify Python runner to emit v2 events
  - Add timing metadata to all steps
  - Add selector resolution results
  - Add extraction field results
  - Maintain backward compatibility with v1
  - Update event bus to handle both versions

  **Must NOT do:**
  - Do NOT break existing v1 consumers
  - Do NOT significantly impact runner performance

  **Changes Needed:**
  ```python
  # In workflow_executor.py or step_executor.py
  async def execute_step_with_events(step, context):
      started_at = datetime.utcnow()
      
      # Emit step.started
      event_bus.emit({
          "version": "2.0",
          "event_type": "step.started",
          "timestamp": started_at.isoformat(),
          "run_id": context.run_id,
          "step": {"index": step.index, "action": step.action, "name": step.name}
      })
      
      # Execute step
      result = await execute_step(step, context)
      
      completed_at = datetime.utcnow()
      duration_ms = int((completed_at - started_at).total_seconds() * 1000)
      
      # Emit step.completed with timing
      event_bus.emit({
          "version": "2.0",
          "event_type": "step.completed",
          "timestamp": completed_at.isoformat(),
          "run_id": context.run_id,
          "step": {
              "index": step.index,
              "action": step.action,
              "name": step.name,
              "started_at": started_at.isoformat(),
              "completed_at": completed_at.isoformat(),
              "duration_ms": duration_ms,
              "status": "success" if result.success else "failed"
          },
          "selectors": result.selectors if hasattr(result, 'selectors') else {},
          "extraction": result.extraction if hasattr(result, 'extraction') else {}
      })
  ```

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: `python`
  - **Reason**: Python code modification with event system

  **Parallelization:**
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 2 (Schema design)
  - **Blocks**: Task 9

  **References:**
  - Event bus: `BayStateScraper/core/events.py`
  - Step executor: `BayStateScraper/scrapers/executor/step_executor.py`
  - Workflow executor: `BayStateScraper/scrapers/executor/workflow_executor.py`

  **Acceptance Criteria:**

  **Scenario: Runner emits v2 events correctly**
    Tool: Bash (python)
    Preconditions: Python environment set up in BayStateScraper/
    Steps:
      1. Run: `cd /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper && python -c "import sys; sys.path.insert(0, '.'); from scrapers.executor.workflow_executor import WorkflowExecutor; print('Import OK')"`
      2. Assert: No import errors
      3. Run unit tests: `cd /Users/nickborrello/Desktop/Projects/BayState/BayStateScraper && python -m pytest tests/test_events.py -v`
      4. Assert: All tests pass
      5. Check: Event output includes version field
      6. Check: Event output includes step.timing
      7. Check: Event output includes selectors and extraction
      8. Save: Sample event output to .sisyphus/evidence/task-8-event.json
    Expected Result: Runner emits v2 events with all fields
    Evidence: Event JSON saved

  **Commit**: YES
  - Message: `feat(scraper): add event schema v2 with timing and metadata`
  - Files: `BayStateScraper/scrapers/executor/workflow_executor.py`, `BayStateScraper/scrapers/executor/step_executor.py`, `BayStateScraper/tests/test_events.py` (NEW test file)

- [x] **9. Real-time Timeline Component** ✓ COMPLETED

  **What to do:**
  - Create timeline component for step visualization
  - Integrate with Supabase Realtime for live updates
  - Show step progress (pending, running, completed, failed)
  - Display timing per step
  - Show logs/messages during execution
  - Add expand/collapse for step details

  **Must NOT do:**
  - Do NOT use WebSocket directly (use Supabase Realtime)
  - Do NOT buffer infinite events (implement cleanup)

  **Recommended Agent Profile:**
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`
  - **Reason**: Complex real-time UI component

  **Parallelization:**
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 3, Task 7, Task 8
  - **Blocks**: Task 12, Task 13

  **References:**
  - Realtime hook: `BayStateApp/lib/realtime/useJobSubscription.ts` (pattern to copy for NEW useTestRunSubscription.ts)
  - Timeline pattern: `BayStateApp/app/admin/scrapers/test-lab/[id]/TimelineStepDisplayRealtime.tsx`
  - Supabase Realtime docs

  **Real-time Subscription Details:**
  - Create NEW hook `useTestRunSubscription.ts` modeled after `useJobSubscription.ts`
  - Subscribe to `scraper_test_run_steps` table changes filtered by `test_run_id`
  - Channel name: `test-run-{test_run_id}`
  - Events: INSERT (new step), UPDATE (step status change)
  - Also subscribe to `scraper_test_runs` table for run-level status changes
  - Pattern: Same as `TimelineStepDisplayRealtime.tsx` which uses `supabase.channel()` with `postgres_changes` filter

  **Acceptance Criteria:**

  **Scenario: Timeline updates in real-time during test**
    Tool: Playwright
    Preconditions: Server running, test can be triggered
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Click: Test button on config
      3. Wait for: Timeline component visible (timeout: 5s)
      4. Assert: Steps shown with "pending" state
      5. Trigger: Start test run
      6. Wait for: First step shows "running" (timeout: 30s)
      7. Assert: Progress indicator visible
      8. Wait for: Steps complete (timeout: 2min)
      9. Assert: Final status visible (success/failed)
      10. Assert: Timing shown per step
      11. Screenshot: .sisyphus/evidence/task-9-timeline.png
    Expected Result: Timeline updates live during execution
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add real-time step timeline component`
  - Files: `BayStateApp/components/admin/scraper-studio/Timeline.tsx`, `BayStateApp/lib/realtime/useTestRunSubscription.ts` (NEW - model after useJobSubscription.ts)

---

### Wave 3: Testing & Debugging

- [x] **10. Test SKU Management** ✓ COMPLETED

  **What to do:**
  - Create UI for managing test SKUs per config
  - Add/remove test SKUs (test/fake/edge-case types)
  - Save custom SKUs to database (from Task 1 table)
  - Import SKUs from config YAML
  - Bulk add/remove operations
  - SKU validation (format checking)

  **Must NOT do:**
  - Do NOT modify YAML files directly (use database table)

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: `supabase`
  - **Reason**: CRUD operations with database

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Blocked By**: Task 1
  - **Blocks**: None

  **References:**
  - Test SKU table: Created in Task 1
  - Form patterns: React Hook Form + Zod

  **Acceptance Criteria:**

  **Scenario: Test SKU management works end-to-end**
    Tool: Playwright
    Preconditions: Config exists
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Click: Edit config
      3. Click: "Test SKUs" tab
      4. Click: "Add SKU" button
      5. Fill: SKU "12345", Type "test"
      6. Click: Save
      7. Assert: SKU appears in list
      8. Reload page
      9. Assert: SKU still present (persisted)
      10. Click: Delete button on SKU
      11. Assert: SKU removed from list
      12. Screenshot: .sisyphus/evidence/task-10-skus.png
    Expected Result: SKU management functional
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add test SKU management with persistence`
  - Files: `BayStateApp/components/admin/scraper-studio/TestSkuManager.tsx`

- [x] **11. Health Dashboard** ✓ COMPLETED

  **What to do:**
  - Create health dashboard with metrics
  - Show pass/fail rate over time
  - Show execution duration trends
  - Show selector health (found vs missed)
  - Add charts/graphs for visualization
  - Show top failing steps
  - Aggregate data from `scraper_health_metrics` table

  **Must NOT do:**
  - Do NOT implement complex analytics/ML
  - Do NOT add predictive failure analysis

  **Recommended Agent Profile:**
  - **Category**: `visual-engineering`
  - **Skills**: `frontend-ui-ux`
  - **Reason**: Dashboard with charts and visualizations

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Blocked By**: Task 1
  - **Blocks**: Task 14

  **References:**
  - Chart library: Recharts or similar
  - Health metrics table: Created in Task 1
  - Stat card: `BayStateApp/components/admin/dashboard/stat-card.tsx`

  **Acceptance Criteria:**

  **Scenario: Health dashboard displays metrics**
    Tool: Playwright
    Preconditions: Health metrics exist in database
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Click: "Health" tab
      3. Wait for: Dashboard visible (timeout: 5s)
      4. Assert: Pass/fail rate chart visible
      5. Assert: Duration trend chart visible
      6. Assert: Selector health table visible
      7. Assert: Top failing steps list visible
      8. Screenshot: .sisyphus/evidence/task-11-health.png
    Expected Result: Dashboard displays all metrics
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add health dashboard with trends`
  - Files: `BayStateApp/components/admin/scraper-studio/HealthDashboard.tsx`

- [x] **12. Step Trace Debugging** ✓ COMPLETED

  **What to do:**
  - Create step trace view for completed runs
  - Show step-by-step execution details
  - Display input/output for each step
  - Show error details for failed steps
  - Add retry functionality for failed steps
  - Link to relevant config section

  **Must NOT do:**
  - Do NOT show screenshots (out of scope for v1)
  - Do NOT implement replay functionality

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: None needed
  - **Reason**: Data display component

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Blocked By**: Task 9
  - **Blocks**: Task 14

  **References:**
  - Timeline component: Task 9
  - Step data: From runner events

  **Acceptance Criteria:**

  **Scenario: Step trace shows detailed execution**
    Tool: Playwright
    Preconditions: Completed test run exists
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Click: History tab
      3. Click: View on completed test run
      4. Click: "Step Trace" tab
      5. Assert: Step list visible with details
      6. Click: Expand first step
      7. Assert: Step input visible
      8. Assert: Step output visible
      9. Assert: Step timing visible
      10. Screenshot: .sisyphus/evidence/task-12-trace.png
    Expected Result: Step trace shows execution details
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add step trace debugging view`
  - Files: `BayStateApp/components/admin/scraper-studio/StepTrace.tsx`

- [x] **13. Selector Validation Display** ✓ COMPLETED

  **What to do:**
  - Show selector validation results
  - Display which selectors were found/missed
  - Show selector counts (how many elements matched)
  - Highlight required selectors that failed
  - Show selector error messages
  - Link selectors to config definition

  **Must NOT do:**
  - Do NOT implement selector playground (test against live pages)

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: None needed
  - **Reason**: Data display component

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Blocked By**: Task 9
  - **Blocks**: Task 14

  **References:**
  - Selector data: From runner events v2
  - Step trace: Task 12

  **Acceptance Criteria:**

  **Scenario: Selector validation displays correctly**
    Tool: Playwright
    Preconditions: Completed test run with selector data exists
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Click: History tab
      3. Click: View on test run
      4. Click: "Selectors" tab
      5. Assert: Selector list visible
      6. Assert: Found selectors marked green
      7. Assert: Missed selectors marked red
      8. Assert: Element counts displayed
      9. Screenshot: .sisyphus/evidence/task-13-selectors.png
    Expected Result: Selector validation visible
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add selector validation display`
  - Files: `BayStateApp/components/admin/scraper-studio/SelectorValidation.tsx`

---

### Wave 4: Integration & Polish

- [x] **14. Integration Testing** ✓ COMPLETED

  **What to do:**
  - Test complete user workflows end-to-end
  - Test config creation → edit → test → view results
  - Test version publish → rollback
  - Test real-time updates during execution
  - Test error handling and edge cases
  - Performance testing for large config lists

  **Must NOT do:**
  - Do NOT skip integration testing (critical for this overhaul)

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: None needed
  - **Reason**: Integration and testing task

  **Parallelization:**
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 9, Task 11, Task 12
  - **Blocks**: Task 15

  **Acceptance Criteria:**

  **Scenario: Complete workflow test**
    Tool: Playwright
    Preconditions: All components implemented
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Create: New config with basic YAML
      3. Edit: Add test SKUs
      4. Trigger: Test run
      5. Wait for: Test completion
      6. View: Timeline, Step Trace, Selectors
      7. Create: New version
      8. Publish: Version
      9. Verify: Version published correctly
      10. Screenshot: .sisyphus/evidence/task-14-integration.png
    Expected Result: Complete workflow functional
    Evidence: Screenshot saved

  **Commit**: YES (if fixes needed)
  - Message: `test(admin): add integration tests for scraper studio`
  - Files: `__tests__/admin/scraper-studio/integration.test.tsx`

- [x] **15. Legacy Route Deprecation** ✓ COMPLETED

  **What to do:**
  - Add redirects from `/admin/scrapers/lab` to `/admin/scrapers/studio`
  - Add redirects from `/admin/scrapers/test-lab` to `/admin/scrapers/studio`
  - Add deprecation notices
  - Update sidebar navigation
  - Remove legacy route links from admin

  **Must NOT do:**
  - Do NOT delete legacy code yet (keep for rollback safety)
  - Do NOT break existing bookmarks (use redirects)

  **Recommended Agent Profile:**
  - **Category**: `quick`
  - **Skills**: None needed
  - **Reason**: Simple redirect setup

  **Parallelization:**
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 14
  - **Blocks**: None

  **Acceptance Criteria:**

  **Scenario: Legacy routes redirect to studio**
    Tool: Playwright
    Preconditions: Redirects configured
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/lab
      2. Assert: Redirected to /admin/scrapers/studio
      3. Navigate to: http://localhost:3000/admin/scrapers/test-lab
      4. Assert: Redirected to /admin/scrapers/studio
      5. Screenshot: .sisyphus/evidence/task-15-redirects.png
    Expected Result: Legacy routes redirect correctly
    Evidence: Screenshot saved

  **Commit**: YES
  - Message: `feat(admin): add redirects from legacy routes to studio`
  - Files: `BayStateApp/app/admin/scrapers/lab/page.tsx`, `BayStateApp/app/admin/scrapers/test-lab/page.tsx`

- [x] **16. Performance Optimization** ✓ COMPLETED

  **What to do:**
  - Optimize config list loading (pagination, virtual scrolling)
  - Optimize real-time event handling (debouncing, cleanup)
  - Optimize health metrics aggregation (caching)
  - Add loading states and skeletons
  - Implement error boundaries

  **Must NOT do:**
  - Do NOT over-optimize before measuring (profile first)

  **Recommended Agent Profile:**
  - **Category**: `unspecified-high`
  - **Skills**: None needed
  - **Reason**: Performance optimization task

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Blocked By**: Task 14
  - **Blocks**: None

  **Acceptance Criteria:**

  **Scenario: Studio loads within performance budget**
    Tool: Playwright
    Preconditions: Studio functional
    Steps:
      1. Navigate to: http://localhost:3000/admin/scrapers/studio
      2. Measure: Time to first meaningful paint
      3. Assert: < 3 seconds
      4. Measure: Config list load time
      5. Assert: < 1 second
      6. Measure: Timeline update latency
      7. Assert: < 500ms
      8. Save: Performance metrics to .sisyphus/evidence/task-16-performance.json
    Expected Result: Meets performance budgets
    Evidence: Performance metrics saved

  **Commit**: YES
  - Message: `perf(admin): optimize scraper studio performance`
  - Files: Various optimization changes

- [x] **17. Documentation** ✓ COMPLETED

  **What to do:**
  - Document new studio features
  - Update admin user guide
  - Document API endpoints
  - Document event schema v2
  - Create migration guide from legacy routes
  - Document version workflow

  **Must NOT do:**
  - Do NOT skip documentation (critical for handoff)

  **Recommended Agent Profile:**
  - **Category**: `writing`
  - **Skills**: None needed
  - **Reason**: Documentation task

  **Parallelization:**
  - **Can Run In Parallel**: YES
  - **Blocked By**: Task 15
  - **Blocks**: None

  **Acceptance Criteria:**

  **Scenario: Documentation exists for all features**
    Tool: Bash (file check)
    Preconditions: None
    Steps:
      1. Check: `ls docs/scraper-studio/README.md`
      2. Check: `ls docs/scraper-studio/api.md`
      3. Check: `ls docs/scraper-studio/version-workflow.md`
      4. Check: `ls docs/scraper-studio/migration-guide.md`
      5. Assert: All files exist
      6. Check: Files contain substantive content
      7. Save: File list to .sisyphus/evidence/task-17-docs.txt
    Expected Result: Documentation complete
    Evidence: File list saved

  **Commit**: YES
  - Message: `docs(admin): add scraper studio documentation`
  - Files: `docs/scraper-studio/*.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(db): add test_sku and health_metrics tables` | BayStateApp/supabase/migrations/*, types | SQL verification |
| 3 | `feat(admin): create scraper studio page shell` | BayStateApp/app/admin/scrapers/studio/* | Playwright screenshot |
| 4 | `feat(admin): add scraper config list` | BayStateApp/components/admin/scraper-studio/* | Playwright screenshot |
| 5 | `feat(admin): integrate config editor` | BayStateApp/components/admin/scraper-studio/* | Playwright screenshot |
| 6 | `feat(admin): add version history workflow` | BayStateApp/components/admin/scraper-studio/*, actions.ts | Playwright screenshot |
| 9 | `feat(admin): add real-time timeline` | BayStateApp/components/admin/scraper-studio/*, hooks/* | Playwright screenshot |
| 10 | `feat(admin): add test SKU management` | BayStateApp/components/admin/scraper-studio/* | Playwright screenshot |
| 11 | `feat(admin): add health dashboard` | BayStateApp/components/admin/scraper-studio/* | Playwright screenshot |
| 12 | `feat(admin): add step trace debugging` | BayStateApp/components/admin/scraper-studio/* | Playwright screenshot |
| 13 | `feat(admin): add selector validation` | BayStateApp/components/admin/scraper-studio/* | Playwright screenshot |
| 15 | `feat(admin): legacy route redirects` | BayStateApp/app/admin/scrapers/lab/*, test-lab/* | Playwright screenshot |
| 16 | `perf(admin): optimize studio performance` | Various | Performance metrics |
| 17 | `docs(admin): add studio documentation` | docs/scraper-studio/* | File check |

---

## Success Criteria

### Verification Commands
```bash
# Test API endpoints
curl -X POST http://localhost:3000/api/admin/scrapers/studio/test \
  -H "Content-Type: application/json" \
  -d '{"config_id":"test-id"}'

# Check database schema
supabase db diff

# Run integration tests
cd /Users/nickborrello/Desktop/Projects/BayState/BayStateApp && npm test -- scraper-studio

# Check legacy redirects
curl -I http://localhost:3000/admin/scrapers/lab
# Should return 308 redirect to /studio

# Verify runner events
cd BayStateScraper && python -m pytest tests/test_events.py
```

### Final Checklist
- [x] All 17 TODOs completed with passing QA
- [x] `/admin/scrapers/studio` fully functional
- [x] Legacy routes redirect to studio
- [x] Real-time timeline working
- [x] Config editing with versions working
- [x] Health dashboard showing data
- [x] Runner emitting v2 events
- [x] All tests passing
- [x] Performance within budget
- [x] Documentation complete
- [x] No human intervention required for verification

---

## Risk Mitigation

### High-Risk Items
1. **Runner performance impact** from richer events
   - Mitigation: Profile before/after, optimize event emission
   
2. **Event schema changes** breaking existing consumers
   - Mitigation: Strict backward compatibility, version negotiation
   
3. **Data migration** from legacy tables
   - Mitigation: Write migration scripts, test thoroughly
   
4. **Real-time streaming reliability**
   - Mitigation: Add retry logic, implement fallback polling

### Rollback Strategy
1. Feature flags for major changes
2. Legacy routes remain accessible (redirects can be removed)
3. Database migrations are reversible
4. Runner can be reverted to v1 events (backward compat maintained)

---

## Post-Launch

### Phase 2 Features (Future)
- Screenshot capture and storage
- Selector playground (test against live pages)
- Multi-run comparative analytics
- Cross-environment management (dev/stage/prod)
- Predictive failure analysis
- Integration with external monitoring (PagerDuty)

### Maintenance
- Monitor event throughput and performance
- Collect user feedback on UX
- Address edge cases discovered in production
- Iterate on health metrics aggregation

---

*Plan generated by Prometheus on 2026-02-12*
*Based on comprehensive analysis of BayStateApp and BayStateScraper*
