-- Seed data for scraper configs
-- Run this against the Bay State database to populate test scraper configurations

-- First, we need to check if we have a user to reference (use service_role or existing user)
-- For testing, we'll create configs with NULL created_by or use a placeholder

-- Sample scraper configuration JSON
-- This is a minimal valid config based on the scraperConfigSchema

-- 1. Create test scraper configs with sample data
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'baystate-pet-supply', 'Bay State Pet Supply', 'www.baystatepetsupply.com', '1.0', NULL),
  ('a0000000-0000-0000-0000-000000000002', 'garden-center-online', 'Garden Center Online', 'www.gardencenteronline.com', '1.0', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'pet-food-wholesaler', 'Pet Food Wholesaler', 'www.petfoodwholesaler.com', '1.0', NULL)
ON CONFLICT (slug) DO NOTHING;

-- 2. Create draft versions for each config
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
VALUES
  (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    '1.0',
    '{
      "schema_version": "1.0",
      "selectors": {
        "product_name": ".product-title",
        "product_price": ".price-current",
        "product_image": ".product-image img",
        "product_description": ".product-description",
        "add_to_cart": ".btn-add-cart"
      },
      "workflow": {
        "navigation": "Browse product listing pages",
        "extraction": "Extract product details from each page",
        "pagination": "Follow next page links"
      },
      "anti_detection": {
        "user_agent_rotation": true,
        "request_delay": 2000
      }
    }'::jsonb,
    'draft',
    1,
    'Initial draft configuration',
    NULL
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    '1.0',
    '{
      "schema_version": "1.0",
      "selectors": {
        "product_name": "h2.product-name",
        "product_price": ".price-tag",
        "product_image": ".product-img img",
        "product_description": ".product-info p",
        "add_to_cart": ".add-to-cart button"
      },
      "workflow": {
        "navigation": "Start from homepage, navigate to categories",
        "extraction": "Extract product data from category and product pages",
        "pagination": "Load more button or page navigation"
      },
      "anti_detection": {
        "user_agent_rotation": true,
        "request_delay": 1500,
        "proxy_rotation": true
      }
    }'::jsonb,
    'draft',
    1,
    'Initial draft for garden center',
    NULL
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    '1.0',
    '{
      "schema_version": "1.0",
      "selectors": {
        "product_name": ".item-name",
        "product_price": ".item-price",
        "product_image": ".item-image img",
        "product_description": ".item-details",
        "add_to_cart": ".bulk-order-btn"
      },
      "workflow": {
        "navigation": "Access wholesale catalog",
        "extraction": "Extract wholesale pricing and availability",
        "pagination": "Page navigation with filters"
      },
      "anti_detection": {
        "user_agent_rotation": true,
        "request_delay": 3000
      }
    }'::jsonb,
    'draft',
    1,
    'Initial draft for wholesale',
    NULL
  )
ON CONFLICT DO NOTHING;

-- 3. Update configs to point to their current versions
UPDATE scraper_configs
SET current_version_id = 'b0000000-0000-0000-0000-000000000001'
WHERE id = 'a0000000-0000-0000-0000-000000000001';

UPDATE scraper_configs
SET current_version_id = 'b0000000-0000-0000-0000-000000000002'
WHERE id = 'a0000000-0000-0000-0000-000000000002';

UPDATE scraper_configs
SET current_version_id = 'b0000000-0000-0000-0000-000000000003'
WHERE id = 'a0000000-0000-0000-0000-000000000003';

-- 4. Validate one of the configs to show different status
UPDATE scraper_config_versions
SET status = 'validated',
    validation_result = '{
      "valid": true,
      "errors": [],
      "validated_at": "' || NOW() || '",
      "validated_by": null
    }'::jsonb
WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- 5. Publish one config to show published status
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, published_by, change_summary, created_by)
VALUES
  (
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    '1.0',
    '{
      "schema_version": "1.0",
      "selectors": {
        "product_name": "h2.product-name",
        "product_price": ".price-tag",
        "product_image": ".product-img img",
        "product_description": ".product-info p",
        "add_to_cart": ".add-to-cart button"
      },
      "workflow": {
        "navigation": "Start from homepage, navigate to categories",
        "extraction": "Extract product data from category and product pages",
        "pagination": "Load more button or page navigation"
      },
      "anti_detection": {
        "user_agent_rotation": true,
        "request_delay": 1500,
        "proxy_rotation": true
      }
    }'::jsonb,
    'published',
    2,
    NOW(),
    NULL,
    'Published version for production use',
    NULL
  )
ON CONFLICT DO NOTHING;

-- Update the config to point to published version
UPDATE scraper_configs
SET current_version_id = 'c0000000-0000-0000-0000-000000000001'
WHERE id = 'a0000000-0000-0000-0000-000000000002';

-- Archive the draft version
UPDATE scraper_config_versions
SET status = 'archived'
WHERE id = 'b0000000-0000-0000-0000-000000000002';

-- Verify the data
SELECT 'scraper_configs' as table_name, count(*) as count FROM scraper_configs
UNION ALL
SELECT 'scraper_config_versions', count(*) FROM scraper_config_versions;
