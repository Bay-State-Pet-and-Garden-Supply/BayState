-- apps/web/supabase/seed/00-auth.sql
-- ---------------------------------------------------------------------
-- Admin User (Local Dev)
-- ---------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, recovery_sent_at, last_sign_in_at, 
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, 
  confirmation_token, email_change, email_change_token_new, recovery_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@baystate.local',
  -- Hash for 'password' (verified in DB)
  '$2a$06$OjQM.p8e6bzNBFogBmi4IezcgCsu/4ydYKpfv6mi.vzv6Yzpn5KHG',
  NOW(), NOW(), NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Local Admin"}',
  NOW(), NOW(), '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  'a0000000-0000-0000-0000-000000000000',
  'admin@baystate.local',
  'Local Admin',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ---------------------------------------------------------------------
-- Scraper Runners (Local Dev)
-- ---------------------------------------------------------------------
INSERT INTO public.scraper_runners (name, status, enabled, metadata)
VALUES ('local-dev-runner', 'online', TRUE, '{"environment": "development"}'::jsonb)
ON CONFLICT (name) DO UPDATE SET status = 'online', enabled = TRUE;

INSERT INTO public.runner_api_keys (runner_name, key_hash, key_prefix, description)
VALUES (
  'local-dev-runner', 
  '00ea90233cb6277be758add4673161cb95615d074c8021fc66a4dabb1eabd7c2', 
  'bsr_local_dev', 
  'Local development key'
)
ON CONFLICT DO NOTHING;
