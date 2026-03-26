# Admin Panel Dark Theme Redesign Plan

## Background & Motivation
The user requested the admin panel to be entirely dark-themed to reduce eye strain ("My eyes are burning it needs to be darker"). 
The application uses Tailwind CSS v4 and shadcn/ui. The `globals.css` file already defines a comprehensive set of `.dark` mode variables, but the admin panel is currently using the default light theme, and many components inside `app/admin` have hardcoded light-mode colors (e.g., `bg-white`, `text-gray-900`).

## Scope & Impact
- **Scope**: Modifying the root admin layout to enforce dark mode. Replacing hardcoded color utility classes across all admin components to use semantic variables.
- **Impact**: The storefront remains unaffected. The entire admin interface (dashboard, pipeline, scrapers, products, settings) will natively render in dark mode without needing a toggle. 

## Proposed Solution

### Phase 1: Force Dark Mode in Admin Layout
1. Update `apps/web/app/admin/layout.tsx`.
2. Apply `className="dark bg-background text-foreground"` to the root `div` wrapper. Because Tailwind v4 utilizes `@custom-variant dark (&:is(.dark *));`, this will cascade dark theme variables down to all admin children.

### Phase 2: Refactor Hardcoded Colors (Batch Replace)
Currently, there are nearly 100 instances of hardcoded light colors across the admin codebase. We will systematically replace these with their semantic shadcn/ui equivalents:
- **Backgrounds**: `bg-white` → `bg-card` or `bg-background`
- **Muted Backgrounds**: `bg-gray-50`, `bg-gray-100` → `bg-muted`
- **Primary Text**: `text-gray-900`, `text-gray-800` → `text-foreground`
- **Secondary Text**: `text-gray-600`, `text-gray-500` → `text-muted-foreground`
- **Borders**: `border-gray-200`, `border-gray-300` → `border-border`

*Key areas of focus include:*
- Data tables (`apps/web/app/admin/*/` *-data-table.tsx)
- Scraper UI and Studio timeline (`apps/web/app/admin/scrapers/studio/TimelineStepDisplay*.tsx`)
- Forms and Cards (`apps/web/app/admin/pages/_components/page-form.tsx`)

### Phase 3: Review Sidebar and Brand Colors
- The sidebar currently uses the `bg-sidebar` variable, which is configured as `--sidebar: #008850` (Forest Green) in both light and dark modes within `globals.css`. We will leave this intact to preserve brand identity while the main content area shifts to `#09090b` (Dark Background).

## Verification
- Run the development server (`npm run dev`) and navigate to `/admin`.
- Verify the main layout successfully inherits `#09090b` background.
- Test nested pages (Scraper Network, Pipeline, Products) to ensure no "white patches" or invisible text remain.
- Ensure inputs and forms maintain visible borders (`border-border`) and readable text.