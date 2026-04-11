# Storefront Redesign: Removing Excessive Italicization

## Objective
The user has expressed a strong dislike for the "slanted font look" and excessive italics introduced in the previous design phases. The goal is to remove the `italic` utility class and any `skew-x` transformations from primary headers, buttons, and navigation elements while maintaining the "Rugged Farm" aesthetic through bold, high-contrast, non-slanted slab-serif typography.

## Key Files & Context
- `apps/web/app/(storefront)/page.tsx`: Contains the main promotional banners and category grid with many italics.
- `apps/web/components/storefront/header.tsx`: Header and Mega Menu triggers with italicized text.
- `apps/web/components/storefront/hero-carousel.tsx`: Hero carousel title with italicized text.
- `apps/web/components/storefront/product-card.tsx`: Product price styling with italics.

## Implementation Steps

### 1. Header and Navigation
- **Remove Italics**: In `apps/web/components/storefront/header.tsx`, remove the `italic` class from the site title ("Bay State") and any Mega Menu headers/triggers.
- **Maintain Boldness**: Ensure the `font-black` or `font-bold` weights remain to keep the sturdy feel.

### 2. Hero Carousel
- **Remove Italics**: In `apps/web/components/storefront/hero-carousel.tsx`, remove the `italic` class from the slide titles (`h2`).

### 3. Promotional Banners and Category Grid
- **Global `page.tsx` Update**:
  - Remove `italic` from all promotional banners (Seed Starting, Bee Nuc's, Wood Pellets).
  - Remove the `skew-x-[-12deg]` transformation from the "PRE-ORDER NOW" badge in the Bee Nuc's banner.
  - Remove `italic` from the "Country Gift Shop" header.
  - Remove `italic` from the "Shop by Department" headers and the text within the category cards.
  - Remove `italic` from the "Local Services" header and "300+ Brands" section.

### 4. Product Cards
- **Remove Italics**: In `apps/web/components/storefront/product-card.tsx`, remove the `italic` class from the `formattedPrice` display.

## Verification & Testing
- Visually confirm that no primary headers or UI elements are slanted.
- Ensure the site still feels "Rugged" and "Sturdy" through the use of the Arvo slab-serif font and high-contrast borders.
- Check that secondary, informative text (like "No subcategories" or "supports Markdown") still uses italics if appropriate for semantic distinction, but primary retail text does not.
