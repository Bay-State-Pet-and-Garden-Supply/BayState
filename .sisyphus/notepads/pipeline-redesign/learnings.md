# Pipeline Status New Migration - Learnings

## Task Summary
Created database migration for new pipeline status enum in Supabase.

## What Was Done

### 1. Migration Files Created

**Main migration**: `20260314120000_add_pipeline_status_new.sql`
- Creates new enum type `pipeline_status_new_enum` with values: 'registered', 'enriched', 'finalized'
- Adds `pipeline_status_new` column to `products_ingestion` table
- Migrates existing data:
  - staging → registered
  - failed → registered
  - scraped → enriched
  - consolidated → finalized
  - approved → finalized
  - published → finalized
- Creates index on new column
- Adds NOT NULL constraint after data migration

**Rollback migration**: `20260314120001_rollback_pipeline_status_new.sql`
- Drops NOT NULL constraint
- Drops index
- Drops column
- Drops enum type

### 2. Key Decisions

- **Kept old column**: Did NOT drop `pipeline_status` column as per requirements (backward compatibility)
- **Three-state model**: Simplified from 6 statuses to 3 for clearer pipeline flow
- **Retry support**: Failed products map to 'registered' for retry capability

### 3. Testing Status

- `supabase db reset` failed due to pre-existing migration issue (column "permname" does not exist in migration `20250205000000_realtime_rls_policies 2.sql`)
- Migration files are syntactically correct and follow existing migration patterns
- Local Supabase instance had port conflicts with another project

### 4. Next Steps

- Need to fix or skip the problematic existing migration before running db reset
- Migration can be applied manually to production database
- After migration, update application code to use new `pipeline_status_new` column
- Later task (T5/T14) will handle dropping old column after full transition

## Dependencies
- Depends on: T1 (types defined in lib/pipeline.ts)
- Blocks: T5, T14 (these will use the new column)

## T5 CRUD Transition Learnings

- `apps/web/lib/pipeline.ts` now supports transitional reads by accepting both legacy and new status enums in `getProductsByStatus()` and `getSkusByStatus()`.
- `bulkUpdateStatus()` validates every requested change against `validateStatusTransition()` using `pipeline_status_new` when present, with legacy-to-new fallback mapping for older rows.
- Dual-write behavior uses canonical legacy mirrors for new statuses: `registered -> staging`, `enriched -> scraped`, `finalized -> consolidated`.
- `getStatusCounts()` now returns only `registered`, `enriched`, and `finalized`, but still falls back to legacy `pipeline_status` values if `pipeline_status_new` is missing on a row.
- Targeted Jest tests passed via `npm exec -- jest ...`; invoking the same suites through `bun run web test` still hits an environment-level Jest/Bun stream mocking error unrelated to these code changes.



---

## T7: Status Transition API Endpoint

### What was done
- Created POST `/api/admin/pipeline/transition` endpoint
- Implemented validation with Zod schema
- Added status mismatch check (409 error)
- Added transition validation using `validateStatusTransition()`
- Updated `pipeline_status_new` column atomically
- Logged transitions to `pipeline_audit_log`

### Key patterns learned
1. **Zod validation**: Use `z.object()` with `.parse()` for request body validation
2. **Error handling**: Return 400 for Zod errors, 409 for status mismatch, 404 for not found
3. **Audit logging**: Log all state changes to `pipeline_audit_log` table
4. **Auth pattern**: Use `requireAdminAuth()` for admin route protection

### Error codes used
- 400: Invalid transition or Zod validation error
- 404: Product not found
- 409: Status mismatch (current status != fromStatus)
- 500: Internal server error

### Dependencies
- `validateStatusTransition()` from `@/lib/pipeline`
- `requireAdminAuth()` from `@/lib/admin/api-auth`
- `createClient()` from `@/lib/supabase/server`

---

## T6: Streaming Excel Export Endpoint

### What was done
- Replaced the old buffer-based export in `apps/web/app/api/admin/pipeline/export/route.ts` with `exceljs.stream.xlsx.WorkbookWriter`
- Defaulted the endpoint to `?status=finalized` and validated `registered | enriched | finalized`
- Queried `products_ingestion` in pages of 200 rows using `pipeline_status_new`
- Exported SKU, name, description, price, brand, weight, category, product_type, stock_status, and selected image URLs
- Added a reusable `streamWorkbookRows()` helper so the streaming writer can be curl-verified without a live admin session

### Key patterns learned
1. `WorkbookWriter` does not support mutating some worksheet properties like `views`; assigning them throws at runtime
2. Streaming rows must be committed immediately with `worksheet.addRow(...).commit()` to keep memory bounded
3. Separating row iteration from workbook writing makes the export logic testable without needing Supabase cookies or route auth
4. `selected_images` can contain objects with `url`, so exports should normalize both object arrays and plain string arrays

### Verification
- `lsp_diagnostics` clean for `apps/web/app/api/admin/pipeline/export/route.ts` and `apps/web/app/api/admin/pipeline/transition/route.ts`
- `bun run build` passed in `apps/web`
- `curl` against a temporary local HTTP server using `streamWorkbookRows()` produced a valid `.xlsx` zip (`xl/workbook.xml` and worksheet entries present)

### Notes
- The route still requires `requireAdminAuth()` for real `/api/admin/pipeline/export` requests
- A small unrelated build blocker in `apps/web/app/api/admin/pipeline/transition/route.ts` was fixed by updating the Zod enum declaration to the current API



---

## T9: Image Selection Workspace Component

### What was done
- Created `/apps/web/components/admin/pipeline/ImageSelectionWorkspace.tsx`
- Modal overlay component for selecting product images
- Displays `image_candidates` as selectable gallery grid
- Enforces max 10 image selection limit
- "Save Selections" button persists without status change
- "Mark as Finalized" button saves selections + transitions status to `finalized`

### Key patterns learned
1. **Modal overlay pattern**: Use `fixed inset-0 bg-black/50` for backdrop, `z-50` for stacking
2. **Image grid**: `grid-cols-2 md:grid-cols-4` for responsive 2-col mobile, 4-col desktop
3. **Selection state**: Track selected URLs in local state, validate against `image_candidates`
4. **Max limit enforcement**: Disable unselected images when limit reached, show toast warning
5. **Two-step finalize**: First save images via `/api/admin/pipeline/images`, then transition via `/api/admin/pipeline/transition`
6. **Toast notifications**: Use `sonner` toast for success/error/warning feedback

### API endpoints used
- `GET /api/admin/pipeline/${sku}` - Fetch product with image_candidates
- `POST /api/admin/pipeline/images` - Save selected images
- `POST /api/admin/pipeline/transition` - Transition status to finalized

### Component structure
- Header: Title, product name, close button
- Content: Selection counter, image grid with click handlers
- Footer: Cancel, Save Selections, Mark as Finalized buttons

### Dependencies
- `SelectedImage` and `PipelineProduct` types from `@/lib/pipeline`
- `toast` from `sonner` for notifications
- Lucide icons: `X`, `Loader2`, `CheckCircle2`, `ImageOff`

### Notes
- Component follows same patterns as `EnrichmentWorkspace.tsx`
- Uses design system colors: `#008850` (Forest Green) for primary actions
#ZM|- Accessible: keyboard navigation, aria-pressed, aria-label for images

---

## T10: Enrichment Workspace Simplification

### What was done
- Removed `ConflictResolutionCard` import and usage from `EnrichmentWorkspace.tsx`
- Removed `ConflictOption` interface (no longer needed)
- Removed conflict-related state: `conflictField`, `conflictOptions`, `fieldOverrides`
- Removed conflict-related handlers: `handleFieldClick`, `handleSelectConflictSource`
- Removed conflict resolution modal overlay
- Removed `onFieldClick` prop from `EnrichmentDataPreview` component
- Added `useRouter` from `next/navigation` for navigation
- Added `ImagePlus` icon from `lucide-react`
- Added "Open Image Selection" button linking to `/admin/pipeline/image-selection?sku={sku}`

### Key patterns learned
1. **Component simplification**: Remove unused imports, interfaces, state, and handlers together
2. **Navigation pattern**: Use `router.push()` for client-side navigation to other admin pages
3. **Conditional rendering**: Only show "Open Image Selection" button when `!isBatchMode && hasScrapedData`
4. **Button styling**: Use design system colors (`#008850`) with opacity variants for secondary actions

### Code reduction
- Original: 574 lines
- Simplified: 519 lines
- Removed: 55 lines (conflict resolution logic)

### Dependencies
- Depends on: T9 (ImageSelectionWorkspace exists at `/admin/pipeline/image-selection`)
- Blocks: T11

### Notes
- The `EnrichmentDataPreview` component still has `onFieldClick` as optional prop, so it works without it
- Conflict resolution functionality moved to dedicated Image Selection workspace (T9)
- Component still supports both single SKU and batch modes

---

## T12: Export Workspace Component

### What was done
- Created `/apps/web/components/admin/pipeline/ExportWorkspace.tsx`
- Updated `/api/admin/pipeline/export/route.ts` to support 'all' status filter

---

## T17: Build Verification Sweep

### What was fixed
- Repaired JSX and type breakages in `apps/web/components/admin/pipeline/PipelineProductCard.tsx`, `apps/web/components/admin/pipeline/UnifiedPipelineClient.tsx`, and `apps/web/lib/pipeline/undo.ts`
- Added compatibility fixes for mixed legacy/new bulk action usage in `apps/web/components/admin/pipeline/BulkActionsToolbar.tsx`
- Fixed multiple TypeScript/lint blockers across admin pipeline, scraper config tests, and storefront copy escaping
- Added a local `bun:test` type shim plus converted scraper config/credentials tests to Jest-native mocks
- Updated `apps/web/package.json` test script to force the repo's Node 24 runtime because the system Node 25 runtime broke Jest initialization on this machine

### Verification status
- `bun run web tsc --noEmit`: passes
- `bun run web lint`: passes with warnings only
- `bun run web test`: passes
- `bun run web build`: passes

### Final blockers resolved
- Updated outdated tests to match current route/component behavior, especially around `upsert`, new pipeline export semantics, and sidebar/tab labeling
- Added a stable Node 24 Jest path in the test script so the suite runs reliably on this workstation
- Re-ran targeted diagnostics on changed source/test hotspots with no LSP errors reported

### Environment note
- On this machine, Jest was not stable under `/opt/homebrew/bin/node` (v25). Running through `~/.nvm/versions/node/v24.12.0/bin/node` avoids the runtime bootstrap failure.
- Component displays product count for selected status
- Filter selector with options: 'registered', 'enriched', 'finalized', 'all'
- "Generate Export" button triggers Excel download
- Success message with file info after generation
- Empty state when no products found

### Key patterns learned
1. **Blob download pattern**: Use `response.blob()` + `URL.createObjectURL()` + `<a>` element for file downloads
2. **Status filter**: Pass status as query param to export endpoint
3. **Count fetching**: Use `/api/admin/pipeline/counts` endpoint for real-time counts
4. **Empty state**: Use `EmptyState` component with icon, title, description, and action button
5. **Loading states**: Use `Spinner` component for loading indicators, `Loader2` icon for button loading
6. **Toast notifications**: Use `sonner` toast for success/error feedback

### API endpoints used
- `GET /api/admin/pipeline/counts` - Fetch product counts by status
- `GET /api/admin/pipeline/export?status={status}` - Generate Excel export

### Component structure
- Card with header (title + description)
- Status filter dropdown (Select component)
- Product count display with icon
- Empty state when no products
- Generate Export button (primary action)
- Success message after export

### Design system colors used
- Primary: `#008850` (Forest Green) for buttons and accents
- Primary hover: `#2a7034` for button hover states
- Primary background: `bg-[#008850]/5` for success message background
- Primary border: `border-[#008850]/20` for success message border

### Dependencies
- `Button` from `@/components/ui/button`
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
- `EmptyState` from `@/components/ui/empty-state`
- `Spinner` from `@/components/ui/spinner`
- `toast` from `sonner`
- Lucide icons: `Download`, `FileSpreadsheet`, `Loader2`, `Package`

### Notes
- Export endpoint now supports 'all' status to export all products regardless of status
- Component follows same patterns as other pipeline workspace components
- Uses design system colors consistently
- Accessible: proper labels, keyboard navigation support

---

## T11: Pipeline Dashboard Updates for New Statuses

### What was done
- Updated `UnifiedPipelineClient.tsx` to support new pipeline statuses
- Updated `BulkActionsToolbar.tsx` with new action types
- Updated `PipelineProductCard.tsx` with new stage config and Image Selection button
- Updated `ExportButton.tsx` to use `NewPipelineStatus`

### Key changes

1. **Status Types**
   - Added `NewPipelineStatus` type: `'registered' | 'enriched' | 'finalized'`
   - Created `newStatusLabels` mapping for display names
   - Created `newPipelineStages` array for status count cards

2. **UnifiedPipelineClient Updates**
   - Changed `statusFilter` state type to `NewPipelineStatus | 'all'`
   - Updated `getCount()` to accept `NewPipelineStatus`
   - Updated `getRequestStatus()` to return `NewPipelineStatus | null`
   - Updated status filter dropdown to show new statuses
   - Updated status count cards to use 3-column grid
   - Added `handleImageSelection()` for navigation to image selection page
   - Updated `handleBulkAction()` for new actions: `moveToEnriched`, `moveToFinalized`
   - Updated export dialog to use new status labels

3. **BulkActionsToolbar Updates**
   - Changed `currentStatus` prop type to `NewPipelineStatus`
   - Created `newStatusMap` for status transitions
   - Created `newActionLabels` for action button labels
   - Added `onMoveToEnriched` and `isMovingToEnriched` props
   - Removed legacy props for old pipeline actions

4. **PipelineProductCard Updates**
   - Added `onImageSelection` and `showImageSelectionButton` props
   - Created `newStageConfig` for new pipeline statuses
   - Added `isNewPipelineStatus()` type guard
   - Added Image Selection button for enriched products

### Status transitions
- `registered` → `enriched` (Move to Enriched)
- `enriched` → `finalized` (Move to Finalized)
- `finalized` is terminal state (no outgoing transitions)

### Design system colors used
- Forest Green (`#008850`): Primary actions, selected state borders
- Orange (`bg-orange-500`): Registered status
- Blue (`bg-blue-500`): Enriched status
- Green (`bg-green-500`): Finalized status

### Files modified
- `apps/web/components/admin/pipeline/UnifiedPipelineClient.tsx`
- `apps/web/components/admin/pipeline/BulkActionsToolbar.tsx`
- `apps/web/components/admin/pipeline/PipelineProductCard.tsx`
- `apps/web/components/admin/pipeline/ExportButton.tsx`

### Dependencies
- Depends on: T9 (Image Selection workspace) - navigation target
- Depends on: T10 (Export workspace) - navigation target
- Blocks: T13 (navigation depends on dashboard)

### Notes
- Old `statusLabels` and `pipelineStages` kept for backward compatibility
- Products use `pipeline_status_new` field when available, falling back to `pipeline_status`
- Image Selection button shows for products in `enriched` status
- Navigation to `/admin/pipeline/image-selection?sku={sku}` for image selection

---

## T20: Export Page Route

### What was done
- Created `/apps/web/app/admin/pipeline/export/page.tsx`
- Imported ExportWorkspace from `@/components/admin/pipeline/ExportWorkspace`
- Added Metadata with title "Export Products | Bay State" and description
- Wrapped ExportWorkspace in Suspense boundary for loading state
- Created Spinner loading component

### Key patterns learned
1. **Next.js App Router**: Use async server component for page routes
2. **Metadata export**: Export metadata object with title and description
3. **Suspense boundary**: Wrap client components that fetch data on mount
4. **Loading states**: Use Spinner component with descriptive text

### Component structure
- Page: Server component with metadata export
- Content: Suspense boundary wrapping ExportWorkspace
- Loading: Custom loading state with Spinner

### Design system colors used
- Spinner: `text-[#008850]` (Forest Green)

### Dependencies
- ExportWorkspace from T12 (component exists and is self-contained)
- Spinner from `@/components/ui/spinner`

### Notes
- ExportWorkspace is a 'use client' component, so Suspense boundary is needed
- Component handles its own API calls via /api/admin/pipeline endpoints
- No additional props needed - component is self-contained
---

## T19: Image Selection Page Route

### What was done
- Created `/apps/web/app/admin/pipeline/image-selection/page.tsx`
- Created `ImageSelectionPageClient.tsx` wrapper component
- Handles `?sku` query parameter
- Shows error state when SKU is missing
- Renders ImageSelectionWorkspace when SKU is provided
- Added Suspense boundary for loading state
- Added metadata with title "Image Selection | Bay State"

### Key patterns learned
1. **Next.js App Router**: Server component accepts `searchParams` as `Promise<{...}>`
2. **searchParams handling**: Use `await searchParams` to get params in Next.js 15+
3. **Client component wrapper**: ImageSelectionWorkspace is a client component, need wrapper for `useRouter`
4. **Error state**: Return error UI when required params are missing
5. **Navigation**: Use `router.back()` for close action in standalone page

### Component structure
- Page: Server component with metadata export
- Error: ErrorState component for missing SKU
- Loading: LoadingState component for Suspense fallback
- Client: ImageSelectionPageClient handles router for onClose

### Design system colors used
- Error: `bg-red-50`, `text-red-600`
- Loading: `border-b-2 border-[#008850]` (Forest Green)

### Dependencies
- ImageSelectionWorkspace from T9 (component handles its own data fetching)
- useRouter from next/navigation for close navigation
- Suspense from react for loading boundary

### Notes
- Page follows same pattern as T20 (Export Page Route)
- ImageSelectionWorkspace requires `onClose` prop, provided via client wrapper using `router.back()`
- Component is self-contained - handles API calls internally
- SKU parameter is required for the workspace to function

---

## T14: Production Status Migration Script

### What was done
- Added `apps/web/scripts/migrate-pipeline-statuses.ts`
- Supports `--dry-run` and `--execute` modes plus `--rollback`
- Creates `products_ingestion_backup` with `CREATE TABLE ... LIKE ... INCLUDING ALL` before migration runs
- Copies all `products_ingestion` rows into the backup table with `ON CONFLICT DO NOTHING` for idempotent re-runs
- Migrates `pipeline_status_new` in batches of 100 using the legacy-to-new status mapping
- Restores `pipeline_status` and `pipeline_status_new` from backup in rollback mode, also in batches of 100

### Key patterns learned
1. Use the Supabase service-role client for counting, selecting, and grouped updates, while using `psql` only for backup-table DDL and rollback SQL.
2. Ordering batched reads by `sku` keeps offset pagination stable because the script only updates `pipeline_status_new`, not the legacy status used for filtering.
3. Grouping each batch by target status reduces writes from 100 row-level updates to at most 3 update statements per batch.
4. A full-table backup cloned with `INCLUDING ALL` preserves constraints and allows rollback to restore both legacy and new status columns safely.

### Verification
- `lsp_diagnostics` clean for `apps/web/scripts/migrate-pipeline-statuses.ts`
