-- FIX PROFILES SCHEMA SCRIPT
-- Run this AFTER repair_login.sql if you are missing columns (e.g. phone, preferences)

-- 1. Add fields from 20251230203000_add_profile_fields.sql
alter table profiles 
add column if not exists phone text,
add column if not exists preferences jsonb default '{}'::jsonb;

-- 2. Add fields from 20251231040000_align_shopsite_schema.sql
alter table profiles
add column if not exists legacy_customer_id text,
add column if not exists shopsite_data jsonb DEFAULT '{}'::jsonb;

create index if not exists idx_profiles_legacy_customer_id on profiles(legacy_customer_id);

-- 3. Add fields from 20260104000000_promo_codes.sql
alter table profiles 
add column if not exists first_order_completed boolean DEFAULT false,
add column if not exists first_order_at timestamptz;
