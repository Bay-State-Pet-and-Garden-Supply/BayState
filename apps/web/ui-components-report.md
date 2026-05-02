# UI Components Report — `components/ui/`

Generated: 2026-05-01  
Source: `apps/web/components/ui/` — 37 components total  
Design-token source: `apps/web/app/globals.css`

---

## 1. Button (`button.tsx`)

**Library:** class-variance-authority (cva) + Radix Slot

### Variants (6)

| Variant | Classes (hardcoded colors/spacing) |
|---|---|
| `default` | `bg-primary text-white hover:bg-primary/90` |
| `destructive` | `bg-destructive text-destructive-foreground hover:bg-destructive/90` |
| `outline` | `bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50` |
| `secondary` | `bg-brand-gold text-brand-burgundy hover:bg-brand-gold/80 border-brand-gold` |
| `ghost` | `border-transparent shadow-none hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50` |
| `link` | `border-transparent shadow-none text-brand-forest-green underline-offset-4 hover:underline` |

### Size Options (6)

| Size | CSS classes / values |
|---|---|
| `default` | `h-[--size-btn-height-default] px-4 py-2` → **2.75rem (44px)** |
| `sm` | `h-[--size-btn-height-sm] gap-1.5 px-3` → **2.25rem (36px)** |
| `lg` | `h-[--size-btn-height-lg] px-6` → **3.25rem (52px)** |
| `icon` | `size-[--size-btn-height-icon]` → **2.75rem (44px)** square |
| `icon-sm` | `size-[--size-btn-height-icon-sm]` → **2.25rem (36px)** square |
| `icon-lg` | `size-[--size-btn-height-icon-lg]` → **3.25rem (52px)** square |

### Default Classes (base)

- `inline-flex items-center justify-center gap-2 whitespace-nowrap`
- **Border-radius:** `rounded-md` (~6px via `--radius: 0.25rem`)
- **Font:** `text-sm font-semibold`
- `border border-border` (all variants get border; `ghost`/`link` override to `border-transparent`)
- `shadow-sm`
- `active:scale-[0.98]` (click press effect; suppressed in admin surface)
- `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`
- `disabled:opacity-50 disabled:pointer-events-none`

### Defaults
- `variant: "default"`
- `size: "default"`

### Data attributes
- `data-slot="button"`, `data-variant={variant}`, `data-size={size}`

---

## 2. Input (`input.tsx`)

**No variants or size options** — single style.

### Classes
- `border-zinc-950 h-10 w-full min-w-0 rounded-none border bg-transparent px-3 py-1 text-base shadow-none`
- **Border-radius:** `rounded-none` (square)
- **Font:** `text-base` (mobile), `md:text-sm` (desktop+)
- **Padding:** `px-3 py-1`
- **Height:** `h-10` (40px) — hardcoded, not a CSS variable
- `placeholder:text-muted-foreground`
- `file:` pseudo-class styling for file inputs
- `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`
- `aria-invalid:ring-destructive/20 ... aria-invalid:border-destructive`

---

## 3. Textarea (`textarea.tsx`)

**No variants or size options.**

### Classes
- `border-input placeholder:text-muted-foreground`
- **Border-radius:** `rounded-md`
- **Font:** `text-base` → `md:text-sm`
- **Padding:** `px-3 py-2`
- `min-h-16 w-full`
- `field-sizing-content` (auto-grow)
- Same focus/invalid styles as Input
- `dark:bg-input/30`

---

## 4. Card (`card.tsx`)

**No variants or size options.** Sub-components: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.

### Card root
- `bg-card text-card-foreground flex flex-col gap-6 rounded-lg border border-border py-6 shadow-sm`
- **Border-radius:** `rounded-lg` (calc `--radius + 4px` = ~0.5rem)
- **Padding:** `py-6` (inner)

### CardHeader
- `px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]`

### CardTitle
- `leading-none font-semibold text-xl`

### CardDescription
- `text-muted-foreground text-sm`

### CardContent
- `px-6`

### CardFooter
- `flex items-center px-6 [.border-t]:pt-6`

---

## 5. Badge (`badge.tsx`)

**Library:** cva + Radix Slot

### Variants (6)

| Variant | Classes |
|---|---|
| `default` | `bg-primary text-primary-foreground` |
| `secondary` | `bg-secondary text-secondary-foreground` |
| `destructive` | `bg-destructive text-destructive-foreground` |
| `success` | `bg-brand-forest-green text-white` |
| `warning` | `bg-brand-gold text-brand-burgundy` |
| `outline` | `text-foreground` (transparent bg, inherits border) |

### Base classes
- `inline-flex items-center justify-center rounded-none border border-zinc-950 px-2 py-0.5`
- **Border-radius:** `rounded-none` (square)
- **Font:** `text-xs font-black uppercase tracking-tight`
- `w-fit whitespace-nowrap shrink-0`
- `shadow-[1px_1px_0px_rgba(0,0,0,1)]` (hardcoded pixel-drop shadow)
- Focus/invalid rings same as button/input

### Default variant: `"default"`

---

## 6. StatusBadge (`status-badge.tsx`)

Composes the `Badge` component with `variant="outline"`. Not a standalone primitive.

### Statuses mapped (6)

| Status | Classes | Icon |
|---|---|---|
| `pending` | `bg-brand-gold/20 text-brand-burgundy border-brand-gold/50` | Clock |
| `processing` | `bg-brand-forest-green/10 text-brand-forest-green border-brand-forest-green/30` | Package |
| `ready` | `bg-brand-forest-green/20 text-brand-forest-green border-brand-forest-green/50` | ShoppingBag |
| `completed` | `bg-brand-forest-green text-white border-zinc-950` | CheckCircle |
| `cancelled` | `bg-brand-burgundy/10 text-brand-burgundy border-brand-burgundy/30` | XCircle |
| `refunded` | `bg-brand-burgundy/20 text-brand-burgundy border-brand-burgundy/50` | RefreshCcw |

### Fallback (unknown status)
- `bg-zinc-100 text-zinc-800 border-zinc-900` with Clock icon

### Extra
- `gap-1.5 py-1` overrides default badge padding
- Optional `showIcon` prop (default `true`)
- Icon size `h-3.5 w-3.5`

---

## 7. Navigation Menu (`navigation-menu.tsx`)

**Library:** Radix NavigationMenu + cva

### Sub-components
- `NavigationMenu` (root, optional `viewport` boolean prop)
- `NavigationMenuList` (flex row, `gap-1`)
- `NavigationMenuItem`
- `NavigationMenuTrigger` — uses `navigationMenuTriggerStyle` cva
- `NavigationMenuContent` — animated slide/fade with viewport or popover modes
- `NavigationMenuLink`
- `NavigationMenuViewport`
- `NavigationMenuIndicator`

### navigationMenuTriggerStyle (cva)
- `group inline-flex h-9 w-max items-center justify-center px-4 py-2 text-sm font-medium`
- **No background, no border, no shadow** — relies on parent context
- **Focus ring:** `focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-1`

### Trigger icon
- `ChevronDownIcon`, `size-3`, rotates 180° on `data-[state=open]`

### Content/Viewport
- Viewport: `bg-popover text-popover-foreground rounded-md border shadow`
- Viewport block: `relative mt-1.5`
- Content (when `viewport=false`): appears as popover, `bg-popover text-popover-foreground`, zoom/fade animations

### No variant or size props exposed.

---

## 8. Select (`select.tsx`)

**Library:** Radix Select

### Trigger sizes (2)
| Size | Height |
|---|---|
| `default` | `data-[size=default]:h-9` (36px) |
| `sm` | `data-[size=sm]:h-8` (32px) |

### Trigger base
- `border-input rounded-md border bg-transparent px-3 py-2 text-sm`
- **Border-radius:** `rounded-md`
- `shadow-xs`
- `flex w-fit items-center justify-between gap-2`
- `dark:bg-input/30 dark:hover:bg-input/50`

### Content
- `bg-popover text-popover-foreground rounded-md border shadow-md`
- Animated (fade + zoom + slide)
- Min-width `min-w-[8rem]`, p-1 on viewport

### Item
- `focus:bg-accent focus:text-accent-foreground rounded-sm py-1.5 pr-8 pl-2 text-sm`
- Check icon indicator on right

---

## 9. Tabs (`tabs.tsx`)

**Library:** Radix Tabs + cva

### TabsList variants (2)

| Variant | Classes |
|---|---|
| `default` | `rounded-xl border border-zinc-200 bg-white p-1` |
| `line` | `rounded-none border-0 bg-transparent p-0 gap-2` |

### TabsTrigger
- `rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-foreground/60`
- Active state: `data-[state=active]:border-zinc-200 data-[state=active]:bg-background data-[state=active]:text-foreground`
- Line variant adds an `::after` pseudo-element underline (`bg-primary h-0.5`)

### Orientation
- Supports `horizontal` (default) and `vertical`

---

## 10. Dialog (`dialog.tsx`)

**Library:** Radix Dialog

### Content
- `bg-background rounded-none border-2 border-zinc-950 p-0`
- **Border-radius:** `rounded-none` (square)
- **Shadow:** `shadow-[4px_4px_0px_rgba(0,0,0,1)]` (hardcoded pixel shadow)
- Max-width: `sm:max-w-lg`
- Animated (fade + zoom)

### Overlay
- `bg-zinc-950/50`

### Title
- `text-lg leading-none font-black uppercase tracking-tight`

### Description
- `text-muted-foreground text-sm`

### Close button
- `absolute top-4 right-4 bg-zinc-950 text-white p-1`

---

## 11. Sheet (`sheet.tsx`)

**Library:** Radix Dialog (aliased as Sheet)

### Side options (4)
| Side | Classes |
|---|---|
| `top` | `top-0 left-0 right-0 w-full` |
| `right` (default) | `right-0 top-0 bottom-0 h-full w-full max-w-sm` |
| `bottom` | `bottom-0 left-0 right-0 w-full` |
| `left` | `left-0 top-0 bottom-0 h-full w-full max-w-sm` |

### Content
- `bg-background shadow-[4px_4px_0px_rgba(0,0,0,1)]`
- **Border-radius:** none (default)
- Animation: slide from each side, `duration-300 ease-in-out`

### Overlay
- Same as Dialog (`bg-zinc-950/50`)

### Header/Footer
- `p-4` padding

### Title/Description
- Identical styling to Dialog title/description

---

## 12. Dropdown Menu (`dropdown-menu.tsx`)

**Library:** Radix DropdownMenu

### Content
- `bg-popover text-popover-foreground rounded-md border p-1 shadow-lg`
- Animated (fade + zoom + slide)
- `sideOffset={4}` default

### Item variants (2)
| Variant | Classes |
|---|---|
| `default` | `focus:bg-accent focus:text-accent-foreground` |
| `destructive` | `text-destructive focus:bg-destructive/10 focus:text-destructive` |

### Item base
- `rounded-sm px-2 py-1.5 text-sm`
- `data-[inset]:pl-8` (for indented items)

---

## 13. Pagination (`pagination.tsx`)

Composes `buttonVariants` from `button.tsx`.

- `PaginationLink` uses `variant: isActive ? "outline" : "ghost"`, `size: "icon"` (default) or `"default"` for prev/next
- `PaginationPrevious`/`PaginationNext` use `size="default"`, `gap-1 pl-2.5`/`pr-2.5`
- `PaginationEllipsis`: `flex h-9 w-9 items-center justify-center`

---

## 14. Progress (`progress.tsx`)

**Library:** Radix Progress

- Track: `bg-primary/20 relative h-2 w-full overflow-hidden rounded-full`
- Indicator: `bg-primary h-full w-full flex-1 transition-all`
- Custom `indicatorClassName` prop accepted

---

## 15. Checkbox (`checkbox.tsx`)

**Library:** Radix Checkbox

- `peer h-4 w-4 shrink-0 rounded-sm border border-zinc-200`
- Checked: `data-[state=checked]:bg-zinc-900 data-[state=checked]:text-zinc-50`
- Focus: `ring-zinc-950`

---

## 16. Radio Group (`radio-group.tsx`)

**Library:** Radix RadioGroup

- Item: `aspect-square h-4 w-4 rounded-full border border-zinc-200 text-zinc-900`
- Indicator: `Circle` icon, `h-2.5 w-2.5 fill-current`

---

## 17. Spinner (`spinner.tsx`)

### Size options (3)
| Size | Classes |
|---|---|
| `sm` | `h-4 w-4 border` (16px) |
| `md` (default) | `h-6 w-6 border` (24px) |
| `lg` | `h-8 w-8 border-3` (32px) |

### Base
- `animate-spin rounded-full border-primary border-t-transparent`

### SpinnerOverlay
- Centered flex column, `py-12`
- Accepts optional `message` string

---

## 18. Accordion (`accordion.tsx`)

**Library:** Radix Accordion

### Item
- `border-b border-zinc-950 rounded-none`

### Trigger
- `flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline`
- `ChevronDown` icon rotates on open
- `hideIcon` prop available

### Content
- `text-sm`, animated `accordion-up` / `accordion-down`

---

## 19. Breadcrumb (`breadcrumb.tsx`)

- List: `flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:gap-2.5`
- Link: `transition-colors hover:text-foreground`
- Page (current): `font-normal text-foreground`
- Separator: `ChevronRight` (default), `[&>svg]:size-3.5`

---

## 20. File Upload (`file-upload.tsx`)

**Composed component** (not a primitive).

- Drop zone: `border border-dashed rounded-lg min-h-[8rem] p-6`
- Drag over: `border-purple-500 bg-purple-50`
- Default: `border-gray-300 bg-gray-50 hover:bg-gray-100`
- **Hardcoded purple colors** (`text-purple-600`, `bg-purple-100`, etc.) — not using brand tokens
- Max size prop (default 10MB)
- Loading state with `Loader2` spinner

---

## 21. Other Components (brief)

| Component | Key styling notes |
|---|---|
| `alert.tsx` | Radix Alert primitives (not inspected in detail) |
| `alert-dialog.tsx` | Radix AlertDialog (not inspected) |
| `calendar.tsx` | Radix DatePicker (not inspected) |
| `carousel.tsx` | Custom carousel with `embla-carousel-react` |
| `collapsible.tsx` | Radix Collapsible (not inspected) |
| `form.tsx` | Wraps Radix Form |
| `label.tsx` | Radix Label |
| `popover.tsx` | Radix Popover |
| `scroll-area.tsx` | Radix ScrollArea |
| `separator.tsx` | Radix Separator, `bg-border` |
| `skeleton.tsx` | `animate-pulse rounded-md bg-primary/10` |
| `skip-link.tsx` | Accessibility skip-to-content link |
| `sonner.tsx` | Wraps `sonner` toast library |
| `switch.tsx` | Radix Switch |
| `table.tsx` | HTML table wrapper |
| `tooltip.tsx` | Radix Tooltip |
| `empty-state.tsx` | Dashed border, `border-2 border-dashed border-zinc-200 bg-zinc-50 rounded-none`, 3xl title `font-black uppercase tracking-tighter font-display` |

---

## Brand / Design Tokens (`globals.css`)

### Semantic colors (OKLCH)
| Token | Value |
|---|---|
| `--color-brand-forest-green` | `oklch(35% 0.08 160)` |
| `--color-brand-warm-gray` | `oklch(25% 0.02 90)` |
| `--color-brand-cream` | `oklch(98% 0.01 90)` |
| `--color-brand-burgundy` (alias) | `var(--color-brand-warm-gray)` |
| `--color-brand-gold` (alias) | `var(--color-brand-cream)` |

### Legacy (root-level)
| Token | Value |
|---|---|
| `--brand-burgundy` | `var(--foreground)` |
| `--brand-gold` | `var(--background)` |

### Button sizes (rem)
| Token | Value |
|---|---|
| `--size-btn-height-sm` | `2.25rem` (36px) |
| `--size-btn-height-default` | `2.75rem` (44px) |
| `--size-btn-height-lg` | `3.25rem` (52px) |
| `--size-btn-height-icon-sm` | `2.25rem` (36px) |
| `--size-btn-height-icon` | `2.75rem` (44px) |
| `--size-btn-height-icon-lg` | `3.25rem` (52px) |

### Border radius
- `--radius: 0.25rem` (4px) — base
- `--radius-sm: calc(var(--radius) - 4px)` = 0
- `--radius-md: calc(var(--radius) - 2px)` = 2px
- `--radius-lg: var(--radius)` = 4px
- `--radius-xl: calc(var(--radius) + 4px)` = 8px

### Shadows
| Token | Value |
|---|---|
| `--shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| `--shadow-sm` | `0 12px 24px -22px rgb(0 0 0 / 0.15)` |
| `--shadow-md` | `0 22px 40px -28px rgb(0 0 0 / 0.2)` |
| `--shadow-float` | `0 28px 60px -30px rgb(0 0 0 / 0.25)` |

### Admin surface overrides
When parent element has `data-ui-surface="admin"`, these CSS overrides apply:
- All shadows removed (`box-shadow: none`)
- `rounded-none` → `border-radius: 0.5rem`
- `font-black` → `font-weight: 600`
- `uppercase` → `text-transform: none`
- `tracking-tight/tighter/widest` → `letter-spacing: normal`
- `border-zinc-950/900` → `border-color: var(--surface-admin-border)`
- All borders (`border-2`, `border-4`, `border-b-8`, etc.) → `border-width: 1px`
- Dialog/sheet/popover/dropdown/select/nav-viewport/tooltip borders → `var(--surface-admin-border)`
- Dialog/sheet/alert-dialog shadows → `var(--shadow-float)`
- Popover/dropdown/select/nav/tooltip shadows → `var(--shadow-md)`
- Button hover/active `transform` disabled

---

## Hardcoded Values Watchlist

Values that differ from the variable-based design system (risks for theming/consistency):

| Component | Hardcoded value | Suggestion |
|---|---|---|
| Input | `h-10` (40px) | Use `--size-btn-height-default` or a new input-height token |
| Badge | `shadow-[1px_1px_0px_rgba(0,0,0,1)]` | Could use a shadow token |
| Dialog/Sheet content | `shadow-[4px_4px_0px_rgba(0,0,0,1)]` | Could use a shadow token |
| Input border | `border-zinc-950` | Use `--color-border`/`border-input` for consistency (Textarea uses `border-input`) |
| Tabs list | `border-zinc-200 bg-white` | Hardcoded zinc, not a CSS variable |
| Checkbox/Radio | `border-zinc-200` unchecked, `bg-zinc-900` checked | Not using semantic color tokens |
| File upload | `text-purple-600`, `bg-purple-50`, `bg-purple-100`, etc. | Not using brand tokens at all |
| Dialog close button | `bg-zinc-950 text-white` | Not using semantic tokens |
| Progress track | `bg-primary/20 h-2 rounded-full` | Fine, uses tokens |

---

## Summary

- **CVA-based components with variants:** Button, Badge, TabsList, DropdownMenuItem
- **CVA-based with sizes:** Button, SelectTrigger, Spinner
- **Radix-wrapped components:** Most of the library (NavigationMenu, Dialog, Sheet, Select, Tabs, Dropdown, Accordion, Checkbox, RadioGroup, Progress, etc.)
- **Pagination** reuses button variants
- **StatusBadge** composes Badge with status-specific color classes
- **EmptyState** and **FileUpload** are composed, app-specific components (not primitives)
- **Strong pixel-shadow aesthetic** (`shadow-[4px_4px_0px_rgba(0,0,0,1)]`) throughout Dialog, Sheet, Badge
- **Admin surface** (`data-ui-surface="admin"`) aggressively normalizes the bold farm-theme styling (removes uppercase, pixel borders, heavy shadows, black borders)
