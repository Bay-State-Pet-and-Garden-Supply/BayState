-- Cohort Metadata Schema
-- Tracks cohort processing batches and their product members for distributed scraping

BEGIN;

-- ============================================================================
-- 1. Cohort Batches (processing jobs for product line scraping)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cohort_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- UPC prefix for this cohort (e.g., '012345', '098765')
    upc_prefix text NOT NULL,
    -- Product line name for reference
    product_line text,
    -- Batch status
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    -- Scraper configuration used for this batch
    scraper_config text,
    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    -- Flexible metadata for additional batch info
    metadata jsonb DEFAULT '{}'::jsonb
);

-- Index for status lookups (pending batches to process)
CREATE INDEX IF NOT EXISTS idx_cohort_batches_status ON cohort_batches(status);
-- Index for UPC prefix filtering
CREATE INDEX IF NOT EXISTS idx_cohort_batches_upc_prefix ON cohort_batches(upc_prefix);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cohort_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_cohort_batches_updated_at ON cohort_batches;
CREATE TRIGGER update_cohort_batches_updated_at
    BEFORE UPDATE ON cohort_batches
    FOR EACH ROW EXECUTE FUNCTION update_cohort_batches_updated_at();

-- ============================================================================
-- 2. Cohort Members (junction table linking products to cohorts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS cohort_members (
    cohort_id uuid REFERENCES cohort_batches(id) ON DELETE CASCADE NOT NULL,
    -- Product SKU within the cohort
    product_sku text NOT NULL,
    -- UPC prefix for the product (denormalized for easier querying)
    upc_prefix text NOT NULL,
    -- Sort order for processing sequence
    sort_order integer DEFAULT 0,
    -- Timestamp
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (cohort_id, product_sku)
);

-- Index for SKU lookups
CREATE INDEX IF NOT EXISTS idx_cohort_members_sku ON cohort_members(product_sku);
-- Index for UPC prefix filtering
CREATE INDEX IF NOT EXISTS idx_cohort_members_upc_prefix ON cohort_members(upc_prefix);
-- Index for cohort + sort_order ordering
CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort_order ON cohort_members(cohort_id, sort_order);

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================

ALTER TABLE cohort_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_members ENABLE ROW LEVEL SECURITY;

-- Public read access to cohort data (needed for scraper callbacks)
CREATE POLICY "Public read cohort batches" ON cohort_batches FOR SELECT
    USING (true);

CREATE POLICY "Public read cohort members" ON cohort_members FOR SELECT
    USING (true);

-- Only admin/staff can modify
CREATE POLICY "Admin manage cohort batches" ON cohort_batches FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Admin manage cohort members" ON cohort_members FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- ============================================================================
-- 4. Comments for documentation
-- ============================================================================

COMMENT ON TABLE cohort_batches IS 'Tracks cohort processing batches for distributed product line scraping';
COMMENT ON TABLE cohort_members IS 'Links products to their cohort batches for processing';
COMMENT ON COLUMN cohort_batches.upc_prefix IS 'UPC prefix that identifies products in this cohort (e.g., first 6 digits of UPC)';
COMMENT ON COLUMN cohort_batches.status IS 'Current status: pending, processing, completed, or failed';
COMMENT ON COLUMN cohort_batches.scraper_config IS 'JSON or reference to scraper configuration used for this batch';
COMMENT ON COLUMN cohort_members.product_sku IS 'Product SKU (Stock Keeping Unit) within the cohort';
COMMENT ON COLUMN cohort_members.sort_order IS 'Processing order within the cohort';

COMMIT;
