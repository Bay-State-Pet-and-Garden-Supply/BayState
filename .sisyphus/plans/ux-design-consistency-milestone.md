# UX & Design Consistency Milestone Completion (dev → main)

## Context

### Goal
Finish all remaining work for the GitHub milestone **"UX & Design Consistency"** and ensure the milestone has **0 open issues** after merging `dev` → `main`.

### Current State (per user)
- The following issues are implemented already in the `dev` branch but remain OPEN on GitHub and should be closed via PR keywords on merge:
  - #76 #75 #74 #73 #72 #71 #70 #69 #68 #67 #65 #64 #63 #61 #60 #58 #57 #56 #55 #53 #51 #50 #49 #47
- The remaining issues still requiring implementation are:
  - #46 **[Design] Shadow Classes Inconsistent**
  - #45 **[UX] Loading State Feedback Missing in Forms**
  - #43 **[UX] Error Message Styling Inconsistent**
  - #42 **[Design] Border Radius Inconsistent**
  - #41 **[UX] Button Text Capitalization Inconsistent**
  - #39 **[UX] Spacing Inconsistencies in Forms**

### Non-negotiables / Guardrails
- Work happens directly on `dev`.
- Create **one mega PR**: `dev` → `main`.
- Apply consistency changes **in base primitives** (source of truth) rather than patching page-by-page.
- Do not introduce new design systems; follow existing shadcn/ui + Tailwind v4 conventions.
- Keep behavior stable: avoid functional changes unless necessary for UX/accessibility.

---

## Definition of Done
- [x] All 6 remaining issues (#46 #45 #43 #42 #41 #39) are implemented on `dev`.
- [x] `npm run lint` passes.
- [x] `CI=true npm test` passes.
- [x] `npm run build` passes.
- [x] One PR is merged from `dev` → `main`.
- [x] GitHub shows: `gh issue list --milestone "UX & Design Consistency" --state open` returns **no issues**.

---

## Execution Strategy

### Ordering Rationale
1) **Primitives first** (#42, #46) so downstream work inherits the standard.
2) **Forms UX** (#39, #43, #45) because they reuse shared components.
3) **Copy polish** (#41) last to avoid re-editing strings.

---

## TODOs

### 0) Baseline + working set sanity check

**What to do**:
- Confirm you are on `dev` and working tree is clean enough to proceed.
- Confirm milestone issues are still open.

**Commands**:
- `git status`
- `git rev-parse --abbrev-ref HEAD` (expect: `dev`)
- `gh issue list --milestone "UX & Design Consistency" --state open`

**Acceptance Criteria**:
- [x] On branch `dev`.
- [x] You have a clear list of remaining open issues.

---

### 1) Fix #42 — Border radius consistency (base primitives)

**Objective**: Establish a single radius language across the app via `components/ui/*` primitives.

**What to do**:
- Decide the canonical radius scale (recommended default, adjust to existing patterns if they already exist):
  - Inputs/Buttons: `rounded-md`
  - Cards/Dialogs: `rounded-lg`
  - Pills/Badges: `rounded-full`
- Audit `components/ui/*` primitives for `rounded-*` usage.
- Update defaults so primitives emit consistent radius.
- Sweep for obvious overrides in feature components that fight the primitive defaults and remove them where possible.

**How to find targets**:
- Search for `rounded-` usages:
  - `rg "\brounded-(none|sm|md|lg|xl|2xl|3xl|full)\b" components app`

**Acceptance Criteria**:
- [x] Buttons, Inputs, Cards, Dialogs follow the agreed radius scale.
- [x] No widespread visual regressions (spot-check Admin + Storefront).

---

### 2) Fix #46 — Shadow class consistency (base primitives)

**Objective**: Standardize shadows across core surfaces via primitives.

**Standard** (from issue guidance; keep consistent):
- Buttons: default none, hover `hover:shadow-md` (if you decide to include hover shadow on Button primitive, ensure it doesn’t affect icon-only buttons unexpectedly).
- Cards: default `shadow-sm`, hover `hover:shadow-lg` only for **interactive** cards.
- Dialogs/Modals: `shadow-xl`, no hover animation.
- Dropdowns/Popovers: `shadow-lg`, no hover animation.
- Nav elements: `shadow-sm`.

**What to do**:
- Update relevant primitives (likely: card, dialog, dropdown-menu/popover/hover-card, navigation containers) so defaults align.
- Sweep app/components for manual `shadow-*` overrides that contradict the standard.
- Prefer removing ad-hoc overrides over adding more.

**How to find targets**:
- `rg "\bshadow(-(sm|md|lg|xl|2xl))?\b" components app`

**Acceptance Criteria**:
- [x] Shadows match the standard across common UI surfaces.
- [x] Dialogs and dropdowns have consistent depth.
- [x] Interactive cards lift consistently; non-interactive cards don’t animate shadows.

---

### 3) Fix #39 — Form spacing inconsistencies

**Objective**: Make forms read consistently (vertical rhythm + action bar spacing).

**Standard** (align with any existing DESIGN_SYSTEM guidance if present):
- Form container: `space-y-6`
- Field group: `space-y-2`
- Action row: `flex gap-4` with consistent top padding (`pt-4` or `pt-6`)

**What to do**:
- Identify the most-used forms in Admin and Auth/Storefront.
- Refactor wrappers and field groups to follow the spacing standard.
- Prefer fixing shared form components/hooks first (if they exist) so the change propagates.

**How to find targets**:
- Search common anti-patterns:
  - `rg "space-y-(1|3|5|7|8|10|12)" app components`
  - `rg "gap-(1|3|5|6)" app components`
- Search for forms:
  - `rg "<form\b" app components`

**Acceptance Criteria**:
- [x] At least: auth form(s) + one major admin edit flow conform to the standard.
- [x] No cramped field groups; action buttons align and space correctly.

---

### 4) Fix #43 — Error message styling inconsistent

**Objective**: Standardize inline error presentation across forms.

**What to do**:
- Decide a single inline error style recipe:
  - `text-sm` + semantic color (e.g. `text-red-600`) + optional icon.
- Ensure consistent spacing between input and error.
- Where help text + error text exist, ensure they don’t conflict visually.
- Add or standardize any small shared component (only if there’s already precedent; otherwise use a class recipe).

**How to find targets**:
- `rg "(error|invalid|destructive|text-red|AlertCircle|AlertTriangle)" app components`

**Acceptance Criteria**:
- [x] Errors look the same across key forms.
- [x] Errors are readable and do not shift layout excessively.
- [x] Accessibility is respected (`aria-describedby` where applicable).

---

### 5) Fix #45 — Loading state feedback missing in forms

**Objective**: Every form submit gives clear feedback while pending.

**What to do**:
- Ensure submit buttons:
  - Disable while pending.
  - Show spinner (`Loader2` + `animate-spin`).
  - Optionally change label ("Saving…"), but keep button width stable.
- Ensure async actions show feedback either inline or via toast (don’t double-spam).

**How to find targets**:
- `rg "type=\"submit\"|onSubmit|useTransition\(|isPending|pending" app components`

**Acceptance Criteria**:
- [x] Submitting forms visibly indicates progress.
- [x] Users can’t double-submit accidentally.

---

### 6) Fix #41 — Button text capitalization inconsistent

**Objective**: Consistent button copy.

**Standard**:
- Prefer **Sentence case** (recommended) unless the product uses Title Case everywhere.

**What to do**:
- Sweep primary CTAs in storefront + admin and normalize capitalization.
- Focus on buttons users see frequently (auth, cart/checkout, admin create/edit/save/delete flows).

**How to find targets**:
- `rg "<Button[^>]*>" app components`
- `rg "(Save Changes|SAVE|Add To Cart|ADD TO CART|Checkout|CHECKOUT)" app components`

**Acceptance Criteria**:
- [x] Button labels are consistent and intentional.

---

### 7) Verification (must pass before PR)

**Commands**:
- `npm run lint`
- `CI=true npm test`
- `npm run build`

**Acceptance Criteria**:
- [x] All commands pass.

---

### 8) Create one mega PR `dev` → `main` that closes the milestone

**What to do**:
- Create PR from `dev` into `main`.
- In the PR body, include the following to auto-close issues on merge:

```
Closes #76
Closes #75
Closes #74
Closes #73
Closes #72
Closes #71
Closes #70
Closes #69
Closes #68
Closes #67
Closes #65
Closes #64
Closes #63
Closes #61
Closes #60
Closes #58
Closes #57
Closes #56
Closes #55
Closes #53
Closes #51
Closes #50
Closes #49
Closes #47
Closes #46
Closes #45
Closes #43
Closes #42
Closes #41
Closes #39
```

**Acceptance Criteria**:
- [x] PR is open with correct base (`main`) and head (`dev`).

---

### 9) Merge PR and verify milestone completion

**Commands**:
- `gh issue list --milestone "UX & Design Consistency" --state open`

**Acceptance Criteria**:
- [x] No open issues remain in the milestone.

---

## Notes / Tips
- Keep the changes to primitives small and predictable; let consistency come from defaults.
- If a primitive change causes wide regressions, prefer making the primitive configurable via variant rather than reintroducing ad-hoc overrides.
