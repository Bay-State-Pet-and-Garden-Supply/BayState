-- =====================================================================
-- Generated Seed File (do not edit directly)
-- Generated at: 2026-05-16T16:50:07.675Z
-- =====================================================================

-- --- Module: 00-auth.sql ---
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


-- --- Module: 01-taxonomy.sql ---
-- Generated Brands from Excel
INSERT INTO brands (id, name, slug) VALUES
('dd094d0f-4c76-5d01-ac5d-4b74e31f3eda', 'Wondercide', 'wondercide'),
('3925bc47-9a11-5932-9612-a4cb904a8cff', 'Catit', 'catit'),
('47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm', 'fromm')
ON CONFLICT (id) DO NOTHING;


-- --- Module: 02-products.sql ---
-- Generated Products from Excel
INSERT INTO products (id, brand_id, name, slug, upc, sku, price, stock_status, created_at, updated_at) VALUES
('bd731767-abed-58a8-8409-3b6cb003dae4', 'dd094d0f-4c76-5d01-ac5d-4b74e31f3eda', 'Wondercide Flea & Tick Spray Lemongrass 4oz', 'wondercide-flea-tick-spray-lemongrass-4oz-019962890727', '019962890727', '019962890727', 9.99, 'in_stock', NOW(), NOW()),
('2b8dcfc7-200b-5e14-83fc-11126af0a90a', 'dd094d0f-4c76-5d01-ac5d-4b74e31f3eda', 'Wondercide Flea & Tick Spray Lemongrass 32oz', 'wondercide-flea-tick-spray-lemongrass-32oz-019962890925', '019962890925', '019962890925', 9.99, 'in_stock', NOW(), NOW()),
('4940d798-fa4b-5fa7-b733-a3abe1e3be44', '3925bc47-9a11-5932-9612-a4cb904a8cff', 'Catit Pixi Fountain Light Blue', 'catit-pixi-fountain-light-blue-022517437179', '022517437179', '022517437179', 9.99, 'in_stock', NOW(), NOW()),
('bc8e0978-0e0b-5c1e-84b0-28d683764daa', '47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm Cat Purrsnick Duck Liver Pate 3oz', 'fromm-cat-purrsnick-duck-liver-pate-3oz-072705113408', '072705113408', '072705113408', 9.99, 'in_stock', NOW(), NOW()),
('f3efbe5c-8ba9-5c4f-853f-154ff51be3fc', '47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm Cat Purrsnick Duck Stew 3oz', 'fromm-cat-purrsnick-duck-stew-3oz-072705113446', '072705113446', '072705113446', 9.99, 'in_stock', NOW(), NOW()),
('6b839236-3a4f-5358-93be-56f61f4a3ff5', '47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm Cat Purrsnick Chicken Shred 3oz', 'fromm-cat-purrsnick-chicken-shred-3oz-072705113484', '072705113484', '072705113484', 9.99, 'in_stock', NOW(), NOW()),
('a42e1184-4183-5ece-a0b8-2e60ad3b4a09', '47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm Cat Purrsnick Chicken 4lb', 'fromm-cat-purrsnick-chicken-4lb-072705137008', '072705137008', '072705137008', 9.99, 'in_stock', NOW(), NOW()),
('23cc15d2-4920-5af8-b8ab-bb0778e26669', '47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm Cat Purrsnick Game Bird 4lb', 'fromm-cat-purrsnick-game-bird-4lb-072705137206', '072705137206', '072705137206', 9.99, 'in_stock', NOW(), NOW()),
('a35447a5-9929-56f4-bf35-649b829ebb69', '47f1d1f9-eece-5c15-8ea3-232f60913f79', 'Fromm Cat Purrsnick Salmon 4lb', 'fromm-cat-purrsnick-salmon-4lb-072705137404', '072705137404', '072705137404', 9.99, 'in_stock', NOW(), NOW()),
('32711615-c441-5063-a1ed-464d3ba6d253', 'dd094d0f-4c76-5d01-ac5d-4b74e31f3eda', 'Wondercide Flying in Sect Trap', 'wondercide-flying-in-sect-trap-810075890174', '810075890174', '810075890174', 9.99, 'in_stock', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;


-- --- Module: 03-scraping.sql ---


-- --- Module: 04-orders.sql ---
-- ---------------------------------------------------------------------
-- Promo Codes, Orders, Payments, and Legacy Order Ingestion


-- --- Module: 05-settings.sql ---
-- ---------------------------------------------------------------------
-- Services, Site Settings, and Pages


