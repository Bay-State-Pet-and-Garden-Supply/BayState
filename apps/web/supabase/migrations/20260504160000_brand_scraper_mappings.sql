-- Migration: Brand Scraper Mappings
-- Links brands to scraper configs with explicit priority ordering.

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.brand_scraper_mappings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    scraper_config_id uuid NOT NULL REFERENCES public.scraper_configs(id) ON DELETE CASCADE,
    priority int NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by uuid REFERENCES auth.users(id),
    updated_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (brand_id, scraper_config_id)
);

-- 2. Composite indexes
CREATE INDEX IF NOT EXISTS idx_bsm_lookup ON public.brand_scraper_mappings(brand_id, is_active, priority DESC, scraper_config_id);
CREATE INDEX IF NOT EXISTS idx_bsm_scraper ON public.brand_scraper_mappings(scraper_config_id);

-- 3. Updated_at trigger (same pattern as scraper_configs)
CREATE OR REPLACE FUNCTION update_brand_scraper_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brand_scraper_mappings_updated_at_trigger ON public.brand_scraper_mappings;
CREATE TRIGGER brand_scraper_mappings_updated_at_trigger
    BEFORE UPDATE ON public.brand_scraper_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_brand_scraper_mappings_updated_at();

-- 4. RLS policies
ALTER TABLE public.brand_scraper_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and staff can read brand scraper mappings"
    ON public.brand_scraper_mappings
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

CREATE POLICY "Admin and staff can insert brand scraper mappings"
    ON public.brand_scraper_mappings
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

CREATE POLICY "Admin and staff can update brand scraper mappings"
    ON public.brand_scraper_mappings
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

CREATE POLICY "Admin and staff can delete brand scraper mappings"
    ON public.brand_scraper_mappings
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

CREATE POLICY "Service role can manage brand scraper mappings"
    ON public.brand_scraper_mappings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. Comments
COMMENT ON TABLE public.brand_scraper_mappings IS 'Explicit mappings between brands and scraper configs, enabling prioritized scraper selection per brand.';
COMMENT ON COLUMN public.brand_scraper_mappings.brand_id IS 'Reference to the brand.';
COMMENT ON COLUMN public.brand_scraper_mappings.scraper_config_id IS 'Reference to the scraper config.';
COMMENT ON COLUMN public.brand_scraper_mappings.priority IS 'Higher values are evaluated first.';
COMMENT ON COLUMN public.brand_scraper_mappings.is_active IS 'Inactive mappings block affinity recommendations for the scraper.';
COMMENT ON COLUMN public.brand_scraper_mappings.notes IS 'Admin-facing notes about why this mapping exists.';
COMMENT ON COLUMN public.brand_scraper_mappings.created_by IS 'User who created the mapping.';
COMMENT ON COLUMN public.brand_scraper_mappings.updated_by IS 'User who last updated the mapping.';
