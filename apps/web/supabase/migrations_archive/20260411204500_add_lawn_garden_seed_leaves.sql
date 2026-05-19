BEGIN;

INSERT INTO public.categories (name, slug, description, parent_id, display_order, is_featured)
SELECT
    seed.name,
    seed.slug,
    seed.description,
    parent.id,
    seed.display_order,
    seed.is_featured
FROM (
    VALUES
        (
            'Flower & Vegetable Seeds',
            'lawn-garden-flower-vegetable-seeds',
            'Seed packets and bulk seed for planting vegetables, flowers, and other edible or ornamental garden plants.',
            'lawn-garden',
            25,
            true
        ),
        (
            'Herb Seeds',
            'lawn-garden-herb-seeds',
            'Garden herb seed packets and culinary herb seeds intended for planting.',
            'lawn-garden',
            26,
            false
        ),
        (
            'Wildflower & Pollinator Seeds',
            'lawn-garden-wildflower-pollinator-seeds',
            'Wildflower, meadow, and pollinator-friendly seed mixes intended for planting gardens, borders, and beds.',
            'lawn-garden',
            27,
            false
        ),
        (
            'Seed Starting Supplies',
            'lawn-garden-seed-starting-supplies',
            'Seed trays, starter pots, propagation kits, plugs, and other seed-starting supplies for germination and transplant prep.',
            'lawn-garden',
            28,
            false
        )
) AS seed(name, slug, description, parent_slug, display_order, is_featured)
JOIN public.categories AS parent
    ON parent.slug = seed.parent_slug
ON CONFLICT (slug) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id,
    display_order = EXCLUDED.display_order,
    is_featured = EXCLUDED.is_featured,
    updated_at = now();

COMMIT;
