-- Add cohort_id column to products_ingestion for cohort-based processing
ALTER TABLE products_ingestion 
ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES cohort_batches(id) ON DELETE SET NULL;

-- Create index for efficient querying by cohort_id
CREATE INDEX IF NOT EXISTS idx_products_ingestion_cohort_id 
ON products_ingestion(cohort_id);

-- Add comment for documentation
COMMENT ON COLUMN products_ingestion.cohort_id IS 'References the cohort batch this product is currently associated with in the pipeline';
