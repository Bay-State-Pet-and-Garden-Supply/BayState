-- Migration to normalize pet types and prevent duplicates with different casing (e.g., "cat" vs "Cat")

DO $$
DECLARE
    rec RECORD;
    canonical_id UUID;
BEGIN
    -- 1. Identify groups of pet types that have the same lowercased name
    FOR rec IN 
        SELECT lower(name) as lower_name, count(*) 
        FROM pet_types 
        GROUP BY lower(name) 
        HAVING count(*) > 1
    LOOP
        -- 2. For each group, pick a canonical ID. 
        -- We prefer the one that is already capitalized (proper case), then the one with an icon, then the oldest one.
        SELECT id INTO canonical_id
        FROM pet_types
        WHERE lower(name) = rec.lower_name
        ORDER BY (name ~ '^[A-Z]') DESC, (icon IS NOT NULL) DESC, created_at ASC
        LIMIT 1;

        -- 3. Merge icons if canonical doesn't have one
        UPDATE pet_types
        SET icon = (
            SELECT icon FROM pet_types 
            WHERE lower(name) = rec.lower_name AND icon IS NOT NULL 
            ORDER BY created_at ASC LIMIT 1
        )
        WHERE id = canonical_id AND icon IS NULL;

        -- 4. Update product_pet_types to point to the canonical ID
        -- We use ON CONFLICT DO NOTHING to handle cases where a product was already linked to both
        INSERT INTO product_pet_types (product_id, pet_type_id)
        SELECT product_id, canonical_id
        FROM product_pet_types
        WHERE pet_type_id IN (
            SELECT id FROM pet_types WHERE lower(name) = rec.lower_name AND id != canonical_id
        )
        ON CONFLICT (product_id, pet_type_id) DO NOTHING;

        -- 5. Delete the non-canonical pet types (CASCADE will handle product_pet_types links)
        DELETE FROM pet_types
        WHERE lower(name) = rec.lower_name AND id != canonical_id;
        
        -- 6. Ensure the canonical pet type has the proper casing (Capitalized)
        UPDATE pet_types
        SET name = initcap(rec.lower_name)
        WHERE id = canonical_id;
    END LOOP;
END $$;

-- 7. Add a case-insensitive unique index to prevent future duplicates
-- First drop the existing unique index if it exists and is case-sensitive only
DROP INDEX IF EXISTS idx_pet_types_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_types_name_lower ON public.pet_types (LOWER(name));

-- 8. Also normalize all existing pet type names to proper case (Initcap)
UPDATE public.pet_types SET name = initcap(name);
