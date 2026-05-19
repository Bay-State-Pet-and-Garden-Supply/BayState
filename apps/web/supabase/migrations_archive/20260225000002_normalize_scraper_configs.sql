-- ============================================================================
-- NORMALIZE: Scraper Configuration Schema
-- Created: 2026-02-25
-- ============================================================================
-- This migration creates the normalized schema for scraper configurations:
-- 1. Adds scraper_type and base_url to scraper_configs
-- 2. Adds structured JSONB columns to scraper_config_versions
-- 3. Creates scraper_selectors table
-- 4. Creates scraper_workflow_steps table
-- 5. Enables RLS on new tables with admin/staff pattern
-- ============================================================================

-- =============================================================================
-- STEP 1: Add columns to scraper_configs
-- =============================================================================

-- Add scraper_type column (static or agentic)
ALTER TABLE public.scraper_configs 
ADD COLUMN IF NOT EXISTS scraper_type TEXT NOT NULL DEFAULT 'static' 
CHECK (scraper_type IN ('static', 'agentic'));

-- Add base_url column
ALTER TABLE public.scraper_configs 
ADD COLUMN IF NOT EXISTS base_url TEXT;

-- Add domain column if not exists (should exist from prior migration)
ALTER TABLE public.scraper_configs 
ADD COLUMN IF NOT EXISTS domain TEXT;

-- =============================================================================
-- STEP 2: Add structured JSONB columns to scraper_config_versions
-- These replace the mega-blob approach with granular columns
-- =============================================================================

ALTER TABLE public.scraper_config_versions
ADD COLUMN IF NOT EXISTS ai_config JSONB,
ADD COLUMN IF NOT EXISTS anti_detection JSONB,
ADD COLUMN IF NOT EXISTS validation_config JSONB,
ADD COLUMN IF NOT EXISTS login_config JSONB,
ADD COLUMN IF NOT EXISTS http_status_config JSONB,
ADD COLUMN IF NOT EXISTS normalization_config JSONB,
ADD COLUMN IF NOT EXISTS timeout INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS retries INT DEFAULT 3,
ADD COLUMN IF NOT EXISTS image_quality INT DEFAULT 50;

-- Note: Keep original `config` column for backward compatibility during migration
-- It will be dropped in a later migration after verification

-- =============================================================================
-- STEP 3: Create scraper_selectors table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scraper_selectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.scraper_config_versions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    selector TEXT NOT NULL,
    attribute TEXT DEFAULT 'text',
    multiple BOOLEAN DEFAULT false,
    required BOOLEAN DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scraper_selectors_version ON public.scraper_selectors(version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_selectors_version_order ON public.scraper_selectors(version_id, sort_order);

-- Comments
COMMENT ON TABLE public.scraper_selectors IS 'CSS/XPath selectors for extracting data from web pages, organized by config version.';
COMMENT ON COLUMN public.scraper_selectors.version_id IS 'Foreign key to scraper_config_versions';
COMMENT ON COLUMN public.scraper_selectors.name IS 'Human-readable name for the selector (e.g., product_title, price)';
COMMENT ON COLUMN public.scraper_selectors.selector IS 'CSS or XPath selector string';
COMMENT ON COLUMN public.scraper_selectors.attribute IS 'HTML attribute to extract (default: text)';
COMMENT ON COLUMN public.scraper_selectors.multiple IS 'Whether to extract multiple values (array)';
COMMENT ON COLUMN public.scraper_selectors.required IS 'Whether this selector must match for the page to be considered valid';
COMMENT ON COLUMN public.scraper_selectors.sort_order IS 'Display order of selectors';

-- =============================================================================
-- STEP 4: Create scraper_workflow_steps table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scraper_workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES public.scraper_config_versions(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    name TEXT,
    params JSONB DEFAULT '{}',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scraper_workflow_steps_version ON public.scraper_workflow_steps(version_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_workflow_steps_version_order ON public.scraper_workflow_steps(version_id, sort_order);

-- Comments
COMMENT ON TABLE public.scraper_workflow_steps IS 'Workflow steps/actions for scraper execution, organized by config version.';
COMMENT ON COLUMN public.scraper_workflow_steps.version_id IS 'Foreign key to scraper_config_versions';
COMMENT ON COLUMN public.scraper_workflow_steps.action IS 'Action type (navigate, extract, wait, click, etc.)';
COMMENT ON COLUMN public.scraper_workflow_steps.name IS 'Human-readable name for the step';
COMMENT ON COLUMN public.scraper_workflow_steps.params IS 'JSON parameters for the action';
COMMENT ON COLUMN public.scraper_workflow_steps.sort_order IS 'Execution order of steps';

-- =============================================================================
-- STEP 5: Enable RLS on new tables
-- =============================================================================

ALTER TABLE public.scraper_selectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_workflow_steps ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 6: Create RLS policies for scraper_selectors
-- =============================================================================

-- SELECT: Admin/Staff can view
CREATE POLICY "Admin and staff can view scraper selectors"
    ON public.scraper_selectors
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- INSERT: Admin/Staff can create
CREATE POLICY "Admin and staff can create scraper selectors"
    ON public.scraper_selectors
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- UPDATE: Admin/Staff can update
CREATE POLICY "Admin and staff can update scraper selectors"
    ON public.scraper_selectors
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

-- DELETE: Admin only
CREATE POLICY "Admins can delete scraper selectors"
    ON public.scraper_selectors
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Service role full access
CREATE POLICY "Service role can manage scraper selectors"
    ON public.scraper_selectors
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- STEP 7: Create RLS policies for scraper_workflow_steps
-- =============================================================================

-- SELECT: Admin/Staff can view
CREATE POLICY "Admin and staff can view workflow steps"
    ON public.scraper_workflow_steps
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- INSERT: Admin/Staff can create
CREATE POLICY "Admin and staff can create workflow steps"
    ON public.scraper_workflow_steps
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- UPDATE: Admin/Staff can update
CREATE POLICY "Admin and staff can update workflow steps"
    ON public.scraper_workflow_steps
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

-- DELETE: Admin only
CREATE POLICY "Admins can delete workflow steps"
    ON public.scraper_workflow_steps
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Service role full access
CREATE POLICY "Service role can manage workflow steps"
    ON public.scraper_workflow_steps
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- STEP 8: Update scraper_configs table comment
-- =============================================================================

COMMENT ON TABLE public.scraper_configs IS 'Scraper configuration registry. Replaced legacy scrapers table. Each config has multiple versions.';
COMMENT ON COLUMN public.scraper_configs.scraper_type IS 'Type of scraper: static (simple HTTP) or agentic (AI-powered)';
COMMENT ON COLUMN public.scraper_configs.base_url IS 'Base URL for the target website';
