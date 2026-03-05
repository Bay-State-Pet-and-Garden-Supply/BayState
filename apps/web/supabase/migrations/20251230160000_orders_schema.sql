-- Orders table
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  subtotal numeric(10, 2) not null,
  tax numeric(10, 2) default 0,
  total numeric(10, 2) not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Order items table
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  item_type text not null check (item_type in ('product', 'service')),
  item_id uuid not null,
  item_name text not null,
  item_slug text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null,
  total_price numeric(10, 2) not null,
  created_at timestamptz default now()
);

-- Index for order lookups
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created_at on orders(created_at desc);
create index if not exists idx_order_items_order_id on order_items(order_id);

-- Function to generate order number
create or replace function generate_order_number()
returns trigger as $$
begin
  new.order_number := 'BSP-' || to_char(now(), 'YYYYMMDD') || '-' || 
    lpad(floor(random() * 10000)::text, 4, '0');
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-generate order number
drop trigger if exists set_order_number on orders;
create trigger set_order_number
  before insert on orders
  for each row
  when (new.order_number is null)
  execute function generate_order_number();

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at on orders
drop trigger if exists update_orders_updated_at on orders;
create trigger update_orders_updated_at
  before update on orders
  for each row
  execute function update_updated_at_column();
