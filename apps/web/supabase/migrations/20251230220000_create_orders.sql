-- Add user_id column to existing orders table (orders already existed with guest-checkout schema)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id uuid references auth.users;

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Customer Policy
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders 
    FOR SELECT USING (auth.uid() = user_id);

-- Staff/Admin Policy
DROP POLICY IF EXISTS "Staff can view all orders" ON orders;
CREATE POLICY "Staff can view all orders" ON orders 
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Order Items table
CREATE TABLE IF NOT EXISTS order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade not null,
  product_id uuid references products(id) not null,
  quantity integer not null check (quantity > 0),
  price_at_purchase numeric(10,2) not null,
  created_at timestamptz default now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own order items" ON order_items;
CREATE POLICY "Users can view own order items" ON order_items 
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Staff can view all order items" ON order_items;
CREATE POLICY "Staff can view all order items" ON order_items 
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );
