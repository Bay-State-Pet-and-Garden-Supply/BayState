-- =============================================================================
-- Taxonomy Overhaul — Backfill Canonical Product Facets
--
-- Copies existing product_facets associations from deprecated facet definitions
-- to their canonical replacements. This makes existing products filterable by
-- the new canonical facets without requiring a full re-import.
--
-- Phase 1: Copy facet_values from deprecated to canonical definitions
-- Phase 2: Handle flavor → primary_protein (protein-like values only)
-- Phase 3: Copy product_facets associations to canonical facet values
-- Phase 4: Mark deprecated definitions
--
-- Prerequisites:
--   - Task 5 migration (20260509131200) must have run, creating canonical
--     facet definitions (life_stage, breed_size, diet_type, health_focus,
--     primary_protein) alongside the deprecated ones
--   - Existing product_facets data must be present
-- =============================================================================

BEGIN;

-- ============================================================================
-- Helper: Temporary table for mapping tracking
-- Reports counts for each mapping to aid verification.
-- ============================================================================

CREATE TEMP TABLE _mapping_report (
    step text,
    source_definition text,
    target_definition text,
    values_copied int DEFAULT 0,
    product_facets_copied int DEFAULT 0
);

-- ============================================================================
-- Phase 1: Copy facet_values from deprecated to canonical definitions
-- ============================================================================
-- For each mapping pair (old → new), insert facet_values from the old
-- definition into the new definition, preserving value/normalized_value/slug.
-- Uses ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING for
-- idempotency — if a canonical value already exists it is left unchanged.

-- 1a: lifestage → life_stage
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'lifestage'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'life_stage'),
    copied_values AS (
        INSERT INTO public.facet_values (facet_definition_id, value, normalized_value, slug)
        SELECT
            (SELECT id FROM new_def),
            old_fv.value,
            old_fv.normalized_value,
            old_fv.slug
        FROM public.facet_values old_fv
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, values_copied)
SELECT 'Phase 1', 'lifestage', 'life_stage', (SELECT COUNT(*) FROM copied_values);

-- 1b: pet_size → breed_size
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'pet_size'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'breed_size'),
    copied_values AS (
        INSERT INTO public.facet_values (facet_definition_id, value, normalized_value, slug)
        SELECT
            (SELECT id FROM new_def),
            old_fv.value,
            old_fv.normalized_value,
            old_fv.slug
        FROM public.facet_values old_fv
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, values_copied)
SELECT 'Phase 1', 'pet_size', 'breed_size', (SELECT COUNT(*) FROM copied_values);

-- 1c: special_diet → diet_type
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'special_diet'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'diet_type'),
    copied_values AS (
        INSERT INTO public.facet_values (facet_definition_id, value, normalized_value, slug)
        SELECT
            (SELECT id FROM new_def),
            old_fv.value,
            old_fv.normalized_value,
            old_fv.slug
        FROM public.facet_values old_fv
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, values_copied)
SELECT 'Phase 1', 'special_diet', 'diet_type', (SELECT COUNT(*) FROM copied_values);

-- 1d: health_feature → health_focus
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'health_feature'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'health_focus'),
    copied_values AS (
        INSERT INTO public.facet_values (facet_definition_id, value, normalized_value, slug)
        SELECT
            (SELECT id FROM new_def),
            old_fv.value,
            old_fv.normalized_value,
            old_fv.slug
        FROM public.facet_values old_fv
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, values_copied)
SELECT 'Phase 1', 'health_feature', 'health_focus', (SELECT COUNT(*) FROM copied_values);

-- ============================================================================
-- Phase 2: Handle flavor → primary_protein
-- ============================================================================
-- Copy flavor values that represent protein sources to the primary_protein
-- facet. Non-protein flavors (Peanut Butter, Sweet Potato, Apple, Banana,
-- Cheese, Bacon) stay as flavor-only.
--
-- Protein flavor values: Chicken, Beef, Salmon, Turkey, Lamb, Duck, Venison,
-- Pork, Fish, Rabbit, Bison, Tuna, Whitefish, Trout, Cod, Liver, Seafood,
-- Shrimp, Herring, Mixed Protein

WITH
    flavor_def AS (SELECT id FROM public.facet_definitions WHERE name = 'flavor'),
    protein_def AS (SELECT id FROM public.facet_definitions WHERE name = 'primary_protein'),
    protein_flavors AS (
        SELECT fv.id AS old_value_id, fv.value, fv.normalized_value, fv.slug
        FROM public.facet_values fv
        WHERE fv.facet_definition_id = (SELECT id FROM flavor_def)
          AND LOWER(fv.value) IN (
              'chicken', 'beef', 'salmon', 'turkey', 'lamb', 'duck', 'venison',
              'pork', 'fish', 'rabbit', 'bison', 'tuna', 'whitefish', 'trout',
              'cod', 'liver', 'seafood', 'shrimp', 'herring', 'mixed protein'
          )
    ),
    copied_values AS (
        INSERT INTO public.facet_values (facet_definition_id, value, normalized_value, slug)
        SELECT
            (SELECT id FROM protein_def),
            pf.value,
            pf.normalized_value,
            pf.slug
        FROM protein_flavors pf
        ON CONFLICT (facet_definition_id, normalized_value) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, values_copied)
SELECT 'Phase 2', 'flavor (proteins only)', 'primary_protein', (SELECT COUNT(*) FROM copied_values);

-- ============================================================================
-- Phase 3: Copy product_facets associations
-- ============================================================================
-- For each mapping pair, join product_facets → old facet_values → new
-- facet_values (via matching value) and insert new product_facets rows.
-- Uses ON CONFLICT (product_id, facet_value_id) DO NOTHING for idempotency.

-- 3a: lifestage → life_stage
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'lifestage'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'life_stage'),
    copied_facets AS (
        INSERT INTO public.product_facets (product_id, facet_value_id)
        SELECT DISTINCT
            pf.product_id,
            new_fv.id AS facet_value_id
        FROM public.product_facets pf
        JOIN public.facet_values old_fv ON pf.facet_value_id = old_fv.id
        JOIN public.facet_values new_fv
            ON new_fv.facet_definition_id = (SELECT id FROM new_def)
           AND new_fv.normalized_value = old_fv.normalized_value
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (product_id, facet_value_id) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, product_facets_copied)
SELECT 'Phase 3', 'lifestage', 'life_stage', (SELECT COUNT(*) FROM copied_facets);

-- 3b: pet_size → breed_size
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'pet_size'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'breed_size'),
    copied_facets AS (
        INSERT INTO public.product_facets (product_id, facet_value_id)
        SELECT DISTINCT
            pf.product_id,
            new_fv.id AS facet_value_id
        FROM public.product_facets pf
        JOIN public.facet_values old_fv ON pf.facet_value_id = old_fv.id
        JOIN public.facet_values new_fv
            ON new_fv.facet_definition_id = (SELECT id FROM new_def)
           AND new_fv.normalized_value = old_fv.normalized_value
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (product_id, facet_value_id) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, product_facets_copied)
SELECT 'Phase 3', 'pet_size', 'breed_size', (SELECT COUNT(*) FROM copied_facets);

-- 3c: special_diet → diet_type
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'special_diet'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'diet_type'),
    copied_facets AS (
        INSERT INTO public.product_facets (product_id, facet_value_id)
        SELECT DISTINCT
            pf.product_id,
            new_fv.id AS facet_value_id
        FROM public.product_facets pf
        JOIN public.facet_values old_fv ON pf.facet_value_id = old_fv.id
        JOIN public.facet_values new_fv
            ON new_fv.facet_definition_id = (SELECT id FROM new_def)
           AND new_fv.normalized_value = old_fv.normalized_value
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (product_id, facet_value_id) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, product_facets_copied)
SELECT 'Phase 3', 'special_diet', 'diet_type', (SELECT COUNT(*) FROM copied_facets);

-- 3d: health_feature → health_focus
WITH
    old_def AS (SELECT id FROM public.facet_definitions WHERE name = 'health_feature'),
    new_def AS (SELECT id FROM public.facet_definitions WHERE name = 'health_focus'),
    copied_facets AS (
        INSERT INTO public.product_facets (product_id, facet_value_id)
        SELECT DISTINCT
            pf.product_id,
            new_fv.id AS facet_value_id
        FROM public.product_facets pf
        JOIN public.facet_values old_fv ON pf.facet_value_id = old_fv.id
        JOIN public.facet_values new_fv
            ON new_fv.facet_definition_id = (SELECT id FROM new_def)
           AND new_fv.normalized_value = old_fv.normalized_value
        WHERE old_fv.facet_definition_id = (SELECT id FROM old_def)
        ON CONFLICT (product_id, facet_value_id) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, product_facets_copied)
SELECT 'Phase 3', 'health_feature', 'health_focus', (SELECT COUNT(*) FROM copied_facets);

-- 3e: flavor (proteins only) → primary_protein
WITH
    flavor_def AS (SELECT id FROM public.facet_definitions WHERE name = 'flavor'),
    protein_def AS (SELECT id FROM public.facet_definitions WHERE name = 'primary_protein'),
    copied_facets AS (
        INSERT INTO public.product_facets (product_id, facet_value_id)
        SELECT DISTINCT
            pf.product_id,
            new_fv.id AS facet_value_id
        FROM public.product_facets pf
        JOIN public.facet_values old_fv ON pf.facet_value_id = old_fv.id
        JOIN public.facet_values new_fv
            ON new_fv.facet_definition_id = (SELECT id FROM protein_def)
           AND new_fv.normalized_value = old_fv.normalized_value
        WHERE old_fv.facet_definition_id = (SELECT id FROM flavor_def)
          AND LOWER(old_fv.value) IN (
              'chicken', 'beef', 'salmon', 'turkey', 'lamb', 'duck', 'venison',
              'pork', 'fish', 'rabbit', 'bison', 'tuna', 'whitefish', 'trout',
              'cod', 'liver', 'seafood', 'shrimp', 'herring', 'mixed protein'
          )
        ON CONFLICT (product_id, facet_value_id) DO NOTHING
        RETURNING 1 AS copied
    )
INSERT INTO _mapping_report (step, source_definition, target_definition, product_facets_copied)
SELECT 'Phase 3', 'flavor (proteins only)', 'primary_protein', (SELECT COUNT(*) FROM copied_facets);

-- ============================================================================
-- Phase 4: Mark deprecated definitions
-- ============================================================================
-- Old definitions remain in the table for backward compatibility (import code
-- may still reference them briefly), but they are hidden from storefront
-- filters. The 'flavor' definition is NOT deprecated — it remains as a
-- display facet alongside primary_protein.

WITH updated AS (
    UPDATE public.facet_definitions
    SET is_deprecated = true
    WHERE name IN ('lifestage', 'pet_size', 'special_diet', 'health_feature')
    RETURNING name
)
INSERT INTO _mapping_report (step, source_definition, target_definition, values_copied)
SELECT 'Phase 4', string_agg(name, ', '), 'DEPRECATED', COUNT(*)
FROM updated;

-- ============================================================================
-- Report
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE '=== Facet Backfill Migration Report ===';
    FOR r IN SELECT * FROM _mapping_report ORDER BY step, source_definition LOOP
        RAISE NOTICE '  %: % → % (values: %, product_facets: %)',
            r.step,
            r.source_definition,
            r.target_definition,
            r.values_copied,
            r.product_facets_copied;
    END LOOP;
    RAISE NOTICE '=== End Report ===';
END;
$$;

-- Cleanup
DROP TABLE IF EXISTS _mapping_report;

COMMIT;
