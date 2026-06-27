-- =============================================================================
-- Activate Profile Version — Atomic version activation RPC
-- =============================================================================
-- Atomically retires the current active version for a profile and activates
-- the target version. Updates profile.active_version_id and profile.status.
-- Uses SECURITY DEFINER so admin routes can call it without owning the tables.
-- See docs/adr/0009, docs/adr/0011, docs/plans/site-extraction-profiles-implementation-plan.md §2.2
-- =============================================================================

CREATE OR REPLACE FUNCTION public.activate_profile_version(
    p_version_id uuid,
    p_approved_by uuid,
    p_approval_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile_id uuid;
    v_result jsonb;
BEGIN
    -- Load target version's profile (version must be in draft/validating status)
    SELECT sep.id INTO v_profile_id
    FROM public.site_extraction_profile_versions sepv
    JOIN public.site_extraction_profiles sep ON sep.id = sepv.profile_id
    WHERE sepv.id = p_version_id
      AND sepv.status IN ('draft', 'validating');

    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Version not found or already activated/rejected'
            USING HINT = 'version_missing_or_invalid_status';
    END IF;

    -- Deactivate any currently active version for this profile
    UPDATE public.site_extraction_profile_versions
    SET status = 'retired',
        updated_at = now()
    WHERE profile_id = v_profile_id
      AND status = 'active';

    -- Activate the target version (partial unique index enforces single active)
    UPDATE public.site_extraction_profile_versions
    SET status = 'active',
        approved_by = p_approved_by,
        approved_at = now(),
        approval_note = p_approval_note,
        updated_at = now()
    WHERE id = p_version_id
      AND status IN ('draft', 'validating');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version not in draft/validating state or already activated'
            USING HINT = 'version_state_changed';
    END IF;

    -- Update profile's active_version_id and set status to active
    UPDATE public.site_extraction_profiles
    SET active_version_id = p_version_id,
        status = 'active',
        updated_at = now()
    WHERE id = v_profile_id;

    -- Build and return result
    SELECT jsonb_build_object(
        'profile_id', v_profile_id,
        'version_id', p_version_id,
        'status', 'active',
        'approved_by', p_approved_by,
        'approved_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'previous_version_retired', true
    ) INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.activate_profile_version IS
    'Atomically activates a profile version: deactivates current active version, '
    'sets new version to active with approval metadata, and updates profile row. '
    'See ADR 0009 and implementation plan §2.2/§6.';

-- =============================================================================
-- Auth hardening: SECURITY DEFINER requires explicit grants
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.activate_profile_version FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_profile_version TO service_role;
