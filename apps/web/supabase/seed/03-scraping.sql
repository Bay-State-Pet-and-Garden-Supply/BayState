-- ---------------------------------------------------------------------
-- Facet values, product facet assignments, and sample scraper configs
-- ---------------------------------------------------------------------

INSERT INTO facet_values (facet_definition_id, value, normalized_value, slug)
VALUES
  ((SELECT id FROM facet_definitions WHERE slug = 'animal-type'), 'Dog', 'dog', 'dog'),
  ((SELECT id FROM facet_definitions WHERE slug = 'animal-type'), 'Cat', 'cat', 'cat'),
  ((SELECT id FROM facet_definitions WHERE slug = 'animal-type'), 'Bird', 'bird', 'bird'),
  ((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Adult', 'adult', 'adult'),
  ((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Puppy', 'puppy', 'puppy'),
  ((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Senior', 'senior', 'senior'),
  ((SELECT id FROM facet_definitions WHERE slug = 'life-stage'), 'Kitten', 'kitten', 'kitten'),
  ((SELECT id FROM facet_definitions WHERE slug = 'flavor'), 'Chicken', 'chicken', 'chicken'),
  ((SELECT id FROM facet_definitions WHERE slug = 'flavor'), 'Salmon', 'salmon', 'salmon'),
  ((SELECT id FROM facet_definitions WHERE slug = 'flavor'), 'Beef', 'beef', 'beef'),
  ((SELECT id FROM facet_definitions WHERE slug = 'flavor'), 'Duck', 'duck', 'duck')
ON CONFLICT (facet_definition_id, normalized_value) DO UPDATE SET
  value = EXCLUDED.value,
  slug = EXCLUDED.slug;

WITH product_facet_map (product_id, facet_definition_slug, facet_value_slug) AS (
  VALUES
    ('bd731767-abed-58a8-8409-3b6cb003dae4', 'animal-type', 'dog'),
    ('2b8dcfc7-200b-5e14-83fc-11126af0a90a', 'animal-type', 'dog'),
    ('32711615-c441-5063-a1ed-464d3ba6d253', 'animal-type', 'dog'),
    ('4940d798-fa4b-5fa7-b733-a3abe1e3be44', 'animal-type', 'cat'),
    ('55555555-5555-5555-5555-555555555555', 'animal-type', 'cat'),
    ('bc8e0978-0e0b-5c1e-84b0-28d683764daa', 'animal-type', 'cat'),
    ('f3efbe5c-8ba9-5c4f-853f-154ff51be3fc', 'animal-type', 'cat'),
    ('6b839236-3a4f-5358-93be-56f61f4a3ff5', 'animal-type', 'cat'),
    ('a42e1184-4183-5ece-a0b8-2e60ad3b4a09', 'animal-type', 'cat'),
    ('23cc15d2-4920-5af8-b8ab-bb0778e26669', 'animal-type', 'cat'),
    ('a35447a5-9929-56f4-bf35-649b829ebb69', 'animal-type', 'cat'),
    ('66666666-6666-6666-6666-666666666666', 'animal-type', 'cat'),
    ('bd731767-abed-58a8-8409-3b6cb003dae4', 'life-stage', 'adult'),
    ('2b8dcfc7-200b-5e14-83fc-11126af0a90a', 'life-stage', 'adult'),
    ('bc8e0978-0e0b-5c1e-84b0-28d683764daa', 'life-stage', 'adult'),
    ('f3efbe5c-8ba9-5c4f-853f-154ff51be3fc', 'life-stage', 'adult'),
    ('6b839236-3a4f-5358-93be-56f61f4a3ff5', 'life-stage', 'adult'),
    ('a42e1184-4183-5ece-a0b8-2e60ad3b4a09', 'life-stage', 'adult'),
    ('23cc15d2-4920-5af8-b8ab-bb0778e26669', 'life-stage', 'adult'),
    ('a35447a5-9929-56f4-bf35-649b829ebb69', 'life-stage', 'adult'),
    ('66666666-6666-6666-6666-666666666666', 'life-stage', 'adult'),
    ('bc8e0978-0e0b-5c1e-84b0-28d683764daa', 'flavor', 'chicken'),
    ('f3efbe5c-8ba9-5c4f-853f-154ff51be3fc', 'flavor', 'chicken'),
    ('6b839236-3a4f-5358-93be-56f61f4a3ff5', 'flavor', 'salmon'),
    ('a42e1184-4183-5ece-a0b8-2e60ad3b4a09', 'flavor', 'chicken'),
    ('23cc15d2-4920-5af8-b8ab-bb0778e26669', 'flavor', 'duck'),
    ('a35447a5-9929-56f4-bf35-649b829ebb69', 'flavor', 'salmon'),
    ('66666666-6666-6666-6666-666666666666', 'flavor', 'chicken')
)
INSERT INTO product_facets (product_id, facet_value_id)
SELECT map.product_id::uuid, facet_values.id
FROM product_facet_map AS map
JOIN facet_definitions ON facet_definitions.slug = map.facet_definition_slug
JOIN facet_values
  ON facet_values.facet_definition_id = facet_definitions.id
 AND facet_values.slug = map.facet_value_slug
ON CONFLICT (product_id, facet_value_id) DO NOTHING;

INSERT INTO scraper_configs (
  id,
  slug,
  display_name,
  domain,
  base_url,
  schema_version,
  scraper_type,
  status,
  health_status,
  health_score,
  last_test_at
)
VALUES
  (
    'a0000000-0000-0000-0000-000000000011',
    'wondercide-sample',
    'Wondercide Sample Scraper',
    'www.wondercide.com',
    'https://www.wondercide.com',
    '1.0',
    'static',
    'active',
    'healthy',
    92,
    NOW()
  ),
  (
    'a0000000-0000-0000-0000-000000000012',
    'fromm-sample',
    'Fromm Sample Scraper',
    'www.frommfamily.com',
    'https://www.frommfamily.com',
    '1.0',
    'static',
    'draft',
    'unknown',
    0,
    NULL
  )
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  domain = EXCLUDED.domain,
  base_url = EXCLUDED.base_url,
  schema_version = EXCLUDED.schema_version,
  scraper_type = EXCLUDED.scraper_type,
  status = EXCLUDED.status,
  health_status = EXCLUDED.health_status,
  health_score = EXCLUDED.health_score,
  last_test_at = EXCLUDED.last_test_at;

INSERT INTO scraper_config_versions (
  id,
  config_id,
  schema_version,
  status,
  version_number,
  published_at,
  change_summary,
  validation_result,
  ai_config,
  anti_detection,
  validation_config,
  timeout,
  retries,
  image_quality
)
VALUES
  (
    'b0000000-0000-0000-0000-000000000011',
    'a0000000-0000-0000-0000-000000000011',
    '1.0',
    'published',
    1,
    NOW(),
    'Seeded local Wondercide scraper configuration.',
    '{"valid": true, "warnings": []}'::jsonb,
    NULL,
    '{"enable_rate_limiting": true, "rate_limit_min_delay": 1.5, "rate_limit_max_delay": 3.0}'::jsonb,
    '{"no_results_selectors": [".search-no-results"], "no_results_text_patterns": ["no results found"]}'::jsonb,
    45,
    2,
    70
  ),
  (
    'b0000000-0000-0000-0000-000000000012',
    'a0000000-0000-0000-0000-000000000012',
    '1.0',
    'validated',
    1,
    NULL,
    'Seeded local Fromm scraper configuration for lab testing.',
    '{"valid": true, "warnings": ["Selectors tuned for local demo only"]}'::jsonb,
    NULL,
    '{"enable_rate_limiting": true, "rate_limit_min_delay": 1.0, "rate_limit_max_delay": 2.5}'::jsonb,
    '{"no_results_selectors": [".no-products"], "no_results_text_patterns": ["sorry, no products found"]}'::jsonb,
    40,
    2,
    75
  )
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  published_at = EXCLUDED.published_at,
  change_summary = EXCLUDED.change_summary,
  validation_result = EXCLUDED.validation_result,
  anti_detection = EXCLUDED.anti_detection,
  validation_config = EXCLUDED.validation_config,
  timeout = EXCLUDED.timeout,
  retries = EXCLUDED.retries,
  image_quality = EXCLUDED.image_quality;

UPDATE scraper_configs
SET current_version_id = CASE id
  WHEN 'a0000000-0000-0000-0000-000000000011' THEN 'b0000000-0000-0000-0000-000000000011'
  WHEN 'a0000000-0000-0000-0000-000000000012' THEN 'b0000000-0000-0000-0000-000000000012'
  ELSE current_version_id
END
WHERE id IN (
  'a0000000-0000-0000-0000-000000000011',
  'a0000000-0000-0000-0000-000000000012'
);

INSERT INTO scraper_selectors (version_id, name, selector, attribute, multiple, required, sort_order)
VALUES
  ('b0000000-0000-0000-0000-000000000011', 'product_name', '.product-title', 'text', false, true, 1),
  ('b0000000-0000-0000-0000-000000000011', 'product_price', '.product-price', 'text', false, true, 2),
  ('b0000000-0000-0000-0000-000000000011', 'product_image', '.product-image img', 'src', false, true, 3),
  ('b0000000-0000-0000-0000-000000000012', 'product_name', 'h1.product-title', 'text', false, true, 1),
  ('b0000000-0000-0000-0000-000000000012', 'product_price', '.price', 'text', false, true, 2),
  ('b0000000-0000-0000-0000-000000000012', 'product_image', '.gallery img', 'src', false, true, 3)
ON CONFLICT DO NOTHING;

INSERT INTO scraper_workflow_steps (version_id, action, name, params, sort_order)
VALUES
  ('b0000000-0000-0000-0000-000000000011', 'navigate', 'Open PDP', '{"url": "https://www.wondercide.com/products/{sku}"}'::jsonb, 1),
  ('b0000000-0000-0000-0000-000000000011', 'extract', 'Extract fields', '{"fields": ["product_name", "product_price", "product_image"]}'::jsonb, 2),
  ('b0000000-0000-0000-0000-000000000012', 'navigate', 'Open PDP', '{"url": "https://www.frommfamily.com/products/{sku}"}'::jsonb, 1),
  ('b0000000-0000-0000-0000-000000000012', 'extract', 'Extract fields', '{"fields": ["product_name", "product_price", "product_image"]}'::jsonb, 2)
ON CONFLICT DO NOTHING;

INSERT INTO scraper_config_test_skus (config_id, sku, sku_type)
VALUES
  ('a0000000-0000-0000-0000-000000000011', '019962890727', 'test'),
  ('a0000000-0000-0000-0000-000000000011', 'NO-SUCH-WONDERCIDE-SKU', 'fake'),
  ('a0000000-0000-0000-0000-000000000012', '072705137008', 'test'),
  ('a0000000-0000-0000-0000-000000000012', 'NO-SUCH-FROMM-SKU', 'fake')
ON CONFLICT (config_id, sku) DO UPDATE SET
  sku_type = EXCLUDED.sku_type;
