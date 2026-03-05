-- Fix orphaned scrape jobs by creating chunks for them
-- Run this after identifying orphaned jobs with find_orphaned_jobs.sql

-- Create chunks for jobs that don't have any
INSERT INTO scrape_job_chunks (
    job_id,
    chunk_index,
    skus,
    scrapers,
    status,
    test_mode,
    max_workers
)
SELECT 
    sj.id,
    idx as chunk_index,
    sj.skus,
    ARRAY[scraper_name] as scrapers,
    'pending' as status,
    sj.test_mode,
    COALESCE(sj.max_workers, 3) as max_workers
FROM scrape_jobs sj
CROSS JOIN LATERAL unnest(sj.scrapers) WITH ORDINALITY AS t(scraper_name, idx)
LEFT JOIN scrape_job_chunks existing ON sj.id = existing.job_id
WHERE sj.status IN ('pending', 'running')
  AND existing.chunk_id IS NULL
ON CONFLICT DO NOTHING;

-- Report what was fixed
SELECT 
    'Created chunks for orphaned jobs' as action,
    COUNT(*) as chunks_created
FROM scrape_job_chunks sjc
JOIN scrape_jobs sj ON sjc.job_id = sj.id
WHERE sjc.created_at > NOW() - INTERVAL '5 minutes';
