-- Migration: API Key authentication for admin users
-- Adds a user_api_keys table mirroring runner_api_keys with bsa_ prefix
-- Enables machine-to-machine auth for admin API routes (Phase 1 of admin API key migration)

-- Create enum for user roles on keys
create type user_role as enum ('admin', 'staff');

-- Create table for storing hashed admin API keys
create table if not exists user_api_keys (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    key_hash text not null,           -- SHA256 hash of the key
    key_prefix text not null,         -- First 12 chars for identification (e.g., "bsa_a1b2c3d4...")
    description text,                 -- Optional description (e.g., "CI/CD pipeline key")
    role user_role not null default 'admin',  -- Key-level role (defaults to admin)
    created_at timestamptz not null default now(),
    expires_at timestamptz,           -- Optional expiry (null = never expires)
    last_used_at timestamptz,
    revoked_at timestamptz,           -- Soft delete - set when key is revoked
    created_by uuid references auth.users(id)
);

-- Index for fast key lookups (most common operation)
create index if not exists idx_user_api_keys_hash on user_api_keys(key_hash) where revoked_at is null;

-- Index for listing keys by user
create index if not exists idx_user_api_keys_user on user_api_keys(user_id);

-- Enable RLS
alter table user_api_keys enable row level security;

-- Policy: Authenticated users can read their own keys (but not the hash)
create policy "Users can read their own keys"
    on user_api_keys for select
    to authenticated
    using (user_id = auth.uid());

-- Policy: Service role has full access (for key validation in API routes)
create policy "Service role has full access"
    on user_api_keys for all
    to service_role
    using (true)
    with check (true);

-- Function to validate an admin API key and return user info
-- This is called from BayStateApp admin API routes
create or replace function validate_user_api_key(api_key text)
returns table (
    user_id uuid,
    key_id uuid,
    role user_role,
    is_valid boolean
) language plpgsql security definer as $$
declare
    key_hash_value text;
    result record;
begin
    -- Hash the provided key
    key_hash_value := encode(sha256(api_key::bytea), 'hex');

    -- Look up the key
    select
        uak.user_id,
        uak.id as key_id,
        uak.role,
        true as is_valid
    into result
    from user_api_keys uak
    where uak.key_hash = key_hash_value
      and uak.revoked_at is null
      and (uak.expires_at is null or uak.expires_at > now());

    if result is null then
        return query select null::uuid, null::uuid, null::user_role, false;
        return;
    end if;

    -- Update last_used_at atomically
    update user_api_keys
    set last_used_at = now()
    where id = result.key_id;

    return query select result.user_id, result.key_id, result.role, result.is_valid;
end;
$$;

-- Grant execute on the function to service_role and authenticated users
grant execute on function validate_user_api_key(text) to service_role;
grant execute on function validate_user_api_key(text) to authenticated;

-- Add comment for documentation
comment on table user_api_keys is 'API keys for authenticating admin/staff users. Keys are stored as SHA256 hashes. Modeled on the runner_api_keys pattern.';
comment on column user_api_keys.key_hash is 'SHA256 hash of the API key. The actual key is only shown once at creation.';
comment on column user_api_keys.key_prefix is 'First 12 characters of the key for identification purposes (e.g., bsa_a1b2c3d4...).';
comment on column user_api_keys.role is 'Role granted to this key. Defaults to admin. Matches values in profiles.role.';
comment on column user_api_keys.revoked_at is 'Set when key is revoked. Revoked keys are kept for audit trail.';
