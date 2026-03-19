-- Migration: Add confidence_score column to products_ingestion
-- Purpose: Store AI consolidation confidence score (0-1) for pipeline products
-- Rollback: ALTER TABLE public.products_ingestion DROP COLUMN IF EXISTS confidence_score;

BEGIN;

-- Add confidence_score column to products_ingestion
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS confidence_score numeric;

-- Add check constraint to ensure confidence_score is between 0 and 1 (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'products_ingestion_confidence_score_check'
    ) THEN
        ALTER TABLE public.products_ingestion 
        ADD CONSTRAINT products_ingestion_confidence_score_check 
        CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));
    END IF;
END $$;

-- Add index for efficient filtering by confidence score
CREATE INDEX IF NOT EXISTS idx_products_ingestion_confidence_score 
ON public.products_ingestion(confidence_score);

-- Add comment describing the column
COMMENT ON COLUMN public.products_ingestion.confidence_score IS 'AI consolidation confidence score (0-1) indicating data quality after AI processing';

COMMIT;
