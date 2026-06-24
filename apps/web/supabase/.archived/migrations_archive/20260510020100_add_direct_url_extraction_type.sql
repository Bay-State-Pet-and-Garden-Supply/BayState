-- Add direct_url_extraction to the allowed scrape_jobs types
-- (before app code starts inserting it)

ALTER TABLE public.scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_type_check;

ALTER TABLE public.scrape_jobs
ADD CONSTRAINT scrape_jobs_type_check
CHECK (
    type IN (
        'standard',
        'ai_search',
        'official_brand_url_discovery',
        'official_brand_extraction',
        'direct_url_extraction',
        'deep_research'
    )
);
