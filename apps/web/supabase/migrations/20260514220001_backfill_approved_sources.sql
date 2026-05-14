-- Approved Source Extraction — Phase 2: Backfill + Seed
--
-- MUST run AFTER 20260514220000_add_approved_source_extraction.sql because
-- this migration references the 'awaiting_brand' enum value that was added
-- in that migration (now committed in a separate transaction).
--
--   1. Backfill products_ingestion.brand_id from consolidated JSONB
--   2. Set unbranded imported products to awaiting_brand
--   3. Seed initial brand_sources rows from brands with official_domains

-- ============================================================================
-- 1. Backfill products_ingestion.brand_id from consolidated JSONB
-- ============================================================================

-- Only cast to uuid when the value is a valid UUID string and the referenced
-- brand exists, preventing FK violations from malformed or orphaned data.
with brand_id_candidates as (
  select
    sku,
    (consolidated->>'brand_id')::uuid as candidate_brand_id
  from public.products_ingestion
  where consolidated is not null
    and consolidated->>'brand_id' is not null
    and consolidated->>'brand_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and brand_id is null  -- only touch rows that have not been set yet
)
update public.products_ingestion pi
set brand_id = bic.candidate_brand_id
from brand_id_candidates bic
where pi.sku = bic.sku
  and bic.candidate_brand_id is not null
  and exists (select 1 from public.brands b where b.id = bic.candidate_brand_id);

-- Set products without brand_id to awaiting_brand status
update public.products_ingestion
set pipeline_status = 'awaiting_brand'::public.pipeline_status_five
where brand_id is null
  and pipeline_status = 'imported'::public.pipeline_status_five;

-- ============================================================================
-- 2. Seed initial brand_sources from brands with official_domains
-- ============================================================================

insert into public.brand_sources (
  brand_id,
  source_type,
  source_slug,
  display_name,
  domains,
  asset_domains,
  crawl4ai_adapter_slug,
  requires_auth,
  credential_ref,
  search_mode,
  allowed_fields,
  priority,
  enabled
)
select
  b.id as brand_id,
  'official_brand' as source_type,
  b.slug as source_slug,
  b.name as display_name,
  coalesce(b.official_domains, '{}'::text[]) as domains,
  '{}'::text[] as asset_domains,
  'crawl4ai_direct' as crawl4ai_adapter_slug,
  false as requires_auth,
  null as credential_ref,
  'domain_search' as search_mode,
  array['title', 'description', 'images', 'ingredients', 'guaranteed_analysis', 'category']::text[] as allowed_fields,
  50 as priority,
  true as enabled
from public.brands b
where coalesce(array_length(b.official_domains, 1), 0) > 0
  and not exists (
    select 1 from public.brand_sources bs
    where bs.brand_id = b.id
      and bs.source_type = 'official_brand'
  );
