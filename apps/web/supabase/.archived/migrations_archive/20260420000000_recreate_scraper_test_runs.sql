-- Recreate scraper_test_runs after it was dropped by 20260307000000
-- but is still referenced by 20260420120000_test_assertion_results.sql
CREATE TABLE IF NOT EXISTS public.scraper_test_runs (
    id uuid primary key default gen_random_uuid(),
    scraper_id uuid,
    test_type text not null default 'manual' check (test_type in ('manual', 'scheduled', 'health_check', 'validation')),
    skus_tested text[] not null default '{}',
    results jsonb not null default '[]'::jsonb,
    status text not null default 'pending' check (status in ('pending', 'running', 'passed', 'failed', 'partial', 'cancelled')),
    started_at timestamptz default now(),
    completed_at timestamptz,
    duration_ms int,
    runner_name text,
    error_message text,
    created_at timestamptz not null default now(),
    triggered_by uuid references auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_test_runs_scraper ON scraper_test_runs(scraper_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON scraper_test_runs(status);
CREATE INDEX IF NOT EXISTS idx_test_runs_created ON scraper_test_runs(created_at desc);
