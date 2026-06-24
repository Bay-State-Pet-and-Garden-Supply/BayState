-- Migration: Scraper Config Versioned Tables + RLS
-- Version: 1.0
-- Created: 2026-01-22
-- Purpose: Add versioned scraper config tables with RLS policies for operational safety

-- Step 1: Create versioned scraper config tables (if not exist)
-- These tables support the new publish workflow: Draft -> Validate -> Publish

-- Table: scraper_configs (Stable identity for each scraper)
CREATE TABLE IF NOT EXISTS public.scraper_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    domain VARCHAR(512),
    current_version_id UUID,
    schema_version VARCHAR(50) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT fk_current_version
        FOREIGN KEY (current_version_id)
        REFERENCES public.scraper_config_versions(id)
);

-- Table: scraper_config_versions (Immutable versions)
CREATE TABLE IF NOT EXISTS public.scraper_config_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES public.scraper_configs(id) ON DELETE CASCADE,
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
    created_by UUID REFERENCES auth.users(id),

    CONSTRAINT valid_status CHECK (status IN ('draft', 'validated', 'published', 'archived')),
    CONSTRAINT unique_version_per_config UNIQUE (config_id, version_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scraper_configs_slug ON public.scraper_configs(slug);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_domain ON public.scraper_configs(domain);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_current_version ON public.scraper_configs(current_version_id);
CREATE INDEX IF NOT EXISTS idx_config_versions_config_status ON public.scraper_config_versions(config_id, status);
CREATE INDEX IF NOT EXISTS idx_config_versions_published ON public.scraper_config_versions(config_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_versions_latest ON public.scraper_config_versions(config_id, version_number DESC);

-- Comments for documentation
COMMENT ON TABLE public.scraper_config_versions IS 'Immutable versions of scraper configs. Published versions cannot be modified.';
COMMENT ON COLUMN public.scraper_config_versions.status IS 'Lifecycle: draft -> validated -> published -> archived';
COMMENT ON COLUMN public.scraper_config_versions.config IS 'Full scraper configuration as JSONB. Includes selectors, workflows, validation, anti_detection settings.';

-- Step 2: Enable RLS on versioned tables
ALTER TABLE public.scraper_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_config_versions ENABLE ROW LEVEL SECURITY;

-- Step 3: RLS Policies for scraper_configs table

-- SELECT: Authenticated users can view all scraper configs
CREATE POLICY "Authenticated users can read scraper configs"
    ON public.scraper_configs
    FOR SELECT
    TO authenticated
    USING (true);

-- INSERT: Authenticated users can create new scraper configs
CREATE POLICY "Authenticated users can create scraper configs"
    ON public.scraper_configs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE: Only staff can update scraper config metadata (slug, display_name, domain)
-- Current version pointer is updated via stored procedure or API
CREATE POLICY "Staff can update scraper config metadata"
    ON public.scraper_configs
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- DELETE: Only admins can delete scraper configs (cascades to versions)
CREATE POLICY "Admins can delete scraper configs"
    ON public.scraper_configs
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Step 4: RLS Policies for scraper_config_versions table

-- SELECT: CRITICAL - Runners see only published versions
-- This is the key safety guarantee: drafts are invisible to runners
CREATE POLICY "Runners can read published versions"
    ON public.scraper_config_versions
    FOR SELECT
    TO authenticated
    USING (status = 'published');

-- SELECT: Authenticated users (admins/staff) can see all versions including drafts
CREATE POLICY "Staff can read all versions"
    ON public.scraper_config_versions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- INSERT: Authenticated users can create draft versions
CREATE POLICY "Authenticated users can create draft versions"
    ON public.scraper_config_versions
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE: Only drafts can be updated
-- Published versions: NO UPDATE ALLOWED (immutable pattern)
CREATE POLICY "Users can update draft versions"
    ON public.scraper_config_versions
    FOR UPDATE
    TO authenticated
    USING (status = 'draft')
    WITH CHECK (status = 'draft');

-- DELETE: Only drafts can be deleted
CREATE POLICY "Users can delete draft versions"
    ON public.scraper_config_versions
    FOR DELETE
    TO authenticated
    USING (status = 'draft');

-- Step 5: Helper function for next version number
CREATE OR REPLACE FUNCTION public.get_next_version_number(p_config_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_max_version
    FROM public.scraper_config_versions
    WHERE config_id = p_config_id;
    RETURN v_max_version;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_next_version_number(UUID) TO authenticated;

-- Step 6: Trigger function for updated_at on scraper_configs
CREATE OR REPLACE FUNCTION update_scraper_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scraper_configs_updated_at_trigger ON public.scraper_configs;
CREATE TRIGGER scraper_configs_updated_at_trigger
    BEFORE UPDATE ON public.scraper_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_scraper_configs_updated_at();
