-- 20260424000001_add_order_source.sql
-- Add source column to differentiate between ShopSite and Integra Register orders

BEGIN;

-- Add source column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'source'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN source text DEFAULT 'unknown';
    END IF;
END $$;

-- Set existing ShopSite orders to 'shopsite'
-- ShopSite orders in this system typically have a customer_email
UPDATE public.orders
SET source = 'shopsite'
WHERE customer_email IS NOT NULL AND source = 'unknown';

COMMIT;
