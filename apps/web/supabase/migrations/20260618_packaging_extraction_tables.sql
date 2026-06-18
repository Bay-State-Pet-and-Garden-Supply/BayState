-- Packaging Vision & Title Normalization: extraction tables, title suggestions, and orchestration.
-- See ocr-context/packaging-vision-implementation-plan.md for full design.

-- =============================================================================
-- 1. product_packaging_extractions
-- First-class attempt/history table for OCR/VLM packaging evidence extraction.
-- Each row represents one packaging extraction attempt for one UPC.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.product_packaging_extractions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    upc text NOT NULL,
    workflow_run_id uuid,
    status text NOT NULL,
    trigger text NOT NULL,
    is_stale boolean NOT NULL DEFAULT false,
    claimed_by text,
    lease_token text,
    lease_expires_at timestamptz,
    attempt_count int NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 2,
    provider text NOT NULL DEFAULT 'local_openai_compatible',
    model text,
    prompt_version text NOT NULL,
    schema_version text NOT NULL,
    image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
    image_fingerprints jsonb NOT NULL DEFAULT '[]'::jsonb,
    image_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
    raw_text text,
    structured_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
    field_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    overall_confidence numeric,
    conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
    usage jsonb NOT NULL DEFAULT '{}'::jsonb,
    debug_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_code text,
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_packaging_extractions OWNER TO postgres;

-- Constraints
ALTER TABLE public.product_packaging_extractions
DROP CONSTRAINT IF EXISTS product_packaging_extractions_status_check;

ALTER TABLE public.product_packaging_extractions
ADD CONSTRAINT product_packaging_extractions_status_check
CHECK (status = ANY (ARRAY[
    'queued'::text,
    'claimed'::text,
    'running'::text,
    'succeeded'::text,
    'failed'::text,
    'timed_out'::text,
    'skipped_no_images'::text,
    'stale'::text
]));

ALTER TABLE public.product_packaging_extractions
DROP CONSTRAINT IF EXISTS product_packaging_extractions_trigger_check;

ALTER TABLE public.product_packaging_extractions
ADD CONSTRAINT product_packaging_extractions_trigger_check
CHECK (trigger = ANY (ARRAY[
    'consolidation'::text,
    'image_selection'::text,
    'manual_rerun'::text,
    'gold_eval'::text
]));

ALTER TABLE public.product_packaging_extractions
DROP CONSTRAINT IF EXISTS product_packaging_extractions_overall_confidence_check;

ALTER TABLE public.product_packaging_extractions
ADD CONSTRAINT product_packaging_extractions_overall_confidence_check
CHECK (
    overall_confidence IS NULL
    OR (overall_confidence >= 0::numeric AND overall_confidence <= 1::numeric)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_packaging_extractions_status_lease
ON public.product_packaging_extractions (status, lease_expires_at)
WHERE status IN ('queued', 'claimed', 'running');

CREATE INDEX IF NOT EXISTS idx_product_packaging_extractions_upc_latest
ON public.product_packaging_extractions (upc, is_stale, completed_at DESC)
WHERE status = 'succeeded';

CREATE INDEX IF NOT EXISTS idx_product_packaging_extractions_workflow_run
ON public.product_packaging_extractions (workflow_run_id);

-- Comments
COMMENT ON TABLE public.product_packaging_extractions IS
'Records every OCR/VLM packaging image extraction attempt per UPC. One status row per attempt — history is preserved.';

COMMENT ON COLUMN public.product_packaging_extractions.upc IS
'Product UPC this extraction is for.';

COMMENT ON COLUMN public.product_packaging_extractions.workflow_run_id IS
'Optional FK to pipeline_workflow_runs. Set when this extraction was triggered by a consolidation workflow.';

COMMENT ON COLUMN public.product_packaging_extractions.status IS
'Current lifecycle state: queued, claimed, running, succeeded, failed, timed_out, skipped_no_images, stale.';

COMMENT ON COLUMN public.product_packaging_extractions.trigger IS
'What caused this extraction: consolidation, image_selection, manual_rerun, or gold_eval.';

COMMENT ON COLUMN public.product_packaging_extractions.is_stale IS
'True when input images, prompt version, model version, or schema version have changed since this extraction completed.';

COMMENT ON COLUMN public.product_packaging_extractions.claimed_by IS
'Runner name that claimed this job.';

COMMENT ON COLUMN public.product_packaging_extractions.lease_token IS
'Unique lease token the runner must present to submit results.';

COMMENT ON COLUMN public.product_packaging_extractions.lease_expires_at IS
'When the current lease expires. Expired leases become claimable again up to max_attempts.';

COMMENT ON COLUMN public.product_packaging_extractions.attempt_count IS
'How many times this extraction has been attempted (increments on each claim).';

COMMENT ON COLUMN public.product_packaging_extractions.max_attempts IS
'Maximum retries allowed before this row is permanently failed.';

COMMENT ON COLUMN public.product_packaging_extractions.provider IS
'LLM provider used for extraction (e.g. local_openai_compatible, gemini).';

COMMENT ON COLUMN public.product_packaging_extractions.model IS
'Model name used (e.g. qwen2.5-vl-7b-instruct).';

COMMENT ON COLUMN public.product_packaging_extractions.prompt_version IS
'Version of the extraction prompt used.';

COMMENT ON COLUMN public.product_packaging_extractions.schema_version IS
'Version of the structured_facts output schema used.';

COMMENT ON COLUMN public.product_packaging_extractions.image_urls IS
'Original image URLs used for this extraction.';

COMMENT ON COLUMN public.product_packaging_extractions.image_fingerprints IS
'SHA-256 fingerprints of processed image bytes for staleness detection.';

COMMENT ON COLUMN public.product_packaging_extractions.image_metadata IS
'Metadata per image: source_url, content_type, width, height, bytes, sha256.';

COMMENT ON COLUMN public.product_packaging_extractions.raw_text IS
'Raw OCR/VLM output text from the extraction.';

COMMENT ON COLUMN public.product_packaging_extractions.structured_facts IS
'Structured identity fields extracted from packaging: brand, packaging_title, variant, flavor, color, scent, material, size, weight, count, product_type, claims, etc.';

COMMENT ON COLUMN public.product_packaging_extractions.field_confidence IS
'Per-field confidence scores (0.0-1.0). Keys match structured_facts.';

COMMENT ON COLUMN public.product_packaging_extractions.overall_confidence IS
'Overall extraction confidence score (0.0-1.0). NULL if extraction failed or skipped.';

COMMENT ON COLUMN public.product_packaging_extractions.conflicts IS
'Detected conflicts between packaging evidence and existing text sources.';

COMMENT ON COLUMN public.product_packaging_extractions.usage IS
'Token usage, cost, latency metrics from the extraction call.';

COMMENT ON COLUMN public.product_packaging_extractions.debug_metadata IS
'Additional debug metadata: model endpoint, response headers, timing breakdown.';

COMMENT ON COLUMN public.product_packaging_extractions.error_code IS
'Machine-readable error code on failure (e.g. invalid_model_output, timeout, network_error).';

COMMENT ON COLUMN public.product_packaging_extractions.error_message IS
'Human-readable error message on failure.';

COMMENT ON COLUMN public.product_packaging_extractions.started_at IS
'When the runner started processing this extraction.';

COMMENT ON COLUMN public.product_packaging_extractions.completed_at IS
'When the extraction completed or failed.';

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_product_packaging_extractions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_packaging_extractions_updated_at ON public.product_packaging_extractions;
CREATE TRIGGER trg_product_packaging_extractions_updated_at
    BEFORE UPDATE ON public.product_packaging_extractions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_product_packaging_extractions_updated_at();

-- =============================================================================
-- 2. product_title_suggestions
-- Derived normalized title suggestions from packaging extraction evidence.
-- A packaging extraction may produce zero, one, or multiple suggestions over its lifetime.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.product_title_suggestions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    upc text NOT NULL,
    workflow_run_id uuid,
    packaging_extraction_id uuid REFERENCES public.product_packaging_extractions(id) ON DELETE SET NULL,
    suggestion_type text NOT NULL DEFAULT 'packaging_vision',
    title text NOT NULL,
    confidence_score numeric,
    field_confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    composer_version text NOT NULL,
    mode text NOT NULL,
    reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'created',
    applied_at timestamptz,
    applied_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_title_suggestions OWNER TO postgres;

-- Constraints
ALTER TABLE public.product_title_suggestions
DROP CONSTRAINT IF EXISTS product_title_suggestions_confidence_score_check;

ALTER TABLE public.product_title_suggestions
ADD CONSTRAINT product_title_suggestions_confidence_score_check
CHECK (
    confidence_score IS NULL
    OR (confidence_score >= 0::numeric AND confidence_score <= 1::numeric)
);

ALTER TABLE public.product_title_suggestions
DROP CONSTRAINT IF EXISTS product_title_suggestions_status_check;

ALTER TABLE public.product_title_suggestions
ADD CONSTRAINT product_title_suggestions_status_check
CHECK (status = ANY (ARRAY[
    'created'::text,
    'shown'::text,
    'applied'::text,
    'rejected'::text,
    'stale'::text
]));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_title_suggestions_upc_created
ON public.product_title_suggestions (upc, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_title_suggestions_workflow_run
ON public.product_title_suggestions (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_product_title_suggestions_extraction
ON public.product_title_suggestions (packaging_extraction_id);

-- Comments
COMMENT ON TABLE public.product_title_suggestions IS
'Normalized title suggestions derived from packaging extraction evidence plus consolidation context. Each row is one suggestion candidate.';

COMMENT ON COLUMN public.product_title_suggestions.upc IS
'Product UPC this title suggestion is for.';

COMMENT ON COLUMN public.product_title_suggestions.workflow_run_id IS
'Optional FK to pipeline_workflow_runs linking this suggestion to the orchestration workflow that created it.';

COMMENT ON COLUMN public.product_title_suggestions.packaging_extraction_id IS
'FK to the product_packaging_extractions row whose evidence produced this suggestion.';

COMMENT ON COLUMN public.product_title_suggestions.suggestion_type IS
'Type of title suggestion (e.g. packaging_vision, manual_correction).';

COMMENT ON COLUMN public.product_title_suggestions.title IS
'The normalized BayState/ShopSite-style product title.';

COMMENT ON COLUMN public.product_title_suggestions.confidence_score IS
'Overall confidence in this suggestion (0.0-1.0).';

COMMENT ON COLUMN public.product_title_suggestions.field_confidence IS
'Per-field confidence scores for the title components.';

COMMENT ON COLUMN public.product_title_suggestions.composer_version IS
'Version of the deterministic title composer that produced this suggestion.';

COMMENT ON COLUMN public.product_title_suggestions.mode IS
'The packaging_title_mode under which this suggestion was created: shadow, suggestion, auto_draft_high_confidence.';

COMMENT ON COLUMN public.product_title_suggestions.reasons IS
'Human-readable reasons why this title was suggested (field confidence, override source, conflict resolution).';

COMMENT ON COLUMN public.product_title_suggestions.conflicts IS
'Conflicts encountered between packaging evidence and existing text sources.';

COMMENT ON COLUMN public.product_title_suggestions.status IS
'Lifecycle: created, shown, applied, rejected, stale.';

COMMENT ON COLUMN public.product_title_suggestions.applied_at IS
'When this suggestion was applied to the product draft.';

COMMENT ON COLUMN public.product_title_suggestions.applied_by IS
'Admin user UUID who applied this suggestion, NULL if auto-applied.';

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_product_title_suggestions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_title_suggestions_updated_at ON public.product_title_suggestions;
CREATE TRIGGER trg_product_title_suggestions_updated_at
    BEFORE UPDATE ON public.product_title_suggestions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_product_title_suggestions_updated_at();

-- =============================================================================
-- 3. pipeline_workflow_runs
-- Lightweight orchestration table for packaging-aware consolidation workflows.
-- Tracks the lifecycle of a "consolidate with packaging" request from queue through completion.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.pipeline_workflow_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL,
    status text NOT NULL,
    upcs text[] NOT NULL DEFAULT '{}'::text[],
    groups jsonb NOT NULL DEFAULT '[]'::jsonb,
    packaging_title_mode text NOT NULL DEFAULT 'shadow',
    fallback_policy text NOT NULL DEFAULT 'none',
    packaging_timeout_seconds int NOT NULL DEFAULT 600,
    batch_job_id uuid,
    created_by uuid,
    error_message text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_workflow_runs OWNER TO postgres;

-- Constraints
ALTER TABLE public.pipeline_workflow_runs
DROP CONSTRAINT IF EXISTS pipeline_workflow_runs_kind_check;

ALTER TABLE public.pipeline_workflow_runs
ADD CONSTRAINT pipeline_workflow_runs_kind_check
CHECK (kind = ANY (ARRAY[
    'consolidation_with_packaging'::text
]));

ALTER TABLE public.pipeline_workflow_runs
DROP CONSTRAINT IF EXISTS pipeline_workflow_runs_status_check;

ALTER TABLE public.pipeline_workflow_runs
ADD CONSTRAINT pipeline_workflow_runs_status_check
CHECK (status = ANY (ARRAY[
    'queued'::text,
    'waiting_on_packaging'::text,
    'consolidating'::text,
    'completed'::text,
    'failed'::text,
    'cancelled'::text
]));

ALTER TABLE public.pipeline_workflow_runs
DROP CONSTRAINT IF EXISTS pipeline_workflow_runs_packaging_title_mode_check;

ALTER TABLE public.pipeline_workflow_runs
ADD CONSTRAINT pipeline_workflow_runs_packaging_title_mode_check
CHECK (packaging_title_mode = ANY (ARRAY[
    'disabled'::text,
    'shadow'::text,
    'suggestion'::text,
    'auto_draft_high_confidence'::text
]));

ALTER TABLE public.pipeline_workflow_runs
DROP CONSTRAINT IF EXISTS pipeline_workflow_runs_fallback_policy_check;

ALTER TABLE public.pipeline_workflow_runs
ADD CONSTRAINT pipeline_workflow_runs_fallback_policy_check
CHECK (fallback_policy = ANY (ARRAY[
    'none'::text,
    'external_api'::text
]));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_workflow_runs_status
ON public.pipeline_workflow_runs (status, created_at DESC);

-- Comments
COMMENT ON TABLE public.pipeline_workflow_runs IS
'Orchestration runs for packaging-aware consolidation workflows. Tracks one end-to-end "consolidate with packaging" request.';

COMMENT ON COLUMN public.pipeline_workflow_runs.kind IS
'Workflow kind: consolidation_with_packaging. Future: title_rerun, bulk_packaging_extraction.';

COMMENT ON COLUMN public.pipeline_workflow_runs.status IS
'Workflow stage: queued, waiting_on_packaging, consolidating, completed, failed, cancelled.';

COMMENT ON COLUMN public.pipeline_workflow_runs.upcs IS
'Array of UPCs included in this workflow run.';

COMMENT ON COLUMN public.pipeline_workflow_runs.groups IS
'Array of product group objects (product_line_id + upcs) for group consolidation.';

COMMENT ON COLUMN public.pipeline_workflow_runs.packaging_title_mode IS
'Active mode: disabled, shadow, suggestion, auto_draft_high_confidence.';

COMMENT ON COLUMN public.pipeline_workflow_runs.fallback_policy IS
'External API fallback policy: none (default), external_api.';

COMMENT ON COLUMN public.pipeline_workflow_runs.packaging_timeout_seconds IS
'How many seconds to wait for packaging extraction before proceeding without it.';

COMMENT ON COLUMN public.pipeline_workflow_runs.batch_job_id IS
'FK to batch_jobs.id once the consolidation batch is created.';

COMMENT ON COLUMN public.pipeline_workflow_runs.created_by IS
'Admin user UUID who initiated this workflow. NULL for system-triggered runs.';

COMMENT ON COLUMN public.pipeline_workflow_runs.error_message IS
'Error message if the workflow failed.';

COMMENT ON COLUMN public.pipeline_workflow_runs.metadata IS
'Flexible metadata: source cohort, options, audit context, etc.';

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_pipeline_workflow_runs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pipeline_workflow_runs_updated_at ON public.pipeline_workflow_runs;
CREATE TRIGGER trg_pipeline_workflow_runs_updated_at
    BEFORE UPDATE ON public.pipeline_workflow_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_pipeline_workflow_runs_updated_at();

-- =============================================================================
-- 4. Site settings entries
-- Global defaults for packaging title mode, fallback policy, and timeout.
-- =============================================================================
INSERT INTO public.site_settings (key, value) VALUES
('packaging_title_mode', '"shadow"'::jsonb),
('packaging_fallback_policy', '"none"'::jsonb),
('packaging_timeout_seconds', '600'::jsonb)
ON CONFLICT (key) DO NOTHING;
