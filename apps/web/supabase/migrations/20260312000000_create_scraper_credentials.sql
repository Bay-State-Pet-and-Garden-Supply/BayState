-- Create scraper_credentials table for encrypted scraper credentials
CREATE TABLE IF NOT EXISTS public.scraper_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_slug text NOT NULL,
  credential_type text NOT NULL,
  encrypted_value text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(scraper_slug, credential_type)
);

ALTER TABLE public.scraper_credentials ENABLE ROW LEVEL SECURITY;

-- Read policy: only admin/staff can SELECT
DROP POLICY IF EXISTS "Admin/Staff read scraper credentials" ON public.scraper_credentials;
CREATE POLICY "Admin/Staff read scraper credentials"
  ON public.scraper_credentials
  FOR SELECT
  USING (public.is_staff());

-- Write policy: only admin/staff can INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Admin/Staff write scraper credentials" ON public.scraper_credentials;
CREATE POLICY "Admin/Staff write scraper credentials"
  ON public.scraper_credentials
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Trigger to update updated_at timestamp
CREATE OR REPLACE TRIGGER update_scraper_credentials_updated_at
  BEFORE UPDATE ON public.scraper_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.scraper_credentials IS 'Encrypted scraper credentials (AES-256-GCM) keyed by key_version.';
COMMENT ON COLUMN public.scraper_credentials.encrypted_value IS 'AES-256-GCM encrypted credential payload.';
