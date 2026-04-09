-- Add cohort tracking to scrape_jobs
-- This allows the system to track which jobs are processing cohorts vs individual SKUs

BEGIN;

-- 1. Add cohort_id foreign key (references cohort_batches)
ALTER TABLE scrape_jobs 
ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohort_batches(id) ON DELETE SET NULL;

-- 2. Add is_cohort_batch flag to identify cohort processing jobs
ALTER TABLE scrape_jobs 
ADD COLUMN IF NOT EXISTS is_cohort_batch boolean DEFAULT false;

-- 3. Add cohort_status for tracking cohort processing state
ALTER TABLE scrape_jobs 
ADD COLUMN IF NOT EXISTS cohort_status text DEFAULT 'pending';

-- 4. Create indexes for efficient cohort queries
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_cohort_id ON scrape_jobs(cohort_id);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_is_cohort_batch ON scrape_jobs(is_cohort_batch) WHERE is_cohort_batch = true;
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_cohort_status ON scrape_jobs(cohort_status) WHERE cohort_status IS NOT NULL;

-- 5. Add check constraint for valid cohort_status values
ALTER TABLE scrape_jobs 
ADD CONSTRAINT chk_scrape_jobs_cohort_status 
CHECK (cohort_status IN ('pending', 'claiming', 'processing', 'completed', 'failed'));

-- 6. Add comments for documentation
COMMENT ON COLUMN scrape_jobs.cohort_id IS 'Reference to cohort_batches if this job processes a cohort instead of individual SKUs';
COMMENT ON COLUMN scrape_jobs.is_cohort_batch IS 'True if this job processes a cohort batch rather than individual SKU scrapes';
COMMENT ON COLUMN scrape_jobs.cohort_status IS 'Status of cohort processing: pending, claiming, processing, completed, failed';

COMMIT;