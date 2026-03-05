-- Pre-orders and Special Deliveries Schema
-- Supports: multiple pre-order batches per group, minimum quantity enforcement per batch,
-- and distance-based local delivery with optional service add-ons.

BEGIN;

-- ============================================================================
-- 1. Pre-order Groups (programs like "Baby Chicks", "Ducklings", etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS preorder_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    minimum_quantity integer NOT NULL DEFAULT 1,
    -- If true, all products in this group default to pickup-only (can be overridden per product)
    pickup_only boolean NOT NULL DEFAULT true,
    -- Optional display copy for PDP messaging
    display_copy text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_preorder_groups_slug ON preorder_groups(slug);
CREATE INDEX IF NOT EXISTS idx_preorder_groups_active ON preorder_groups(is_active);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_preorder_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_preorder_groups_updated_at ON preorder_groups;
CREATE TRIGGER update_preorder_groups_updated_at
    BEFORE UPDATE ON preorder_groups
    FOR EACH ROW EXECUTE FUNCTION update_preorder_groups_updated_at();

-- ============================================================================
-- 2. Pre-order Batches (arrival dates for a group)
-- ============================================================================

CREATE TABLE IF NOT EXISTS preorder_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    preorder_group_id uuid REFERENCES preorder_groups(id) ON DELETE CASCADE NOT NULL,
    -- The arrival/pickup date for this batch
    arrival_date date NOT NULL,
    -- Optional deadline for ordering (before this date, customer can add to cart)
    ordering_deadline timestamptz,
    -- Optional capacity (max total quantity for this batch)
    capacity integer,
    -- Display order (for showing batches in UI)
    display_order integer NOT NULL DEFAULT 0,
    -- Active flag (inactive batches don't show in PDP)
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one active batch per group per date
CREATE UNIQUE INDEX IF NOT EXISTS idx_preorder_batches_group_date
    ON preorder_batches(preorder_group_id, arrival_date) WHERE is_active;

-- Index for finding upcoming batches
CREATE INDEX IF NOT EXISTS idx_preorder_batches_arrival ON preorder_batches(arrival_date);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_preorder_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_preorder_batches_updated_at ON preorder_batches;
CREATE TRIGGER update_preorder_batches_updated_at
    BEFORE UPDATE ON preorder_batches
    FOR EACH ROW EXECUTE FUNCTION update_preorder_batches_updated_at();

-- ============================================================================
-- 3. Product to Preorder Group (many-to-many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_preorder_groups (
    product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    preorder_group_id uuid REFERENCES preorder_groups(id) ON DELETE CASCADE NOT NULL,
    -- Allow overriding the group's pickup_only setting per product
    pickup_only_override boolean,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (product_id, preorder_group_id)
);

-- Index for reverse lookups
CREATE INDEX IF NOT EXISTS idx_product_preorder_groups_product ON product_preorder_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_product_preorder_groups_group ON product_preorder_groups(preorder_group_id);

-- ============================================================================
-- 4. Extend Products table for pickup_only (product-level override)
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS pickup_only boolean DEFAULT false;

-- ============================================================================
-- 5. Extend Order Items with preorder_batch_id (captures selected batch per line)
-- ============================================================================

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS preorder_batch_id uuid REFERENCES preorder_batches(id);

-- Index for batch lookups on orders
CREATE INDEX IF NOT EXISTS idx_order_items_batch ON order_items(preorder_batch_id);

-- ============================================================================
-- 6. Extend Orders table for fulfillment method and delivery details
-- ============================================================================

-- Fulfillment method: pickup, delivery, etc.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_method text
    DEFAULT 'pickup' CHECK (fulfillment_method IN ('pickup', 'delivery'));

-- Delivery address (reference to addresses table)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address_id uuid REFERENCES addresses(id);

-- Distance in miles (for delivery fee calculation audit)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_distance_miles numeric(10, 2);

-- Delivery fee (amount charged, stored for audit)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(10, 2) DEFAULT 0;

-- JSON for service add-ons (e.g., [{"service": "pallet_jack", "fee": 25}])
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_services jsonb DEFAULT '[]'::jsonb;

-- Special delivery instructions (e.g., "gate code", "lift gate required")
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes text;

-- Updated_at trigger for orders (already exists but ensuring it covers new fields)
CREATE OR REPLACE FUNCTION update_orders_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_orders_updated_at_column();

-- ============================================================================
-- 7. RLS Policies
-- ============================================================================

ALTER TABLE preorder_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE preorder_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_preorder_groups ENABLE ROW LEVEL SECURITY;

-- Everyone can read preorder groups and batches (they drive PDP UI)
CREATE POLICY "Public read preorder groups" ON preorder_groups FOR SELECT USING (true);
CREATE POLICY "Public read preorder batches" ON preorder_batches FOR SELECT USING (true);
CREATE POLICY "Public read product preorder groups" ON product_preorder_groups FOR SELECT USING (true);

-- Only admin/staff can modify
CREATE POLICY "Admin manage preorder groups" ON preorder_groups FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Admin manage preorder batches" ON preorder_batches FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Admin manage product preorder groups" ON product_preorder_groups FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- Orders RLS (already exists, extend for new columns)
-- Delivery address visibility: customer can see own, staff can see all
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff can view all orders" ON orders;
CREATE POLICY "Staff can view all orders" ON orders
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff'))
    );

-- Order items RLS (extend for preorder_batch_id)
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

COMMIT;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE preorder_groups IS 'Reusable pre-order programs (e.g., Baby Chicks, Ducklings) with shared rules like minimum quantities.';
COMMENT ON TABLE preorder_batches IS 'Arrival dates within a pre-order program. Customers select a batch when adding to cart.';
COMMENT ON TABLE product_preorder_groups IS 'Many-to-many relationship between products and pre-order groups.';
COMMENT ON COLUMN products.pickup_only IS 'If true, this product can only be picked up (not delivered).';
COMMENT ON COLUMN order_items.preorder_batch_id IS 'The selected arrival batch for this line item (for pre-order items).';
COMMENT ON COLUMN orders.fulfillment_method IS 'How the order will be fulfilled: pickup or delivery.';
COMMENT ON COLUMN orders.delivery_address_id IS 'The shipping address for delivery orders.';
COMMENT ON COLUMN orders.delivery_distance_miles IS 'Calculated distance from store for delivery fee audit.';
COMMENT ON COLUMN orders.delivery_fee IS 'Delivery fee charged to the customer.';
COMMENT ON COLUMN orders.delivery_services IS 'JSON array of service add-ons: [{service: string, fee: number}].';
COMMENT ON COLUMN orders.delivery_notes IS 'Special delivery instructions (gate code, lift gate needed, etc.).';
