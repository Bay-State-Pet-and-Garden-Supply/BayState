-- Approved Source Extraction — Phase 1: Schema + Enum
--
-- Adds the database foundation for the Approved Source Extraction workflow:
--   1. brand_sources table — configures approved extraction entrypoints per brand
--   2. products_ingestion.brand_id — durable per-product brand foreign key
--   3. awaiting_brand enum value — status for unbranded products blocking extraction
--
-- Backfill and seed are in a separate migration (20260514220001) because
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that
-- also references the new value.

-- ============================================================================
-- 1. brand_sources table
-- ============================================================================

create table if not exists public.brand_sources (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  source_type   text not null check (source_type in ('official_brand', 'distributor', 'internal', 'licensed_feed')),
  source_slug   text not null,
  display_name  text not null,
  domains       text[] not null default '{}'::text[],
  asset_domains text[] not null default '{}'::text[],
  crawl4ai_adapter_slug text not null,
  requires_auth boolean not null default false,
  credential_ref text,
  search_mode   text not null check (search_mode in ('sku_search', 'domain_search', 'direct_url', 'feed_lookup')),
  allowed_fields text[] not null default '{}'::text[],
  priority      integer not null default 100,
  enabled       boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A brand may have at most one source per (source_type, source_slug) combination
create unique index if not exists idx_brand_sources_unique
  on public.brand_sources (brand_id, source_type, source_slug);

-- Index for building source plans (enabled + priority ordering)
create index if not exists idx_brand_sources_lookup
  on public.brand_sources (brand_id, enabled, priority);

-- GIN indexes for domain matching
create index if not exists idx_brand_sources_domains
  on public.brand_sources using gin (domains);

create index if not exists idx_brand_sources_asset_domains
  on public.brand_sources using gin (asset_domains);

-- Trigger to auto-update updated_at
create or replace function public.update_brand_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger trigger_brand_sources_updated_at
  before update on public.brand_sources
  for each row
  execute function public.update_brand_sources_updated_at();

-- ============================================================================
-- 2. Add brand_id to products_ingestion
-- ============================================================================

alter table public.products_ingestion
  add column if not exists brand_id uuid references public.brands(id);

create index if not exists idx_products_ingestion_brand_id
  on public.products_ingestion (brand_id);

-- ============================================================================
-- 3. Add awaiting_brand to pipeline_status_five enum
-- ============================================================================

-- This runs in its own migration (no subsequent references to the new value)
-- because ALTER TYPE ... ADD VALUE cannot be used in the same transaction
-- that references the new value.
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.pipeline_status_five'::regtype
      and enumlabel = 'awaiting_brand'
  ) then
    alter type public.pipeline_status_five add value 'awaiting_brand';
  end if;
end $$;
