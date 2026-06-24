-- Migrate existing official_brand_extraction jobs to direct_url_extraction
UPDATE public.scrape_jobs
SET type = 'direct_url_extraction'
WHERE type = 'official_brand_extraction';

-- Update CHECK constraint to accept direct_url_extraction and remove official_brand_extraction
ALTER TABLE public.scrape_jobs DROP CONSTRAINT IF EXISTS scrape_jobs_type_check;

ALTER TABLE public.scrape_jobs
ADD CONSTRAINT scrape_jobs_type_check
CHECK (
    type IN (
        'standard',
        'ai_search',
        'official_brand_url_discovery',
        'direct_url_extraction',
        'deep_research'
    )
);
