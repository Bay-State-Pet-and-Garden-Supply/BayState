-- Add needs_fallback_review to pipeline_status_five for static-first fallback workflow
ALTER TYPE pipeline_status_five ADD VALUE IF NOT EXISTS 'needs_fallback_review';

-- Add scrape_quality JSONB column to store per-SKU quality evaluation results
ALTER TABLE products_ingestion 
  ADD COLUMN IF NOT EXISTS scrape_quality jsonb DEFAULT '{}'::jsonb;

-- Add fallback_metadata JSONB column to store fallback approval/source metadata
ALTER TABLE products_ingestion 
  ADD COLUMN IF NOT EXISTS fallback_metadata jsonb DEFAULT '{}'::jsonb;

-- Note: The enum value needs_fallback_review is added in the ALTER TYPE above.
-- PostgreSQL's ALTER TYPE ... ADD VALUE cannot reference the new value
-- in index predicates within the same transaction. A follow-up migration
-- will add the partial index after this migration commits.
--
-- Partial index for scrape_quality queries (only when populated beyond default)
CREATE INDEX IF NOT EXISTS idx_products_ingestion_scrape_quality 
  ON products_ingestion ((scrape_quality IS NOT NULL)) 
  WHERE scrape_quality != '{}'::jsonb;
