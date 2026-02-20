# Task 3.8: Simplify admin navigation

## Context
Update the admin sidebar navigation to add the new Enrichment workflow link and consolidate scraper-related navigation.

## Changes Completed

### Modified: `BayStateApp/components/admin/sidebar.tsx`
1. Added `Sparkles` icon import from 'lucide-react'
2. Added "Enrich Products" nav item in Scrapers section:
   - href: '/admin/enrichment'
   - label: 'Enrich Products'
   - icon: `<Sparkles className="h-5 w-5" />`
   - adminOnly: true
3. Placed as second item (after Dashboard, before Configs)

### Updated Scrapers Section
- Dashboard
- **Enrich Products** (NEW)
- Configs
- Studio
- Job History
- Runner Network

## Acceptance Criteria
- [x] Sidebar contains "Enrich Products" link
- [x] Uses Sparkles icon from lucide-react
- [x] Links to /admin/enrichment
- [x] All existing links still work

## Commit
`774e4e0 feat(ui): simplify admin navigation for scrapers`
