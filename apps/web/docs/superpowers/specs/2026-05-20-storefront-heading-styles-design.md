# Storefront Heading Styles Design

## Objective
Unify the visual hierarchy of the storefront homepage by aligning the styling of personalized/featured sections with the standard sections.

## Problem
The "For [Pet]" (PetRecommendations) and "Featured products" (FeaturedProducts) sections currently use an oversized slab-serif font (Arvo, 6xl, Zinc-900, tight tracking) which creates a jarring visual inconsistency when compared to standard sections like "Shop by department" and "Brands we carry" (Inter, 3xl, Foreground, standard tracking).

## Proposed Changes
We will adopt the **Unified Standard** approach.

### Styling Details
- **Font:** Switch from `font-display` (Arvo) to the default sans-serif font (Inter).
- **Size:** Reduce size from `text-4xl sm:text-6xl` to `text-2xl md:text-3xl`.
- **Color:** Change from `text-zinc-900` to `text-foreground`.
- **Tracking:** Loosen tracking from `tracking-tighter` to `tracking-tight`.

The target CSS classes will be: `text-2xl font-bold tracking-tight text-foreground md:text-3xl`
