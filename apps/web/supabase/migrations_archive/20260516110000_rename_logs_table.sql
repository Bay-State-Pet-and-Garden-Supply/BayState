-- Rename scrape_job_logs to enrichment_job_logs to align with the new architecture
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scrape_job_logs') THEN
        ALTER TABLE public.scrape_job_logs RENAME TO enrichment_job_logs;
    END IF;
END
$$;

-- Update Realtime publication if it exists
-- We check for the publication 'supabase_realtime' and add the new table name if not already present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = 'enrichment_job_logs'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_job_logs;
        END IF;
    END IF;
END
$$;
