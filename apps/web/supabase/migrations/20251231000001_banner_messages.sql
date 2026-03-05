-- Migration: Update campaign_banner to new cycling messages format
-- Converts legacy single-message format to new array format

UPDATE site_settings 
SET value = jsonb_build_object(
  'enabled', (value->>'enabled')::boolean,
  'messages', CASE 
    WHEN value->>'message' IS NOT NULL AND value->>'message' != '' THEN
      jsonb_build_array(
        jsonb_build_object(
          'text', value->>'message',
          'linkText', COALESCE(value->>'link_text', ''),
          'linkHref', COALESCE(value->>'link_href', '')
        )
      )
    ELSE '[]'::jsonb
  END,
  'variant', COALESCE(value->>'variant', 'info'),
  'cycleInterval', 5000
),
updated_at = now()
WHERE key = 'campaign_banner' 
  AND value->>'message' IS NOT NULL
  AND (value->'messages') IS NULL;
