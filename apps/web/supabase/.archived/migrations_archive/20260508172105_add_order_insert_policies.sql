-- Add missing INSERT policies for orders and order_items

-- Orders: Allow authenticated users to insert their own orders and guests to insert guest orders
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;
CREATE POLICY "Anyone can insert orders" ON public.orders
    FOR INSERT WITH CHECK (
        (auth.uid() IS NULL AND user_id IS NULL) OR 
        (auth.uid() = user_id) OR
        (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')))
    );

-- Order Items: Allow insertion of items for any order
-- We rely on the order insertion policy and our API logic for security
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Anyone can insert order items" ON public.order_items
    FOR INSERT WITH CHECK (true);

-- Allow staff to update order status
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;
CREATE POLICY "Staff can update orders" ON public.orders
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );
