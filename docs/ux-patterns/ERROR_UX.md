# Error Recovery UX Standards

**Context:** Standardized error handling patterns across the application to ensure graceful degradation and user recovery.

## 1. Standard Error Page Layout

All error pages follow a unified visual hierarchy designed to reduce user frustration and provide clear recovery paths.

### Core Layout Components
- **Container**: Centered content with minimum height (`min-h-[60vh]` or `70vh`).
- **Animation**: Gentle entry animation (`animate-in fade-in slide-in-from-bottom-4 duration-500`).
- **Visual Indicator**: Large icon in a colored circular container with a ring border.
- **Typography**:
  - **Header**: `text-2xl` or `3xl`, bold, tight tracking.
  - **Body**: `text-muted-foreground`, max-width constraints (450-500px) for readability.
- **Action Area**: Flex container with primary (Reset) and secondary (Navigation) buttons.
- **Diagnostics**: Conditional display of `error.digest` for technical support.

### Component Structure
```tsx
<div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
  {/* 1. Visual Indicator */}
  <div className="mb-6 rounded-full bg-[color]-50 p-4 ring-1 ring-[color]-100">
    <Icon className="h-10 w-10 text-[color]-500" />
  </div>
  
  {/* 2. Message */}
  <h2 className="mb-3 text-2xl font-bold tracking-tight text-foreground">
    {Title}
  </h2>
  <p className="mb-8 max-w-[450px] text-muted-foreground leading-relaxed">
    {Description}
  </p>

  {/* 3. Actions */}
  <div className="flex flex-col gap-3 sm:flex-row">
    <Button onClick={reset}>Try Again</Button>
    <Button variant="outline" asChild><Link href="/">Go Home</Link></Button>
  </div>

  {/* 4. Diagnostics */}
  {error.digest && <p className="text-xs text-muted-foreground/40">Ref: {error.digest}</p>}
</div>
```

## 2. Specific Variants

Each section of the application uses a distinct color scheme and iconography to provide context.

### Global Error (`app/error.tsx`)
General fallback for unexpected application errors.
- **Color Theme**: Red (`red-500`)
- **Icon**: `AlertTriangle`
- **Primary Action**: "Try Again"
- **Secondary Action**: "Go Home"
- **Context**: "Something went wrong"

### Admin Portal Error (`app/admin/error.tsx`)
Errors occurring within the management interface.
- **Color Theme**: Amber (`amber-600`)
- **Icon**: `AlertTriangle`
- **Primary Action**: "Retry Action"
- **Secondary Action**: "Admin Dashboard"
- **Context**: "Data integrity protection is active"

### Product Storefront Error (`app/(storefront)/products/error.tsx`)
Failures in loading the product catalog or individual items.
- **Color Theme**: Orange (`orange-500`)
- **Icon**: `PackageX`
- **Primary Action**: "Reload Catalog"
- **Secondary Action**: "Go Home"
- **Context**: "Trouble displaying the catalog"

### Account/Auth Error (`app/(storefront)/account/error.tsx`)
Issues with user sessions, profiles, or protected routes.
- **Color Theme**: Rose (`rose-500`)
- **Icon**: `UserX`
- **Primary Action**: "Try Again"
- **Secondary Action**: "Back to Store"
- **Context**: "Temporary connection issue or session expiry"

### 404 Not Found (`app/not-found.tsx`)
Standard handler for invalid routes.
- **Color Theme**: Zinc/Gray (`zinc-500`)
- **Icon**: `FileQuestion`
- **Primary Action**: "Go Home"
- **Secondary Action**: "Browse Products"

## 3. Code Patterns

### Error Interface
Next.js error pages must strictly follow this interface:

```typescript
interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}
```

### Logging Pattern
Always log the error to the console (or monitoring service) on mount:

```typescript
useEffect(() => {
  console.error('Context specific error:', error)
}, [error])
```

### Recovery Action
The `reset` function is provided by Next.js to re-render the segment. It should be attached to the primary action button.

```tsx
<Button onClick={reset} size="lg" className="gap-2 font-medium">
  <RefreshCw className="h-4 w-4" />
  Try Again
</Button>
```

### Navigation Fallback
Always provide a navigation alternative in case the retry fails or the error is permanent.

```tsx
<Button variant="outline" size="lg" asChild className="gap-2">
  <Link href="/target-route">
    <Icon className="h-4 w-4" />
    Fallback Label
  </Link>
</Button>
```
