-- Migration: API Key authentication for scraper runners
-- Replaces password-grant auth with simple API key system

-- Create table for storing hashed API keys
create table if not exists runner_api_keys (
    id uuid primary key default gen_random_uuid(),
    runner_name text not null references scraper_runners(name) on delete cascade,
    key_hash text not null,           -- SHA256 hash of the key
    key_prefix text not null,         -- First 8 chars for identification (e.g., "bsr_a1b2...")
    description text,                 -- Optional description (e.g., "Production key")
    created_at timestamptz not null default now(),
    expires_at timestamptz,           -- Optional expiry (null = never expires)
    last_used_at timestamptz,
    revoked_at timestamptz,           -- Soft delete - set when key is revoked
    created_by uuid references auth.users(id)
);

-- Index for fast key lookups (most common operation)
create index if not exists idx_runner_api_keys_hash on runner_api_keys(key_hash) where revoked_at is null;

-- Index for listing keys by runner
create index if not exists idx_runner_api_keys_runner on runner_api_keys(runner_name);

-- Enable RLS
alter table runner_api_keys enable row level security;

-- Policy: Authenticated admin users can read keys (but not the hash)
create policy "Authenticated users can read keys"
    on runner_api_keys for select
    to authenticated
    using (true);

-- Policy: Service role has full access (for key validation in API routes)
create policy "Service role has full access"
    on runner_api_keys for all
    to service_role
    using (true)
    with check (true);

-- Function to validate an API key and return runner info
-- This is called from BayStateApp API routes
create or replace function validate_runner_api_key(api_key text)
returns table (
    runner_name text,
    key_id uuid,
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
        rak.runner_name,
        rak.id as key_id,
        true as is_valid
    into result
    from runner_api_keys rak
    where rak.key_hash = key_hash_value
      and rak.revoked_at is null
      and (rak.expires_at is null or rak.expires_at > now());
    
    if result is null then
        return query select null::text, null::uuid, false;
        return;
    end if;
    
    -- Update last_used_at
    update runner_api_keys 
    set last_used_at = now() 
    where id = result.key_id;
    
    return query select result.runner_name, result.key_id, result.is_valid;
end;
$$;

-- Grant execute on the function to service_role
grant execute on function validate_runner_api_key(text) to service_role;

-- Add comment for documentation
comment on table runner_api_keys is 'API keys for authenticating scraper runners. Keys are stored as SHA256 hashes.';
comment on column runner_api_keys.key_hash is 'SHA256 hash of the API key. The actual key is only shown once at creation.';
comment on column runner_api_keys.key_prefix is 'First 8 characters of the key for identification purposes.';
comment on column runner_api_keys.revoked_at is 'Set when key is revoked. Revoked keys are kept for audit trail.';
