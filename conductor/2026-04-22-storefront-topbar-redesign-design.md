---
task_complexity: medium
design_depth: deep
---

# Storefront Topbar Redesign

## 1. Problem Statement
The current storefront header on `BayStateApp` utilizes a persistent `sticky top-0` positioning that keeps the entire header—including the Pre-Header, Logo, Search, Cart, and Navigation tiers—always in view. While this ensures the primary navigation is always accessible, it creates a vertically "congested feel" when scrolling, as the large header block consumes a significant portion of the viewport real estate, especially on smaller desktop screens and mobile devices.

The goal of this redesign is to implement a "Compact on Scroll" pattern. This pattern will dynamically hide the less critical upper tiers (e.g., the Pre-Header) and gracefully shrink the logo and padding of the main header when the user scrolls down the page. The promotional banners (such as `UnderConstructionBanner` and `CampaignBanner`) will be allowed to scroll out of view naturally, leaving only the compacted main header pinned to the top. This approach balances the need for persistent access to the cart and search functionality with the goal of maximizing the visible area for product browsing, all while adhering to the site's "Modern Farm Utilitarian" design language (heavy borders, blocky shadows).

## 2. Requirements

### Functional Requirements:
- **REQ-1**: The main header must transition to a "compact" state—hiding the Pre-Header tier and shrinking the primary logo and padding—when the user scrolls down past a defined threshold (e.g., 50px).
- **REQ-2**: The header must return to its original "full" state when the user scrolls back up to the top of the page.
- **REQ-3**: Promotional banners (`UnderConstructionBanner`, `CampaignBanner`) must scroll out of view naturally, remaining outside the sticky container.

### Non-Functional Requirements:
- **REQ-4**: The visual transition must be smooth and jank-free, utilizing CSS easing (`transition-all duration-300`).
- **REQ-5**: Scroll event detection must be highly performant, utilizing a throttled or `requestAnimationFrame`-based listener to ensure 60fps scrolling.

### Constraints:
- **REQ-6**: The visual implementation must adhere to the "Modern Farm Utilitarian" design system, specifically maintaining the heavy bottom borders (`border-b-4 border-zinc-900`) and blocky shadows during the transition.
- **REQ-7**: The solution must integrate within the Next.js 16 App Router architecture, minimizing the conversion of Server Components to Client Components to preserve page load performance.

## 3. Approach

**Selected Approach: Stateful Data Attribute Header**

- We will implement a custom `useScroll` React hook that tracks the `window.scrollY` position with throttling. — *[Maintains performant scroll tracking without requiring global layout changes (Traces To: REQ-5, REQ-7)]* *(considered: Intersection Observer on Banners — rejected because it requires wrapping the root layout in a Context Provider, breaking the Server Component boundary).*
- The `StorefrontHeader` client component will toggle a `data-scrolled="true"` attribute on its root element when the user scrolls past 50px. — *[Keeps state management cleanly separated from styling logic (Traces To: REQ-1)]*
- The Pre-Header and Logo elements will utilize Tailwind CSS data variants (e.g., `data-[scrolled=true]:h-0`, `data-[scrolled=true]:scale-75`) combined with `transition-all duration-300` to collapse smoothly. — *[Leverages native CSS transitions for a smooth, jank-free animation (Traces To: REQ-2, REQ-4)]* *(considered: dynamic class string injection via `clsx` — rejected because it's more verbose and relies too heavily on JS for styling state).*
- The promotional banners will remain exactly where they are in the layout, outside the `sticky` header container. — *[Allows them to scroll out of view naturally, maximizing viewport space (Traces To: REQ-3)]*.

**Alternatives Considered**
- **Intersection Sentinel on Banners**: Rejected. While highly performant (no scroll listener), it requires a global Context Provider to pass state down to the header, needlessly complicating the Next.js App Router tree.

## 6. Risk Assessment

**Risk 1: Scroll Performance Degradation**
- **Description**: Binding an event listener to `window.scroll` can severely degrade scrolling frame rates if the callback executes heavy logic or triggers continuous React re-renders.
- **Mitigation**: The `useScroll` hook must strictly debounce or throttle the event (e.g., via `requestAnimationFrame`), and only trigger a state update (`setScrolled(true/false)`) precisely when crossing the predefined threshold, rather than updating continuously. — *[Protects the 60fps scrolling requirement (Traces To: REQ-5)]*

**Risk 2: Layout Shift / Jank during Transition**
- **Description**: Shrinking the logo and collapsing the Pre-Header abruptly can cause the page content below to jump or jitter as the `sticky` container height changes.
- **Mitigation**: Utilize CSS `transition-all duration-300 ease-in-out` on all height and padding properties. The data variants (`data-[scrolled=true]:h-0`) must animate cleanly. — *[Ensures a smooth, non-jarring user experience (Traces To: REQ-4)]*

**Risk 3: Mobile Touch Target Accessibility**
- **Description**: The mobile header is already a single compact bar. Applying the same shrink logic might reduce the hamburger menu or cart icons below accessible touch target sizes.
- **Mitigation**: Confine the most aggressive compacting (e.g., hiding the Pre-Header) to desktop breakpoints, and ensure mobile interactive elements never scale below 44x44px. — *[Maintains mobile accessibility]*