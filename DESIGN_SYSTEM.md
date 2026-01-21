# Design System Guide

This guide documents the spacing and layout standards for the Bay State Pet & Garden Supply application. Following these rules ensures consistency across the Admin Portal and Customer Storefront.

## Spacing Rules

### Form Spacing
Forms should follow a consistent vertical rhythm to ensure readability and scannability.

- **Container Spacing**: Use `space-y-6` for the main form container. This provides adequate separation between major sections of the form.
  ```tsx
  <form className="space-y-6">
    {/* Form content */}
  </form>
  ```

- **Field Group Spacing**: Use `space-y-2` for individual field groups (Label + Input + Error Message). This keeps related elements visually connected.
  ```tsx
  <div className="space-y-2">
    <Label>Email</Label>
    <Input />
    <p className="text-sm text-red-500">Error message</p>
  </div>
  ```

### Action Bar Spacing
Action bars (containers with buttons, filters, or search inputs) should use consistent spacing between elements.

- **Element Gap**: Use `gap-4` for horizontal spacing between action items.
  ```tsx
  <div className="flex items-center gap-4">
    <Button variant="outline">Cancel</Button>
    <Button>Save Changes</Button>
  </div>
  ```

## Component Updates
The following components have been updated to adhere to these spacing rules:

### Forms
- `components/account/pet-form.tsx`
- `app/admin/promotions/promotions-client.tsx`
- `app/admin/products/[id]/edit/page.tsx`
- `components/admin/products/ProductEditModal.tsx`
- `components/admin/scrapers/editor/GlobalSettings.tsx`
- `components/admin/scrapers/editor/ActionCard.tsx`
- `app/admin/design/branding-tab.tsx`
- `app/admin/design/homepage-tab.tsx`
- `app/admin/settings/campaign-banner-form.tsx`

### Action Bars & Grids
- `app/admin/promotions/promotions-client.tsx`
- `app/admin/design/branding-tab.tsx`
- `app/admin/design/homepage-tab.tsx`
- `app/admin/design/banners-tab.tsx`
- `app/admin/products/[id]/images/page.tsx`
- `app/admin/products/[id]/variants/page.tsx`
- `components/admin/products/images/ProductImagesClient.tsx`
- `components/admin/products/variants/ProductVariantsClient.tsx`
- `components/storefront/cart-preorder-summary.tsx`

## Usage Checklist
When creating new components or refactoring existing ones:

- [ ] Does the form container use `space-y-6`?
- [ ] Do field groups use `space-y-2`?
- [ ] Do action bars and grids use `gap-4`?
- [ ] Is the spacing consistent on mobile and desktop?

For any questions or exceptions, please refer to Issue #68.

## Iconography Standards
We use `lucide-react` for all icons. Icons should be consistent in size and color based on their context.

### Standard Icons
Use these specific icons for common semantic meanings to maintain consistency across the application.

| Meaning | Icon | Component Name | Usage Context |
|---------|------|----------------|---------------|
| **Success** | ![CheckCircle](https://lucide.dev/icons/check-circle) | `CheckCircle` | Operation success, completed steps, verified items |
| **Error** | ![AlertCircle](https://lucide.dev/icons/alert-circle) | `AlertCircle` | Form errors, critical alerts, destructive actions |
| **Warning** | ![AlertTriangle](https://lucide.dev/icons/alert-triangle) | `AlertTriangle` | Non-blocking issues, attention needed, cautionary info |
| **Info** | ![Info](https://lucide.dev/icons/info) | `Info` | Tooltips, help text, neutral system messages |
| **Loading** | ![Loader2](https://lucide.dev/icons/loader-2) | `Loader2` | Async operations, data fetching. **Must animate with `animate-spin`** |

### Standard Colors
Use these Tailwind utility classes for semantic feedback. Do not use arbitrary hex codes.

- **Success**: `text-green-600` (e.g., success messages, completed status)
- **Error**: `text-red-600` (e.g., validation errors, delete actions)
- **Warning**: `text-amber-600` (e.g., pending states, alerts)
- **Info/Brand**: `text-blue-600` (e.g., primary links, informational icons)

### Usage Guidelines

#### Form Validation
Use `AlertCircle` with `text-red-600` for inline form errors.
```tsx
<div className="flex items-center gap-2 text-red-600">
  <AlertCircle className="h-4 w-4" />
  <span className="text-sm">This field is required</span>
</div>
```

#### Empty States
Use muted colors (e.g., `text-gray-400`) for empty state icons, typically sized `h-10 w-10` or larger.

#### Loading States
Always use `Loader2` with the `animate-spin` class.
```tsx
<Loader2 className="h-4 w-4 animate-spin" />
```

#### Toasts & Notifications
- **Success Toasts**: Use `CheckCircle`
- **Error Toasts**: Use `XCircle` or `AlertCircle`

## Help Text Standards
Help text provides context or instructions for form fields and UI elements.

### Standard Styling
Use the standard typography and color classes for help text to ensure consistency and readability.

- **Class**: `text-sm text-muted-foreground`
- **Spacing**: Typically placed below the input field with `mt-1` or inside a `space-y-2` container.

```tsx
<p className="text-sm text-muted-foreground">
  Enter the unique SKU for this product (e.g., PROD-123).
</p>
```

### Accessibility Rule
Always link help text to its corresponding input using `aria-describedby`. This ensures screen readers announce the help text when the input is focused.

1. Assign an `id` to the help text element.
2. Add `aria-describedby="{help-text-id}"` to the input element.

```tsx
<div className="space-y-2">
  <Label htmlFor="sku">SKU</Label>
  <Input 
    id="sku" 
    aria-describedby="sku-help" 
  />
  <p id="sku-help" className="text-sm text-muted-foreground">
    Enter the unique SKU for this product.
  </p>
</div>
```

### Usage Guidelines

| Component | When to Use | Example |
|-----------|-------------|---------|
| **Help Text** | Use for essential instructions, formatting requirements, or context that should be always visible. | "Password must be at least 8 characters." |
| **Tooltip** | Use for optional explanations, definitions of terms, or when space is limited. Information is hidden until requested. | (i) icon explaining what "SEO Slug" means. |

- **Do not** use help text for validation errors. Use the Error style (`text-red-600`) for that.
- **Do not** hide critical instructions inside a tooltip.

## Date Formatting Standards

We enforce a consistent date format across the application to ensure clarity and professionalism.

### Standard Format
Dates should be displayed in the format: **"MMM D, YYYY"** (e.g., "Jan 15, 2026").
- **Month**: Short (3 letters)
- **Day**: Numeric
- **Year**: Numeric (4 digits)

### Utility Function
Use the `formatDate` utility from `lib/utils.ts` to ensure consistency. Do not manually format dates.

```tsx
import { formatDate } from "@/lib/utils"

// Usage
<span>{formatDate(order.created_at)}</span>
// Output: "Jan 15, 2026"
```

### Usage Guidelines
1. **Always use `formatDate`**: Avoid `toLocaleDateString()` or external libraries like `date-fns` for simple display unless complex manipulation is required.
2. **Consistency**: Ensure this format is used for Order Dates, Created Dates, and Last Updated timestamps in both the Admin Portal and Customer Storefront.
3. **Exceptions**: Relative time (e.g., "2 hours ago") may be used for recent activity feeds where exact precision is less critical.

## Order Status Badge Standards

We use the `StatusBadge` component to display the status of orders in a consistent and visually distinct manner. This ensures users can quickly scan and identify order states.

### Component Usage

Import and use the `StatusBadge` component from `@/components/ui/status-badge`.

```tsx
import { StatusBadge } from "@/components/ui/status-badge"

// Basic Usage
<StatusBadge status={order.status} />

// Without Icon
<StatusBadge status={order.status} showIcon={false} />

// Custom Styling
<StatusBadge status={order.status} className="h-6 text-xs" />
```

### Color Mapping Rules

Each status corresponds to a specific semantic color and icon to convey its meaning clearly.

| Status | Color Theme | Icon | Meaning |
|--------|-------------|------|---------|
| **Pending** | `yellow` (bg-yellow-100 text-yellow-800) | `Clock` | Order received, awaiting action |
| **Processing** | `blue` (bg-blue-100 text-blue-800) | `Package` | Being packed or prepared |
| **Ready** | `green` (bg-green-100 text-green-800) | `ShoppingBag` | Ready for pickup/shipment |
| **Completed** | `gray` (bg-gray-100 text-gray-800) | `CheckCircle` | Order fulfilled and closed |
| **Cancelled** | `red` (bg-red-100 text-red-800) | `XCircle` | Order cancelled |
| **Refunded** | `purple` (bg-purple-100 text-purple-800) | `RefreshCcw` | Payment returned |

### Usage Guidelines

1. **Always use StatusBadge**: Do not manually create badges for order statuses using the generic `Badge` component. This ensures color consistency if themes change.
2. **Case Insensitivity**: The component handles normalization, so "Pending", "pending", and "PENDING" will all render correctly.
3. **Unknown Statuses**: If a status is passed that doesn't match the defined list, it defaults to a Gray style with a Clock icon.

## Pagination Standards

We use the `Pagination` component for navigating large sets of content, particularly in the Customer Storefront.

### Component Usage

Import the pagination primitives from `@/components/ui/pagination`. This component follows a compound component pattern.

```tsx
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export function ProductPagination({ currentPage, totalPages }: Props) {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href={`?page=${currentPage - 1}`} />
        </PaginationItem>
        
        {/* Page Links */}
        <PaginationItem>
          <PaginationLink href="?page=1" isActive={currentPage === 1}>
            1
          </PaginationLink>
        </PaginationItem>
        
        {totalPages > 5 && (
            <PaginationItem>
                <PaginationEllipsis />
            </PaginationItem>
        )}

        <PaginationItem>
          <PaginationNext href={`?page=${currentPage + 1}`} />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
```

### When to Use

- **Storefront Lists**: Product search results, category pages, and brand lists where SEO is important (using `href` links).
- **Large Data Sets**: Content exceeding 20 items where "Load More" or infinite scroll might hinder footer access.
- **Specific Navigation**: When users may need to jump to a specific section of results.

### Distinction from Data Table

We have two distinct pagination patterns:

1. **Storefront Pagination (`components/ui/pagination`)**
   - **Visuals**: Shows specific page numbers (1, 2, 3...) and ellipses.
   - **Interaction**: Typically link-based (`<a>` tags) for SEO.
   - **Use Case**: Public-facing browsing.

2. **Data Table Pagination (`components/admin/data-table`)**
   - **Visuals**: "Page X of Y" text with simple First/Prev/Next/Last controls. Includes "Rows per page" selector.
   - **Interaction**: Button-based state updates (Client-side or Server Action).
   - **Use Case**: Admin portal management tables.

**Rule**: Use `Pagination` for the Storefront. Use the built-in `DataTable` controls for the Admin Portal.

## Opacity Usage Standards

To ensure accessibility and consistent visual weight, we strictly control how opacity is applied.

### Text Opacity
**Rule**: Avoid applying opacity to text colors (e.g., `text-black/50`).
- **Why**: Opacity changes the effective contrast ratio depending on the background, leading to potential accessibility failures.
- **Standard**: Use `text-muted-foreground` for secondary text.

```tsx
// ❌ Avoid
<span className="text-slate-900/60">...</span>

// ✅ Use
<span className="text-muted-foreground">...</span>
```

### Disabled States
**Rule**: Use the `disabled:` modifier for state-based opacity changes.
- **Standard**: Apply `disabled:opacity-50` to interactive elements.

```tsx
// ❌ Avoid
<Button className={isDisabled ? "opacity-50" : ""}>...</Button>

// ✅ Use
<Button className="disabled:opacity-50">...</Button>
```

### Visual Effects
**Rule**: Opacity usage is permitted for:
1. **Transitions**: `hover:opacity-80` for interactive feedback.
2. **Overlays**: `bg-background/80` or `bg-black/50` for modal backdrops.
3. **Animations**: Fade-in/fade-out effects.

## Skeleton Usage Standards

We use the `Skeleton` component to provide loading feedback that mimics the structure of the content being loaded. This reduces layout shift and improves perceived performance.

### Component Usage

Import the `Skeleton` primitive from `@/components/ui/skeleton`.

```tsx
import { Skeleton } from "@/components/ui/skeleton"

function MyComponentLoading() {
  return (
    <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  )
}
```

### Guidelines for Matching Content

1. **Match Dimensions**: Skeleton elements should roughly match the `height` and `width` of the content they replace.
2. **Match Layout**: Use the same layout containers (flex, grid, padding) as the actual component to prevent layout shift when content loads.
3. **Composition**: Build complex skeletons (like cards) by composing multiple `Skeleton` primitives.
4. **Animation**: The `Skeleton` component comes with a built-in `animate-pulse` effect. Do not add extra animation classes.

### Available Skeletons

We provide pre-built skeletons for common UI patterns. Use these instead of building custom ones when possible.

| Component | Import Path | Usage Context |
|-----------|-------------|---------------|
| **ProductCardSkeleton** | `@/components/storefront/skeletons/product-card-skeleton` | Loading state for product grids in the storefront. |
| **BrandCardSkeleton** | `@/components/storefront/skeletons/brand-card-skeleton` | Loading state for brand lists. |
| **DataTableSkeleton** | `@/components/admin/skeletons/data-table-skeleton` | Loading state for admin data tables. Supports custom row/column counts. |

```tsx
// Example: Using DataTableSkeleton
<Suspense fallback={<DataTableSkeleton columnCount={5} rowCount={10} />}>
  <ProductTable />
</Suspense>
```

## Price Formatting Standards

We enforce a consistent price format across the application to ensure clarity and trust.

### Standard Format
Prices should be displayed in the format: **"$XX.XX"** (e.g., "$10.50", "$1,200.00").
- **Currency Symbol**: "$" (USD)
- **Decimal Places**: Always 2 decimal places, even for whole numbers (e.g., "$10.00" not "$10")
- **Thousands Separator**: Comma (e.g., "$1,000.00")

### Utility Function
Use the `formatCurrency` utility from `lib/utils.ts` to ensure consistency. Do not manually format prices.

```tsx
import { formatCurrency } from "@/lib/utils"

// Basic Usage
<span>{formatCurrency(product.price)}</span>
// Output: "$19.99"

// Handling Zero Value (Free)
<span>{formatCurrency(0, { showFree: true })}</span>
// Output: "FREE"
```

### Usage Guidelines
1. **Always use `formatCurrency`**: Avoid `toFixed(2)` or manual string concatenation.
2. **Handle Null/Undefined**: Ensure the value passed is a number or a string that can be parsed. Default to 0 if necessary.
   ```tsx
   {formatCurrency(product.price || 0)}
   ```
3. **Consistent Styling**: Prices are typically displayed in `font-medium` or `font-semibold`. Discounts or original prices (strikethrough) should use `line-through text-muted-foreground`.
   ```tsx
   <div className="flex items-baseline gap-2">
     <span className="font-semibold">{formatCurrency(salePrice)}</span>
     <span className="text-sm text-muted-foreground line-through">{formatCurrency(originalPrice)}</span>
   </div>
   ```

## Link Styling Standards

We enforce consistent link styling to ensure accessibility and usability across the application.

### Standard Usage
Links should consistently use `hover:underline` with `underline-offset-4`. This provides clear interactive feedback while maintaining a clean aesthetic.

### WCAG Reasoning
**Do not rely on color alone** to distinguish links from surrounding text.
- **Why**: Users with color blindness or low vision may not perceive color differences. Underlining links (especially on hover) provides a secondary visual cue that is universally understood.
- **Standard**: Always combine color changes with structural changes (like underlining) for interactive states.

### Code Examples

#### Basic Text Link
```tsx
<Link href="/products" className="hover:underline underline-offset-4">
  Shop Now
</Link>
```

#### Navigation Link
```tsx
<Link 
  href="/about" 
  className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-4"
>
  About Us
</Link>
```

#### Footer Link
```tsx
<Link 
  href="/privacy" 
  className="text-sm text-zinc-700 hover:text-zinc-900 hover:underline underline-offset-4"
>
  Privacy Policy
</Link>
```

## Toast Notification Standards

We use the `sonner` library to provide non-blocking feedback for user actions.

### Standard Configuration

To ensure users have enough time to read messages, we enforce the following defaults:

- **Duration**: **5000ms** (5 seconds).
- **Dismissible**: **Required**. Users must be able to manually close the toast via a close button.

### Global Implementation

The `Toaster` component in `app/layout.tsx` is configured to enforce these standards.

```tsx
<Toaster duration={5000} closeButton />
```

### Usage Examples

Import `toast` from `sonner` to trigger notifications.

```tsx
import { toast } from "sonner"

// Success Notification
toast.success("Changes saved successfully")

// Error Notification
toast.error("Failed to update profile", {
  description: "Please check your connection and try again."
})

// Action Notification
toast.info("File deleted", {
  action: {
    label: "Undo",
    onClick: () => restoreFile(),
  },
})
```

### Usage Guidelines

1. **Be Concise**: Keep messages short (under 40 characters) when possible. Use the `description` prop for details.
2. **Use Semantic Types**:
   - `toast.success` for successful actions.
   - `toast.error` for failures.
   - `toast.info` for neutral information.
   - `toast.warning` for non-critical issues.
3. **Avoid Overuse**: Do not use toasts for validation errors on visible form fields (use inline errors instead).

## Product Card Standards

Product cards are the primary way users interact with inventory. They must be consistent in layout, sizing, and information hierarchy.

### Standard Layout

- **Aspect Ratio**: Images must use `aspect-square` (1:1) to ensure grid uniformity.
- **Card Styling**: Use `h-full` to ensure cards in the same row align in height. Add `hover:shadow-lg` and `hover:border-zinc-300` for interactivity.
- **Content Padding**: Use `p-4` for the content area.

### Information Hierarchy

1. **Brand**: (Optional) `text-xs font-medium uppercase tracking-wider text-zinc-500`
2. **Product Name**: `text-sm font-semibold leading-tight`, clamped to 2 lines (`line-clamp-2`)
3. **Price**: `text-lg font-bold tracking-tight`, pushed to the bottom (`mt-auto`)

### Badging Rules

Status badges overlay the product image in the top-left corner.

- **Placement**: Absolute positioned at `top-3 left-3`.
- **Spacing**: Stacked vertically with `gap-1.5`.
- **Styles**:
  - **Out of Stock**: `bg-rose-500` (Destructive variant)
  - **Pre-Order**: `bg-amber-100 text-amber-800` (Secondary variant)

### Code Example

```tsx
export function ProductCard({ product }: ProductCardProps) {
  return (
    <div className="group relative h-full">
      <Link href={`/products/${product.slug}`} className="block h-full">
        <Card className="h-full overflow-hidden hover:shadow-lg transition-all">
          <CardContent className="flex h-full flex-col p-0">
            {/* Image Container */}
            <div className="relative aspect-square w-full bg-zinc-50">
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform"
              />
              
              {/* Badges */}
              <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                {product.isOutOfStock && (
                  <Badge className="bg-rose-500">Out of Stock</Badge>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col p-4">
              <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
                {product.brand}
              </p>
              <h3 className="mb-2 line-clamp-2 text-sm font-semibold">
                {product.name}
              </h3>
              <div className="mt-auto">
                <span className="text-lg font-bold">
                  {formatCurrency(product.price)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
```

## Empty State Standards

Empty states occur when there is no data to display. They should be helpful, explaining *why* there is no data and *what* to do next.

### Standard Layout

We use a consistent "dashed border" card layout for empty states to distinguish them from active content.

- **Container**: `flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-zinc-200 rounded-lg bg-zinc-50/50`
- **Icon**: Centered in a circle (`bg-zinc-100`), sized `h-10 w-10 text-zinc-400`.
- **Typography**:
  - Title: `text-xl font-bold tracking-tight text-zinc-900`
  - Description: `text-zinc-600` (max-width constrained)
- **Action**: Primary button (`size="lg"`) encouraging the user to add content.

### Component Usage

Import the `EmptyState` component from `@/components/ui/empty-state`.

#### Props
- `icon` (LucideIcon): The icon to display.
- `title` (string): The main heading (e.g., "No products found").
- `description` (string): Helpful context (e.g., "Get started by creating your first product.").
- `actionLabel` (string): Text for the CTA button.
- `actionHref` (string, optional): URL for navigation (renders as Link).
- `onAction` (function, optional): Handler for click events (renders as Button).

### Code Example

```tsx
import { Package, PlusCircle } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

// Navigation Action (Link)
export function ProductListEmpty() {
  return (
    <EmptyState
      icon={Package}
      title="No products found"
      description="You haven't added any products to your inventory yet."
      actionLabel="Add Product"
      actionHref="/admin/products/new"
    />
  )
}

// Click Action (Button)
export function VariantListEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon={PlusCircle}
      title="No variants defined"
      description="Create variants (e.g., Size, Color) for this product."
      actionLabel="Create Variant"
      onAction={onCreate}
    />
  )
}
```

## Badge Standards

Badges are used to highlight status, attributes, or categories. They provide quick visual cues to help users scan information.

### Component Usage

Import the `Badge` component from `@/components/ui/badge`.

```tsx
import { Badge } from "@/components/ui/badge"

// Default (Primary)
<Badge>New</Badge>

// Variants
<Badge variant="secondary">Draft</Badge>
<Badge variant="destructive">Removed</Badge>
<Badge variant="success">Completed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="outline">Tag</Badge>
```

### Available Variants

| Variant | Visual Style | Usage Context |
|---------|--------------|---------------|
| **default** | Primary color filled | Primary emphasis, active states, important labels |
| **secondary** | Secondary color filled | Neutral states, lower emphasis tags |
| **destructive** | Red filled | Critical errors, removed items, failed states |
| **success** | Green filled | Successful operations, completed tasks, "In Stock" |
| **warning** | Yellow filled | Pending actions, warnings, "Low Stock" |
| **outline** | Border only | Static tags, categories, filters |

### Usage Guidelines

#### Status vs. Label

*   **Status Indicators**: Use colored variants (`success`, `warning`, `destructive`, `default`) to indicate the dynamic state of an object (e.g., Order Status, Stock Level).
    *   *Example*: A "Shipped" order gets a `success` badge.
*   **Labels & Categories**: Use `secondary` or `outline` variants for static attributes or categories that don't imply a process or health state.
    *   *Example*: A product category "Dog Food" gets an `outline` badge.

#### Best Practices

*   **Conciseness**: Keep badge text short (1-2 words).
*   **Consistency**: Use the same variant for the same state across the application.
*   **Interactivity**: Badges are generally static. If a badge is clickable (like a filter), ensure it has a hover state (handled by the component) and is clearly interactive.

## Modal & Dialog Standards

Modals (Dialogs) are used for critical interactions that require user focus, such as editing details, confirming actions, or displaying complex information without leaving the current context.

### Standard Structure

A standard modal consists of three distinct sections:

1.  **Header**: Contains the `DialogTitle` and optional `DialogDescription`.
2.  **Body**: The main content area (forms, details, etc.).
3.  **Footer**: Action buttons aligned to the right.

### Component Usage

Import the Dialog primitives from `@/components/ui/dialog`.

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function MyModal({ open, onOpenChange }: MyModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        
        {/* Modal Body */}
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label>Name</label>
            <input className="w-full border rounded p-2" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### Close Button Requirement

The `DialogContent` component includes a built-in "X" close button in the top-right corner by default.

*   **Requirement**: Never hide this button unless strictly necessary for a blocking flow (e.g., forced acceptance).
*   **Accessibility**: The close button is accessible via keyboard (Tab) and screen readers.
*   **Implementation**: This is handled automatically by `DialogContent`. Do not add a manual "X" button inside the header.

### Footer Actions

*   **Alignment**: Actions should be aligned to the **right** on desktop.
*   **Order**:
    1.  **Cancel/Secondary**: Left side of the group (`variant="outline"`).
    2.  **Confirm/Primary**: Right side of the group (`variant="default"` or `variant="destructive"`).
*   **Responsive Behavior**: The `DialogFooter` component automatically handles stacking on mobile devices (`flex-col-reverse`), ensuring the primary action is easily accessible.

### Usage Guidelines

1.  **Scrolling**: If the content exceeds the viewport height, the `DialogContent` should handle scrolling.
2.  **Click Outside**: Clicking the overlay (backdrop) should close the modal (default behavior).
3.  **Shortcuts**: Support `Esc` to close (default) and `Cmd+S` / `Ctrl+S` for saving forms when appropriate.

