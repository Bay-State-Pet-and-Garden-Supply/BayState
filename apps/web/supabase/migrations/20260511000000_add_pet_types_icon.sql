-- Add icon column to pet_types for UI display
ALTER TABLE IF EXISTS public.pet_types ADD COLUMN IF NOT EXISTS icon text;
