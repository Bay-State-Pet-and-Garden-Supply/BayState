-- Group-based Consolidation: Add Product Lines, Grouping Stage, and Classification Infrastructure
-- See docs/adr/0004-group-based-consolidation.md for full design

-- =============================================================================
-- 1. Create product_lines table (canonical taxonomy of manufacturer product lines)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.product_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text NOT NULL,
    normalized_key text NOT NULL,
    brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one canonical product line per brand per normalized key
ALTER TABLE public.product_lines
DROP CONSTRAINT IF EXISTS product_lines_brand_id_normalized_key_unique;
ALTER TABLE public.product_lines
ADD CONSTRAINT product_lines_brand_id_normalized_key_unique
UNIQUE (brand_id, normalized_key);

-- Index for lookup by normalized key
CREATE INDEX IF NOT EXISTS idx_product_lines_normalized_key
ON public.product_lines (normalized_key);

COMMENT ON TABLE public.product_lines IS
'Canonical manufacturer product lines assigned by AI classification during the grouping pipeline stage.';

COMMENT ON COLUMN public.product_lines.canonical_name IS
'Human-readable canonical name for the product line (e.g. "Blue Buffalo Life Protection Formula").';

COMMENT ON COLUMN public.product_lines.normalized_key IS
'Lowercase alphanumeric key for dedup matching (e.g. "bluebuffalolifeprotectionformula").';

COMMENT ON COLUMN public.product_lines.brand_id IS
'Optional brand FK. When set, the product_line is scoped to that brand and the (brand_id, normalized_key) pair must be unique.';

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_product_lines_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_lines_updated_at ON public.product_lines;
CREATE TRIGGER trg_product_lines_updated_at
    BEFORE UPDATE ON public.product_lines
    FOR EACH ROW
    EXECUTE FUNCTION public.set_product_lines_updated_at();

-- =============================================================================
-- 2. Add product_line_id FK to products_ingestion
-- =============================================================================
ALTER TABLE public.products_ingestion
ADD COLUMN IF NOT EXISTS product_line_id uuid REFERENCES public.product_lines(id) ON DELETE SET NULL;

-- Update comment on existing product_line column to note it's denormalized
COMMENT ON COLUMN public.products_ingestion.product_line IS
'Denormalized display label for the product line. Source of truth is product_lines.canonical_name via product_line_id FK.';

CREATE INDEX IF NOT EXISTS idx_products_ingestion_product_line_id
ON public.products_ingestion (product_line_id);

CREATE INDEX IF NOT EXISTS idx_products_ingestion_status_product_line_id
ON public.products_ingestion (pipeline_status, product_line_id);

-- =============================================================================
-- 3. Add grouping metadata columns to products_ingestion
-- =============================================================================
ALTER TABLE public.products_ingestion
ADD COLUMN IF NOT EXISTS product_line_confidence numeric;

ALTER TABLE public.products_ingestion
ADD COLUMN IF NOT EXISTS product_line_assignment_source text
CHECK (product_line_assignment_source IN ('ai', 'manual', 'migration'));

ALTER TABLE public.products_ingestion
ADD COLUMN IF NOT EXISTS product_line_raw_label text;

ALTER TABLE public.products_ingestion
ADD COLUMN IF NOT EXISTS product_line_rationale text;

ALTER TABLE public.products_ingestion
ADD COLUMN IF NOT EXISTS product_line_review_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products_ingestion.product_line_confidence IS
'Classification confidence score (0.0-1.0). Products below 0.80 become Singletons (ungrouped).';

COMMENT ON COLUMN public.products_ingestion.product_line_assignment_source IS
'How this assignment was made: ai (classification), manual (operator edit), or migration (big-bang backfill).';

COMMENT ON COLUMN public.products_ingestion.product_line_raw_label IS
'Raw LLM output label before dedup normalization. Used for audit trail and fuzzy dedup debugging.';

COMMENT ON COLUMN public.products_ingestion.product_line_rationale IS
'LLM rationale text explaining why this product was assigned to this product line.';

COMMENT ON COLUMN public.products_ingestion.product_line_review_required IS
'Flag indicating operator review is needed (ambiguous dedup, manual override requested, etc.).';

-- =============================================================================
-- 4. Add grouping to pipeline_status_five enum
-- =============================================================================
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in Postgres < 13.
-- This migration MUST run outside a transaction (or use a separate migration step).
ALTER TYPE public.pipeline_status_five ADD VALUE IF NOT EXISTS 'grouping';

-- =============================================================================
-- 5. Add product_line_classification to batch_jobs execution_mode check constraint
-- =============================================================================
ALTER TABLE public.batch_jobs
DROP CONSTRAINT IF EXISTS batch_jobs_execution_mode_check;

ALTER TABLE public.batch_jobs
ADD CONSTRAINT batch_jobs_execution_mode_check
CHECK (execution_mode = ANY (ARRAY[
    'batch_api'::text,
    'direct_chat_chunks'::text,
    'gemini_batch'::text,
    'product_line_classification'::text
]));

COMMENT ON COLUMN public.batch_jobs.execution_mode IS
'Execution path: batch_api for provider Batch API, direct_chat_chunks for LM Studio/DeepSeek direct chat, gemini_batch for Gemini Batch API with File API, product_line_classification for AI-driven product line grouping.';

-- =============================================================================
-- 6. Add batch_job_items subject metadata for group-level work items
-- =============================================================================
ALTER TABLE public.batch_job_items
ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'upc'
CHECK (item_kind IN ('upc', 'product_group', 'subproduct_group'));

ALTER TABLE public.batch_job_items
ADD COLUMN IF NOT EXISTS subject_key text;

COMMENT ON COLUMN public.batch_job_items.item_kind IS
'Kind of work item: upc (legacy per-product for consolidation/direct-chat), product_group (group consolidation for a whole product line), subproduct_group (subgroup within a product line for oversized groups).';

COMMENT ON COLUMN public.batch_job_items.subject_key IS
'Subject identifier: UPC string for item_kind=upc, product_line_id for item_kind=product_group, subgroup key for item_kind=subproduct_group.';

-- Backfill existing rows with 'upc' and subject_key = upc
UPDATE public.batch_job_items
SET item_kind = 'upc',
    subject_key = upc
WHERE item_kind = 'upc' AND subject_key IS NULL;

-- Make upc nullable for group items (which don't have a single UPC)
ALTER TABLE public.batch_job_items
ALTER COLUMN upc DROP NOT NULL;

-- Create partial unique index for per-UPC items
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_job_items_upc_unique
ON public.batch_job_items (batch_job_id, upc)
WHERE upc IS NOT NULL;

-- Create a unique constraint for group items (one item per group per batch)
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_job_items_group_unique
ON public.batch_job_items (batch_job_id, item_kind, subject_key)
WHERE item_kind IN ('product_group', 'subproduct_group');
