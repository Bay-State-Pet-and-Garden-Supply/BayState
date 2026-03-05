# Draft: Admin Scrape Operations & Logs View

## Requirements (Confirmed)
- **Goal**: Realtime visibility of scrape operations and logs in Admin UI.
- **Context**: App (Next.js) + Runner (Python).
- **Communication**: Runner pushes logs to API -> DB -> Realtime to UI.

## Technical Decisions
1. **Database**:
   - Create `scrape_job_logs` table (`job_id`, `message`, `level`, `timestamp`).
   - Enable RLS and Realtime on this table.
2. **API**:
   - Create `POST /api/scraper/v1/logs` endpoint.
   - Payload: `{ job_id: string, logs: LogEntry[] }` (batching supported).
3. **Runner (Python)**:
   - Create `ScraperAPIHandler` (logging.Handler) in `utils/logger.py`.
   - Inject handler in `runner.py` after client init.
   - Batch logs to avoid HTTP spam? (Maybe later, simple first).
4. **UI (Admin)**:
   - **Operations Tab** (`/admin/scraper-network`): Global view of recent logs/activity.
   - **Detail View** (`/admin/scrapers/[id]`): Filtered logs for specific scraper.
   - **Component**: `ScraperLogViewer` using Supabase Realtime (like `MigrationHistory`).

## Research Findings
- **Realtime**: Use `supabase.channel().on('postgres_changes', { table: 'scrape_logs', filter: 'job_id=eq.X' })`.
- **Python Logging**: `runner.py` initializes logging. Can inject custom handler via `logging.getLogger().addHandler()`.
- **Migration**: Need a new migration file for `scrape_job_logs`.

## Open Questions
- Log retention? -> **Assumption: 7 days** (use pg_cron or manual cleanup later).
- Security? -> **Use existing `bsr_*` API key auth for the log endpoint**.

## Scope Boundaries
- **INCLUDE**: 
  - DB Migration.
  - API Endpoint.
  - Python Logging Handler.
  - Frontend Log Viewer Component.
- **EXCLUDE**: 
  - Log search engine (Elasticsearch etc).
  - Complex log levels configuration from UI.
