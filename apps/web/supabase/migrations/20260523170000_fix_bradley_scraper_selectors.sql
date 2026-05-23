-- Fix Bradley Caldwell scraper selectors and navigation
-- Target the current version of the 'bradley' scraper

DO $$ 
DECLARE
    v_version_id uuid;
BEGIN
    SELECT current_version_id INTO v_version_id 
    FROM scraper_configs 
    WHERE slug = 'bradley';

    IF v_version_id IS NOT NULL THEN
        -- Update the navigation step (sort_order 5)
        UPDATE scraper_workflow_steps 
        SET params = '{"index":0,"selector":"h3 a[href], a.group.relative.block.aspect-square, a:has-text(\"View product\")"}'
        WHERE version_id = v_version_id 
        AND sort_order = 5;

        -- Update BCI Item Number selector
        UPDATE scraper_selectors 
        SET selector = 'p:has-text("BCI Item Number"), div:has-text("BCI Item Number"), p:has-text("BCI#")'
        WHERE version_id = v_version_id 
        AND name = 'BCI Item Number';

        -- Update Manufacturer # selector
        UPDATE scraper_selectors 
        SET selector = 'p:has-text("Manufacturer #"), div:has-text("Manufacturer #")'
        WHERE version_id = v_version_id 
        AND name = 'Manufacturer #';

        -- Update UPC selector
        UPDATE scraper_selectors 
        SET selector = 'p:has-text("UPC"), div:has-text("UPC")'
        WHERE version_id = v_version_id 
        AND name = 'UPC';

        -- Update Case Pack selector
        UPDATE scraper_selectors 
        SET selector = 'li:has-text("Case Pack"), p:has-text("Case Pack"), div:has-text("Case Pack")'
        WHERE version_id = v_version_id 
        AND name = 'Case Pack';

        -- Update Unit of Measure selector
        UPDATE scraper_selectors 
        SET selector = 'li:has-text("Unit of Measure"), p:has-text("Unit of Measure"), div:has-text("Unit of Measure")'
        WHERE version_id = v_version_id 
        AND name = 'Unit of Measure';

        -- Update Dimensions selector
        UPDATE scraper_selectors 
        SET selector = 'li:has-text("Dimensions"), p:has-text("Dimensions"), div:has-text("Dimensions")'
        WHERE version_id = v_version_id 
        AND name = 'Dimensions';

        -- Update Brand selector
        UPDATE scraper_selectors 
        SET selector = '//main//h1/preceding-sibling::p[1]'
        WHERE version_id = v_version_id 
        AND name = 'Brand';

        -- Update Weight selector
        UPDATE scraper_selectors 
        SET selector = '//main//li[contains(normalize-space(.), "Weight")]'
        WHERE version_id = v_version_id 
        AND name = 'Weight';

        -- Update Image URLs selector
        UPDATE scraper_selectors 
        SET selector = 'main img[src*=\"/products/\"], main img[src*=\"bigcommerce.com\"], .product-view-image img'
        WHERE version_id = v_version_id 
        AND name = 'Image URLs';
    END IF;
END $$;
