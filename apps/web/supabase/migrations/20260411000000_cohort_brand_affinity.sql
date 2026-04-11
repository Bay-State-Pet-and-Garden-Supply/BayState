-- Cohort-Brand Integration & Scraper Affinity Tracking
-- Adds brand assignment to cohorts and tracks which scrapers work best for which brands.

BEGIN;

-- ============================================================================
-- 1. Add brand columns to cohort_batches
-- ============================================================================

-- FK to brands table for known catalog brands
ALTER TABLE cohort_batches
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;

-- Free-text brand name (used before brand is in catalog, or when FK isn't needed)
ALTER TABLE cohort_batches
  ADD COLUMN IF NOT EXISTS brand_name text;

CREATE INDEX IF NOT EXISTS idx_cohort_batches_brand_id ON cohort_batches(brand_id);
CREATE INDEX IF NOT EXISTS idx_cohort_batches_brand_name ON cohort_batches(brand_name);

COMMENT ON COLUMN cohort_batches.brand_id IS 'Optional FK to brands table for known catalog brands';
COMMENT ON COLUMN cohort_batches.brand_name IS 'Free-text brand name for scraping context (used when brand_id is not yet in catalog)';

-- ============================================================================
-- 2. Brand-Scraper Affinity table
-- ============================================================================
-- Tracks historical success rates of scrapers for specific brands.
-- Populated automatically from scrape job callbacks.

CREATE TABLE IF NOT EXISTS brand_scraper_affinity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The brand name (normalized lowercase for matching)
    brand_name text NOT NULL,
    -- The scraper slug (matches scraper_configs.slug)
    scraper_slug text NOT NULL,
    -- Counters
    total_attempts integer DEFAULT 0,
    successful_extractions integer DEFAULT 0,
    -- Derived hit rate (maintained by app code)
    hit_rate numeric(5,4) DEFAULT 0.0,
    -- Quality signals
    avg_fields_extracted numeric(5,2) DEFAULT 0.0,
    avg_images_found numeric(5,2) DEFAULT 0.0,
    -- Timestamps
    last_success_at timestamptz,
    last_attempt_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    -- One row per brand+scraper combination
    UNIQUE (brand_name, scraper_slug)
);

-- Fast lookups by brand
CREATE INDEX IF NOT EXISTS idx_brand_scraper_affinity_brand
  ON brand_scraper_affinity(brand_name);
-- Ranked recommendations by hit rate
CREATE INDEX IF NOT EXISTS idx_brand_scraper_affinity_hit_rate
  ON brand_scraper_affinity(hit_rate DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_brand_scraper_affinity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_brand_scraper_affinity_updated_at ON brand_scraper_affinity;
CREATE TRIGGER update_brand_scraper_affinity_updated_at
    BEFORE UPDATE ON brand_scraper_affinity
    FOR EACH ROW EXECUTE FUNCTION update_brand_scraper_affinity_updated_at();

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================

ALTER TABLE brand_scraper_affinity ENABLE ROW LEVEL SECURITY;

-- Public read access (needed for recommendation engine)
CREATE POLICY "Public read brand scraper affinity"
  ON brand_scraper_affinity FOR SELECT
  USING (true);

-- Only admin/staff can modify
CREATE POLICY "Admin manage brand scraper affinity"
  ON brand_scraper_affinity FOR ALL
  USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- ============================================================================
-- 4. Comments
-- ============================================================================

COMMENT ON TABLE brand_scraper_affinity IS
  'Tracks which scrapers historically produce results for which brands, enabling automatic scraper recommendation for cohort processing';
COMMENT ON COLUMN brand_scraper_affinity.brand_name IS 'Normalized lowercase brand name for matching';
COMMENT ON COLUMN brand_scraper_affinity.scraper_slug IS 'Scraper identifier matching scraper_configs.slug';
COMMENT ON COLUMN brand_scraper_affinity.hit_rate IS 'Ratio of successful_extractions / total_attempts (0.0 to 1.0)';
COMMENT ON COLUMN brand_scraper_affinity.avg_fields_extracted IS 'Average number of non-null fields returned per successful extraction';
COMMENT ON COLUMN brand_scraper_affinity.avg_images_found IS 'Average number of images found per successful extraction';

COMMIT;
