---
name: Bay State Pet & Garden Supply
description: Online extension of the Taunton, MA general store. Warm, practical, readable, and business-first.
colors:
  uniform-green: "#14532D"
  shadow-pine: "#0B3D22"
  seedling-green: "#16844D"
  signet-burgundy: "#760C19"
  burgundy-dark: "#4E0710"
  corner-callout-gold: "#F6DB12"
  muted-gold: "#E9B520"
  feed-bag-cream: "#FAF9F2"
  white-surface: "#FFFFFF"
  mulch-brown: "#6B3A18"
  ledger-charcoal: "#211414"
  card-border: "#E8E6D9"
typography:
  display:
    fontFamily: "Arvo, Georgia, serif"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
    maxWidth: "65ch"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 600
    fontSize: "0.75rem"
    lineHeight: 1.25
    letterSpacing: "0.05em"
    textTransform: "uppercase"
  price:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 700
    fontSize: "1.25rem"
    lineHeight: 1
    letterSpacing: "normal"
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
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.shadow-pine}"
  button-secondary:
    backgroundColor: "{colors.signet-burgundy}"
    textColor: "{colors.feed-bag-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
    height: "2.5rem"
  button-secondary-hover:
    backgroundColor: "{colors.burgundy-dark}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.uniform-green}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
  badge:
    backgroundColor: "{colors.uniform-green}"
    textColor: "{colors.feed-bag-cream}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
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
    backgroundColor: "{colors.white-surface}"
    textColor: "{colors.ledger-charcoal}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
    height: "2.5rem"
  card:
    backgroundColor: "{colors.white-surface}"
    textColor: "{colors.ledger-charcoal}"
    rounded: "{rounded.lg}"
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

This is a digital general store — warm, practical, and built for legibility and utility. The website is an extension of the physical store at 429 Winthrop Street, not a separate brand experiment.

The system is **business-first and accessible**: clean typography, clear contrast on cream stock, and soft, natural shadows that create depth and visual hierarchy without being overwhelming. It's confident and reliable. Decisions that grab attention do so for reasons a store manager would recognize — a sale badge, a pickup-only label, a department sign.

**Key Characteristics:**
- Clean and soft — rounded corners (`sm`, `md`), subtle shadows (`sm`, `md`) for elevation
- Physical not digital — the palette evokes aprons, signage, paper bags
- Readable and clear — normal font weights for body, sensible headers, avoiding excessive caps
- Semantic not decorative — accent colors signal meaning (sale, pre-order, pickup), not mood
- Store-first — every design choice answers "would this make sense for our customers?"

## 2. Colors

The palette follows the physical store — green uniforms and signage dominate, burgundy and gold are heritage accents from the logo, cream and white hold the background. The hierarchy is: **Green owns the room, burgundy remembers, gold whispers.**

### Primary
- **Uniform Green** (`#14532D`): Headers, primary buttons, navigation, footer, sidebar backgrounds. The color of the store aprons and exterior signage. Dark enough for white text at AA contrast.
- **Shadow Pine** (`#0B3D22`): Button hover states, footer bottom band, active nav states.
- **Seedling Green** (`#16844D`): Garden category tags, success states, icons for completed/published status. Brighter and lighter than Uniform Green.

### Secondary
- **Signet Burgundy** (`#760C19`): Secondary buttons, featured badges, sale banners, "special" highlights. The logo's deep red — used sparingly but with impact.
- **Burgundy Dark** (`#4E0710`): Hover state for burgundy elements, footer accent details.

### Tertiary
- **Corner Callout Gold** (`#F6DB12`): Sale badges, rating stars, promo strips, active nav underlines.
- **Muted Gold** (`#E9B520`): Borders, icons, subtle highlights, pre-order badges.

### Neutral
- **White Surface** (`#FFFFFF`): Primary wall color. Page background, product cards, form fields. Clean and bright.
- **Feed Bag Cream** (`#FAF9F2`): Softer page sections and accents. Toned down, cleaner cream.
- **Ledger Charcoal** (`#211414`): Main body text. Warm near-black.
- **Card Border** (`#E8E6D9`): Card borders on cream backgrounds. Subtle and less yellow.
- **Mulch Brown** (`#6B3A18`): Footer detail text, rustic accents.

### Named Rules

**The Architecture Rule.** White holds 70% of the surface (walls). Uniform Green (`#14532D`) carries 20% (furniture/registers). Signet Burgundy (`#760C19`) defines 10% of structural lines (doorframes/borders). Gold is an occasional spark.

**The Accent Is Earned Rule.** Corner Callout Gold and Signet Burgundy are never decorative. They appear only when there's a semantic reason.

## 3. Typography

**Display Font:** Arvo (with Georgia, serif fallback)
**Body Font:** Inter (with system-ui, sans-serif fallback)

**Character:** A legible serif paired with a utilitarian sans.

### Hierarchy
- **Display** (Arvo, 700, `clamp(2rem, 5vw, 3.5rem)`): Hero headlines, department names.
- **Headline** (Arvo, 600-700, `1.5rem–2.5rem`): Section headings.
- **Title** (Inter, 600, `1.25rem–1.5rem`): Product card names, card titles.
- **Body** (Inter, 400, `0.875rem–1rem`): Product descriptions, footer text.
- **Label** (Inter, 600, `0.75rem–0.875rem`): Badges, category tags, status indicators, button text.
- **Price** (Inter, 700, `1.25rem`): Product prices.

## 4. Elevation

This system uses **soft ambient elevation.** Surfaces are flat at rest, with subtle borders. Depth is conveyed through standard drop shadows with soft blur to create a realistic sense of layering.

### Shadow Vocabulary
- **Sm** (`shadow-sm`): Badges, inputs, standard cards.
- **Md** (`shadow-md`): Dialogs, popovers, navigation dropdowns.
- **None** (`shadow-none`): Flat surfaces.

## 5. Components

### Buttons
- **Shape:** Rounded (`rounded-sm` or `rounded-md`).
- **Primary:** Uniform Green (`#14532D`) background, Feed Bag Cream (`#FAF9F2`) text. Normal or semibold font weight.
- **Hover:** Background shifts to Shadow Pine (`#0B3D22`).
- **Secondary:** Signet Burgundy (`#760C19`) background.

### Cards
- **Corner Style:** Rounded (`rounded-lg`).
- **Background:** White (`#FFFFFF`) on storefront.
- **Shadow Strategy:** `shadow-sm` at rest. `shadow-md` on hover if interactive.
- **Border:** `1px solid` in Card Border (`#E8E6D9`) or subtle gray.

### Inputs
- **Style:** Rounded (`rounded-sm`), full-width. Border `1px solid`.
- **Focus:** Border shifts to Uniform Green, soft ring.

## 6. Do's and Don'ts

### Do:
- **Do** use soft shadows and standard radiuses for a modern, approachable feel.
- **Do** prioritize readability with normal casing and standard font weights for body and labels.
- **Do** keep body text between `0.875rem` and `1rem`.

### Don't:
- **Don't** use extreme uppercase, font-black styling for general labels.
- **Don't** use hard, unblurred stamp shadows. Depth should feel natural.
