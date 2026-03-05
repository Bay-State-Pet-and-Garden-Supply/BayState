# Scraper Lab Consolidation Rollback Plan

## Overview

This document provides a comprehensive rollback strategy for the Scraper Lab consolidation project. The consolidation merges `/admin/scrapers/configs/` and `/admin/scrapers/test-lab/` into a unified `/admin/scraper-lab/` section.

**Project**: Scraper Lab Consolidation  
**Date**: 2026-01-30  
**Plan Reference**: `.sisyphus/plans/scraper-lab-consolidation.md`  
**Rollback Level**: Full Revert

---

## Pre-Migration Backup

### Git Backup (Primary)

Before any modifications, a git commit has been created to serve as the baseline for rollback:

```
COMMIT_HASH: [TO BE CREATED]
BRANCH: [CURRENT BRANCH]
MESSAGE: docs(admin): document rollback strategy for scraper-lab consolidation
```

### Backup Verification Commands

```bash
# Verify backup commit exists
git log --oneline -1

# Verify clean working directory before migration
git status

# Create a tagged backup point (optional, for easier rollback)
git tag -a scraper-lab-backup-$(date +%Y%m%d) -m "Backup before scraper-lab consolidation"
```

### Files to Be Modified

The following files will be created or modified during the consolidation. All existing files are documented here for reference and potential restoration.

#### Navigation Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `BayStateApp/components/admin/sidebar.tsx` | MODIFY | Change "Configs" label to "Scraper Lab", remove "Test Lab" entry |

#### New Route Structure

| File | Change Type | Description |
|------|-------------|-------------|
| `BayStateApp/app/admin/scraper-lab/page.tsx` | CREATE | Unified landing page |
| `BayStateApp/app/admin/scraper-lab/[id]/page.tsx` | CREATE | Config detail + test runner |
| `BayStateApp/app/admin/scraper-lab/new/page.tsx` | CREATE | Config creation wizard |

#### Legacy Route Redirects

| File | Change Type | Description |
|------|-------------|-------------|
| `BayStateApp/app/admin/scrapers/configs/[...not-found]/page.tsx` | CREATE | 307 redirect to `/admin/scraper-lab` |
| `BayStateApp/app/admin/scrapers/test-lab/page.tsx` | MODIFY | Convert to 307 redirect |

#### Component Migrations

| File | Change Type | Description |
|------|-------------|-------------|
| `BayStateApp/components/admin/scraper-lab/config-editor/ConfigEditorClient.tsx` | CREATE/MOVE | Migrated from `components/admin/scrapers/config-editor/` |
| `BayStateApp/components/admin/scraper-lab/test-lab/TestLabClient.tsx` | CREATE/MOVE | Migrated from `components/admin/scrapers/test-lab/` |
| `BayStateApp/components/admin/scraper-lab/ScraperLabLanding.tsx` | CREATE | New unified landing component |

#### Related Components (Imports May Change)

| File | Change Type | Description |
|------|-------------|-------------|
| `BayStateApp/components/admin/scrapers/ConfigsClient.tsx` | MODIFY | May update imports |
| `BayStateApp/components/admin/scrapers/TestLabClient.tsx` | MODIFY | May update imports |
| `BayStateApp/components/admin/scrapers/config-editor/tabs/*.tsx` | MODIFY | Path updates for imports |
| `BayStateApp/components/admin/scrapers/test-lab/*.tsx` | MODIFY | Path updates for imports |

#### Test Files (No Changes, But May Fail After Migration)

| File | Change Type | Description |
|------|-------------|-------------|
| `BayStateApp/__tests__/components/admin/scrapers/test-lab/*.test.tsx` | NO CHANGE | May need path updates |
| `BayStateApp/__tests__/components/admin/scraper-configs/*.test.tsx` | NO CHANGE | Reference only |

#### Library Files (Imports Only)

| File | Change Type | Description |
|------|-------------|-------------|
| `BayStateApp/lib/admin/scrapers/index.ts` | MODIFY | Export path updates |
| `BayStateApp/lib/admin/scrapers/types.ts` | NO CHANGE | Reference only |

---

## Rollback Procedures

### Rollback Level 1: Git Revert (Recommended)

This method uses git revert to undo changes without affecting the git history. Use this if you want to preserve the migration attempt in history.

```bash
# Step 1: Identify the consolidation commit(s)
git log --oneline --all | grep -i "scraper-lab"

# Step 2: Revert all consolidation-related commits (in reverse order)
git revert --no-commit <commit-hash-1>
git revert --no-commit <commit-hash-2>
# ... repeat for all related commits
git commit -m "revert(admin): rollback scraper-lab consolidation

This reverts all changes made during the scraper-lab consolidation:
- Removes /admin/scraper-lab/ route structure
- Restores sidebar navigation (Configs + Test Lab)
- Removes legacy route redirects
- Restores original component locations

Rollback reason: [DOCUMENT REASON HERE]"

# Step 3: Verify the revert
git status
git diff --stat
```

### Rollback Level 2: Git Reset (Aggressive)

This method resets to the pre-migration backup commit. Use this if revert is too complex or commits have already been pushed.

```bash
# Step 1: Find the backup commit
git log --oneline | grep -i "rollback strategy\|scraper-lab-backup"

# Step 2: Soft reset (preserves staged changes in index)
git reset --soft <backup-commit-hash>

# Step 3: Review what will be restored
git status
git diff --cached --stat

# Step 4: Hard reset (destroys all changes since backup)
# WARNING: This cannot be undone
git reset --hard <backup-commit-hash>

# Step 5: If already pushed, force push (COORDINATE WITH TEAM)
git push --force-with-lease
```

### Rollback Level 3: Manual File Restoration

If git operations fail or only specific files need restoration:

```bash
# Step 1: Restore sidebar navigation
git checkout HEAD -- BayStateApp/components/admin/sidebar.tsx

# Step 2: Remove new route structure
rm -rf BayStateApp/app/admin/scraper-lab/

# Step 3: Remove redirect routes
rm -rf BayStateApp/app/admin/scrapers/configs/\[...not-found\]/
# Restore original test-lab page
git checkout HEAD -- BayStateApp/app/admin/scrapers/test-lab/page.tsx

# Step 4: Remove migrated components
rm -rf BayStateApp/components/admin/scraper-lab/

# Step 5: Verify restoration
git status
```

---

## Database Considerations

**IMPORTANT**: No database changes are required for this consolidation.

- Database table `scraper_configs` remains unchanged
- No migrations needed
- No data migration required
- All existing data remains accessible

**Rollback Impact on Database**: None

---

## Post-Rollback Verification Checklist

Complete this checklist after performing any rollback:

### Navigation Verification

- [ ] Sidebar shows "Configs" (not "Scraper Lab")
- [ ] Sidebar shows "Test Lab" (not removed)
- [ ] "Configs" link points to `/admin/scrapers/configs`
- [ ] "Test Lab" link points to `/admin/scrapers/test-lab`

### Route Verification

- [ ] `/admin/scrapers/configs` renders correctly
- [ ] `/admin/scrapers/test-lab` renders correctly
- [ ] ConfigEditorClient loads without errors
- [ ] TestLabClient loads without errors
- [ ] All 7 tabs in ConfigEditorClient work
- [ ] Real-time updates in TestLabClient work

### Feature Verification

- [ ] Draft/Validate/Publish workflow completes
- [ ] SKU Manager creates/updates/deletes SKUs
- [ ] HistoricalTestRuns displays past runs
- [ ] TestAnalyticsDashboard renders all charts
- [ ] No console errors in browser dev tools

### Build Verification

```bash
cd BayStateApp
npm run build
# Expected: Exit code 0, no TypeScript errors
```

### API Verification

```bash
# Configs API returns data
curl -s http://localhost:3000/api/scraper-configs | jq '.[0].id'

# Test runs API returns data
curl -s http://localhost:3000/api/admin/scraper-network/test | jq '.[0].id'
```

---

## Rollback Decision Matrix

| Situation | Recommended Rollback | Command |
|-----------|---------------------|---------|
| Migration partially complete, want to undo | Level 1: Git Revert | `git revert <commit>` |
| Migration complete, need clean state | Level 2: Git Reset | `git reset --hard <backup>` |
| Only sidebar broken | Level 3: Manual | `git checkout HEAD -- sidebar.tsx` |
| Already pushed, team coordination | Level 1 + Force Push | `git revert && git push --force-with-lease` |
| Emergency (broken production) | Level 2: Immediate | `git reset --hard <backup> && git push -f` |

---

## Emergency Contacts

**Before emergency rollback**:
1. Notify team members
2. Document the issue
3. Take screenshots of current state
4. Note time of rollback attempt

**Emergency Rollback Procedure**:
```bash
# Quick emergency rollback
git tag -m "EMERGENCY BACKUP $(date)" emergency-backup-$(date +%H%M%S)
git reset --hard <backup-commit>
git push --force-with-lease origin $(git branch --show-current)
```

---

## Rollback Test Log

| Date | Rollback Type | Trigger | Result | Notes |
|------|---------------|---------|--------|-------|
| | | | | |

---

## Related Documentation

- **Consolidation Plan**: `.sisyphus/plans/scraper-lab-consolidation.md`
- **Feature Parity Checklist**: See consolidation plan, Section "Definition of Done"
- **Verification Commands**: See consolidation plan, Section "Verification Commands"
- **Git Configuration**: `.git/config`

---

## Sign-Off

**Rollback Plan Created**: 2026-01-30  
**Created By**: Sisyphus-Junior  
**Approved By**: [Pending]

---

*This document should be reviewed and updated if the consolidation plan changes.*
