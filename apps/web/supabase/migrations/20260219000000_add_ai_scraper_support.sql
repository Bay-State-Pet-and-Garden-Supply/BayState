-- Migration: Add AI Scraper Support to scraper_configs
-- Date: 2026-02-19
-- Purpose: Add support for AI-powered scrapers with browser-use integration

-- Note: The scraper_type and ai_config fields are stored as JSONB within the 
-- scraper_config_versions.config column. JSONB is schemaless and supports 
-- the new fields without schema changes.

-- This migration documents the new fields and adds any necessary supporting structures

-- =============================================================================
-- Add comments to document the new schema fields
-- =============================================================================

COMMENT ON COLUMN public.scraper_config_versions.config IS 
'Full scraper configuration as JSONB. Includes selectors, workflows, validation, anti_detection settings.

New AI fields (when scraper_type = "ai"):
- scraper_type: "static" | "ai" - Type of scraper (default: "static")
- ai_config: {
    tool: "browser-use",           -- AI tool to use
    task: string,                  -- Natural language task description (required)
    max_steps: number,             -- Max actions before stopping (1-50, default: 10)
    confidence_threshold: number,  -- Min confidence for success (0-1, default: 0.7)
    llm_model: "gpt-4o-mini" | "gpt-4o",  -- LLM model to use
    use_vision: boolean,           -- Enable visual analysis (default: true)
    headless: boolean              -- Run browser headless (default: true)
  }

Example:
{
  "schema_version": "1.0",
  "name": "example-ai-scraper",
  "scraper_type": "ai",
  "ai_config": {
    "tool": "browser-use",
    "task": "Navigate to product page and extract name, price, and images",
    "max_steps": 15,
    "confidence_threshold": 0.8,
    "llm_model": "gpt-4o-mini",
    "use_vision": true,
    "headless": true
  },
  ...
}';

-- =============================================================================
-- Create helper function to validate AI config
-- =============================================================================
CREATE OR REPLACE FUNCTION public.validate_ai_config(config JSONB)
RETURNS TABLE (
    valid BOOLEAN,
    errors TEXT[]
) LANGUAGE plpgsql AS $$
DECLARE
    error_list TEXT[] := ARRAY[]::TEXT[];
    ai_config JSONB;
    scraper_type TEXT;
BEGIN
    -- Extract scraper type (default to 'static' if not present)
    scraper_type := COALESCE(config->>'scraper_type', 'static');
    
    -- If static scraper, no additional validation needed
    IF scraper_type = 'static' THEN
        RETURN QUERY SELECT true, ARRAY[]::TEXT[];
        RETURN;
    END IF;
    
    -- For AI scrapers, validate ai_config exists
    IF scraper_type = 'ai' THEN
        ai_config := config->'ai_config';
        
        IF ai_config IS NULL THEN
            error_list := array_append(error_list, 'ai_config is required when scraper_type is "ai"');
        ELSE
            -- Validate task
            IF ai_config->>'task' IS NULL OR length(trim(ai_config->>'task')) = 0 THEN
                error_list := array_append(error_list, 'ai_config.task is required and cannot be empty');
            END IF;
            
            -- Validate max_steps range
            IF (ai_config->>'max_steps')::INTEGER IS NOT NULL THEN
                IF (ai_config->>'max_steps')::INTEGER < 1 OR (ai_config->>'max_steps')::INTEGER > 50 THEN
                    error_list := array_append(error_list, 'ai_config.max_steps must be between 1 and 50');
                END IF;
            END IF;
            
            -- Validate confidence_threshold range
            IF (ai_config->>'confidence_threshold')::NUMERIC IS NOT NULL THEN
                IF (ai_config->>'confidence_threshold')::NUMERIC < 0 OR (ai_config->>'confidence_threshold')::NUMERIC > 1 THEN
                    error_list := array_append(error_list, 'ai_config.confidence_threshold must be between 0 and 1');
                END IF;
            END IF;
            
            -- Validate llm_model
            IF ai_config->>'llm_model' IS NOT NULL THEN
                IF ai_config->>'llm_model' NOT IN ('gpt-4o', 'gpt-4o-mini') THEN
                    error_list := array_append(error_list, 'ai_config.llm_model must be "gpt-4o" or "gpt-4o-mini"');
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN QUERY SELECT array_length(error_list, 1) IS NULL, error_list;
END;
$$;

COMMENT ON FUNCTION public.validate_ai_config(JSONB) IS 
'Validates AI scraper configuration. Returns (valid=true, errors=[]) if valid, otherwise (valid=false, errors=[...]).
Checks:
- ai_config exists when scraper_type="ai"
- task is non-empty
- max_steps is between 1-50
- confidence_threshold is between 0-1
- llm_model is valid';

GRANT EXECUTE ON FUNCTION public.validate_ai_config(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_ai_config(JSONB) TO service_role;

-- =============================================================================
-- Create view for AI scraper statistics
-- =============================================================================
CREATE OR REPLACE VIEW public.ai_scraper_stats AS
SELECT 
    sc.id AS config_id,
    sc.slug,
    sc.display_name,
    cv.version_number,
    cv.status,
    cv.config->>'scraper_type' AS scraper_type,
    CASE 
        WHEN cv.config->>'scraper_type' = 'ai' THEN cv.config->'ai_config'->>'llm_model'
        ELSE NULL
    END AS llm_model,
    CASE 
        WHEN cv.config->>'scraper_type' = 'ai' THEN (cv.config->'ai_config'->>'max_steps')::INTEGER
        ELSE NULL
    END AS max_steps,
    CASE 
        WHEN cv.config->>'scraper_type' = 'ai' THEN (cv.config->'ai_config'->>'confidence_threshold')::NUMERIC
        ELSE NULL
    END AS confidence_threshold,
    cv.published_at,
    cv.created_at
FROM public.scraper_configs sc
JOIN public.scraper_config_versions cv ON sc.id = cv.config_id
WHERE cv.config->>'scraper_type' = 'ai'
ORDER BY cv.created_at DESC;

COMMENT ON VIEW public.ai_scraper_stats IS 
'Read-only view of AI scraper configurations with extracted fields for easier querying.
Note: Only includes versions where scraper_type="ai".';

-- Grant read access to authenticated users
GRANT SELECT ON public.ai_scraper_stats TO authenticated;
GRANT SELECT ON public.ai_scraper_stats TO service_role;

-- =============================================================================
-- Add index for efficient filtering by scraper_type
-- =============================================================================
-- GIN index for JSONB path queries on config field
CREATE INDEX IF NOT EXISTS idx_scraper_config_versions_scraper_type 
ON public.scraper_config_versions USING GIN ((config->'scraper_type'));

COMMENT ON INDEX public.idx_scraper_config_versions_scraper_type IS 
'GIN index for efficient filtering of scraper configs by scraper_type (static/ai)';

-- =============================================================================
-- Migration complete
-- =============================================================================
-- Summary of changes:
-- 1. Updated column comment on scraper_config_versions.config to document new AI fields
-- 2. Created validate_ai_config() function for runtime validation
-- 3. Created ai_scraper_stats view for easier querying of AI scraper data
-- 4. Added GIN index for efficient scraper_type filtering

-- Verification query:
-- SELECT * FROM ai_scraper_stats;
-- SELECT * FROM validate_ai_config('{"scraper_type": "ai", "ai_config": {"task": "test", "max_steps": 10}}'::jsonb);
