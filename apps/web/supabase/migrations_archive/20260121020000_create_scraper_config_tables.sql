-- Backfill: Create scraper_configs and scraper_config_versions tables BEFORE
-- 20260122000000_scraper_config_versions_rls.sql which references both.
-- The RLS migration has a circular FK issue: scraper_configs references
-- scraper_config_versions which is created after it.
-- CREATE TABLE IF NOT EXISTS makes this a no-op on existing databases.

-- Step 1: Create scraper_config_versions first
CREATE TABLE IF NOT EXISTS public.scraper_config_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL,
    schema_version VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'validated', 'published', 'archived')),
    version_number INTEGER NOT NULL,
    published_at TIMESTAMPTZ,
    published_by UUID,
    change_summary TEXT,
    validation_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    CONSTRAINT valid_status CHECK (status IN ('draft', 'validated', 'published', 'archived')),
    CONSTRAINT unique_version_per_config UNIQUE (config_id, version_number)
);

-- Step 2: Create scraper_configs with FK to scraper_config_versions (now exists)
CREATE TABLE IF NOT EXISTS public.scraper_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    domain VARCHAR(512),
    current_version_id UUID REFERENCES public.scraper_config_versions(id),
    schema_version VARCHAR(50) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID
);

-- Step 3: Add FK from versions to configs (circular dependency resolved)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'scraper_config_versions_config_id_fkey'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.scraper_config_versions
        ADD CONSTRAINT scraper_config_versions_config_id_fkey
        FOREIGN KEY (config_id) REFERENCES public.scraper_configs(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 4: Indexes
CREATE INDEX IF NOT EXISTS idx_scraper_configs_slug ON public.scraper_configs(slug);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_domain ON public.scraper_configs(domain);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_current_version ON public.scraper_configs(current_version_id);
CREATE INDEX IF NOT EXISTS idx_config_versions_config_status ON public.scraper_config_versions(config_id, status);
CREATE INDEX IF NOT EXISTS idx_config_versions_published ON public.scraper_config_versions(config_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_versions_latest ON public.scraper_config_versions(config_id, version_number DESC);
