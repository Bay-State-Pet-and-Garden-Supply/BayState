-- Rename scrape_job_logs to enrichment_job_logs to align with the new architecture
ALTER TABLE public.scrape_job_logs RENAME TO enrichment_job_logs;

-- Update Realtime publication if it exists
-- We check for the publication 'supabase_realtime' and add the new table name
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_job_logs;
    END IF;
END
$$;
