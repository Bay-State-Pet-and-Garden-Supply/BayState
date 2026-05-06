---
name: Bay State Pet & Garden Supply
description: Online extension of the Taunton, MA general store. Warm, practical, stamped — never slick.
colors:
  uniform-green: "#14532D"
  shadow-pine: "#0B3D22"
  seedling-green: "#16844D"
  signet-burgundy: "#760C19"
  burgundy-dark: "#4E0710"
  corner-callout-gold: "#F6DB12"
  muted-gold: "#E9B520"
  feed-bag-cream: "#FFF8D8"
  white-surface: "#FFFFFF"
  mulch-brown: "#6B3A18"
  ledger-charcoal: "#211414"
  card-border: "#E7D8A8"
typography:
  display:
    fontFamily: "Arvo, Georgia, serif"
    fontWeight: 700
    lineHeight: 0.85
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
    maxWidth: "65ch"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 900
    fontSize: "0.625rem"
    lineHeight: 1
    letterSpacing: "0.2em"
    textTransform: "uppercase"
  price:
    fontFamily: "Arvo, Georgia, serif"
    fontWeight: 900
    fontSize: "1.25rem"
    lineHeight: 1
    letterSpacing: "-0.05em"
rounded:
  none: "0"
  xs: "0.125rem"
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  "2xl": "3rem"
  "3xl": "4rem"
  "4xl": "6rem"
components:
  button-primary:
    backgroundColor: "{colors.uniform-green}"
    textColor: "{colors.feed-bag-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1.5rem"
    height: "2.75rem"
  button-primary-hover:
    backgroundColor: "{colors.shadow-pine}"
  button-secondary:
    backgroundColor: "{colors.signet-burgundy}"
    textColor: "{colors.feed-bag-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1.5rem"
    height: "2.75rem"
  button-secondary-hover:
    backgroundColor: "{colors.burgundy-dark}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.uniform-green}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1.5rem"
  badge:
    backgroundColor: "{colors.uniform-green}"
    textColor: "{colors.feed-bag-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0.125rem 0.5rem"
  badge-sale:
    backgroundColor: "{colors.corner-callout-gold}"
    textColor: "{colors.ledger-charcoal}"
  badge-preorder:
    backgroundColor: "{colors.muted-gold}"
    textColor: "{colors.ledger-charcoal}"
  badge-featured:
    backgroundColor: "{colors.signet-burgundy}"
    textColor: "{colors.feed-bag-cream}"
  input:
    backgroundColor: "{colors.feed-bag-cream}"
    textColor: "{colors.ledger-charcoal}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.75rem"
    height: "2.5rem"
  card:
    backgroundColor: "{colors.white-surface}"
    textColor: "{colors.ledger-charcoal}"
    rounded: "{rounded.none}"
    padding: "1rem"
  card-header:
    backgroundColor: "{colors.uniform-green}"
    textColor: "{colors.feed-bag-cream}"
  nav-sidebar:
    backgroundColor: "{colors.uniform-green}"
    textColor: "{colors.feed-bag-cream}"
---

# Design System: Bay State Pet & Garden Supply

## 1. Overview

**Creative North Star: "The General Store"**

This is a digital general store — warm, practical, and built from paper and wood, not glass and gradients. Every surface should feel like something you could touch: stamped badges, heavy card-stock cards, thick inked borders. The website is an extension of the physical store at 429 Winthrop Street, not a separate brand experiment.

The system is **high-contrast and high-weight**: bold slab-serif display type, near-black text on cream stock, and hard-offset shadows that feel physical rather than atmospheric. It's confident, not loud. Decisions that grab attention do so for reasons a store manager would recognize — a sale badge, a pickup-only label, a department sign.

**What this system rejects:** Shopify template farms with their hero sliders and "curated collections." Chewy.com big-box polish and algorithmic cross-sells. Generic SaaS cream with ghost buttons and soft corners. Logo-first palettes that treat the website like a brand deck. Glassmorphism, gradient text, modal-first flows, and any other pattern that reads "AI made this."

**Key Characteristics:**
- Stamped not floating — hard shadows, thick borders, square corners
- Physical not digital — the palette evokes aprons, signage, paper bags, inked stamps
- Weighted not whispered — `font-black` headings, uppercase labels, 4px–8px border separators
- Semantic not decorative — accent colors signal meaning (sale, pre-order, pickup), not mood
- Store-first — every design choice answers "would this make sense on a shelf tag?"

## 2. Colors

The palette follows the physical store — green uniforms and signage dominate, burgundy and gold are heritage accents from the logo, cream and white hold the background. The hierarchy is: **Green owns the room, burgundy remembers, gold whispers.**

### Primary
- **Uniform Green** (`#14532D`): Headers, primary buttons, navigation, footer, sidebar backgrounds. The color of the store aprons and exterior signage — this carries the brand identity across every surface. Dark enough for white text at AA contrast.
- **Shadow Pine** (`#0B3D22`): Button hover states, footer bottom band, active nav states. Darker than Uniform Green by ~2 stops, provides tactile press-down feedback.
- **Seedling Green** (`#16844D`): Garden category tags, success states, icons for completed/published status. Brighter and lighter than Uniform Green — signals growth, completion, freshness.

### Secondary
- **Signet Burgundy** (`#760C19`): Secondary buttons, featured badges, sale banners, "special" highlights. The logo's deep red — used sparingly but with impact. Never as a page background.
- **Burgundy Dark** (`#4E0710`): Hover state for burgundy elements, footer accent details. Deepens the burgundy press-down effect.

### Tertiary
- **Corner Callout Gold** (`#F6DB12`): Sale badges, rating stars, promo strips, active nav underlines. The "look here" color — brightest point in the palette, used on ≤5% of any screen. Its rarity is the point.
- **Muted Gold** (`#E9B520`): Borders, icons, subtle highlights, pre-order badges. Warmer and quieter than Callout Gold — the everyday gold, not the shouting gold.

### Neutral
- **Feed Bag Cream** (`#FFF8D8`): Page background, softer page sections, header text on green. Warm paper-bag stock — never clinical white. The 60% surface.
- **White Surface** (`#FFFFFF`): Product cards, form fields, modals, dropdown panels. Clean contrast against the cream background — reserved for content containers, not the page itself.
- **Ledger Charcoal** (`#211414`): Main body text. Warm near-black, never `#000`. Tinted toward the burgundy family for cohesion.
- **Card Border** (`#E7D8A8`): Card borders on cream backgrounds. Warm tan that recedes, not gray that cools.
- **Mulch Brown** (`#6B3A18`): Footer detail text, rustic accents, earth-tone category indicators. Grounds the palette with literal earth.

### Named Rules

**The 60/25/10/5 Rule.** Cream and white hold 60% of the surface. Uniform Green carries 25%. Signet Burgundy takes 10%. Corner Callout Gold is limited to 5%. If gold appears on more than 5% of a screen, something is wrong.

**The Never Black Rule.** No `#000`, no `#fff`. Every neutral is tinted warm — Ledger Charcoal (`#211414`) for dark, Feed Bag Cream (`#FFF8D8`) for light. The palette has no true black or true white anywhere.

**The Accent Is Earned Rule.** Corner Callout Gold and Signet Burgundy are never decorative. They appear only when there's a semantic reason — a sale, a feature, a status, a warning. If you're reaching for burgundy "because it looks nice," stop.

## 3. Typography

**Display Font:** Arvo (with Georgia, serif fallback)
**Body Font:** Inter (with system-ui, sans-serif fallback)
**Label/Mono Font:** Inter (same stack, at heavy weight and tracked out)

**Character:** A slab-serif workhorse paired with a utilitarian sans. Arvo brings the physical, printed confidence of in-store signage — heavy, square, unapologetic. Inter handles body text with warmth and clarity — never cold, never technical. The pairing says "hardware store shelf label meets readable catalog copy."

### Hierarchy
- **Display** (Arvo, 700–900, `clamp(2rem, 6vw, 4rem)`, tracking `-0.05em`, line-height 0.85): Hero headlines, department names, the "Bay State" brand mark. Uppercase. Appears at the top of pages and as section anchors. Never more than once per visible screen area.
- **Headline** (Arvo, 900, `1.5rem–2.5rem`, tracking `-0.025em`, uppercase): Section headings ("Featured Products," "Shop by Department," "Local Services"). Accompanied by a 4px–8px bottom border in `#211414`.
- **Title** (Inter, 600–700, `1.25rem–1.5rem`, line-height 1.2): Product card names, card titles, page titles in admin. `font-semibold` by default; `font-bold` when emphasis is needed.
- **Body** (Inter, 400, `0.875rem–1rem`, line-height 1.6, max 65ch): Product descriptions, footer text, admin body copy. Never smaller than `0.875rem` for readability.
- **Label** (Inter, 900, `0.625rem–0.75rem`, letter-spacing `0.15em–0.2em`, uppercase): Badges, category tags, status indicators, button text, form labels, footer column headings. The "stamped" text layer — small, loud, tracked out.
- **Price** (Arvo, 900, `1.25rem`, tracking `-0.05em`): Product prices. Always Arvo at `font-black`. The only number that gets display treatment.

### Named Rules

**The One Display Per Screen Rule.** Arvo display text (`font-black uppercase tracking-tighter`) appears on at most one element per visible screen area. Two competing display elements dilute each other. If a heading and a hero both use Arvo 900 uppercase, one of them is wrong.

**The Label Is Never Quiet Rule.** All label text is `font-black`, `uppercase`, and tracked out by at least `0.15em`. A label at `font-medium` or `normal-case` is a bug, not a choice. Labels are stamps, not whispers.

## 4. Elevation

This system uses **hard-stamp shadows, not ambient elevation.** Surfaces are flat at rest. Depth is conveyed through offset shadows with zero blur and zero spread — `Xpx Ypx 0 rgba(0,0,0,1)` — creating the illusion of layered card stock, not floating UI. On hover, cards translate slightly (`-translate-x-0.5 -translate-y-0.5`) while the shadow deepens, like a card being lifted from a stack.

The admin surface suppresses shadows entirely — replacing them with thin `1px` borders — because a data tool doesn't need physical metaphor.

### Shadow Vocabulary
- **Stamp-Sm** (`box-shadow: 1px 1px 0 rgba(0,0,0,1)`): Badges and small chips. The lightest stamp — barely lifted.
- **Stamp-Md** (`box-shadow: 4px 4px 0 rgba(0,0,0,1)`): Product cards on hover, dialogs, sheet panels. The primary interactive shadow — says "this card is selected or active."
- **Stamp-Lg** (`box-shadow: 8px 8px 0 rgba(0,0,0,1)`): Department cards on the homepage. Heavy, architectural — cards that anchor the layout.
- **Stamp-Hero** (`box-shadow: 12px 12px 0 rgba(0,0,0,0.25)`): Hero text boxes over images. Larger offset with slight transparency so it doesn't overpower the image beneath.
- **None** (`box-shadow: none`): All admin surfaces, cards at rest, body text containers. The default state. If you're adding a shadow without an interaction, reconsider.

### Named Rules

**The Flat-By-Default Rule.** Cards are flat at rest. Shadows appear only as a response to interaction (hover, focus, open). A card with a permanent shadow is a card pretending to be lifted when it isn't — visually dishonest.

**The No Blur Rule.** Shadows in this system have zero blur-radius. `0 4px 12px rgba(0,0,0,0.15)` is the language of SaaS dashboards, not general stores. If a shadow has a blur, it's in the wrong design system.

**The Admin Is Dark & Border-Only Rule.** The admin portal is dark-themed to reduce eye strain during long sessions. It conveys depth through borders and background color shifts, never shadows. `data-ui-surface="admin"` strips all box-shadows. A shadow in admin is a bug.

## 5. Components

### Buttons
- **Shape:** Square (`rounded-none`). No rounding, no pill shapes. Buttons are rectangles cut from card stock.
- **Primary:** Uniform Green (`#14532D`) background, Feed Bag Cream (`#FFF8D8`) text. `font-black uppercase tracking-[0.15em] text-xs`. Padding `px-4 py-2`. Height `2.75rem` default, `2.25rem` small, `3.25rem` large.
- **Hover:** Background shifts to Shadow Pine (`#0B3D22`). No transform on hover — the color shift is the feedback. Active state: `scale-[0.98]` for press-down effect.
- **Secondary:** Signet Burgundy (`#760C19`) background. Same typography and sizing. Hover shifts to Burgundy Dark (`#4E0710`).
- **Outline:** Transparent background, Uniform Green border and text. Hover fills background with Uniform Green, text shifts to cream. Used for less-dominant actions alongside a primary.
- **Ghost/Link:** No border, no background. Uniform Green text with `underline-offset-4`. Hover adds underline. For tertiary actions and inline navigation.
- **Focus:** `ring-[3px] ring-uniform-green/50` with `2px` offset. Always visible, never subtle — a store manager should never wonder what's focused.

### Badges
- **Shape:** Square (`rounded-none`). `font-black uppercase text-[10px] tracking-[0.15em]`. Subtle `border-r-2 border-b-2` for a 3D stamped edge.
- **Default:** Uniform Green background, cream text.
- **Sale:** Corner Callout Gold (`#F6DB12`) background, Ledger Charcoal text. The brightest badge — reserved for price reductions.
- **Pre-Order:** Muted Gold (`#E9B520`) background, Ledger Charcoal text.
- **Featured:** Signet Burgundy (`#760C19`) background, cream text.
- **Out of Stock:** Red (`#EF4444`) background, white text — the only non-brand color in the badge set, and intentionally so. It should look wrong.
- **Pickup Only:** Ledger Charcoal (`#211414`) background, white text, with `border-r-2 border-b-2 border-white/20`.

### Cards
- **Corner Style:** Square (`rounded-none`) on storefront product cards. Admin cards may round to `0.5rem`.
- **Background:** White (`#FFFFFF`) on storefront; admin uses surface colors.
- **Shadow Strategy:** Flat at rest. On hover: `shadow-[4px_4px_0_rgba(0,0,0,1)]` with `-translate-x-0.5 -translate-y-0.5`.
- **Border:** `2px solid #E7D8A8` (Card Border) at rest. Shifts to `#211414` on hover to match the shadow.
- **Internal Padding:** `1rem` (p-4) for content area. Product image fills top edge to edge — no padding above the image.

### Inputs
- **Style:** Square (`rounded-none`), full-width. Border `1px solid` in Card Border (`#E7D8A8`) or `#211414` (heavy variant). Background Feed Bag Cream.
- **Height:** `2.5rem` (40px) for text inputs. Larger for textareas (min `4rem`).
- **Focus:** Border shifts to Uniform Green, adds `ring-[3px] ring-uniform-green/50`. Never a glow — a ring, sharp and definitive.
- **Placeholder:** Muted gold tone, not gray. `text-card-border` or similar warm-faded color.
- **Error:** Border shifts to destructive red. Never a red background — the border is the signal.

### Navigation
- **Storefront Header:** Uniform Green background, full-width. Cream text on nav triggers. `border-b-4` in Ledger Charcoal. Active/open state inverts to white background with Ledger Charcoal text. Mega menus drop with `shadow-[0_24px_48px_rgba(15,23,42,0.12)]` — the only blurred shadow in the system (depth requires ambient falloff here).
- **Storefront Footer:** Shadow Pine (`#0B3D22`) background, cream and white text. `border-t-4` in Uniform Green. Four-column grid with uppercase tracked-out column headings.
- **Admin Sidebar:** Uniform Green background, collapsible (80px → 240px). White text at varying opacities. Active link inverts to white background with green text. Mobile: hamburger trigger opens a Sheet.

### Admin Cards
- **Surface variant:** Flat, `border-border` border, `p-4 sm:p-6`. No shadow. For data display.
- **Panel variant:** Same as surface but adds `shadow-sm`. For actionable containers.
- **Metric Card:** Surface variant with a 4px left accent bar in semantic color (green/amber/red/blue). Title in `text-xs font-bold uppercase tracking-widest`. Value in `text-4xl font-black uppercase tracking-tighter`.

### Data Tables
- Header row: `bg-muted/50`, `text-xs font-bold uppercase tracking-widest`.
- Body rows: white background, `border-b border-border`. Hover: `bg-muted/30`.
- No zebra striping — hover is sufficient affordance.
- Search input: same as standard input, with a search icon prefix. Full-width above the table.

## 6. Do's and Don'ts

### Do:
- **Do** use Uniform Green (`#14532D`) for headers, primary buttons, and the sidebar. It's the store apron — it goes where identity lives.
- **Do** use Corner Callout Gold (`#F6DB12`) only when something needs attention — a sale badge, a promo strip, a rating star. If it appears without a semantic reason, remove it.
- **Do** use `rounded-none` on product cards, badges, buttons, dialogs, and inputs. Square is the default. Round is the exception.
- **Do** use hard-offset shadows (`Xpx Ypx 0 rgba(0,0,0,1)`) for interactive elevation. No blur, no spread — stamp, not glow.
- **Do** use `uppercase font-black tracking-tighter` on section headings with a thick bottom border (`border-b-4` or `border-b-8` in `#211414`).
- **Do** keep body text between `0.875rem` and `1rem` at a maximum of 65 characters per line.
- **Do** use Feed Bag Cream (`#FFF8D8`) as the page background, never `#FFFFFF` or `#000000`.
- **Do** pair Arvo display text with Inter body text. Never swap them — Arvo for body is illegible; Inter for display is forgettable.

### Don't:
- **Don't** use Shopify template patterns — hero sliders with stock photography, "curated collections" language, generic trust badges, soft rounded card grids.
- **Don't** look like Chewy.com — no big-box e-commerce polish, no algorithmic recommendation carousels, no impersonal scale.
- **Don't** use generic SaaS cream — no white-plus-gray palettes, no ghost buttons, no soft rounded corners as the personality.
- **Don't** build logo-first palettes — the site follows real-world recognition (green uniforms, green storefront), not the logo's color balance.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or list items. Use full borders, background tints, or leading numbers instead.
- **Don't** use gradient text (`background-clip: text`). Every text element is a single solid color. Emphasis comes from weight and size.
- **Don't** use glassmorphism or backdrop blurs decoratively. Blurs are for mega-menu drop shadows only — and even then, sparingly.
- **Don't** use the hero-metric template (big number + small label + supporting stats + gradient accent). It's a SaaS cliché.
- **Don't** build identical card grids with icon + heading + text repeated endlessly. Vary card sizes, shapes, and content density.
- **Don't** use modals as the first solution. Exhaust inline expansion, sheets, and progressive disclosure first.
- **Don't** animate layout properties (`width`, `height`, `top`, `left`). Use `transform` and `opacity` only.
- **Don't** add shadows to admin surfaces. The admin is border-only. A shadow in admin is a bug.
- **Don't** use `#000` or `#fff` anywhere. Ledger Charcoal and Feed Bag Cream are the darkest and lightest values.
