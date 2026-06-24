-- Brands
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  created_at timestamptz default now()
);

-- Products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(10, 2) not null,
  stock_status text default 'in_stock' check (stock_status in ('in_stock', 'out_of_stock', 'pre_order')),
  images text[] default array[]::text[],
  is_featured boolean default false,
  created_at timestamptz default now()
);

-- Services
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(10, 2),
  unit text, -- e.g., 'per tank', 'per hour'
  is_active boolean default true,
  created_at timestamptz default now()
);
