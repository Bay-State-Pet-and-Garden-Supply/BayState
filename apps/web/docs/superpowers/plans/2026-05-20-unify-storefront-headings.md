# Unify Storefront Headings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the "For [Pet]" and "Featured products" headings with the "Shop by department" style on the homepage.

**Architecture:** Update component headers to use consistent Tailwind classes for font, size, color, and tracking.

**Tech Stack:** Next.js, Tailwind CSS (v4).

---

### Task 1: Document Design

**Files:**
- Create: `docs/superpowers/specs/2026-05-20-storefront-heading-styles-design.md`

- [ ] **Step 1: Write the design document**

```markdown
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
```

- [ ] **Step 2: Commit the design document**

Run: `git add docs/superpowers/specs/2026-05-20-storefront-heading-styles-design.md && git commit -m "docs: add design spec for storefront heading unification"`

### Task 2: Update PetRecommendations Heading Style

**Files:**
- Modify: `components/storefront/pet-recommendations.tsx`

- [ ] **Step 1: Replace heading classes**

Modify `components/storefront/pet-recommendations.tsx`:
```tsx
// Find:
<h2 className="text-4xl sm:text-6xl font-bold text-zinc-900 tracking-tighter font-display">
// Replace with:
<h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
```

- [ ] **Step 2: Commit**

Run: `git add components/storefront/pet-recommendations.tsx && git commit -m "style: unify pet recommendations heading with homepage standard"`

### Task 3: Update FeaturedProducts Heading Style

**Files:**
- Modify: `components/storefront/featured-products.tsx`

- [ ] **Step 1: Replace heading classes**

Modify `components/storefront/featured-products.tsx`:
```tsx
// Find:
<h2 className="text-4xl sm:text-6xl font-bold text-zinc-900 tracking-tighter font-display">
// Replace with:
<h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
```

- [ ] **Step 2: Commit**

Run: `git add components/storefront/featured-products.tsx && git commit -m "style: unify featured products heading with homepage standard"`

### Task 4: Final Verification

- [ ] **Step 1: Manual visual check**
Verify that "For [Pet]", "Featured products", and "Shop by department" all share the same typography and scale on the homepage.
