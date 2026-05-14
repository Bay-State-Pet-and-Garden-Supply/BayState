# Workflow Templates

Three pre-built workflow templates for common scraper patterns.
Select the template that matches the site's structure, then fill in discovered selectors.

---

## Template 1: Direct PDP

**When to use:** The site has direct product URLs containing the SKU.
The product page loads immediately without searching or clicking.

**Examples:** Phillips, PetFoodEx, Bradley, Mazuri, Orgill

```yaml
workflows:
  - action: navigate
    name: Go to product page
    params:
      url: "{{base_url}}/product/{{sku}}"
      # Alternative URL patterns:
      # url: "{{base_url}}/products/{{sku}}"
      # url: "{{base_url}}/p/{{sku}}"
      # url: "{{base_url}}/ccrz__ProductDetails?sku={{sku}}"
      wait_until: networkidle
      wait_after: 1

  - action: wait_for
    name: Wait for product load
    params:
      selector:
        - "h1"
        - "[data-testid='product-title']"
        - ".product-title"
      timeout: 10

  - action: extract
    name: Extract product fields
    params:
      fields:
        - Name
        - Brand
        - Price
        - Image URLs
        - Description
        - UPC
        - ItemNumber

  - action: process_images
    name: Process product images
    params:
      field: Image URLs
      deduplicate: true

  - action: transform_value
    name: Clean price
    params:
      field: Price
      transformations:
        - type: strip

  - action: transform_value
    name: Clean brand
    params:
      field: Brand
      transformations:
        - type: strip
```

---

## Template 2: Search → Click → PDP

**When to use:** The site requires searching for the SKU and clicking a search result
to reach the product detail page.

**Examples:** Amazon, Gardeners, Coastal, CountryMax, PetsWarehouse

```yaml
workflows:
  - action: navigate
    name: Search for SKU
    params:
      url: "{{base_url}}/search?q={{sku}}"
      # Alternative search URL patterns:
      # url: "{{base_url}}/s?k={{sku}}"
      # url: "{{base_url}}/search?query={{sku}}"
      wait_until: networkidle
      wait_after: 2

  - action: wait_for
    name: Wait for search results or no-results
    params:
      selector:
        - ".search-result"
        - ".product-card"
        - ".no-results"
        - "[data-testid='no-results']"
      timeout: 10

  - action: check_no_results
    name: Check if search returned no results
    params:
      fallback_empty_search_selector: ".search-results-empty"

  - action: conditional_skip
    name: Skip remaining steps if no results
    params:
      if_flag: no_results_found

  - action: extract_single
    name: Get first search result link
    params:
      field: search_result_link
      selector: ".search-result a"
      # Alternative selectors:
      # selector: ".product-card a"
      # selector: "[data-testid='search-result-link']"
      required: true

  - action: click
    name: Click first result
    params:
      selector: "{{search_result_link}}"
      wait_after: 2

  - action: wait_for
    name: Wait for PDP to load
    params:
      selector:
        - "h1"
        - "[data-testid='product-title']"
        - ".product-title"
      timeout: 10

  - action: extract
    name: Extract product fields from PDP
    params:
      fields:
        - Name
        - Brand
        - Price
        - Image URLs
        - Description
        - UPC
        - ItemNumber

  - action: process_images
    name: Process product images
    params:
      field: Image URLs
      deduplicate: true

  - action: transform_value
    name: Clean price
    params:
      field: Price
      transformations:
        - type: strip
```

---

## Template 3: Login → Search → PDP

**When to use:** The site requires authentication before accessing product data
or prices. Common for wholesale/B2B vendors.

**Examples:** Phillips, PetFoodEx, Central-Pet, Orgill

```yaml
# Additional config sections for login-required sites:
requires_login: true

credential_refs:
  - {vendor_slug}  # e.g., phillips, orgill

login:
  url: "{{base_url}}/login"
  username_field: "#email"
  password_field: "#password"
  submit_button: "button[type='submit']"
  success_indicator: ".account-menu"
  failure_indicators:
    selectors:
      - ".error-message"
      - ".login-error"
    texts:
      - "invalid username or password"
      - "login failed"
    url_contains:
      - "/login"
      - "/error"

workflows:
  - action: login
    name: Authenticate
    params:
      # Credentials resolved from credential_refs at runtime

  - action: navigate
    name: Go to product page
    params:
      url: "{{base_url}}/product/{{sku}}"
      wait_until: networkidle
      wait_after: 2

  - action: wait_for
    name: Wait for product load
    params:
      selector:
        - "h1"
        - "[data-testid='product-title']"
        - ".product-title"
      timeout: 10

  - action: extract
    name: Extract product fields
    params:
      fields:
        - Name
        - Brand
        - Price
        - Image URLs
        - Description
        - UPC
        - ItemNumber

  - action: process_images
    name: Process product images
    params:
      field: Image URLs
      deduplicate: true

  - action: transform_value
    name: Clean price
    params:
      field: Price
      transformations:
        - type: strip
```

---

## Conditional Variations

### Validate search result before clicking

Add after `extract_single` in Template 2:

```yaml
  - action: verify_sku_on_page
    name: Verify SKU appears on search result page
    params:
      sku_field: sku
      strict: false

  - action: conditional
    name: Skip click if already on PDP
    params:
      condition_type: element_exists
      selector: "h1[data-testid='product-title']"
      then: []
      else:
        - action: click
          params:
            selector: "{{search_result_link}}"
            wait_after: 2
```

### Handle cookie banners

Add after `navigate` in any template:

```yaml
  - action: conditional_click
    name: Accept cookies if present
    params:
      selector: "button[data-testid='accept-cookies'], .cookie-banner button, #accept-cookies"
      timeout: 2
```

### Handle "Load More" or pagination

For search results with pagination:

```yaml
  - action: conditional
    name: Load more results if available
    params:
      condition_type: element_exists
      selector: ".load-more, .pagination-next"
      then:
        - action: click
          params:
            selector: ".load-more"
            wait_after: 2
```

---

## Platform-Specific URL Patterns

| Platform | Direct PDP URL | Search URL |
|----------|---------------|------------|
| Shopify | `{{base_url}}/products/{{sku}}` | `{{base_url}}/search?q={{sku}}` |
| BigCommerce | `{{base_url}}/p/{{sku}}` | `{{base_url}}/search.php?search_query={{sku}}` |
| Magento | `{{base_url}}/product/{{sku}}` | `{{base_url}}/catalogsearch/result/?q={{sku}}` |
| WooCommerce | `{{base_url}}/product/{{sku}}` | `{{base_url}}/?s={{sku}}&post_type=product` |
| Custom | Varies | Varies |
