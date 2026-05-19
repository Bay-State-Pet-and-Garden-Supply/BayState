-- Migration: Create batch_jobs table for OpenAI Batch API consolidation
-- Created: 2026-02-19
-- Purpose: Track OpenAI batch jobs for AI-driven product consolidation

-- =============================================================================
-- Create batch_jobs table
-- =============================================================================

create table if not exists public.batch_jobs (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'pending',
    description text,
    auto_apply boolean default false,
    total_requests integer default 0,
    completed_requests integer default 0,
    failed_requests integer default 0,
    prompt_tokens integer default 0,
    completion_tokens integer default 0,
    total_tokens integer default 0,
    estimated_cost decimal(10, 4) default 0,
    retry_count integer default 0,
    max_retries integer default 3,
    failed_skus text[] default '{}',
    parent_batch_id uuid references public.batch_jobs(id),
    input_file_id text,
    output_file_id text,
    error_file_id text,
    metadata jsonb default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    completed_at timestamptz,
    webhook_received_at timestamptz,
    webhook_payload jsonb,
    
    -- Constraints
    constraint valid_status check (status in (
        'validating', 'in_progress', 'finalizing', 'completed', 
        'failed', 'expired', 'cancelled', 'pending'
    ))
);

-- =============================================================================
-- Indexes for performance
-- =============================================================================

create index if not exists idx_batch_jobs_status on public.batch_jobs(status);
create index if not exists idx_batch_jobs_created_at on public.batch_jobs(created_at desc);
create index if not exists idx_batch_jobs_parent_batch_id on public.batch_jobs(parent_batch_id);

-- =============================================================================
-- RLS Policies
-- =============================================================================

alter table public.batch_jobs enable row level security;

-- Allow authenticated users to read batch jobs
create policy "Allow authenticated users to read batch jobs"
    on public.batch_jobs
    for select
    to authenticated
    using (true);

-- Allow authenticated users to insert batch jobs
create policy "Allow authenticated users to insert batch jobs"
    on public.batch_jobs
    for insert
    to authenticated
    with check (true);

-- Allow authenticated users to update batch jobs
create policy "Allow authenticated users to update batch jobs"
    on public.batch_jobs
    for update
    to authenticated
    using (true);

-- =============================================================================
-- Trigger for updated_at
-- =============================================================================

create or replace function public.update_batch_jobs_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger batch_jobs_updated_at
    before update on public.batch_jobs
    for each row
    execute function public.update_batch_jobs_updated_at();

-- =============================================================================
-- Comments
-- =============================================================================

comment on table public.batch_jobs is 'Tracks OpenAI Batch API jobs for AI-driven product consolidation';
comment on column public.batch_jobs.status is 'Current status: validating, in_progress, finalizing, completed, failed, expired, cancelled, pending';
comment on column public.batch_jobs.auto_apply is 'Whether to automatically apply results without manual review';
comment on column public.batch_jobs.failed_skus is 'Array of SKUs that failed consolidation';
comment on column public.batch_jobs.parent_batch_id is 'Reference to parent batch if this is a retry';
comment on column public.batch_jobs.input_file_id is 'OpenAI file ID for the batch input';
comment on column public.batch_jobs.output_file_id is 'OpenAI file ID for the batch results';
comment on column public.batch_jobs.error_file_id is 'OpenAI file ID for error logs';
