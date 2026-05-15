/**
 * @jest-environment node
 */

import {
  ACTIVE_CONSOLIDATION_STATUSES,
  ACTIVE_ENRICHMENT_JOB_STATUSES,
  WORKFLOW_PIPELINE_TABS,
  type ActiveJobsQueryBuilder,
  deriveTabFromProduct,
  getActiveJobsForProduct,
  normalizeActiveJobs,
  type ActiveJobsQueryError,
  type ActiveJobsQueryResult,
  type ActiveJobsSupabaseClient,
  type ProductTabDerivationInput,
  type WorkflowPipelineTab,
} from "./derivation";

type QueryCall =
  | ["select", string]
  | ["eq", string, string | number]
  | ["in", string, readonly string[]]
  | ["contains", string, readonly (string | number)[]]
  | ["limit", number];

interface QueryPlan {
  result: ActiveJobsQueryResult;
  calls: QueryCall[];
}

function createQueryPlan(
  result: ActiveJobsQueryResult = { data: [], error: null }
): QueryPlan {
  return {
    result,
    calls: [],
  };
}

function createQueryBuilder(plan: QueryPlan) {
  const builder = Promise.resolve(plan.result) as unknown as ActiveJobsQueryBuilder;

  builder.select = jest.fn((columns: string) => {
    plan.calls.push(["select", columns]);
    return builder;
  });
  builder.eq = jest.fn((column: string, value: string | number) => {
    plan.calls.push(["eq", column, value]);
    return builder;
  });
  builder.in = jest.fn((column: string, values: readonly string[]) => {
    plan.calls.push(["in", column, values]);
    return builder;
  });
  builder.contains = jest.fn((column: string, value: readonly (string | number)[]) => {
    plan.calls.push(["contains", column, value]);
    return builder;
  });
  builder.limit = jest.fn((count: number) => {
    plan.calls.push(["limit", count]);
    return builder;
  });

  return builder;
}

function createSupabaseClient(plansByTable: Record<string, QueryPlan[]>): ActiveJobsSupabaseClient {
  return {
    from: jest.fn((table: string) => {
      const tablePlans = plansByTable[table];
      const plan = tablePlans?.shift();

      if (!plan) {
        throw new Error(`Unexpected query for table ${table}`);
      }

      return createQueryBuilder(plan);
    }) as unknown as ActiveJobsSupabaseClient["from"],
  };
}

function createError(
  message: string,
  code?: string
): ActiveJobsQueryError {
  return { message, code };
}

describe("WORKFLOW_PIPELINE_TABS", () => {
  it("exposes the canonical workflow tabs", () => {
    expect(WORKFLOW_PIPELINE_TABS).toEqual([
      "imported",
      "extracting",
      "processed",
      "merging",
      "reviewing",
      "publishing",
      "failed",
    ]);
  });
});

describe("normalizeActiveJobs", () => {
  it("coerces partial values into booleans", () => {
    expect(normalizeActiveJobs()).toEqual({
      extracting: false,
      merging: false,
    });

    expect(
      normalizeActiveJobs({
        extracting: 1 as unknown as boolean,
        merging: "yes" as unknown as boolean,
      })
    ).toEqual({
      extracting: true,
      merging: true,
    });
  });
});

describe("deriveTabFromProduct", () => {
  it.each<{
    name: string;
    product: ProductTabDerivationInput | null | undefined;
    activeJobs?: { extracting?: boolean; merging?: boolean } | null;
    expected: WorkflowPipelineTab;
  }>([
    {
      name: "keeps imported products in imported",
      product: { pipeline_status: "imported" },
      expected: "imported",
    },
    {
      name: "keeps extracting products in extracting",
      product: { pipeline_status: "extracting" },
      expected: "extracting",
    },

    {
      name: "keeps processed products in processed",
      product: { pipeline_status: "processed" },
      expected: "processed",
    },
    {
      name: "keeps merging products in merging",
      product: { pipeline_status: "merging" },
      expected: "merging",
    },
    {
      name: "keeps reviewing products in reviewing",
      product: { pipeline_status: "reviewing" },
      expected: "reviewing",
    },
    {
      name: "keeps publishing products in publishing",
      product: { pipeline_status: "publishing" },
      expected: "publishing",
    },
    {
      name: "routes failed products into imported for retry",
      product: { pipeline_status: "failed" },
      expected: "imported",
    },
    {
      name: "defaults unknown products to imported",
      product: null,
      expected: "imported",
    },
  ])("$name", ({ product, activeJobs, expected }) => {
    expect(deriveTabFromProduct(product, activeJobs)).toBe(expected);
  });
});

describe("getActiveJobsForProduct", () => {
  it("returns no active work when the product has no usable identifiers", async () => {
    const supabase = createSupabaseClient({});

    await expect(
      getActiveJobsForProduct({ pipeline_status: "processed", sku: "   " }, supabase)
    ).resolves.toEqual({
      extracting: false,
      merging: false,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("queries enrichment and consolidation activity by SKU", async () => {
    const enrichPlan = createQueryPlan({
      data: [{ status: "running" }],
      error: null,
    });
    const consolidationPlan = createQueryPlan({
      data: [],
      error: null,
    });
    const supabase = createSupabaseClient({
      enrichment_jobs: [enrichPlan],
      consolidation_batches: [consolidationPlan, createQueryPlan({ data: [], error: null })],
    });

    await expect(
      getActiveJobsForProduct({ id: 42, sku: "SKU-42", pipeline_status: "processed" }, supabase)
    ).resolves.toEqual({
      extracting: true,
      merging: false,
    });

    expect(enrichPlan.calls).toEqual([
      ["select", "status"],
      ["contains", "skus", ["SKU-42"]],
      ["in", "status", ACTIVE_ENRICHMENT_JOB_STATUSES],
      ["limit", 1],
    ]);
    expect(consolidationPlan.calls).toEqual([
      ["select", "status"],
      ["contains", "product_ids", [42]],
      ["in", "status", ACTIVE_CONSOLIDATION_STATUSES],
      ["limit", 1],
    ]);
  });

  it("queries consolidation by both id and sku", async () => {
    const enrichPlan = createQueryPlan({
      data: [],
      error: null,
    });
    const consolidationIdPlan = createQueryPlan({
      data: [],
      error: null,
    });
    const consolidationSkuPlan = createQueryPlan({
      data: [{ status: "in_progress" }],
      error: null,
    });
    const supabase = createSupabaseClient({
      enrichment_jobs: [enrichPlan],
      consolidation_batches: [consolidationIdPlan, consolidationSkuPlan],
    });

    await expect(
      getActiveJobsForProduct(
        { id: "product-1", sku: " SKU-123 ", pipeline_status: "reviewing" },
        supabase
      )
    ).resolves.toEqual({
      extracting: false,
      merging: true,
    });

    expect(consolidationIdPlan.calls).toEqual([
      ["select", "status"],
      ["contains", "product_ids", ["product-1"]],
      ["in", "status", ACTIVE_CONSOLIDATION_STATUSES],
      ["limit", 1],
    ]);
    expect(consolidationSkuPlan.calls).toEqual([
      ["select", "status"],
      ["contains", "product_ids", ["SKU-123"]],
      ["in", "status", ACTIVE_CONSOLIDATION_STATUSES],
      ["limit", 1],
    ]);
  });

  it("throws when a lookup fails with a fatal query error", async () => {
    const supabase = createSupabaseClient({
      enrichment_jobs: [
        createQueryPlan({
          data: null,
          error: createError("permission denied for relation enrichment_jobs", "42501"),
        }),
      ],
      consolidation_batches: [createQueryPlan()],
    });

    await expect(
      getActiveJobsForProduct({ id: "product-1", sku: "SKU-1", pipeline_status: "processed" }, supabase)
    ).rejects.toThrow("permission denied for relation enrichment_jobs");
  });
});
