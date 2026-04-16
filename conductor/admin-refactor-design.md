# Design Document: Admin Panel "Modern Farm Utilitarian" Refactor

## Objective
Eliminate "AI Slop" patterns (generic rounding, soft shadows, low-contrast accents) from the Admin Panel and align it with the "Modern Farm Utilitarian" brand identity.

## Target Aesthetic
- **Robustness**: Heavy borders and solid shadows.
- **Utilitarianism**: Zero rounding (`rounded-none`), high-contrast colors.
- **Boldness**: High-impact typography (black, uppercase, tight tracking).

## Detailed Specifications

### 1. Visual Style & Components
- **Rounding**: Replace all `rounded-*` (sm, md, lg, xl, 2xl, full) with `rounded-none`.
- **Borders**: All cards, inputs, and containers must use `border-4 border-zinc-950`.
- **Shadows**: Replace all elevation shadows with `shadow-[8px_8px_0px_rgba(0,0,0,1)]`.
- **Accent Borders**: Remove "side-tab" accent borders (`border-l-4`, etc.) and replace with a cohesive 4-sided heavy border.

### 2. Typography
- **Headings**: All page titles and `CardTitle` components must use `font-display font-black uppercase tracking-tighter`.
- **Buttons**: All `Button` variants must use `font-bold uppercase tracking-tight`.
- **Form Labels**: Use `font-bold uppercase tracking-tight text-xs` for form labels.

### 3. Color Palette
- **Primary Surface**: `bg-background` (or brand-specific surface).
- **Secondary Surface**: `bg-zinc-100` (light mode) / `bg-zinc-900` (dark mode) for nested elements.
- **Borders/Shadows**: `zinc-950` / `black`.
- **Dialogs/Sheets**: Avoid pure `#000000`. Use `bg-zinc-950` or `bg-background` with a heavy overlay.

### 4. Component-Specific Rules
- **Buttons**: Must be `rounded-none` with `border-2` (minimum) or `border-4`.
- **Badges**: Transition from `rounded-full` to `rounded-none` with a `border-2`.
- **Inputs**: `rounded-none` with `border-2 border-zinc-950`.
- **Sidebar**: Ensure the `AdminSidebar` links and container follow the blocky aesthetic.

## Implementation Strategy
- **Global CSS/Tailwind**: Update base UI components (Button, Card, Input, Badge, etc.) in `apps/web/components/ui/`.
- **Scoped Refactor**: Perform a grep/replace audit of `apps/web/app/admin/` to catch hardcoded `rounded-` and shadow classes.
- **Verification**: Re-run `npx impeccable` to ensure zero anti-pattern findings.
