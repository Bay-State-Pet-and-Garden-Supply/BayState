-- Migrate pipeline_status_five to simplified 8-status vocabulary
--
-- Maps old 11-status workflow to new 8-status workflow:
--   imported    → imported
--   searching   → url_review
--   url_review  → url_review
--   extracting  → extracting
--   scraping    → extracting
--   needs_fallback_review → url_review
--   scraped     → processed
--   consolidating → merging
--   finalizing  → reviewing
--   exporting   → publishing
--   failed      → failed
--
-- Handles dependent views and check constraints by dropping them before the
-- ALTER COLUMN TYPE and recreating them with updated status values afterward.
-- Idempotent: skips if pipeline_status_five already has the simplified vocabulary.

do $$
begin
  -- Check if migration already applied: the simplified enum includes 'reviewing'
  -- which does not exist in the old 11-status vocabulary.
  if exists (
    select 1
    from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'pipeline_status_five'
      and e.enumlabel = 'reviewing'
  ) then
    raise notice 'pipeline_status_five already contains "reviewing" — migration already applied, skipping';
    return;
  end if;

  -- ------------------------------------------------------------------
  -- PHASE 1: Drop dependent objects
  -- ------------------------------------------------------------------

  -- Drop views that reference the pipeline_status column or type
  drop view if exists public.products_published cascade;
  drop view if exists public.pipeline_export_queue cascade;
  drop view if exists public.pipeline_finalized_review cascade;
  drop view if exists public.pipeline_finalizing_queue cascade;

  -- Drop check constraints that reference the old enum type
  do $inner$
  declare
    constraint_record record;
  begin
    for constraint_record in (
      select conname
      from pg_constraint
      where conrelid = 'public.products_ingestion'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) like '%pipeline_status%'
        and conname like '%exported_at%'
    ) loop
      execute format(
        'alter table public.products_ingestion drop constraint if exists %I',
        constraint_record.conname
      );
    end loop;
  end $inner$;

  -- ------------------------------------------------------------------
  -- PHASE 2: Migrate the enum and column type
  -- ------------------------------------------------------------------

  -- Drop default temporarily while we change the type
  alter table public.products_ingestion
    alter column pipeline_status drop default;

  -- Create new enum type with the 8 simplified statuses
  create type public.pipeline_status_six as enum (
    'imported',
    'url_review',
    'extracting',
    'processed',
    'merging',
    'reviewing',
    'publishing',
    'failed'
  );

  -- Alter the column to the new type, mapping old values to new
  alter table public.products_ingestion
    alter column pipeline_status type public.pipeline_status_six
    using (
      case pipeline_status::text
        when 'imported'                    then 'imported'::public.pipeline_status_six
        when 'searching'                   then 'url_review'::public.pipeline_status_six
        when 'url_review'                  then 'url_review'::public.pipeline_status_six
        when 'extracting'                  then 'extracting'::public.pipeline_status_six
        when 'scraping'                    then 'extracting'::public.pipeline_status_six
        when 'needs_fallback_review'       then 'url_review'::public.pipeline_status_six
        when 'scraped'                     then 'processed'::public.pipeline_status_six
        when 'consolidating'               then 'merging'::public.pipeline_status_six
        when 'finalizing'                  then 'reviewing'::public.pipeline_status_six
        when 'exporting'                   then 'publishing'::public.pipeline_status_six
        when 'failed'                      then 'failed'::public.pipeline_status_six
        else 'failed'::public.pipeline_status_six
      end
    );

  -- Restore default
  alter table public.products_ingestion
    alter column pipeline_status set default 'imported'::public.pipeline_status_six;

  -- Drop any remaining old check constraints on pipeline_status
  do $inner$
  declare
    constraint_name text;
  begin
    for constraint_name in
      select conname
      from pg_constraint
      where conrelid = 'public.products_ingestion'::regclass
        and conname like '%pipeline_status%check%'
    loop
      execute format('alter table public.products_ingestion drop constraint if exists %I', constraint_name);
    end loop;
  end $inner$;

  -- Rename old enum to legacy for reference (keeps backward compat)
  alter type public.pipeline_status_five rename to pipeline_status_five_legacy;

  -- Rename new enum to the canonical name so existing RPCs and code still work
  alter type public.pipeline_status_six rename to pipeline_status_five;

  -- ------------------------------------------------------------------
  -- PHASE 3: Recreate dependent objects with updated status values
  --    finalizing → reviewing
  --    exporting  → publishing
  -- ------------------------------------------------------------------

  create or replace view public.pipeline_finalizing_queue as
    select
      pi.sku,
      pi.input,
      pi.sources,
      pi.consolidated,
      pi.pipeline_status,
      pi.created_at,
      pi.updated_at,
      pi.b2b_sources,
      pi.enrichment_config,
      pi.is_test_run,
      pi.image_candidates,
      pi.confidence_score,
      pi.selected_images,
      pi.error_message,
      pi.retry_count,
      pi.product_line,
      pi.cohort_id,
      pi.exported_at
    from public.products_ingestion pi
    where pi.pipeline_status = 'reviewing'
      and pi.exported_at is null;

  create or replace view public.pipeline_finalized_review as
    select
      sku,
      input,
      sources,
      consolidated,
      pipeline_status,
      created_at,
      updated_at,
      b2b_sources,
      enrichment_config,
      is_test_run,
      image_candidates,
      confidence_score,
      selected_images,
      error_message,
      retry_count,
      product_line,
      cohort_id,
      exported_at
    from public.pipeline_finalizing_queue;

  create or replace view public.pipeline_export_queue as
    select
      pi.sku,
      pi.input,
      pi.sources,
      pi.consolidated,
      pi.pipeline_status,
      pi.created_at,
      pi.updated_at,
      pi.b2b_sources,
      pi.enrichment_config,
      pi.is_test_run,
      pi.image_candidates,
      pi.confidence_score,
      pi.selected_images,
      pi.error_message,
      pi.retry_count,
      pi.product_line,
      pi.cohort_id,
      pi.exported_at
    from public.products_ingestion pi
    where pi.pipeline_status = 'publishing'
      and pi.exported_at is null;

  create or replace view public.products_published as
    select
      pi.sku as id,
      coalesce((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text)) as name,
      lower(regexp_replace(coalesce((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text), pi.sku), '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) as slug,
      coalesce((pi.consolidated ->> 'description'::text), ''::text) as description,
      coalesce(((pi.consolidated ->> 'price'::text))::numeric, ((pi.input ->> 'price'::text))::numeric, (0)::numeric) as price,
      coalesce((pi.consolidated -> 'images'::text), '[]'::jsonb) as images,
      coalesce((pi.consolidated ->> 'stock_status'::text), 'in_stock'::text) as stock_status,
      ((pi.consolidated ->> 'brand_id'::text))::uuid as brand_id,
      coalesce(((pi.consolidated ->> 'is_featured'::text))::boolean, false) as is_featured,
      pi.created_at,
      pi.updated_at,
      pi.pipeline_status,
      b.name as brand_name,
      b.slug as brand_slug,
      b.logo_url as brand_logo_url
    from public.products_ingestion pi
    left join public.brands b on ((((pi.consolidated ->> 'brand_id'::text))::uuid = b.id))
    where pi.pipeline_status = 'publishing'
      and pi.exported_at is not null;

  -- Recreate exported_at check constraint with the new status value
  alter table public.products_ingestion
    add constraint products_ingestion_exported_at_requires_exporting_check
    check (exported_at is null or pipeline_status = 'publishing');

end;
$$;
