#VN|# Pipeline Redesign Learnings
#KM|
#JT|## T1: New Pipeline Status Types
# Pipeline Redesign Learnings

## T1: New Pipeline Status Types

### Implementation Summary

Created new TypeScript types and validation functions for the pipeline redesign:

1. **NewPipelineStatus type** - `'registered' | 'enriched' | 'finalized'`
2. **STATUS_TRANSITIONS constant** - Defines valid state transitions
3. **validateStatusTransition() function** - Validates state transitions at runtime

### Status Transition Rules

| From | To | Valid |
|------|-----|-------|
| registered | enriched | ✅ |
| enriched | finalized | ✅ |
| registered | finalized | ❌ (skipping enriched) |
| finalized | * | ❌ (terminal state) |

### Key Decisions

- **Terminal state**: `finalized` is a terminal state with no outgoing transitions
- **No self-transitions**: Transitions like `registered -> registered` are invalid
- **Backward compatibility**: Old `PipelineStatus` type preserved for existing code
- **Type-safe**: Uses TypeScript's `as const` for compile-time guarantees

### Test Coverage

14 unit tests covering:
- Valid transitions
- Invalid transitions (skipping stages, going backwards, self-transitions)
- Terminal state behavior
- STATUS_TRANSITIONS constant structure
- TypeScript type validation

### Files Modified

- `apps/web/lib/pipeline.ts` - Added new types and validation function
- `apps/web/__tests__/lib/pipeline-status-validation.test.ts` - New test file

### Notes

- Did not modify database (deferred to T2)
- Did not remove old types (backward compatibility maintained)
- Did not include 'exported' as status (it's a log entry, not a pipeline status)

---

## T4: Add Selected Images Column

### Implementation Summary

Added `selected_images` JSONB column to `products_ingestion` table:

1. **Migration file** - `20260314000000_add_selected_images_column.sql`
2. **TypeScript interface** - `SelectedImage` with `url` and `selectedAt` fields
3. **Helper functions** - `getSelectedImages()` and `setSelectedImages()`

### Database Changes

```sql
ALTER TABLE products_ingestion 
ADD COLUMN IF NOT EXISTS selected_images jsonb DEFAULT '[]'::jsonb;

CREATE INDEX idx_products_ingestion_selected_images 
ON products_ingestion USING gin (selected_images jsonb_path_ops);
```

### TypeScript Types

```typescript
export interface SelectedImage {
    url: string;
    selectedAt: string; // ISO timestamp
}

// Added to PipelineProduct interface:
selected_images?: SelectedImage[];
```

### Helper Functions

- **getSelectedImages(sku)** - Fetches selected images for a product
- **setSelectedImages(sku, images)** - Sets selected images (max 10)

### Key Decisions

- **Max 10 images**: Enforced in `setSelectedImages()` helper
- **JSONB type**: Allows efficient querying with GIN index
- **Preserved image_candidates**: Did NOT remove existing column (per requirements)
- **Default empty array**: New rows get `[]` by default

### Files Modified

- `apps/web/supabase/migrations/20260314000000_add_selected_images_column.sql` - New migration
- `apps/web/lib/pipeline.ts` - Added `SelectedImage` interface and helper functions

### Notes

- Migration requires manual apply: `supabase db push` or via Supabase dashboard
- Does NOT duplicate image data - only stores URLs and selection metadata
- Blocks T9 (Image Selection workspace) - provides the data layer

---

## T15: Storefront Publishing

### Implementation Summary

Added storefront publishing as a secondary option for the pipeline. Products can now be published to the storefront (products table) from the ingestion pipeline.

### Changes Made

1. **Publish Endpoint** - `apps/web/app/api/admin/pipeline/publish/route.ts`
   - **POST**: Publish a single product to storefront
     - Accepts: `{ sku: string }`
     - Validates product is in 'approved' status
     - Copies data from `products_ingestion.consolidated` to `products` table
     - Handles insert (new) vs update (existing) by slug match
     - Does NOT change pipeline status (as per requirements)
   - **GET**: Check if product is in storefront
     - Returns: `{ inStorefront: boolean, storefrontProductId: string | null, pipelineStatus: string }`

### Schema Mapping

The endpoint maps data from ingestion to products table:
- `consolidated.name` → `name`
- Generated slug from name + SKU
- `consolidated.description` → `description`
- `consolidated.price` / `input.price` → `price`
- `consolidated.images` / `consolidated.selected_images` → `images` (array)
- `consolidated.brand_id` → `brand_id`
- `consolidated.stock_status` → `stock_status`
- `consolidated.is_featured` → `is_featured`
- Sets `published_at` to current timestamp

### Status Handling

- Only 'approved' products can be published (interpreting 'finalized' requirement)
- Returns 409 if product not in approved status
- Does NOT update pipeline status to 'published' (as per task requirement)

### Key Decisions

1. Used 'approved' status instead of 'finalized' since 'finalized' doesn't exist in current DB enum
2. Slug generation: `{name-slug}-{sku-no-special-chars}` to handle duplicates
3. Images: checks both `consolidated.images` and `consolidated.selected_images` arrays

### Files Created

- `apps/web/app/api/admin/pipeline/publish/route.ts` - New publish endpoint

### Notes

- ESLint passes with no errors
- TypeScript compiles (only node types config warning)
- Publish functionality available via detail modal for approved products
