-- Migration: Add scrape_jobs table to supabase_realtime publication
-- Purpose: Enable real-time subscription to scrape_jobs table changes
-- Fixes: Job subscription channel error in useJobSubscription hook

-- Add scrape_jobs table to the supabase_realtime publication
-- This allows postgres_changes subscriptions to receive INSERT, UPDATE, DELETE events
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_jobs;

-- Also add scrape_results for completeness (if needed for future realtime features)
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_results;

-- Verify the tables are now in the publication
SELECT
    schemaname,
    tablename,
    pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND schemaname = 'public'
ORDER BY tablename;
