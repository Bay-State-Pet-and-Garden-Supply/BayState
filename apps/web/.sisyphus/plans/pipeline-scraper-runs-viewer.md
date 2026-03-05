# Work Plan: Pipeline Scraper Runs Viewer

## Summary
Add ability to view Pipeline-initialized scraper runs in the admin panel by extending the existing `/admin/scrapers/runs/` page with source filtering and bidirectional navigation.

## Key Decisions (From User)
| Decision | Choice |
|----------|--------|
| Location | **Option A**: Add filter to existing `/admin/scrapers/runs/` page |
| Primary Use Case | **Troubleshooting failed enrichment** |
| Display Columns | **Same as general scraper runs** (no special columns needed) |
| Navigation | **Bidirectional**: Pipeline product → scraper run history |

## Architectural Decisions (From Metis Review)

### 1. Metadata Filtering Strategy
**Constraint Discovered**: Only discovery-mode Pipeline jobs currently get metadata (`{ source: 'pipeline', mode: 'discovery' }`). Standard scraper jobs triggered from Pipeline don't set metadata.

**Decision**: For MVP, filter shows jobs where `metadata->>'source' = 'pipeline'`. Future enhancement may need to update `pipeline-scraping.ts` to always set metadata for Pipeline jobs.

### 2. NULL Metadata Handling
**Issue**: Query `metadata->>'source' = 'pipeline'` excludes NULL rows.

**Decision**: This is correct behavior — only explicitly Pipeline-tagged jobs should appear when "Pipeline Only" filter is active. General view shows all jobs (including NULL metadata).

### 3. Bidirectional Link Strategy
**Issue**: No direct relationship exists between Pipeline products and their scraper runs.

**Decision**: Use SKU + timestamp correlation as heuristic. In future, consider adding `scrape_job_id` to `products_ingestion` table.

### 4. Performance
**Requirement**: Add GIN index on `metadata` column for efficient JSONB filtering.

## Files to Modify

| File | Purpose | Change Type |
|------|---------|-------------|
| `app/admin/scrapers/runs/actions.ts` | Add metadata to SELECT, add source filter param | MODIFY |
| `app/admin/scrapers/runs/page.tsx` | Accept source filter from URL params | MODIFY |
| `components/admin/scrapers/ScraperRunsClient.tsx` | Add "Pipeline Only" toggle/filter UI | MODIFY |
| `components/admin/pipeline/PipelineProductDetail.tsx` | Add "View Scraping Run" link | MODIFY |
| `lib/admin/scrapers/runs-types.ts` | Add metadata field to ScraperRunRecord | MODIFY |
| `supabase/migrations/[timestamp]_add_metadata_gin_index.sql` | GIN index for performance | CREATE |

## Implementation Tasks

---

### Phase 1: Database Performance

**Task 1.1**: Create GIN index migration
- **File**: `supabase/migrations/20260226010000_add_scrape_jobs_metadata_gin_index.sql`
- **Purpose**: Ensure fast JSONB filtering on metadata column
- **Implementation**:
  ```sql
  -- Migration: Add GIN index for metadata filtering
  -- Purpose: Optimize queries filtering by metadata->>'source'
  
  CREATE INDEX IF NOT EXISTS idx_scrape_jobs_metadata_gin 
  ON scrape_jobs USING GIN (metadata jsonb_path_ops) 
  WHERE metadata IS NOT NULL;
  
  -- Also add index for source lookups specifically
  CREATE INDEX IF NOT EXISTS idx_scrape_jobs_metadata_source 
  ON scrape_jobs ((metadata->>'source')) 
  WHERE metadata IS NOT NULL;
  ```
- **QA Scenario**: Run `EXPLAIN ANALYZE SELECT * FROM scrape_jobs WHERE metadata->>'source' = 'pipeline';` — should use index scan, not sequential scan
- **Rollback**: `DROP INDEX IF EXISTS idx_scrape_jobs_metadata_gin; DROP INDEX IF EXISTS idx_scrape_jobs_metadata_source;`

---

### Phase 2: Server Actions

**Task 2.1**: Update `ScraperRunRecord` interface to include metadata
- **File**: `lib/admin/scrapers/runs-types.ts`
- **Purpose**: Allow metadata to be passed through type system
- **Implementation**: Add to `ScraperRunRecord` interface:
  ```typescript
  metadata?: {
    source?: string;
    mode?: string;
    [key: string]: unknown;
  } | null;
  ```
- **QA Scenario**: TypeScript compilation passes without errors

**Task 2.2**: Update `getScraperRuns()` to support source filtering
- **File**: `app/admin/scrapers/runs/actions.ts`
- **Purpose**: Enable filtering by metadata source
- **Changes**:
  1. Add `source?: string` to options parameter
  2. Add `metadata` to SELECT fields
  3. Add conditional filter: `if (options?.source) { query = query.eq('metadata->>source', options.source); }`
  4. Map `metadata` field in result transformation
- **QA Scenario**: 
  ```typescript
  // Test filtering works
  const { runs } = await getScraperRuns({ source: 'pipeline' });
  assert(runs.every(r => r.metadata?.source === 'pipeline'));
  
  // Test without filter includes all
  const { runs: allRuns } = await getScraperRuns();
  assert(allRuns.some(r => r.metadata?.source !== 'pipeline' || !r.metadata));
  ```

**Task 2.3**: Update `getScraperRunById()` to include metadata
- **File**: `app/admin/scrapers/runs/actions.ts`
- **Purpose**: Ensure detail view has metadata for display/logic
- **Changes**: Add `metadata` to SELECT fields and result mapping
- **QA Scenario**: Detail page loads without errors and shows metadata if present

---

### Phase 3: UI Components

**Task 3.1**: Add source filter to `ScraperRunsClient`
- **File**: `components/admin/scrapers/ScraperRunsClient.tsx`
- **Purpose**: Allow users to toggle "Pipeline Only" view
- **Implementation**:
  1. Accept `initialSourceFilter?: string` prop
  2. Add state: `const [sourceFilter, setSourceFilter] = useState(initialSourceFilter || 'all')`
  3. Add UI control (toggle button group or select):
     - "All Sources" (value: 'all')
     - "Pipeline Only" (value: 'pipeline')
  4. On filter change, use `router.push()` with query param: `?source=pipeline`
  5. Show active filter state visually
- **UX Pattern**: Follow existing filter patterns in admin (see `PipelineFilters.tsx` for reference)
- **QA Scenario**: 
  - Toggle to "Pipeline Only" → URL updates to `?source=pipeline` → table refreshes with filtered data
  - Toggle back to "All" → URL clears → table shows all runs
  - Page reload with `?source=pipeline` in URL → filter correctly initialized to "Pipeline Only"

**Task 3.2**: Update stats cards to reflect filtered view
- **File**: `components/admin/scrapers/ScraperRunsClient.tsx`
- **Purpose**: Show accurate counts when filtered
- **Decision**: When "Pipeline Only" filter is active:
  - Update header text: "Pipeline Scraper Runs" instead of "Scraper Runs"
  - Stats cards should reflect filtered totals (passed from server)
  - Alternative: Add "(Pipeline)" label to stats cards
- **QA Scenario**: Stats update correctly when filter changes

**Task 3.3**: Update page.tsx to handle source param
- **File**: `app/admin/scrapers/runs/page.tsx`
- **Purpose**: Read source filter from URL and pass to server action
- **Implementation**:
  ```typescript
  export default async function ScraperRunsPage({
    searchParams,
  }: {
    searchParams: { source?: string };
  }) {
    const source = searchParams.source;
    const { runs, totalCount } = await getScraperRuns({ 
      limit: 100,
      ...(source && { source })
    });
    
    return <ScraperRunsClient 
      initialRuns={runs} 
      totalCount={totalCount}
      initialSourceFilter={source}
    />;
  }
  ```
- **QA Scenario**: Direct navigation to `/admin/scrapers/runs?source=pipeline` shows filtered results

---

### Phase 4: Bidirectional Navigation

**Task 4.1**: Add "View Scraping Run" link in Pipeline product detail
- **File**: `components/admin/pipeline/PipelineProductDetail.tsx`
- **Purpose**: Navigate from Pipeline product to its associated scraper run
- **Research Required**: Check if product has direct job_id reference or needs heuristic lookup
- **Implementation Options**:
  - **Option A (Direct)**: If `scrape_job_id` exists on product, link directly to `/admin/scrapers/runs/{jobId}`
  - **Option B (Filtered List)**: Link to `/admin/scrapers/runs?source=pipeline` with the product's SKU as additional filter (if supported)
  - **Option C (Correlation)**: Query for most recent scraper run containing this product's SKU
- **Decision**: Start with **Option C** using heuristic:
  1. Query `scrape_results` for entries where `data` JSONB contains the SKU
  2. Join to `scrape_jobs` to get job details
  3. Link to most recent matching run
- **QA Scenario**: From Pipeline product detail, clicking "View Scraping Run" navigates to correct scraper run detail page

**Task 4.2**: Add back-link from scraper run to Pipeline (conditional)
- **File**: `app/admin/scrapers/runs/[id]/page.tsx`
- **Purpose**: If run originated from Pipeline, show link back to Pipeline
- **Implementation**: Check if `run.metadata?.source === 'pipeline'` and display banner/link to `/admin/pipeline/`
- **QA Scenario**: Pipeline-originated runs show "← Back to Pipeline" link; other runs don't

---

## QA & Testing Scenarios

### Scenario 1: Metadata Filtering
**Test**: Filter by source=pipeline
```bash
# Verify only Pipeline jobs shown
curl -s "http://localhost:3000/api/admin/scrapers/runs?source=pipeline" | jq '.runs | map(.metadata.source) | unique'
# Expected: ["pipeline"]
```

### Scenario 2: NULL Metadata Handling
**Test**: Jobs without metadata don't appear in Pipeline filter
```sql
-- Count jobs with NULL metadata
SELECT COUNT(*) FROM scrape_jobs WHERE metadata IS NULL;
-- Should be > 0 in test data

-- Verify they're excluded from Pipeline filter
SELECT COUNT(*) FROM scrape_jobs WHERE metadata->>'source' = 'pipeline' AND metadata IS NULL;
-- Expected: 0
```

### Scenario 3: Bidirectional Navigation
**Test**: Pipeline → Run → Pipeline flow
1. Navigate to `/admin/pipeline/`
2. Select a product with scraped data
3. Click "View Scraping Run"
4. Verify on correct run detail page
5. Click "Back to Pipeline" 
6. Verify return to Pipeline

### Scenario 4: Performance
**Test**: Index usage
```sql
EXPLAIN ANALYZE SELECT * FROM scrape_jobs WHERE metadata->>'source' = 'pipeline';
-- Should show "Index Scan" or "Bitmap Index Scan" not "Seq Scan"
```

### Scenario 5: UI State Persistence
**Test**: URL params persist correctly
1. Go to `/admin/scrapers/runs?source=pipeline`
2. Refresh page
3. Verify "Pipeline Only" filter still active
4. Verify table shows only Pipeline runs

### Scenario 6: Edge Case - No Pipeline Runs
**Test**: Empty state
1. Filter to Pipeline when no Pipeline runs exist
2. Verify "No scraper runs found" message displays correctly
3. Verify no console errors

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Only discovery jobs have metadata | High | Medium | Document limitation; future task to add metadata to all Pipeline jobs |
| JSONB performance without index | Medium | High | Phase 1 adds GIN index before any filtering |
| No direct product→job relationship | Medium | Medium | Use SKU+timestamp heuristic; document correlation approach |
| RLS policy blocking metadata access | Low | High | Use existing `createClient()` pattern; test with non-admin user |

---

## Future Enhancements (Out of Scope)

1. **Universal Pipeline Metadata**: Update `pipeline-scraping.ts` to always set `metadata.source = 'pipeline'` regardless of enrichment method
2. **Direct Relationships**: Add `scrape_job_id` to `products_ingestion` table for precise linking
3. **Batch Grouping**: Add Pipeline batch ID to metadata for grouping multiple jobs from single Pipeline action
4. **Advanced Filters**: Add date range, SKU search, status+source combined filters

---

## Definition of Done

- [ ] GIN index migration created and applied
- [ ] Server actions updated to support source filtering
- [ ] "Pipeline Only" toggle added to runs list UI
- [ ] Bidirectional navigation works (Pipeline ↔ Scraper Run)
- [ ] All QA scenarios pass
- [ ] TypeScript compilation passes
- [ ] Existing tests continue to pass
- [ ] No regressions in general scraper runs view

---

## Rollback Plan

If issues are discovered:
1. Revert code changes via git
2. Drop GIN indexes: `DROP INDEX IF EXISTS idx_scrape_jobs_metadata_gin; DROP INDEX IF EXISTS idx_scrape_jobs_metadata_source;`
3. The existing scraper runs view will continue working (no breaking changes to existing functionality)

---

*Plan generated: 2026-02-25*
*Metis review: Completed*
*Status: Ready for execution*
