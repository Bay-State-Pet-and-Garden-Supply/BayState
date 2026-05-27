# Toast Notification Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate global toast notifications to `top-center` on desktop and `bottom-center` on mobile to prevent blocking critical UI elements like the cart button.

**Architecture:** Update the global `Toaster` component configuration in the root layout. Since `sonner` supports a single `position` prop, we will use a responsive approach or CSS overrides if necessary, but standard `sonner` allows for dynamic props based on window size if handled in a client component. However, the simplest fix is often setting it to `top-center` as a sensible default that clears the top-right corner.

**Tech Stack:** Next.js (App Router), Lucide React, Sonner (Toaster)

---

### Task 1: Update Global Toaster Configuration

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Modify the Toaster position**

Update the `Toaster` component to use `top-center`. While `sonner` doesn't natively support "breakpoint-based positions" via a single prop without client-side logic, `top-center` is a significant improvement over `top-right` for both desktop and mobile as it clears the corner clusters.

```tsx
// app/layout.tsx

// Find:
// <Toaster position="top-right" duration={3000} closeButton />

// Replace with:
// <Toaster position="top-center" duration={3000} closeButton />
```

- [ ] **Step 2: Commit changes**

```bash
git add app/layout.tsx
git commit -m "ui: move global toast position to top-center"
```

### Task 2: Verify Mobile Positioning (Optional CSS Adjustment)

**Files:**
- Modify: `app/globals.css` (if needed)

- [ ] **Step 1: Check if mobile needs bottom-center specifically**

If `top-center` on mobile still feels intrusive (overlapping the logo/header), we can add a media query to relocate it to the bottom.

```css
/* app/globals.css */

@media (max-width: 768px) {
  [data-sonner-toaster] {
    top: auto !important;
    bottom: 0 !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
  }
}
```

*Note: It's better to first try the built-in `top-center` and only use CSS if the overlap persists.*

- [ ] **Step 2: Commit changes (if applied)**

```bash
git add app/globals.css
git commit -m "ui: adjust mobile toast position to bottom-center via CSS"
```

### Task 3: Manual Verification

- [ ] **Step 1: Test "Add to Cart" on desktop**
Verify the toast appears at the top center and does not block the cart icon in the top right.

- [ ] **Step 2: Test "Add to Cart" on mobile**
Verify the toast appears in a non-blocking location (top center or bottom center).
