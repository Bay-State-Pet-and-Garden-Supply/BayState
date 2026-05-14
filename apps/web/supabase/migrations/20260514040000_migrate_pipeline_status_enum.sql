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
-- This migration is safe to run only after the application code has been
-- deployed with the new status constants. Running it before code deployment
-- will cause old code to see unexpected status values.

begin;

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

-- Drop any old check constraints on pipeline_status
do $$
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
end $$;

-- Rename old enum to legacy for reference (keeps dependent views/backward compat)
alter type public.pipeline_status_five rename to pipeline_status_five_legacy;

-- Rename new enum to the canonical name so existing RPCs and code still work
alter type public.pipeline_status_six rename to pipeline_status_five;

commit;
