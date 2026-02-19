# Accessibility Critical Fixes - Learnings

## Test Results Summary

| Metric | Before | After |
|--------|--------|-------|
| Total Tests | 28 | 28 |
| Failing | 22 | 0 |
| Passing | 6 | 28 |
| Runtime | - | 12.3s |

## Key Violations Fixed

### 1. Heading Order (WCAG 1.3.1)
- **Contact page**: h1 → h3 skipped h2
- **Products page**: h1 → h3 skipped h2
- **Fix**: Added intermediate h2 headings

### 2. Color Contrast (WCAG 1.4.3)
- **Header background**: #008850 Forest Green with backdrop-blur failed 4.5:1 contrast with white
- **Fix**: Changed to solid #006640 (darker green)
- **Tagline text**: Changed from `text-xs` to `sm:text-lg font-bold`
- **Button borders**: #348C41 → #2a7034 (darker green)
- **Icon colors**: 600 shades → 700 shades (amber, green, blue, orange)
- **Muted text**: `text-zinc-600` → `text-zinc-700` (70+ instances)

### 3. Services CTA Text
- `text-blue-100` on blue-600 background failed contrast
- **Fix**: Changed to `text-white`

## Technical Insights

### Backdrop Blur Pitfall
Using `bg-primary/95` with `backdrop-blur` can produce unpredictable contrast ratios because:
1. The alpha channel is applied to the CSS variable value
2. Backdrop blur filters the content behind the element
3. The resulting computed color may not match the intended contrast

**Solution**: Use solid colors for high-contrast requirements.

### Test Utility Improvements
- Added `.withTags(['wcag2aa', 'wcag21aa'])` for explicit WCAG 2.1 AA testing
- Updated node extraction to use `v.nodes[0]?.target` instead of deprecated `v.node?.target`
- Proper handling of array targets with `.join(', ')`

### Design System Colors
| Color | Hex | Foreground |
|-------|-----|------------|
| Forest Green (original) | #008850 | white (3.65:1 - FAILS) |
| Forest Green (darker) | #006640 | white (~5:1 - PASSES) |

## Commands

```bash
# Run accessibility tests
cd BayStateApp && npm run test:a11y:e2e

# Run all tests
cd BayStateApp && CI=true npm test

# Lint
cd BayStateApp && npm run lint
```

## Files Modified

### Core Fixes
- `app/(storefront)/contact/page.tsx` - Added h2 heading
- `app/(storefront)/products/page.tsx` - Added h2 heading
- `components/storefront/header.tsx` - Darker background, larger tagline
- `components/storefront/product-qa.tsx` - Darker button border
- `app/(storefront)/services/page.tsx` - White CTA text

### Test Infrastructure
- `__tests__/a11y/utils.ts` - Enhanced error reporting
- `__tests__/a11y/routes.spec.ts` - Route matrix tests
- `playwright.config.ts` - Viewport configuration

### Global Contrast Fixes
- 70+ instances of `text-zinc-600` → `text-zinc-700`
- Icon colors darkened across homepage and services pages
