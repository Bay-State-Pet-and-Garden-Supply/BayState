# Admin Products Page & Modal Redesign Plan

## Objective
Redesign the `AdminProductsClient` and `ProductEditModal` using the strict Shadcn Web Design Guidelines and centered around the finalized `products` table schema. The user has chosen a **Card Grid + Tabbed Modal** layout to preserve visual product representation while dramatically improving the edit experience.

## Scope & Impact
- **`AdminProductsClient.tsx`**: Update layout spacing (`gap-*` over `space-y-*`), use semantic colors, refine the card display, and improve the filtering controls using a `ToggleGroup` or structured `Select`.
- **`ProductEditModal.tsx`**: Completely rewrite from scratch. Transform the massive, overwhelming 2-column scrollable form into an organized, tab-based layout inside a fixed-size `Dialog`.

## Finalized Schema Alignment (`products` table)
Ensure all essential fields are covered. Added previously missing fields: `quantity`, `low_stock_threshold`, and `published_at`.

### Tab Structure for Modal:
1. **General**: Name, Slug, Description, Long Description, ShopSite Pages
2. **Pricing & Inventory**: Price, SKU, GTIN, Quantity, Low Stock Threshold, Min Quantity, Weight, Availability, Stock Status
3. **Taxonomy & Meta**: Brand, Category, Product Type, Search Keywords, Pet Types (Relation)
4. **Settings**: Special Order, Taxable, Published At
5. **Media**: Images (Read-only preview grid)

## Implementation Steps

### 1. `ProductEditModal.tsx` Rewrite
- **Replace Root Form Layout**: Remove all `space-y-*` classes and arbitrary `div` groups. Use `<FieldGroup>` and `<Field>` for all inputs according to Shadcn rules.
- **Tab Navigation**: Introduce `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent`. The `TabsList` will go below the `DialogHeader`.
- **Input Refactoring**:
  - Convert checkboxes to `<Checkbox>` paired with `<FieldLabel>` inside a `<Field>`.
  - Use `Select` for enum-like fields (Availability, Stock Status).
  - Add missing fields (`quantity`, `low_stock_threshold`).
- **Styling**: Ensure `gap-4` or `gap-6` is used for spacing, `size-*` for equal dimensions, and no raw colors are used.
- **Action Footer**: Keep "Cancel" and "Save Product" at the bottom of the Dialog, persistent outside the Tabs.

### 2. `AdminProductsClient.tsx` Enhancements
- **Toolbar & Filters**: 
  - Ensure filters wrap nicely and use `gap-4` flex containers.
  - Convert basic span/div tags with inline styling to `Badge` or semantic elements.
- **Card Grid**: 
  - Adjust Card internal padding using `gap-*`.
  - Display `quantity` or `stock_status` cleanly with a `Badge`.
  - Ensure the fallback Empty state utilizes the standard `<Empty>` component pattern.

## Verification
- Confirm that tabbing between sections does not reset or lose unsaved state.
- Validate that all required properties of the `products` table map properly to the update action payload.
- Ensure zero console warnings regarding unclosed elements, invalid `for`/`htmlFor` props, or missing keys.
- Run UI check against Shadcn guidelines (`space-y-*` vs `gap-*`, `w-4 h-4` vs `size-4`, semantic tokens).