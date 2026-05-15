-- Actually remove url_review from pipeline_status_five enum
-- (20260514230000 was tracked as applied but failed silently due to view dependency)
-- Idempotent: checks if url_review still exists before proceeding.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'pipeline_status_five' and e.enumlabel = 'url_review'
  ) then
    raise notice 'url_review already removed from pipeline_status_five — skipping';
    return;
  end if;

  -- Drop dependent views temporarily
  drop view if exists public.products_published cascade;
  drop view if exists public.pipeline_export_queue cascade;
  drop view if exists public.pipeline_finalized_review cascade;
  drop view if exists public.pipeline_finalizing_queue cascade;

  -- Drop check constraint referencing the enum
  alter table public.products_ingestion
    drop constraint if exists products_ingestion_exported_at_requires_exporting_check;

  -- Move any remaining url_review products to imported
  update public.products_ingestion
  set pipeline_status = 'imported'
  where pipeline_status::text = 'url_review';

  -- Create new enum without url_review
  create type public.pipeline_status_five_v2 as enum (
    'awaiting_brand',
    'imported',
    'extracting',
    'processed',
    'merging',
    'reviewing',
    'publishing',
    'failed'
  );

  -- Alter column to new type
  alter table public.products_ingestion
    alter column pipeline_status drop default;

  alter table public.products_ingestion
    alter column pipeline_status type public.pipeline_status_five_v2
    using (pipeline_status::text::public.pipeline_status_five_v2);

  alter table public.products_ingestion
    alter column pipeline_status set default 'imported'::public.pipeline_status_five_v2;

  -- Drop old type and rename new one
  drop type public.pipeline_status_five;
  alter type public.pipeline_status_five_v2 rename to pipeline_status_five;

  -- Recreate views
  create or replace view public.pipeline_finalizing_queue as
    select
      pi.sku, pi.input, pi.sources, pi.consolidated, pi.pipeline_status,
      pi.created_at, pi.updated_at, pi.b2b_sources, pi.enrichment_config,
      pi.is_test_run, pi.image_candidates, pi.confidence_score,
      pi.selected_images, pi.error_message, pi.retry_count,
      pi.product_line, pi.cohort_id, pi.exported_at
    from public.products_ingestion pi
    where pi.pipeline_status = 'reviewing' and pi.exported_at is null;

  create or replace view public.pipeline_finalized_review as
    select * from public.pipeline_finalizing_queue;

  create or replace view public.pipeline_export_queue as
    select
      pi.sku, pi.input, pi.sources, pi.consolidated, pi.pipeline_status,
      pi.created_at, pi.updated_at, pi.b2b_sources, pi.enrichment_config,
      pi.is_test_run, pi.image_candidates, pi.confidence_score,
      pi.selected_images, pi.error_message, pi.retry_count,
      pi.product_line, pi.cohort_id, pi.exported_at
    from public.products_ingestion pi
    where pi.pipeline_status = 'publishing' and pi.exported_at is null;

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
      pi.created_at, pi.updated_at, pi.pipeline_status,
      b.name as brand_name, b.slug as brand_slug, b.logo_url as brand_logo_url
    from public.products_ingestion pi
    left join public.brands b on ((((pi.consolidated ->> 'brand_id'::text))::uuid = b.id))
    where pi.pipeline_status = 'publishing' and pi.exported_at is not null;

  -- Recreate check constraint
  alter table public.products_ingestion
    add constraint products_ingestion_exported_at_requires_exporting_check
    check (exported_at is null or pipeline_status = 'publishing');
end;
$$;
