-- Simplify Pipeline Enrichment
--
-- Phase 1: Create new tables for the simplified enrichment pipeline.
-- No destructive changes — old tables remain until Phase 7/8.
--
-- New tables:
--   enrichment_targets   — URL targets for enrichment (replaces official_brand_url_candidates)
--   enrichment_jobs      — job-level tracking for enrichment runs
--   enrichment_attempts  — per-SKU enrichment attempt tracking

-- =============================================================================
-- enrichment_targets
-- =============================================================================

create table if not exists public.enrichment_targets (
  id uuid primary key default gen_random_uuid(),
  sku text not null references public.products_ingestion(sku) on delete cascade,
  url text not null,
  domain text,
  status text not null default 'candidate'
    check (status in ('candidate', 'selected', 'rejected', 'processed', 'failed')),
  selected boolean not null default false,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  source text not null default 'manual'
    check (source in ('manual', 'import', 'suggested', 'existing', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku, url)
);

create index if not exists enrichment_targets_sku_idx
  on public.enrichment_targets (sku);
create index if not exists enrichment_targets_selected_idx
  on public.enrichment_targets (sku, selected)
  where selected = true;
create index if not exists enrichment_targets_status_idx
  on public.enrichment_targets (status);
create index if not exists enrichment_targets_domain_idx
  on public.enrichment_targets (domain);

alter table public.enrichment_targets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Staff can manage enrichment targets' and tablename = 'enrichment_targets'
  ) then
    create policy "Staff can manage enrichment targets"
      on public.enrichment_targets
      for all
      using (public.is_staff())
      with check (public.is_staff());
  end if;
end $$;

-- =============================================================================
-- enrichment_jobs
-- =============================================================================

create table if not exists public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  skus text[] not null default '{}',
  total_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  model text,
  mode text not null default 'mixed'
    check (mode in ('structured', 'metadata', 'llm', 'mixed')),
  config jsonb not null default '{}',
  token_usage jsonb not null default '{}',
  cost_estimate numeric,
  error_message text,
  created_by uuid references auth.users(id),
  claimed_by text,
  lease_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enrichment_jobs_status_idx
  on public.enrichment_jobs (status, created_at);

alter table public.enrichment_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Staff can manage enrichment jobs' and tablename = 'enrichment_jobs'
  ) then
    create policy "Staff can manage enrichment jobs"
      on public.enrichment_jobs
      for all
      using (public.is_staff())
      with check (public.is_staff());
  end if;
end $$;

-- =============================================================================
-- enrichment_attempts
-- =============================================================================

create table if not exists public.enrichment_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.enrichment_jobs(id) on delete cascade,
  sku text not null references public.products_ingestion(sku) on delete cascade,
  target_id uuid references public.enrichment_targets(id) on delete set null,
  attempt_number integer not null default 1,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'partial', 'failed', 'cancelled')),
  mode text not null default 'mixed'
    check (mode in ('structured', 'metadata', 'llm', 'mixed')),
  model text,
  claimed_by text,
  lease_token uuid,
  lease_expires_at timestamptz,
  source_url text,
  result jsonb,
  normalized_source jsonb,
  confidence_overall numeric check (confidence_overall is null or (confidence_overall >= 0 and confidence_overall <= 1)),
  field_confidence jsonb not null default '{}',
  validation jsonb not null default '{}',
  retry_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, sku, attempt_number)
);

create index if not exists enrichment_attempts_job_idx
  on public.enrichment_attempts (job_id);
create index if not exists enrichment_attempts_sku_idx
  on public.enrichment_attempts (sku);
create index if not exists enrichment_attempts_status_idx
  on public.enrichment_attempts (status, created_at);

alter table public.enrichment_attempts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Staff can manage enrichment attempts' and tablename = 'enrichment_attempts'
  ) then
    create policy "Staff can manage enrichment attempts"
      on public.enrichment_attempts
      for all
      using (public.is_staff())
      with check (public.is_staff());
  end if;
end $$;

-- =============================================================================
-- Helper: update updated_at on row change
-- =============================================================================

create or replace function public.update_enrichment_tables_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'enrichment_targets_updated_at'
  ) then
    create trigger enrichment_targets_updated_at
      before update on public.enrichment_targets
      for each row
      execute function public.update_enrichment_tables_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'enrichment_jobs_updated_at'
  ) then
    create trigger enrichment_jobs_updated_at
      before update on public.enrichment_jobs
      for each row
      execute function public.update_enrichment_tables_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'enrichment_attempts_updated_at'
  ) then
    create trigger enrichment_attempts_updated_at
      before update on public.enrichment_attempts
      for each row
      execute function public.update_enrichment_tables_updated_at();
  end if;
end $$;
