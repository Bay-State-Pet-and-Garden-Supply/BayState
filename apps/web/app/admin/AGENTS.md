# ADMIN PORTAL

**Context:** 22+ module management interface for products, scrapers, B2B, analytics.

## OVERVIEW
Mobile-first data-heavy dashboard: product CRUD, scraper orchestration, B2B sync, business metrics.

**Stack:** Next.js App Router, Server Components, Supabase RLS, shadcn/ui, @tanstack/react-table.

## STRUCTURE
```
app/admin/
├── products/         # CRUD, variants, images, pricing
├── scrapers/         # YAML config, test runner
├── scraping/         # Job queue, history, callbacks
├── migration/        # ShopSite sync tools
├── brands/           # Management, logos, SEO
├── categories/       # Hierarchy, taxonomy
├── orders/           # Fulfillment, history
├── customers/        # Profiles, support
├── analytics/        # Sales, traffic, conversion
├── quality/          # Flagged products, manual review
├── b2b/              # Portal configuration
├── scraper-network/  # Runner health monitoring
├── pipeline/         # Job scheduling, monitoring
├── promotions/       # Discounts, coupons
├── services/         # Rentals, refills catalog
├── tools/            # Utility tools
└── [10 more modules]
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| **Product CRUD** | `app/admin/products/` |
| **Scraper Config** | `app/admin/scrapers/` |
| **Job Queue** | `app/admin/scraping/` |
| **B2B Sync** | `app/admin/migration/` |
| **Analytics** | `app/admin/analytics/` |
| **Quality Review** | `app/admin/quality/` |

## PATTERNS
- **Routes**: `page.tsx` (lists), `[id]/page.tsx` (details), `actions.ts` (mutations)
- **Tables**: `@tanstack/react-table` with server-side filtering/pagination
- **Components**: `components/admin/` mirrors `app/admin/` structure
- **Auth**: RBAC via `lib/auth/admin.ts`, middleware redirects to `/admin/login`

## ANTI-PATTERNS
- **NO** client-side data fetching (use Server Components)
- **NO** inline tables (use react-table)
- **NO** bypassing RLS or direct DB mutations in components

## PIPELINE STRUCTURE (v2 - Unified)

### Components
```
components/admin/pipeline/
├── UnifiedPipelineClient.tsx   # Main orchestrator
├── PipelineHeader.tsx          # Title, subtitle, actions
├── PipelineStats.tsx           # 5 status cards with counts
├── PipelineProductGrid.tsx     # Product cards with selection
├── PipelineActions.tsx         # Bulk action toolbar
├── StatusFilter.tsx            # Status dropdown filter
├── PipelineProductCard.tsx     # Individual product card
├── PipelineFilters.tsx         # Search and additional filters
├── PipelineToolActions.tsx     # Import/Export/Images buttons
├── MonitoringClient.tsx         # Active runs/consolidations
├── RetryButton.tsx              # Retry failed products
├── DeleteConfirmationDialog.tsx # Delete confirmation modal
├── ConsolidationDetailsModal.tsx # Review consolidation details
├── BatchEnhanceToolbar.tsx     # AI enhancement toolbar
├── BulkActionsToolbar.tsx       # Bulk action operations
├── ExportTab.tsx                # Export functionality
├── ImageSelectionTab.tsx        # Image management
├── ImageSelector.tsx            # Image picker component
├── BatchJobsPanel.tsx           # Background job status
└── UndoToast.tsx                # Undo notification
```

### Routes
```
app/admin/
├── pipeline/
│   ├── page.tsx                 # Main pipeline view (UnifiedPipelineClient)
│   ├── monitoring/
│   │   └── page.tsx             # Active runs & consolidations
│   └── tools/
│       └── page.tsx             # Import/Export/Images tools
```

### Status Flow
1. **Imported (staging)** - Products from Integra import
2. **Enhanced (scraped)** - Web scraper enriched data
3. **Ready for Review (consolidated)** - AI merged, needs review
4. **Verified (approved)** - Manually approved
5. **Live (published)** - Published to storefront
6. **Failed** - Processing error

### Key Patterns
- Status filtering via URL query params (`?status=staging`)
- Bulk actions: Approve, Reject, Delete
- Real-time monitoring via WebSocket
- Undo support for destructive actions
