-- Migration: Fix image_retry_queue schema to use sku instead of product_id
-- Purpose: products_ingestion uses sku as primary key, not id
-- This migration changes the foreign key relationship to reference sku

BEGIN;

-- ============================================================================
-- 1. Drop existing foreign key constraint and indexes
-- ============================================================================

ALTER TABLE image_retry_queue 
    DROP CONSTRAINT IF EXISTS image_retry_queue_product_id_fkey;

DROP INDEX IF EXISTS idx_image_retry_queue_product;

-- ============================================================================
-- 2. Change product_id column to sku
-- ============================================================================

-- First, handle any existing data by converting product_id values to sku
-- Note: If there are existing rows with UUIDs that don't map to SKUs,
-- they will need manual cleanup or migration before this can succeed

-- Rename the column
ALTER TABLE image_retry_queue 
    RENAME COLUMN product_id TO sku;

-- Change column type from uuid to text to match products_ingestion.sku
ALTER TABLE image_retry_queue 
    ALTER COLUMN sku TYPE text USING sku::text;

-- Add the foreign key constraint referencing products_ingestion(sku)
ALTER TABLE image_retry_queue 
    ADD CONSTRAINT image_retry_queue_sku_fkey 
    FOREIGN KEY (sku) REFERENCES products_ingestion(sku) ON DELETE CASCADE;

-- ============================================================================
-- 3. Recreate indexes
-- ============================================================================

CREATE INDEX idx_image_retry_queue_sku ON image_retry_queue(sku);

-- Update composite index comment
COMMENT ON INDEX idx_image_retry_queue_sku IS 'Fast lookup of retries by SKU';

-- ============================================================================
-- 4. Update helper functions
-- ============================================================================

-- Update get_pending_image_retries to return last_error and use sku
DROP FUNCTION IF EXISTS get_pending_image_retries(integer);

CREATE OR REPLACE FUNCTION get_pending_image_retries(p_limit integer DEFAULT 10)
RETURNS TABLE (
    retry_id uuid,
    sku text,
    image_url text,
    error_type image_error_type,
    retry_count integer,
    max_retries integer,
    last_error text
) AS $$
    SELECT
        irq.id,
        irq.sku,
        irq.image_url,
        irq.error_type,
        irq.retry_count,
        irq.max_retries,
        irq.last_error
    FROM image_retry_queue irq
    WHERE irq.status = 'pending'
    AND irq.scheduled_for <= NOW()
    AND irq.retry_count < irq.max_retries
    ORDER BY irq.scheduled_for ASC, irq.retry_count ASC
    LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_pending_image_retries IS 'Returns pending image retries ready for processing, ordered by scheduled time';

-- Update get_product_image_retry_history to use sku
DROP FUNCTION IF EXISTS get_product_image_retry_history(uuid);

CREATE OR REPLACE FUNCTION get_product_image_retry_history(p_sku text)
RETURNS TABLE (
    retry_id uuid,
    image_url text,
    error_type image_error_type,
    retry_count integer,
    status image_retry_status,
    created_at timestamptz,
    updated_at timestamptz
) AS $$
    SELECT
        irq.id,
        irq.image_url,
        irq.error_type,
        irq.retry_count,
        irq.status,
        irq.created_at,
        irq.updated_at
    FROM image_retry_queue irq
    WHERE irq.sku = p_sku
    ORDER BY irq.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_product_image_retry_history IS 'Returns all image retry attempts for a specific product by SKU';

-- ============================================================================
-- 5. Update column comment
-- ============================================================================

COMMENT ON COLUMN image_retry_queue.sku IS 'Reference to the product SKU in products_ingestion table';

COMMIT;
