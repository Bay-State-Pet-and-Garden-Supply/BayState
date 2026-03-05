CREATE TABLE IF NOT EXISTS public.ai_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE CHECK (provider IN ('openai', 'brave')),
  encrypted_value text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  last4 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.ai_provider_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/Staff read ai provider credentials" ON public.ai_provider_credentials;
CREATE POLICY "Admin/Staff read ai provider credentials"
  ON public.ai_provider_credentials
  FOR SELECT
  USING (public.is_staff());

DROP POLICY IF EXISTS "Admin/Staff write ai provider credentials" ON public.ai_provider_credentials;
CREATE POLICY "Admin/Staff write ai provider credentials"
  ON public.ai_provider_credentials
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE OR REPLACE TRIGGER update_ai_provider_credentials_updated_at
  BEFORE UPDATE ON public.ai_provider_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.ai_provider_credentials IS 'Encrypted provider API keys for AI scraping runtime (OpenAI/Brave).';
COMMENT ON COLUMN public.ai_provider_credentials.encrypted_value IS 'AES-256-GCM encrypted API key payload.';
COMMENT ON COLUMN public.ai_provider_credentials.last4 IS 'Masked key suffix displayed in admin UI.';
