-- Migration: Add JWT authentication for scraper runners
-- Replaces shared HMAC secret with per-runner auth.users accounts

-- Add auth_user_id to link runners to auth.users
alter table scraper_runners 
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- Index for efficient lookups by auth user
create index if not exists idx_scraper_runners_auth_user_id 
  on scraper_runners(auth_user_id);

-- Add last_auth_at column for tracking authentication activity
alter table scraper_runners 
  add column if not exists last_auth_at timestamptz;

-- Drop existing RLS policies that we'll replace
drop policy if exists "Admins can read runners" on scraper_runners;
drop policy if exists "Service role can manage runners" on scraper_runners;

-- Policy: Authenticated users can read all runners (admin dashboard)
create policy "Authenticated users can read runners"
  on scraper_runners for select
  to authenticated
  using (true);

-- Policy: Runners can update their own record via JWT
-- This allows runners to update last_seen_at, status, etc.
create policy "Runners can update own record"
  on scraper_runners for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Policy: Runners can insert their own record (for upsert on first callback)
create policy "Runners can insert own record"
  on scraper_runners for insert
  to authenticated
  with check (auth.uid() = auth_user_id);

-- Policy: Service role retains full access for admin operations
create policy "Service role has full access"
  on scraper_runners for all
  to service_role
  using (true)
  with check (true);

-- Comment for documentation
comment on column scraper_runners.auth_user_id is 'Links runner to auth.users for JWT authentication';
comment on column scraper_runners.last_auth_at is 'Timestamp of last successful JWT authentication';
