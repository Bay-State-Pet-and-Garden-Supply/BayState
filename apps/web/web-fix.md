# Web AGENTS.md Fix — 2026-05-10

## Changes Made

| # | Field | Old | New |
|---|-------|-----|-----|
| 1 | Generated date | 2026-04-05 | 2026-05-10 |
| 2 | Component count | 278 files | 233 files |
| 3 | storefront files | 35 files | 41 files |
| 4 | admin files | 120+ files | 140 files |
| 5 | lib domain modules | 22 modules (169 files) | 20 modules (175 files) |
| 6 | lib module listing | Removed `providers/` (phantom), added 9 missing: account, agents, ai-scraping, email, enrichment, facets, mobile-api, tools, validation | |
| 7 | lib standalone .ts | [16 standalone .ts] | [36 standalone .ts] |
| 8 | supabase migrations | 122 migrations | 175 migrations |
| 9 | scripts count | 29 operational scripts | 14 files |
| 10 | client component count | 242+ files | 62 files |
| 11 | NOTES: Gemini migration | Feature flags in `lib/config/` | LLM provider routing in `lib/ai-scraping/credentials.ts` |
| 12 | NOTES: Supabase | 122 migrations (duplicate) | 175 migrations (unique) |

## Verified Counts (from live codebase)

- Component files: 233 ✓
- storefront: 41 ✓
- admin: 140 ✓
- lib module directories: 20 ✓
- Standalone .ts in lib: 36 ✓
- Migration files: 175 ✓
- Script files: 14 ✓
- 'use client' files: 62 ✓

## File

`/Users/nickborrello/Desktop/Projects/BayState/apps/web/AGENTS.md` — all fixes applied.
