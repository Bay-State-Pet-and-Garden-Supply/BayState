-- Migration: Scraper Configuration Management Tables
-- Tables for storing scraper configs, test runs, and LLM-suggested selectors

-- Store scraper configurations (YAML configs as JSON)
create table if not exists scrapers (
    id uuid primary key default gen_random_uuid(),
    name text unique not null,
    display_name text,
    base_url text not null,
    config jsonb not null default '{}'::jsonb,
    status text not null default 'draft' 
        check (status in ('draft', 'active', 'disabled', 'archived')),
    health_status text default 'unknown'
        check (health_status in ('healthy', 'degraded', 'broken', 'unknown')),
    health_score int default 0 check (health_score >= 0 and health_score <= 100),
    last_test_at timestamptz,
    last_test_result jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users(id)
);

create index if not exists idx_scrapers_status on scrapers(status);
create index if not exists idx_scrapers_health on scrapers(health_status);
create index if not exists idx_scrapers_name on scrapers(name);

-- Test run history for scraper validation
create table if not exists scraper_test_runs (
    id uuid primary key default gen_random_uuid(),
    scraper_id uuid not null references scrapers(id) on delete cascade,
    test_type text not null check (test_type in ('manual', 'scheduled', 'health_check', 'validation')),
    skus_tested text[] not null default '{}',
    results jsonb not null default '[]'::jsonb,
    status text not null default 'pending'
        check (status in ('pending', 'running', 'passed', 'failed', 'partial', 'cancelled')),
    started_at timestamptz default now(),
    completed_at timestamptz,
    duration_ms int,
    runner_name text,
    error_message text,
    created_at timestamptz not null default now(),
    triggered_by uuid references auth.users(id)
);

create index if not exists idx_test_runs_scraper on scraper_test_runs(scraper_id);
create index if not exists idx_test_runs_status on scraper_test_runs(status);
create index if not exists idx_test_runs_created on scraper_test_runs(created_at desc);

-- LLM-suggested selectors for review and learning
create table if not exists selector_suggestions (
    id uuid primary key default gen_random_uuid(),
    scraper_id uuid references scrapers(id) on delete set null,
    target_url text not null,
    target_description text not null,
    suggested_selector text not null,
    selector_type text not null check (selector_type in ('css', 'xpath')),
    alternatives jsonb default '[]'::jsonb,
    confidence float check (confidence >= 0 and confidence <= 1),
    llm_model text,
    llm_prompt text,
    page_snapshot_url text,
    verified boolean default false,
    verified_by uuid references auth.users(id),
    verified_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_selector_suggestions_scraper on selector_suggestions(scraper_id);
create index if not exists idx_selector_suggestions_verified on selector_suggestions(verified);

-- Enable RLS on all tables
alter table scrapers enable row level security;
alter table scraper_test_runs enable row level security;
alter table selector_suggestions enable row level security;

-- Policies for scrapers table
create policy "Authenticated users can read scrapers"
    on scrapers for select to authenticated using (true);
create policy "Service role can manage scrapers"
    on scrapers for all to service_role using (true) with check (true);

-- Policies for test runs
create policy "Authenticated users can read test runs"
    on scraper_test_runs for select to authenticated using (true);
create policy "Service role can manage test runs"
    on scraper_test_runs for all to service_role using (true) with check (true);

-- Policies for selector suggestions
create policy "Authenticated users can read suggestions"
    on selector_suggestions for select to authenticated using (true);
create policy "Service role can manage suggestions"
    on selector_suggestions for all to service_role using (true) with check (true);

-- Trigger function for updated_at
create or replace function update_scrapers_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger scrapers_updated_at_trigger
    before update on scrapers
    for each row execute function update_scrapers_updated_at();

-- Function to calculate health status from test results
create or replace function calculate_scraper_health(p_scraper_id uuid)
returns table (
    health_status text,
    health_score int
) language plpgsql as $$
declare
    latest_run record;
    test_passed int := 0;
    test_total int := 0;
    fake_passed int := 0;
    fake_total int := 0;
    score int := 0;
    status text := 'unknown';
begin
    select * into latest_run
    from scraper_test_runs
    where scraper_id = p_scraper_id
      and status in ('passed', 'failed', 'partial')
    order by created_at desc
    limit 1;
    
    if latest_run is null then
        return query select 'unknown'::text, 0;
        return;
    end if;
    
    select 
        count(*) filter (where (r->>'sku_type') = 'test' and (r->>'status') = 'success'),
        count(*) filter (where (r->>'sku_type') = 'test'),
        count(*) filter (where (r->>'sku_type') = 'fake' and (r->>'status') = 'no_results'),
        count(*) filter (where (r->>'sku_type') = 'fake')
    into test_passed, test_total, fake_passed, fake_total
    from jsonb_array_elements(latest_run.results) r;
    
    if test_total > 0 then
        score := score + ((test_passed::float / test_total::float) * 70)::int;
    end if;
    
    if fake_total > 0 then
        score := score + ((fake_passed::float / fake_total::float) * 30)::int;
    else
        score := score + 30;
    end if;
    
    if score >= 90 then
        status := 'healthy';
    elsif score >= 60 then
        status := 'degraded';
    else
        status := 'broken';
    end if;
    
    return query select status, score;
end;
$$;

grant execute on function calculate_scraper_health(uuid) to service_role;
grant execute on function calculate_scraper_health(uuid) to authenticated;

comment on table scrapers is 'Scraper configurations stored as JSON (converted from YAML). Managed via admin panel.';
comment on table scraper_test_runs is 'History of scraper test executions with per-SKU results.';
comment on table selector_suggestions is 'LLM-generated selector suggestions for review and improvement.';
comment on column scrapers.config is 'Full scraper configuration as JSON. Includes selectors, workflows, validation, anti_detection settings.';
comment on column scrapers.health_score is 'Calculated health score 0-100 based on test/fake SKU pass rates.';
