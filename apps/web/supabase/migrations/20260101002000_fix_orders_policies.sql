-- Fix orders and order_items RLS policies
-- Ensure staff/admin can perform all operations
-- Ensure customers can create orders (checkout)

-- Orders: Add insert policy for all authenticated users (checkout)
DROP POLICY IF EXISTS "Authenticated users can create orders" ON orders;
CREATE POLICY "Authenticated users can create orders" ON orders
    FOR INSERT WITH CHECK (true);

-- Orders: Add update policy for staff
DROP POLICY IF EXISTS "Staff can update orders" ON orders;
CREATE POLICY "Staff can update orders" ON orders
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Orders: Add delete policy for admin only
DROP POLICY IF EXISTS "Admin can delete orders" ON orders;
CREATE POLICY "Admin can delete orders" ON orders
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );

-- Order Items: Add insert policy (for checkout)
DROP POLICY IF EXISTS "Authenticated users can create order items" ON order_items;
CREATE POLICY "Authenticated users can create order items" ON order_items
    FOR INSERT WITH CHECK (true);

-- Order Items: Add update policy for staff
DROP POLICY IF EXISTS "Staff can update order items" ON order_items;
CREATE POLICY "Staff can update order items" ON order_items
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Order Items: Add delete policy for staff
DROP POLICY IF EXISTS "Staff can delete order items" ON order_items;
CREATE POLICY "Staff can delete order items" ON order_items
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Ensure order_items table has correct schema (matching lib/orders.ts)
-- Add missing columns if they don't exist
DO $$
BEGIN
    -- item_type column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'order_items' AND column_name = 'item_type') THEN
        ALTER TABLE order_items ADD COLUMN item_type text DEFAULT 'product';
    END IF;
    
    -- item_name column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'order_items' AND column_name = 'item_name') THEN
        ALTER TABLE order_items ADD COLUMN item_name text DEFAULT '';
    END IF;
    
    -- item_slug column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'order_items' AND column_name = 'item_slug') THEN
        ALTER TABLE order_items ADD COLUMN item_slug text DEFAULT '';
    END IF;
    
    -- item_id column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'order_items' AND column_name = 'item_id') THEN
        ALTER TABLE order_items ADD COLUMN item_id uuid;
    END IF;
    
    -- unit_price column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'order_items' AND column_name = 'unit_price') THEN
        ALTER TABLE order_items ADD COLUMN unit_price numeric(10,2) DEFAULT 0;
    END IF;
    
    -- total_price column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'order_items' AND column_name = 'total_price') THEN
        ALTER TABLE order_items ADD COLUMN total_price numeric(10,2) DEFAULT 0;
    END IF;
END $$;

-- Add check constraint for item_type if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                   WHERE table_name = 'order_items' AND constraint_name = 'order_items_item_type_check') THEN
        ALTER TABLE order_items ADD CONSTRAINT order_items_item_type_check 
            CHECK (item_type IN ('product', 'service'));
    END IF;
EXCEPTION WHEN duplicate_object THEN
    -- Constraint already exists
    NULL;
END $$;
