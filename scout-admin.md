# Admin UI Scout Report

## 1. Admin Routes Overview

**Structure:** `apps/web/app/admin/` with 27 route modules, plus shared components in `apps/web/components/admin/`.

**Navigation sections (from sidebar at `components/admin/navigation.ts`):**

| Section | Routes | 
|---------|--------|
| **Operations** | Dashboard (`/admin`), Pipeline (`/admin/pipeline`), Runner Health (`/admin/pipeline/runners`), Quality Review (`/admin/quality`), Orders |
| **Catalog** | Products, Product Groups, Pre-order Groups, Brands, Categories, Services |
| **Storefront** | Pages, Design, Promotions, Reviews, Customers |
| **System** | Settings, Users, B2B Feeds, Migration, Reporting |

**Route archetype (from AGENTS.md):** Queue View (lists + filters + bulk actions) or Workspace View (sidebar + focused editor). Every route has an explicit page title, description, and icon via `AdminPageShell`.

---

## 2. Brand Management (`/admin/brands`)

**Type: Queue View**

### Page
- `apps/web/app/admin/brands/page.tsx` — Server component; fetches all brands from Supabase `brands` table, passes to `AdminBrandsClient`.

### Client Component
- `apps/web/components/admin/brands/AdminBrandsClient.tsx` (lines 1-249): DataTable with columns for Logo, Brand Name, Slug, Created. Supports select + bulk delete, inline edit via `BrandModal`, delete via confirmation dialog.
- `apps/web/components/admin/brands/BrandModal.tsx` (lines 1-310): Form dialog with fields: name, slug, logo_url, description, official_domains (comma-separated). Auto-slug generation from name. Includes "Official Brand Settings" panel explaining that URLs must match official domains for extraction. Ctrl+S shortcut.

### Server Actions
- `apps/web/app/admin/brands/actions.ts` (lines 1-190): `createBrand`, `updateBrand`, `deleteBrand`. On save, calls `syncOfficialBrandSource()` which upserts/removes a record in `brand_sources` table for the `official_brand` source type — this links brands to scraping sources.

### Types
- `apps/web/components/admin/brands/types.ts` — re-exports `Brand` from `@/lib/types` (id, name, slug, logo_url, description, official_domains, preferred_domains, created_at).

### Data Model
- **Table:** `brands` — core brand record.
- **Table:** `brand_sources` — linked via `brand_id` + `source_type: 'official_brand'`. Stores domains, crawl adapter slug (`crawl4ai_direct`), search mode, allowed fields, priority.
- **Schema:** `brands(id, name, slug, logo_url, description, official_domains, preferred_domains, created_at)`

**Key observation:** Brands drive scraping eligibility. Without a brand + `official_domains`, extraction is blocked (see `scrapeSelectionValidation` in PipelineClient — returns `"Missing Brand"` or `"Missing Brand Domains"` errors). The brand-sources linkage is the bridge between brand management and the scraping pipeline.

---

## 3. Product Review / Approval Pipeline (`/admin/pipeline`)

**Type: Workspace View with stage tabs**

### Pipeline Stages
```
imported → extracting → processed → merging → reviewing → publishing → failed
```

Each stage has its own view component rendered conditionally in `PipelineClient.tsx`.

### Pipeline Overview
- `apps/web/app/admin/pipeline/page.tsx` — Server component; fetches products by stage, status counts, available sources. URL query params for `stage`, `search`, `source`, `product_line`, `cohort_id`.
- `apps/web/components/admin/pipeline/PipelineClient.tsx` (1683 lines) — Main orchestrator. Manages stage switching, selection state, search/filter sync to URL, bulk actions, scrape dialog, consolidate submit, publish/export flows. Uses `adminFetch` for API calls.

### Stage Views

| Stage | Component | Purpose |
|-------|-----------|---------|
| `imported` | `ImportedResultsView` | View imported CSV/manual products, assign brands, start scraping |
| `extracting` | `ActiveEnrichmentsTab` | Live enrichment monitoring (no product list, operational) |
| `processed` | `ProcessedResultsView` | Review extraction results, select images, consolidate to AI |
| `merging` | `ActiveConsolidationsTab` | Active consolidation batch monitoring (operational) |
| `reviewing` | `ReviewingResultsView` (2001 lines) | Final draft editing, image selection, brand assignment, copilot, publish |
| `publishing` | `ImportedResultsView` (reused) | Published products, export/zip/ShopSite upload |
| `failed` | (in ImportedResultsView) | Failed products for retry |

### Scraped Results View (`ScrapedResultsView.tsx`)
- `apps/web/components/admin/pipeline/ScrapedResultsView.tsx` (∼650 lines)
- **Split-panel layout:** Left sidebar (product list with search/filter + cohort accordions) + Right detail panel
- **Right panel features:** Source tabs (one per scraper source), image carousel with navigation arrows, technical specs grid, raw JSON view, provenance badges ("Static scraper" vs "Fallback SERPER/AI")
- Source deletion + image retry support
- Keyboard nav: ArrowLeft/ArrowRight to switch sources, Backspace to delete source

### Reviewing Results View (`ReviewingResultsView.tsx`)
- `apps/web/components/admin/pipeline/ReviewingResultsView.tsx` (2001 lines)
- **Full workspace** with product list sidebar, image carousel, product info form, merchandising classification, save/publish/reject actions
- **Draft system:** In-memory `FinalizationDraft` per product — dirty tracking against saved drafts, auto-save on product switch
- **Copilot integration:** `ReviewingCopilotPanel` — AI-assisted tools for bulk name transforms, brand assignment, image selection, source management
- **Stage changes:** Can update fields, save draft, publish to storefront, or reject back to "processed" stage
- Ctrl+S to save, Ctrl+Enter to save+publish

### Data Model
- **Table:** `products_ingestion` — full pipeline product lifecycle
- Fields: `upc`, `input` (JSON), `sources` (JSON), `consolidated` (JSON), `pipeline_status`, `brand_id`, `cohort_id`, `image_candidates`, `selected_images`, `confidence_score`, `error_message`, `retry_count`, etc.
- The `consolidated` JSON stores the final product data after AI consolidation and manual edits.

---

## 4. Quality Review (`/admin/quality`)

**Type: Queue View**

### Page
- `apps/web/app/admin/quality/page.tsx` — Renders `QualityDashboard` + `QualityIssueTable`.

### Quality Dashboard
- `apps/web/components/admin/quality/QualityDashboard.tsx` — Stat cards (Total, Healthy, Issues, Updated Today), Completeness Distribution bar chart, Issue Breakdown (by field: name, price, description, images, brand), Issues by Pipeline Status.
- Data from `/api/admin/quality` endpoint.

### Quality Issue Table
- `apps/web/components/admin/quality/QualityIssueTable.tsx` — Searchable/filterable list of products with data quality issues. Severity badges (required/recommended). Shows completeness %, pipeline status. Quick-fix button for title-casing names. Links to pipeline detail.

### Server Actions
- `apps/web/app/admin/quality/actions.ts` — `titleCaseProductName`, `bulkTitleCaseNames`, `assignDefaultBrand`, `updateConsolidatedField`.

---

## 5. Existing Crawl Status / URL Index / Product Drafts

### Crawl Status
- **No dedicated "Crawl Status" panel** exists. The closest is `ActiveEnrichmentsTab` (extracting stage) + `ActiveConsolidationsTab` (merging stage), which show live operational views.
- Pipeline monitoring at `/admin/pipeline/monitoring` uses `MonitoringClient` for active scraper runs and consolidation activity.
- `/admin/pipeline/runners` shows scraper runner health (runner management panel, statistics, run history).

### URL Index
- **No "URL Index" panel exists.** Brand sources are configured through the brands modal (`official_domains`), which syncs to `brand_sources` table. But there's no admin UI for managing, browsing, or reviewing the URL index itself.
- The deprecated `/admin/pipeline/official-brand` page confirms it was replaced by "Approved Source Extraction" but the old URL review workflow has no replacement panel.

### Product Drafts
- Drafts exist **implicitly** within the `ReviewingResultsView` workspace — they're React state (`FinalizationDraft`) attached to each `PipelineProduct` in the reviewing stage.
- No explicit "Product Drafts" page or route. Drafts are in-memory with auto-save-on-switch behavior.
- `FinalizationDraft` type tracks: name, description, price, brand_id, brandName, selectedImages, sources, custom fields, categories, facets, etc.

---

## 6. Admin AGENTS.md Conventions

From `apps/web/app/admin/AGENTS.md`:
- **One route, one shell** — explicit page title, purpose statement, stable control area.
- **Queue View** (lists, bulk actions, filters) or **Workspace View** (sidebar + focused editor/reviewer).
- **One control surface per concern** — no duplicate buttons or hidden secondary control strips.
- **Quiet utilitarian styling** — Bay State colors as accents, sturdy borders, direct labels.
- **Visible guidance** — stage meaning, active filters, keyboard shortcuts, risky states readable on screen.
- **Workspace safety** — high-impact actions explicit and reversible, avoid plain Enter-to-approve.
- Pipeline stage-level search/filter state in URL (`stage`, `search`, `source`, `product_line`, `cohort_id`).
- Copilot embedded in workspace, not floating.

---

## 7. Need-Gap Analysis

| Feature | Existing | Gap |
|---------|----------|-----|
| Brand CRUD | Full (create/edit/delete + official domains + brand_sources sync) | — |
| Brand approval | None | No approval workflow for new brands |
| Source review (scraped) | Per-product source tab switcher in ScrapedResultsView | No "all sources" overview or cross-vendor comparison |
| Product review | Full workspace in ReviewingResultsView with draft system | — |
| Crawl status | Operational tabs (extracting/merging) + monitoring page | No persistent crawl status dashboard or URL-level crawl history |
| URL index | None | Brands have `official_domains` in DB, but no admin panel to browse/manage the URL index |
| Product drafts | In-memory only in ReviewingResultsView | No persistent draft storage or draft browsing separate from pipeline |
| Bulk operations | Selection + bulk actions per stage | — |
| Image selection | Dedicated workspace at `/admin/pipeline/image-selection?upc=` + inline in ReviewingResultsView | — |
| Source provenance | Badged in ScrapedResultsView (static_scraper vs fallback_serper_ai) | — |

### Files That Would Need Changes for a New Feature

| New Feature | Likely Files |
|-------------|-------------|
| URL index panel | New route `app/admin/pipeline/url-index/`, new component `components/admin/pipeline/UrlIndexPanel.tsx`, new API route `app/api/admin/pipeline/url-index/` |
| Crawl status dashboard | New route or extension to monitoring, likely `MonitoringClient.tsx` + new sub-components |
| Product drafts browser | Potential new route or tab within pipeline, leveraging existing `FinalizationDraft` types |
| Brand approval workflow | New status field on brands table + filter in brand list + approval UI in `AdminBrandsClient` or `BrandModal` |
| Cross-source comparison | Could extend `ScrapedResultsView.tsx` or build into `ProcessedResultsView.tsx` |
