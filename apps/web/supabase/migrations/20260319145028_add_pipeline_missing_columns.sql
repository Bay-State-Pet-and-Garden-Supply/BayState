-- Migration: Add missing pipeline columns to products_ingestion
-- Purpose: Add error_message, retry_count, and selected_images columns that were missing from schema
-- These columns are referenced in the TypeScript PipelineProduct type
-- Rollback: 
--   ALTER TABLE public.products_ingestion DROP COLUMN IF EXISTS selected_images;
--   ALTER TABLE public.products_ingestion DROP COLUMN IF EXISTS error_message;
--   ALTER TABLE public.products_ingestion DROP COLUMN IF EXISTS retry_count;

BEGIN;

-- Add selected_images column (JSONB to store array of SelectedImage objects)
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS selected_images jsonb DEFAULT '[]'::jsonb;

-- Add error_message column
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS error_message text;

-- Add retry_count column with default 0
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN public.products_ingestion.selected_images IS 'Array of selected images with metadata (url and selectedAt)';
COMMENT ON COLUMN public.products_ingestion.error_message IS 'Error message if processing failed';
COMMENT ON COLUMN public.products_ingestion.retry_count IS 'Number of retry attempts for processing';

COMMIT;
