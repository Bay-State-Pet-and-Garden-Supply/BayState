-- REPAIR SCRIPT: Run this in your Supabase Dashboard SQL Editor
-- This script repairs the 'profiles' table and restores admin access for nvborrello@gmail.com

-- 1. Ensure profiles table exists
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  email text,
  role text not null default 'customer' check (role in ('admin', 'staff', 'customer')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. Restore Functions & Triggers
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.email,
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Restore Helper Functions (Required for RLS policies)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin', 'staff')
  );
$$;

-- 5. Restore RLS Policies
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile"
  on profiles for select
  using ( auth.uid() = id );

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using ( auth.uid() = id );

drop policy if exists "Admins and Staff can view all profiles" on profiles;
create policy "Admins and Staff can view all profiles"
  on profiles for select
  using ( public.is_staff() );

drop policy if exists "Admins can insert/update/delete profiles" on profiles;
create policy "Admins can insert/update/delete profiles"
  on profiles for all
  using ( public.is_admin() );

-- 6. EMERGENCY REPAIR: Restore Admin Profile
do $$
declare
  target_user_id uuid;
begin
  -- Find the user ID from auth.users (Supabase managed table)
  select id into target_user_id from auth.users where email = 'nvborrello@gmail.com';

  if target_user_id is not null then
    -- Upsert profile and force ADMIN role
    insert into public.profiles (id, full_name, email, role)
    values (target_user_id, 'Nick Borrello', 'nvborrello@gmail.com', 'admin')
    on conflict (id) do update
    set role = 'admin', email = 'nvborrello@gmail.com';
    
    raise notice 'Successfully restored admin profile for nvborrello@gmail.com';
  else
    raise notice 'User nvborrello@gmail.com not found in auth.users. Please sign up first.';
  end if;
end $$;
