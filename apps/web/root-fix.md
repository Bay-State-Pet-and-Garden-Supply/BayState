# Root AGENTS.md — Fix Report

## Changes Made

**File:** `/Users/nickborrello/Desktop/Projects/BayState/AGENTS.md`

### 1. Root app boundaries
- **Before:** `apps/web`, `apps/scraper`, `conductor`
- **After:** +`apps/mobile` (Expo/React Native; less active), +`packages/api` (shared tRPC library `@baystate/api`)

### 2. CI command descriptions
- **Before:** `CI=true bun run test`
- **After:** `bun run test` (with `env: CI: true` in workflow YAML)
- **Before:** `tsc --noEmit` (with `|| true`)
- **After:** `bun run tsc --noEmit || true`

### 3. Root scripts list
- **Before:** `bun run dev|build|test|lint`
- **After:** `bun run dev|build|test|lint|typecheck`

## Validation
- All 3 targeted edits applied successfully via `edit` tool.
- File re-read confirms correct output.

## Scout Reference
Findings from scout output (76e31723-1) identified 3 actionable issues in root AGENTS.md. All were addressed per the approved corrections. The minor CI imprecision about inline vs YAML `env` was also accepted as an improvement to the CI line.
