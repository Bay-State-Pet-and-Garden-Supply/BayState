# Task 2.5: Create Enrichment page shell

## Context
Final task of Phase 2 - create the main page that integrates all four step components into a unified workflow.

## Implementation Notes
- File: `BayStateApp/app/admin/enrichment/page.tsx`
- Stepper header showing: Products → Method → Config → Review
- State management with useState (not complex state machine)
- Integration of components:
  - EnrichmentLauncher (step 1)
  - MethodSelection (step 2)
  - ChunkConfig (step 3)
  - ReviewSubmit (step 4)

## Stepper UI
- 4 steps with labels
- Current step highlighted
- Progress indication
- Can use shadcn Stepper or custom implementation

## State Management
```typescript
const [step, setStep] = useState(1);
const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
const [method, setMethod] = useState<'scrapers' | 'discovery'>('scrapers');
const [methodConfig, setMethodConfig] = useState<any>(null);
const [chunkConfig, setChunkConfig] = useState<any>(null);
```

## Navigation
- Next button advances to next step
- Back button returns to previous step
- Data persists when going back

## No Persistence
- Refresh = start over (acceptable per requirements)
- No localStorage or sessionStorage needed

## References
- Look at existing admin page patterns in `app/admin/`
- Use shadcn Stepper component if available
