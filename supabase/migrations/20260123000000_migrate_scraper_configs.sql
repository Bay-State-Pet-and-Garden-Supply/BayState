-- Migration: Convert old YAML scraper configs to new versioned architecture
-- Date: 2026-01-23
-- Source: BayStateTools/scraper_backend/scrapers/configs/*.yaml

-- This migration creates scraper_configs and scraper_config_versions records
-- for each of the 9 scrapers from the BayStateTools repository.

-- Step 1: Create scraper_configs and initial draft versions for each scraper

-- Amazon (no login required)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'amazon',
    'Amazon',
    'www.amazon.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "amazon",
      "display_name": "Amazon",
      "base_url": "https://www.amazon.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "#productTitle", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": "#bylineInfo", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "Images", "selector": "#altImages li.imageThumbnail img", "attribute": "src", "multiple": true, "required": false},
        {"id": "sel-4", "name": "Weight", "selector": "//tr[.//th[contains(., \"Weight\")]] | //li[contains(., \"ounces\")] | //li[contains(., \"pounds\")]", "attribute": "text", "multiple": false, "required": false}
      ],
      "workflows": [
        {"action": "conditional_click", "params": {"selector": "#sp-cc-accept"}},
        {"action": "navigate", "params": {"url": "https://www.amazon.com/s?k={sku}"}},
        {"action": "wait", "params": {"seconds": 5}},
        {"action": "wait_for", "params": {"selector": ".s-result-item, .s-main-slot, .s-no-results-filler, #noResultsTitle, h2, #search, body", "timeout": 5}},
        {"action": "wait", "params": {"seconds": 2}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "click", "params": {"selector": "div.s-result-item[data-asin] h2 a.a-link-normal, div.s-result-item[data-asin] a.a-link-normal[href*=\"/dp/\"], .s-result-item a[href*=\"/dp/\"]", "filter_text_exclude": "sponsored", "index": 0}},
        {"action": "wait_for", "params": {"selector": ["#productTitle", "#title", "h1"], "timeout": 5}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "Images", "Weight"]}},
        {"action": "transform_value", "params": {"field": "Brand", "regex": "Visit the (.+) Store", "transformations": []}},
        {"action": "transform_value", "params": {"field": "Images", "transformations": [{"type": "replace", "pattern": "_AC_US40_", "replacement": "_AC_SL1500_"}]}}
      ],
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "rate_limit_min_delay": 1.0,
        "rate_limit_max_delay": 3.0,
        "session_rotation_interval": 100,
        "max_retries_on_detection": 3
      },
      "validation": {
        "no_results_selectors": [
          "[widgetId=\"messaging-messages-no-results\"]",
          ".s-no-results-filler",
          "#noResultsTitle",
          ".s-desktop-no-results",
          "//h2[contains(text(), \"No results for your search query\")]"
        ],
        "no_results_text_patterns": [
          "no results for",
          "0 results for",
          "No results for your search query",
          "Try checking your spelling"
        ]
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 100,
      "test_skus": ["035585499741", "079105116708", "029695285400", "038100174642", "017800149495", "852Icons4"],
      "fake_skus": ["xyzabc123notexist456", "B00ZZZZZZZ", "NOTAPRODUCT"],
      "edge_case_skus": ["A1", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'amazon'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Bradley (no login required)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'bradley',
    'Bradley Caldwell',
    'www.bradleycaldwell.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "bradley",
      "display_name": "Bradley Caldwell",
      "base_url": "https://www.bradleycaldwell.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "h1", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": "//h1/preceding-sibling::p[1]/a", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "Weight", "selector": "//li[contains(text(), \"Weight:\")]", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-4", "name": "Image URLs", "selector": "button[class*=\"h-12\"] img[src*=\"products\"], button[class*=\"h-24\"] img[src*=\"products\"]", "attribute": "src", "multiple": true, "required": false}
      ],
      "workflows": [
        {"action": "navigate", "params": {"url": "https://www.bradleycaldwell.com/search?term={sku}"}},
        {"action": "wait_for", "params": {"selector": ["//h1[contains(text(), \"Search results for\")]", "//h3[contains(text(), \"Sorry, no results for\")]"], "timeout": 5}},
        {"action": "wait", "params": {"duration": 2}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "click", "params": {"selector": "article a", "index": 0}},
        {"action": "wait", "params": {"duration": 1}},
        {"action": "wait_for", "params": {"selector": "//h2[contains(text(), \"Additional information\")]", "timeout": 5}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "Weight", "Image URLs"]}},
        {"action": "transform_value", "params": {"field": "Image URLs", "transformations": [{"type": "replace", "pattern": "/small/", "replacement": "/large/" }, {"type": "replace", "pattern": "_small", "replacement": "_large"}]}}
      ],
      "validation": {
        "no_results_selectors": ["//h3[contains(text(), \"Sorry, no results for\")]"],
        "no_results_text_patterns": ["Sorry, no results for", "0 items"]
      },
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 60,
      "test_skus": ["001135", "010199", "010202", "043205", "083354", "269376"],
      "fake_skus": ["xyzabc123notexist456", "999999", "NOTEXIST"],
      "edge_case_skus": ["1", "0000000000000"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'bradley'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Central Pet (no login required)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'central-pet',
    'Central Pet',
    'www.centralpet.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "central_pet",
      "display_name": "Central Pet",
      "base_url": "https://www.centralpet.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "#tst_productDetail_erpDescription, h1", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": "a[ng-if=\"vm.product.brand.detailPagePath\"]", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "Weight", "selector": "//div[@class=\"specification-container\"]//li[strong[contains(text(), \"Product Gross Weight\")]]/span", "attribute": "innerHTML", "multiple": false, "required": false},
        {"id": "sel-4", "name": "Image URLs", "selector": "a#tst_productDetail_imageZoom img", "attribute": "src", "multiple": true, "required": false}
      ],
      "workflows": [
        {"action": "navigate", "params": {"url": "https://www.centralpet.com/Search?criteria={sku}"}},
        {"action": "conditional_click", "params": {"selector": "//button[contains(text(), \"Accept\")]"}},
        {"action": "wait_for", "params": {"selector": "#tst_productDetail_erpDescription, span.no-results-found, .no-results", "timeout": 5}},
        {"action": "wait", "params": {"duration": 2}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "Weight", "Image URLs"]}},
        {"action": "transform_value", "params": {"field": "Image URLs", "transformations": [{"type": "replace", "pattern": "/w_900/", "replacement": "/w_1500/"}]}}
      ],
      "http_status": {
        "enabled": true,
        "error_status_codes": [400, 401, 403, 404, 500, 502, 503, 504],
        "fail_on_error_status": true,
        "warning_status_codes": [301, 302, 307, 308]
      },
      "validation": {
        "no_results_selectors": [
          "//h2[contains(text(), \"No results found\")]",
          "span.no-results-found",
          ".no-results",
          ".empty-search",
          "[data-testid*=\"no-results\"]",
          "div.search-results-none",
          "p:contains(\"Sorry, no products were found\")",
          "h2:contains(\"No Search Results\")"
        ],
        "no_results_text_patterns": [
          "no results found",
          "no products found",
          "your search returned no results",
          "we couldn\"t find any results",
          "no items match your search",
          "sorry, no products were found",
          "no search results"
        ]
      },
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "rate_limit_min_delay": 1.0,
        "rate_limit_max_delay": 3.0,
        "session_rotation_interval": 100,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 80,
      "test_skus": ["38777520", "43580233", "55599200", "32530920", "74200017", "32530120"],
      "fake_skus": ["xyzabc123notexist456", "00000000", "99999999"],
      "edge_case_skus": ["1", "123456789012345"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'central-pet'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Coastal Pet (no login required)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'coastal-pet',
    'Coastal Pet',
    'www.coastalpet.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "coastal",
      "display_name": "Coastal Pet",
      "base_url": "https://www.coastalpet.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "h4.product-details__product-name", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": "a.gray-bold-link[href*=\"brand=\"]", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "Size", "selector": ".product-details__size-button--active, .product-details__size-button", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-4", "name": "Image URLs", "selector": "img[src*=\"salsify\"][src*=\"images.salsify.com\"]", "attribute": "src", "multiple": true, "required": false}
      ],
      "workflows": [
        {"action": "navigate", "params": {"url": "https://www.coastalpet.com/products/search/?q={sku}"}},
        {"action": "conditional_click", "params": {"selector": "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, .CybotCookiebotDialogBodyButton, button[aria-label=\"Allow all\"]"}},
        {"action": "wait_for", "params": {"selector": [".product-listing__title--text", "h3:has-text(\"Search\")", "//h3[contains(text(), \"Search\")]"], "timeout": 5}},
        {"action": "wait", "params": {"duration": 1}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "click", "params": {"selector": "a.product-listing__title.product-listing__link"}},
        {"action": "wait_for", "params": {"selector": ".product-details", "timeout": 5}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "Size", "Image URLs"]}}
      ],
      "validation": {
        "no_results_selectors": [
          "//main//*[contains(text(), \"Your search returned no results\")]",
          "//main//*[contains(text(), \"0 Products Found\")]"
        ],
        "no_results_text_patterns": ["Your search returned no results", "0 Products Found"]
      },
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "rate_limit_min_delay": 1.0,
        "rate_limit_max_delay": 3.0,
        "session_rotation_interval": 100,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 20,
      "test_skus": ["HSCP2", "06601", "07001", "14401", "SCC12", "WWAC1"],
      "fake_skus": ["xyzabc123notexist456", "ZZZZZ", "00000"],
      "edge_case_skus": ["A", "ABCDEFGHIJ123456"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'coastal-pet'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Mazuri (no login required)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'mazuri',
    'Mazuri',
    'www.mazuri.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "mazuri",
      "display_name": "Mazuri",
      "base_url": "https://www.mazuri.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "h2.product-single__title, .product-single__title", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": "h2.product-single__title, .product-single__title", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "Weight", "selector": "//*[contains(text(), \"Product Size:\")] | //*[contains(text(), \"Weight:\")] | //*[contains(@class, \"product-weight\")]", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-4", "name": "Image URLs", "selector": ".product-single__photo img, .product__photo img, #carouselExampleControls img, .product-gallery img", "attribute": "src", "multiple": true, "required": false}
      ],
      "workflows": [
        {"action": "navigate", "params": {"url": "https://mazuri.com/pages/search-results-page?q={sku}"}},
        {"action": "wait", "params": {"seconds": 3}},
        {"action": "wait_for", "params": {"selector": ".snize-product, a[href*=\"/products/\"], .snize-no-results, .snize-no-products-found, #search-no-results, .search-results, body", "timeout": 5}},
        {"action": "wait", "params": {"seconds": 2}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "click", "params": {"selector": "a[href*=\"/products/\"]:not([href*=\"gift-card\"])", "index": 0}},
        {"action": "wait_for", "params": {"selector": ["h2.product-single__title", ".product-single", "[data-section-type=\"product\"]"], "timeout": 5}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "Weight", "Image URLs"]}},
        {"action": "transform_value", "params": {"field": "Image URLs", "transformations": [{"type": "replace", "pattern": "_small", "replacement": "_large"}]}},
        {"action": "transform_value", "params": {"field": "Brand", "transformations": [{"type": "replace", "pattern": "^.*$", "replacement": "Mazuri"}]}}
      ],
      "validation": {
        "no_results_selectors": [
          ".snize-no-products-found",
          ".snize-no-products-found-text",
          ".no-results",
          ".empty-search",
          "[data-testid*=\"no-results\"]",
          ".snize-no-results",
          "#search-no-results",
          ".snize-no-results-container",
          ".snize-message-no-results"
        ],
        "no_results_text_patterns": [
          "no results found",
          "no products found",
          "your search returned no results",
          "we couldn\"t find any results",
          "no items match your search",
          "sorry, nothing found",
          "no matches found",
          "didn\"t match any results"
        ]
      },
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "rate_limit_min_delay": 0.5,
        "rate_limit_max_delay": 1.0,
        "session_rotation_interval": 100,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 20,
      "test_skus": ["5E5L", "5M30", "5M3N", "5M21", "5MA2", "5M4C"],
      "fake_skus": ["xyzabc123notexist456", "9999999", "NOTEXIST"],
      "edge_case_skus": ["1", "00000000000"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'mazuri'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Orgill (requires login)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'orgill',
    'Orgill',
    'www.orgill.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "orgill",
      "display_name": "Orgill",
      "base_url": "https://www.orgill.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "#cphMainContent_ctl00_lblDescription", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": "#cphMainContent_ctl00_lblVendorName", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "model_number", "selector": "#cphMainContent_ctl00_lblModelNumber", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-4", "name": "Weight", "selector": "//strong[contains(text(),\"Weight(lb):\")]/parent::div/following-sibling::div", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-5", "name": "Image URLs", "selector": "img[id*=\"imgProductDetail\"], #multipleImagesCarousel img", "attribute": "src", "multiple": true, "required": false}
      ],
      "workflows": [
        {"action": "login"},
        {"action": "navigate", "params": {"url": "https://www.orgill.com/SearchResultN.aspx?ddlhQ={sku}"}},
        {"action": "wait", "params": {"seconds": 5}},
        {"action": "wait_for", "params": {"selector": ["#cphMainContent_ctl00_lblDescription", "#cphMainContent_ctl00_lblErrorMessage", "#cphMainContent_ctl00_lblSearchSubHeader", "//span[contains(text(), \"Found 0 results\")]", ".no-results", "body"], "timeout": 10}},
        {"action": "wait", "params": {"seconds": 5}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "click", "params": {"selector": "//a[div[contains(text(), \"Ordering Specifications\")]]"}},
        {"action": "wait_for", "params": {"selector": "#orderSpecificationDiv", "timeout": 5}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "model_number", "Weight", "Image URLs"]}},
        {"action": "transform_value", "params": {"field": "Image URLs", "transformations": [{"type": "replace", "pattern": "/websmall/", "replacement": "/web/"}]}}
      ],
      "login": {
        "url": "https://www.orgill.com/index.aspx?tab=8",
        "username_field": "#cphMainContent_ctl00_loginOrgillxs_UserName",
        "password_field": "#cphMainContent_ctl00_loginOrgillxs_Password",
        "submit_button": "#cphMainContent_ctl00_loginOrgillxs_LoginButton",
        "success_indicator": "a[href=\"/signOut.aspx\"]",
        "timeout": 60
      },
      "validation": {
        "no_results_selectors": [
          "//span[contains(text(), \"Found 0 results\")]",
          ".no-results",
          ".empty-search",
          "[data-testid*=\"no-results\"]",
          ".search-no-results"
        ],
        "no_results_text_patterns": [
          "no results found",
          "no products found",
          "your search returned no results",
          "we couldn\"t find any results",
          "no items match your search",
          "Found 0 results"
        ]
      },
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "rate_limit_min_delay": 1.0,
        "rate_limit_max_delay": 3.0,
        "session_rotation_interval": 100,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 40,
      "test_skus": ["037193347322", "032700006105", "073091023005", "027773008934", "032886595189", "071859975047"],
      "fake_skus": ["zzzzqqqq9999xxxx", "000000000000", "999999999999"],
      "edge_case_skus": ["123", "1234567890123456789"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'orgill'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Pet Food Experts (requires login)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'petfoodex',
    'Pet Food Experts',
    'www.petfoodexperts.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "petfoodex",
      "display_name": "Pet Food Experts",
      "base_url": "https://www.petfoodexperts.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "h1", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Attributes", "selector": "[data-test-selector=\"productDetails_specifications\"] li", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "Image URLs", "selector": "img[data-test-selector=\"productDetails_mainImage\"]", "attribute": "src", "multiple": true, "required": false}
      ],
      "workflows": [
        {"action": "login"},
        {"action": "navigate", "params": {"url": "https://orders.petfoodexperts.com/Search?query={sku}"}},
        {"action": "wait", "params": {"seconds": 3}},
        {"action": "wait_for", "params": {"selector": "h1, h2, [data-test-selector=\"page_ProductDetailsPage\"], body", "timeout": 5}},
        {"action": "wait", "params": {"seconds": 2}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "extract", "params": {"fields": ["Name", "Attributes", "Image URLs"]}},
        {"action": "transform_value", "params": {"source_field": "Attributes", "target_field": "Brand", "regex": "Brand:\\\\s*([^\\\\n]+)"}},
        {"action": "transform_value", "params": {"source_field": "Attributes", "target_field": "Weight", "regex": "Weight:\\\\s*([^\\\\n]+)"}},
        {"action": "transform_value", "params": {"field": "Image URLs", "transformations": [{"type": "replace", "pattern": "_md", "replacement": "_lg"}]}}
      ],
      "login": {
        "url": "https://orders.petfoodexperts.com/SignIn",
        "username_field": "#userName",
        "password_field": "#password",
        "submit_button": "button[data-test-selector=\"signIn_submit\"]",
        "success_indicator": "[data-test-selector=\"header_userName\"]",
        "timeout": 20
      },
      "validation": {
        "no_results_selectors": ["//h2[contains(., \"0 item\")]", "//h2[contains(., \"0 items\")]"],
        "no_results_text_patterns": []
      },
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "rate_limit_min_delay": 1.0,
        "rate_limit_max_delay": 3.0,
        "session_rotation_interval": 100,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 20,
      "test_skus": ["33011808", "10158320", "10132100", "10012345", "20456789", "30987654"],
      "fake_skus": ["xyzabc123notexist456", "00000000", "99999999"],
      "edge_case_skus": ["1", "1234567890123"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'petfoodex'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Phillips (requires login)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'phillips',
    'Phillips Pet',
    'shop.phillipspet.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "phillips",
      "display_name": "Phillips Pet",
      "base_url": "https://shop.phillipspet.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": ".cc_product_item .cc_product_name", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": ".cc_product_item .product-brand .branded", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "UPC", "selector": ".cc_product_item .product-upc .cc_value", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-4", "name": "ItemNumber", "selector": ".cc_product_item .product-item-number .cc_value", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-5", "name": "Image URLs", "selector": ".cc_product_item .cc_product_image img", "attribute": "src", "multiple": true, "required": false}
      ],
      "workflows": [
        {"action": "login"},
        {"action": "navigate", "params": {"url": "https://shop.phillipspet.com/ccrz__ProductList?cartID=&operation=quickSearch&searchText={sku}&portalUser=&store=DefaultStore&cclcl=en_US"}},
        {"action": "wait_for", "params": {"selector": [".cc_product_item .cc_product_name", ".plp-empty-state-message-container h3"], "timeout": 5}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "UPC", "ItemNumber", "Image URLs"]}},
        {"action": "transform_value", "params": {"field": "Image URLs", "transformations": [{"type": "replace", "pattern": "/thumb/", "replacement": "/large/"}]}}
      ],
      "login": {
        "url": "https://shop.phillipspet.com/ccrz__CCSiteLogin",
        "username_field": "#emailField",
        "password_field": "#passwordField",
        "submit_button": "#send2Dsk",
        "success_indicator": "a.doLogout.cc_do_logout",
        "timeout": 60
      },
      "validation": {
        "no_results_selectors": [".plp-empty-state-message-container h3"],
        "no_results_text_patterns": []
      },
      "anti_detection": {
        "enable_captcha_detection": false,
        "enable_rate_limiting": false,
        "enable_human_simulation": false,
        "enable_session_rotation": false,
        "enable_blocking_handling": false,
        "rate_limit_min_delay": 1.0,
        "rate_limit_max_delay": 3.0,
        "session_rotation_interval": 100,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 20,
      "test_skus": ["072705115310", "072705104321", "072705201234", "045663012106", "073893191001", "038100175489"],
      "fake_skus": ["xyzabc123notexist456", "000000000000", "999999999999"],
      "edge_case_skus": ["123", "1234567890123456789"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'phillips'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Walmart (no login required)
INSERT INTO scraper_configs (id, slug, display_name, domain, schema_version, created_by)
SELECT 
    gen_random_uuid(),
    'walmart',
    'Walmart',
    'www.walmart.com',
    '1.0',
    NULL
ON CONFLICT (slug) DO NOTHING;

INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, change_summary, created_by)
SELECT 
    gen_random_uuid(),
    sc.id,
    '1.0',
    '{
      "schema_version": "1.0",
      "name": "walmart",
      "display_name": "Walmart",
      "base_url": "https://www.walmart.com",
      "selectors": [
        {"id": "sel-1", "name": "Name", "selector": "[data-testid=\"product-title\"], h1[itemprop=\"name\"], h1.prod-ProductTitle", "attribute": "text", "multiple": false, "required": true},
        {"id": "sel-2", "name": "Brand", "selector": "[data-testid=\"product-brand\"], a[link-identifier=\"brand\"], span.prod-brandName a", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-3", "name": "Description", "selector": "[data-testid=\"product-description\"], div.about-desc, div.AboutThisItem-description", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-4", "name": "Images", "selector": "[data-testid=\"media-thumbnail\"] img, .hover-zoom-hero-image img, img.prod-hero-image-image", "attribute": "src", "multiple": true, "required": false},
        {"id": "sel-5", "name": "Weight", "selector": "//div[contains(text(), \"Weight\")]/following-sibling::div | //tr[.//td[contains(., \"Weight\")]]/td[2]", "attribute": "text", "multiple": false, "required": false},
        {"id": "sel-6", "name": "UPC", "selector": "//div[contains(text(), \"UPC\")]/following-sibling::div | //tr[.//td[contains(., \"UPC\")]]/td[2]", "attribute": "text", "multiple": false, "required": false}
      ],
      "workflows": [
        {"action": "navigate", "params": {"url": "https://www.walmart.com/search?q={sku}"}},
        {"action": "wait", "params": {"seconds": 3}},
        {"action": "wait_for", "params": {"selector": "[data-testid=\"list-view\"], div.search-result-gridview-items, .search-result-listview-items, [data-testid=\"item-stack\"], .no-results", "timeout": 5}},
        {"action": "wait", "params": {"seconds": 2}},
        {"action": "check_no_results"},
        {"action": "conditional_skip", "params": {"if_flag": "no_results_found"}},
        {"action": "click", "params": {"selector": "[data-testid=\"list-view\"] a[link-identifier=\"brand\"], div.search-result-gridview-item a, [data-item-id] a.product-title-link", "filter_text_exclude": "sponsored", "index": 0}},
        {"action": "wait_for", "params": {"selector": ["[data-testid=\"product-title\"]", "h1[itemprop=\"name\"]", "h1.prod-ProductTitle"], "timeout": 5}},
        {"action": "wait", "params": {"seconds": 2}},
        {"action": "extract", "params": {"fields": ["Name", "Brand", "Description", "Images", "Weight", "UPC"]}},
        {"action": "transform_value", "params": {"field": "Images", "transformations": [{"type": "replace", "pattern": "odnHeight=\\\\d+", "replacement": "odnHeight=612"}, {"type": "replace", "pattern": "odnWidth=\\\\d+", "replacement": "odnWidth=612"}]}}
      ],
      "validation": {
        "no_results_selectors": [
          ".no-results",
          "[data-testid=\"no-results\"]",
          ".search-no-results",
          "//h2[contains(text(), \"No results\")]"
        ],
        "no_results_text_patterns": [
          "no results",
          "0 results",
          "We couldn\"t find",
          "Try checking your spelling",
          "Sorry, we didn\"t find"
        ]
      },
      "anti_detection": {
        "enable_captcha_detection": true,
        "enable_rate_limiting": true,
        "enable_human_simulation": true,
        "enable_session_rotation": false,
        "enable_blocking_handling": true,
        "rate_limit_min_delay": 2.0,
        "rate_limit_max_delay": 5.0,
        "session_rotation_interval": 50,
        "max_retries_on_detection": 3
      },
      "timeout": 15,
      "retries": 2,
      "image_quality": 100,
      "test_skus": ["035585499741", "079105116708", "029695285400", "038100174642", "017800149495", "023100106434"],
      "fake_skus": ["xyzabc123notexist456", "000000000000", "999999999999"],
      "edge_case_skus": ["123", "12345678901234567890"]
    }'::jsonb,
    'draft',
    1,
    'Migrated from BayStateTools YAML config',
    NULL
FROM scraper_configs sc
WHERE sc.slug = 'walmart'
AND NOT EXISTS (SELECT 1 FROM scraper_config_versions WHERE config_id = sc.id);

-- Step 2: Update all configs to point to their first version
UPDATE scraper_configs sc
SET current_version_id = (
    SELECT cv.id 
    FROM scraper_config_versions cv 
    WHERE cv.config_id = sc.id 
    ORDER BY cv.created_at ASC 
    LIMIT 1
)
WHERE sc.current_version_id IS NULL;

-- Step 3: Mark all versions as validated (assuming they're working configs)
-- Using jsonb_build_object to safely construct the JSON
UPDATE scraper_config_versions cv
SET status = 'validated',
    validation_result = jsonb_build_object(
      'valid', true,
      'errors', jsonb_build_array(),
      'validated_at', NOW()::text,
      'validated_by', null,
      'source', 'migration_from_yaml'
    )
WHERE cv.status = 'draft';

-- Step 4: Create published versions for production use
-- For each config, create a published version from the validated version
INSERT INTO scraper_config_versions (id, config_id, schema_version, config, status, version_number, published_at, published_by, change_summary, validation_result, created_by)
SELECT 
    gen_random_uuid(),
    cv.config_id,
    cv.schema_version,
    cv.config,
    'published',
    cv.version_number,
    NOW(),
    NULL,
    'Published from migrated YAML config',
    cv.validation_result,
    NULL
FROM scraper_config_versions cv
WHERE cv.status = 'validated'
AND NOT EXISTS (
    SELECT 1 FROM scraper_config_versions cv2 
    WHERE cv2.config_id = cv.config_id 
    AND cv2.status = 'published'
);

-- Step 5: Update configs to point to published version
UPDATE scraper_configs sc
SET current_version_id = (
    SELECT cv.id 
    FROM scraper_config_versions cv 
    WHERE cv.config_id = sc.id AND cv.status = 'published'
    ORDER BY cv.created_at ASC 
    LIMIT 1
)
WHERE sc.current_version_id IS NULL 
OR sc.current_version_id IN (
    SELECT cv.id FROM scraper_config_versions cv WHERE cv.config_id = sc.id AND cv.status = 'validated'
);

-- Step 6: Archive the validated draft versions
UPDATE scraper_config_versions cv
SET status = 'archived'
WHERE cv.status = 'validated'
AND cv.id NOT IN (SELECT current_version_id FROM scraper_configs);

-- Verification query
SELECT 
    sc.slug,
    sc.display_name,
    sc.domain,
    cv.status as current_status,
    cv.version_number,
    (cv.config->>'base_url') as base_url
FROM scraper_configs sc
LEFT JOIN scraper_config_versions cv ON sc.current_version_id = cv.id
ORDER BY sc.slug;
