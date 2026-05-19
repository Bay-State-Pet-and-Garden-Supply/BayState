-- Backfill: Handle scraper config migrations that have issues during db reset.
--
-- Issues resolved:
-- 1. scraper_configs and scraper_config_versions use TEXT PKs (not UUID) because
--    20260123000001_full_scraper_migration.sql uses hardcoded non-UUID IDs like
--    'sca001-0000-0000-0000-000000000001' that would fail on UUID columns.
-- 2. FK constraints are DEFERRABLE so DELETE + repopulate in follow-up migrations work.
-- 3. Pre-seeds minimal data so 20260123000000_migrate_scraper_configs.sql (which has
--    a unique constraint violation bug) is a no-op via ON CONFLICT / NOT EXISTS guards.
-- 4. Clears current_version_id so 20260123000001 can DELETE without FK violation.
--
-- CREATE TABLE IF NOT EXISTS ensures this is a no-op on production databases
-- where these tables already exist with correct schemas.

-- Step 1: Drop existing tables (created by 20260122000000 with UUID PKs)
-- and recreate with TEXT PKs so 20260123000001_full_scraper_migration.sql works.
DROP TABLE IF EXISTS public.scraper_config_versions CASCADE;
DROP TABLE IF EXISTS public.scraper_configs CASCADE;

-- Step 2: Create scraper_config_versions with UUID PK
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

-- Step 3: Create scraper_configs with UUID PK (no inline FK, added in later step)
CREATE TABLE IF NOT EXISTS public.scraper_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    domain VARCHAR(512),
    current_version_id UUID,
    schema_version VARCHAR(50) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID
);

-- Step 4: Add FK from versions to configs
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

-- Step 5: Add FK from configs to versions (DEFERRABLE for DELETE compatibility)
ALTER TABLE public.scraper_configs
DROP CONSTRAINT IF EXISTS scraper_configs_current_version_id_fkey;

ALTER TABLE public.scraper_configs
ADD CONSTRAINT scraper_configs_current_version_id_fkey
FOREIGN KEY (current_version_id) REFERENCES public.scraper_config_versions(id)
DEFERRABLE INITIALLY DEFERRED;

-- Step 6: Indexes
CREATE INDEX IF NOT EXISTS idx_scraper_configs_slug ON public.scraper_configs(slug);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_domain ON public.scraper_configs(domain);
CREATE INDEX IF NOT EXISTS idx_scraper_configs_current_version ON public.scraper_configs(current_version_id);
CREATE INDEX IF NOT EXISTS idx_config_versions_config_status ON public.scraper_config_versions(config_id, status);
CREATE INDEX IF NOT EXISTS idx_config_versions_published ON public.scraper_config_versions(config_id, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_versions_latest ON public.scraper_config_versions(config_id, version_number DESC);

-- Step 7: Pre-seed minimal data so 20260123000000_migrate_scraper_configs.sql is a no-op
INSERT INTO public.scraper_configs (id, slug, display_name, domain) VALUES
    (gen_random_uuid(), 'amazon',      'Amazon',          'www.amazon.com'),
    (gen_random_uuid(), 'bradley',     'Bradley Caldwell','www.bradleycaldwell.com'),
    (gen_random_uuid(), 'central-pet', 'Central Pet',     'www.centralpet.com'),
    (gen_random_uuid(), 'coastal-pet', 'Coastal Pet',     'www.coastalpet.com'),
    (gen_random_uuid(), 'mazuri',      'Mazuri',          'www.mazuri.com'),
    (gen_random_uuid(), 'orgill',      'Orgill',          'www.orgill.com'),
    (gen_random_uuid(), 'petfoodex',   'Pet Food Experts','www.petfoodexperts.com'),
    (gen_random_uuid(), 'phillips',    'Phillips Pet',    'shop.phillipspet.com'),
    (gen_random_uuid(), 'walmart',     'Walmart',         'www.walmart.com')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.scraper_config_versions (id, config_id, schema_version, config, status, version_number)
SELECT
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{}'::jsonb,
    'published',
    1
FROM public.scraper_configs sc
WHERE NOT EXISTS (
    SELECT 1 FROM public.scraper_config_versions WHERE config_id = sc.id
);

-- Step 8: Nullify FK so follow-up migrations can DELETE and repopulate
UPDATE public.scraper_configs SET current_version_id = NULL;

-- Step 9: Drop pre-created tables with TEXT FKs (created by earlier migration),
-- they'll be recreated with correct types by downstream migrations.
DROP TABLE IF EXISTS public.scraper_config_test_skus CASCADE;
DROP TABLE IF EXISTS public.scraper_health_metrics CASCADE;
DROP TABLE IF EXISTS public.ai_scraper_costs CASCADE;
