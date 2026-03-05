BEGIN;

CREATE TABLE IF NOT EXISTS pet_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    display_order int DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_pets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    pet_type_id uuid REFERENCES pet_types(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_pets_user_id ON user_pets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pets_pet_type_id ON user_pets(pet_type_id);

CREATE TABLE IF NOT EXISTS product_pet_types (
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    pet_type_id uuid REFERENCES pet_types(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, pet_type_id)
);

CREATE INDEX IF NOT EXISTS idx_product_pet_types_product ON product_pet_types(product_id);
CREATE INDEX IF NOT EXISTS idx_product_pet_types_pet_type ON product_pet_types(pet_type_id);

ALTER TABLE pet_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pet_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to pet_types"
    ON pet_types FOR SELECT
    USING (true);

CREATE POLICY "Allow admin write access to pet_types"
    ON pet_types FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Users can manage their own pets"
    ON user_pets FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all user pets"
    ON user_pets FOR SELECT
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Allow public read access to product_pet_types"
    ON product_pet_types FOR SELECT
    USING (true);

CREATE POLICY "Allow admin write access to product_pet_types"
    ON product_pet_types FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE OR REPLACE FUNCTION get_personalized_products(user_uuid uuid, result_limit int DEFAULT 12)
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  name text,
  slug text,
  price numeric,
  stock_status text,
  images text[],
  pet_name text,
  pet_type_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.brand_id,
    p.name,
    p.slug,
    p.price,
    p.stock_status,
    p.images,
    up.name as pet_name,
    pt.name as pet_type_name
  FROM products p
  JOIN product_pet_types ppt ON p.id = ppt.product_id
  JOIN user_pets up ON up.pet_type_id = ppt.pet_type_id
  JOIN pet_types pt ON up.pet_type_id = pt.id
  WHERE up.user_id = user_uuid
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_products_for_pet_types(pet_type_ids uuid[])
RETURNS TABLE (
  id uuid,
  brand_id uuid,
  name text,
  slug text,
  price numeric,
  stock_status text,
  images text[],
  pet_type_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (p.id)
    p.id,
    p.brand_id,
    p.name,
    p.slug,
    p.price,
    p.stock_status,
    p.images,
    ppt.pet_type_id
  FROM products p
  JOIN product_pet_types ppt ON p.id = ppt.product_id
  WHERE ppt.pet_type_id = ANY(pet_type_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
