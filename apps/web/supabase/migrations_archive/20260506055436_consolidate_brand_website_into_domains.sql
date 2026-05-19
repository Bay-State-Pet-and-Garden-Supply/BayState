-- Consolidate brand website_url into official_domains.
--
-- `website_url` and `official_domains` were two sources of truth for the same
-- official manufacturer domain signal. This migration folds legacy
-- `website_url` values into `official_domains`, normalizes all official domain
-- entries, deduplicates them, then drops the redundant columns.

create or replace function pg_temp.normalize_brand_domain(value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(trim(coalesce(value, ''))),
            '^[a-z][a-z0-9+.-]*://',
            '',
            'i'
          ),
          '^www\.',
          '',
          'i'
        ),
        '[/?#].*$',
        ''
      ),
      ':\d+$',
      ''
    ),
    ''
  );
$$;

with raw_domain_candidates as (
  select
    brands.id,
    brands.website_url as candidate,
    0::bigint as sort_order
  from public.brands
  where trim(coalesce(brands.website_url, '')) <> ''

  union all

  select
    brands.id,
    domain_entry.value as candidate,
    domain_entry.ordinality::bigint as sort_order
  from public.brands
  cross join lateral unnest(coalesce(brands.official_domains, array[]::text[]))
    with ordinality as domain_entry(value, ordinality)
),
normalized_domains as (
  select
    raw_domain_candidates.id,
    pg_temp.normalize_brand_domain(raw_domain_candidates.candidate) as domain,
    min(raw_domain_candidates.sort_order) as sort_order
  from raw_domain_candidates
  group by raw_domain_candidates.id, pg_temp.normalize_brand_domain(raw_domain_candidates.candidate)
),
deduped_domains as (
  select
    normalized_domains.id,
    normalized_domains.domain,
    normalized_domains.sort_order
  from normalized_domains
  where normalized_domains.domain is not null
),
aggregated_domains as (
  select
    deduped_domains.id,
    array_agg(deduped_domains.domain order by deduped_domains.sort_order, deduped_domains.domain) as official_domains
  from deduped_domains
  group by deduped_domains.id
)
update public.brands
set official_domains = aggregated_domains.official_domains
from aggregated_domains
where brands.id = aggregated_domains.id
  and brands.official_domains is distinct from aggregated_domains.official_domains;

alter table public.brands drop column if exists website_url;
alter table public.brands drop column if exists aliases;
