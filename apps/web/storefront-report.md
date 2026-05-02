# Storefront Visual Vocabulary

*Generated from files in `components/storefront/`*

## All Files (39 total)

```
add-service-to-cart-button.tsx         product-card.tsx
add-to-cart-button.tsx                 product-filters.tsx
campaign-banner.tsx                    product-image-carousel.tsx
cart-drawer.tsx                        product-qa.tsx
cart-preorder-summary.tsx              product-reviews.tsx
cart-store-hydrator.tsx                product-size-selector.tsx
checkout/                              product-view-tracker.tsx
command-bar.tsx                        promo-code-input.tsx
facet-sidebar.tsx                      recently-viewed-section.tsx
featured-products.tsx                  review-submission-form.tsx
footer.tsx                             search-provider.tsx
free-shipping-bar.tsx                  service-card.tsx
header.tsx                             skeletons/
hero-carousel.tsx                      sticky-cart.tsx
inline-search.tsx                      under-construction-banner.tsx
mobile-nav-drawer.tsx                  wishlist-button.tsx
mobile-nav.tsx
newsletter-signup.tsx
payments/
pet-recommendations.tsx
preorder-batch-selector.tsx
```

## Colors

### Primary palette
| Token | Value | Where used |
|-------|-------|-----------|
| `bg-primary` (brand green/teal) | - | Header bar, campaign banner, special-order badges, footer top border |
| `text-primary` | - | Links in mega menu, section heading anchors |
| `text-primary-foreground` | - | Campaign banner text |
| `bg-accent` (brand accent, likely orange/amber) | - | Cart count badge, pre-order badges, hero carousel left border, dot indicator active state |
| `text-accent` | - | Hovered footer links (Shop, Services), email/phone links, hero carousel subtitle |
| `bg-zinc-900` | near-black | Sub-nav bar, footer, pickup-only badges, sticky cart button, section heading bottom border, hero carousel text box |
| `text-zinc-900` | near-black | Product card name, price, section headings, "More" menu divider label |
| `bg-white` | white | Mega menu panels, product cards, cart drawer |
| `text-white` | white | Header nav triggers (default), footer headings, hero title, sticky cart |
| `bg-zinc-50` / `bg-zinc-100` | light gray | No-image placeholder, cart item image bg, section divider lines |
| `bg-zinc-800` / `bg-zinc-800/50` | medium dark | Social icon circles, newsletter signup area in footer |
| `text-zinc-400` / `text-zinc-500` / `text-zinc-600` / `text-zinc-700` | muted grays | Body text, descriptions, link text, copyright, footer contact info |
| `border-zinc-200` / `border-zinc-100` | light borders | Card borders, mega menu dividers, product image bottom border |
| `border-zinc-900` | heavy black border | Header bottom, hero carousel bottom, featured products section heading |

### State-driven colors
| Usage | Classes |
|-------|---------|
| Nav trigger hover | `hover:bg-white/10 hover:text-white` |
| Nav trigger open | `data-[state=open]:bg-white data-[state=open]:text-zinc-950` |
| Product card hover | `group-hover:border-zinc-900` (border switch), `group-hover:text-primary` (name color) |
| Footer link hover | `hover:text-accent`, `hover:text-white` |
| Mega menu link hover | `hover:bg-zinc-50 hover:text-zinc-950` |
| Service card hover | `hover:border-zinc-400 hover:shadow-lg`, button `group-hover:bg-blue-50` |
| Social icon hover | `hover:text-white hover:bg-primary` |
| Free shipping states | `bg-green-50 text-green-700` (qualified), `bg-amber-50 text-amber-800` (not yet) |

### Functional badges (product card)
| Badge | Background | Text | Border treatment |
|-------|-----------|------|-----------------|
| Out of Stock | `bg-red-600` | `text-white` | `border-r-2 border-b-2 border-black/20` |
| Pre-Order | `bg-accent` | `text-secondary` | `border-r-2 border-b-2 border-black/20` |
| Pickup Only | `bg-zinc-900` | `text-white` | `border-r-2 border-b-2 border-white/20` |
| Special Order | `bg-primary` | `text-white` | `border-r-2 border-b-2 border-black/20` |

All badges: `rounded-none font-black uppercase text-[10px]`

---

## Typography

### Font families
- **Default:** system font stack (Tailwind's default `font-sans`)
- **Display/heading weight:** `font-display` class used on: Bay State brand name, section headings ("Featured products"), product price, hero title, footer brand name
- Most other text uses `font-sans`

### Font weight system
| Weight | Where |
|--------|-------|
| `font-black` (900) | Brand name, section headings, product name (card), price, badges, "View All" button, hero title |
| `font-bold` (700) | Brand name in product card, hero subtitle, footer column headings |
| `font-semibold` (600) | Mega menu section links, "Explore X" label, cart subtotal, sticky cart price |
| `font-medium` (500) | Nav triggers, footer link text, cart item name, "View Cart" label |

### Uppercase usage — pervasive
Uppercase with `uppercase` is applied to:
- Bay State brand name (header + footer)
- "Pet & Garden Supply" tagline
- Section headings ("FEATURED PRODUCTS", "Shop", "Services", "Contact & Hours")
- "View All" button
- Product **card brand name** (uppercase + `tracking-widest`)
- Product **card name** (uppercase + `tracking-tight`)
- All badges ("OUT OF STOCK", "PRE-ORDER", "PICKUP ONLY", "SPECIAL ORDER", "NO IMAGE")
- "More" menu heading: `uppercase tracking-[0.18em]`
- Hero subtitle, "Our Services" nav label, "Stay Updated" heading
- Footer "From big to small..." quote

### Tracking / letter-spacing
| Value | Where |
|-------|-------|
| `tracking-tighter` | Brand name, section headings ("Featured products"), hero title, product price |
| `tracking-tight` | Product card name |
| `tracking-widest` | Product card brand name, footer column headings ("SHOP", "SERVICES"), "View All" button |
| `tracking-wider` | (see e.g. footer link `tracking-wider`—used sparingly) |
| `tracking-[0.18em]` | Mega menu "Explore X" label, "More" menu heading |
| `tracking-[0.2em]` | Header subtitle "Pet & Garden Supply" |

### Font sizes in cards
| Element | Size |
|---------|------|
| Product card brand name | `text-[10px]` |
| Product card product name | `text-sm` |
| Product card price | `text-xl` |
| Badge text | `text-[10px]` |
| Section heading | `text-3xl` |
| Hero title | `text-3xl` / `sm:text-5xl` |
| Hero subtitle | `text-sm` / `sm:text-base` |

---

## Spacing Patterns

### Padding
| Pattern | Where |
|---------|-------|
| `p-0` | Product `CardContent` (content handles padding) |
| `p-4` | Card content area, header container, cart drawer, product image area |
| `px-4` | Header bar, sub-nav bar, footer container |
| `py-8` / `py-16` | Mega menu body, footer top |
| `px-3 py-2` | Mega menu brand links |
| `p-6` | Hero textbox, newsletter section in footer |

### Margins
| Pattern | Where |
|---------|-------|
| `mb-12` | Featured products section, hero carousel |
| `mb-8` | Featured products heading row |
| `mb-6` | Newsletter heading, footer column headings, contact/hours spacing |
| `mb-4` | Footer column items, social links |
| `mb-2` | Product name, newsletter heading |
| `mb-1` | Product card brand name |
| `mt-auto` | Product card price pushes to bottom |
| `gap-4` | Product grid (resp. `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4`) |
| `gap-3` | Header brand logo group, newsletter input group |
| `gap-10` / `gap-8` / `gap-2` / `gap-1` | Mega menu columns, footer grid, various inline gaps |

---

## Border-Radius & Treatment

### Explicitly rounded-none (signature look)
- Desktop nav trigger buttons: `rounded-none`
- Cart button: `rounded-none`
- **Product cards**: `rounded-none` (card itself) — this is a key visual signature
- All badges: `rounded-none`
- Service card uses `border-dashed` as differentiator (but still not heavily rounded)

### Where rounding is used
| Radius | Where |
|--------|-------|
| `rounded-sm` | Hero carousel wrapper |
| `rounded-lg` | Cart image thumbnail, free shipping bar, newsletter signup area in footer, service card button hover area |
| `rounded-full` | Social icon circles, quantity adjuster buttons, carousel nav arrow backgrounds, pagination dots, nav trigger close button |
| `rounded-xl` | Sticky cart button (mobile), "More" dropdown panel |
| `rounded-b-xl` | "More" menu content |

### Border widths
| Width | Where |
|-------|-------|
| `border-2` | Product cards (`border-2 border-zinc-200`), mobile cart button, service cards (`border-2 border-dashed border-zinc-300`) |
| `border-4` | Header top bar bottom (`border-b-4 border-zinc-900`), featured products heading (`border-b-4 border-zinc-900`), hero carousel bottom (`border-b-8 border-zinc-900`), footer top (`border-t-4 border-primary`), hero nav arrow buttons (`border-4 border-black`), mobile header (`border-b-4 border-zinc-900`), cart icon badge (`border-4 border-zinc-900`) |
| `border-b-2` | Product image area |

---

## Shadows

### Primary shadow vocabulary
| Shadow | Where |
|--------|-------|
| `shadow-md` | Desktop header |
| `shadow-lg` | Sticky cart button |
| `shadow-xl` | Cart drawer |
| `shadow-[0_24px_48px_rgba(15,23,42,0.12)]` | Mega menu content drop shadow (soft, wide) |
| `shadow-[0_16px_32px_rgba(15,23,42,0.16)]` | "More" dropdown |
| `shadow-[12px_12px_0px_rgba(0,0,0,0.25)]` | Hero textbox — **hard offset shadow** (signature) |
| `shadow-[2px_2px_0_rgba(0,0,0,1)]` | Cart count badge on desktop (hard black offset) + mobile variant (`2px_2px_0`) |
| `shadow-[4px_4px_0_rgba(0,0,0,0.2)]` | Hero carousel nav arrow buttons |
| `shadow-[4px_4px_0px_rgba(0,0,0,1)]` | **Product card on hover** — hard black offset shadow matching brand look |
| `shadow-sm` | Mobile header, badges |

### Hover interactions with shadows
- Product card: `group-hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5`
- Hero nav arrows: `active:translate-x-0.5 active:translate-y-0.5`
- Sticky cart: `hover:scale-[1.02]`

---

## Visual Vocabulary Summary

**The storefront identity is built on:**
1. **Hard borders** — thick `border-zinc-900` lines (4px–8px) used as section separators, card frames, and emphasis. `rounded-none` on product cards intentionally avoids soft corners.
2. **Offset hard shadows** — `shadow-[Npx_Npx_0_rgba(0,0,0,1)]` creates a "stamped" 3D effect on cart badges, hero textbox, and product cards on hover.
3. **Heavy weight typography** — `font-black` + `uppercase` + tight tracking dominates headings, brand name, product names, and badges. Very little light/regular weight text.
4. **Limited radius** — rounding is reserved for utility elements (social icons, quantity buttons, free shipping bar). Core content cards and badges are deliberately **square**.
5. **Bold accent pop** — accent color appears sparingly but with impact (cart count badge, pre-order badges, hero left border).
6. **Zinc grayscale backbone** — `zinc-900` through `zinc-50` supplies the entire neutral range, with brand `primary` layered over it.
7. **Consistent badge language** — all badges share `rounded-none font-black uppercase text-[10px]` with a subtle `border-r-2 border-b-2 border-black/20` 3D edge.
8. **Uppercase is the default** — brand name, headings, product names, badges, even some descriptive text all use uppercase.

### Key differences vs. admin UI (based on component separation)
- Storefront is heavier: thicker borders, darker shadows, more uppercase
- Storefront uses offset shadows (`shadow-[Xpx_Ypx_0_rgba(...)]`) which the admin likely avoids
- Storefront favors `font-black` where admin likely uses `font-semibold`

---

## Files Retrieved

1. `header.tsx` — Full file (lines 1-300+) — main nav, mega menu, mobile header, cart trigger
2. `footer.tsx` — Full file — 4-column footer with social, nav links, newsletter, contact
3. `featured-products.tsx` — Full file (52 lines) — section heading + product grid
4. `product-card.tsx` — Full file (~120 lines) — product image, badges, name, brand, price
5. `service-card.tsx` — Full file (~70 lines) — service-specific card (dashed border, "Reserve" CTA)
6. `campaign-banner.tsx` — Full file — cycling promo bar on `bg-primary`
7. `hero-carousel.tsx` — Full file — large hero with offset-shadow textbox, thick bottom border
8. `free-shipping-bar.tsx` — Full file — green/amber stateful bar
9. `newsletter-signup.tsx` — Full file — email capture form with Mail icon
10. `cart-drawer.tsx` — Full file — slide-out panel, quantity controls, checkout CTA
11. `sticky-cart.tsx` — Full file — mobile floating cart button
