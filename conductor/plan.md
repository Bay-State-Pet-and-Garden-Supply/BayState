# Admin Panel UI/UX Refactor Plan

## Objective
Address the critiques and violations identified by the UI/UX Pro Max review. The goal is to enforce token-driven theming, improve component performance via code-splitting, upgrade forms for better real-time user feedback, and improve the resilience of runner communication regarding large SKU payloads.

## Key Files & Context
- **Global Styling:** `apps/web/tailwind.config.ts` (or `apps/web/app/globals.css`)
- **Forms & Theming:** `apps/web/components/admin/pipeline/ManualAddProductDialog.tsx`
- **Performance & Empty States:** `apps/web/components/admin/pipeline/PipelineClient.tsx`
- **Runner Data Density:** `apps/web/app/api/scraper/v1/job/route.ts` and `/claim-chunk/route.ts`

## Implementation Steps

### 1. Token-Driven Theming (Style Selection)
- **Action:** Replace hardcoded hex colors (e.g., `#008850`) in the codebase.
- **Details:** 
  - Add a semantic color token like `brand-green` or `primary` into the Tailwind configuration or CSS variables.
  - Update `ManualAddProductDialog.tsx` to use the new semantic tokens (`text-brand-green`, `bg-brand-green`, `hover:bg-brand-green/90`).
  - Search for other occurrences of `#008850` in `apps/web/components/admin/` and replace them.

### 2. Form Refactoring & Real-time Validation (Forms & Feedback)
- **Action:** Upgrade `ManualAddProductDialog.tsx` to use `react-hook-form` and `zod`.
- **Details:**
  - Define a Zod schema for the form (e.g., SKU required, Name required, Price optional but formatted correctly).
  - Implement real-time validation (validate on blur/change).
  - Add persistent helper text `<p>` elements below complex inputs (like SKU format expectations).
  - Maintain the existing accessible `isSubmitting` disabled state and toast notifications.

### 3. Component Code-Splitting & Empty States (Performance & Feedback)
- **Action:** Refactor `PipelineClient.tsx` to improve performance and user experience.
- **Details:**
  - Use `next/dynamic` to lazy-load heavy dialog components (`ScraperSelectDialog`, `ManualAddProductDialog`, `IntegraImportDialog`) so they do not bloat the initial JavaScript bundle.
  - Create or implement an explicit "Empty State" component for when `filteredProducts.length === 0` (especially after applying a source filter). It should include a clear message, an illustration/icon (e.g., `PackageOpen`), and a "Clear Filters" button.

### 4. Runner Communication Resilience (Data Density)
- **Action:** Review and optimize SKU payload handling in job assignments.
- **Details:**
  - Inspect `apps/web/app/api/scraper/v1/job/route.ts`. If it currently sends large arrays of `skus` directly in the job response, assess the risk of Vercel timeouts.
  - Formulate a migration (if not already fully implemented) to ensure the `/job` endpoint returns job metadata/configuration, while runners pull SKUs iteratively via the `/claim-chunk` endpoint.

## Verification & Testing
- **Visual Verification:** Check `ManualAddProductDialog` in both light and dark modes to ensure the semantic color adapts properly (if applicable) and contrast is maintained.
- **Form Validation:** Manually test adding a product, ensuring inline validation triggers on blur and prevents submission with invalid data.
- **Bundle Size:** Run a local build (`npm run build`) and verify that dialogs in `PipelineClient.tsx` are correctly code-split.
- **Empty State:** Apply a filter that returns no results in the Pipeline view and verify the Empty State renders correctly and the "Clear Filters" action works.