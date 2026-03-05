# Hardcoded URL Search Results

## Summary
- **Total occurrences found**: 14
- **Files requiring updates**: 9 (excluding plan files and test imports)

## Search Patterns Used
1. `/admin/scrapers/configs`
2. `/admin/scrapers/test-lab`
3. `scrapers/configs` (without /admin/)
4. `scrapers/test-lab` (without /admin/)

## By Category

### Components (11 occurrences)

#### `/admin/scrapers/configs` (5 occurrences)

| File | Line | Type | Code Snippet |
|------|------|------|--------------|
| BayStateApp/components/admin/sidebar.tsx | 87 | href | `{ href: '/admin/scrapers/configs', label: 'Configs', icon: <Layers className="h-5 w-5" />, adminOnly: true },` |
| BayStateApp/components/admin/scrapers/ScraperDashboardClient.tsx | 135 | href | `<Link href="/admin/scrapers/configs">` |
| BayStateApp/components/admin/scrapers/ScraperDashboardClient.tsx | 143 | href | `<Link href="/admin/scrapers/configs">` |
| BayStateApp/components/admin/scrapers/ScraperDashboardClient.tsx | 179 | href | `<Link href="/admin/scrapers/configs/new">` |
| BayStateApp/components/admin/scrapers/ScraperDashboardClient.tsx | 254 | href | `href={`/admin/scrapers/configs/${scraper.id}`}` |

#### `/admin/scrapers/test-lab` (3 occurrences)

| File | Line | Type | Code Snippet |
|------|------|------|--------------|
| BayStateApp/components/admin/sidebar.tsx | 88 | href | `{ href: '/admin/scrapers/test-lab', label: 'Test Lab', icon: <Beaker className="h-5 w-5" />, adminOnly: true },` |
| BayStateApp/components/admin/scrapers/ScraperDashboardClient.tsx | 152 | href | `<Link href="/admin/scrapers/test-lab">` |
| BayStateApp/components/admin/scrapers/ConfigsClient.tsx | 267 | href | `<a href={`/admin/scrapers/test-lab`}>` |

#### `scrapers/configs` without /admin/ (2 occurrences)

| File | Line | Type | Code Snippet |
|------|------|------|--------------|
| BayStateApp/components/admin/scrapers/GitHubSyncPanel.tsx | 53 | useState | `useState(\`scrapers/configs/${scraperName}\`)` |
| BayStateApp/components/admin/scrapers/GitHubSyncPanel.tsx | 70 | setFilePath | `setFilePath(status.filePath || \`scrapers/configs/${scraperName}\`)` |

#### `scrapers/test-lab` without /admin/ (0 occurrences)
No occurrences found in source code without the `/admin/` prefix.

### Documentation (3 occurrences in plan files - for reference only)

| File | Line | Context |
|------|------|---------|
| BayStateApp/.sisyphus/plans/scraper-lab-rollback.md | 5 | Project description |
| BayStateApp/.sisyphus/plans/scraper-lab-rollback.md | 61 | Rollback strategy |
| BayStateApp/.sisyphus/plans/scraper-lab-rollback.md | 195-201 | Verification checklist |

Note: Plan files are documentation and not code that needs to be updated. They are included here for completeness.

### Tests (4 occurrences - import paths)

| File | Line | Type | Code Snippet |
|------|------|------|--------------|
| BayStateApp/__tests__/components/admin/scrapers/test-lab/ExtractionResultsTable.test.tsx | 6 | import | `import { ExtractionResultsTable } from '@/components/admin/scrapers/test-lab/ExtractionResultsTable';` |
| BayStateApp/__tests__/components/admin/scrapers/test-lab/LoginStatusPanel.test.tsx | 6 | import | `import { LoginStatusPanel } from '@/components/admin/scrapers/test-lab/LoginStatusPanel';` |
| BayStateApp/__tests__/components/admin/scrapers/test-lab/SelectorHealthCard.test.tsx | 6 | import | `import { SelectorHealthCard } from '@/components/admin/scrapers/test-lab/SelectorHealthCard';` |
| BayStateApp/__tests__/components/admin/scrapers/test-lab/TestSummaryDashboard.test.tsx | 6 | import | `import { TestSummaryDashboard } from '@/components/admin/scrapers/test-lab/TestSummaryDashboard';` |

Note: These test import paths reference the component directory structure. They may need updates if the component directory is moved, but are not URL hardcoding.

### Additional Reference (1 occurrence - comment)

| File | Line | Type | Code Snippet |
|------|------|------|--------------|
| BayStateApp/lib/enrichment/sources.ts | 13 | comment | `* These correspond to YAML configs in BayStateScraper/scrapers/configs/` |

## Files to Update for Task 9

### Priority 1: Navigation Links (4 files)
1. **BayStateApp/components/admin/sidebar.tsx**
   - Line 87: Update `/admin/scrapers/configs` → `/admin/scraper-lab`
   - Line 88: Update `/admin/scrapers/test-lab` → `/admin/scraper-lab`

2. **BayStateApp/components/admin/scrapers/ScraperDashboardClient.tsx**
   - Line 135: Update `/admin/scrapers/configs` → `/admin/scraper-lab`
   - Line 143: Update `/admin/scrapers/configs` → `/admin/scraper-lab`
   - Line 152: Update `/admin/scrapers/test-lab` → `/admin/scraper-lab`
   - Line 179: Update `/admin/scrapers/configs/new` → `/admin/scraper-lab/new`
   - Line 254: Update `/admin/scrapers/configs/${scraper.id}` → `/admin/scraper-lab/${scraper.id}`

3. **BayStateApp/components/admin/scrapers/ConfigsClient.tsx**
   - Line 267: Update `/admin/scrapers/test-lab` → `/admin/scraper-lab`

### Priority 2: GitHub File Paths (1 file)
4. **BayStateApp/components/admin/scrapers/GitHubSyncPanel.tsx**
   - Line 53: Update `scrapers/configs/` → `scraper-lab/` (or appropriate new path)
   - Line 70: Update `scrapers/configs/` → `scraper-lab/` (or appropriate new path)

Note: These are GitHub repository paths, not web URLs. They may need to change based on repository structure changes.

### Priority 3: Test Imports (4 files - conditional)
5. **BayStateApp/__tests__/components/admin/scrapers/test-lab/*.test.tsx** (4 files)
   - Update import paths if component directory structure changes
   - Otherwise, no changes needed as these are relative import paths, not URLs

## Notes
- All URL occurrences found are in href attributes or state values
- No occurrences found in API routes or server-side code
- The pattern is consistent: `/admin/scrapers/{configs|test-lab}` for navigation
- GitHub paths use a different pattern: `scrapers/configs/` (without /admin/)
