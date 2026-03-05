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
