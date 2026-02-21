-- Find scrape jobs that are stuck because they have no chunks
-- These are likely from the retryScraperRun bug before the fix

WITH jobs_without_chunks AS (
    SELECT 
        sj.id,
        sj.status,
        sj.scrapers,
        sj.created_at,
        sj.test_mode,
        COUNT(sjc.chunk_id) as chunk_count
    FROM scrape_jobs sj
    LEFT JOIN scrape_job_chunks sjc ON sj.id = sjc.job_id
    WHERE sj.status IN ('pending', 'running')
    GROUP BY sj.id, sj.status, sj.scrapers, sj.created_at, sj.test_mode
    HAVING COUNT(sjc.chunk_id) = 0
)
SELECT 
    id,
    status,
    scrapers,
    created_at,
    test_mode,
    'Orphaned job - no chunks' as issue
FROM jobs_without_chunks
ORDER BY created_at DESC;

-- Alternative: Find ALL jobs without chunks (including completed/failed)
-- This helps identify the scope of the issue

SELECT 
    sj.id,
    sj.status,
    sj.scrapers,
    sj.created_at,
    sj.completed_at,
    sj.error_message,
    COUNT(sjc.chunk_id) as chunk_count
FROM scrape_jobs sj
LEFT JOIN scrape_job_chunks sjc ON sj.id = sjc.job_id
GROUP BY sj.id, sj.status, sj.scrapers, sj.created_at, sj.completed_at, sj.error_message
HAVING COUNT(sjc.chunk_id) = 0
ORDER BY sj.created_at DESC
LIMIT 50;
