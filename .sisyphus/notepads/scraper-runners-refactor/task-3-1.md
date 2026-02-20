# Task 3.1: Audit and select canonical config editor

## Context
Phase 3 begins - we need to consolidate 4 competing config editors into one canonical implementation.

## Config Editors Audit Results

### Editor A: `components/admin/scraper-configs/` 
- **Lines of Code**: ~4,007
- **Files**: 12
- **Tabs**: 4 (metadata, workflow, login, advanced)
- **Routes**: `/admin/scraper-configs/*`
- **Test Coverage**: Has test utilities but no component tests
- **Features**:
  - React Hook Form + Zod validation
  - Monaco Editor for YAML
  - JSON Preview
  - Config History
  - Quick Actions (test, validate, publish)
  - Migration support from legacy configs
- **Status**: ✅ Active - newest implementation

### Editor B: `components/admin/scrapers/config-editor/`
- **Lines of Code**: ~1,200
- **Files**: 15 (has duplicate files with " 2" suffix)
- **Tabs**: 7 (metadata, selectors, workflow, config, advanced, testing, preview)
- **Routes**: `/admin/scrapers/configs/[id]/edit`
- **Test Coverage**: Has ConfigEditorClient.test.tsx
- **Features**:
  - Similar to Editor A but more tabs
  - Testing tab included
  - Preview tab
- **Status**: ⚠️ Legacy - similar to Editor D

### Editor C: `components/admin/scrapers/editor/` (Visual Builder)
- **Lines of Code**: ~1,421
- **Files**: 10
- **Tabs**: 4 (Global Settings, Selectors, Workflow Builder, YAML Preview)
- **Routes**: `/admin/scrapers/create`
- **Test Coverage**: No tests found
- **Features**:
  - Visual workflow builder (drag-drop style)
  - YAML Import/Export
  - Zustand state management
  - Different UX approach
- **Status**: ⚠️ Specialized - visual builder use case

### Editor D: `components/admin/scraper-lab/config-editor/`
- **Lines of Code**: ~1,445
- **Files**: 11
- **Tabs**: 7 (same as Editor B)
- **Routes**: `/admin/scraper-lab/`
- **Test Coverage**: Has ConfigEditorClient.test.tsx
- **Features**: Nearly identical to Editor B
- **Status**: ⚠️ Duplicate of Editor B

## Comparison Matrix

| Editor | LOC | Files | Tabs | Tests | Usage | Maintainability |
|--------|-----|-------|------|-------|-------|-----------------|
| A (scraper-configs) | 4,007 | 12 | 4 | Low | ✅ Active | High (modern patterns) |
| B (config-editor) | 1,200 | 15 | 7 | Yes | ⚠️ Legacy | Medium |
| C (visual editor) | 1,421 | 10 | 4 | None | ⚠️ Specialized | Medium |
| D (lab editor) | 1,445 | 11 | 7 | Yes | ⚠️ Duplicate | Medium |

## Recommendation: Editor A (scraper-configs)

**Rationale**:
1. **Active Development**: Uses modern patterns (React Hook Form, Zod, Server Actions)
2. **Unified Schema**: Uses `lib/admin/scraper-configs/form-schema.ts` - single source of truth
3. **Most Complete**: Has migration support, history, quick actions
4. **Proper Routes**: Has dedicated `/admin/scraper-configs/` route structure
5. **Future-Proof**: Newer codebase, actively maintained

**Migration Strategy**:
- Keep Editor A as canonical
- Port unique features from B/D (testing tab, preview tab)
- Deprecate B and D (they're nearly identical)
- Keep C for now (visual builder serves different use case)

## Gate 1
This is **Gate 1** - user must approve the choice before proceeding to Task 3.2.

**Approval Required**: Use Editor A (scraper-configs) as canonical
