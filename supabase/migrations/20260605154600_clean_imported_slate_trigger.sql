-- Create trigger function to ensure clean slate for imported/awaiting_brand products
CREATE OR REPLACE FUNCTION clean_imported_products_slate()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pipeline_status IN ('imported', 'awaiting_brand') THEN
        NEW.sources := '{}'::jsonb;
        NEW.consolidated := NULL;
        NEW.image_candidates := '{}'::text[];
        NEW.selected_images := '[]'::jsonb;
        NEW.confidence_score := NULL;
        NEW.error_message := NULL;
        NEW.retry_count := 0;
        
        -- Delete any loose/old enrichment targets
        DELETE FROM enrichment_targets WHERE upc = NEW.upc;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on products_ingestion
DROP TRIGGER IF EXISTS trg_clean_imported_products_slate ON products_ingestion;

CREATE TRIGGER trg_clean_imported_products_slate
BEFORE INSERT OR UPDATE OF pipeline_status ON products_ingestion
FOR EACH ROW
EXECUTE FUNCTION clean_imported_products_slate();
