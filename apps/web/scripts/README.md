# BayStateApp Scripts

This directory contains utility scripts for maintaining and verifying the BayStateApp.

## Admin Verification (`verify_admin.ts`)

Use this script to verify that your user (`nvborrello@gmail.com`) has the correct `admin` role in the hosted Supabase database.

### Prerequisites
- You must have `.env.local` in the `BayStateApp` root directory.
- `.env.local` must contain:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Usage
Run from the repository root:

```bash
npx tsx BayStateApp/scripts/verify_admin.ts
```

### Output
- **✅ Profile Found**: User exists in `profiles` table.
- **🎉 SUCCESS**: User has `admin` role.
- **❌ FAILURE**: User has incorrect role (e.g., `customer`).
- **❌ Profile NOT FOUND**: User is missing from `profiles` table.

## Manual SQL Scripts (in `../`)

- `repair_login.sql`: Restores the `profiles` table and forces admin role. Run in Supabase Dashboard.
- `fix_profiles_schema.sql`: Adds missing columns (phone, preferences, etc.) if `repair_login.sql` recreated the table. Run AFTER repair.

## Login-Protected Image Backfill (`backfill-login-protected-images.ts`)

Use this script to clean broken login-only image URLs out of `products_ingestion` rows for login-protected scrapers, then queue replacement scrape jobs for the affected SKU/source combinations.

### Usage

Run from `apps/web` so local scraper configs resolve correctly:

```bash
cd apps/web
bun scripts/backfill-login-protected-images.ts --limit 100
```

Dry runs are the default. Add `--execute` to persist the cleanup and queue the replacement scrapes.

## Amazon Image Duplicate Backfill (`backfill-amazon-image-duplicates.ts`)

Use this script to remove duplicate Amazon main images from already-scraped `products_ingestion` rows, prune stale derived image arrays, and sync published storefront product images when the pipeline row is already published.

### Usage

Run from `apps/web`:

```bash
cd apps/web
bun scripts/backfill-amazon-image-duplicates.ts --limit 100
```

Dry runs are the default. Add `--execute` to persist the cleanup.

## Gemini Migration Utilities

These scripts support the Gemini rollout plan, shadow-run evaluation, and rollback operations.

### Golden Dataset Generation

```bash
cd apps/web
bun scripts/generate-golden-dataset.ts
```

This exports the current `products_ingestion` consolidation corpus to `tests/fixtures/golden-dataset.jsonl`. The live data source is currently smaller than the original 1000-row target, so the generator reports the remaining gap instead of fabricating records.

### Golden Dataset Validation

```bash
cd apps/web
bun scripts/validate-golden-dataset.ts
```

Add `--strict` to fail when the dataset is below the requested minimum size or contains validation warnings.

### Side-by-Side Provider Evaluation

```bash
cd apps/web
bun scripts/evaluate-golden-dataset.ts --providers openai,gemini --limit 10
```

This runs live structured-output evaluations against the selected providers and compares them to the golden dataset expectations.

### Feature Flag Management

```bash
cd apps/web
bun scripts/manage-gemini-flags.ts --get
```

Use this to inspect or update the Gemini rollout flags stored in `site_settings`.

### Monitoring Snapshot

```bash
cd apps/web
bun scripts/gemini-migration-monitoring.ts --days 7
```

This prints a provider-neutral rollout snapshot that can also be captured by the root rollout and rollback shell scripts.
