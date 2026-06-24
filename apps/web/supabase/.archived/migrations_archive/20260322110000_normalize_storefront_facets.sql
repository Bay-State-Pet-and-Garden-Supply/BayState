begin;

create temp table brand_merge_candidates as
select
    id,
    first_value(id) over (
        partition by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        order by length(coalesce(slug, '')), coalesce(slug, ''), id
    ) as canonical_id,
    row_number() over (
        partition by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        order by length(coalesce(slug, '')), coalesce(slug, ''), id
    ) as duplicate_rank
from public.brands
where name is not null;

update public.products as products
set brand_id = brand_merge_candidates.canonical_id
from brand_merge_candidates
where products.brand_id = brand_merge_candidates.id
  and brand_merge_candidates.duplicate_rank > 1
  and products.brand_id <> brand_merge_candidates.canonical_id;

update public.product_groups as product_groups
set brand_id = brand_merge_candidates.canonical_id
from brand_merge_candidates
where product_groups.brand_id = brand_merge_candidates.id
  and brand_merge_candidates.duplicate_rank > 1
  and product_groups.brand_id <> brand_merge_candidates.canonical_id;

delete from public.brands as brands
using brand_merge_candidates
where brands.id = brand_merge_candidates.id
  and brand_merge_candidates.duplicate_rank > 1;

drop table brand_merge_candidates;

create temp table category_merge_candidates as
select
    id,
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as normalized_name,
    initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) as canonical_name,
    regexp_replace(
        regexp_replace(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
    ) as canonical_slug,
    first_value(id) over (
        partition by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        order by
            case when name = initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) then 0 else 1 end,
            length(coalesce(slug, '')),
            coalesce(slug, ''),
            id
    ) as canonical_id,
    row_number() over (
        partition by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        order by
            case when name = initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) then 0 else 1 end,
            length(coalesce(slug, '')),
            coalesce(slug, ''),
            id
    ) as duplicate_rank
from public.categories
where name is not null;

update public.products as products
set category_id = category_merge_candidates.canonical_id
from category_merge_candidates
where products.category_id = category_merge_candidates.id
  and category_merge_candidates.duplicate_rank > 1
  and products.category_id <> category_merge_candidates.canonical_id;

update public.product_categories as product_categories
set category_id = category_merge_candidates.canonical_id
from category_merge_candidates
where product_categories.category_id = category_merge_candidates.id
  and category_merge_candidates.duplicate_rank > 1
  and product_categories.category_id <> category_merge_candidates.canonical_id;

update public.categories as categories
set parent_id = category_merge_candidates.canonical_id
from category_merge_candidates
where categories.parent_id = category_merge_candidates.id
  and category_merge_candidates.duplicate_rank > 1
  and categories.parent_id <> category_merge_candidates.canonical_id;

delete from public.product_categories as product_categories
using public.product_categories as duplicates
where product_categories.ctid < duplicates.ctid
  and product_categories.product_id = duplicates.product_id
  and product_categories.category_id = duplicates.category_id;

delete from public.categories as categories
using category_merge_candidates
where categories.id = category_merge_candidates.id
  and category_merge_candidates.duplicate_rank > 1;

update public.categories as categories
set
    name = category_merge_candidates.canonical_name,
    slug = category_merge_candidates.canonical_slug,
    updated_at = now()
from category_merge_candidates
where categories.id = category_merge_candidates.canonical_id
  and (
      categories.name is distinct from category_merge_candidates.canonical_name
      or categories.slug is distinct from category_merge_candidates.canonical_slug
  );

drop table category_merge_candidates;

create temp table product_type_name_candidates as
select
    id,
    case lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        when 'apparrel' then 'Apparel'
        when 'beeding & litter' then 'Bedding & Litter'
        when 'vitsamins & supplements' then 'Vitamins & Supplements'
        else initcap(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))
    end as canonical_name
from public.product_types
where name is not null;

update public.product_types as product_types
set
    name = product_type_name_candidates.canonical_name,
    updated_at = now()
from product_type_name_candidates
where product_types.id = product_type_name_candidates.id
  and product_types.name is distinct from product_type_name_candidates.canonical_name;

drop table product_type_name_candidates;

create temp table product_type_duplicates as
select
    id,
    row_number() over (
        partition by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        order by id
    ) as duplicate_rank
from public.product_types;

delete from public.product_types as product_types
using product_type_duplicates
where product_types.id = product_type_duplicates.id
  and product_type_duplicates.duplicate_rank > 1;

drop table product_type_duplicates;

insert into public.product_types (name)
select distinct
    case lower(regexp_replace(btrim(token), '\s+', ' ', 'g'))
        when 'apparrel' then 'Apparel'
        when 'beeding & litter' then 'Bedding & Litter'
        when 'vitsamins & supplements' then 'Vitamins & Supplements'
        else initcap(lower(regexp_replace(btrim(token), '\s+', ' ', 'g')))
    end as canonical_name
from public.products as products,
lateral regexp_split_to_table(coalesce(products.product_type, ''), '\|') with ordinality as split_tokens(token, ordinality)
where btrim(split_tokens.token) <> ''
  and not exists (
      select 1
      from public.product_types as product_types
      where lower(regexp_replace(btrim(product_types.name), '\s+', ' ', 'g')) =
          lower(
              case lower(regexp_replace(btrim(split_tokens.token), '\s+', ' ', 'g'))
                  when 'apparrel' then 'Apparel'
                  when 'beeding & litter' then 'Bedding & Litter'
                  when 'vitsamins & supplements' then 'Vitamins & Supplements'
                  else initcap(lower(regexp_replace(btrim(split_tokens.token), '\s+', ' ', 'g')))
              end
          )
  );

create temp table product_type_lookup as
select
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) as normalized_name,
    min(name) as canonical_name
from public.product_types
group by lower(regexp_replace(btrim(name), '\s+', ' ', 'g'));

create temp table normalized_product_type_values as
with tokenized as (
    select
        products.id as product_id,
        split_tokens.ordinality,
        lower(regexp_replace(btrim(split_tokens.token), '\s+', ' ', 'g')) as normalized_name
    from public.products as products,
    lateral regexp_split_to_table(coalesce(products.product_type, ''), '\|') with ordinality as split_tokens(token, ordinality)
    where btrim(split_tokens.token) <> ''
),
canonicalized as (
    select
        tokenized.product_id,
        tokenized.ordinality,
        coalesce(
            product_type_lookup.canonical_name,
            case tokenized.normalized_name
                when 'apparrel' then 'Apparel'
                when 'beeding & litter' then 'Bedding & Litter'
                when 'vitsamins & supplements' then 'Vitamins & Supplements'
                else initcap(tokenized.normalized_name)
            end
        ) as canonical_name
    from tokenized
    left join product_type_lookup
        on product_type_lookup.normalized_name = tokenized.normalized_name
),
deduped as (
    select
        product_id,
        ordinality,
        canonical_name,
        row_number() over (
            partition by product_id, canonical_name
            order by ordinality
        ) as canonical_rank
    from canonicalized
)
select
    product_id,
    string_agg(canonical_name, '|' order by ordinality) as canonical_value
from deduped
where canonical_rank = 1
group by product_id;

update public.products as products
set product_type = normalized_product_type_values.canonical_value
from normalized_product_type_values
where products.id = normalized_product_type_values.product_id
  and products.product_type is distinct from normalized_product_type_values.canonical_value;

update public.products
set product_type = null
where product_type is not null
  and btrim(product_type) = '';

drop table normalized_product_type_values;
drop table product_type_lookup;

commit;
