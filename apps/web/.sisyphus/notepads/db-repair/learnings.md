# Learnings for db-repair Plan

- [Convention]: Database operations on Hosted Supabase must be done via Dashboard SQL Editor or linked CLI.
- [Security]: `.env.local` keys are protected and cannot be read by agents directly.
- [Process]: Surgical repair scripts (like `repair_login.sql`) are preferred over full resets for production/hosted environments.
- [Architecture]: `middleware.ts` gates `/admin` routes by querying `profiles.role`. This confirms reliance on the `profiles` table.
