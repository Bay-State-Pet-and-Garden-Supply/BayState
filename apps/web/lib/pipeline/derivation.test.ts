/**
 * @jest-environment node
 */

import {
  ACTIVE_CONSOLIDATION_STATUSES,
  ACTIVE_SCRAPE_JOB_STATUSES,
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
    }) as ActiveJobsSupabaseClient["from"],
  };
}

function createError(
  message: string,
  code?: string
): ActiveJobsQueryError {
  return { message, code };
}

describe("WORKFLOW_PIPELINE_TABS", () => {
  it("exposes the five single-pipeline workflow tabs", () => {
    expect(WORKFLOW_PIPELINE_TABS).toEqual([
      "imported",
      "scraping",
      "scraped",
      "consolidating",
      "finalizing",
    ]);
  });
});

describe("normalizeActiveJobs", () => {
  it("coerces partial values into booleans", () => {
    expect(normalizeActiveJobs()).toEqual({
      scraping: false,
      consolidation: false,
    });

    expect(
      normalizeActiveJobs({
        scraping: 1 as unknown as boolean,
        consolidation: "yes" as unknown as boolean,
      })
    ).toEqual({
      scraping: true,
      consolidation: true,
    });
  });
});

describe("deriveTabFromProduct", () => {
  it.each<{
    name: string;
    product: ProductTabDerivationInput | null | undefined;
    activeJobs?: { scraping?: boolean; consolidation?: boolean } | null;
    expected: WorkflowPipelineTab;
  }>([
    {
      name: "keeps imported products in imported",
      product: { pipeline_status: "imported" },
      expected: "imported",
    },
    {
      name: "moves scraped products with active scraping into scraping",
      product: { pipeline_status: "scraped" },
      activeJobs: { scraping: true },
      expected: "scraping",
    },
    {
      name: "keeps scraped products without active jobs in scraped",
      product: { pipeline_status: "scraped" },
      activeJobs: { scraping: false },
      expected: "scraped",
    },
    {
      name: "moves finalized products with active consolidation into consolidating",
      product: { pipeline_status: "finalized" },
      activeJobs: { consolidation: true },
      expected: "consolidating",
    },
    {
      name: "keeps finalized products without active consolidation in finalizing",
      product: { pipeline_status: "finalized" },
      activeJobs: { consolidation: false },
      expected: "finalizing",
    },
    {
      name: "routes failed products back to imported for retry",
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
      getActiveJobsForProduct({ pipeline_status: "scraped", sku: "   " }, supabase)
    ).resolves.toEqual({
      scraping: false,
      consolidation: false,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("queries scrape and consolidation activity by product id", async () => {
    const scrapePlan = createQueryPlan({
      data: [{ status: "running" }],
      error: null,
    });
    const consolidationPlan = createQueryPlan({
      data: [],
      error: null,
    });
    const supabase = createSupabaseClient({
      scrape_jobs: [scrapePlan],
      consolidation_batches: [consolidationPlan],
    });

    await expect(
      getActiveJobsForProduct({ id: 42, pipeline_status: "scraped" }, supabase)
    ).resolves.toEqual({
      scraping: true,
      consolidation: false,
    });

    expect(scrapePlan.calls).toEqual([
      ["select", "status"],
      ["eq", "product_id", 42],
      ["in", "status", ACTIVE_SCRAPE_JOB_STATUSES],
      ["limit", 1],
    ]);
    expect(consolidationPlan.calls).toEqual([
      ["select", "status"],
      ["contains", "product_ids", [42]],
      ["in", "status", ACTIVE_CONSOLIDATION_STATUSES],
      ["limit", 1],
    ]);
  });

  it("falls back to SKU lookups when id-based queries fail non-fatally", async () => {
    const scrapeIdPlan = createQueryPlan({
      data: null,
      error: createError("Could not find the relation public.scrape_jobs"),
    });
    const scrapeSkuPlan = createQueryPlan({
      data: [{ status: "pending" }],
      error: null,
    });
    const consolidationIdPlan = createQueryPlan({
      data: null,
      error: createError("column missing_product_ids does not exist", "42703"),
    });
    const consolidationSkuPlan = createQueryPlan({
      data: [{ status: "in_progress" }],
      error: null,
    });
    const supabase = createSupabaseClient({
      scrape_jobs: [scrapeIdPlan, scrapeSkuPlan],
      consolidation_batches: [consolidationIdPlan, consolidationSkuPlan],
    });

    await expect(
      getActiveJobsForProduct(
        { id: "product-1", sku: " SKU-123 ", pipeline_status: "finalized" },
        supabase
      )
    ).resolves.toEqual({
      scraping: true,
      consolidation: true,
    });

    expect(scrapeIdPlan.calls).toEqual([
      ["select", "status"],
      ["eq", "product_id", "product-1"],
      ["in", "status", ACTIVE_SCRAPE_JOB_STATUSES],
      ["limit", 1],
    ]);
    expect(scrapeSkuPlan.calls).toEqual([
      ["select", "status"],
      ["contains", "skus", ["SKU-123"]],
      ["in", "status", ACTIVE_SCRAPE_JOB_STATUSES],
      ["limit", 1],
    ]);
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
      scrape_jobs: [
        createQueryPlan({
          data: null,
          error: createError("permission denied for relation scrape_jobs", "42501"),
        }),
      ],
      consolidation_batches: [createQueryPlan()],
    });

    await expect(
      getActiveJobsForProduct({ id: "product-1", pipeline_status: "scraped" }, supabase)
    ).rejects.toThrow("permission denied for relation scrape_jobs");
  });
});
