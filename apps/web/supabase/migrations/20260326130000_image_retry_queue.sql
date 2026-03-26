-- Image Retry Queue Schema
-- Purpose: Queue for retrying failed image capture attempts with automatic retry logic

BEGIN;

-- ============================================================================
-- 1. Error Type Enum
-- ============================================================================

CREATE TYPE image_error_type AS ENUM (
    'auth_401',
    'not_found_404',
    'network_timeout',
    'cors_blocked',
    'unknown'
);

COMMENT ON TYPE image_error_type IS 'Types of errors that can occur during image capture';

-- ============================================================================
-- 2. Status Enum
-- ============================================================================

CREATE TYPE image_retry_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);

COMMENT ON TYPE image_retry_status IS 'Processing status of image retry queue entries';

-- ============================================================================
-- 3. Image Retry Queue Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS image_retry_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid REFERENCES products_ingestion(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    error_type image_error_type NOT NULL DEFAULT 'unknown',
    retry_count integer NOT NULL DEFAULT 0,
    max_retries integer NOT NULL DEFAULT 3,
    status image_retry_status NOT NULL DEFAULT 'pending',
    scheduled_for timestamptz NOT NULL DEFAULT now(),
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_status ON image_retry_queue(status);
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_error_type ON image_retry_queue(error_type);
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_scheduled ON image_retry_queue(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_product ON image_retry_queue(product_id);

-- Composite index for processing query
CREATE INDEX IF NOT EXISTS idx_image_retry_queue_processing 
    ON image_retry_queue(status, scheduled_for, retry_count, max_retries)
    WHERE status IN ('pending', 'processing');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_image_retry_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_image_retry_queue_updated_at ON image_retry_queue;
CREATE TRIGGER update_image_retry_queue_updated_at
    BEFORE UPDATE ON image_retry_queue
    FOR EACH ROW EXECUTE FUNCTION update_image_retry_queue_updated_at();

-- Comments
COMMENT ON TABLE image_retry_queue IS 'Queue for retrying failed image capture attempts with automatic retry logic';
COMMENT ON COLUMN image_retry_queue.product_id IS 'Reference to the product in products_ingestion table';
COMMENT ON COLUMN image_retry_queue.image_url IS 'URL of the image that failed to capture';
COMMENT ON COLUMN image_retry_queue.error_type IS 'Type of error encountered during capture attempt';
COMMENT ON COLUMN image_retry_queue.retry_count IS 'Number of retry attempts made so far';
COMMENT ON COLUMN image_retry_queue.max_retries IS 'Maximum number of retry attempts allowed before marking as failed';
COMMENT ON COLUMN image_retry_queue.status IS 'Current processing status';
COMMENT ON COLUMN image_retry_queue.scheduled_for IS 'Timestamp when this entry should be processed next';
COMMENT ON COLUMN image_retry_queue.last_error IS 'Last error message received';

-- ============================================================================
-- 4. RLS Policies
-- ============================================================================

ALTER TABLE image_retry_queue ENABLE ROW LEVEL SECURITY;

-- Admin/Staff can view all
CREATE POLICY "Admin view image retry queue" ON image_retry_queue FOR SELECT
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- Admin/Staff can manage retry queue
CREATE POLICY "Admin manage image retry queue" ON image_retry_queue FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- Service role can insert and update entries
CREATE POLICY "Service role insert image retry queue" ON image_retry_queue FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service role update image retry queue" ON image_retry_queue FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- 5. Helper Function: Get pending image retries for processing
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pending_image_retries(p_limit integer DEFAULT 10)
RETURNS TABLE (
    retry_id uuid,
    product_id uuid,
    image_url text,
    error_type image_error_type,
    retry_count integer,
    max_retries integer
) AS $$
    SELECT
        irq.id,
        irq.product_id,
        irq.image_url,
        irq.error_type,
        irq.retry_count,
        irq.max_retries
    FROM image_retry_queue irq
    WHERE irq.status = 'pending'
    AND irq.scheduled_for <= NOW()
    AND irq.retry_count < irq.max_retries
    ORDER BY irq.scheduled_for ASC, irq.retry_count ASC
    LIMIT p_limit;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_pending_image_retries IS 'Returns pending image retries ready for processing, ordered by scheduled time';

-- ============================================================================
-- 6. Helper Function: Get retry history for a product
-- ============================================================================

CREATE OR REPLACE FUNCTION get_product_image_retry_history(p_product_id uuid)
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
    WHERE irq.product_id = p_product_id
    ORDER BY irq.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_product_image_retry_history IS 'Returns all image retry attempts for a specific product';

COMMIT;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON INDEX idx_image_retry_queue_status IS 'Fast lookup of retries by status';
COMMENT ON INDEX idx_image_retry_queue_scheduled IS 'Fast lookup of retries by scheduled time';
COMMENT ON INDEX idx_image_retry_queue_product IS 'Fast lookup of retries by product';
