-- Add columns referenced by dashboard metrics view
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS published_at timestamptz,
ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5;
