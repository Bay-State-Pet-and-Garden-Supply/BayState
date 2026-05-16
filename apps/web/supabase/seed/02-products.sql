-- Generated Products from Excel
INSERT INTO products (id, brand_id, name, slug, upc, sku, price, stock_status, created_at, updated_at) VALUES
('bd731767-abed-58a8-8409-3b6cb003dae4', 'a1889317-5cc0-48b2-8156-285ba445b0e2', 'Wondercide Flea & Tick Spray Lemongrass 4oz', 'wondercide-flea-tick-spray-lemongrass-4oz-019962890727', '019962890727', '019962890727', 9.99, 'in_stock', NOW(), NOW()),
('2b8dcfc7-200b-5e14-83fc-11126af0a90a', 'a1889317-5cc0-48b2-8156-285ba445b0e2', 'Wondercide Flea & Tick Spray Lemongrass 32oz', 'wondercide-flea-tick-spray-lemongrass-32oz-019962890925', '019962890925', '019962890925', 9.99, 'in_stock', NOW(), NOW()),
('4940d798-fa4b-5fa7-b733-a3abe1e3be44', 'da487015-ac06-4110-825a-aaf6ef51178f', 'Catit Pixi Fountain Light Blue', 'catit-pixi-fountain-light-blue-022517437179', '022517437179', '022517437179', 9.99, 'in_stock', NOW(), NOW()),
('bc8e0978-0e0b-5c1e-84b0-28d683764daa', '2ebacbc3-53a7-4207-94e8-10ba7576a4f5', 'Fromm Cat Purrsnick Duck Liver Pate 3oz', 'fromm-cat-purrsnick-duck-liver-pate-3oz-072705113408', '072705113408', '072705113408', 9.99, 'in_stock', NOW(), NOW()),
('f3efbe5c-8ba9-5c4f-853f-154ff51be3fc', '2ebacbc3-53a7-4207-94e8-10ba7576a4f5', 'Fromm Cat Purrsnick Duck Stew 3oz', 'fromm-cat-purrsnick-duck-stew-3oz-072705113446', '072705113446', '072705113446', 9.99, 'in_stock', NOW(), NOW()),
('6b839236-3a4f-5358-93be-56f61f4a3ff5', '2ebacbc3-53a7-4207-94e8-10ba7576a4f5', 'Fromm Cat Purrsnick Chicken Shred 3oz', 'fromm-cat-purrsnick-chicken-shred-3oz-072705113484', '072705113484', '072705113484', 9.99, 'in_stock', NOW(), NOW()),
('a42e1184-4183-5ece-a0b8-2e60ad3b4a09', '2ebacbc3-53a7-4207-94e8-10ba7576a4f5', 'Fromm Cat Purrsnick Chicken 4lb', 'fromm-cat-purrsnick-chicken-4lb-072705137008', '072705137008', '072705137008', 9.99, 'in_stock', NOW(), NOW()),
('23cc15d2-4920-5af8-b8ab-bb0778e26669', '2ebacbc3-53a7-4207-94e8-10ba7576a4f5', 'Fromm Cat Purrsnick Game Bird 4lb', 'fromm-cat-purrsnick-game-bird-4lb-072705137206', '072705137206', '072705137206', 9.99, 'in_stock', NOW(), NOW()),
('a35447a5-9929-56f4-bf35-649b829ebb69', '2ebacbc3-53a7-4207-94e8-10ba7576a4f5', 'Fromm Cat Purrsnick Salmon 4lb', 'fromm-cat-purrsnick-salmon-4lb-072705137404', '072705137404', '072705137404', 9.99, 'in_stock', NOW(), NOW()),
('32711615-c441-5063-a1ed-464d3ba6d253', 'a1889317-5cc0-48b2-8156-285ba445b0e2', 'Wondercide Flying in Sect Trap', 'wondercide-flying-in-sect-trap-810075890174', '810075890174', '810075890174', 9.99, 'in_stock', NOW(), NOW()),
('55555555-5555-5555-5555-555555555555', 'da487015-ac06-4110-825a-aaf6ef51178f', 'Catit Pixi Fountain Pink', 'catit-pixi-fountain-pink-022517437180', '022517437180', '022517437180', 14.99, 'in_stock', NOW(), NOW()),
('66666666-6666-6666-6666-666666666666', '2ebacbc3-53a7-4207-94e8-10ba7576a4f5', 'Fromm Cat Purrsnick Chicken 12lb', 'fromm-cat-purrsnick-chicken-12lb-072705137015', '072705137015', '072705137015', 24.99, 'in_stock', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Mark featured and pickup-only products
UPDATE product_storefront_settings SET is_featured = true WHERE product_id = 'bd731767-abed-58a8-8409-3b6cb003dae4';
UPDATE product_storefront_settings SET pickup_only = true WHERE product_id = '32711615-c441-5063-a1ed-464d3ba6d253';
