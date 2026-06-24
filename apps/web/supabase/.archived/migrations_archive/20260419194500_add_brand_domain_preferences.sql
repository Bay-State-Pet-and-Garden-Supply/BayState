alter table public.brands
add column if not exists official_domains text[] not null default array[]::text[];

alter table public.brands
add column if not exists preferred_domains text[] not null default array[]::text[];

comment on column public.brands.official_domains is 'Canonical official domains used to seed AI Search toward manufacturer sites.';
comment on column public.brands.preferred_domains is 'Additional preferred domains used when official manufacturer domains are unavailable or insufficient.';
