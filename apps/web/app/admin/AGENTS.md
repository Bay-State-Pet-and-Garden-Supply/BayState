# ADMIN PORTAL

**Context:** 26-module management interface for products, scrapers, B2B, analytics, pipeline.

## OVERVIEW
Mobile-first data-heavy dashboard: product CRUD, scraper orchestration, B2B sync, pipeline management, business metrics.

**Stack:** Server Components, Supabase RLS, shadcn/ui, @tanstack/react-table.

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

## PIPELINE (v2 - Unified)
Main orchestrator: `components/admin/pipeline/UnifiedPipelineClient.tsx` (20+ sub-components).

Routes: `pipeline/page.tsx` (main), `pipeline/monitoring/` (active runs), `pipeline/tools/` (import/export).

**Status Flow:** Imported → Enhanced → Ready for Review → Verified → Live → Failed

**Key Patterns:**
- Status filtering via URL query params (`?status=staging`)
- Bulk actions: Approve, Reject, Delete with undo
- Real-time monitoring via WebSocket
- Batch AI enhancement toolbar
