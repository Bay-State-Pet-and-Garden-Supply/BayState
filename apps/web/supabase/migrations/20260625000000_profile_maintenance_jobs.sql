-- =============================================================================
-- Profile Maintenance Jobs & Artifacts
-- Dedicated async queue for Site Extraction Profile work.
-- See docs/plans/site-extraction-profiles-implementation-plan.md §1.4
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. profile_maintenance_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_maintenance_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL,
    status text NOT NULL DEFAULT 'queued',

    -- Scope identifiers (nullable; at least one SHOULD be set per job)
    brand_id uuid,
    source_slug text,
    canonical_domain text,
    profile_id uuid,
    profile_version_id uuid,
    browser_profile_id uuid,

    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Lease fields (mirrors enrichment_attempts + product_packaging_extractions)
    claimed_by text,
    lease_token text,
    lease_expires_at timestamptz,
    attempt_count int NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 3,

    -- Result fields
    result jsonb,
    error_code text,
    error_message text,

    -- Timestamps
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_maintenance_jobs OWNER TO postgres;

-- Constraints
ALTER TABLE public.profile_maintenance_jobs
    DROP CONSTRAINT IF EXISTS profile_maintenance_jobs_kind_check;
ALTER TABLE public.profile_maintenance_jobs
    ADD CONSTRAINT profile_maintenance_jobs_kind_check
    CHECK (kind = ANY (ARRAY[
        'verify_pdp_seed'::text,
        'draft_site_extraction_profile'::text,
        'validate_profile_version'::text,
        'browser_profile_setup'::text,
        'browser_profile_revalidate'::text
    ]));

ALTER TABLE public.profile_maintenance_jobs
    DROP CONSTRAINT IF EXISTS profile_maintenance_jobs_status_check;
ALTER TABLE public.profile_maintenance_jobs
    ADD CONSTRAINT profile_maintenance_jobs_status_check
    CHECK (status = ANY (ARRAY[
        'queued'::text,
        'claimed'::text,
        'running'::text,
        'succeeded'::text,
        'failed'::text,
        'timed_out'::text,
        'cancelled'::text
    ]));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profile_maintenance_jobs_status_lease
    ON public.profile_maintenance_jobs (status, lease_expires_at)
    WHERE status IN ('queued', 'claimed', 'running');

CREATE INDEX IF NOT EXISTS idx_profile_maintenance_jobs_kind_status
    ON public.profile_maintenance_jobs (kind, status);

CREATE INDEX IF NOT EXISTS idx_profile_maintenance_jobs_scope
    ON public.profile_maintenance_jobs (brand_id, source_slug, canonical_domain)
    WHERE brand_id IS NOT NULL;

-- Comments
COMMENT ON TABLE public.profile_maintenance_jobs IS
    'Dedicated async job queue for Brand Source Setup and Site Extraction Profile work. One row per job attempt lifecycle.';
COMMENT ON COLUMN public.profile_maintenance_jobs.kind IS
    'Job kind: verify_pdp_seed, draft_site_extraction_profile, validate_profile_version, browser_profile_setup, browser_profile_revalidate.';
COMMENT ON COLUMN public.profile_maintenance_jobs.status IS
    'Lifecycle state: queued, claimed, running, succeeded, failed, timed_out, cancelled.';
COMMENT ON COLUMN public.profile_maintenance_jobs.required_capabilities IS
    'Array of capability strings the runner must advertise to claim this job (e.g. ["profile_maintenance", "profile_maintenance.crawl4ai"]).';
COMMENT ON COLUMN public.profile_maintenance_jobs.lease_token IS
    'Unique token the runner must present to submit results or progress.';
COMMENT ON COLUMN public.profile_maintenance_jobs.lease_expires_at IS
    'When the current lease expires. Expired leases become claimable again up to max_attempts.';
COMMENT ON COLUMN public.profile_maintenance_jobs.attempt_count IS
    'How many times this job has been attempted (increments on each claim).';
COMMENT ON COLUMN public.profile_maintenance_jobs.result IS
    'Structured result payload produced by the runner on success.';
COMMENT ON COLUMN public.profile_maintenance_jobs.error_code IS
    'Machine-readable error code on terminal failure.';
COMMENT ON COLUMN public.profile_maintenance_jobs.error_message IS
    'Human-readable error message on terminal failure.';

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_profile_maintenance_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profile_maintenance_jobs_updated_at ON public.profile_maintenance_jobs;
CREATE TRIGGER trg_profile_maintenance_jobs_updated_at
    BEFORE UPDATE ON public.profile_maintenance_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_profile_maintenance_jobs_updated_at();

-- ---------------------------------------------------------------------------
-- 2. profile_maintenance_artifacts
-- Immutable evidence records with shared envelope + typed payload.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_maintenance_artifacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_version text NOT NULL DEFAULT 'v1',
    kind text NOT NULL,
    job_id uuid NOT NULL REFERENCES public.profile_maintenance_jobs(id) ON DELETE CASCADE,
    attempt_number int NOT NULL DEFAULT 1,

    -- Scope (denormalized for efficient querying)
    brand_id uuid,
    source_slug text,
    canonical_domain text,
    profile_id uuid,
    profile_version_id uuid,
    browser_profile_id uuid,

    -- Runner provenance
    runner_name text,
    runner_environment text DEFAULT 'production',
    runner_build_id text,

    -- Artifact status (job-triggered status, not review status)
    status text NOT NULL DEFAULT 'created',

    -- Schema & payload
    schema_version text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    evidence_refs jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Content integrity
    content_hash text,
    content_size_bytes bigint,
    content_type text,

    -- Review metadata (mutable)
    review_status text NOT NULL DEFAULT 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    review_comment text,
    review_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_maintenance_artifacts OWNER TO postgres;

-- Constraints
ALTER TABLE public.profile_maintenance_artifacts
    DROP CONSTRAINT IF EXISTS profile_maintenance_artifacts_kind_check;
ALTER TABLE public.profile_maintenance_artifacts
    ADD CONSTRAINT profile_maintenance_artifacts_kind_check
    CHECK (kind = ANY (ARRAY[
        'verify_pdp_seed'::text,
        'draft_site_extraction_profile'::text,
        'validate_profile_version'::text,
        'browser_profile_setup'::text,
        'browser_profile_revalidate'::text
    ]));

ALTER TABLE public.profile_maintenance_artifacts
    DROP CONSTRAINT IF EXISTS profile_maintenance_artifacts_status_check;
ALTER TABLE public.profile_maintenance_artifacts
    ADD CONSTRAINT profile_maintenance_artifacts_status_check
    CHECK (status = ANY (ARRAY[
        'created'::text,
        'reviewed'::text,
        'rejected'::text
    ]));

ALTER TABLE public.profile_maintenance_artifacts
    DROP CONSTRAINT IF EXISTS profile_maintenance_artifacts_review_status_check;
ALTER TABLE public.profile_maintenance_artifacts
    ADD CONSTRAINT profile_maintenance_artifacts_review_status_check
    CHECK (review_status = ANY (ARRAY[
        'pending'::text,
        'approved'::text,
        'rejected'::text,
        'needs_attention'::text
    ]));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profile_maintenance_artifacts_job
    ON public.profile_maintenance_artifacts (job_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_profile_maintenance_artifacts_kind
    ON public.profile_maintenance_artifacts (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_maintenance_artifacts_scope
    ON public.profile_maintenance_artifacts (brand_id, source_slug, canonical_domain)
    WHERE brand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profile_maintenance_artifacts_review
    ON public.profile_maintenance_artifacts (review_status)
    WHERE review_status = 'pending';

-- Comments
COMMENT ON TABLE public.profile_maintenance_artifacts IS
    'Immutable evidence records from profile-maintenance job runs. Shared envelope with typed payload. Bulky evidence stored in object storage; DB row holds durable refs and content hash.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.artifact_version IS
    'Version of the artifact envelope structure itself (not the job kind).';
COMMENT ON COLUMN public.profile_maintenance_artifacts.kind IS
    'Job kind that produced this artifact. Matches profile_maintenance_jobs.kind.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.job_id IS
    'FK to the profile_maintenance_jobs row that produced this artifact.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.attempt_number IS
    'Which attempt of the job produced this artifact. Artifacts are immutable per attempt; retries create new rows.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.runner_name IS
    'Runner name that produced this artifact.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.runner_environment IS
    'Runner environment (local, staging, production).';
COMMENT ON COLUMN public.profile_maintenance_artifacts.runner_build_id IS
    'Runner build identifier at time of artifact creation.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.status IS
    'Job-triggered status: created, reviewed, rejected.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.schema_version IS
    'Version of the typed payload schema for this artifact kind.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.payload IS
    'Typed payload for the specific artifact kind. Kept compact; bulky evidence goes to object storage via evidence_refs.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.evidence_refs IS
    'References to bulky evidence in object storage: { screenshots: [{url, hash, size, content_type}], ... }.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.content_hash IS
    'SHA-256 hash of the complete artifact content (payload + evidence_refs serialized).';
COMMENT ON COLUMN public.profile_maintenance_artifacts.content_size_bytes IS
    'Total size in bytes of the complete artifact content.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.content_type IS
    'MIME type of the artifact content.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.review_status IS
    'Mutable review state: pending, approved, rejected, needs_attention.';
COMMENT ON COLUMN public.profile_maintenance_artifacts.reviewed_by IS
    'Admin user UUID who performed the review (FK to auth.users).';
COMMENT ON COLUMN public.profile_maintenance_artifacts.review_comment IS
    'Human review comment.';

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_profile_maintenance_artifacts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profile_maintenance_artifacts_updated_at ON public.profile_maintenance_artifacts;
CREATE TRIGGER trg_profile_maintenance_artifacts_updated_at
    BEFORE UPDATE ON public.profile_maintenance_artifacts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_profile_maintenance_artifacts_updated_at();

-- Immutable evidence protection: BEFORE UPDATE trigger resets envelope/provenance/
-- payload/evidence/content fields to OLD values, preventing mutation of evidence
-- after creation. Only review/workflow metadata (review_status, reviewed_by,
-- reviewed_at, review_comment, review_metadata, updated_at) may be modified.
CREATE OR REPLACE FUNCTION public.protect_profile_maintenance_artifacts_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Enforce immutability of artifact envelope, provenance, payload, evidence, and content fields.
    -- Only review/workflow metadata may change after creation.
    NEW.artifact_version = OLD.artifact_version;
    NEW.kind = OLD.kind;
    NEW.job_id = OLD.job_id;
    NEW.attempt_number = OLD.attempt_number;
    NEW.brand_id = OLD.brand_id;
    NEW.source_slug = OLD.source_slug;
    NEW.canonical_domain = OLD.canonical_domain;
    NEW.profile_id = OLD.profile_id;
    NEW.profile_version_id = OLD.profile_version_id;
    NEW.browser_profile_id = OLD.browser_profile_id;
    NEW.runner_name = OLD.runner_name;
    NEW.runner_environment = OLD.runner_environment;
    NEW.runner_build_id = OLD.runner_build_id;
    NEW.status = OLD.status;
    NEW.schema_version = OLD.schema_version;
    NEW.payload = OLD.payload;
    NEW.evidence_refs = OLD.evidence_refs;
    NEW.content_hash = OLD.content_hash;
    NEW.content_size_bytes = OLD.content_size_bytes;
    NEW.content_type = OLD.content_type;
    NEW.created_at = OLD.created_at;
    -- Allow review/workflow metadata columns to change:
    -- review_status, reviewed_by, reviewed_at, review_comment, review_metadata, updated_at
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profile_maintenance_artifacts_immutability ON public.profile_maintenance_artifacts;
CREATE TRIGGER trg_profile_maintenance_artifacts_immutability
    BEFORE UPDATE ON public.profile_maintenance_artifacts
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_maintenance_artifacts_immutability();

COMMENT ON FUNCTION public.protect_profile_maintenance_artifacts_immutability() IS
    'BEFORE UPDATE trigger that enforces artifact evidence immutability. Resets envelope/provenance/payload/evidence/content fields to OLD values so only review/workflow metadata can be modified. See ADR 0011.';

-- ---------------------------------------------------------------------------
-- 3. RLS policies (matching pattern from 20260527000000_add_admin_runner_policies.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_maintenance_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_maintenance_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage profile maintenance jobs" ON public.profile_maintenance_jobs;
CREATE POLICY "Staff can manage profile maintenance jobs" ON public.profile_maintenance_jobs
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Authenticated users can read profile maintenance jobs" ON public.profile_maintenance_jobs;
CREATE POLICY "Authenticated users can read profile maintenance jobs" ON public.profile_maintenance_jobs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff can manage profile maintenance artifacts" ON public.profile_maintenance_artifacts;
CREATE POLICY "Staff can manage profile maintenance artifacts" ON public.profile_maintenance_artifacts
    FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Authenticated users can read profile maintenance artifacts" ON public.profile_maintenance_artifacts;
CREATE POLICY "Authenticated users can read profile maintenance artifacts" ON public.profile_maintenance_artifacts
    FOR SELECT TO authenticated USING (true);
