# Task 3.3: Deprecate duplicate config editors

## Context
Deprecate duplicate config editors B and D. Editor C (visual builder) kept as it's actively used.

## Deprecation Actions Completed

### 1. Added Deprecation Markers
- Created `.DEPRECATED` file in `components/admin/scrapers/config-editor/`
- Created `.DEPRECATED` file in `components/admin/scraper-lab/config-editor/`

### 2. Updated Imports
Updated `StudioConfigEditor.tsx` to use canonical Editor A tabs where available:
- ✅ MetadataTab → now from `scraper-configs/`
- ✅ SelectorsTab → now from `scraper-configs/`
- ✅ WorkflowTab → now from `scraper-configs/`
- ✅ AdvancedTab → now from `scraper-configs/`
- ⚠️ ConfigurationTab → still from deprecated (not in Editor A)
- ⚠️ TestingTab → still from deprecated (not in Editor A)
- ⚠️ PreviewTab → still from deprecated (not in Editor A)
- ⚠️ ValidationSummary → still from deprecated (not in Editor A)

### 3. Editor Status

#### Editor B: `components/admin/scrapers/config-editor/` - DEPRECATED
- Status: Marked for removal in Phase 4
- No active imports found

#### Editor D: `components/admin/scraper-lab/config-editor/` - DEPRECATED
- Status: Marked for removal in Phase 4
- Still used by StudioConfigEditor for 4 tabs (to be migrated)

#### Editor C: `components/admin/scrapers/editor/` - KEPT
- Status: Active (visual builder for /admin/scrapers/create)
- Decision: Keep, different use case

#### Editor A: `components/admin/scraper-configs/` - CANONICAL
- Status: Canonical editor
- Now used by StudioConfigEditor for 4/7 tabs

## Commit
`3d82357 chore(scrapers): deprecate duplicate config editors (Phase 3)`

## Physical Deletion
- Deferred to Phase 4 after Gate 3 validation
