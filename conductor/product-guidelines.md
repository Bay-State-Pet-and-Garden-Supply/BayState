# Product Guidelines

## Prose Style
- **Professional/Concise:** Use clear, action-oriented language for all internal documentation and the admin panel interface.
- **Tone:** Professional and objective, focusing on clarity of status and instruction.

## UX Principles
- **Immediate Feedback:** Provide real-time status updates for scraper jobs and execution progress.
- **Deep Visibility:** Ensure all job logs and execution details are easily accessible for troubleshooting and verification.
- **Workflow Efficiency:** Design the interface to minimize the number of clicks required to initiate, monitor, and manage common scraping tasks.

## Design and Visual Style
- **Robust Utilitarian Aesthetic:** Avoid "AI Slop" or generic "SaaS-y" defaults (like soft rounding, muted colors, and standard Shadcn/UI cards).
- **High-Density Dashboard:** Prioritize high-throughput diagnostic information using compact table views, sparklines, and peekable details to maximize visibility without overwhelming the operator.
- **Storefront Branding:** Maintain a bold, energetic aesthetic for customer-facing areas:
    - **Typography:** Use `font-display`, `font-black`, `uppercase`, and `tracking-tighter` for headings.
    - **Borders & Shadows:** Use heavy borders (`border-4 border-zinc-900`) and blocky shadows (`shadow-[8px_8px_0px_rgba(0,0,0,1)]`).
    - **Corners:** Use `rounded-none` or very sharp corners.
    - **Color:** Use high-contrast primary colors (green, red, blue, orange, accent) to differentiate sections.
- **Branding:** Maintain a clean, functional aesthetic consistent with a professional internal tool for admin areas.

## Accessibility
- **WCAG AA/AAA Standard:** Adhere to high accessibility standards, ensuring the admin panel is usable by everyone, including those relying on assistive technologies.
- **Clarity and Contrast:** Use clear typography and high-contrast color schemes to enhance readability for all operators.
