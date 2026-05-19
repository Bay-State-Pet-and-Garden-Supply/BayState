-- Product Lines Table
-- Manages product line definitions for cohort-based processing

BEGIN;

-- ============================================================================
-- 1. Product Lines Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Product line name (e.g., "Premium Dog Food", "Cat Litter")
    name text NOT NULL,
    -- UPC prefix for this product line (e.g., '012345')
    upc_prefix text UNIQUE NOT NULL,
    -- Optional description
    description text,
    -- Status: active or inactive
    status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    -- Denormalized product count for performance
    product_count integer DEFAULT 0,
    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_product_lines_status ON product_lines(status);
CREATE INDEX IF NOT EXISTS idx_product_lines_upc_prefix ON product_lines(upc_prefix);
CREATE INDEX IF NOT EXISTS idx_product_lines_name ON product_lines(name);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_product_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_product_lines_updated_at ON product_lines;
CREATE TRIGGER update_product_lines_updated_at
    BEFORE UPDATE ON product_lines
    FOR EACH ROW EXECUTE FUNCTION update_product_lines_updated_at();

-- ============================================================================
-- 2. RLS Policies
-- ============================================================================

ALTER TABLE product_lines ENABLE ROW LEVEL SECURITY;

-- Public read access (needed for scraper callbacks and storefront)
CREATE POLICY "Public read product lines" ON product_lines FOR SELECT
    USING (true);

-- Only admin/staff can modify
CREATE POLICY "Admin manage product lines" ON product_lines FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- ============================================================================
-- 3. Comments for documentation
-- ============================================================================

COMMENT ON TABLE product_lines IS 'Manages product line definitions for cohort-based processing';
COMMENT ON COLUMN product_lines.name IS 'Human-readable product line name';
COMMENT ON COLUMN product_lines.upc_prefix IS 'UPC prefix (typically first 6 digits) that identifies products in this line';
COMMENT ON COLUMN product_lines.status IS 'Product line status: active or inactive';
COMMENT ON COLUMN product_lines.product_count IS 'Denormalized count of products in this line (updated by trigger or job)';

COMMIT;