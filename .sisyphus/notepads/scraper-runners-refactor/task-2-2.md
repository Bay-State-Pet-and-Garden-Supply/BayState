# Task 2.2: Create Method Selection step

## Context
Second step of the enrichment workflow where users choose the enrichment method.

## Implementation Notes
- Create component: `BayStateApp/components/admin/enrichment/MethodSelection.tsx`
- Radio group with two options: "Static Scrapers" and "AI Discovery"
- Conditional panels based on selection
- Must fetch scrapers list from API for "Static Scrapers" panel
- Discovery panel shows simplified config (not the bloated AI Config)

## UI Requirements
- Radio buttons with `data-testid="enrichment-method-scrapers"` and `data-testid="enrichment-method-discovery"`
- Scraper panel with `data-testid="scraper-selection-panel"`
- Discovery panel with `data-testid="discovery-config-panel"`
- Scraper checklist with `data-testid="scraper-checklist"`
- Continue button to proceed to next step

## Discovery Config Options (max 4)
- Max search results
- LLM model selection
- Max steps
- Confidence threshold

## References
- `components/admin/scrapers/ai/DiscoveryConfigPanel.tsx` - for config options reference
- Use shadcn/ui: RadioGroup, Checkbox, Select, Slider

## Data Flow
- Receives: `selectedSkus` from previous step
- Returns: `{ method: 'scrapers' | 'discovery', config: object }` via onNext prop

## Implementation Results
- Created `MethodSelection` component with "Static Scrapers" and "AI Discovery" modes
- Added API call to `/api/admin/scrapers` to fetch and display active scrapers
- Implemented simplified discovery configuration (max 4 options)
- Reused shadcn/ui components (`RadioGroup`, `Slider`, `Select`, `Checkbox`, etc.)
- Added all requested `data-testid` attributes
- TypeScript types verified (component has no direct TS errors, unrelated errors ignored)
