# Task 2.3: Add Chunk/Runner Configuration step

## Context
Third step of the enrichment workflow where users configure chunking and runner settings.

## Implementation Notes
- Create component: `BayStateApp/components/admin/enrichment/ChunkConfig.tsx`
- Slider for "SKUs per chunk" (10-100, default 50)
- Number input for "Max workers per runner" (1-10, default 3)
- Number input for "Max runners" (optional, blank = unlimited)
- Cost estimate for Discovery method only (simple calculation)

## UI Requirements
- Slider with `data-testid="chunk-size-slider"`
- Workers input with `data-testid="max-workers-input"`
- Runners input with `data-testid="max-runners-input"`
- Cost estimate display with `data-testid="cost-estimate"` (Discovery only)
- Continue button with `data-testid="enrichment-next-button"`

## Cost Calculation (Simple)
- Discovery: ~$0.05 per product for search + extraction
- Formula: `selectedSkus.length * 0.05` (capped at maxDiscoveryCostUsd)
- Display: "~$X.XX estimated cost for Y products"

## References
- Use shadcn/ui: Slider, Input, Label, Button
- DiscoveryConfigPanel.tsx for slider patterns

## Data Flow
- Receives: `method`, `config` from previous step, `selectedSkus` count
- Returns: `{ chunkSize, maxWorkers, maxRunners }` via onNext prop

## Implementation Results
- Created `BayStateApp/components/admin/enrichment/ChunkConfig.tsx`
- Added Slider for chunk size (10-100 range)
- Added number inputs for max workers (1-10) and max runners
- Added estimated cost display for Discovery method
- Applied required `data-testid` attributes to all interactive elements
- Component properly validates input before calling `onNext`
