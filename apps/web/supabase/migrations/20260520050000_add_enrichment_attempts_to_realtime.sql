-- Ensure both enrichment_jobs and enrichment_attempts tables are in the realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'enrichment_jobs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_jobs;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'enrichment_attempts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.enrichment_attempts;
    END IF;
  END IF;
END $$;
