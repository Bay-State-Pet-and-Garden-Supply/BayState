-- Add columns referenced by pipeline reconciliation
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS shopsite_pages jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_special_order boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_taxable boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS minimum_quantity integer DEFAULT 0;
