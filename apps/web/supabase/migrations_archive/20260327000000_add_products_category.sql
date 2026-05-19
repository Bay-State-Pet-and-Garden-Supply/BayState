-- Add category column referenced by pipeline reconciliation
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS category text;
