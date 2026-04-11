# Storefront Redesign: Typography and Category Visuals (Arvo/Inter)

## Objective
Further refine the Bay State storefront to eliminate "AI slop" by replacing the soft `Outfit` font and generic Lucide category icons with a more "Rugged Farm" aesthetic. This involves adopting a sturdy **Slab-Serif (Arvo)** for headings and **Inter** for body text, and replacing category icons with **Bold Typography-Driven Cards** using high-contrast, large-scale Arvo text.

## Key Files & Context
- `apps/web/app/layout.tsx`: Root layout where global fonts are defined.
- `apps/web/app/globals.css`: Where CSS variables for fonts are mapped.
- `apps/web/app/(storefront)/page.tsx`: The storefront landing page containing the category grid.

## Implementation Steps

### 1. Typography Overhaul (Slab-Serif & Modern Sans)
- **Replace `Outfit`**: 
  - Import `Inter` (subsets: latin, variable: --font-inter) and `Arvo` (weight: 400/700, subsets: latin, variable: --font-arvo) from `next/font/google` in `layout.tsx`.
- **Update CSS Variables**: 
  - Set `--font-sans` to `var(--font-inter)`.
  - Set `--font-display` to `var(--font-arvo)`.
- **Global Styles**: 
  - Update `globals.css` to use the new display font for all `h1` through `h6`, prominent buttons, and site branding.

### 2. Category Visual Redesign (Department Grid)
- **Eliminate Icons**: Completely remove the Lucide icons (`Dog`, `Leaf`, `Flame`) from the "Shop by Department" section in `page.tsx`.
- **Typography-Driven Layout**:
  - Transform each category card into a solid color block (Primary, Red, Green, Blue, etc.) with a thick (2-4px) black border.
  - Implement a **"Bold Typography"** design: Large, high-contrast text using `Arvo` (Bold/700) that fills the card's visual space (e.g., "PET SUPPLIES", "FARM & LIVESTOCK").
  - Use a high-contrast background (e.g., White text on a solid color block) with a "sturdy" feel.
  - Apply a subtle hover effect that shifts the solid block (Hard shadow offset) instead of smooth scaling.

### 3. Component Hardening
- **Product Cards**: Update `ProductCard` to use `Arvo` for prices and brand names to add that "sturdy" feel.
- **Header**: Apply the slab-serif to the site title and navigation menu items for a more established, "local store" vibe.

## Verification & Testing
- Visually confirm headers use the new sturdy slab-serif.
- Confirm category cards use large-scale typography instead of generic icons.
- Ensure the site feels more "established" and "rugged" rather than "generic SaaS."
- Check responsiveness for the large-scale typography on mobile screens.
