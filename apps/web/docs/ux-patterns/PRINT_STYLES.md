# Print Styles Documentation

## Overview
This feature adds optimized print styling to the Bay State Pet & Garden Supply application. It ensures that pages look professional and clean when printed or saved as PDF, removing unnecessary UI elements and optimizing typography for readability on paper.

## Global Print Styles
The print styles are defined in `app/globals.css` within a `@media print` block. These styles are applied automatically to all pages.

### Key Features
- **UI Cleanup**: Automatically hides navigation, headers, footers, sidebars, buttons, dialogs, and alerts.
- **Layout Reset**: Resets backgrounds to white, text to black, and removes scroll containers to ensure full content visibility.
- **Typography**: Sets a readable 12pt font size and ensures high contrast.
- **Link Handling**: Expands external URLs (e.g., `Link (http://...)`) for reference on paper, while ignoring internal/hash links.
- **Page Breaks**: Prevents awkward breaks inside images, tables, and code blocks, and keeps headings with their following content.

## Utility Classes
Developers can use these utility classes to control print layout:

| Class | Description |
|-------|-------------|
| `.no-print` | Hides the element when printing. |
| `.print:hidden` | Tailwind-style alias for hiding elements when printing. |
| `.page-break` | Forces a page break *before* the element. |

## How to Test
You don't need a printer to test these styles.

1. **Chrome/Edge**:
   - Open Developer Tools (`F12` or `Cmd+Option+I`).
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows) to open the Command Menu.
   - Type "Rendering" and select "Show Rendering".
   - Scroll down to "Emulate CSS media type" and select **print**.
   - The page will update to show the print view.

2. **Firefox**:
   - Open Developer Tools.
   - Click the "Toggle print media simulation" icon (looks like a page) in the style editor or rules view.

## Development Guidelines
When building new pages or components, follow these rules to ensure print optimization:

1. **Hide Interactive Elements**: Use `.no-print` or `.print:hidden` on elements that make no sense on paper (e.g., "Add to Cart" buttons, filters, pagination controls).
2. **Check Contrast**: Ensure critical information isn't lost when background colors are removed (browsers often remove background colors by default to save ink).
3. **Avoid Scroll Areas**: Print layout has no scrollbars. Ensure long content can flow naturally down the page.
4. **Break Points**: Use `.page-break` if a section must start on a new page (e.g., a new invoice or receipt).

## Code Example
```tsx
<div className="product-page">
  <Header className="no-print" />
  <main>
    <h1>Product Name</h1>
    <p>Description...</p>
    
    {/* This button will be hidden on print */}
    <button className="no-print">Buy Now</button>
    
    {/* Force a new page for technical specs */}
    <section className="page-break">
      <h2>Specifications</h2>
      {/* ... */}
    </section>
  </main>
</div>
```
