-- Create profiles table
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  email text,
  role text not null default 'customer' check (role in ('admin', 'staff', 'customer')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Function to handle new user signup
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
  );
  return new;
end;
$$;

-- Trigger for new users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- POLICIES

-- 1. Users can view their own profile
create policy "Users can view own profile"
  on profiles for select
  using ( auth.uid() = id );

-- 2. Users can update their own profile
create policy "Users can update own profile"
  on profiles for update
  using ( auth.uid() = id );

-- 3. Admins can view all profiles (Avoid infinite recursion by checking a dedicated function or relying on claims in future. For now, using a direct check but acknowledging recursion risk if not careful. Alternatively, we use a security definer function to check role)

-- To safely check role without recursion in policies, we often use a function.
-- However, for simplicity in this migration, let's create a helper function that bypasses RLS to check role.
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

-- Now use these functions in policies
create policy "Admins and Staff can view all profiles"
  on profiles for select
  using ( public.is_staff() );

create policy "Admins can insert/update/delete profiles"
  on profiles for all
  using ( public.is_admin() );
