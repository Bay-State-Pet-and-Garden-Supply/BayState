# Admin Surface Visual Vocabulary

## Files Examined

| File | Role |
|---|---|
| `components/admin/sidebar.tsx` | Main navigation shell, collapse/expand, role-based visibility |
| `components/admin/mobile-sidebar-drawer.tsx` | Mobile sheet wrapper for sidebar |
| `components/admin/AdminLayoutStyles.tsx` | Locks body scroll on mount |
| `components/admin/admin-page-shell.tsx` | Page-level layout wrapper (header + scroll content) |
| `components/admin/page-header.tsx` | Reusable page title/description/meta/actions bar |
| `components/admin/admin-card.tsx` | `surface` vs `panel` card variants with header/title/description/content subcomponents |
| `components/admin/data-table.tsx` | Full-featured generic table (search, sort, paginate, select, loading, empty) |
| `components/admin/confirmation-dialog.tsx` | Destructive/default confirm dialog with async loading |
| `components/admin/user-role-select.tsx` | Inline role dropdown + confirm dialog guard |
| `components/admin/dashboard/admin-dashboard-view.tsx` | Dashboard layout composing metric cards, widgets, activity feed, quick actions |
| `components/admin/dashboard/metric-card.tsx` | Status-colored card with accent bar, trend, icon, skeleton loading |
| `components/admin/dashboard/stat-card.tsx` | Simpler stat card with trend/href, variant background colors |
| `components/admin/dashboard/scraper-status-widget.tsx` | Card with success rate, velocity, volume; loading/error states |
| `components/admin/dashboard/fleet-status-widget.tsx` | Scrollable runner list with status badges, tooltip job IDs |
| `components/admin/dashboard/recent-activity-feed.tsx` | Hook-driven activity list with icons, status badges, relative timestamps |
| `components/admin/dashboard/recent-activity.tsx` | Simpler prop-driven version of activity feed |
| `components/admin/dashboard/quick-actions.tsx` | Button grid using shadcn `Button` variants |
| `components/admin/dashboard/pipeline-status.tsx` | Horizontal bar chart with color-coded stages and callout banner |

---

## Visual Vocabulary

### Toned Down vs. Storefront

The admin surface is deliberately subdued compared to a customer-facing storefront:

- **No brand hero colors** as backgrounds. The dark green (`brand-forest-green`) appears only in the sidebar and its badge hover. Dashboard cards use neutral `bg-card` / `border-border` with semantic accent colors (green/amber/red/blue) reserved for status indicators.
- **Typography is utilitarian.** Dashboard headings use `text-4xl font-black uppercase tracking-tighter` (decorative but muted grey `text-zinc-950`), while subheadings are `text-xs font-bold uppercase tracking-widest text-zinc-600` — small, loud, but not decorative. Page titles default to `text-2xl font-semibold tracking-tight text-foreground`.
- **No gradients, heavy shadows, or hero imagery.** Cards use subtle `shadow-sm` on panel variant; otherwise borders alone define container edges. The sidebar's toggle button uses `shadow-[var(--shadow-md)]` but that's the only elevated element.
- **Color is semantic, not cosmetic.** Green = success/published/online, amber = warning/pending/busy, red = error/failed/offline, blue = info. These appear as left accent bars in MetricCard, as chip backgrounds in PipelineStatus and RecentActivity, and as badge colors in FleetStatusWidget. There is no decorative color.

### Navigation Styling

- **Sidebar**: Collapsible 80px/240px, dark green (`bg-brand-forest-green`), white text at various opacities (`text-white/55`, `text-white/72`, `text-white/78`). Active link inverts to white background with green text. Inactive links get `hover:bg-white/12`. Sections have either a title label (expanded) or a thin white divider (collapsed).
- **Role gating**: Sections and items carry `adminOnly` flags; non-admin users (`staff`) only see the first two groups (Dashboard/Analytics + Products/Product Lines).
- **Mobile**: A fixed hamburger button (rounded-full, white, shadow) opens a `Sheet` with the same sidebar content. Closes on route change via `queueMicrotask`.
- **Footer**: User avatar circle + role badge + "Exit Portal" link back to storefront.

### Panel Patterns

| Pattern | Implementation |
|---|---|
| **Page wrapper** | `AdminPageShell` – passes title/description/icon/meta/actions to `PageHeader`, renders children in a scrollable flex column. Optional `fullHeight` mode locks overflow. |
| **Card system** | `AdminCard` with two variants: `surface` (flat, `bg-card border-border p-4 sm:p-6`) and `panel` (adds `shadow-sm`). Subcomponents: `AdminCardHeader`, `AdminCardTitle` (`text-lg font-semibold`), `AdminCardDescription` (`text-sm text-muted-foreground`), `AdminCardContent`. Some widgets use shadcn `Card` directly instead. |
| **Dashboard grid** | 4-column metric row → 3-column middle section (scraper status + fleet) → 3-column bottom (activity feed + quick actions). All use CSS grid (`grid gap-4/6`). |
| **Data tables** | `DataTable<T>` – generic, typed, client-side. Features: search (by `searchable` column keys), sort (cycle asc/desc/none), pagination (with page size selector), checkbox selection, loading spinner, empty state with optional action, row click, per-row action slot. Uses shadcn `Table`, `Button`, `Input`, `Checkbox`. |
| **Loading states** | Every data-driven widget (MetricCard, ScraperStatusWidget, FleetStatusWidget, RecentActivityFeed) renders `Skeleton` placeholders matching the content layout before data arrives. `DataTable` shows a centered `Loader2` spinner. |
| **Error states** | Widgets render an inline error card (e.g., red-tinted with `AlertCircle` icon and error message) rather than crashing or showing blank. |
| **Empty states** | Dedicated illustrations (icon + text) for zero-data scenarios: `Clock` icon in RecentActivity, `Server` icon in FleetStatus, `text-muted-foreground` centered message in DataTable. |
| **Confirmations** | `ConfirmationDialog` wraps shadcn `AlertDialog` with async confirm, loading spinner, and a destructive variant. Used by `UserRoleSelect` for role changes. |

### Semantic Token Usage

Tokens found across the admin surface (from Tailwind theme / shadcn variables):

| Token | Usage |
|---|---|
| `bg-card` | Card backgrounds |
| `border-border` | Default card/dialog borders |
| `text-foreground` | Body/card title text |
| `text-muted-foreground` | Descriptions, metadata, pagination info |
| `bg-muted` / `bg-muted/50` | Table header rows, inactive icon backgrounds |
| `bg-muted/30` | Inner stat tiles inside widgets |
| `brand-forest-green` | Sidebar background, active badges, success indicators |
| `brand-gold` | Scraper velocity icon accent |
| `brand-burgundy` | Error state card tint |
| `bg-primary/10` | Page header icon container, selected row count banner |
| `shadow-sm` / `shadow-[var(--shadow-md)]` | Panel elevation (minimal) |

### Key Observations

1. **Two card systems coexist.** `AdminCard` provides a clean composable pattern, but many dashboard widgets (`ScraperStatusWidget`, `FleetStatusWidget`, `RecentActivityFeed`) use raw shadcn `Card`/`CardHeader`/`CardContent` instead. No visual conflict, but the convention is not enforced uniformly.

2. **Brand colors are restrained.** `brand-forest-green` dominates the sidebar and appears in occasional badges/buttons but never as a page background. The storefront likely uses much more expressive brand color as backgrounds, gradients, or hero sections — the admin intentionally avoids that.

3. **High information density, low decoration.** Borders and thin separator lines do the layout work. No decorative illustrations, no background patterns, no large hero images. Every pixel serves data or action.

4. **Responsive strategy is minimal.** The mobile sidebar drawer is the only responsive-aware component. Dashboard grids and data tables use `sm:` / `lg:` breakpoints but are not truly mobile-first beyond that.
