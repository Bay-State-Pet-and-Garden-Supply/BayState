-- Backfill: Create tables that were bootstrapped outside the migration system.
-- These tables are referenced by downstream migrations before they are formally
-- created. CREATE TABLE IF NOT EXISTS ensures idempotency for databases that
-- already have these tables.

-- ============================================================================
-- 1. products_ingestion
-- Referenced by 26 downstream migrations (starting from 20251230180000)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.products_ingestion (
    sku text PRIMARY KEY,
    input jsonb DEFAULT '{}'::jsonb,
    consolidated jsonb DEFAULT '{}'::jsonb,
    sources jsonb DEFAULT '{}'::jsonb,
    b2b_sources jsonb DEFAULT '{}'::jsonb,
    enrichment_config jsonb DEFAULT '{}'::jsonb,
    active_consolidation_review_id uuid,
    consolidation_review_status text DEFAULT 'pending',
    consolidation_review_updated_at timestamptz,
    pipeline_status text DEFAULT 'imported',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_ingestion_pipeline_status 
ON public.products_ingestion(pipeline_status);

CREATE INDEX IF NOT EXISTS idx_products_ingestion_sku 
ON public.products_ingestion(sku);

-- ============================================================================
-- 2. categories (hierarchical product categories)
-- Referenced by 20251231000002_security_hardening.sql and later migrations
-- Full definition also in 20260101001000_modern_ecommerce_schema.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
    display_order int DEFAULT 0,
    image_url text,
    is_featured boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);

-- ============================================================================
-- 3. product_types (simple lookup table, later dropped)
-- Referenced by 20251231000002_security_hardening.sql and later facet migrations
-- Dropped by 20260404133000_drop_products_category_column.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_types_name ON public.product_types(name);

-- ============================================================================
-- 4. Backfill missing products columns (externally bootstrapped)
-- These columns were added to products outside of migration system.
-- They are consumed and then dropped by 20260101000500_cleanup_product_schema.sql
-- and later migrations.
-- ============================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shopsite_product_type text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS upc text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shopsite_cost numeric(10, 2);

-- ============================================================================
-- 5. scrape_job_chunks
-- Referenced by 20260107150915_add_scrape_chunks_policy.sql (policy creation)
-- before CREATE TABLE in 20260211051500_claimable_scrape_units.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scrape_job_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    skus text[] NOT NULL DEFAULT '{}',
    scrapers text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    claimed_by text,
    claimed_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    results jsonb NOT NULL DEFAULT '{}',
    skus_processed integer NOT NULL DEFAULT 0,
    skus_successful integer NOT NULL DEFAULT 0,
    skus_failed integer NOT NULL DEFAULT 0,
    error_message text
);


