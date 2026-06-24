-- Recovery Migration: Recreate missing orders and related tables
-- Purpose: Restore schema for orders, order_items, and order_payments that were accidentally dropped.
-- This reconstruction includes all fields from previously applied migrations up to 2026-03-19.

BEGIN;

-- 1. Create Preorder Groups
CREATE TABLE IF NOT EXISTS public.preorder_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    minimum_quantity integer NOT NULL DEFAULT 1,
    pickup_only boolean NOT NULL DEFAULT true,
    display_copy text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Create Preorder Batches
CREATE TABLE IF NOT EXISTS public.preorder_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    preorder_group_id uuid REFERENCES public.preorder_groups(id) ON DELETE CASCADE NOT NULL,
    arrival_date date NOT NULL,
    ordering_deadline timestamptz,
    capacity integer,
    display_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Create Product Preorder Groups
CREATE TABLE IF NOT EXISTS public.product_preorder_groups (
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    preorder_group_id uuid REFERENCES public.preorder_groups(id) ON DELETE CASCADE NOT NULL,
    pickup_only_override boolean,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (product_id, preorder_group_id)
);

-- 4. Create Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number text NOT NULL UNIQUE,
    user_id uuid REFERENCES auth.users,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    payment_method text DEFAULT 'pickup' CHECK (payment_method IN ('pickup', 'credit_card', 'paypal')),
    payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded')),
    subtotal numeric(10, 2) NOT NULL,
    discount_amount numeric(10, 2) DEFAULT 0,
    promo_code text,
    promo_code_id uuid,
    tax numeric(10, 2) DEFAULT 0,
    total numeric(10, 2) NOT NULL,
    stripe_payment_intent_id text,
    stripe_customer_id text,
    paid_at timestamptz,
    refunded_amount numeric(10, 2) DEFAULT 0,
    notes text,
    fulfillment_method text DEFAULT 'pickup' CHECK (fulfillment_method IN ('pickup', 'delivery')),
    delivery_address_id uuid REFERENCES public.addresses(id),
    delivery_distance_miles numeric(10, 2),
    delivery_fee numeric(10, 2) DEFAULT 0,
    delivery_services jsonb DEFAULT '[]'::jsonb,
    delivery_notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 5. Create Order Items Table
CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    item_type text NOT NULL CHECK (item_type IN ('product', 'service')),
    item_id uuid NOT NULL,
    item_name text NOT NULL,
    item_slug text NOT NULL,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price numeric(10, 2) NOT NULL DEFAULT 0,
    total_price numeric(10, 2) NOT NULL DEFAULT 0,
    preorder_batch_id uuid REFERENCES public.preorder_batches(id),
    created_at timestamptz DEFAULT now()
);

-- 6. Create Order Payments Table
CREATE TABLE IF NOT EXISTS public.order_payments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    amount numeric(10, 2) NOT NULL,
    currency text DEFAULT 'USD' NOT NULL,
    payment_method text NOT NULL CHECK (payment_method IN ('credit_card', 'paypal')),
    stripe_payment_intent_id text,
    stripe_charge_id text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded')),
    error_message text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 7. Recreate Indexes
CREATE INDEX IF NOT EXISTS idx_preorder_groups_slug ON public.preorder_groups(slug);
CREATE INDEX IF NOT EXISTS idx_preorder_batches_arrival ON public.preorder_batches(arrival_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_batch ON public.order_items(preorder_batch_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON public.order_payments(order_id);

-- 8. Helper Functions & Triggers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := 'BSP-' || to_char(now(), 'YYYYMMDD') || '-' || 
        lpad(floor(random() * 10000)::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_order_payments_updated_at ON public.order_payments;
CREATE TRIGGER update_order_payments_updated_at
    BEFORE UPDATE ON public.order_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 9. Enable RLS
ALTER TABLE public.preorder_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preorder_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_preorder_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

-- 10. Restore RLS Policies
-- Preorder policies
CREATE POLICY "Public read preorder groups" ON public.preorder_groups FOR SELECT USING (true);
CREATE POLICY "Public read preorder batches" ON public.preorder_batches FOR SELECT USING (true);
CREATE POLICY "Public read product preorder groups" ON public.product_preorder_groups FOR SELECT USING (true);

CREATE POLICY "Admin manage preorder groups" ON public.preorder_groups FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Admin manage preorder batches" ON public.preorder_batches FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Admin manage product preorder groups" ON public.product_preorder_groups FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
CREATE POLICY "Staff can view all orders" ON public.orders
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
CREATE POLICY "Users can view own order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.orders WHERE public.orders.id = public.order_items.order_id AND public.orders.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Staff can view all order items" ON public.order_items;
CREATE POLICY "Staff can view all order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

DROP POLICY IF EXISTS "Staff can view payments" ON public.order_payments;
CREATE POLICY "Staff can view payments" ON public.order_payments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

DROP POLICY IF EXISTS "System can insert payments" ON public.order_payments;
CREATE POLICY "System can insert payments" ON public.order_payments
    FOR INSERT WITH CHECK (true);

COMMIT;
