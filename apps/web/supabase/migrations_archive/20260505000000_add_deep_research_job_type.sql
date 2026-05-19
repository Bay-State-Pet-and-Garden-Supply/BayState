-- Add deep_research as a valid scrape_jobs type.

ALTER TABLE public.scrape_jobs
DROP CONSTRAINT IF EXISTS scrape_jobs_type_check;

ALTER TABLE public.scrape_jobs
ADD CONSTRAINT scrape_jobs_type_check
CHECK (
  type IN (
    'standard',
    'ai_search',
    'official_brand_url_discovery',
    'official_brand_extraction',
    'deep_research'
  )
);
