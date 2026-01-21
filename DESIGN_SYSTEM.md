## Inline Styles

We enforce the use of Tailwind CSS utility classes over inline styles to maintain a consistent design system and ensure compatibility with features like Dark Mode and RTL.

### Rule

**Do not use static inline styles** (e.g., `style={{ color: 'red', padding: '10px' }}`).

### Why?

1.  **Theme Compatibility**: Inline styles bypass Tailwind's `dark:` modifier and CSS variables. If you hardcode a color or spacing inline, it won't adapt to theme changes.
2.  **Maintainability**: Inline styles are scattered and hard to find/audit. Tailwind classes are co-located with the component and can be grepped or linted.
3.  **Consistency**: Hardcoded values lead to visual inconsistencies across the application.

### Standard

Use Tailwind utility classes for all static styling needs.

```tsx
// ❌ Avoid
<div style={{ padding: '1rem', color: '#333' }}>Content</div>

// ✅ Use
<div className="p-4 text-zinc-800">Content</div>
```

### Exception: Dynamic Values

Inline styles are **permitted** for values that cannot be determined at build time. This includes:

-   **Calculated Dimensions**: `style={{ width: \`${progress}%\` }}`
-   **Dynamic Colors**: `style={{ backgroundColor: userSelectedColor }}`
-   **Positions**: `style={{ left: mouseX, top: mouseY }}`

**Note**: Even for dynamic colors, prefer using Tailwind arbitrary values with CSS variables when possible (e.g., `style={{ backgroundColor: 'var(--color-brand)' }}`).

For any questions or exceptions, please refer to Issue #47.

## Form Spacing Standards

We enforce consistent vertical rhythm in forms to ensure readability and scannability.

### Standard Spacing Scale

- **Form Container**: `space-y-6`
- **Field Group (Label + Input + Error)**: `space-y-2`
- **Action Row**: `flex gap-4` with `pt-4` or `pt-6` for separation from form fields

### Code Examples

```tsx
// Form Container
<form className="space-y-6">
  {/* Section */}
  <div className="space-y-2">
    <Label>Email</Label>
    <Input />
    <FormMessage />
  </div>

  {/* Action Row */}
  <div className="flex gap-4 pt-2">
    <Button type="submit">Save</Button>
    <Button variant="outline" type="button">Cancel</Button>
  </div>
</form>
```

## Error Message Standards

We use consistent styling for inline form errors and error alerts.

### Inline Form Errors

Use the `FormMessage` component for field-level validation errors.

- **Style**: `text-destructive text-sm` (handled by `components/ui/form.tsx`)
- **Accessibility**: Automatically linked via `aria-describedby`

```tsx
<FormField
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormMessage /> {/* Renders: text-destructive text-sm */}
    </FormItem>
  )}
/>
```

### Error Alerts / Banners

For form-level or block-level errors:

- **Style**: `rounded-md bg-red-50 p-4 text-sm text-red-600`
- **Icon**: Optional `AlertCircle` or `XCircle`

```tsx
<div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
  <div className="flex gap-2">
    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
    <span>Something went wrong. Please try again.</span>
  </div>
</div>
```

## Loading State Feedback Standards

We provide clear feedback when forms are submitting to prevent duplicate submissions.

### Submit Button States

- **Default**: Show label (e.g., "Save Changes")
- **Loading**: Show spinner + disabled + loading label (e.g., "Saving...")

### Code Example

```tsx
<Button type="submit" disabled={loading}>
  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  {loading ? 'Saving...' : 'Save Changes'}
</Button>
```

### Key Principles

1. **Disable submit button** while pending to prevent double-submit
2. **Use spinner icon** (`Loader2 animate-spin`) to indicate progress
3. **Keep button width stable** - don't change between states
4. **Provide toast feedback** after completion (success or error)

For any questions or exceptions, please refer to Issues #39, #43, #45.

## Button Text Capitalization

We use **Title Case** for button labels to ensure clarity and consistency.

### Standard

- **Multi-word labels**: Capitalize first letter of each word
  - ✅ "Save Changes", "Add to Cart", "Create Product"
  - ❌ "Save changes", "add to cart", "create PRODUCT"

- **Single words**: Capitalize first letter
  - ✅ "Submit", "Cancel", "Delete", "Edit"

### Examples

| Context | Correct | Incorrect |
|---------|---------|-----------|
| Primary action | "Save Changes" | "Save changes" |
| Navigation | "View Details" | "View details" |
| Destructive | "Delete Item" | "delete item" |
| Single word | "Cancel" | "cancel" |

### Code Example

```tsx
<Button type="submit">Save Changes</Button>
<Button variant="outline">Cancel</Button>
<Button variant="destructive">Delete Item</Button>
```

For any questions or exceptions, please refer to Issue #41.