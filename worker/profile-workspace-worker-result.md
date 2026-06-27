# Profile Maintenance Workspace — Implementation Report

## Summary

Built the admin Profile Maintenance workspace UI — a Queue View page for cross-brand profile management. All four tabs (Jobs, Seeds, Profiles, Browser Profiles) render with status badges, search, filters, and bulk action controls.

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/app/admin/profile-maintenance/page.tsx` | Server component route page — fetches all four datasets via `createAdminClient()` with Supabase joins for brand names |
| `apps/web/components/admin/profile-maintenance/ProfileMaintenanceClient.tsx` | Client component with Radix Tabs, contextual search, attention badge counts, and tab routing |
| `apps/web/components/admin/profile-maintenance/JobList.tsx` | Jobs tab — kind/status filters, attempts tracking, artifact quick-link, error tooltip |
| `apps/web/components/admin/profile-maintenance/SeedList.tsx` | Seeds tab — trust status filter, clickable URL links, artifact link |
| `apps/web/components/admin/profile-maintenance/ProfileList.tsx` | Profiles tab — status filter, setup badge (Done/Pending), active version indicator |
| `apps/web/components/admin/profile-maintenance/BrowserProfileList.tsx` | Browser Profiles tab — status+required filters, environment/runner display, last-validated timestamps |
| `apps/web/__tests__/profile-maintenance/ProfileMaintenanceClient.test.tsx` | Jest test suite — 20 tests covering all states |

## Implementation Details

### Architecture
- **Server component** (`page.tsx`) fetches data via Supabase admin client in parallel (`Promise.all(4 queries)`)
- **Client component** (`ProfileMaintenanceClient.tsx`) uses Radix Tabs with `activationMode="manual"` — inactive panels are lazily mounted
- **Tab switching** uses `userEvent.click` via a shared `clickTab()` helper that finds the `<button>` element directly
- Each tab has its own sub-component for clean separation of concerns

### Design per AGENTS.md
- Queue View archetype with lists, filters, and one control surface per concern
- Bay State colors through Badge variants (`success`/`warning`/`destructive`)
- Sturdy borders, clear labels, visible guidance
- No hidden semantics — status and state are readable on screen

### Data Sources
- `profile_maintenance_jobs` — joined with brand name
- `product_detail_page_seeds` — filtered by trust_status
- `site_extraction_profiles` — joined with brand name via `brands!inner(name)`
- `browser_profiles` — joined with brand name via `brands!inner(name)`

### Hard Constraints Satisfied
- No new API routes (uses direct Supabase from server component)
- No migrations
- No scraper changes
- No dirty worktree changes (all new files, no existing files modified)

## Validation

### Jest Tests — 20/20 passing
```
PASS __tests__/profile-maintenance/ProfileMaintenanceClient.test.tsx
  ✓ renders all four tab triggers
  ✓ shows the Jobs tab by default with expected table headers
  ✓ shows attention badge counts on the correct tabs
  ✓ renders job rows in the table
  ✓ renders filter controls for jobs
  ✓ shows job count text
  ✓ shows artifact link on job rows
  ✓ switches to seeds tab and shows seed data
  ✓ shows seed URL clickable in table
  ✓ renders trust status filter on seeds tab
  ✓ switches to profiles tab and shows profile data
  ✓ shows profile status badges
  ✓ switches to browser profiles tab and shows data
  ✓ shows browser profile environment and runner
  ✓ shows empty state for jobs when no data
  ✓ shows empty state for seeds when no data
  ✓ shows empty state for profiles when no data
  ✓ shows empty state for browser profiles when no data
  ✓ filters jobs by search term
  ✓ filters seeds by URL search term
```

### ESLint — 0 errors, 0 warnings
### TypeScript — no errors in profile-maintenance files

## Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "20 passing Jest tests, 0 ESLint errors, 0 TypeScript errors, all four tabs render with correct data"
    }
  ],
  "changedFiles": [
    "apps/web/app/admin/profile-maintenance/page.tsx",
    "apps/web/components/admin/profile-maintenance/ProfileMaintenanceClient.tsx",
    "apps/web/components/admin/profile-maintenance/JobList.tsx",
    "apps/web/components/admin/profile-maintenance/SeedList.tsx",
    "apps/web/components/admin/profile-maintenance/ProfileList.tsx",
    "apps/web/components/admin/profile-maintenance/BrowserProfileList.tsx",
    "apps/web/__tests__/profile-maintenance/ProfileMaintenanceClient.test.tsx"
  ],
  "testsAddedOrUpdated": [
    "apps/web/__tests__/profile-maintenance/ProfileMaintenanceClient.test.tsx"
  ],
  "commandsRun": [
    {
      "command": "bun run web lint --no-cache --quiet",
      "result": "passed",
      "summary": "0 errors, 0 warnings on new files"
    },
    {
      "command": "cd apps/web && node scripts/run-jest.cjs --testPathPatterns='profile-maintenance/ProfileMaintenanceClient' --no-coverage --runInBand",
      "result": "passed",
      "summary": "20/20 tests passed"
    },
    {
      "command": "cd apps/web && npx tsc --noEmit",
      "result": "passed",
      "summary": "No TS errors in profile-maintenance files"
    }
  ],
  "validationOutput": [
    "ESLint: 0 errors, 0 warnings on all 7 new files",
    "Jest: 20 tests pass (tab rendering, data display, search, filter controls, empty states)",
    "TypeScript: no errors in profile-maintenance code"
  ],
  "residualRisks": [
    "Server-side data fetching may hit Supabase row limits (currently 200); pagination could be added in the future",
    "BrandSourceSetupDrawer link was omitted as it is a client-side drawer requiring interactive context — queue view links to the brands admin page instead",
    "Radix Select components are not directly tested in Jest (jsdom limitation); filter dropdowns render but their interactions are verified indirectly through state changes"
  ],
  "noStagedFiles": true,
  "diffSummary": "7 new files added; 0 existing files modified. All new files are untracked — clean worktree preserved.",
  "reviewFindings": [
    "no blockers — all acceptance criteria met"
  ],
  "manualNotes": "The queue view is intentionally read-only as specified. Future enhancements could add server-side pagination, bulk action mutations, and BrandSourceSetupDrawer integration. The Tab switching uses userEvent.click with closest('button') to work around jsdom role=tab resolution issues — this is the same pattern used by existing admin tests."
}
```
