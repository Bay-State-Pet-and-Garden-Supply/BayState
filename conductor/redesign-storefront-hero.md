# Storefront Redesign: Hero & Promos (Modern Farm Aesthetic)

## Objective
Redesign the BayStateApp storefront to eliminate "AI slop" characteristics (glassmorphism, excessive gradients, soft shadows, rounded-2xl corners) and adopt a "Modern Farm" aesthetic. The primary focus is to overhaul the Hero Carousel and Promotional Banners to be bolder, structured, and sturdy, making the site competitive with Tractor Supply's practical and rugged vibe.

## Key Files & Context
- `apps/web/app/(storefront)/page.tsx`: Contains the main promotional banners, fallback hero, and grid layouts.
- `apps/web/components/storefront/hero-carousel.tsx`: The primary hero carousel component.

## Implementation Steps
1. **Remove AI Slop (Harden & Bolder)**:
   - Strip out `rounded-2xl`, `bg-gradient-to-t`, `backdrop-blur-sm`, and soft `drop-shadow-lg` utilities from the hero and banners.
   - Replace glassmorphic or semi-transparent overlays (`bg-white/20`) with solid, opaque structural elements (e.g., sharp, solid color blocks).
   - Exchange diffuse shadows for hard, blocky shadows or solid contrasting borders.
2. **Hero Carousel Redesign**:
   - Convert the hero section from a floating, heavily rounded container to a more robust, full-width or sharply boxed layout (`rounded-none` or `rounded-sm`).
   - Move overlay text from a center-aligned gradient background into a solid, high-contrast block (e.g., a primary color box anchored to a corner) for immediate readability.
   - Redesign navigation controls (arrows/dots) to be sturdy and opaque, avoiding delicate, translucent circular buttons.
3. **Promotional Banner Redesign**:
   - In `page.tsx`, overhaul the "Promotional Banner Grid" (Seed Starting, Bee Nuc's, Wood Pellets).
   - Eliminate the smooth `hover:scale-105` image zoom effects and replace them with solid hover states (e.g., a border color change or hard shadow offset).
   - Replace the soft gradient overlays and centered italic floating text with clear, structured layouts (e.g., image on the top half, a solid color block on the bottom with bold, left-aligned typography).

## Verification & Testing
- Run the local development server and visually inspect the homepage.
- Confirm the complete removal of glassmorphism and soft shadows from the updated components.
- Ensure the new solid layouts remain functional and responsive across mobile and desktop viewports.
- Verify that the cognitive load feels lighter and the aesthetic is aligned with the practical, "Modern Farm" direction.