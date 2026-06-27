-- Migration to clean up duplicate categories and map products to active counterparts.

-- 1. Reparent Goat & Sheep under Farm & Livestock (active) instead of Farm Animal (inactive)
UPDATE categories
SET parent_id = 'dd252ff5-8ef3-4544-9831-6bcdbe9ce164'
WHERE id = '05d4d9ab-1f53-4017-9052-c9f33b28291c';

-- 2. Remap product_categories and products for duplicates and deactivate them

-- Mapping 1: Aquariums -> Aquariums & Tanks
DELETE FROM product_categories
WHERE category_id = 'e0371690-f571-46b8-a64a-6f8272499ae7'
  AND product_id IN (
    SELECT product_id FROM product_categories WHERE category_id = '2659945a-3b0c-43c8-bc3b-841fb8db996c'
  );

UPDATE product_categories
SET category_id = '2659945a-3b0c-43c8-bc3b-841fb8db996c'
WHERE category_id = 'e0371690-f571-46b8-a64a-6f8272499ae7';

UPDATE products
SET canonical_category_id = '2659945a-3b0c-43c8-bc3b-841fb8db996c'
WHERE canonical_category_id = 'e0371690-f571-46b8-a64a-6f8272499ae7';

UPDATE categories
SET is_active = false
WHERE id = 'e0371690-f571-46b8-a64a-6f8272499ae7';


-- Mapping 2: Bird Houses -> Bird Houses & Nesting
DELETE FROM product_categories
WHERE category_id = '10ea156b-cb67-4e41-88b1-b6deda41655d'
  AND product_id IN (
    SELECT product_id FROM product_categories WHERE category_id = 'cc9edb9d-3984-47e3-a41e-5036b58cdccf'
  );

UPDATE product_categories
SET category_id = 'cc9edb9d-3984-47e3-a41e-5036b58cdccf'
WHERE category_id = '10ea156b-cb67-4e41-88b1-b6deda41655d';

UPDATE products
SET canonical_category_id = 'cc9edb9d-3984-47e3-a41e-5036b58cdccf'
WHERE canonical_category_id = '10ea156b-cb67-4e41-88b1-b6deda41655d';

UPDATE categories
SET is_active = false
WHERE id = '10ea156b-cb67-4e41-88b1-b6deda41655d';


-- Mapping 3: Livestock Health -> Health & First Aid
DELETE FROM product_categories
WHERE category_id = '0d3250c0-d4fe-4a30-90f9-4be299f13ff5'
  AND product_id IN (
    SELECT product_id FROM product_categories WHERE category_id = 'd0977013-0db3-43d4-9f0c-76c08a058fdd'
  );

UPDATE product_categories
SET category_id = 'd0977013-0db3-43d4-9f0c-76c08a058fdd'
WHERE category_id = '0d3250c0-d4fe-4a30-90f9-4be299f13ff5';

UPDATE products
SET canonical_category_id = 'd0977013-0db3-43d4-9f0c-76c08a058fdd'
WHERE canonical_category_id = '0d3250c0-d4fe-4a30-90f9-4be299f13ff5';

UPDATE categories
SET is_active = false
WHERE id = '0d3250c0-d4fe-4a30-90f9-4be299f13ff5';


-- Mapping 4: Wound Care duplicate -> Wound Care active
DELETE FROM product_categories
WHERE category_id = '055cb005-d290-43e5-baf0-91897b7fec55'
  AND product_id IN (
    SELECT product_id FROM product_categories WHERE category_id = 'e17c1e50-6620-40aa-9b58-5516331c09c9'
  );

UPDATE product_categories
SET category_id = 'e17c1e50-6620-40aa-9b58-5516331c09c9'
WHERE category_id = '055cb005-d290-43e5-baf0-91897b7fec55';

UPDATE products
SET canonical_category_id = 'e17c1e50-6620-40aa-9b58-5516331c09c9'
WHERE canonical_category_id = '055cb005-d290-43e5-baf0-91897b7fec55';

UPDATE categories
SET is_active = false
WHERE id = '055cb005-d290-43e5-baf0-91897b7fec55';


-- Mapping 5: Seed & Food -> Wild Bird Food
DELETE FROM product_categories
WHERE category_id = '1aeaf555-f74c-41e7-ad29-e1c92c2b2a29'
  AND product_id IN (
    SELECT product_id FROM product_categories WHERE category_id = '1e6475eb-6a75-42e7-87d4-72e7819743c1'
  );

UPDATE product_categories
SET category_id = '1e6475eb-6a75-42e7-87d4-72e7819743c1'
WHERE category_id = '1aeaf555-f74c-41e7-ad29-e1c92c2b2a29';

UPDATE products
SET canonical_category_id = '1e6475eb-6a75-42e7-87d4-72e7819743c1'
WHERE canonical_category_id = '1aeaf555-f74c-41e7-ad29-e1c92c2b2a29';

UPDATE categories
SET is_active = false
WHERE id = '1aeaf555-f74c-41e7-ad29-e1c92c2b2a29';


-- Mapping 6: Seed Blends -> Seed Mixes
DELETE FROM product_categories
WHERE category_id = '03590b3c-c691-47ea-b0ca-be1895cbf7c8'
  AND product_id IN (
    SELECT product_id FROM product_categories WHERE category_id = '0289efa0-8029-4dca-9899-89d48cd5df70'
  );

UPDATE product_categories
SET category_id = '0289efa0-8029-4dca-9899-89d48cd5df70'
WHERE category_id = '03590b3c-c691-47ea-b0ca-be1895cbf7c8';

UPDATE products
SET canonical_category_id = '0289efa0-8029-4dca-9899-89d48cd5df70'
WHERE canonical_category_id = '03590b3c-c691-47ea-b0ca-be1895cbf7c8';

UPDATE categories
SET is_active = false
WHERE id = '03590b3c-c691-47ea-b0ca-be1895cbf7c8';
