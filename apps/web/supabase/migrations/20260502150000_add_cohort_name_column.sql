BEGIN;

-- Add name column to cohort_batches if it doesn't exist
ALTER TABLE cohort_batches
  ADD COLUMN IF NOT EXISTS name text;

-- Index for name lookups
CREATE INDEX IF NOT EXISTS idx_cohort_batches_name ON cohort_batches(name);

-- Backfill existing rows with a sensible default
UPDATE cohort_batches
SET name = COALESCE(product_line, upc_prefix)
WHERE name IS NULL;

COMMENT ON COLUMN cohort_batches.name IS 'Human-readable cohort name (typically the UPC prefix)';

COMMIT;
