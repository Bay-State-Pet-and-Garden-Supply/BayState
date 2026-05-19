# UI Implementation: Scraper Mode Selector & Force-Refresh Toggle

## Summary

Implemented the scraper mode selector and force-refresh toggle UI changes across three files. The approved extraction initiation has been moved from the FloatingActionsBar (bulk actions) into the ManagementPanel (per-cohort), giving users fine-grained control over extraction mode and whether to force-refresh existing data.

## Changes

### 1. `ManagementPanel.tsx`

**New state variables:**
- `extractionMode: "mixed" | "distributor_only" | "ai_only"` (default: `"mixed"`)
- `forceRefresh: boolean` (default: `false`)

**New import:** `Checkbox` from `@/components/ui/checkbox`

**Footer UI** (above "Save and start scraper" button):
- Extraction Mode `<select>` dropdown with three options:
  - "Full Extraction" (`mixed`) — default
  - "Distributor Only" (`distributor_only`)
  - "AI Only" (`ai_only`)
- Force refresh `<Checkbox>` labeled "Force refresh existing data"

**POST body update** in `handleSave(startScraper=true)`:
```ts
body: JSON.stringify({
  skus,
  extractionMode,
  forceRefresh,
  config: { source_type: 'approved_source_extraction' },
}),
```

### 2. `PipelineClient.tsx`

**Removed:**
- `isApprovedExtracting` state variable
- `handleStartApprovedExtraction` callback (50-line function calling `/api/admin/enrichment/jobs` with hardcoded `mode: "mixed"`)
- `onStartApprovedExtraction={handleStartApprovedExtraction}` prop from `<FloatingActionsBar>`
- `|| isApprovedExtracting` from `isLoading` prop on `<FloatingActionsBar>`

### 3. `FloatingActionsBar.tsx`

**Removed:**
- `onStartApprovedExtraction` from `FloatingActionsBarProps` interface
- `onStartApprovedExtraction` from destructured component props
- `Sparkles` from `lucide-react` import
- `secondaryAction: 'Extract'` from `BULK_ACTIONS.imported` config
- The `<Button>` that rendered when `currentStage === 'imported' && onStartApprovedExtraction`

## Validation

- TypeScript compilation passes with no new errors (only pre-existing errors in unrelated test file `__tests__/.../credentials/route.test.ts`)
- Grep confirms zero remaining references to removed identifiers in all three files

## Open Risks/Questions

None. The approved extraction path is now solely owned by `ManagementPanel.handleSave(startScraper=true)`. The `PipelineClient.tsx` still exports `scrapeSelectionValidation` but it was only consumed by the now-removed `handleStartApprovedExtraction` callback and the `ScraperSelectDialog` — neither reference remains in this flow, so it's dead code that could be cleaned up in a follow-up if desired.

## Recommended Next Step

Verify the API endpoint `/api/admin/enrichment/jobs` handles the new `extractionMode` and `forceRefresh` body params, or update it if needed.
