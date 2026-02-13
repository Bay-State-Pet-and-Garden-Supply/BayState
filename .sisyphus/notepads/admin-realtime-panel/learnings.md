# Admin Realtime Panel - Learnings

## WAVE 1: Foundation (Types & Hooks)

### Completed: TypeScript Types Definition

**Date:** 2026-02-05

**File Created:** `BayStateApp/lib/realtime/types.ts`

**Types Defined:**

| Type | Purpose |
|------|---------|
| `RunnerPresence` | Tracks runner status (online/busy/idle/offline) with metadata |
| `JobAssignment` | Represents scrape job assignments from Postgres Changes |
| `BroadcastEvent<T>` | Generic broadcast structure for realtime messages |
| `ScrapeJobLog` | Structured logging from runners (DEBUG/INFO/WARN/ERROR) |

**Pattern Followed:**
- Used Zod schemas alongside TypeScript interfaces (mirrors `lib/admin/scrapers/schema.ts`)
- Added `z.infer` compatible schemas for runtime validation
- Included JSDoc documentation for each type
- Exported union types for event payload handling

**Key Decisions:**
- Made `BroadcastEvent` generic (`<T>`) to support any payload type
- Used `Record<string, unknown>` for metadata to allow flexible runner config
- Included both Zod schemas and interfaces for maximum flexibility
- Status enums aligned with existing patterns in codebase

**Next Steps (Wave 2):**
- Create custom hooks for subscribing to Supabase Realtime channels
- Implement presence tracking hook
- Build event logging hook for job progress
