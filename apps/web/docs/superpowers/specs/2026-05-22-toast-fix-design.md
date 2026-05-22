# Toast Notification Relocation Design Spec

**Goal:** Relocate global toast notifications to prevent them from blocking critical header utilities (specifically the Cart and User Menu).

**Primary User Action:** The user adds an item to the cart and receives immediate confirmation without losing access to the Cart button or Search.

## Design Direction

*   **Desktop:** `top-center`. This position is highly visible but clears the "utility cluster" in the top-right. It feels like a "system message" rather than a floating obstruction.
*   **Mobile:** `bottom-center`. Mobile users interact primarily with the bottom half of the screen. `bottom-center` avoids the top-right cart icon and the `StickyCart` (which is typically positioned in corners).
*   **Aesthetic:** Maintain existing `sonner` styling (clean, readable, consistent with the `feed-bag-cream` and `ledger-charcoal` palette).
*   **Color strategy:** Restrained (matching existing brand identity).
*   **Theme scene sentence:** A Taunton resident browsing for garden supplies in their kitchen at noon, wanting a quick, clear confirmation of their action that doesn't hide their next step.

## Scope

*   **Fidelity:** Production-ready.
*   **Breadth:** Global configuration change in root `layout.tsx`.
*   **Interactivity:** Toast remains dismissible and auto-expires after 3 seconds.
*   **Time intent:** Polish until it ships.

## Layout Strategy

On desktop, the toast will drop down from the top center. This aligns with the site's "Practical Clarity" principle—it's the most logical place for a status update that isn't tied to a specific sidebar or corner.

## Key States

*   **Default/Success:** Standard confirmation for "Added to cart", "Removed from favorites", etc.
*   **Persistence:** The toast must not block the user from clicking the Cart icon if they decide to checkout immediately.

## Interaction Model

*   **Trigger:** Any call to `toast.success`, `toast.error`, etc.
*   **Feedback:** Animated entry from top (desktop) or bottom (mobile).
*   **Duration:** 3 seconds (as currently configured).

## Content Requirements

*   No changes to existing toast messages.

## Recommended References

*   `interaction-design.md`
*   `layout.md`

## Open Questions

*   None.
