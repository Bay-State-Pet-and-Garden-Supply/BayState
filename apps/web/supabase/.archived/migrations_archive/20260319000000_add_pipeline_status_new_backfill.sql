-- Re-add pipeline_status_new column that was rolled back in 20260314120001
-- but is still referenced by 20260319120000_pipeline_five_stage.sql
ALTER TABLE public.products_ingestion 
ADD COLUMN IF NOT EXISTS pipeline_status_new text;
