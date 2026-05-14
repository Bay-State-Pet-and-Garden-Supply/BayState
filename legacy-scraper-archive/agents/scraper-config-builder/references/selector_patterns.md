# Platform-Specific Selector Libraries

Use these as **seed selectors** before running playwright-cli discovery.
Validate and refine every selector with playwright-cli before using it.

## Shopify

```yaml
selectors:
  - name: Name
    selector: "h1"
    attribute: text
    required: true
    fallback_selectors:
      - "[data-testid='product-title']"
      - ".product__title"
  - name: Brand
    selector: ".vendor"
    attribute: text
    fallback_selectors:
      - "[data-vendor]"
      - ".product__vendor"
  - name: Price
    selector: "[data-price]"
    attribute: text
    fallback_selectors:
      - ".price"
      - ".product__price"
      - "[data-testid='product-price']"
  - name: Image URLs
    selector: ".product-media img"
    attribute: src
    multiple: true
    fallback_selectors:
      - ".product__media img"
      - "[data-image-gallery-main-image]"
  - name: Description
    selector: ".product__description"
    attribute: text
    fallback_selectors:
      - "[data-product-description]"
      - ".description"
  - name: UPC
    selector: "[data-upc]"
    attribute: data-upc
    fallback_selectors:
      - "[data-sku]"
      - ".product-sku"
```

## BigCommerce

```yaml
selectors:
  - name: Name
    selector: "h1.productView-title"
    attribute: text
    required: true
    fallback_selectors:
      - "h1"
      - ".product-title"
  - name: Brand
    selector: ".productView-brand"
    attribute: text
    fallback_selectors:
      - "[data-brand]"
      - ".brand"
  - name: Price
    selector: ".productView-price"
    attribute: text
    fallback_selectors:
      - ".price"
      - "[data-product-price]"
  - name: Image URLs
    selector: "[data-image-gallery-main-image]"
    attribute: src
    multiple: true
    fallback_selectors:
      - ".productView-image img"
      - ".main-image img"
  - name: Description
    selector: ".productView-description"
    attribute: text
    fallback_selectors:
      - ".description"
      - "[data-product-description]"
  - name: UPC
    selector: "[data-upc]"
    attribute: data-upc
    fallback_selectors:
      - "[data-sku]"
      - ".productView-info-value"
```

## Magento

```yaml
selectors:
  - name: Name
    selector: ".page-title"
    attribute: text
    required: true
    fallback_selectors:
      - "h1"
      - ".product-name"
  - name: Brand
    selector: ".product-brand"
    attribute: text
    fallback_selectors:
      - "[data-brand]"
      - ".brand"
  - name: Price
    selector: ".price"
    attribute: text
    required: true
    fallback_selectors:
      - ".product-price"
      - "[data-price]"
  - name: Image URLs
    selector: ".fotorama__stage img"
    attribute: src
    multiple: true
    fallback_selectors:
      - ".gallery-placeholder img"
      - ".product-image img"
  - name: Description
    selector: ".product.attribute.description"
    attribute: text
    fallback_selectors:
      - ".description"
      - "#description"
  - name: UPC
    selector: ".product.attribute.sku .value"
    attribute: text
    fallback_selectors:
      - "[data-sku]"
      - ".sku .value"
```

## WooCommerce

```yaml
selectors:
  - name: Name
    selector: ".product_title"
    attribute: text
    required: true
    fallback_selectors:
      - "h1"
      - ".product-title"
  - name: Price
    selector: ".woocommerce-Price-amount"
    attribute: text
    required: true
    fallback_selectors:
      - ".price"
      - "[data-price]"
  - name: Image URLs
    selector: ".woocommerce-product-gallery__image img"
    attribute: src
    multiple: true
    fallback_selectors:
      - ".woocommerce-product-gallery img"
      - ".product-image img"
  - name: Description
    selector: ".woocommerce-product-details__short-description"
    attribute: text
    fallback_selectors:
      - ".description"
      - "[data-product-description]"
  - name: UPC
    selector: ".sku_wrapper .sku"
    attribute: text
    fallback_selectors:
      - "[data-sku]"
      - ".product-sku"
```

## Generic / Custom

When platform is unknown, start with these universal selectors:

```yaml
selectors:
  - name: Name
    selector: "h1"
    attribute: text
    required: true
    fallback_selectors:
      - "[data-testid='product-title']"
      - ".product-title"
      - ".product-name"
  - name: Brand
    selector: "[data-brand]"
    attribute: text
    fallback_selectors:
      - ".brand"
      - ".vendor"
      - "#bylineInfo"
  - name: Price
    selector: ".price"
    attribute: text
    required: true
    fallback_selectors:
      - "[data-price]"
      - ".product-price"
      - ".current-price"
  - name: Image URLs
    selector: "img[src*='product']"
    attribute: src
    multiple: true
    fallback_selectors:
      - ".product-image img"
      - ".gallery img"
      - "[data-image]"
  - name: Description
    selector: ".description"
    attribute: text
    fallback_selectors:
      - "[data-product-description]"
      - "#productDescription"
      - ".product-details"
  - name: Features
    selector: ".features li"
    attribute: text
    multiple: true
    fallback_selectors:
      - "#feature-bullets li"
      - ".product-features li"
  - name: UPC
    selector: "[data-upc]"
    attribute: data-upc
    fallback_selectors:
      - "[data-sku]"
      - ".upc"
      - ".sku"
  - name: ItemNumber
    selector: "[data-item-number]"
    attribute: data-item-number
    fallback_selectors:
      - ".item-number"
      - ".product-code"
  - name: Weight
    selector: "[data-weight]"
    attribute: data-weight
    fallback_selectors:
      - ".weight"
      - ".product-weight"
```

## Detection Heuristics

| Clue | Likely Platform |
|------|----------------|
| URL contains `myshopify.com` | Shopify |
| URL contains `/products/` | Shopify, BigCommerce, WooCommerce |
| URL contains `/product/` | Magento, WooCommerce |
| URL contains `/p/` | BigCommerce |
| HTML contains `data-shopify` | Shopify |
| HTML contains `bigcommerce` | BigCommerce |
| HTML contains `magento` or `Mage.` | Magento |
| HTML contains `woocommerce` | WooCommerce |
| HTML contains `window.Shopify` | Shopify |
| HTML contains `BCData` | BigCommerce |
