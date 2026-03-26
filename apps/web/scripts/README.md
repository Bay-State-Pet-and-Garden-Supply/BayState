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
