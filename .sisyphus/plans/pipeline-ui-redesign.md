# Pipeline UI Redesign: Single Linear Workflow

## TL;DR

Redesign the admin pipeline interface from a confusing dual-tab system (Workflow + Operational) into a clean, single linear workflow that mirrors the actual product journey: **Import → Scrape → Consolidate → Finalize → Publish**. Monitoring becomes inline indicators, images integrate into finalization, and export becomes an action button rather than a tab.

## Current Problems

### 1. Confusing Dual-Tab System
- **Workflow tabs**: Imported, Scraped, Finalized, Failed
- **Operational tabs**: Monitoring, Consolidating, Published, Images, Export
- Users don't understand the relationship between these two sets
- Navigation requires mental mapping between workflow stage and operational view

### 2. Misplaced Monitoring
- Monitoring active scrapes and consolidations are separate tabs
- They should be visible **within** the scraping and consolidation stages
- Users lose context when switching to monitoring

### 3. Images as Separate Tab
- Image selection should happen during finalization
- Having it as a separate tab breaks the workflow mental model
- Users don't know when/where images should be managed

### 4. Export as Tab
- Export is an action, not a workflow stage
- Clutters the tab bar
- Should be a button/toolbar action

## Proposed Solution

### Single Linear Workflow Tabs

```
[Imported] → [Scraping] → [Consolidating] → [Finalizing] → [Published] → [Failed]
```

Each tab represents an actual stage in the product lifecycle:

1. **Imported** - Products from Integra import, waiting for scrape
   - Count: Number of products to scrape
   - Actions: Run scrapers (bulk)
   - Monitoring: Show "Active Runs" count inline if > 0

2. **Scraping** - Currently being scraped (replaces "Monitoring")
   - Count: Products in active scrape jobs
   - Shows: Progress bars for active runs
   - Actions: Cancel runs, view logs
   - Auto-transitions products to Consolidating when complete

3. **Consolidating** - Ready for AI consolidation (replaces "Scraped")
   - Count: Products with scrape results
   - Actions: Run AI consolidation (bulk)
   - Shows: "Active Consolidations" progress inline if > 0

4. **Finalizing** - Ready for final review (merges old "Consolidated" + images)
   - Count: Products ready for final review
   - Actions: Approve, Reject, Edit images, Edit details
   - Shows: Product cards with image selection inline
   - This is the human review checkpoint

5. **Published** - Live on storefront (derived from storefront table)
   - Count: Products with storefront rows
   - Actions: Unpublish, view on site
   - Shows: Published product status

6. **Failed** - Error state (always visible)
   - Count: Products with errors
   - Actions: Retry, view error details
   - Shows: Error messages and retry options

### Key UX Improvements

1. **Inline Monitoring**
   - Instead of "Monitoring" tab, show active runs count on "Scraping" tab
   - Show progress bar or spinner when scrapes are active
   - Same for consolidations on "Consolidating" tab

2. **Images in Finalizing**
   - Image selection happens in Finalizing stage
   - Product cards show image gallery
   - Click to select/change images inline
   - No separate "Images" tab needed

3. **Export as Action**
   - Export button in toolbar (top right)
   - Always available
   - Filtered by current stage
   - Opens export dialog/modal

4. **Visual Flow Indicator**
   - Keep the flow visualization at top
   - Shows where you are in the pipeline
   - Click to navigate between stages
   - Clearer than tabs alone

5. **Stage-Specific Context**
   - Each stage shows only relevant actions
   - No confusion about what to do next
   - Clear CTAs per stage:
     - Imported: "Run Scrapers"
     - Scraping: Shows progress
     - Consolidating: "Run AI Consolidation"
     - Finalizing: "Approve Selected" / "Reject Selected"
     - Published: "View on Storefront"
     - Failed: "Retry Failed"

## Technical Changes

### Component Restructuring

```
components/admin/pipeline/
├── UnifiedPipelineClient.tsx      # New main component
├── WorkflowTabs.tsx               # Single tab bar (replaces StageTabs)
├── PipelineStageContent.tsx       # Stage-specific content
├── InlineMonitoring.tsx           # Active jobs indicator
├── ProductReviewCard.tsx          # Finalizing product card with images
├── ExportButton.tsx               # Export action (existing, keep)
├── PipelineFlowVisualization.tsx  # Keep and enhance
└── [other supporting components]
```

### Type Changes

```typescript
// Simplify PipelineStage to just workflow stages
export type PipelineStage = 
  | "imported" 
  | "scraping"      // Replaces monitoring
  | "consolidating" // Replaces scraped + active-consolidations
  | "finalizing"    // Replaces finalized + images
  | "published"
  | "failed";

// Remove DERIVED_PIPELINE_TABS entirely
// Remove LEGACY_PIPELINE_TABS
// Keep only workflow stages
```

### Route Changes

```
app/admin/pipeline/
├── page.tsx                    # Main pipeline (UnifiedPipelineClient)
├── actions.ts                  # Server actions for transitions
└── [no sub-routes needed]      # Everything in one view
```

### Data Fetching Changes

1. **Imported**: Products with `pipeline_status: 'imported'`
2. **Scraping**: Active scrape jobs (from job queue) + products being scraped
3. **Consolidating**: Products with `pipeline_status: 'scraped'` + active consolidations
4. **Finalizing**: Products with `pipeline_status: 'finalized'`
5. **Published**: Derived from `products` storefront table
6. **Failed**: Products with `pipeline_status: 'failed'`

## Implementation Strategy

### Phase 1: Foundation (Week 1)
1. Create new `WorkflowTabs` component
2. Update `PipelineStage` types
3. Create `PipelineStageContent` component
4. Update data fetching for new stages

### Phase 2: Inline Monitoring (Week 1-2)
1. Create `InlineMonitoring` component
2. Integrate into Scraping and Consolidating tabs
3. Remove old MonitoringClient and tabs

### Phase 3: Finalizing Integration (Week 2)
1. Merge image selection into Finalizing stage
2. Update ProductCard to show images inline
3. Remove Images tab

### Phase 4: Export Refactor (Week 2)
1. Move Export to toolbar action
2. Remove Export tab
3. Update ExportWorkspace to modal/dialog

### Phase 5: Polish (Week 3)
1. Enhance PipelineFlowVisualization
2. Add stage-specific CTAs
3. Update tests
4. Documentation

## Migration Path

1. **Gradual Rollout**
   - Keep old components alongside new ones initially
   - Feature flag to switch between old/new UI
   - Test with internal users first

2. **Data Compatibility**
   - Statuses remain the same (imported, scraped, finalized, failed)
   - Only UI representation changes
   - No database migration needed

3. **Backward Compatibility**
   - URL params for filtering still work
   - API endpoints unchanged
   - Bulk actions remain the same

## Success Metrics

- Reduced clicks to complete product workflow
- Fewer user support questions about "where do I..."
- Faster time-to-publish for products
- Higher user satisfaction scores

## Open Questions

1. Should "Scraping" and "Consolidating" show products or just monitoring info?
   - **Decision**: Show both - products in progress at top, monitoring below

2. How to handle products in multiple states?
   - **Decision**: Product only appears in one stage at a time

3. Should failed products appear in their original stage + Failed tab?
   - **Decision**: Only in Failed tab, with link to retry from original stage

4. Export filtering - export all or just current stage?
   - **Decision**: Default to current stage, option for all

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| User confusion during transition | Gradual rollout with feature flags |
| Performance issues with inline monitoring | Paginate monitoring lists, lazy load |
| Image selection UX in Finalizing | User testing before full rollout |
| Breaking existing bookmarks | URL redirects for old tab names |

## Appendix: Visual Mockup Description

### Header
```
[Bay State Logo]  Pipeline  [Search] [Export Button] [Import Button]
```

### Flow Visualization (horizontal)
```
[● Imported (12)] → [○ Scraping (2 active)] → [○ Consolidating (0)] → [○ Finalizing (8)] → [○ Published (156)] → [○ Failed (1)]
```

### Tab Content Area (example: Finalizing)
```
┌─────────────────────────────────────────────────────────────┐
│ Finalizing (8 products awaiting review)                     │
│ [Approve Selected] [Reject Selected] [Delete]              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌───────────────────────────────────────────────────────┐  │
│ │ Product Card: Widget ABC                              │  │
│ │ ┌─────┐ ┌─────┐ ┌─────┐                              │  │
│ │ │ img │ │ img │ │ img │  ← Click to select           │  │
│ │ └─────┘ └─────┘ └─────┘                              │  │
│ │ Name: [Widget ABC            ] Price: [$12.99       ]│  │
│ │ [Edit Details] [✓ Approve] [✗ Reject]                │  │
│ └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

This design aligns with the mental model: products flow through stages, each stage has specific work to do, and the UI guides users through that work naturally.
