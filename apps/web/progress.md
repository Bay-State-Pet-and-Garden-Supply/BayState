# Storefront Design System Revamp - Progress

## Status: Phase 2 (Shell Components) - COMPLETE

## Completed Phases

### Phase 1: Foundation ✓
- Replaced Arvo with Merriweather serif font
- Updated CSS font variable `--font-display`
- Added semantic shadow utilities

### Phase 2: Shell Components ✓
**Files edited:**
- [x] `components/storefront/header.tsx`
- [x] `components/storefront/footer.tsx`
- [x] `components/storefront/cart-drawer.tsx`
- [x] `components/storefront/command-bar.tsx`
- [x] `components/storefront/sticky-cart.tsx`
- [x] `components/storefront/mobile-nav-drawer.tsx`

**Changes applied:**
- Replaced heavy borders (`border-[4px] border-zinc-900`, `border-b-4`, `border-b-8`) with subtle `border border-[oklch(85%_0.03_160)]`
- Replaced block offset shadows with `shadow-sm`/`shadow-md`
- Updated dark backgrounds: `bg-zinc-900` → `bg-[oklch(25%_0.02_90)]`, `bg-zinc-950` → `bg-[oklch(22%_0.02_160)]`
- Removed side-stripe borders (SIDE-STRIPE BAN compliance)
- Normalized typography: `font-black uppercase tracking-tighter` → `font-bold tracking-tight`
- Removed footer link dots (decorative pattern)
- Replaced `bg-black/50` overlays with `bg-[oklch(20%_0.02_90)]/50`
- Updated social icons to use `rounded-md` instead of `rounded-full`

**Verification:**
- Lint passes (warnings only in skill scripts, ignored)
- No brutalist patterns remain in edited files

## Remaining Phases

### Phase 3: Homepage & Marketing (not started)
- [ ] `app/(storefront)/page.tsx`
- [ ] `components/storefront/product-card.tsx`
- [ ] `components/storefront/hero-carousel.tsx`
- [ ] `components/storefront/featured-products.tsx`
- [ ] `components/storefront/pet-recommendations.tsx`
- [ ] `components/storefront/under-construction-banner.tsx`
- [ ] `components/storefront/campaign-banner.tsx`

### Phase 4: Account Pages (not started)
- [ ] `app/(storefront)/account/page.tsx`
- [ ] `app/(storefront)/account/orders/page.tsx`
- [ ] `app/(storefront)/account/orders/[id]/page.tsx`
- [ ] `app/(storefront)/account/profile/page.tsx`
- [ ] `app/(storefront)/account/addresses/page.tsx`
- [ ] `app/(storefront)/account/pets/page.tsx`
- [ ] `app/(storefront)/account/wishlist/page.tsx`

### Phase 5: Content & Services (not started)
- [ ] `app/(storefront)/services/page.tsx`
- [ ] `app/(storefront)/services/[slug]/page.tsx`
- [ ] `app/(storefront)/about/page.tsx`
- [ ] `app/(storefront)/contact/page.tsx`
- [ ] `components/storefront/add-service-to-cart-button.tsx`

### Phase 6: Products & Commerce (not started)
- [ ] `app/(storefront)/products/page.tsx`
- [ ] `app/(storefront)/products/[slug]/page.tsx`
- [ ] `app/(storefront)/cart/page.tsx`
