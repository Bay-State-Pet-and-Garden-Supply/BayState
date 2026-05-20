-- Fix enrichment job counters RPC to calculate counts based on the latest attempt per SKU.
-- This prevents completed/failed counts from exceeding the total number of SKUs when retries occur.

CREATE OR REPLACE FUNCTION public.update_enrichment_job_counters(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
declare
  v_total int;
  v_completed int;
  v_failed int;
  v_status text;
begin
  with latest_attempts as (
    select distinct on (sku) sku, status, attempt_number
    from public.enrichment_attempts
    where job_id = p_job_id
    order by sku, attempt_number desc
  )
  select
    count(*),
    count(*) filter (where status in ('success', 'partial', 'failed')),
    count(*) filter (where status = 'failed')
  into v_total, v_completed, v_failed
  from latest_attempts;

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
