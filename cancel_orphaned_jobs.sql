-- Alternative: Cancel orphaned jobs instead of fixing them
-- Use this if you want to start fresh and avoid processing old retries

UPDATE scrape_jobs
SET 
    status = 'cancelled',
    error_message = 'Cancelled: Job was created without chunks (retry bug)',
    completed_at = NOW()
WHERE id IN (
    SELECT sj.id
    FROM scrape_jobs sj
    LEFT JOIN scrape_job_chunks sjc ON sj.id = sjc.job_id
    WHERE sj.status IN ('pending', 'running')
    GROUP BY sj.id
    HAVING COUNT(sjc.chunk_id) = 0
);

-- Report what was cancelled
SELECT 
    'Cancelled orphaned jobs' as action,
    COUNT(*) as jobs_cancelled
FROM scrape_jobs
WHERE error_message = 'Cancelled: Job was created without chunks (retry bug)'
  AND completed_at > NOW() - INTERVAL '5 minutes';
