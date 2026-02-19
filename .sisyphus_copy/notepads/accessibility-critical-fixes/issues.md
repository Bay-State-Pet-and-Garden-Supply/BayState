# Accessibility Critical Fixes - Issues & Blockers

## Test Infrastructure Issues

### Dev Server Not Running
**Status:** Tests hitting 404 pages instead of actual routes
**Symptom:** All 30 tests show the same 404 page snapshot
**Likely Cause:** Dev server not running or not accessible
**Fix:** Ensure `npm run dev` is running before tests

```bash
# Start dev server
cd BayStateApp && npm run dev

# In another terminal, run tests
cd BayStateApp && npm run test:a11y:e2e
```

## Remaining Color-Contrast Issues

### Account Pages (28 instances remaining)
These are not in public routes but should be fixed for consistency:

- `app/(storefront)/account/page.tsx` - 13 instances
- `app/(storefront)/account/orders/page.tsx` - 4 instances
- `app/(storefront)/account/orders/[id]/page.tsx` - 6 instances
- `app/(storefront)/account/profile/page.tsx` - 2 instances
- `app/(storefront)/account/addresses/page.tsx` - 1 instance
- `app/(storefront)/account/wishlist/page.tsx` - 1 instance
- `app/(storefront)/account/pets/page.tsx` - 1 instance

### Admin Pages (50+ instances)
These are in the admin area and may need separate a11y testing:

- `app/admin/*` - Multiple files with text-muted-foreground

## Landmark/Region Issues

### Potential Sources
1. **Nested landmarks** - main inside another landmark
2. **Content outside landmarks** - content not wrapped in nav/main/aside/section
3. **Multiple main landmarks** - more than one main element

### Files to Check
- `components/storefront/hero-carousel.tsx`
- `components/storefront/featured-products.tsx`
- `components/storefront/pet-recommendations.tsx`

## GitHub Issues to Close

24 issues created for accessibility fixes. Once tests pass with 0 violations, close with evidence:

1. Take screenshot of passing tests
2. Run `npm run test:a11y:e2e` and capture output
3. Reference the a11y test suite implementation

## Verification Steps

1. Start dev server: `cd BayStateApp && npm run dev`
2. Wait for "Ready on http://localhost:3000"
3. Run tests: `cd BayStateApp && npm run test:a11y:e2e`
4. Verify 0 violations

## Test Results Expected

```
Running 30 tests using 2 workers

  ✓  1 [desktop-chrome] › __tests__/a11y/routes.spec.ts:29:9 › Public Routes - Accessibility › Homepage (/) should have no accessibility violations @desktop
  ✓  2 [mobile-375x812] › __tests__/a11y/routes.spec.ts:29:9 › Public Routes - Accessibility › Homepage (/) should have no accessibility violations @desktop
  ... (all 30 tests pass)
  30 passed (XXs)
```

## Blockers

1. **Dev server not running** - Tests can't run against 404 pages
2. **Timeout issues** - Some tests may timeout if server slow to respond

## Generated

2026-01-15
