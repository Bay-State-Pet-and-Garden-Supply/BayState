# Implementation Plan: Bay State Storefront Design System Revamp

## Goal
Replace the brutalist visual language (heavy black borders, block offset shadows, rainbow Tailwind defaults, shouting typography) across all storefront surfaces with the restrained Heritage & Trust design system: warm forest greens, soft realistic shadows, subtle 1px borders, measured typography, and a warm editorial serif.

---

## Phase 1: Foundation — Tokens & Fonts (BLOCKER for all other phases)

### 1.1. Replace Display Serif Font (`app/layout.tsx`)
**File:** `app/layout.tsx`

**Change:** Replace `Arvo` (geometric slab serif) with `Merriweather` (warm transitional serif).

**Before:**
```tsx
import { Inter, Arvo } from "next/font/google";

const arvo = Arvo({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-arvo",
});
```

**After:**
```tsx
import { Inter, Merriweather } from "next/font/google";

const merriweather = Merriweather({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-merriweather",
});
```

**Also change:**
- Template literal: `` `${inter.variable} ${arvo.variable}` `` → `` `${inter.variable} ${merriweather.variable}` ``

### 1.2. Update CSS Font Variable (`app/globals.css`)
**File:** `app/globals.css`

**Before:**
```css
--font-display: var(--font-arvo);
```

**After:**
```css
--font-display: var(--font-merriweather);
```

### 1.3. Add On-Brand Shadow Utilities (`app/globals.css`)
**File:** `app/globals.css`

Add a storefront-specific shadow utility within the `@theme inline` block to ensure soft shadows are available:

```css
--shadow-card: 0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04);
--shadow-promo: 0 8px 24px -4px rgb(0 0 0 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.06);
--shadow-hero: 0 16px 48px -8px rgb(0 0 0 / 0.15), 0 4px 12px -2px rgb(0 0 0 / 0.08);
```

These are soft, realistic, multi-layered drop shadows. No solid offsets.

**Acceptance:** `bun run web build` compiles without CSS errors. `font-display` renders Merriweather on headings.

---

## Phase 2: Shared Shell Components (parallelizable after Phase 1)

### 2.1. Header (`components/storefront/header.tsx`)

| Before | After |
|--------|-------|
| `border-b-2 border-zinc-900` (outer header) | `border-b border-[oklch(85%_0.03_160)]` |
| `shadow-[0_4px_0_rgba(0,0,0,1)]` | `shadow-sm` |
| `bg-zinc-950` (sub-nav) | `bg-[oklch(22%_0.02_160)]` |
| `border-4 border-transparent hover:border-zinc-900` (cart button) | `border border-transparent hover:border-[oklch(85%_0.03_160)]` |
| `shadow-[2px_2px_0_rgba(0,0,0,1)]` (cart count badge) | `shadow-sm` |
| `border-4 border-zinc-900` (cart count badge border) | `border border-[oklch(85%_0.03_160)]` |
| Mobile: `border-b-4 border-zinc-900` | `border-b border-[oklch(85%_0.03_160)]` |
| Mobile: `border-2 border-transparent active:border-zinc-900` | `border border-transparent active:border-[oklch(85%_0.03_160)]` |
| `font-black text-white uppercase tracking-tighter text-4xl` (logo text) | `font-bold text-white text-4xl tracking-tight` |
| `font-black leading-none text-white/80 uppercase tracking-[0.2em]` (tagline) | `font-medium leading-none text-white/80 tracking-wide text-xs` |

### 2.2. Footer (`components/storefront/footer.tsx`)

| Before | After |
|--------|-------|
| `bg-zinc-900` | `bg-[oklch(25%_0.02_90)]` |
| `border-t-4 border-primary` | `border-t border-[oklch(85%_0.03_160)]` |
| `border-l-2 border-accent pl-3` (tagline — SIDE-STRIPE BAN) | Remove `border-l-2 border-accent pl-3`. Add `bg-[oklch(35%_0.08_160)]/10 px-3 py-1 rounded-sm` as background tint instead. |
| `font-black text-white uppercase tracking-tighter` (h3) | `font-bold text-white tracking-tight` |
| `font-bold uppercase tracking-widest text-white` (h4) | `font-semibold text-white tracking-wide text-sm` |
| `rounded-full` (social icons) | `rounded-md` |
| `bg-zinc-800 p-2 rounded-full` | `bg-[oklch(30%_0.02_90)] p-2 rounded-md` |
| `hover:bg-primary` (social hover) | `hover:bg-[oklch(40%_0.07_160)]` |
| `w-2 h-2 rounded-full bg-accent/50 mr-2` (footer link dots) | Remove dots entirely. Just use `hover:text-[oklch(75%_0.06_160)]` on links. |
| `hover:text-accent` (footer links) | `hover:text-[oklch(75%_0.06_160)]` |
| `bg-zinc-800/50 p-6 rounded-lg` (newsletter container) | `bg-[oklch(30%_0.02_90)]/50 p-6 rounded-sm` |
| `text-zinc-400` / `text-zinc-500` body text | `text-[oklch(70%_0.02_90)]` |

### 2.3. Product Card (`components/storefront/product-card.tsx`)

| Before | After |
|--------|-------|
| `border-2 border-zinc-200` | `border border-[oklch(85%_0.03_160)]` |
| `shadow-[4px_4px_0px_rgba(0,0,0,1)]` | `shadow-sm` |
| `rounded-none` | Remove (use theme default `rounded-sm`) |
| `group-hover:border-zinc-900` | `group-hover:border-[oklch(70%_0.04_160)]` |
| `group-hover:-translate-x-0.5 group-hover:-translate-y-0.5` | `group-hover:-translate-y-0.5` (lift only, no diagonal shift) |
| `bg-white` (card bg) | `bg-card` |
| `border-b border-zinc-100` (image divider) | `border-b border-[oklch(90%_0.02_160)]` |
| **BADGES:** `border-r-2 border-b-2 border-black/20` | Remove both. Add `shadow-sm` if depth needed, otherwise plain badges. |
| `font-black uppercase text-[10px]` (all badges) | `font-semibold uppercase text-[10px]` |
| `bg-red-600` (out of stock) | Keep `bg-red-600` — semantic error color is acceptable |
| `bg-zinc-900` (pickup only) | `bg-[oklch(25%_0.02_90)]` |
| `text-[10px] font-bold uppercase tracking-widest text-zinc-400` (brand) | `text-[10px] font-medium uppercase tracking-wide text-muted-foreground` |
| `text-sm font-bold uppercase tracking-tight text-zinc-800` (product name) | `text-sm font-semibold text-foreground leading-snug` |
| `group-hover:text-primary` (product name hover) | Keep |
| `text-xl font-black tracking-tighter text-zinc-900 font-display` (price) | `text-xl font-bold tracking-tight text-foreground` |
| `border-t border-zinc-100` (price divider) | `border-t border-[oklch(90%_0.02_160)]` |

### 2.4. Hero Carousel (`components/storefront/hero-carousel.tsx`)

| Before | After |
|--------|-------|
| `border-b-8 border-zinc-900` | `border-b border-[oklch(85%_0.03_160)]` |
| `bg-zinc-900` (caption box) | `bg-[oklch(25%_0.02_90)]` |
| `border-l-[12px] border-accent` (caption — SIDE-STRIPE BAN) | Remove entirely. Add `pl-4` for left padding instead. |
| `shadow-[12px_12px_0px_rgba(0,0,0,0.25)]` | `shadow-lg` |
| `font-black uppercase m-0 leading-tight tracking-tighter font-display` (h1) | `font-bold m-0 leading-tight tracking-tight font-display` |
| `font-bold mt-2 text-accent uppercase tracking-widest` (subtitle) | `font-medium mt-2 text-[oklch(75%_0.06_160)] tracking-wide` |
| `border-4 border-black` (nav buttons) | `border border-[oklch(85%_0.03_160)]` |
| `shadow-[4px_4px_0px_rgba(0,0,0,0.2)]` (nav buttons) | `shadow-sm` |
| `bg-white` / `hover:bg-zinc-100` (nav buttons) | `bg-card hover:bg-[oklch(96%_0.01_90)]` |
| `bg-accent shadow-[2px_2px_0px_rgba(0,0,0,0.2)]` (slide indicator active) | `bg-[oklch(45%_0.08_160)]` |
| `rounded-sm` (section) | Remove (use default) or keep `rounded-sm` |

---

## Phase 3: Homepage & Marketing Surfaces (parallelizable after Phase 1)

### 3.1. Homepage (`app/(storefront)/page.tsx`)

#### Promo Image Tiles (top section)
| Before | After |
|--------|-------|
| `border-[4px] border-zinc-900` | `border border-[oklch(85%_0.03_160)]` |
| `shadow-[8px_8px_0px_rgba(0,0,0,1)]` | `shadow-md` |
| `shadow-[8px_8px_0px_rgba(255,183,0,1)]` | `shadow-md` |
| `shadow-[8px_8px_0px_rgba(220,38,38,1)]` | `shadow-md` |
| `shadow-[8px_8px_0px_rgba(37,99,235,1)]` | `shadow-md` |
| `hover:translate-x-1 hover:translate-y-1 hover:shadow-none` | `hover:-translate-y-1 hover:shadow-lg` |
| `bg-zinc-100` | `bg-[oklch(96%_0.01_90)]` |
| `bg-black/80` | `bg-[oklch(20%_0.02_90)]/80` |
| `bg-black/30` | `bg-[oklch(20%_0.02_90)]/30` |
| `bg-zinc-900` (small label boxes) | `bg-[oklch(25%_0.02_90)]` |
| `bg-red-600` (small label) | `bg-[oklch(45%_0.12_25)]` |
| `font-black uppercase tracking-widest leading-none font-display` (labels) | `font-bold tracking-tight leading-none font-display` |
| `drop-shadow-[2px_2px_4px_rgba(0,0,0,0.8)]` | Remove (rely on `bg-[oklch(20%_0.02_90)]/30` overlay for contrast) |

#### Fallback Hero (when no carousel)
| Before | After |
|--------|-------|
| `shadow-md` (section) | `shadow-lg` |
| `text-accent font-display` on h1 | `text-primary-foreground font-display` (fix invisible text bug) |
| `font-bold tracking-tight sm:text-5xl uppercase` | `font-bold tracking-tight sm:text-5xl` |
| `font-medium uppercase tracking-wider` (subtitle) | `font-medium tracking-wide` |
| `bg-accent text-secondary hover:bg-accent/90 text-lg font-bold px-8 py-6 rounded-none shadow-lg border-b-2 border-black/20` (button) | `bg-primary text-primary-foreground hover:bg-primary/90 text-lg font-semibold px-8 py-6 shadow-sm` |

#### "Shop by Department" Section
| Before | After |
|--------|-------|
| `border-b-8 border-zinc-900 pb-2` | `border-b border-[oklch(85%_0.03_160)] pb-3` |
| `font-black text-zinc-900 uppercase tracking-tighter font-display` | `font-bold text-foreground tracking-tight font-display` |

#### Department Cards (the critical rainbow fix)
All 5 cards currently use different saturated colors. Unify into forest green family:

| Card | Before | After |
|------|--------|-------|
| Pet Supplies | `bg-primary` (correct!) | `bg-[oklch(35%_0.08_160)]` |
| Farm & Livestock | `bg-red-600` | `bg-[oklch(38%_0.075_160)]` |
| Lawn & Garden | `bg-green-600` | `bg-[oklch(32%_0.08_160)]` |
| Home & Fuel | `bg-blue-600` | `bg-[oklch(40%_0.07_160)]` |
| Seasonal Shoppe | `bg-orange-600` | `bg-[oklch(28%_0.08_160)]` |

**Shared card changes:**
- `border-2 border-zinc-900` → `border border-[oklch(85%_0.03_160)]`
- `shadow-[6px_6px_0px_rgba(0,0,0,1)]` → `shadow-sm`
- `hover:shadow-[8px_8px_0px_rgba(0,0,0,1)]` → `hover:shadow-md`
- `hover:-translate-x-1 hover:-translate-y-1` → `hover:-translate-y-1`
- `font-black uppercase leading-[0.85] tracking-tighter` (h3) → `font-bold leading-tight tracking-tight`
- `h-2 w-24 bg-accent mt-2 shadow-[2px_2px_0px_rgba(0,0,0,0.2)]` (accent bar) → `h-1 w-20 bg-[oklch(75%_0.06_160)] mt-3`
- `font-bold uppercase tracking-[0.2em] text-xs` (CTA text) → `font-medium tracking-wide text-xs`

#### Brands Section
| Before | After |
|--------|-------|
| `border-b-2 border-zinc-900 pb-4` | `border-b border-[oklch(85%_0.03_160)] pb-3` |
| `font-black text-zinc-900 uppercase tracking-tighter` | `font-bold text-foreground tracking-tight` |
| `font-black uppercase text-sm` ("shop all") | `font-medium text-sm` |
| `border border-zinc-200 hover:border-zinc-900` | `border border-[oklch(85%_0.03_160)] hover:border-[oklch(70%_0.04_160)]` |
| `grayscale hover:grayscale-0` | Remove grayscale. Use `opacity-80 hover:opacity-100` instead. |
| `font-bold text-zinc-500 text-center uppercase tracking-tight text-xs font-display` (fallback text) | `font-medium text-muted-foreground text-center text-xs` |

#### Services CTA Section (bottom)
| Before | After |
|--------|-------|
| `border-2 border-zinc-900 bg-zinc-900` | `border border-[oklch(85%_0.03_160)] bg-[oklch(25%_0.02_90)]` |
| `shadow-[8px_8px_0px_rgba(0,0,0,0.2)]` | `shadow-lg` |
| `font-black uppercase tracking-tighter font-display` (h2) | `font-bold tracking-tight font-display` |
| `font-bold uppercase tracking-wide` (p) | `font-medium tracking-wide` |
| `font-black uppercase rounded-none bg-accent text-secondary hover:bg-accent/90 border-b-2 border-black/20` (button) | `font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm` |

### 3.2. Featured Products (`components/storefront/featured-products.tsx`)

| Before | After |
|--------|-------|
| `border-b-4 border-zinc-900 pb-2` | `border-b border-[oklch(85%_0.03_160)] pb-3` |
| `font-black text-zinc-900 uppercase tracking-tighter font-display` | `font-bold text-foreground tracking-tight font-display` |
| `font-black uppercase text-xs tracking-widest` ("View All") | `font-medium text-xs tracking-wide` |

### 3.3. Pet Recommendations (`components/storefront/pet-recommendations.tsx`)

| Before | After |
|--------|-------|
| `border-b-4 border-zinc-900 pb-2` | `border-b border-[oklch(85%_0.03_160)] pb-3` |
| `font-black text-zinc-900 uppercase tracking-tighter font-display` | `font-bold text-foreground tracking-tight font-display` |
| `font-black uppercase text-xs tracking-widest` ("Manage Pets") | `font-medium text-xs tracking-wide` |

### 3.4. Under-Construction Banner (`components/storefront/under-construction-banner.tsx`)
*Constraint: Keep prominent but on-brand.*

| Before | After |
|--------|-------|
| `border-b-4 border-zinc-900` | `border-b-2 border-[oklch(85%_0.03_160)]` |
| `font-black uppercase tracking-tighter` | `font-bold tracking-tight` |
| `border-2 border-zinc-900 shadow-[4px_4px_0px_rgba(0,0,0,1)]` (button) | `border border-[oklch(85%_0.03_160)] shadow-sm` |
| `hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_rgba(0,0,0,1)]` | `hover:-translate-y-0.5 hover:shadow-md` |
| `font-black uppercase tracking-tighter` (button text) | `font-semibold tracking-wide` |

### 3.5. Campaign Banner (`components/storefront/campaign-banner.tsx`)
Already mostly on-brand. Minor fixes:

| Before | After |
|--------|-------|
| `hover:bg-black/10` (chevron buttons) | `hover:bg-[oklch(25%_0.02_90)]/10` |

---

## Phase 4: Account Pages (parallelizable after Phase 1)

All account pages share the same heading pattern and card pattern. Apply systematically.

### 4.1. Account Page Heading Pattern (all account pages)
**Files:**
- `app/(storefront)/account/page.tsx`
- `app/(storefront)/account/orders/page.tsx`
- `app/(storefront)/account/orders/[id]/page.tsx`
- `app/(storefront)/account/profile/page.tsx`
- `app/(storefront)/account/addresses/page.tsx`
- `app/(storefront)/account/pets/page.tsx`
- `app/(storefront)/account/wishlist/page.tsx`

| Before | After |
|--------|-------|
| `border-b-8 border-zinc-900 pb-4` | `border-b border-[oklch(85%_0.03_160)] pb-4` |
| `font-black tracking-tighter uppercase font-display leading-none text-zinc-900` (h1) | `font-bold tracking-tight font-display leading-none text-foreground` |
| `font-bold uppercase tracking-widest text-sm mt-2` (subtitle) | `font-medium tracking-wide text-sm mt-2 text-muted-foreground` |

### 4.2. Account Dashboard (`app/(storefront)/account/page.tsx`)

**"Recommended for Your Pets" section:**
| Before | After |
|--------|-------|
| `border-2 border-zinc-900 bg-white shadow-[4px_4px_0px_rgba(0,0,0,1)]` | `border border-[oklch(85%_0.03_160)] bg-card shadow-sm` |
| `bg-primary p-4 border-b-2 border-zinc-900` | `bg-primary p-4 border-b border-[oklch(85%_0.03_160)]` |
| `font-black uppercase tracking-tight text-white font-display` (h2) | `font-semibold text-white font-display` |
| `bg-white text-primary border border-zinc-900 rounded-none font-black uppercase text-xs` (button) | `bg-primary-foreground text-primary border border-[oklch(85%_0.03_160)] font-medium text-xs` |

**Dashboard cards (Profile, My Pets, Recent Orders, Addresses):**
| Before | After |
|--------|-------|
| `border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(59,130,246,1)]` | `border border-[oklch(85%_0.03_160)] bg-card shadow-sm` |
| `shadow-[8px_8px_0px_rgba(22,163,74,1)]` | `shadow-sm` |
| `shadow-[8px_8px_0px_rgba(220,38,38,1)]` | `shadow-sm` |
| `shadow-[8px_8px_0px_rgba(249,115,22,1)]` | `shadow-sm` |
| `bg-blue-600`, `bg-green-600`, `bg-red-600`, `bg-orange-600` (headers) | ALL → `bg-primary` |
| `border-b-2 border-zinc-900` (header bottom) | `border-b border-[oklch(85%_0.03_160)]` |
| `font-black uppercase tracking-tight font-display` (card h2) | `font-semibold font-display` |
| `font-black text-zinc-500 uppercase tracking-widest` (labels) | `font-medium text-muted-foreground uppercase tracking-wide text-xs` |
| `font-black text-4xl tracking-tighter` (big numbers) | `font-bold text-4xl tracking-tight` |
| `font-bold uppercase tracking-tight hover:bg-zinc-100` (buttons) | `font-medium hover:bg-muted` |
| `border border-zinc-900 rounded-none` (buttons) | `border border-[oklch(85%_0.03_160)]` |
| `font-black uppercase text-xs text-zinc-400` (order number) | `font-medium text-xs text-muted-foreground` |
| `font-black text-lg tracking-tight` (order price) | `font-bold text-lg tracking-tight` |
| `bg-zinc-50 p-3 border border-zinc-100` (info boxes) | `bg-muted p-3 border border-[oklch(90%_0.02_160)]` |

### 4.3. Orders Page (`app/(storefront)/account/orders/page.tsx`)

| Before | After |
|--------|-------|
| `border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(220,38,38,1)]` | `border border-[oklch(85%_0.03_160)] bg-card shadow-sm` |
| `bg-red-600 p-4 border-b-2 border-zinc-900` | `bg-primary p-4 border-b border-[oklch(85%_0.03_160)]` |
| `font-black uppercase tracking-tight font-display` (order h2) | `font-semibold font-display` |
| `font-bold uppercase tracking-widest text-red-100` | `font-medium tracking-wide text-primary-foreground/80` |
| `font-black uppercase text-[10px]` (status badge) | `font-semibold text-[10px]` |
| `font-black uppercase tracking-tight hover:bg-zinc-100` (button) | `font-medium hover:bg-muted` |

### 4.4. Order Detail Page (`app/(storefront)/account/orders/[id]/page.tsx`)

| Before | After |
|--------|-------|
| `font-black uppercase tracking-widest text-zinc-500` (back link) | `font-medium tracking-wide text-muted-foreground` |
| `bg-zinc-900 text-white p-4 shadow-[8px_8px_0px_rgba(220,38,38,1)]` (status box) | `bg-[oklch(25%_0.02_90)] text-white p-4 shadow-sm` |
| `font-black uppercase tracking-widest text-zinc-400` ("STATUS:") | `font-medium tracking-wide text-[oklch(70%_0.02_90)]` |
| `font-black uppercase text-xs` (status badge) | `font-semibold text-xs` |
| `border-2 border-zinc-900 bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)]` (item box) | `border border-[oklch(85%_0.03_160)] bg-card shadow-sm` |
| `bg-zinc-900 p-4 border-b-2 border-zinc-900` (section header) | `bg-[oklch(25%_0.02_90)] p-4 border-b border-[oklch(85%_0.03_160)]` |
| `font-black uppercase tracking-tight font-display text-accent` (section h2) | `font-semibold font-display text-[oklch(75%_0.06_160)]` |
| `font-black uppercase text-lg leading-none` (item name) | `font-semibold text-lg leading-tight` |
| `font-bold uppercase tracking-widest text-zinc-400` (QTY label) | `font-medium tracking-wide text-muted-foreground` |
| `font-black tracking-tighter` (item price) | `font-bold tracking-tight` |
| `border-t-2 border-zinc-900 pt-4` (total divider) | `border-t border-[oklch(85%_0.03_160)] pt-4` |
| `font-black uppercase tracking-tighter font-display` ("Total") | `font-bold tracking-tight font-display` |
| `font-black tracking-tighter` (total amount) | `font-bold tracking-tight` |

### 4.5. Profile Page (`app/(storefront)/account/profile/page.tsx`)

| Before | After |
|--------|-------|
| `border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(59,130,246,1)]` | `border border-[oklch(85%_0.03_160)] bg-card shadow-sm` |
| `bg-blue-600 p-4 border-b-2 border-zinc-900` | `bg-primary p-4 border-b border-[oklch(85%_0.03_160)]` |
| `font-black uppercase tracking-tight font-display` (h2) | `font-semibold font-display` |
| `font-bold uppercase tracking-widest text-blue-100` | `font-medium tracking-wide text-primary-foreground/80` |

---

## Phase 5: Content & Service Pages (parallelizable after Phase 1)

### 5.1. Services List (`app/(storefront)/services/page.tsx`)

| Before | After |
|--------|-------|
| `bg-blue-100 p-4 rounded-full` (icon circle) | `bg-[oklch(92%_0.03_160)] p-4 rounded-full` |
| `text-blue-700` (icon) | `text-primary` |
| `font-bold tracking-tight text-zinc-900` (h1) | Keep (already reasonable) |
| `border-dashed border-zinc-200` (card) | `border border-[oklch(85%_0.03_160)]` |
| `hover:border-blue-300` | `hover:border-[oklch(70%_0.04_160)]` |
| `hover:bg-white hover:shadow-lg` | `hover:bg-card hover:shadow-md` |
| `bg-blue-100 text-blue-800 hover:bg-blue-200 border-none` (badge) | `bg-[oklch(92%_0.03_160)] text-primary hover:bg-[oklch(88%_0.04_160)] border-none` |
| `group-hover:text-blue-700` (h2 hover) | `group-hover:text-primary` |

### 5.2. Service Detail (`app/(storefront)/services/[slug]/page.tsx`)

| Before | After |
|--------|-------|
| `bg-blue-600` (badge) | `bg-primary` |
| `bg-gradient-to-br from-blue-100 to-blue-200` | `bg-gradient-to-br from-[oklch(92%_0.03_160)] to-[oklch(88%_0.04_160)]` |
| `text-blue-900` | `text-primary` |
| `text-blue-500` (icons) | `text-primary` |

### 5.3. Add Service to Cart Button (`components/storefront/add-service-to-cart-button.tsx`)

| Before | After |
|--------|-------|
| `bg-blue-600 hover:bg-blue-700` | `bg-primary hover:bg-primary/90` |

### 5.4. About Page (`app/(storefront)/about/page.tsx`)
Already uses standard Card components with minimal overrides. Review only:
- No brutalist patterns detected. Leave as-is unless specific issues found during build.

### 5.5. Contact Page (`app/(storefront)/contact/page.tsx`)
Already uses standard Card components. Review only:
- `text-blue-700 hover:underline` (Get Directions link) → `text-primary hover:underline`

---

## Phase 6: Products & Commerce (parallelizable after Phase 1)

### 6.1. Products Listing (`app/(storefront)/products/page.tsx`)

| Before | After |
|--------|-------|
| `font-bold text-zinc-900` (h1) | `font-bold text-foreground` |
| `bg-zinc-50/50 rounded-lg p-4` (sidebar) | `bg-muted/50 rounded-sm p-4` |

### 6.2. Product Detail (`app/(storefront)/products/[slug]/page.tsx`)
Minimal brutalist patterns. Review:
- Any `font-black` instances → `font-bold`
- Any `uppercase` overuse → reduce

### 6.3. Cart Page (`app/(storefront)/cart/page.tsx`)
Already relatively clean. Minor fixes:
- `text-green-600` (discount, free shipping) → Keep (semantic success color)
- `text-red-600` (clear cart, remove item hover) → Keep (semantic error color)
- `hover:bg-zinc-50` → `hover:bg-muted`
- `bg-zinc-100` (thumbnails) → `bg-muted`
- `rounded-lg` on containers → keep or change to `rounded-sm` for consistency

---

## Color Mapping Summary

| Current Color | Replacement | Used On |
|---------------|-------------|---------|
| `bg-red-600` (department cards, headers) | `bg-[oklch(38%_0.075_160)]` or `bg-primary` | Department cards, account card headers |
| `bg-green-600` (department cards) | `bg-[oklch(32%_0.08_160)]` or `bg-primary` | Department cards |
| `bg-blue-600` (department cards, buttons, badges) | `bg-primary` (`oklch(35%_0.08_160)`) | Department cards, service badges, buttons |
| `bg-orange-600` (department cards) | `bg-[oklch(28%_0.08_160)]` or `bg-primary` | Department cards |
| `bg-zinc-900` | `bg-[oklch(25%_0.02_90)]` | Footer, dark overlays, account page headers |
| `bg-zinc-950` | `bg-[oklch(22%_0.02_160)]` | Header sub-nav |
| `bg-black/80`, `bg-black/30` | `bg-[oklch(20%_0.02_90)]/80`, `/30` | Image overlays |
| `bg-zinc-100` | `bg-[oklch(96%_0.01_90)]` | Light backgrounds |
| `bg-zinc-50` | `bg-muted` | Subtle backgrounds |
| `text-zinc-900` | `text-foreground` | Primary text |
| `text-zinc-500`, `text-zinc-400` | `text-muted-foreground` | Secondary text |
| `border-zinc-900` | `border-[oklch(85%_0.03_160)]` | All heavy borders |
| `border-zinc-200` | `border-[oklch(90%_0.02_160)]` | Light borders |
| `shadow-[8px_8px_0px_...]` | `shadow-md` or `shadow-lg` | Promos, cards |
| `shadow-[6px_6px_0px_...]` | `shadow-sm` | Department cards |
| `shadow-[4px_4px_0px_...]` | `shadow-sm` | Smaller cards, badges |
| `shadow-[2px_2px_0px_...]` | Remove or `shadow-xs` | Badge accents |

---

## Typography Normalization Plan

| Pattern | Current Count | Action | New Value |
|---------|---------------|--------|-----------|
| `font-black` | 76 | Reduce to `font-bold` (700) for h1-h2, `font-semibold` (600) for h3+, `font-medium` (500) for labels/badges | ~10 remaining (hero h1 only) |
| `uppercase` | 107 | Remove from: product names, section h2s, body text, button text, footer links. Keep for: short brand labels, tiny badges, single hero h1 | ~20 remaining |
| `tracking-tighter` | ~30 | Keep on hero h1 only. Remove from all other elements | ~2 remaining |
| `tracking-tight` | ~20 | Keep on h1-h2. Remove from body/product names | ~8 remaining |
| `tracking-widest` | ~34 | Reduce to `tracking-wide` for small labels only. Remove elsewhere | ~6 remaining |
| `leading-[0.85]` | ~5 | Change to `leading-tight` | 0 remaining |
| `font-display` | ~40 | Keep on h1-h3 headings only. Remove from prices, badges, labels | ~15 remaining |

---

## Shadow/Border Strategy

| Old Pattern | New Pattern | Rationale |
|-------------|-------------|-----------|
| `border-[4px] border-zinc-900` | `border border-[oklch(85%_0.03_160)]` | Subtle 1px border tinted toward brand green |
| `border-2 border-zinc-900` | `border border-[oklch(85%_0.03_160)]` | Same |
| `border-b-8 border-zinc-900` | `border-b border-[oklch(85%_0.03_160)]` | Section dividers should be quiet |
| `border-b-4 border-zinc-900` | `border-b border-[oklch(85%_0.03_160)]` | Same |
| `border-b-2 border-zinc-900` | `border-b border-[oklch(85%_0.03_160)]` | Same |
| `border-l-[12px] border-accent` | Remove | Side-stripe absolute ban |
| `border-l-2 border-accent` | Remove | Side-stripe absolute ban |
| `border-r-2 border-b-2 border-black/20` | Remove | Badge depth via `shadow-sm` instead |
| `shadow-[8px_8px_0px_rgba(...)]` | `shadow-md` or `shadow-lg` | Soft, realistic, multi-layered |
| `shadow-[6px_6px_0px_rgba(...)]` | `shadow-sm` | Subtle elevation |
| `shadow-[4px_4px_0px_rgba(...)]` | `shadow-sm` | Subtle elevation |
| `shadow-[2px_2px_0px_rgba(...)]` | Remove | Too small to be meaningful |
| `hover:translate-x-1 hover:translate-y-1` | `hover:-translate-y-1` | Lift on hover, not diagonal shift |
| `hover:-translate-x-1 hover:-translate-y-1` | `hover:-translate-y-1` | Same |

---

## Parallelization Strategy

### Wave 1: Foundation (1 subagent)
- Phase 1: `app/layout.tsx` + `app/globals.css`

### Wave 2: Shell + Shared Components (3 subagents, parallel)
- Subagent A: Phase 2.1 `header.tsx` + Phase 2.2 `footer.tsx`
- Subagent B: Phase 2.3 `product-card.tsx` + Phase 2.4 `hero-carousel.tsx`
- Subagent C: Phase 3.4 `under-construction-banner.tsx` + Phase 3.5 `campaign-banner.tsx`

### Wave 3: Homepage + Marketing (2 subagents, parallel)
- Subagent D: Phase 3.1 `page.tsx` (homepage — largest file, deserves its own agent)
- Subagent E: Phase 3.2 `featured-products.tsx` + Phase 3.3 `pet-recommendations.tsx`

### Wave 4: Account Pages (2 subagents, parallel)
- Subagent F: Phase 4.1-4.3 `account/page.tsx`, `account/orders/page.tsx`, `account/orders/[id]/page.tsx`
- Subagent G: Phase 4.4-4.5 `account/profile/page.tsx`, `account/addresses/page.tsx`, `account/pets/page.tsx`, `account/wishlist/page.tsx`

### Wave 5: Content + Service Pages (1 subagent)
- Phase 5: `services/page.tsx`, `services/[slug]/page.tsx`, `about/page.tsx`, `contact/page.tsx`, `add-service-to-cart-button.tsx`

### Wave 6: Products + Commerce (1 subagent)
- Phase 6: `products/page.tsx`, `products/[slug]/page.tsx`, `cart/page.tsx`

**Dependency graph:**
```
Wave 1 ──→ Wave 2 ──→ Wave 3 ──→ Wave 4 ──→ Wave 5 ──→ Wave 6
            (all can run in parallel after Wave 1 completes)
```
Actually, Waves 2-6 can ALL run in parallel after Wave 1 completes, since they modify different files. The only risk is CSS variable name changes in Wave 1 affecting later waves, but the variables (`--font-merriweather`) will be known from the plan.

---

## Risks

1. **OKLCH browser support:** OKLCH is well-supported in modern browsers (Chrome 111+, Safari 15.4+, Firefox 113+). The project targets modern web (Next.js 16). No fallback needed.

2. **Tailwind v4 arbitrary value syntax:** The plan uses `bg-[oklch(35%_0.08_160)]` syntax. In Tailwind v4 with `@import "tailwindcss"`, arbitrary values in classes work the same as v3. Confirm during Wave 1.

3. **shadcn/ui component overrides:** Some components (Badge, Button, Card) may have internal `rounded-none` or `font-black` classes in their variants. The plan focuses on usage sites. If components themselves need updating, add a "Component Audit" follow-up task.

4. **Image overlay readability:** Removing `drop-shadow` from text on image overlays means the overlay background (`bg-[oklch(20%_0.02_90)]/30`) must provide sufficient contrast. Verify during testing.

5. **Mobile header color:** The mobile header uses `bg-primary` with `border-b-4 border-zinc-900`. Changing to `border-b border-[oklch(85%_0.03_160)]` may make the border invisible against `bg-primary`. Consider `border-b border-primary-foreground/20` instead for mobile header only.

6. **Account page card header unification:** All account card headers become `bg-primary`. This means all 4 dashboard cards will have identical green headers. This is intentional (restrained palette), but verify it doesn't cause confusion.

---

## Verification Checklist

### Build & Type Safety
- [ ] `bun run web build` passes with zero errors
- [ ] `bun run web lint` passes with zero errors
- [ ] No TypeScript errors in modified files

### Visual Regression
- [ ] Homepage renders without brutalist borders/shadows
- [ ] All department cards use forest green family (no rainbow)
- [ ] Header uses soft shadow, not block offset
- [ ] Footer uses tinted dark background, not pure #000
- [ ] Product cards use `shadow-sm` and subtle border
- [ ] Hero carousel caption has no side-stripe border
- [ ] Account pages use consistent card styling
- [ ] Mobile nav remains visually distinct

### Typography
- [ ] `font-black` appears only on hero h1 (grep confirms ≤5 instances)
- [ ] `uppercase` reduced by ~80% (from 107 to ~20)
- [ ] `tracking-tighter` appears only on hero h1 (grep confirms ≤3)
- [ ] `tracking-widest` appears only on tiny labels (grep confirms ≤8)
- [ ] Headings render in Merriweather, body in Inter

### Accessibility
- [ ] All `aria-label` attributes preserved
- [ ] Color contrast ratios meet WCAG 2.1 AA (forest green on cream)
- [ ] `prefers-reduced-motion` media query still active
- [ ] Focus states remain visible

### Functional
- [ ] All links remain clickable
- [ ] Cart functionality unchanged
- [ ] Search functionality unchanged
- [ ] Campaign banner cycles correctly
- [ ] Hero carousel navigates correctly
- [ ] All account pages load data correctly
