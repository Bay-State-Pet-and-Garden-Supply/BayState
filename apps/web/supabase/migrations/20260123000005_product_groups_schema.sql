-- Product Groups Schema
-- Supports grouping related products under a single page (e.g., different sizes of the same product)
-- Each group has a canonical slug, and products within the group can be selected via ?sku= query param

BEGIN;

-- ============================================================================
-- 1. Product Groups (groups of related products sharing a single page)
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Canonical slug for the group (used in URL: /products/{group_slug})
    slug text NOT NULL UNIQUE,
    -- Display name for the group
    name text NOT NULL,
    -- Optional description for SEO and UI
    description text,
    -- Optional image for the group (shown as group hero on PDP)
    hero_image_url text,
    -- The default product to show when no ?sku= param is provided
    default_product_id uuid REFERENCES products(id) ON DELETE SET NULL,
    -- Optional brand_id for filtering groups by brand
    brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
    -- Group status
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_product_groups_slug ON product_groups(slug);
CREATE INDEX IF NOT EXISTS idx_product_groups_active ON product_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_product_groups_brand ON product_groups(brand_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_product_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_product_groups_updated_at ON product_groups;
CREATE TRIGGER update_product_groups_updated_at
    BEFORE UPDATE ON product_groups
    FOR EACH ROW EXECUTE FUNCTION update_product_groups_updated_at();

-- ============================================================================
-- 2. Product Group Members (many-to-many junction table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_group_products (
    group_id uuid REFERENCES product_groups(id) ON DELETE CASCADE NOT NULL,
    product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    -- Sort order for display in the size selector
    sort_order integer NOT NULL DEFAULT 0,
    -- Whether this product is the default (only one can be default per group)
    is_default boolean NOT NULL DEFAULT false,
    -- Optional display label override (e.g., "5 lb" vs extracting from product name)
    display_label text,
    -- Metadata for the product within this group (e.g., {size: "5 lb", weight_oz: 80})
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (group_id, product_id)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_product_group_products_group ON product_group_products(group_id);
CREATE INDEX IF NOT EXISTS idx_product_group_products_product ON product_group_products(product_id);
CREATE INDEX IF NOT EXISTS idx_product_group_products_order ON product_group_products(group_id, sort_order);

-- Ensure only one default per group
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_group_products_default
    ON product_group_products(group_id) WHERE is_default;

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================

ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_group_products ENABLE ROW LEVEL SECURITY;

-- Public read access to active groups and their members
CREATE POLICY "Public read product groups" ON product_groups FOR SELECT
    USING (is_active = true);

CREATE POLICY "Public read product group products" ON product_group_products FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM product_groups
            WHERE product_groups.id = product_group_products.group_id
            AND product_groups.is_active = true
        )
    );

-- Only admin/staff can modify
CREATE POLICY "Admin manage product groups" ON product_groups FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

CREATE POLICY "Admin manage product group products" ON product_group_products FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

-- ============================================================================
-- 4. Helper Function: Get all products in a group with sorting
-- ============================================================================

CREATE OR REPLACE FUNCTION get_group_products(p_group_id uuid)
RETURNS TABLE (
    product_id uuid,
    product_name text,
    product_slug text,
    product_price numeric,
    product_images text[],
    product_stock_status text,
    sort_order integer,
    is_default boolean,
    display_label text,
    metadata jsonb
) AS $$
    SELECT
        pgp.product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.price AS product_price,
        p.images AS product_images,
        p.stock_status AS product_stock_status,
        pgp.sort_order,
        pgp.is_default,
        pgp.display_label,
        pgp.metadata
    FROM product_group_products pgp
    JOIN products p ON p.id = pgp.product_id
    WHERE pgp.group_id = p_group_id
    ORDER BY pgp.sort_order ASC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- 5. Helper Function: Get group by slug with default product
-- ============================================================================

CREATE OR REPLACE FUNCTION get_product_group_by_slug(p_slug text)
RETURNS TABLE (
    group_id uuid,
    group_slug text,
    group_name text,
    group_description text,
    group_hero_image_url text,
    default_product_id uuid,
    brand_id uuid,
    is_active boolean,
    product_id uuid,
    product_name text,
    product_slug text,
    product_price numeric,
    product_images text[],
    product_stock_status text,
    sort_order integer,
    is_default boolean,
    display_label text,
    metadata jsonb
) AS $$
    SELECT
        pg.id AS group_id,
        pg.slug AS group_slug,
        pg.name AS group_name,
        pg.description AS group_description,
        pg.hero_image_url AS group_hero_image_url,
        pg.default_product_id,
        pg.brand_id,
        pg.is_active,
        p.id AS product_id,
        p.name AS product_name,
        p.slug AS product_slug,
        p.price AS product_price,
        p.images AS product_images,
        p.stock_status AS product_stock_status,
        pgp.sort_order,
        pgp.is_default,
        pgp.display_label,
        pgp.metadata
    FROM product_groups pg
    LEFT JOIN product_group_products pgp ON pg.id = pgp.group_id
    LEFT JOIN products p ON pgp.product_id = p.id
    WHERE pg.slug = p_slug
    AND pg.is_active = true
    ORDER BY pgp.sort_order ASC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

COMMIT;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE product_groups IS 'Groups of related products sharing a single page (e.g., different sizes of the same product). Used for Amazon-style product pages.';
COMMENT ON TABLE product_group_products IS 'Many-to-many relationship between products and groups with sort order and display labels.';
COMMENT ON COLUMN product_groups.slug IS 'Canonical URL slug for the group (used in /products/{slug} routes).';
COMMENT ON COLUMN product_groups.default_product_id IS 'Default product shown when no ?sku= param is provided.';
COMMENT ON COLUMN product_groups.hero_image_url IS 'Optional hero image shown at top of grouped product page.';
COMMENT ON COLUMN product_group_products.display_label IS 'Optional custom label for size selector (e.g., "5 lb" vs extracting from product name).';
COMMENT ON COLUMN product_group_products.metadata IS 'JSON metadata about this product in the group (e.g., size, weight, dimensions).';
COMMENT ON FUNCTION get_group_products IS 'Returns all products in a group with sorting and display info.';
COMMENT ON FUNCTION get_product_group_by_slug IS 'Returns group details with all member products for a given slug.';
