-- Track explicit human review of Official Brand URL candidates.

ALTER TABLE public.official_brand_url_candidates
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text;

CREATE INDEX IF NOT EXISTS idx_official_brand_url_candidates_reviewed
  ON public.official_brand_url_candidates (reviewed_at DESC NULLS LAST)
  WHERE reviewed_at IS NOT NULL;

COMMENT ON COLUMN public.official_brand_url_candidates.reviewed_at IS
  'Timestamp when an admin explicitly reviewed or selected this URL candidate.';

COMMENT ON COLUMN public.official_brand_url_candidates.reviewed_by IS
  'Admin identifier, usually email or user id, captured as text for service-role compatibility.';
