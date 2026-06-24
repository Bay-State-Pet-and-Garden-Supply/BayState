-- Add id column to products_ingestion for FK references
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_ingestion_id 
ON public.products_ingestion(id);
