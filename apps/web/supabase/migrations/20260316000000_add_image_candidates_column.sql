-- Migration: Add image_candidates column to products_ingestion
-- Purpose: Store potential product images extracted from various sources for user selection

BEGIN;

-- Add image_candidates column as text array if it doesn't exist
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS image_candidates text[] DEFAULT '{}'::text[];

-- Create an index for efficiently finding products with image candidates
CREATE INDEX IF NOT EXISTS idx_products_ingestion_image_candidates 
ON public.products_ingestion USING gin (image_candidates);

-- Add comment for documentation
COMMENT ON COLUMN public.products_ingestion.image_candidates IS 
'List of image URLs extracted from scrapers/sources, available for manual selection.';

COMMIT;
