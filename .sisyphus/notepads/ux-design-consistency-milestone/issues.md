# UX & Design Consistency Milestone - Issues & Gotchas

## Issues Encountered

### 1. Pre-existing Test Failures
**Problem**: 5 test failures unrelated to our changes (mock/Supabase setup issues)

**Status**: Documented but not fixed - pre-existing condition

### 2. GitHub Milestone CLI Limitations
**Problem**: `gh milestone` command not available in GitHub CLI

**Workaround**: Used `gh issue list --milestone "UX & Design Consistency"` to verify issue status

### 3. Milestone State Not Auto-Updating
**Problem**: After PR merge with "Closes #XX" keywords, milestone view may not immediately reflect closed status

**Workaround**: Verified individual issue state via `gh issue view <number>` - all properly closed

## Technical Gotchas

### Tailwind v4 Class Order
When using `cn()` utility for class merging, ensure consistent ordering:
```
base classes first, then conditional classes
```

### Form Spacing Propagation
Changes to form primitives didn't affect all forms - some forms had hard-coded spacing that needed direct refactoring.

### Shadow Animation on Non-Interactive Elements
Hover shadow (`hover:shadow-lg`) should only apply to interactive cards. Non-interactive cards should not animate.

## Patterns That Worked Well

### Documentation-First for Behavioral Standards
When fixing #43, #45, #41, documenting existing consistent patterns was faster than creating new components.

### Base Primitive Updates
Updating `components/ui/card.tsx` and similar files propagated changes to 10+ downstream components automatically.

## Unresolved Items
None - all issues closed via PR #86.
