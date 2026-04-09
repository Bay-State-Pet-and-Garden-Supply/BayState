# Two-Phase Consolidation Wiring - Learnings

## Task Summary
Wired the two-phase consolidation service to production API routes:
1. `/api/admin/consolidation/submit/route.ts` - Manual batch submission
2. `/api/admin/consolidation/scraped/route.ts` - Auto-consolidation for scraped products

## Key Implementation Details

### TwoPhaseConsolidationService Usage
- Import from `@/lib/consolidation` (already exported in index.ts)
- Use `buildDefaultConsistencyRules()` for standard consistency checks
- Pass `batchMetadata` (not top-level) for description and auto_apply
- Phase 2 enabled by default with `phaseSelection: 'both'`

### Sibling Context Handling
- `productLineContext` is passed per-product in the `ProductSource` interface
- For scraped route: pulled from `p.input?.productLineContext`
- For submit route: passed from request body `productLineContext?.[p.sku]`
- Maintains backward compatibility - requests without context still work

### API Response Format
Both routes now return:
- `success: true`
- `batch_id`: generated timestamp-based ID
- `product_count`: number of products processed
- `phase`: 'phase1' | 'phase2'
- `consistency_report` (when phase2): flagged products, total issues, etc.

### Required Exports Added
- Added `createConsistencyRules`, `validateConsistency` exports to consolidation/index.ts
- Exported from `consistency-rules.ts` module
- Avoided duplicate `ConsistencyRule` type export (already in two-phase-service.ts)

## Files Modified
1. `apps/web/app/api/admin/consolidation/submit/route.ts`
2. `apps/web/app/api/admin/consolidation/scraped/route.ts`
3. `apps/web/lib/consolidation/index.ts` (added exports)
4. `apps/web/app/admin/product-lines/[id]/page.tsx` (fixed pre-existing broken import)

## Verification
- Build passes: ✓
- Integration tests pass: ✓ (2 tests, 21 expect calls)
- TypeScript compiles: ✓
