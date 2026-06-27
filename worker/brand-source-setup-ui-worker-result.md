# Brand Source Setup UI Drawer — Implementation Result

## Summary

Implemented the Brand Source Setup Sheet drawer for the admin pipeline Imported tab. The drawer replaces the existing cascade dialog with a 3-step wizard (Domain → PDP Seeds → Profile Status) that integrates with the previously-built admin API surface.

## Files Created (7)

| File | Purpose |
|------|---------|
| `apps/web/lib/profile-maintenance/brand-source-setup-types.ts` | Client-side types matching the GET source-setup API response shape |
| `apps/web/components/admin/brands/BrandSourceSetupStepIndicator.tsx` | Horizontal 3-step progress indicator (numbered circles + labels + connector lines) |
| `apps/web/components/admin/brands/BrandSourceSetupDomainStep.tsx` | Step 1: Save/update official brand domain with validation, PUT call, edit/saved toggle |
| `apps/web/components/admin/brands/BrandSourceSetupPdpSeedStep.tsx` | Step 2: Add PDP seed URLs with POST pdp-seeds, async job polling (3s interval), seed cards grouped by trust_status |
| `apps/web/components/admin/brands/BrandSourceSetupProfileStatusStep.tsx` | Step 3: Read-only summary cards (domain, cascade, seeds, profile) + inline cascade editor toggle + "What's next" guidance |
| `apps/web/components/admin/brands/BrandSourceSetupDrawer.tsx` | Main Sheet drawer orchestrator: step navigation, data fetching, error/loading/retry states |
| `apps/web/__tests__/components/admin/brands/BrandSourceSetupDrawer.test.tsx` | 19 Jest tests covering: loading, data fetch, step navigation, domain save via PUT, seed display, empty states, status cards, cascade editor toggle, "what's next" guidance, Done/Close behavior |

## Files Modified (1)

| File | Change |
|------|--------|
| `apps/web/components/admin/pipeline/ImportedResultsView.tsx` | Replaced standalone cascade Dialog with BrandSourceSetupDrawer. Changed "Configure cascade"/"Edit cascade" button to "Brand Setup" button. Removed Dialog/DialogContent/DialogHeader imports. Added isSetupDrawerOpen state + drawer rendering with readiness badge refresh on complete. |

## Validation Results

### Tests (19/19 passed)
```
PASS __tests__/components/admin/brands/BrandSourceSetupDrawer.test.tsx
  BrandSourceSetupDrawer
    ✓ shows loading state while fetching source setup
    ✓ loads source-setup on open and renders step 1
    ✓ renders title and description in sheet header
    ✓ shows retry button when fetch fails
    ✓ does not render when closed
    ✓ shows step indicator with correct steps
    ✓ navigates to step 2 on Next click
    ✓ navigates to step 3 on second Next click
    ✓ Back button returns to previous step
    ✓ Back button is disabled on step 1
    ✓ Done button triggers onSetupComplete and onClose on step 3
    ✓ shows saved domain state when hasOfficialDomain is true
    ✓ shows domain input when no official domain saved
    ✓ saves domain via PUT endpoint
    ✓ shows PDP seeds list on step 2
    ✓ shows empty state when no PDP seeds exist
    ✓ shows profile status summary on step 3
    ✓ shows cascade editor toggle on step 3
    ✓ shows appropriate what-next guidance
Test Suites: 1 passed, 1 total
Tests:       19 passed, 19 total
```

### Lint (0 errors, 41 warnings)
```
npx eslint components/admin/brands/ app/api/admin/
→ 0 errors, 41 warnings
```
All warnings are pre-existing in `BrandSourceCascadeEditor.tsx` or underscore-prefixed unused params.

### TypeScript (0 errors from new/modified files)
```
bun run tsc --noEmit --pretty | grep -E "BrandSourceSetup|ImportedResultsView"
→ No TypeScript errors from new or modified files.
```

### No Staged Files
```
git diff --cached --name-only
→ (no output)
```

### No API Routes Modified
All API routes were built in the previous slice. No route files were touched.

### No Scraper Files Modified
```
git diff --name-only -- apps/scraper/
→ (no output — pre-existing scraper changes in working tree are not from this task)
```

## Architecture

The drawer follows the existing `RunnerDetailDrawer` pattern (Sheet with `side="right"` and `max-w-[640px]`). Data fetching uses plain `fetch()` matching the existing pattern in `ImportedResultsView.tsx`. The cascade editor (`BrandSourceCascadeEditor`) is embedded inline in Step 3 as a collapsible section, keeping the single-entry-point UX.

### Key design decisions:
- **Step navigation**: The drawer footer has Back/Next buttons. Navigation is not gated by validation (user can save domain on step 1 and freely move between steps).
- **Domain step**: Shows edit/saved toggle. If domain exists, shows green confirmation card with Edit button.
- **PDP Seeds step**: Polls job status every 3s for non-terminal jobs. Seeds shown grouped by trust_status with visual indicators (green check for verified, spinner for checking, red X for rejected).
- **Profile Status step**: Cascade editor is collapsible. "What's next" guidance adapts to current state.
- **Parent refresh**: `onSetupComplete()` triggers `setReadinessNonce` in the parent to refresh cascade readiness badges.

## Exclusions (out of scope, as contracted)
- ❌ No AI Schema Draft endpoint or UI
- ❌ No profile version approval/activation
- ❌ No Browser Profile setup/revalidation UI
- ❌ No Image Candidate pipeline UI
- ❌ No enrichment pipeline changes
- ❌ No scraper-side changes
- ❌ No new database migrations
- ❌ No new API routes

## Residual Risks

| Risk | Mitigation |
|------|------------|
| **Job polling in PdpSeedStep** continues while drawer is open; if many seeds are being verified simultaneously, it creates poll traffic. Currently limited to polling every 3s for non-terminal jobs only. | Consider adding a max active poll count if this becomes a performance issue. |
| **Cascade editor in step 3** re-fetches its own data on mount. If the drawer is large, this adds one extra GET per step 3 visit. | Data is cached by the cascade editor internally; no retrigger on re-render. |
| **Domain step input** accepts bare hostnames (`example.com`) and full URLs (`https://www.example.com/path`). The API normalizes via `normalizeDomain()`. | Keep current behavior; it's forgiving. |
| **Underscore-prefixed unused props** (`_brandGroupId`, `_brandSlug`, `_onNext`) trigger lint warnings. | These are intentional — the props exist in the interface for future use. |

## Recommended Next Step

Phase 5 (rollout 8): Browser Profile Setup UI — the next major feature after this source-setup drawer is the Browser Profile setup/revalidation workspace (separate from the Imported tab).
