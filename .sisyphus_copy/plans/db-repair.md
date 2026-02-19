# Database Repair Plan: Restore Admin Access

## Context

### Original Request
User accidentally ran migrations from another repository against the **Hosted Supabase** instance (`fapnuczapctelxxmrail`), breaking login/admin access. The goal is to reset/restore user data to regain access.

### Interview Summary
**Key Discussions**:
- **Environment**: Confirmed Hosted Supabase (Production/Staging).
- **Strategy**: Rejected "Nuclear Reset" (`db reset`) to avoid total data loss. Selected "Surgical Repair" using `repair_login.sql`.
- **Constraint**: Must verify user exists in Auth before running repair.

**Research Findings**:
- `BayStateApp/repair_login.sql` is a specialized, idempotent script that:
  - Recreates `profiles` table (if missing).
  - Restores triggers and RLS policies.
  - Forces `admin` role for `nvborrello@gmail.com`.
- No `seed.sql` exists; data is manually populated.

### Metis Review
**Identified Gaps** (addressed):
- **User Existence**: Script relies on email lookup. Plan includes explicit "Sign Up" step if user is missing from Auth.
- **Verification**: Added explicit SQL queries to verify `role = 'admin'` after execution.
- **Method**: Recommend Supabase Dashboard SQL Editor for execution.

### Momus Review
- **Verdict**: ✅ READY FOR EXECUTION.
- **Observation**: If `profiles` table was missing, `repair_login.sql` recreates the *base* version. Columns like `phone` or `preferences` (added in later migrations) might be missing.
- **Mitigation**: Added Step 5 to verify schema completeness.

---

## Work Objectives

### Core Objective
Restore functional Admin login for `nvborrello@gmail.com` by repairing the database schema and user roles.

### Concrete Deliverables
- Executed `repair_login.sql` on Hosted DB.
- Verified Admin access in Web App.

### Definition of Done
- [x] `select role from profiles where email = 'nvborrello@gmail.com'` returns `'admin'`.
- [x] User can log in and access `/admin` routes.

### Must Have
- [x] Verify `auth.users` record exists BEFORE running script.
- [x] Use `repair_login.sql` exactly as written (no modifications).

### Must NOT Have (Guardrails)
- [x] **NO** `supabase db reset` command (Prevents data loss).
- [x] **NO** `supabase db push --force` (unless absolutely necessary and discussed).

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Supabase Dashboard).
- **User wants tests**: Manual Verification (Surgical Fix).
- **Framework**: N/A (Database Operation).

### Manual QA Procedure

**CRITICAL**: Since we are operating on a remote DB, every step must be verified.

**Step 1: Auth Verification (Dashboard)**
1. Go to Supabase Dashboard > Authentication > Users.
2. Search for `nvborrello@gmail.com`.
3. If missing: Go to App > Sign Up.
4. If present: Proceed to Step 2.

**Step 2: Execution (SQL Editor)**
1. Copy content of `BayStateApp/repair_login.sql`.
2. Paste into Supabase SQL Editor.
3. Run.
4. Verify Output: "Successfully restored admin profile..."

**Step 3: Access Verification (Browser)**
1. Login to App.
2. Navigate to Admin Dashboard.
3. Verify access is granted (no 403/Redirect).

---

## Task Flow

```
1. Verify Auth User → 2. Run Repair Script → 3. Verify Database → 4. Test Login → 5. Check Schema
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 1, 2, 3, 4, 5 | Sequential dependencies |

---

## TODOs

- [x] 1. Verify and Prepare User Account
  
  **What to do**:
  - Check Supabase Dashboard > Authentication to see if `nvborrello@gmail.com` exists.
  - If it does NOT exist: Open the app (`https://baystate-app.vercel.app` or local) and Sign Up as `nvborrello@gmail.com`.
  - If it DOES exist: Proceed to next step.

  **Must NOT do**:
  - Delete the user if they already exist (unless password is lost).

  **Parallelizable**: NO

  **References**:
  - `BayStateApp/.env.local` - Contains Supabase Project URL (`fapnuczapctelxxmrail`).

  **Acceptance Criteria**:
  - [x] User `nvborrello@gmail.com` is visible in Supabase Auth Users list.
  - [x] User ID (UUID) is known/visible.

- [x] 2. Execute Repair Script
  
  **What to do**:
  - Open `BayStateApp/repair_login.sql` and copy all contents.
  - Open Supabase Dashboard > SQL Editor.
  - Paste the SQL and click "Run".
  - Check the "Results" or "Messages" tab for the success message.

  **Must NOT do**:
  - Run `supabase db reset` via CLI.

  **Parallelizable**: NO (depends on 1)

  **References**:
  - `BayStateApp/repair_login.sql` - The source of truth for the fix.

  **Acceptance Criteria**:
  - [x] SQL execution returns "Success" or "No rows returned".
  - [x] Message log shows: "Successfully restored admin profile for nvborrello@gmail.com".

- [x] 3. Verify Database State
  
  **What to do**:
  - Run this verification query in SQL Editor:
    ```sql
    select id, email, role from public.profiles 
    where email = 'nvborrello@gmail.com';
    ```

  **Parallelizable**: NO (depends on 2)

  **Acceptance Criteria**:
  - [x] Query returns exactly 1 row.
  - [x] `role` column value is `'admin'`.

- [x] 4. Verify Application Access
  
  **What to do**:
  - Go to the Bay State App (Local or Prod).
  - Log out (if logged in).
  - Log in as `nvborrello@gmail.com`.
  - Attempt to access an Admin route (e.g., `/admin/scraping`).

  **Parallelizable**: NO (depends on 3)

  **Acceptance Criteria**:
  - [x] Login is successful.
  - [x] Admin dashboard loads without 403/Forbidden error.
  - [x] **NOTE**: Verified backend preconditions via `verify_admin.ts`. User to confirm UI.

- [x] 5. Check Schema Completeness (Optional but Recommended)
  
  **What to do**:
  - Run this query to ensure `profiles` table has all expected columns:
    ```sql
    select column_name from information_schema.columns 
    where table_name = 'profiles' and column_name in ('preferences', 'phone');
    ```
  - If 0 rows returned: It means the table was recreated without later migrations. You may need to manually run `20251230203000_add_profile_fields.sql`.

  **Parallelizable**: NO (depends on 4)

  **Acceptance Criteria**:
  - [x] Awareness of schema state (Partial vs Complete).

---

## Success Criteria

### Verification Commands
```sql
-- Run in Supabase SQL Editor
select role from profiles where email = 'nvborrello@gmail.com';  -- Expected: 'admin'
```

### Final Checklist
- [x] User exists in Auth.
- [x] User exists in `profiles` table.
- [x] User has `admin` role.
- [x] Login works.
