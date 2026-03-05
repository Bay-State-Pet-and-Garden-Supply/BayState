# Data Table UX Improvements

This document outlines the UX improvements made to the `DataTable` component, specifically focusing on interaction patterns, accessibility, and developer usage. This addresses [Issue #72].

## 1. Sorting Interaction Pattern

The data table now implements a clear, intuitive sorting mechanism using interactive column headers.

### Interaction Design
- **Clickable Headers**: Column headers that support sorting are now interactive buttons (`variant="ghost"`).
- **Three-State Toggle**: Clicking a header cycles through three states:
  1. **Ascending** (`asc`): Sorts A to Z or 0 to 9.
  2. **Descending** (`desc`): Sorts Z to A or 9 to 0.
  3. **Unsorted** (null): Returns to original order.

### Visual Indicators
We use specific icons to communicate sort state clearly:
- **Unsorted**: `<ChevronsUpDown />` (muted color) indicates the column is sortable but not currently active.
- **Ascending**: `<ChevronUp />` (active color) indicates ascending sort order.
- **Descending**: `<ChevronDown />` (active color) indicates descending sort order.

## 2. Accessibility Improvements

The table has been enhanced to support keyboard navigation and screen readers better.

### Semantic Structure
- Uses standard HTML `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, and `<td>` elements via `shadcn/ui` primitives.
- Sortable headers are buttons, making them focusable and actionable via keyboard (Enter/Space).

### ARIA Attributes
- **Selection Checkboxes**: 
  - "Select all" checkbox includes `aria-label="Select all"`.
  - Row checkboxes include `aria-label="Select row {id}"`.
- **Indeterminate State**: The "Select all" checkbox correctly reflects the indeterminate state (via JavaScript property) when only some rows are selected, giving visual feedback to users.

### Keyboard Navigation
- **Tab Order**: Users can tab through sortable headers, search inputs, pagination controls, and row selection checkboxes.
- **Focus Indicators**: All interactive elements (buttons, inputs, checkboxes) maintain visible focus states.

## 3. Developer Guide: Using `DataTable`

To get these features automatically, simply use the `DataTable` component and configure your columns correctly.

### Basic Implementation

```tsx
import { DataTable, type Column } from '@/components/admin/data-table';

// 1. Define your data type
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

// 2. Define columns
const columns: Column<Product>[] = [
  {
    key: 'name',
    header: 'Product Name',
    sortable: true, // Enables the new sorting UI automatically
    searchable: true // Includes this column in the search filter
  },
  {
    key: 'price',
    header: 'Price',
    sortable: true,
    render: (value) => `$${Number(value).toFixed(2)}`
  },
  {
    key: 'category',
    header: 'Category',
    // Non-sortable column
  }
];

// 3. Render the component
export default function ProductList({ data }) {
  return (
    <DataTable 
      data={data} 
      columns={columns} 
      searchPlaceholder="Filter products..."
      selectable={true}
      pageSize={10}
    />
  );
}
```

### Key Props for UX Features

| Prop | Type | Description |
|------|------|-------------|
| `columns` | `Column<T>[]` | Definitions for table columns. Set `sortable: true` on column objects to enable the sorting UI. |
| `selectable` | `boolean` | Enables/disables the checkbox selection column. |
| `searchPlaceholder` | `string` | Custom placeholder for the search input. |
| `pageSizeOptions` | `number[]` | Options for the "Rows per page" dropdown (default: `[10, 20, 50, 100]`). |

### Column Configuration Interface

```typescript
export interface Column<T> {
  key: string;      // Property path in data object (supports dot notation like 'brand.name')
  header: string;   // Display title
  sortable?: boolean; // Toggles sorting button UI
  searchable?: boolean; // Toggles inclusion in search filter
  render?: (value: unknown, row: T) => React.ReactNode; // Custom cell rendering
  className?: string; // Custom cell styling
}
```
