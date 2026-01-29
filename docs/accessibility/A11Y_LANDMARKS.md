# Accessibility Landmarks & Structure

**Related Issue:** #71
**Implemented:** 2026-01-21

## 1. Semantic HTML Structure

The application now uses proper semantic HTML5 regions to support assistive technologies (screen readers) in navigating the page structure efficiently.

### Core Landmarks

| Tag | Usage | Location |
|-----|-------|----------|
| `<main>` | Wraps the primary unique content of the page. | `app/**/layout.tsx` |
| `<nav>` | Contains major navigation blocks. | Header, Mobile Nav, Sidebar, Pagination |
| `<aside>` | Ancillary content related to the main content. | Sidebars (Admin, Account, Filters) |
| `<header>` | Introductory content, typically navigational aids. | `components/storefront/header.tsx` |
| `<footer>` | Footer content. | `components/storefront/footer.tsx` |

### Implementation Examples

**Storefront Layout (`app/(storefront)/layout.tsx`)**
```tsx
<div className="flex min-h-screen flex-col">
  <Header />
  <main id="main-content" className="flex-1 pb-20 md:pb-0">
    {children}
  </main>
  <Footer />
  <MobileNav />
</div>
```

**Admin Layout (`app/admin/layout.tsx`)**
```tsx
<div className="flex h-screen bg-gray-50">
  <AdminSidebar /> {/* Contains <aside> */}
  <div className="flex flex-1 flex-col overflow-hidden">
    <AdminHeader />
    <main id="main-content" className="flex-1 overflow-y-auto p-8">
      {children}
    </main>
  </div>
</div>
```

## 2. ARIA Labels & Roles

Explicit `aria-label` attributes have been added where visual context alone is insufficient for screen readers, or to differentiate multiple instances of the same landmark type.

### Navigation Landmarks

When multiple `<nav>` elements exist on a page, they must be distinguished by unique labels.

- **Main Desktop Navigation:**
  ```tsx
  <NavigationMenu className="hidden md:flex" aria-label="Main">
  ```
  *Location: `components/storefront/header.tsx`*

- **Mobile Navigation:**
  ```tsx
  <nav className="..." aria-label="Mobile">
  ```
  *Location: `components/storefront/mobile-nav.tsx`*

- **Admin Sidebar:**
  ```tsx
  <nav className="..." aria-label="Admin">
  ```
  *Location: `components/admin/sidebar.tsx`*

### Interactive Elements

Buttons without visible text (icon-only buttons) now require descriptive labels.

- **Search:** `aria-label="Search products, services, and brands"`
- **Cart:** `aria-label="Shopping cart"`
- **Carousel Controls:** `aria-label="Previous slide"`, `aria-label="Next slide"`
- **Star Ratings:** `aria-label="4 out of 5 stars"`

## 3. Best Practices for Future Development

1. **Use `<main>` once per page:** Ensure every page layout wraps its primary content in `<main id="main-content">`.
2. **Label your `<nav>`:** If adding a new navigation block (e.g., Table of Contents), give it an `aria-label` (e.g., `aria-label="Table of Contents"`).
3. **Check headings:** Ensure `<h1>` through `<h6>` follow a logical hierarchy. Do not skip levels (e.g., don't jump from `<h1>` to `<h3>`).
4. **Skip Links:** The application includes a "Skip to main content" link (implied by `id="main-content"`). Ensure this ID is always present on the `<main>` tag.
5. **No `<div>` soup:** Prefer semantic tags (`<article>`, `<section>`, `<figure>`) over generic `<div>` wrappers where appropriate.
