-- Migration: Add unique index on scrape_results for idempotency key enforcement
-- Purpose: Ensure callback deduplication is DB-enforced, not just application-level
-- Note: Requires cleanup of any existing duplicate idempotency keys before applying

BEGIN;

-- First, clean up any existing duplicates (keep the earliest record for each key)
WITH duplicates AS (
  SELECT 
    id,
    data->>'_idempotency_key' as idempotency_key,
    ROW_NUMBER() OVER (
      PARTITION BY data->>'_idempotency_key' 
      ORDER BY created_at ASC
    ) as rn
  FROM public.scrape_results
  WHERE data->>'_idempotency_key' IS NOT NULL
)
DELETE FROM public.scrape_results
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Create unique index on idempotency key extracted from JSONB
-- This enforces uniqueness at the database level
CREATE UNIQUE INDEX IF NOT EXISTS idx_scrape_results_idempotency_key 
ON public.scrape_results((data->>'_idempotency_key')) 
WHERE data->>'_idempotency_key' IS NOT NULL;

-- Add GIN index for efficient JSONB queries on data field
CREATE INDEX IF NOT EXISTS idx_scrape_results_data_gin 
ON public.scrape_results USING GIN (data);

COMMIT;
