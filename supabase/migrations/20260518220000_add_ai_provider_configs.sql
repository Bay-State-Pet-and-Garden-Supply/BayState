-- Create AI Provider Configuration table
CREATE TYPE ai_provider_type AS ENUM ('deepseek', 'openai', 'openai_compatible', 'gemini', 'lmstudio');

CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    provider_type ai_provider_type NOT NULL,
    base_url TEXT,
    default_model TEXT,
    encrypted_key TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    key_version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Index for active config lookups
CREATE INDEX idx_ai_provider_configs_is_active ON public.ai_provider_configs (is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage AI provider configs"
    ON public.ai_provider_configs
    FOR ALL
    TO authenticated
    USING (is_admin());

-- Data Migration: Move existing credentials into the new table
DO $$
DECLARE
    admin_id UUID;
    scraping_defaults JSONB;
    v_base_url TEXT;
    v_model TEXT;
BEGIN
    -- Get a default admin ID for the migration
    SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@example.com' LIMIT 1;
    IF admin_id IS NULL THEN
        SELECT id INTO admin_id FROM auth.users LIMIT 1;
    END IF;

    -- Fetch current defaults to identify "active" settings
    SELECT value INTO scraping_defaults FROM public.site_settings WHERE key = 'ai_scraping_defaults';
    
    -- Migrate DeepSeek
    INSERT INTO public.ai_provider_configs (name, provider_type, base_url, default_model, encrypted_key, iv, auth_tag, is_active, updated_by)
    SELECT 
        'DeepSeek Cloud', 
        'deepseek', 
        'https://api.deepseek.com/v1', 
        COALESCE(scraping_defaults->>'llm_model', 'deepseek-chat'),
        encrypted_value, 
        iv, 
        auth_tag,
        (scraping_defaults->>'llm_provider' = 'deepseek'),
        admin_id
    FROM public.ai_provider_credentials 
    WHERE provider = 'deepseek';

    -- Migrate OpenAI
    INSERT INTO public.ai_provider_configs (name, provider_type, base_url, default_model, encrypted_key, iv, auth_tag, is_active, updated_by)
    SELECT 
        'OpenAI Direct', 
        'openai', 
        'https://api.openai.com/v1', 
        COALESCE(scraping_defaults->>'llm_model', 'gpt-4o-mini'),
        encrypted_value, 
        iv, 
        auth_tag,
        (scraping_defaults->>'llm_provider' = 'openai'),
        admin_id
    FROM public.ai_provider_credentials 
    WHERE provider = 'openai';

    -- Migrate OpenAI Compatible / LM Studio
    INSERT INTO public.ai_provider_configs (name, provider_type, base_url, default_model, encrypted_key, iv, auth_tag, is_active, updated_by)
    SELECT 
        'Local LM Studio / Gateway', 
        'openai_compatible', 
        scraping_defaults->>'llm_base_url', 
        COALESCE(scraping_defaults->>'llm_model', 'google/gemma-4-e4b'),
        encrypted_value, 
        iv, 
        auth_tag,
        (scraping_defaults->>'llm_provider' = 'openai_compatible'),
        admin_id
    FROM public.ai_provider_credentials 
    WHERE provider = 'openai_compatible';

END $$;
