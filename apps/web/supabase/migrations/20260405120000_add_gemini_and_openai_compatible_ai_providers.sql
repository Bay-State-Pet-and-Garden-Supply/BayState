ALTER TABLE public.ai_provider_credentials
  DROP CONSTRAINT IF EXISTS ai_provider_credentials_provider_check;

ALTER TABLE public.ai_provider_credentials
  ADD CONSTRAINT ai_provider_credentials_provider_check
  CHECK (provider IN ('openai', 'openai_compatible', 'gemini', 'serpapi', 'brave'));

COMMENT ON TABLE public.ai_provider_credentials IS 'Encrypted provider API keys for AI scraping runtime (OpenAI/OpenAI-compatible/Gemini/SerpAPI/Brave).';
