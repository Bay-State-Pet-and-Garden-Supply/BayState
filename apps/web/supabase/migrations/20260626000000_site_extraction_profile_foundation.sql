-- =============================================================================
-- Site Extraction Profile Foundation Tables
-- Coordinator persistence layer for Site Extraction Profiles, Browser Profile
-- registry, validation, and explicit corrections.
-- See docs/adr/0009, 0010, 0011 and docs/plans/site-extraction-profiles-implementation-plan.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. site_extraction_profiles
-- One row per brand+source+domain extraction knowledge base.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_extraction_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    brand_source_id uuid REFERENCES public.brand_sources(id) ON DELETE SET NULL,
    source_slug text NOT NULL,
    source_type text NOT NULL,
    canonical_domain text NOT NULL,
    commerce_platform text,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'disabled', 'needs_attention')),
    active_version_id uuid,  -- FK to site_extraction_profile_versions, set atomically at approval time
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    profile_setup_completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_extraction_profiles OWNER TO postgres;

-- Unique owner index: brand_id + source_slug + canonical_domain
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_extraction_profiles_unique
    ON public.site_extraction_profiles (brand_id, source_slug, canonical_domain);

COMMENT ON TABLE public.site_extraction_profiles IS
    'Site Extraction Profile: governed extraction-knowledge base for a brand+source+domain. See ADR 0009.';
COMMENT ON COLUMN public.site_extraction_profiles.status IS
    'draft=not yet activated, active=in use by enrichment, disabled=explicitly off, needs_attention=validation/access issues.';
COMMENT ON COLUMN public.site_extraction_profiles.active_version_id IS
    'Points to the currently active version. Set atomically at approval time. Late-binding; no FK constraint.';
COMMENT ON COLUMN public.site_extraction_profiles.profile_setup_completed_at IS
    'Set when the admin completes the Brand Source Setup wizard for this profile (domain+PDP seed+draft optional).';

-- ---------------------------------------------------------------------------
-- 2. site_extraction_profile_versions
-- One row per reviewable revision of a profile's field evidence rules.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_extraction_profile_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.site_extraction_profiles(id) ON DELETE CASCADE,
    version_number int NOT NULL,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'validating', 'approved', 'active', 'retired', 'rejected')),
    rules jsonb NOT NULL DEFAULT '{}'::jsonb,
    compiled_crawl4ai_schema jsonb,
    version_hash text NOT NULL,
    created_from text NOT NULL DEFAULT 'manual'
        CHECK (created_from IN ('ai_schema_draft', 'explicit_correction', 'manual', 'rollback')),
    created_by uuid REFERENCES auth.users(id),
    approved_by uuid REFERENCES auth.users(id),
    approved_at timestamptz,
    approval_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (profile_id, version_number)
);

ALTER TABLE public.site_extraction_profile_versions OWNER TO postgres;

-- Partial unique index: only one active version per profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_extraction_profile_versions_active
    ON public.site_extraction_profile_versions (profile_id)
    WHERE status = 'active';

COMMENT ON TABLE public.site_extraction_profile_versions IS
    'Reviewable revisions of a Site Extraction Profile. Only one may be active at a time.';
COMMENT ON COLUMN public.site_extraction_profile_versions.rules IS
    'BayState Field Evidence Rules as declarative JSON. See ADR 0008.';
COMMENT ON COLUMN public.site_extraction_profile_versions.compiled_crawl4ai_schema IS
    'Compiled Crawl4AI JsonCssExtractionStrategy schema/config built from rules.';
COMMENT ON COLUMN public.site_extraction_profile_versions.version_hash IS
    'Deterministic hash of rules + compiled schema for replayability checks.';
COMMENT ON COLUMN public.site_extraction_profile_versions.created_from IS
    'How this version was created: ai_schema_draft, explicit_correction, manual, rollback.';

-- ---------------------------------------------------------------------------
-- 3. explicit_extraction_corrections
-- Field-level deliberate reusable corrections with accepted/rejected evidence
-- summaries. Does NOT store raw identity/browser state.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.explicit_extraction_corrections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    source_slug text NOT NULL,
    canonical_domain text NOT NULL,
    profile_id uuid REFERENCES public.site_extraction_profiles(id) ON DELETE SET NULL,
    profile_version_id uuid REFERENCES public.site_extraction_profile_versions(id) ON DELETE SET NULL,
    target_field text NOT NULL,
    correction_type text NOT NULL DEFAULT 'accepted'
        CHECK (correction_type IN ('accepted', 'rejected')),
    evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.explicit_extraction_corrections OWNER TO postgres;

COMMENT ON TABLE public.explicit_extraction_corrections IS
    'Field-level deliberate reusable extraction corrections. Links to brand/source/domain/profile/version. Stores compact accepted/rejected evidence summaries, not raw browser identity state.';
COMMENT ON COLUMN public.explicit_extraction_corrections.correction_type IS
    'accepted=evidence for a value that was accepted as correct, rejected=evidence for a value that was rejected.';
COMMENT ON COLUMN public.explicit_extraction_corrections.evidence_summary IS
    'Compact JSON summary of accepted or rejected evidence. No secrets, cookies, localStorage, auth headers, or browser profile files.';

-- ---------------------------------------------------------------------------
-- 4. product_detail_page_seeds
-- Known PDP URLs that anchor extraction knowledge for a brand+source+domain.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_detail_page_seeds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    source_slug text NOT NULL,
    canonical_domain text NOT NULL,
    url text NOT NULL,
    normalized_url text NOT NULL,
    trust_status text NOT NULL DEFAULT 'candidate'
        CHECK (trust_status IN ('candidate', 'verified', 'rejected', 'expired')),
    verification_artifact_id uuid REFERENCES public.profile_maintenance_artifacts(id) ON DELETE SET NULL,
    validation_case_id uuid,  -- FK to profile_validation_cases, set after case creation (late-binding, circular)
    created_by uuid REFERENCES auth.users(id),
    verified_by uuid REFERENCES auth.users(id),
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_detail_page_seeds OWNER TO postgres;

-- Unique PDP seed per brand/source/domain/normalized_url
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdp_seeds_unique_url
    ON public.product_detail_page_seeds (brand_id, source_slug, canonical_domain, normalized_url);

COMMENT ON TABLE public.product_detail_page_seeds IS
    'Known Product Detail Page URLs for a brand+source+domain. Used to bootstrap and validate extraction profiles.';
COMMENT ON COLUMN public.product_detail_page_seeds.trust_status IS
    'candidate=awaiting verification, verified=confirmed PDP, rejected=not a PDP, expired=no longer valid.';
COMMENT ON COLUMN public.product_detail_page_seeds.validation_case_id IS
    'FK to profile_validation_cases(id). Late-binding; set after auto-creation from verified seed.';

-- ---------------------------------------------------------------------------
-- 5. profile_validation_sets
-- Curated set of validation cases for a profile.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_validation_sets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.site_extraction_profiles(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_by uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_validation_sets OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_profile_validation_sets_profile
    ON public.profile_validation_sets (profile_id);

COMMENT ON TABLE public.profile_validation_sets IS
    'Curated set of validation cases for a profile. Seed cases auto-created from verified PDP seeds.';

-- ---------------------------------------------------------------------------
-- 6. profile_validation_cases
-- Individual test case within a validation set.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_validation_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_set_id uuid NOT NULL REFERENCES public.profile_validation_sets(id) ON DELETE CASCADE,
    case_type text NOT NULL DEFAULT 'seed'
        CHECK (case_type IN ('seed', 'correction', 'known_good', 'nearby_variant', 'gold')),
    pdp_seed_id uuid REFERENCES public.product_detail_page_seeds(id) ON DELETE SET NULL,
    target_url text NOT NULL,
    product_upc text,
    product_name text,
    expected_assertions jsonb NOT NULL DEFAULT '{}'::jsonb,
    latest_artifact_id uuid REFERENCES public.profile_maintenance_artifacts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_validation_cases OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_profile_validation_cases_set
    ON public.profile_validation_cases (validation_set_id);

COMMENT ON TABLE public.profile_validation_cases IS
    'Individual test case within a validation set. Each case targets one URL with expected assertions.';
COMMENT ON COLUMN public.profile_validation_cases.case_type IS
    'seed=from verified PDP seed, correction=from explicit correction, known_good=manually curated good case, nearby_variant=variant of a seed, gold=gold-standard test case.';

-- ---------------------------------------------------------------------------
-- 7. profile_validation_runs
-- Record of one validation execution against a profile version + validation set.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_validation_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_version_id uuid NOT NULL REFERENCES public.site_extraction_profile_versions(id) ON DELETE CASCADE,
    validation_set_id uuid NOT NULL REFERENCES public.profile_validation_sets(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'passed', 'failed', 'error')),
    summary_artifact_id uuid REFERENCES public.profile_maintenance_artifacts(id) ON DELETE SET NULL,
    result jsonb DEFAULT '{}'::jsonb,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_validation_runs OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_profile_validation_runs_version
    ON public.profile_validation_runs (profile_version_id);

COMMENT ON TABLE public.profile_validation_runs IS
    'Record of one validation execution against a profile version + validation set.';

-- ---------------------------------------------------------------------------
-- 8. browser_profiles (coordinator registry only)
-- Stores only setup/state metadata. Identity data stays in runner runtime storage.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.browser_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    source_slug text NOT NULL,
    canonical_domain text NOT NULL,
    status text NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'assigned', 'in_progress', 'validated', 'validation_failed', 'expired', 'revoked')),
    required boolean NOT NULL DEFAULT false,
    runner_name text,
    runner_pool text,
    environment text NOT NULL DEFAULT 'production',
    storage_ref text,
    last_validated_at timestamptz,
    stale_after timestamptz,
    last_validation_artifact_id uuid REFERENCES public.profile_maintenance_artifacts(id) ON DELETE SET NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.browser_profiles OWNER TO postgres;

-- Unique scoped registry per brand/source/domain/environment
CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_profiles_scope
    ON public.browser_profiles (brand_id, source_slug, canonical_domain, environment);

COMMENT ON TABLE public.browser_profiles IS
    'Coordinator registry for Browser Profiles. Identity data stays in runner runtime storage. See ADR 0010.';
COMMENT ON COLUMN public.browser_profiles.required IS
    'If true, extraction fails closed without a validated profile for this source/domain.';
COMMENT ON COLUMN public.browser_profiles.storage_ref IS
    'Opaque runner-local lookup key for the actual profile data. Not a path, secret, or cookie.';
COMMENT ON COLUMN public.browser_profiles.metadata IS
    'Non-secret coordinator metadata. No cookies, localStorage, user_data_dir, auth headers, token-bearing URLs, or runtime profile files.';

-- ---------------------------------------------------------------------------
-- 9. browser_profile_setup_requests
-- Lifecycle tracking for Browser Profile setup/revalidation requests.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.browser_profile_setup_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    browser_profile_id uuid NOT NULL REFERENCES public.browser_profiles(id) ON DELETE CASCADE,
    request_type text NOT NULL DEFAULT 'setup'
        CHECK (request_type IN ('setup', 'revalidate')),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled')),
    maintenance_job_id uuid REFERENCES public.profile_maintenance_jobs(id) ON DELETE SET NULL,
    target_pdp_seed_ids uuid[] DEFAULT '{}',
    target_capabilities jsonb DEFAULT '[]'::jsonb,
    assigned_runner text,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.browser_profile_setup_requests OWNER TO postgres;

CREATE INDEX IF NOT EXISTS idx_browser_profile_setup_requests_profile
    ON public.browser_profile_setup_requests (browser_profile_id);

COMMENT ON TABLE public.browser_profile_setup_requests IS
    'Tracks each Browser Profile setup or revalidation request through its lifecycle.';

-- ---------------------------------------------------------------------------
-- Auto-update updated_at triggers
-- Uses existing generic public.update_updated_at_column() from the baseline.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_site_extraction_profiles_updated_at ON public.site_extraction_profiles;
CREATE TRIGGER trg_site_extraction_profiles_updated_at
    BEFORE UPDATE ON public.site_extraction_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_site_extraction_profile_versions_updated_at ON public.site_extraction_profile_versions;
CREATE TRIGGER trg_site_extraction_profile_versions_updated_at
    BEFORE UPDATE ON public.site_extraction_profile_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_explicit_extraction_corrections_updated_at ON public.explicit_extraction_corrections;
CREATE TRIGGER trg_explicit_extraction_corrections_updated_at
    BEFORE UPDATE ON public.explicit_extraction_corrections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_product_detail_page_seeds_updated_at ON public.product_detail_page_seeds;
CREATE TRIGGER trg_product_detail_page_seeds_updated_at
    BEFORE UPDATE ON public.product_detail_page_seeds
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_profile_validation_sets_updated_at ON public.profile_validation_sets;
CREATE TRIGGER trg_profile_validation_sets_updated_at
    BEFORE UPDATE ON public.profile_validation_sets
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_profile_validation_cases_updated_at ON public.profile_validation_cases;
CREATE TRIGGER trg_profile_validation_cases_updated_at
    BEFORE UPDATE ON public.profile_validation_cases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_profile_validation_runs_updated_at ON public.profile_validation_runs;
CREATE TRIGGER trg_profile_validation_runs_updated_at
    BEFORE UPDATE ON public.profile_validation_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_browser_profiles_updated_at ON public.browser_profiles;
CREATE TRIGGER trg_browser_profiles_updated_at
    BEFORE UPDATE ON public.browser_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_browser_profile_setup_requests_updated_at ON public.browser_profile_setup_requests;
CREATE TRIGGER trg_browser_profile_setup_requests_updated_at
    BEFORE UPDATE ON public.browser_profile_setup_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS policies
-- Staff-only for all new tables. See docs/adr/0009, 0010. Do NOT add blanket
-- authenticated read policies per guardrails.
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_extraction_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_extraction_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.explicit_extraction_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_detail_page_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_validation_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_validation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_profile_setup_requests ENABLE ROW LEVEL SECURITY;

-- site_extraction_profiles
DROP POLICY IF EXISTS "Staff can manage site extraction profiles" ON public.site_extraction_profiles;
CREATE POLICY "Staff can manage site extraction profiles" ON public.site_extraction_profiles
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- site_extraction_profile_versions
DROP POLICY IF EXISTS "Staff can manage site extraction profile versions" ON public.site_extraction_profile_versions;
CREATE POLICY "Staff can manage site extraction profile versions" ON public.site_extraction_profile_versions
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- explicit_extraction_corrections
DROP POLICY IF EXISTS "Staff can manage explicit extraction corrections" ON public.explicit_extraction_corrections;
CREATE POLICY "Staff can manage explicit extraction corrections" ON public.explicit_extraction_corrections
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- product_detail_page_seeds
DROP POLICY IF EXISTS "Staff can manage product detail page seeds" ON public.product_detail_page_seeds;
CREATE POLICY "Staff can manage product detail page seeds" ON public.product_detail_page_seeds
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- profile_validation_sets
DROP POLICY IF EXISTS "Staff can manage profile validation sets" ON public.profile_validation_sets;
CREATE POLICY "Staff can manage profile validation sets" ON public.profile_validation_sets
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- profile_validation_cases
DROP POLICY IF EXISTS "Staff can manage profile validation cases" ON public.profile_validation_cases;
CREATE POLICY "Staff can manage profile validation cases" ON public.profile_validation_cases
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- profile_validation_runs
DROP POLICY IF EXISTS "Staff can manage profile validation runs" ON public.profile_validation_runs;
CREATE POLICY "Staff can manage profile validation runs" ON public.profile_validation_runs
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- browser_profiles
DROP POLICY IF EXISTS "Staff can manage browser profiles" ON public.browser_profiles;
CREATE POLICY "Staff can manage browser profiles" ON public.browser_profiles
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- browser_profile_setup_requests
DROP POLICY IF EXISTS "Staff can manage browser profile setup requests" ON public.browser_profile_setup_requests;
CREATE POLICY "Staff can manage browser profile setup requests" ON public.browser_profile_setup_requests
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());
