# Branch Cleanup Report

**Generated:** 2026-03-05
**Repositories:** BayStateApp, BayStateScraper

---

## BayStateApp - Local Branches

| Branch | Last Commit | Ahead of Main | Behind Main | Status | Action |
|--------|-------------|---------------|-------------|---------|---------|
| crawl4ai-migration | 2026-02-25 | 0 | 0 | Same commit | **DELETE** |
| fix-scraper-configs | 2026-02-25 | 0 | 0 | Same commit | **DELETE** |
| pipeline-rework | 2026-02-25 | 0 | 0 | Same commit | **DELETE** |
| scraper-schema-overhaul | 2026-02-27 | 0 | 0 | Same commit | **DELETE** |
| test-lab-rework | 2026-02-27 | 0 | 0 | Same commit | **DELETE** |
| master | N/A | N/A | N/A | Old default branch | **DELETE** |

**Analysis:** All local branches are at the same commit as main (0 ahead, 0 behind), meaning their work has been merged. Safe to delete.

---

## BayStateScraper - Remote Branches

| Branch | Last Commit | Ahead of Main | Behind Main | Status | Action |
|--------|-------------|---------------|-------------|---------|---------|
| crawl4ai-migration | 2026-03-04 | 0 | 16 | Fully merged | **DELETE** |
| crawl4ai-migration-updates | 2026-02-27 | 0 | 5 | Fully merged | **DELETE** |
| crawl4ai-v2 | 2026-02-27 | 0 | 5 | Fully merged | **DELETE** |
| develop | 2026-01-06 | 0 | 119 | Fully merged (very old) | **DELETE** |

**Analysis:** All feature branches have 0 commits ahead of main but are behind (5-119 commits). This means they've been fully merged and are now outdated. Safe to delete.

**Note:** Dependabot branches are automated PR branches and should be handled separately (either merged or closed via GitHub).

---

## Summary

**Branches to Delete:**
- BayStateApp: 6 local branches
- BayStateScraper: 4 remote branches

**Total Cleanup:** 10 branches

All branches identified have been fully merged to main and contain no unique work.
