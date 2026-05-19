-- Migration: Add product inventory dates for Stock Aging & Velocity tracking
-- Created: 2026-04-25
-- Author: data_engineer

-- 1. Add columns to products table
-- We use IF NOT EXISTS for idempotency
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'date_sold') THEN
        ALTER TABLE public.products ADD COLUMN date_sold timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'date_received') THEN
        ALTER TABLE public.products ADD COLUMN date_received timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'date_counted') THEN
        ALTER TABLE public.products ADD COLUMN date_counted timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'date_created') THEN
        ALTER TABLE public.products ADD COLUMN date_created timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'date_priced') THEN
        ALTER TABLE public.products ADD COLUMN date_priced timestamptz;
    END IF;
END $$;

-- 2. Add comments for clarity
COMMENT ON COLUMN public.products.date_sold IS 'The date the product was last sold, used for velocity calculations.';
COMMENT ON COLUMN public.products.date_received IS 'The date the product was last received into inventory, used for aging calculations.';
COMMENT ON COLUMN public.products.date_counted IS 'The date the product was last physically counted.';
COMMENT ON COLUMN public.products.date_created IS 'The date the product record was created in the register system.';
COMMENT ON COLUMN public.products.date_priced IS 'The date the product price was last updated in the register system.';

-- 3. Add indices for performance
-- date_sold is critical for velocity (sales over time)
CREATE INDEX IF NOT EXISTS idx_products_date_sold ON public.products (date_sold);
-- date_received is critical for aging (time in stock)
CREATE INDEX IF NOT EXISTS idx_products_date_received ON public.products (date_received);
-- date_created might be useful for new product reports
CREATE INDEX IF NOT EXISTS idx_products_date_created ON public.products (date_created);

-- Rollback Script (for reference):
/*
ALTER TABLE public.products 
DROP COLUMN IF EXISTS date_sold,
DROP COLUMN IF EXISTS date_received,
DROP COLUMN IF EXISTS date_counted,
DROP COLUMN IF EXISTS date_created,
DROP COLUMN IF EXISTS date_priced;

DROP INDEX IF EXISTS idx_products_date_sold;
DROP INDEX IF EXISTS idx_products_date_received;
DROP INDEX IF EXISTS idx_products_date_created;
*/
