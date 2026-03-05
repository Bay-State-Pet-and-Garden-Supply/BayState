-- Full migration of scraper configs from BayStateScraper YAML files
-- Run this in Supabase SQL Editor to complete the migration

-- Step 1: Clean existing data
DELETE FROM scraper_config_versions;
DELETE FROM scraper_configs;

-- Step 2: Create scraper_configs for all 10 scrapers
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version) VALUES
('sca001-0000-0000-0000-000000000001', 'amazon', 'Amazon', 'www.amazon.com', '1.0'),
('sca001-0000-0000-0000-000000000002', 'bradley', 'Bradley Caldwell', 'www.bradleycaldwell.com', '1.0'),
('sca001-0000-0000-0000-000000000003', 'central-pet', 'Central Pet', 'www.centralpet.com', '1.0'),
('sca001-0000-0000-0000-000000000004', 'coastal', 'Coastal Pet', 'www.coastalpet.com', '1.0'),
('sca001-0000-0000-0000-000000000005', 'mazuri', 'Mazuri', 'www.mazuri.com', '1.0'),
('sca001-0000-0000-0000-000000000006', 'orgill', 'Orgill', 'www.orgill.com', '1.0'),
('sca001-0000-0000-0000-000000000007', 'petfoodex', 'Pet Food Experts', 'www.petfoodexperts.com', '1.0'),
('sca001-0000-0000-0000-000000000008', 'phillips', 'Phillips Pet', 'shop.phillipspet.com', '1.0'),
('sca001-0000-0000-0000-000000000009', 'walmart', 'Walmart', 'www.walmart.com', '1.0'),
('sca001-0000-0000-0000-000000000010', 'baystate-pet', 'Bay State Pet', 'www.baystatepet.com', '1.0');

-- Step 3: Create published versions with full configs
-- Amazon
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000001', id, '1.0', '{
  "schema_version": "1.0",
  "name": "amazon",
  "display_name": "Amazon",
  "base_url": "https://www.amazon.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "#productTitle", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": "#bylineInfo", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": "#altImages li.imageThumbnail img", "attribute": "src", "multiple": true, "required": false},
    {"id": "sel-weight", "name": "Weight", "selector": "//tr[.//th[contains(., ''Weight'')]] | //li[contains(., ''ounces'')] | //li[contains(., ''pounds'')]", "attribute": "text", "multiple": false, "required": false}
  ],
  "workflows": [
    {"action": "conditional_click", "params": {"selector": "#sp-cc-accept"}},
    {"action": "navigate", "params": {"url": "https://www.amazon.com/s?k={sku}"}},
    {"action": "wait", "params": {"seconds": 5}},
    {"action": "wait_for", "params": {"selector": ".s-result-item, .s-main-slot, h2, #search, body", "timeout": 5}},
    {"action": "extract_and_transform", "params": {"fields": [
      {"name": "Name", "selector": "#productTitle", "attribute": "text"},
      {"name": "Brand", "selector": "#bylineInfo", "attribute": "text", "transform": [{"type": "regex_extract", "pattern": "Visit the (.+) Store", "group": 1}]},
      {"name": "Images", "selector": "#altImages li.imageThumbnail img", "attribute": "src", "multiple": true}
    ]}}
  ],
  "anti_detection": {"enable_captcha_detection": false, "enable_rate_limiting": false, "enable_human_simulation": false, "enable_session_rotation": false},
  "validation": {"no_results_selectors": [".s-no-results-filler", "#noResultsTitle"], "no_results_text_patterns": ["no results for", "0 results for"]},
  "timeout": 15, "retries": 2, "image_quality": 100,
  "test_skus": ["035585499741", "079105116708", "029695285400", "038100174642", "017800149495"],
  "fake_skus": ["xyzabc123notexist456", "B00ZZZZZZZ"],
  "edge_case_skus": ["A1", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'amazon';

-- Bradley
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000002', id, '1.0', '{
  "schema_version": "1.0",
  "name": "bradley",
  "display_name": "Bradley Caldwell",
  "base_url": "https://www.bradleycaldwell.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "h1", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": "//h1/preceding-sibling::p[1]/a", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-weight", "name": "Weight", "selector": "//li[contains(text(), ''Weight:'')]", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": "button[class*=\"h-12\"] img[src*=\"products\"]", "attribute": "src", "multiple": true, "required": false}
  ],
  "workflows": [
    {"action": "navigate", "params": {"url": "https://www.bradleycaldwell.com/search?term={sku}"}},
    {"action": "wait_for", "params": {"selector": ["//h1[contains(text(), \"Search results for\")]", "//h3[contains(text(), \"Sorry, no results for\")]"], "timeout": 5}},
    {"action": "check_no_results"},
    {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
    {"action": "extract", "params": {"fields": ["Name", "Brand", "Weight", "Images"]}}
  ],
  "validation": {"no_results_selectors": ["//h3[contains(text(), \"Sorry, no results for\")]"], "no_results_text_patterns": ["Sorry, no results for", "0 items"]},
  "timeout": 15, "retries": 2, "image_quality": 60,
  "test_skus": ["001135", "010199", "010202", "043205", "083354"],
  "fake_skus": ["xyzabc123notexist456", "999999"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'bradley';

-- Central Pet
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000003', id, '1.0', '{
  "schema_version": "1.0",
  "name": "central_pet",
  "display_name": "Central Pet",
  "base_url": "https://www.centralpet.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "#tst_productDetail_erpDescription, h1", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": "a[ng-if=\"vm.product.brand.detailPagePath\"]", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-weight", "name": "Weight", "selector": "//div[@class=\"specification-container\"]//li[strong[contains(text(), \"Product Gross Weight\")]]/span", "attribute": "innerHTML", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": "a#tst_productDetail_imageZoom img", "attribute": "src", "multiple": true, "required": false}
  ],
  "workflows": [
    {"action": "navigate", "params": {"url": "https://www.centralpet.com/Search?criteria={sku}"}},
    {"action": "conditional_click", "params": {"selector": "//button[contains(text(), \"Accept\")]"}},
    {"action": "wait_for", "params": {"selector": "#tst_productDetail_erpDescription, span.no-results-found, .no-results", "timeout": 5}},
    {"action": "check_no_results"},
    {"action": "extract", "params": {"fields": ["Name", "Brand", "Weight", "Images"]}}
  ],
  "validation": {"no_results_selectors": ["//h2[contains(text(), \"No results found\")]", "span.no-results-found"], "no_results_text_patterns": ["no results found", "no products found"]},
  "timeout": 15, "retries": 2, "image_quality": 80,
  "test_skus": ["38777520", "43580233", "55599200", "32530920"],
  "fake_skus": ["xyzabc123notexist456", "00000000"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'central-pet';

-- Coastal Pet
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000004', id, '1.0', '{
  "schema_version": "1.0",
  "name": "coastal",
  "display_name": "Coastal Pet",
  "base_url": "https://www.coastalpet.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "h4.product-details__product-name", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": "a.gray-bold-link[href*=\"brand=\"]", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-size", "name": "Size", "selector": ".product-details__size-button--active, .product-details__size-button", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": "img[src*=\"salsify\"][src*=\"images.salsify.com\"]", "attribute": "src", "multiple": true, "required": false}
  ],
  "workflows": [
    {"action": "navigate", "params": {"url": "https://www.coastalpet.com/products/search/?q={sku}"}},
    {"action": "conditional_click", "params": {"selector": "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"}},
    {"action": "wait_for", "params": {"selector": ".product-listing__title--text", "timeout": 5}},
    {"action": "check_no_results"},
    {"action": "extract", "params": {"fields": ["Name", "Brand", "Size", "Images"]}}
  ],
  "validation": {"no_results_selectors": ["//main//*[contains(text(), \"Your search returned no results\")]"], "no_results_text_patterns": ["Your search returned no results", "0 Products Found"]},
  "timeout": 15, "retries": 2, "image_quality": 20,
  "test_skus": ["HSCP2", "06601", "07001", "14401", "SCC12"],
  "fake_skus": ["xyzabc123notexist456", "ZZZZZ"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'coastal';

-- Mazuri
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000005', id, '1.0', '{
  "schema_version": "1.0",
  "name": "mazuri",
  "display_name": "Mazuri",
  "base_url": "https://www.mazuri.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "h2.product-single__title, .product-single__title", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": "h2.product-single__title", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-weight", "name": "Weight", "selector": "//*[contains(text(), \"Product Size:\")] | //*[contains(text(), \"Weight:\")]", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": ".product-single__photo img, .product__photo img", "attribute": "src", "multiple": true, "required": false}
  ],
  "workflows": [
    {"action": "navigate", "params": {"url": "https://mazuri.com/pages/search-results-page?q={sku}"}},
    {"action": "wait", "params": {"seconds": 3}},
    {"action": "wait_for", "params": {"selector": ".snize-product, a[href*=\"/products/\"], .snize-no-results", "timeout": 5}},
    {"action": "check_no_results"},
    {"action": "click", "params": {"selector": "a[href*=\"/products/\"]:not([href*=\"gift-card\"])", "index": 0}},
    {"action": "extract", "params": {"fields": ["Name", "Brand", "Weight", "Images"]}}
  ],
  "validation": {"no_results_selectors": [".snize-no-products-found", ".snize-no-results"], "no_results_text_patterns": ["no results found", "no products found"]},
  "timeout": 15, "retries": 2, "image_quality": 20,
  "test_skus": ["5E5L", "5M30", "5M3N", "5M21", "5MA2"],
  "fake_skus": ["xyzabc123notexist456", "9999999"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'mazuri';

-- Orgill (requires login)
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000006', id, '1.0', '{
  "schema_version": "1.0",
  "name": "orgill",
  "display_name": "Orgill",
  "base_url": "https://www.orgill.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "#cphMainContent_ctl00_lblDescription", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": "#cphMainContent_ctl00_lblVendorName", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-model", "name": "Model Number", "selector": "#cphMainContent_ctl00_lblModelNumber", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-weight", "name": "Weight", "selector": "//strong[contains(text(),\"Weight(lb):\")]/parent::div/following-sibling::div", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": "img[id*=\"imgProductDetail\"], #multipleImagesCarousel img", "attribute": "src", "multiple": true, "required": false}
  ],
  "workflows": [
    {"action": "login"},
    {"action": "navigate", "params": {"url": "https://www.orgill.com/SearchResultN.aspx?ddlhQ={sku}"}},
    {"action": "wait", "params": {"seconds": 5}},
    {"action": "wait_for", "params": {"selector": ["#cphMainContent_ctl00_lblDescription", "//span[contains(text(), \"Found 0 results\")]"], "timeout": 10}},
    {"action": "check_no_results"},
    {"action": "click", "params": {"selector": "//a[div[contains(text(), \"Ordering Specifications\")]]"}},
    {"action": "extract", "params": {"fields": ["Name", "Brand", "Model Number", "Weight", "Images"]}}
  ],
  "login": {"url": "https://www.orgill.com/index.aspx?tab=8", "username_field": "#cphMainContent_ctl00_loginOrgillxs_UserName", "password_field": "#cphMainContent_ctl00_loginOrgillxs_Password", "submit_button": "#cphMainContent_ctl00_loginOrgillxs_LoginButton"},
  "validation": {"no_results_selectors": ["//span[contains(text(), \"Found 0 results\")]"], "no_results_text_patterns": ["Found 0 results"]},
  "timeout": 15, "retries": 2, "image_quality": 40,
  "test_skus": ["037193347322", "032700006105", "073091023005"],
  "fake_skus": ["zzzzqqqq9999xxxx", "000000000000"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'orgill';

-- Pet Food Experts (requires login)
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000007', id, '1.0', '{
  "schema_version": "1.0",
  "name": "petfoodex",
  "display_name": "Pet Food Experts",
  "base_url": "https://www.petfoodexperts.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "h1", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-attributes", "name": "Attributes", "selector": "[data-test-selector=\"productDetails_specifications\"] li", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": "img[data-test-selector=\"productDetails_mainImage\"]", "attribute": "src", "multiple": true, "required": false}
  ],
  "workflows": [
    {"action": "login"},
    {"action": "navigate", "params": {"url": "https://orders.petfoodexperts.com/Search?query={sku}"}},
    {"action": "wait", "params": {"seconds": 3}},
    {"action": "wait_for", "params": {"selector": "h1, h2, [data-test-selector=\"page_ProductDetailsPage\"]", "timeout": 5}},
    {"action": "check_no_results"},
    {"action": "extract", "params": {"fields": ["Name", "Attributes", "Images"]}}
  ],
  "login": {"url": "https://orders.petfoodexperts.com/SignIn", "username_field": "#userName", "password_field": "#password", "submit_button": "button[data-test-selector=\"signIn_submit\"]"},
  "validation": {"no_results_selectors": ["//h2[contains(., \"0 item\")]"], "no_results_text_patterns": []},
  "timeout": 15, "retries": 2, "image_quality": 20,
  "test_skus": ["33011808", "10158320", "10132100"],
  "fake_skus": ["xyzabc123notexist456", "00000000"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'petfoodex';

-- Phillips (requires login)
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000008', id, '1.0', '{
  "schema_version": "1.0",
  "name": "phillips",
  "display_name": "Phillips Pet",
  "base_url": "https://shop.phillipspet.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": ".cc_product_item .cc_product_name", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": ".cc_product_item .product-brand .branded", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-upc", "name": "UPC", "selector": ".cc_product_item .product-upc .cc_value", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": ".cc_product_item .cc_product_image img", "attribute": "src", "multiple": true, "required": false}
  ],
  "workflows": [
    {"action": "login"},
    {"action": "navigate", "params": {"url": "https://shop.phillipspet.com/ccrz__ProductList?cartID=&operation=quickSearch&searchText={sku}"}},
    {"action": "wait_for", "params": {"selector": [".cc_product_item .cc_product_name", ".plp-empty-state-message-container h3"], "timeout": 5}},
    {"action": "check_no_results"},
    {"action": "extract", "params": {"fields": ["Name", "Brand", "UPC", "Images"]}}
  ],
  "login": {"url": "https://shop.phillipspet.com/ccrz__CCSiteLogin", "username_field": "#emailField", "password_field": "#passwordField", "submit_button": "#send2Dsk"},
  "validation": {"no_results_selectors": [".plp-empty-state-message-container h3"], "no_results_text_patterns": []},
  "timeout": 15, "retries": 2, "image_quality": 20,
  "test_skus": ["072705115310", "072705104321", "072705201234"],
  "fake_skus": ["xyzabc123notexist456", "000000000000"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'phillips';

-- Walmart
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, change_summary)
SELECT 'ver001-0000-0000-0000-000000000009', id, '1.0', '{
  "schema_version": "1.0",
  "name": "walmart",
  "display_name": "Walmart",
  "base_url": "https://www.walmart.com",
  "selectors": [
    {"id": "sel-name", "name": "Name", "selector": "[data-testid=\"product-title\"], h1[itemprop=\"name\"], h1.prod-ProductTitle", "attribute": "text", "multiple": false, "required": true},
    {"id": "sel-brand", "name": "Brand", "selector": "[data-testid=\"product-brand\"], a[link-identifier=\"brand\"]", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-description", "name": "Description", "selector": "[data-testid=\"product-description\"], div.about-desc", "attribute": "text", "multiple": false, "required": false},
    {"id": "sel-images", "name": "Images", "selector": "[data-testid=\"media-thumbnail\"] img, .hover-zoom-hero-image img", "attribute": "src", "multiple": true, "required": false},
    {"id": "sel-weight", "name": "Weight", "selector": "//div[contains(text(), \"Weight\")]/following-sibling::div", "attribute": "text", "multiple": false, "required": false}
  ],
  "workflows": [
    {"action": "navigate", "params": {"url": "https://www.walmart.com/search?q={sku}"}},
    {"action": "wait", "params": {"seconds": 3}},
    {"action": "wait_for", "params": {"selector": "[data-testid=\"list-view\"], div.search-result-gridview-items, .no-results", "timeout": 5}},
    {"action": "check_no_results"},
    {"action": "click", "params": {"selector": "[data-item-id] a.product-title-link", "index": 0}},
    {"action": "extract", "params": {"fields": ["Name", "Brand", "Description", "Images", "Weight"]}}
  ],
  "anti_detection": {"enable_captcha_detection": true, "enable_rate_limiting": true, "enable_human_simulation": true, "enable_blocking_handling": true, "rate_limit_min_delay": 2.0, "rate_limit_max_delay": 5.0},
  "validation": {"no_results_selectors": [".no-results", ".search-no-results"], "no_results_text_patterns": ["no results", "0 results"]},
  "timeout": 15, "retries": 2, "image_quality": 100,
  "test_skus": ["035585499741", "079105116708", "029695285400"],
  "fake_skus": ["xyzabc123notexist456", "000000000000"]
}'::jsonb, 'published', 1, NOW(), 'Migrated from BayStateScraper YAML'
FROM scraper_configs WHERE slug = 'walmart';

-- Step 4: Update current_version_id for all configs
UPDATE scraper_configs sc
SET current_version_id = cv.id
FROM scraper_config_versions cv
WHERE cv.config_id = sc.id AND cv.status = 'published'
AND sc.current_version_id IS NULL;

-- Step 5: Verify migration
SELECT 
    sc.slug,
    sc.display_name,
    sc.domain,
    cv.status,
    cv.version_number,
    jsonb_array_length(cv.config->'selectors') as selector_count,
    jsonb_array_length(cv.config->'workflows') as workflow_count
FROM scraper_configs sc
JOIN scraper_config_versions cv ON sc.current_version_id = cv.id
ORDER BY sc.slug;
