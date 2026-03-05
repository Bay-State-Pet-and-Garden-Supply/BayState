-- Enrich user_pets table with missing fields for profile and recommendations

BEGIN;

-- Add basic fields that were present in code but missing in schema
ALTER TABLE IF EXISTS user_pets 
ADD COLUMN IF NOT EXISTS breed text,
ADD COLUMN IF NOT EXISTS birth_date date,
ADD COLUMN IF NOT EXISTS weight_lbs numeric,
ADD COLUMN IF NOT EXISTS dietary_notes text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add advanced fields for recommendations
ALTER TABLE IF EXISTS user_pets 
ADD COLUMN IF NOT EXISTS life_stage text CHECK (life_stage IN ('puppy', 'kitten', 'juvenile', 'adult', 'senior')),
ADD COLUMN IF NOT EXISTS size_class text CHECK (size_class IN ('small', 'medium', 'large', 'giant')),
ADD COLUMN IF NOT EXISTS special_needs text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female')),
ADD COLUMN IF NOT EXISTS is_fixed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS activity_level text CHECK (activity_level IN ('low', 'moderate', 'high', 'very_high'));

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_user_pets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_pets_updated_at ON user_pets;
CREATE TRIGGER trigger_update_user_pets_updated_at
    BEFORE UPDATE ON user_pets
    FOR EACH ROW
    EXECUTE FUNCTION update_user_pets_updated_at();

COMMIT;
