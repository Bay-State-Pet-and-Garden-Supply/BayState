-- Modern E-commerce Schema: Categories & Brands
-- Implements normalized category hierarchy and enhanced brand support

BEGIN;

-- ============================================================================
-- 1. Categories Table (Hierarchical)
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
    display_order int DEFAULT 0,
    image_url text,
    is_featured boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for parent lookups
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- ============================================================================
-- 2. Product-Categories Junction Table (Many-to-Many)
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_categories (
    product_id uuid REFERENCES products(id) ON DELETE CASCADE,
    category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

-- ============================================================================
-- 3. Enhance Brands Table
-- ============================================================================

ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS description text;

-- ============================================================================
-- 4. Enhance Products Table
-- ============================================================================

-- Long description for detailed product pages (MoreInformationText from ShopSite)
ALTER TABLE products ADD COLUMN IF NOT EXISTS long_description text;

-- Product type for subcategory filtering (ProductField25)
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text;

-- Fulfillment type (tangible, digital, service)
ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment_type text DEFAULT 'tangible';

-- ============================================================================
-- 5. Enable RLS on new tables
-- ============================================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Allow public read access to categories"
    ON categories FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access to product_categories"
    ON product_categories FOR SELECT
    USING (true);

-- Admin write access
CREATE POLICY "Allow admin write access to categories"
    ON categories FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Allow admin write access to product_categories"
    ON product_categories FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

COMMIT;
