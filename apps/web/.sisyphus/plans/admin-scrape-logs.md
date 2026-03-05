# Plan: Admin Scrape Operations & Logs View

## Context

### Original Request
The user wants to view running scrape operations and their logs in the Admin UI (`BayStateApp`). Currently, there is no visibility into runner execution logs on the frontend.

### Interview Summary
**Key Discussions**:
- **Architecture**: The system uses a Coordinator (Next.js) + Runner (Python) model with polling.
- **Log Transport**: We will implement a "Push" model for logs where Runners send logs to a new API endpoint.
- **Realtime**: We will use Supabase Realtime to stream these logs to the Admin UI, mirroring the `MigrationHistory` pattern.

**Research Findings**:
- **Database**: `scrape_jobs` exists. We need a new `scrape_job_logs` table.
- **Python**: `runner.py` allows injecting custom logging handlers.
- **UI**: `MigrationHistory` provides a verified pattern for realtime log streaming.
- **API**: No current log endpoint; needs `POST /api/scraper/v1/logs`.

### Metis Review
**Identified Gaps** (addressed in plan):
- **Log Volume**: Added batching requirement for Python runner to prevent API flooding.
- **Security**: Endpoint will require valid `x-api-key` matching the job's runner.
- **Retention**: Plan assumes "permanent" storage for MVP; cleanup policy deferred.

---

## Work Objectives

### Core Objective
Enable real-time visibility of scraper execution logs in the Admin Dashboard.

### Concrete Deliverables
1.  **Database**: New `scrape_job_logs` table with Realtime enabled.
2.  **API**: New `POST /api/scraper/v1/logs` endpoint in Next.js.
3.  **Runner**: Custom `ScraperAPIHandler` in Python to push logs.
4.  **UI**: New `ScraperLogViewer` component and integration into `/admin/scraper-network`.

### Definition of Done
- [x] Runners successfully push logs to the API during execution.
- [x] Logs appear in `scrape_job_logs` table.
- [x] Admin UI updates in real-time as logs come in.
- [x] Logs are associated with the correct `job_id`.

### Must Have
- **Batching**: Python runner must batch logs (e.g., every 1s or 50 lines) to avoid HTTP overhead.
- **Realtime**: UI must auto-scroll or update without page refresh.
- **Correlation**: Logs must link to specific Job IDs.

### Must NOT Have (Guardrails)
- **No Complex Search**: Basic filtering only.
- **No Log Levels Config**: Hardcode to capture INFO/ERROR for now.

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Jest/RTL for App, Pytest for Runner).
- **User wants tests**: YES (Standard TDD).

### TDD Strategy

**1. App (Next.js)**:
- **Test File**: `BayStateApp/__tests__/api/logs.test.ts`
- **Command**: `npm test`
- **Scenario**: Verify `POST /api/scraper/v1/logs` accepts valid payloads and rejects invalid auth.

**2. Runner (Python)**:
- **Test File**: `BayStateScraper/tests/unit/test_logging.py`
- **Command**: `pytest`
- **Scenario**: Verify `ScraperAPIHandler` buffers logs and calls `api_client.post_logs`.

**3. Manual Verification**:
- **End-to-End**: Run a scrape job, watch logs appear in Admin UI.

---

## Task Flow

```
1. Database Migration → 2. API Endpoint → 3. Python Handler → 4. Frontend UI
                                    ↘ 5. Integration Test
```

---

## TODOs

- [x] 1. Create `scrape_job_logs` database migration
  - **What to do**:
    - Create SQL migration `BayStateApp/supabase/migrations/YYYYMMDDHHMMSS_create_scrape_logs.sql`.
    - Define table: `id`, `job_id` (FK), `level` (text), `message` (text), `created_at` (timestamptz).
    - Enable RLS (read-only for anon, write for service_role/authenticated).
    - Enable Realtime: `alter publication supabase_realtime add table scrape_job_logs;`
  - **Reference**: `BayStateApp/supabase/migrations/20260101003000_create_scraping_tables.sql` (FK reference).
  - **Acceptance Criteria**:
    - [x] `supabase db push` succeeds.
    - [x] Table exists with Realtime enabled.

- [x] 2. Implement Log Ingestion API (TDD)
  - **What to do**:
    - **RED**: Create `BayStateApp/__tests__/api/logs.test.ts`. Test valid payload returns 200, invalid key returns 401.
    - **GREEN**: Create `BayStateApp/app/api/scraper/v1/logs/route.ts`.
      - Validate `x-api-key`.
      - Validate payload: `{ job_id: string, logs: Array<{ level: string, message: string, timestamp: string }> }`.
      - Bulk insert into `scrape_job_logs`.
    - **REFACTOR**: Move validation logic to `BayStateApp/lib/scraper-auth.ts` if not already shared.
  - **Reference**: `BayStateApp/app/api/scraper/v1/chunk-callback/route.ts` (Auth pattern).
  - **Acceptance Criteria**:
    - [x] `npm test` passes.
    - [x] `curl` with valid key inserts rows.

- [x] 3. Create Python API Log Handler (TDD)
  - **What to do**:
    - **RED**: Create `BayStateScraper/tests/unit/test_logging.py`. Mock `ScraperAPIClient` and verify `ScraperAPIHandler.emit` calls it.
    - **GREEN**: 
      - Modify `BayStateScraper/core/api_client.py`: Add `post_logs(job_id, logs)` method.
      - Create `BayStateScraper/utils/api_handler.py`: `class ScraperAPIHandler(logging.Handler)`. Implement buffering (flush every 20 logs or 2s).
      - Modify `BayStateScraper/runner.py`: Inject handler after client init.
  - **Reference**: `BayStateScraper/utils/logger.py` (Base logging).
  - **Acceptance Criteria**:
    - [x] `pytest` passes.
    - [x] Running a local scraper sends requests to API.

- [x] 4. Implement Frontend Log Viewer
  - **What to do**:
    - Create `BayStateApp/components/admin/scraping/log-viewer.tsx`.
    - Use `supabase.channel` to listen to `INSERT` on `scrape_job_logs` filtered by `job_id`.
    - Render logs in a scrollable `pre/code` block or list.
    - Add "Auto-scroll" toggle.
  - **Reference**: `BayStateApp/components/admin/migration/migration-history.tsx` (Realtime pattern).
  - **Acceptance Criteria**:
    - [x] Component renders logs.
    - [x] New inserts appear automatically.

- [x] 5. Integrate into Admin Dashboard
  - **What to do**:
    - Update `BayStateApp/app/admin/scraper-network/page.tsx` to include "Operations" tab.
    - Update `BayStateApp/app/admin/scrapers/[id]/page.tsx` to include "Execution Logs" tab.
    - Embed `LogViewer` in these locations.
  - **Reference**: `BayStateApp/components/admin/sidebar.tsx` (Navigation).
  - **Acceptance Criteria**:
    - [x] Navigate to `/admin/scraper-network`, see live operations.
    - [x] Navigate to scraper detail, see historical/live logs.

---

## Success Criteria

### Verification Commands
```bash
# 1. Start App
cd BayStateApp && npm run dev

# 2. Start Runner (Local Test)
cd BayStateScraper && python -m scraper_backend.runner --job-id [TEST-ID]

# 3. Trigger Log
# (Runner should output logs, UI should update)
```

### Final Checklist
- [x] `scrape_job_logs` table exists
- [x] API accepts logs
- [x] Runner sends logs
- [x] UI displays logs in real-time
