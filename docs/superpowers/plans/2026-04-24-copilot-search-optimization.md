# Copilot Search Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Copilot's search capabilities to include descriptions/GTIN in general queries and add targeted field filters.

**Architecture:** Update Zod schemas for tool inputs and workspace scopes, then refine the search and filtering logic in the workspace utility.

**Tech Stack:** TypeScript, Zod, Jest.

---

### Task 1: Update Schemas and Input Types

**Files:**
- Modify: `apps/web/lib/pipeline/finalization-copilot-workspace.ts:36-60`

- [ ] **Step 1: Expand `listWorkspaceProductsInputSchema`**
Update `listWorkspaceProductsInputSchema` to include optional `name`, `description`, and `brand` fields.

```typescript
export const listWorkspaceProductsInputSchema = z.object({
  query: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  brand: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
```

- [ ] **Step 2: Expand `finalizationProductScopeSchema`**
Update the `query` variant of `finalizationProductScopeSchema` to match the new input schema and add a refinement to ensure at least one filter is provided.

```typescript
  z.object({
    type: z.literal("query"),
    query: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    brand: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }).refine(
    (data) => data.query || data.name || data.description || data.brand,
    { message: "At least one search parameter must be provided" }
  ),
```

- [ ] **Step 3: Commit**
```bash
git add apps/web/lib/pipeline/finalization-copilot-workspace.ts
git commit -m "feat(copilot): expand search input and scope schemas"
```

---

### Task 2: Implement Enhanced Search Logic

**Files:**
- Modify: `apps/web/lib/pipeline/finalization-copilot-workspace.ts:167-220`
- Test: `apps/web/__tests__/lib/pipeline/finalization-copilot-workspace.test.ts`

- [ ] **Step 1: Update `matchesWorkspaceQuery` for broad search**
Update `matchesWorkspaceQuery` to include `draft.description`, `draft.longDescription`, and `draft.gtin` in the broad search.

```typescript
function matchesWorkspaceQuery(
  product: PipelineProduct,
  summary: FinalizationWorkspaceProductSummary,
  draft: FinalizationDraft | undefined,
  query: string,
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchableFields = [
    product.sku,
    summary.name ?? "",
    getSearchableBrandText(product, draft),
    draft?.description ?? "",
    draft?.longDescription ?? "",
    draft?.gtin ?? "",
    ...summary.sourceKeys,
  ];

  return searchableFields.some((value) =>
    value.toLowerCase().includes(normalizedQuery),
  );
}
```

- [ ] **Step 2: Update `listWorkspaceProducts` to handle targeted filters**
Refactor `listWorkspaceProducts` to handle `name`, `description`, and `brand` filters independently and combine them with the broad `query`.

```typescript
export function listWorkspaceProducts(
  products: PipelineProduct[],
  draftsBySku: Record<string, FinalizationDraft>,
  savedDraftsBySku: Record<string, FinalizationDraft>,
  selectedSku: string | null,
  input: ListWorkspaceProductsInput = {},
): {
  total: number;
  matched: number;
  products: FinalizationWorkspaceProductSummary[];
} {
  const summaries = products.map((product) =>
    buildWorkspaceProductSummary(
      product,
      draftsBySku[product.sku],
      savedDraftsBySku[product.sku],
      selectedSku,
    ),
  );

  const filtered = summaries.filter((summary, index) => {
    const product = products[index];
    const draft = draftsBySku[product.sku];

    // Broad query check
    if (input.query && !matchesWorkspaceQuery(product, summary, draft, input.query)) {
      return false;
    }

    // Targeted filters (AND logic)
    if (input.name && !summary.name?.toLowerCase().includes(input.name.toLowerCase())) {
      return false;
    }

    if (input.brand && !getSearchableBrandText(product, draft).toLowerCase().includes(input.brand.toLowerCase())) {
      return false;
    }

    if (input.description) {
      const desc = (draft?.description ?? "") + " " + (draft?.longDescription ?? "");
      if (!desc.toLowerCase().includes(input.description.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  const limit = input.limit ?? 25;

  return {
    total: summaries.length,
    matched: filtered.length,
    products: filtered.slice(0, limit),
  };
}
```

- [ ] **Step 3: Update `resolveFinalizationProductScope`**
Ensure `name`, `description`, and `brand` are passed to `listWorkspaceProducts`.

```typescript
    case "query":
      return listWorkspaceProducts(
        products,
        draftsBySku,
        savedDraftsBySku,
        selectedSku,
        {
          query: scope.query,
          name: scope.name,
          description: scope.description,
          brand: scope.brand,
          limit: scope.limit ?? 200,
        },
      ).products.map((product) => product.sku);
```

- [ ] **Step 4: Write verification tests**
Add a test case to `apps/web/__tests__/lib/pipeline/finalization-copilot-workspace.test.ts` that verifies searching by description and broad query inclusion.

```typescript
  it("filters products by description and expanded broad query", () => {
    const alpha = createProduct("SKU-ALPHA");
    const alphaDraft = {
      ...buildInitialFinalizationDraft(alpha),
      description: "Schleich horse figurine",
    };
    
    const resultQuery = listWorkspaceProducts(
      [alpha],
      { [alpha.sku]: alphaDraft },
      { [alpha.sku]: alphaDraft },
      null,
      { query: "schleich" }
    );
    expect(resultQuery.matched).toBe(1);

    const resultTargeted = listWorkspaceProducts(
      [alpha],
      { [alpha.sku]: alphaDraft },
      { [alpha.sku]: alphaDraft },
      null,
      { description: "figurine" }
    );
    expect(resultTargeted.matched).toBe(1);
    
    const resultMiss = listWorkspaceProducts(
      [alpha],
      { [alpha.sku]: alphaDraft },
      { [alpha.sku]: alphaDraft },
      null,
      { description: "dragon" }
    );
    expect(resultMiss.matched).toBe(0);
  });
```

- [ ] **Step 5: Run tests**
Run: `npm test -- apps/web/__tests__/lib/pipeline/finalization-copilot-workspace.test.ts`

- [ ] **Step 6: Commit**
```bash
git add apps/web/lib/pipeline/finalization-copilot-workspace.ts apps/web/__tests__/lib/pipeline/finalization-copilot-workspace.test.ts
git commit -m "feat(copilot): implement enhanced search and filtering logic"
```

---

### Task 3: Update Copilot Tool Definitions

**Files:**
- Modify: `apps/web/lib/tools/finalization-copilot.ts`

- [ ] **Step 1: Update `listWorkspaceProducts` tool description**
Update the description of `listWorkspaceProducts` to include mention of searching by name, description, and brand.

- [ ] **Step 2: Commit**
```bash
git add apps/web/lib/tools/finalization-copilot.ts
git commit -m "docs(copilot): update listWorkspaceProducts tool description"
```
