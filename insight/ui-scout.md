# UI Scout Report: Distributor Grouping & Run Mode Derivation

## 1. Why Central Pet, Orgill, Phillips, Pet Food Experts show under one "Enriched" source

### Data architecture

There is no separate `sources.phillips`, `sources.orgill`, `sources.petfoodex` entry for each distributor. Instead, **all per-distributor extraction results are merged into a single `sources.enriched` JSONB object** at the product level. Each individual source's extraction snapshot is appended to the `source_results[]` array *inside* the enriched entry.

**Callback route** (`apps/web/app/api/scraper/v1/enrichment-callback/route.ts`, lines 188-193):
```ts
const currentSources = (product?.sources as Record<string, unknown>) ?? {};
const updatedSources = {
  ...currentSources,
  enriched: normalized as any,   // <-- single slot, overwritten each callback
};
```

**Normalized enrichment shape** (`apps/web/lib/enrichment/contracts.ts`, lines 142-149):
```ts
source_results?: Array<{
  sourceSlug: string;       // e.g. "phillips", "orgill", "petfoodex"
  sourceType: string;       // e.g. "distributor"
  confidence: number;
  matchedFields?: string[];
  evidenceUrl?: string | null;
}>;
```

### UI rendering

**`ProcessedResultsView.tsx`** reads `source_results` from the enriched entry to build the tab label (lines ~636-642):
```tsx
{key === "enriched" ? (
  <>
    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
    {(() => {
      const sourceResults = srcData?.["source_results"] as any[];
      if (Array.isArray(sourceResults) && sourceResults.length > 0) {
        const names = Array.from(
          new Set(
            sourceResults.map((sr) => formatSourceSlug(sr.sourceSlug))
          )
        );
        if (names.length > 0) {
          return `Enriched (${names.join(", ")})`;  // ← produces "Enriched (Central Pet, Orgill, Phillips, Pet Food Experts)"
        }
      }
      return "Enriched";
    })()}
  </>
) : (
  formatSourceSlug(key)
)}
```

The `SOURCE_FRIENDLY_NAMES` mapping (line ~62) handles friendly labels:
```ts
const SOURCE_FRIENDLY_NAMES: Record<string, string> = {
  phillips: "Phillips Pet",
  orgill: "Orgill",
  petfoodex: "Pet Food Experts",
};
```

The same pattern repeats in the source detail badge (lines ~800-803).

**Impact:** All distributor results are presented as a **single tab labeled "Enriched"** with a concatenated list of distributor names, rather than as individual draggable source tabs. The "Remove source" delete button is not available when the `enriched` tab is active (line ~802):
```tsx
{activeSource !== "enriched" && (
  <Button ...>Remove source</Button>
)}
```

### Dedup / re-scrape behavior

**`source-plan.ts`** (lines 164-218) — when deciding which sources need scraping, it checks `sources.enriched.source_results[]` for a matching `sourceSlug` with `confidence >= 0.6` and `extracted_at` within 48h. If all conditions hold, the source is skipped on re-scrape. This means mixed runs re-scraping only the distributors that are missing or stale, and the `source_results[]` array absorbs any new results.

---

## 2. How Extracting/active runs monitors derive and display run modes

### Source of truth: `extractionMode` parameter

**`ManagementPanel.tsx`** (lines ~58, ~216-228) captures the extraction mode:
```tsx
const [extractionMode, setExtractionMode] = useState<"mixed" | "distributor_only" | "ai_only">("mixed");
```
And passes it to the jobs API:
```tsx
body: JSON.stringify({
  skus,
  extractionMode,   // ← the key value
  forceRefresh,
  config: { source_type: 'approved_source_extraction' },
}),
```

### Jobs API route (`apps/web/app/api/admin/enrichment/jobs/route.ts`)

Lines ~59-65:
```ts
const extractionMode = rawExtractionMode ?? "mixed";
```

Line ~81 — validates:
```ts
const VALID_EXTRACTION_MODES = ["mixed", "distributor_only", "ai_only"];
```

Lines ~178-180 — `extractionMode` is stored into job config:
```ts
jobConfig.extraction_mode = extractionMode;
```

Line ~184 — the job's `mode` column is set (fallback chain: `mode` param → `extractionMode` → "mixed"):
```ts
const jobMode = mode ?? extractionMode ?? "mixed";
```

Line ~186 — each `enrichment_attempt` also gets `mode: jobMode`.

### ActiveEnrichmentsTab display

**`ActiveEnrichmentsTab.tsx`**, `EnrichmentJobCard` component (line ~506):
```tsx
<Badge variant="outline" className="...">
  {job.mode ?? "mixed"}
</Badge>
```

The `job.mode` value comes from `enrichment_jobs.mode` via `useJobSubscription` → `JobAssignment` type. It displays as a label like "mixed", "distributor_only", or "ai_only".

### Source-plan filtering by mode

**`source-plan.ts`** (lines ~517-521) filters the source plan entries before building the job:
```ts
if (extractionMode === "ai_only") {
  orderedEntries = orderedEntries.filter(e => e.sourceType === "official_brand");
} else if (extractionMode === "distributor_only") {
  orderedEntries = orderedEntries.filter(e => e.sourceType !== "official_brand");
}
```

### ManagingPanel mode selector

The `select` element in ManagementPanel (lines ~218-229) allows choosing between three modes via form label text:
| Value | UI label |
|-------|----------|
| `mixed` | "Full Extraction" |
| `distributor_only` | "Distributor Only" |
| `ai_only` | "AI Only" |

Note: The UI label "Full Extraction" ≠ the stored value "mixed". The stored value is what appears in the badge on the ActiveEnrichmentsTab.

---

## 3. Impacted Views (file/line evidence)

| File | Lines | What it does |
|------|-------|-------------|
| `ProcessedResultsView.tsx` | 62-64, 314-330, 636-642 | Defines `SOURCE_FRIENDLY_NAMES`; builds "Enriched (...)" tab label from `source_results[].sourceSlug`; delete button hidden for enriched tab |
| `ProcessedResultsView.tsx` | 800-803 | Badge rendering in detail panel uses same `source_results` grouping |
| `enrichment-callback/route.ts` | 188-193 | Merges normalized result into `sources.enriched` — all distributors collapse into one slot |
| `contracts.ts` | 109, 142-149 | Defines `NormalizedEnrichedSourceV1.source_results[]` shape |
| `normalize-result.ts` | 17-48 | Normalizes `EnrichmentResultV1.source_results` into the enriched object |
| `source-plan.ts` | 164-218 | Dedup logic reads `sources.enriched.source_results[]` per-sourceSlug |
| `source-plan.ts` | 517-521 | Filters entries based on `extractionMode` |
| `ManagementPanel.tsx` | 52-58, 216-245 | State `extractionMode`; `<select>` UI for mode; passes to POST `/api/admin/enrichment/jobs` |
| `jobs/route.ts` | 59-65, 178-186 | Accepts `extractionMode`; stores as `job.mode` and `attempt.mode` |
| `ActiveEnrichmentsTab.tsx` | 506 | Displays `job.mode ?? "mixed"` badge on the job card |
| `EnrichmentJobCard` | 506 | Displays mode badge |
| `PipelineProductCard.tsx` | — | Not directly involved in grouping logic; shows product-level enrichment detection via `hasScrapedData` |

---

## 4. Key insight for the extraction issue

The UI treats ALL distributor results as a **monolithic "Enriched" source** because there's only one `sources.enriched` key per product. Individual distributor data lives inside `source_results[]` — visible in the raw JSON dump at the bottom of the detail panel but NOT as separate tab-able sources. If extraction results for one distributor (e.g., Central Pet) overwrite or conflict with another (e.g., Phillips), the last callback wins because `sources.enriched` is a single slot.

The `source_results[]` aggregation is done upstream by the Python runner before posting the callback — the web callback route simply stores whatever the runner provides in the `EnrichmentResultV1.source_results` field.

To address the issue, you'd likely need to either change the data model to store per-distributor entries (e.g., `sources.phillips`, `sources.orgill`), or change the consolidation pipeline to understand that `source_results[]` represents independently-contributed data from multiple vendors.
