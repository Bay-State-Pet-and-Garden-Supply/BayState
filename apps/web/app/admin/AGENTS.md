# ADMIN PORTAL

**Context:** 26-module management interface for products, scrapers, B2B, analytics, pipeline.

## OVERVIEW
Mobile-first data-heavy dashboard: product CRUD, scraper orchestration, B2B sync, pipeline management, business metrics.

**Stack:** Server Components, Supabase RLS, shadcn/ui, @tanstack/react-table.

## STRUCTURE
```
app/admin/
├── (auth)/           # Admin login/login flow
├── analytics/        # Sales, traffic, conversion
├── b2b/              # Portal configuration
├── brands/           # Management, logos, SEO
├── categories/       # Hierarchy, taxonomy
├── cohorts/          # Pipeline cohorts
├── customers/        # Profiles, support
├── design/           # Theme/design settings
├── enrichment/       # AI enrichment tools
├── health/           # System health monitoring
├── inventory/        # Stock management
├── migration/        # ShopSite sync tools
├── orders/           # Fulfillment, history
├── pages/            # CMS pages
├── pipeline/         # Job scheduling, monitoring
├── preorder-groups/  # Preorder management
├── product-groups/   # Product groups
├── products/         # CRUD, variants, images, pricing
├── promotions/       # Discounts, coupons
├── quality/          # Flagged products, manual review
├── reviews/          # Product reviews
├── scrapers/         # YAML config, test runner, runs
├── services/         # Services catalog (rentals, refills)
├── settings/         # System settings
├── tools/            # Utility tools
└── users/            # Admin user management
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| **Product CRUD** | `app/admin/products/` |
| **Scraper Config** | `app/admin/scrapers/` |
| **Job Queue** | `app/admin/scrapers/runs/` |
| **B2B Sync** | `app/admin/b2b/` |
| **ShopSite Export** | `app/admin/migration/` |
| **Scraper Lab (Testing)** | `app/admin/scrapers/` → Testing tab |
| **B2B Portal Config** | `app/admin/b2b/` |
| **Analytics** | `app/admin/analytics/` |
| **Quality Review** | `app/admin/quality/` |

## PATTERNS
- **Routes**: `page.tsx` (lists), `[id]/page.tsx` (details), `actions.ts` (mutations)
- **Tables**: `@tanstack/react-table` with server-side filtering/pagination
- **Components**: `components/admin/` mirrors `app/admin/` structure
- **Auth**: RBAC via `lib/auth/roles.ts`, layout-level redirect to `/admin/(auth)/login`

## ANTI-PATTERNS
- **NO** client-side data fetching (use Server Components)
- **NO** inline tables (use react-table)
- **NO** bypassing RLS or direct DB mutations in components

## ADMIN DESIGN PHILOSOPHY
- **One route, one shell**: Every admin route should have an explicit page title, short purpose statement, and one stable control area before the main content.
- **Two route archetypes only**: Prefer either a **Queue View** (lists, bulk actions, filters) or a **Workspace View** (sidebar + focused editor/reviewer). Do not mix multiple competing page types in one screen.
- **One control surface per concern**: Search, filters, batch actions, and destructive actions should each live in one consistent place. Avoid duplicate buttons, floating helpers, or hidden secondary control strips.
- **Quiet utilitarian styling**: Use Bay State colors as accents, not decoration. Favor sturdy borders, restrained fills, clear spacing, and direct labels over generic "AI dashboard" treatments.
- **Visible guidance over hidden semantics**: Stage meaning, active filters, keyboard shortcuts, and risky states should be readable on screen. Do not hide important context in tooltips or `sr-only` text.
- **Workspace safety first**: In review flows, high-impact actions must be explicit and reversible where possible. Avoid plain Enter-to-approve patterns or stacked confirmation surfaces.

## PIPELINE
Main route: `app/admin/pipeline/page.tsx`

Main orchestrator: `components/admin/pipeline/PipelineClient.tsx`

Key workspaces:
- `ScrapedResultsView.tsx` for source review
- `FinalizingResultsView.tsx` for final product editing and approval
- `ExportWorkspace.tsx` for ShopSite/export tooling

**Status Flow:** Imported → Scraping → Scraped → Consolidating → Finalizing → Exporting → Failed

**Pipeline rules:**
- Treat `scraping` and `consolidating` as operational monitoring views.
- Treat `scraped` and `finalizing` as workspace views with their own focused sidebars.
- Keep stage-level search/filter state in the URL (`stage`, `search`, `source`, `product_line`, `cohort_id`) and clear it when moving between stages.
- Use cohort names as human-friendly **batch** labels whenever possible; avoid exposing raw UUIDs unless the ID itself is the point.
- Keep copilot assistance embedded in the workspace, not as a floating global CTA.
