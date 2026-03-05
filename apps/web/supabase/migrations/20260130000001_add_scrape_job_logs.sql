-- Migration: Add scrape_job_logs table for runner log ingestion
-- Run this in Supabase SQL Editor

-- Create the scrape_job_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS scrape_job_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Index for efficient querying by job
  CONSTRAINT valid_level CHECK (level IN ('debug', 'info', 'warning', 'error', 'critical'))
);

-- Create index for fast lookups by job_id
CREATE INDEX IF NOT EXISTS idx_scrape_job_logs_job_id ON scrape_job_logs(job_id);

-- Create index for time-based queries
CREATE INDEX IF NOT EXISTS idx_scrape_job_logs_created_at ON scrape_job_logs(created_at DESC);

-- Add comments
COMMENT ON TABLE scrape_job_logs IS 'Stores structured logs from scraper runners for debugging and audit';
COMMENT ON COLUMN scrape_job_logs.job_id IS 'Reference to the scrape_job this log belongs to';
COMMENT ON COLUMN scrape_job_logs.level IS 'Log level: debug, info, warning, error, critical';
COMMENT ON COLUMN scrape_job_logs.message IS 'The log message content';
COMMENT ON COLUMN scrape_job_logs.created_at IS 'When the log entry was created';
