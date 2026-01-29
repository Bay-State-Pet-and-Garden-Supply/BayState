# Confirmation Dialog UX Improvements

This document outlines the standardized pattern for handling destructive actions within the Admin Portal using the `AlertDialog` component. This ensures a consistent, safe, and accessible user experience when performing irreversible operations.

## 1. The `AlertDialog` Pattern

We use the shadcn/ui `AlertDialog` component to interrupt the user workflow for confirmation before executing destructive actions (like deletion). This pattern prevents accidental data loss and provides clear context about the action being performed.

### Key Characteristics
- **Modal Interruption**: Blocks interaction with the rest of the application until resolved.
- **Destructive styling**: The confirmation action uses `variant="destructive"` or red styling to indicate danger.
- **Clear Context**: The description explicitly states *what* is being deleted (e.g., "Are you sure you want to delete 'Brand Name'?").
- **Asynchronous Handling**: The UI handles the async nature of the deletion, often with loading states (though the current implementation relies on the parent component's state or optimistically updates).

### Usage Example

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="sm" className="text-red-600">
      <Trash2 className="h-4 w-4" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Item</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete "{itemName}"? This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleDelete}
        className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## 2. Updated Components

The following components have been updated to use the `AlertDialog` pattern for delete operations:

| Component | Location | Actions Covered |
|-----------|----------|-----------------|
| `BrandsDataTable` | `app/admin/brands/brands-data-table.tsx` | • Single Brand Delete<br>• Bulk Brand Delete |
| `ServicesDataTable` | `app/admin/services/services-data-table.tsx` | • Single Service Delete |

**Note**: Both components handle single item deletion within the row actions and bulk deletion (if supported/implemented) via the table header or selection bar.

## 3. Developer Guidelines

When implementing destructive actions in the future, follow these guidelines:

1.  **Always use `AlertDialog`**: Never perform a destructive action (DELETE) immediately upon a button click without confirmation.
2.  **Specific Descriptions**:
    *   **Good**: "Are you sure you want to delete 'Acme Corp'?"
    *   **Bad**: "Are you sure?"
3.  **Visual Indication**: Use red colors (`text-red-600`, `bg-red-600`) for the trigger (if it's a trash icon) and the confirmation button.
4.  **Bulk Actions**: For bulk operations, indicate the *count* of items being affected (e.g., "Delete 5 items").
5.  **Feedback**: Always provide toast feedback (`toast.success` or `toast.error`) after the action completes.
6.  **Optimistic UI / Refresh**: Ensure the UI updates immediately or calls `router.refresh()` to reflect the change.
7.  **Accessibility**:
    *   Use `asChild` on the Trigger if wrapping a custom Button.
    *   Ensure focus management works (handled by Radix UI primitive).

### Implementation Checklist
- [ ] Import `AlertDialog` components from `@/components/ui/alert-dialog`.
- [ ] Wrap the destructive button in `AlertDialog` > `AlertDialogTrigger`.
- [ ] Provide a descriptive `AlertDialogTitle` and `AlertDialogDescription`.
- [ ] Put the actual async delete logic in the `onClick` handler of `AlertDialogAction`.
- [ ] Verify toast notifications appear.
