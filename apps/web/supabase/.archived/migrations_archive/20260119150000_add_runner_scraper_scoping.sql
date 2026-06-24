-- Migration: Add scraper scoping for runner API keys
-- Purpose: Security - restrict which scrapers each runner can access credentials for

-- Add allowed_scrapers column to runner_api_keys
-- NULL means "all scrapers allowed" (default for backward compatibility)
-- Empty array means "no scrapers allowed"
-- Array of names means "only these scrapers allowed"
ALTER TABLE runner_api_keys 
ADD COLUMN IF NOT EXISTS allowed_scrapers text[] DEFAULT NULL;

COMMENT ON COLUMN runner_api_keys.allowed_scrapers IS 
'List of scraper names this key can access credentials for. NULL = all allowed (legacy), empty = none allowed, array = specific scrapers only.';

-- Update the validate_runner_api_key function to return allowed_scrapers
CREATE OR REPLACE FUNCTION validate_runner_api_key(api_key text)
RETURNS TABLE (
    runner_name text,
    key_id uuid,
    is_valid boolean,
    allowed_scrapers text[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    key_hash_value text;
    result record;
BEGIN
    -- Hash the provided key
    key_hash_value := encode(sha256(api_key::bytea), 'hex');
    
    -- Look up the key
    SELECT 
        rak.runner_name,
        rak.id as key_id,
        true as is_valid,
        rak.allowed_scrapers
    INTO result
    FROM runner_api_keys rak
    WHERE rak.key_hash = key_hash_value
      AND rak.revoked_at IS NULL
      AND (rak.expires_at IS NULL OR rak.expires_at > now());
    
    IF result IS NULL THEN
        RETURN QUERY SELECT null::text, null::uuid, false, null::text[];
        RETURN;
    END IF;
    
    -- Update last_used_at
    UPDATE runner_api_keys 
    SET last_used_at = now() 
    WHERE id = result.key_id;
    
    RETURN QUERY SELECT result.runner_name, result.key_id, result.is_valid, result.allowed_scrapers;
END;
$$;
