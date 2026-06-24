-- Add RPC functions for the enrichment pipeline
-- These support the claim-enrichment and enrichment-callback routes.

-- =============================================================================
-- RPC: claim_next_pending_enrichment_attempt
-- Atomically claims the next pending enrichment attempt for a runner.
-- =============================================================================

create or replace function public.claim_next_pending_enrichment_attempt(
  p_runner_name text,
  p_claim_duration_minutes int default 10
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_attempt_id uuid;
  v_job_id uuid;
  v_sku text;
  v_target_id uuid;
  v_attempt_number int;
  v_mode text;
  v_model text;
  v_source_url text;
  v_lease_token uuid;
  v_lease_expires_at timestamptz;
  v_result jsonb;
begin
  -- Find the next pending attempt, preferring entries with target URLs
  select
    ea.id, ea.job_id, ea.sku, ea.target_id, ea.attempt_number,
    ea.mode, ea.model, ea.source_url
  into
    v_attempt_id, v_job_id, v_sku, v_target_id, v_attempt_number,
    v_mode, v_model, v_source_url
  from public.enrichment_attempts ea
  where ea.status = 'queued'
    and (
      ea.lease_token is null
      or ea.lease_expires_at < now()
    )
  order by
    case when ea.source_url is not null then 0 else 1 end,
    ea.created_at asc
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  -- Generate lease token
  v_lease_token := gen_random_uuid();
  v_lease_expires_at := now() + (p_claim_duration_minutes || ' minutes')::interval;

  -- If no source_url, try to get it from the target
  if v_source_url is null and v_target_id is not null then
    select url into v_source_url
    from public.enrichment_targets
    where id = v_target_id;
  end if;

  -- Update the attempt
  update public.enrichment_attempts
  set
    status = 'running',
    claimed_by = p_runner_name,
    lease_token = v_lease_token,
    lease_expires_at = v_lease_expires_at,
    started_at = now(),
    updated_at = now()
  where id = v_attempt_id;

  -- Update the parent job status
  update public.enrichment_jobs
  set
    status = case when status = 'queued' then 'running' else status end,
    updated_at = now()
  where id = v_job_id;

  -- Build result
  v_result := jsonb_build_object(
    'id', v_attempt_id,
    'job_id', v_job_id,
    'sku', v_sku,
    'target_id', v_target_id,
    'attempt_number', v_attempt_number,
    'mode', v_mode,
    'model', v_model,
    'source_url', v_source_url,
    'lease_token', v_lease_token,
    'lease_expires_at', v_lease_expires_at::text
  );

  return v_result;
end;
$$;

-- =============================================================================
-- RPC: merge_enrichment_attempt_result
-- Merges an enrichment result into products_ingestion.sources and handles
-- status transitions. Called by the enrichment-callback route.
-- =============================================================================

create or replace function public.merge_enrichment_attempt_result(
  p_sku text,
  p_job_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_confidence numeric,
  p_source_url text,
  p_source_data jsonb
)
returns void
language plpgsql
security definer
as $$
declare
  v_current_status text;
  v_sources jsonb;
  v_new_status text;
begin
  -- Get current product status
  select pipeline_status, coalesce(sources, '{}'::jsonb)
  into v_current_status, v_sources
  from public.products_ingestion
  where sku = p_sku
  for update;

  if not found then
    raise warning 'Product SKU % not found in products_ingestion', p_sku;
    return;
  end if;

  -- Merge the enrichment result into sources.enriched
  v_sources := jsonb_set(
    coalesce(v_sources, '{}'::jsonb),
    '{enriched}',
    p_source_data,
    true
  );

  -- Determine next status based on result
  if p_status = 'success' then
    v_new_status := 'processed';
  elsif p_status = 'partial' and p_confidence >= 0.7 then
    v_new_status := 'processed';
  else
    -- Failed or low confidence - return to url_review for retry
    v_new_status := 'url_review';
  end if;

  -- Update the product
  update public.products_ingestion
  set
    sources = v_sources,
    pipeline_status = v_new_status::text::public.pipeline_status_five,
    updated_at = now()
  where sku = p_sku;
end;
$$;

-- =============================================================================
-- RPC: update_enrichment_job_counters
-- Recalculates and updates job-level completion/failed counters.
-- =============================================================================

create or replace function public.update_enrichment_job_counters(
  p_job_id uuid
)
returns void
language plpgsql
security definer
as $$
declare
  v_total int;
  v_completed int;
  v_failed int;
  v_status text;
begin
  select
    count(*),
    count(*) filter (where status in ('success', 'partial', 'failed')),
    count(*) filter (where status = 'failed')
  into v_total, v_completed, v_failed
  from public.enrichment_attempts
  where job_id = p_job_id;

  -- Determine job status
  if v_completed >= v_total then
    if v_failed > 0 then
      v_status := 'completed_with_errors';
    else
      v_status := 'completed';
    end if;
  else
    v_status := 'running';
  end if;

  update public.enrichment_jobs
  set
    total_count = v_total,
    completed_count = v_completed,
    failed_count = v_failed,
    status = v_status,
    completed_at = case when v_completed >= v_total then now() else completed_at end,
    updated_at = now()
  where id = p_job_id;
end;
$$;
