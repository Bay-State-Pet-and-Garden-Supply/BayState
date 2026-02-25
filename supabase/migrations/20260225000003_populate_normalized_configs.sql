-- ============================================================================
-- MIGRATE: Populate Normalized Tables from JSONB Blob
-- Created: 2026-02-25
-- ============================================================================
-- This migration extracts data from the current JSONB config blob into the 
-- new normalized columns and tables for all currently published versions.
-- 
-- IMPORTANT: This migration only processes published versions as per the plan.
-- =============================================================================

-- =============================================================================
-- STEP 1: Update scraper_configs with extracted metadata
-- =============================================================================

UPDATE public.scraper_configs sc
SET
    scraper_type = COALESCE(cv.config->>'scraper_type', 'static')::TEXT,
    base_url = cv.config->>'base_url',
    domain = cv.config->>'domain'
FROM public.scraper_config_versions cv
WHERE sc.current_version_id = cv.id
AND cv.status = 'published'
AND sc.scraper_type IS NULL OR sc.scraper_type = 'static';

-- =============================================================================
-- STEP 2: Extract structured JSONB from blob to version columns
-- =============================================================================

UPDATE public.scraper_config_versions
SET
    ai_config = config->'ai_config',
    anti_detection = config->'anti_detection',
    validation_config = config->'validation',
    login_config = config->'login',
    http_status_config = config->'http_status',
    normalization_config = config->'normalization',
    timeout = COALESCE((config->>'timeout')::INT, 30),
    retries = COALESCE((config->>'retries')::INT, 3),
    image_quality = COALESCE((config->>'image_quality')::INT, 50)
WHERE status = 'published'
AND config IS NOT NULL;

-- =============================================================================
-- STEP 3: Extract selectors from published versions
-- =============================================================================

INSERT INTO public.scraper_selectors (version_id, name, selector, attribute, multiple, required, sort_order)
SELECT
    cv.id AS version_id,
    (sel->>'name')::TEXT AS name,
    (sel->>'selector')::TEXT AS selector,
    COALESCE(sel->>'attribute', 'text')::TEXT AS attribute,
    COALESCE((sel->>'multiple')::BOOLEAN, false) AS multiple,
    COALESCE((sel->>'required')::BOOLEAN, true) AS required,
    (row_number() OVER (PARTITION BY cv.id ORDER BY ordinality)) - 1 AS sort_order
FROM public.scraper_config_versions cv,
     jsonb_array_elements(cv.config->'selectors') WITH ORDINALITY AS sel(value, ordinality)
WHERE cv.status = 'published'
AND cv.config->'selectors' IS NOT NULL
ON CONFLICT (version_id, sort_order) DO NOTHING;

-- =============================================================================
-- STEP 4: Extract workflow steps from published versions
-- =============================================================================

INSERT INTO public.scraper_workflow_steps (version_id, action, name, params, sort_order)
SELECT
    cv.id AS version_id,
    (step->>'action')::TEXT AS action,
    step->>'name'::TEXT AS name,
    COALESCE(step->'params', '{}'::JSONB) AS params,
    (row_number() OVER (PARTITION BY cv.id ORDER BY ordinality)) - 1 AS sort_order
FROM public.scraper_config_versions cv,
     jsonb_array_elements(cv.config->'workflows') WITH ORDINALITY AS step(value, ordinality)
WHERE cv.status = 'published'
AND cv.config->'workflows' IS NOT NULL
ON CONFLICT (version_id, sort_order) DO NOTHING;

-- =============================================================================
-- STEP 5: Migrate test SKUs from JSONB to scraper_config_test_skus
-- =============================================================================

-- Migrate test SKUs
INSERT INTO public.scraper_config_test_skus (config_id, sku, sku_type, added_by)
SELECT 
    sc.id AS config_id,
    sku.value::TEXT AS sku,
    'test' AS sku_type,
    cv.created_by AS added_by
FROM public.scraper_configs sc
JOIN public.scraper_config_versions cv ON sc.current_version_id = cv.id
CROSS JOIN jsonb_array_elements_text(cv.config->'test_skus') AS sku(value)
WHERE cv.config->'test_skus' IS NOT NULL
AND cv.status = 'published'
ON CONFLICT (config_id, sku) DO NOTHING;

-- Migrate fake SKUs
INSERT INTO public.scraper_config_test_skus (config_id, sku, sku_type, added_by)
SELECT 
    sc.id AS config_id,
    sku.value::TEXT AS sku,
    'fake' AS sku_type,
    cv.created_by AS added_by
FROM public.scraper_configs sc
JOIN public.scraper_config_versions cv ON sc.current_version_id = cv.id
CROSS JOIN jsonb_array_elements_text(cv.config->'fake_skus') AS sku(value)
WHERE cv.config->'fake_skus' IS NOT NULL
AND cv.status = 'published'
ON CONFLICT (config_id, sku) DO NOTHING;

-- Migrate edge_case SKUs
INSERT INTO public.scraper_config_test_skus (config_id, sku, sku_type, added_by)
SELECT 
    sc.id AS config_id,
    sku.value::TEXT AS sku,
    'edge_case' AS sku_type,
    cv.created_by AS added_by
FROM public.scraper_configs sc
JOIN public.scraper_config_versions cv ON sc.current_version_id = cv.id
CROSS JOIN jsonb_array_elements_text(cv.config->'edge_case_skus') AS sku(value)
WHERE cv.config->'edge_case_skus' IS NOT NULL
AND cv.status = 'published'
ON CONFLICT (config_id, sku) DO NOTHING;

-- =============================================================================
-- STEP 6: Do NOT drop the original config JSONB column yet
-- Keep it for rollback safety until verification is complete
-- =============================================================================

-- The original 'config' column in scraper_config_versions is preserved
-- It will be renamed to 'config_legacy' in a follow-up migration after verification

-- =============================================================================
-- Verification Queries (run these to verify migration success)
-- =============================================================================

-- Check scraper_configs have scraper_type and base_url populated:
-- SELECT slug, scraper_type, base_url FROM scraper_configs;

-- Check selectors extracted:
-- SELECT cv.id, sc.slug, COUNT(s.id) as selector_count
-- FROM scraper_config_versions cv
-- JOIN scraper_configs sc ON cv.config_id = sc.id
-- LEFT JOIN scraper_selectors s ON s.version_id = cv.id
-- WHERE cv.status = 'published'
-- GROUP BY cv.id, sc.slug;

-- Check workflow steps extracted:
-- SELECT cv.id, sc.slug, COUNT(w.id) as step_count
-- FROM scraper_config_versions cv
-- JOIN scraper_configs sc ON cv.config_id = sc.id
-- LEFT JOIN scraper_workflow_steps w ON w.version_id = cv.id
-- WHERE cv.status = 'published'
-- GROUP BY cv.id, sc.slug;

-- Check test SKUs migrated:
-- SELECT config_id, sku_type, COUNT(*) 
-- FROM scraper_config_test_skus 
-- GROUP BY config_id, sku_type;
