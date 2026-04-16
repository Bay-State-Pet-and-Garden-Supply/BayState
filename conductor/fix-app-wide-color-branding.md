# Plan: App-Wide Color Branding & Utilitarian Aesthetic Update

## Objective
Audit and fix app-wide color usage to align with the "Modern Farm Utilitarian" brand palette (Forest Green, Burgundy, Gold) and aesthetic (sharp corners, heavy borders, blocky shadows). Specifically targeted at the "notepad looking" components in settings and generic Tailwind pastel colors used throughout the application.

## Key Files & Context
- `apps/web/app/globals.css`: Brand color definitions and Tailwind v4 theme.
- `apps/web/components/ui/badge.tsx`: Base badge styling.
- `apps/web/components/ui/alert.tsx`: Base alert styling.
- `apps/web/components/ui/card.tsx`: Base card styling.
- `apps/web/components/ui/status-badge.tsx`: Order status badges.
- `apps/web/components/admin/settings/*`: Settings cards with "notepad" icon containers.

## Implementation Steps

### Phase 1: Brand Theme Refinement
1. **Verify Brand Tokens:** Ensure `apps/web/app/globals.css` correctly exposes brand colors for use in Tailwind utilities.
2. **Define Muted Brand Variants:** (Optional) If standard transparency (e.g., `bg-primary/10`) isn't sufficient, define explicit muted variables in `globals.css`.

### Phase 2: Utilitarian Component Overhaul
1. **Badge Component:**
   - Change `rounded-full` to `rounded-none`.
   - Change `border` to `border-2 border-zinc-900` (or appropriate brand color).
   - Add optional `shadow-[2px_2px_0px_rgba(0,0,0,1)]`.
   - Update variants (`success`, `warning`, `destructive`) to use brand colors:
     - `success`: `bg-brand-forest-green`
     - `warning`: `bg-brand-gold`
     - `destructive`: `bg-brand-burgundy`
2. **Alert Component:**
   - Change `rounded-lg` to `rounded-none`.
   - Change `border` to `border-4 border-zinc-900`.
   - Update variants to use brand-aligned colors.
3. **Card Component:**
   - Change `rounded-lg` to `rounded-none`.
   - Increase border weight where appropriate for that "Utilitarian" look.

### Phase 3: Settings "Notepad" Fix
1. **Target Icon Containers:** Update the small colored squares in settings card headers:
   - Location: `AIScrapingSettingsCard`, `AIConsolidationSettingsCard`, `EnrichmentDefaultsCard`, `ShopSiteCredentialsCard`, `ScraperCredentialsCard`.
   - Styles: `rounded-lg` -> `rounded-none`, `border-2 border-zinc-900`, `shadow-[4px_4px_0px_rgba(0,0,0,1)]`.
   - Colors:
     - AI / Scraper: `bg-brand-gold`
     - Consolidation / Credentials: `bg-brand-forest-green`
     - Enrichment: `bg-brand-burgundy`

### Phase 4: App-Wide Status Audit
1. **StatusBadge:** Map order statuses to brand colors:
   - `pending` -> Gold
   - `ready`/`completed` -> Forest Green
   - `cancelled`/`refunded` -> Burgundy
2. **General Cleanup:** Replace all remaining instances of generic `bg-blue-100`, `bg-purple-100`, `bg-violet-100`, `bg-emerald-100`, etc., with brand-aligned variants (`bg-primary/10`, `bg-secondary/10`, `bg-accent/10`).

## Verification & Testing
- **Visual Audit:** Manually verify settings pages and various dashboards to ensure the new "Utilitarian" look is consistent and brand-aligned.
- **Accessibility Check:** Ensure high-contrast colors maintain readability (WCAG AA/AAA).
- **Snapshot Tests:** Update any existing UI component tests that rely on specific class names or styles.
