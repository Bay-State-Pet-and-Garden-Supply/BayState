-- Migrate existing products_ingestion.consolidated data to the nested { core, facets, media, evidence } structure
UPDATE public.products_ingestion
SET consolidated = jsonb_build_object(
  'core', jsonb_build_object(
    'name', consolidated->>'name',
    'brand_name', COALESCE(consolidated->>'brand_name', consolidated->>'brand'),
    'brand_id', consolidated->>'brand_id',
    'description', consolidated->>'description',
    'price', CASE 
      WHEN consolidated->>'price' IS NOT NULL THEN (substring(consolidated->>'price' from '^[0-9]+(\.[0-9]+)?'))::numeric 
      ELSE NULL 
    END,
    'weight_lbs', CASE 
      WHEN consolidated->>'weight' IS NOT NULL THEN (substring(consolidated->>'weight' from '^[0-9]+(\.[0-9]+)?'))::numeric 
      ELSE NULL 
    END,
    'canonical_category_breadcrumb', consolidated->>'category',
    'search_keywords', consolidated->>'search_keywords',
    'confidence_score', CASE 
      WHEN consolidated->>'confidence_score' IS NOT NULL THEN (substring(consolidated->>'confidence_score' from '^[0-9]+(\.[0-9]+)?'))::numeric 
      ELSE NULL 
    END
  ),
  'facets', COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object(
        'definition_slug', facet_mapping.new_slug,
        'value', consolidated->>facet_mapping.old_key,
        'confidence_score', 0.90,
        'evidence_source', 'heuristic_backfill'
      ))
      FROM (
        VALUES 
          ('pet_type', 'animal_type'),
          ('life_stage', 'life_stage'),
          ('pet_size', 'breed_size'),
          ('special_diet', 'diet_type'),
          ('health_feature', 'health_focus'),
          ('food_form', 'food_form'),
          ('flavor', 'flavor'),
          ('product_feature', 'claims'),
          ('size', 'size'),
          ('color', 'color'),
          ('packaging_type', 'packaging_type')
      ) AS facet_mapping(old_key, new_slug)
      WHERE consolidated ? facet_mapping.old_key 
        AND consolidated->>facet_mapping.old_key IS NOT NULL 
        AND consolidated->>facet_mapping.old_key <> ''
    ),
    '[]'::jsonb
  ),
  'media', CASE 
    WHEN jsonb_typeof(consolidated->'images') = 'array' THEN (
      SELECT jsonb_agg(jsonb_build_object(
        'url', img,
        'role', CASE WHEN idx = 1 THEN 'main' ELSE 'gallery' END,
        'source', 'scraped',
        'confidence_score', 1.0
      ))
      FROM jsonb_array_elements_text(consolidated->'images') WITH ORDINALITY AS imgs(img, idx)
    )
    ELSE '[]'::jsonb
  END,
  'evidence', jsonb_build_object(
    'selected_images', COALESCE(consolidated->'images', '[]'::jsonb)
  )
)
WHERE consolidated IS NOT NULL 
  AND consolidated <> '{}'::jsonb 
  AND NOT (consolidated ? 'core');
