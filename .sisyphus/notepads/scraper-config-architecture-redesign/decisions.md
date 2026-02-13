
# UI Decisions for Scraper Config Editor

## Form-Based Editor Architecture
**Date:** 2026-01-22
**Context:** Replacing raw YAML/JSON editing with a structured form for Ops users.

### 1. Component Structure
- **Root**: `ConfigEditor` (Server) -> `ConfigEditorClient` (Client)
- **State**: React Hook Form (RHF) + Zod Resolver. No persistent Zustand store for form state (kept local to form).
- **Tabs**:
  - `Metadata`: Identity (slug, name, base_url).
  - `Selectors`: Array of `SelectorConfig`.
  - `Workflow`: Array of `WorkflowStep` with simplified param inputs.
  - `Configuration`: Retries, timeouts, image quality.
  - `Advanced`: Anti-detection, HTTP status, Login.
  - `Testing`: Test SKUs.
  - `Preview`: Read-only JSON view.

### 2. Validation Strategy
- **Client-side**: Zod schema validation via RHF (immediate feedback on types/required).
- **Server-side**: Explicit `validateDraft` action returns full validation report.
- **Visuals**:
  - Inline errors (`FormMessage`) for field-level issues.
  - `ValidationSummary` component for global/complex errors at the top.

### 3. Workflow Builder (MVP)
- **Decision**: Use a linear list of cards for the MVP workflow builder instead of a full drag-and-drop node graph.
- **Reasoning**: Easier to implement correctly with RHF field arrays. Node graphs (React Flow) are powerful but complex to bind 1:1 with a Zod schema form without extensive state syncing logic.
- **Future**: Can upgrade to React Flow visualization if linear list becomes too limiting.

### 4. JSON Preview
- **Decision**: Read-only real-time preview using Monaco Editor.
- **Reasoning**: Ops users trust the form, but Developers/Power Users need to see the underlying data structure to debug or verify exact values.

### 5. Publishing Flow
- **States**: `Draft` -> `Validated` -> `Published`.
- **Buttons**:
  - `Save Draft`: Always enabled (unless saving).
  - `Validate`: Runs server check. Updates status to `Validated` if successful.
  - `Publish`: Only enabled if status is `Validated` and form is clean (no unsaved changes).

### 6. Styling
- **Library**: `shadcn/ui` components (Card, Input, Button, Tabs, Form, Accordion, Badge, Alert).
- **Layout**: Tabbed interface to reduce cognitive load. Each tab focuses on one aspect of the config.
- **Interactions**:
  - Accordions for list items (selectors, workflow steps) to save vertical space.
  - Real-time JSON preview updates.
