-- Ensure enrichment_job_logs table is in the realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'enrichment_job_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_job_logs;
    END IF;
  END IF;
END $$;
