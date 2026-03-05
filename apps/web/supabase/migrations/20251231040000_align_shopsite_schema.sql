-- Align schema with ShopSite XML structure

-- 1. Orders Table Updates
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS legacy_order_number text,
ADD COLUMN IF NOT EXISTS shopsite_transaction_id text,
ADD COLUMN IF NOT EXISTS billing_address jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS shipping_address jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS payment_details jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS shopsite_data jsonb DEFAULT '{}'::jsonb;

-- Add unique constraint on legacy_order_number if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_legacy_order_number_key') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_legacy_order_number_key UNIQUE (legacy_order_number);
    END IF;
END $$;

-- 2. Products Table Updates
ALTER TABLE products
ADD COLUMN IF NOT EXISTS weight numeric,
ADD COLUMN IF NOT EXISTS taxable boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS shopsite_cost numeric,
ADD COLUMN IF NOT EXISTS shopsite_product_type text,
ADD COLUMN IF NOT EXISTS shopsite_data jsonb DEFAULT '{}'::jsonb;

-- 3. Profiles Table Updates
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS legacy_customer_id text,
ADD COLUMN IF NOT EXISTS shopsite_data jsonb DEFAULT '{}'::jsonb;

-- Indexes for performance on commonly queried new text fields
CREATE INDEX IF NOT EXISTS idx_orders_legacy_order_number ON orders(legacy_order_number);
CREATE INDEX IF NOT EXISTS idx_products_shopsite_product_type ON products(shopsite_product_type);
CREATE INDEX IF NOT EXISTS idx_profiles_legacy_customer_id ON profiles(legacy_customer_id);
