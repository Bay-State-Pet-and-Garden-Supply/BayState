BEGIN;

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS short_name text,
    ADD COLUMN IF NOT EXISTS in_store_pickup boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.facet_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    slug text NOT NULL UNIQUE,
    description text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.facet_values (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    facet_definition_id uuid NOT NULL REFERENCES public.facet_definitions(id) ON DELETE CASCADE,
    value text NOT NULL,
    normalized_value text NOT NULL,
    slug text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT facet_values_facet_definition_id_normalized_value_key
        UNIQUE (facet_definition_id, normalized_value)
);

CREATE TABLE IF NOT EXISTS public.product_facets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    facet_value_id uuid NOT NULL REFERENCES public.facet_values(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_facets_product_id_facet_value_id_key
        UNIQUE (product_id, facet_value_id)
);

CREATE INDEX IF NOT EXISTS idx_facet_values_facet_definition_id
    ON public.facet_values (facet_definition_id);

CREATE INDEX IF NOT EXISTS idx_facet_values_slug
    ON public.facet_values (slug);

CREATE INDEX IF NOT EXISTS idx_product_facets_product_id
    ON public.product_facets (product_id);

CREATE INDEX IF NOT EXISTS idx_product_facets_facet_value_id
    ON public.product_facets (facet_value_id);

ALTER TABLE public.facet_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facet_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_facets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to facet_definitions" ON public.facet_definitions;
CREATE POLICY "Allow public read access to facet_definitions"
    ON public.facet_definitions FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow admin write access to facet_definitions" ON public.facet_definitions;
CREATE POLICY "Allow admin write access to facet_definitions"
    ON public.facet_definitions FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

DROP POLICY IF EXISTS "Allow public read access to facet_values" ON public.facet_values;
CREATE POLICY "Allow public read access to facet_values"
    ON public.facet_values FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow admin write access to facet_values" ON public.facet_values;
CREATE POLICY "Allow admin write access to facet_values"
    ON public.facet_values FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

DROP POLICY IF EXISTS "Allow public read access to product_facets" ON public.product_facets;
CREATE POLICY "Allow public read access to product_facets"
    ON public.product_facets FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow admin write access to product_facets" ON public.product_facets;
CREATE POLICY "Allow admin write access to product_facets"
    ON public.product_facets FOR ALL
    USING (auth.jwt() ->> 'role' IN ('admin', 'staff'));

INSERT INTO public.facet_definitions (name, slug, description)
VALUES
    ('lifestage', 'lifestage', 'Normalized ProductField18 values for life stage filtering.'),
    ('pet_size', 'pet-size', 'Normalized ProductField19 values for pet size filtering.'),
    ('special_diet', 'special-diet', 'Normalized ProductField20 values for special diet filtering.'),
    ('health_feature', 'health-feature', 'Normalized ProductField21 values for health feature filtering.'),
    ('food_form', 'food-form', 'Normalized ProductField22 values for food form filtering.'),
    ('flavor', 'flavor', 'Normalized ProductField23 values for flavor filtering.'),
    ('product_feature', 'product-feature', 'Normalized ProductField26 values for product feature filtering.'),
    ('size', 'size', 'Normalized ProductField27 values for size filtering.'),
    ('color', 'color', 'Normalized ProductField29 values for color filtering.'),
    ('packaging_type', 'packaging-type', 'Normalized ProductField30 values for packaging type filtering.')
ON CONFLICT (name) DO UPDATE
SET
    slug = EXCLUDED.slug,
    description = EXCLUDED.description;

COMMIT;
