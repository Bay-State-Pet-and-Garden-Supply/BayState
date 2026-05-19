-- Add selected_images JSONB column to products_ingestion table
-- Stores user's manual image selection from image_candidates
-- Max 10 images can be selected, stored as array of {url: string, selectedAt: string}

BEGIN;

-- Add selected_images column as JSONB with default empty array
ALTER TABLE products_ingestion 
ADD COLUMN IF NOT EXISTS selected_images jsonb DEFAULT '[]'::jsonb;

-- Add index for efficient queries on selected_images
CREATE INDEX IF NOT EXISTS idx_products_ingestion_selected_images 
ON products_ingestion USING gin (selected_images jsonb_path_ops);

-- Add comment for documentation
COMMENT ON COLUMN products_ingestion.selected_images IS 
'User-selected images from image_candidates. Array of objects: {url: string, selectedAt: string}. Max 10 images.';

COMMIT;
