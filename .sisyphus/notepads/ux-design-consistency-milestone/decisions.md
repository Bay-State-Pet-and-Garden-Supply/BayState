# UX & Design Consistency Milestone - Decisions

## Architectural Decisions

### 1. Fix in Primitives, Not Pages
**Decision**: Apply consistency changes to base `components/ui/*` primitives rather than patching page-by-page.

**Rationale**: 
- Single source of truth for consistent behavior
- Downstream components inherit automatically
- Reduces maintenance burden

**Outcome**: Updated Card, Dialog, Dropdown, Popover primitives directly.

### 2. Documentation Over New Components
**Decision**: For issues #43, #45, #41 - document standards in `DESIGN_SYSTEM.md` instead of creating new shared components.

**Rationale**:
- Existing `components/ui/form.tsx` FormMessage already consistent
- Button variants already exist in primitives
- Adds minimal code, maximum clarity

**Outcome**: Added 4 new documentation sections to DESIGN_SYSTEM.md.

### 3. Form Spacing Standard
**Decision**: Adopt `space-y-6` / `space-y-2` / `flex gap-4` as canonical form spacing.

**Rationale**:
- Already used in several places with good visual result
- Matches shadcn/ui form patterns
- Provides adequate vertical rhythm

**Outcome**: Refactored 3 form files to conform.

## Trade-offs Considered

### Border Radius: rounded-xl vs rounded-lg
- Chose `rounded-lg` to match Dialogs
- Cards slightly less rounded than before (slight visual change)
- Maintains consistency across surfaces

### Shadow Depth: shadow-lg vs shadow-xl
- Dialogs need highest elevation: `shadow-xl`
- Dropdowns/Popovers: `shadow-lg`
- Non-interactive cards: no shadow or `shadow-sm`

## Implementation Order
1. Primitives first (#42, #46) - establishes defaults
2. Forms UX (#39) - applies standards to real usage
3. Documentation (#43, #45, #41) - captures existing patterns

This order ensured changes propagated correctly and reduced rework.
