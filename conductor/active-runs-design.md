# Active Runs Tab Redesign

## Objective
Refactor `apps/web/components/admin/pipeline/ActiveRunsTab.tsx` and related components (`TimelineView.tsx`, `ChunkStatusTable.tsx`) to remove default "AI Slop" Shadcn UI patterns (e.g., `rounded-lg`, `shadow-sm`, `text-muted-foreground`, soft colors). Replace them with the "Modern Farm Utilitarian" brand guidelines (heavy borders, blocky shadows, sharp corners, and high-contrast uppercase typography).

## Scope
- `apps/web/components/admin/pipeline/ActiveRunsTab.tsx`
- `apps/web/components/admin/pipeline/TimelineView.tsx`
- `apps/web/components/admin/pipeline/ChunkStatusTable.tsx`

## Technical Strategy
1. **Typography**: Replace soft text (e.g., `text-muted-foreground`, `text-sm`) with utilitarian equivalents (`font-black`, `uppercase`, `tracking-tight`, `text-zinc-950`, `text-zinc-600` for secondary text).
2. **Borders & Shadows**: Remove `rounded-lg`, `rounded-md`, `border-border`, and `shadow-sm`. Introduce `rounded-none`, `border-2 border-zinc-950`, and hard drop shadows like `shadow-[4px_4px_0px_rgba(0,0,0,1)]` for primary containers (JobCards, panels).
3. **Colors**: Remove soft generic colors (`bg-muted/50`, `text-primary`, `bg-primary/10`, `text-green-700`). Use the brand palette (`bg-brand-forest-green`, `bg-brand-burgundy`, `bg-brand-gold`, `bg-zinc-950`, `bg-zinc-100`).
4. **Icons & Badges**: Refactor status badges (`JobStatusBadge`, `LogLevelBadge`) to use `rounded-none`, `border border-zinc-950`, and blocky `shadow-[1px_1px_0px_rgba(0,0,0,1)]`.
