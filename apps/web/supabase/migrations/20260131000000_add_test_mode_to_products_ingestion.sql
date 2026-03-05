-- Migration: Add test_mode column to products_ingestion for test run tracking
-- Purpose: Track which products were scraped in test mode for visibility and safety

-- Add test_mode column to products_ingestion if it doesn't exist
ALTER TABLE public.products_ingestion ADD COLUMN IF NOT EXISTS is_test_run boolean DEFAULT false;

-- Add comment describing the column
COMMENT ON COLUMN public.products_ingestion.is_test_run IS 'True if the product data came from a test scrape job. These products should not flow through the normal pipeline.';

-- Create index for filtering test products
CREATE INDEX IF NOT EXISTS idx_products_ingestion_is_test_run ON public.products_ingestion(is_test_run) WHERE is_test_run = true;

-- Optional: Create a function to safely upsert products from scrape jobs
-- This ensures test_mode is properly set when inserting products
CREATE OR REPLACE FUNCTION public.insert_or_update_product_from_scrape(
    p_sku text,
    p_sources jsonb,
    p_is_test boolean,
    p_pipeline_status text DEFAULT 'scraped'
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.products_ingestion (sku, sources, is_test_run, pipeline_status, updated_at)
    VALUES (p_sku, p_sources, p_is_test, p_pipeline_status, NOW())
    ON CONFLICT (sku) DO UPDATE SET
        sources = EXCLUDED.sources,
        is_test_run = EXCLUDED.is_test_run,
        pipeline_status = EXCLUDED.pipeline_status,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.insert_or_update_product_from_scrape IS 'Safely insert or update a product from scrape results, preserving test_mode tracking.';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.insert_or_update_product_from_scrape(text, jsonb, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_or_update_product_from_scrape(text, jsonb, boolean, text) TO authenticated;
