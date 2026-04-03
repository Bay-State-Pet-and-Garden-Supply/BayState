/**
 * @jest-environment node
 */

import {
  queryConsolidatingTabProducts,
  queryFinalizingTabProducts,
  queryImportedTabProducts,
  queryProductsForWorkflowTab,
  queryScrapedTabProducts,
  queryScrapingTabProducts,
  queryWorkflowTabCounts,
  type PipelineQuerySupabaseClient,
} from "./queries";

type QueryCall =
  | ["select", string, { count?: "exact" | "planned" | "estimated" } | undefined]
  | ["eq", string, string]
  | ["in", string, readonly string[]]
  | ["not", string, string, string]
  | ["or", string]
  | ["order", string, { ascending?: boolean } | undefined]
  | ["range", number, number];

interface QueryPlan<Row extends Record<string, unknown> = Record<string, unknown>> {
  result: {
    data: Row[] | null;
    error: { code?: string; message: string } | null;
    count?: number | null;
  };
  calls: QueryCall[];
}

function createQueryPlan<Row extends Record<string, unknown> = Record<string, unknown>>(
  result: QueryPlan<Row>["result"]
): QueryPlan<Row> {
  return {
    result,
    calls: [],
  };
}

function createQueryBuilder(plan: QueryPlan) {
  const builder = Promise.resolve(plan.result) as Promise<typeof plan.result> & {
    select: (columns: string, options?: { count?: "exact" | "planned" | "estimated" }) => typeof builder;
    eq: (column: string, value: string) => typeof builder;
    in: (column: string, values: readonly string[]) => typeof builder;
    not: (column: string, operator: string, value: string) => typeof builder;
    or: (filters: string) => typeof builder;
    order: (column: string, options?: { ascending?: boolean }) => typeof builder;
    range: (from: number, to: number) => typeof builder;
  };

  builder.select = jest.fn((columns: string, options?: { count?: "exact" | "planned" | "estimated" }) => {
    plan.calls.push(["select", columns, options]);
    return builder;
  });
  builder.eq = jest.fn((column: string, value: string) => {
    plan.calls.push(["eq", column, value]);
    return builder;
  });
  builder.in = jest.fn((column: string, values: readonly string[]) => {
    plan.calls.push(["in", column, values]);
    return builder;
  });
  builder.not = jest.fn((column: string, operator: string, value: string) => {
    plan.calls.push(["not", column, operator, value]);
    return builder;
  });
  builder.or = jest.fn((filters: string) => {
    plan.calls.push(["or", filters]);
    return builder;
  });
  builder.order = jest.fn((column: string, options?: { ascending?: boolean }) => {
    plan.calls.push(["order", column, options]);
    return builder;
  });
  builder.range = jest.fn((from: number, to: number) => {
    plan.calls.push(["range", from, to]);
    return builder;
  });

  return builder;
}

function createSupabaseClient(plansByTable: Record<string, QueryPlan[]>): PipelineQuerySupabaseClient {
  return {
    from: jest.fn((table: string) => {
      const tablePlans = plansByTable[table];
      const plan = tablePlans?.shift();

      if (!plan) {
        throw new Error(`Unexpected query for table ${table}`);
      }

      return createQueryBuilder(plan);
    }) as PipelineQuerySupabaseClient["from"],
  };
}

function createProduct(id: string, sku: string, status: "imported" | "scraped" | "finalized"): {
  id: string;
  sku: string;
  pipeline_status: "imported" | "scraped" | "finalized";
  input: { name: string; price: number };
  sources: Record<string, never>;
  consolidated: { name: string; price: number };
  created_at: string;
  updated_at: string;
} {
  return {
    id,
    sku,
    pipeline_status: status,
    input: { name: sku, price: 10 },
    sources: {},
    consolidated: { name: sku, price: 10 },
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  };
}

describe("pipeline queries", () => {
  it("queries imported products with normalized pagination", async () => {
    const productsPlan = createQueryPlan({
      data: [createProduct("p-1", "SKU-1", "imported")],
      error: null,
      count: 1,
    });
    const supabase = createSupabaseClient({
      products_ingestion: [productsPlan],
    });

    const result = await queryImportedTabProducts(supabase, { limit: 25, offset: 10 });

    expect(result.tab).toBe("imported");
    expect(result.count).toBe(1);
    expect(result.products).toHaveLength(1);
    expect(productsPlan.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "pipeline_status", "imported"],
      ["order", "updated_at", { ascending: false }],
      ["range", 10, 34],
    ]);
  });

  it("queries scraping products by including active scrape identifiers", async () => {
    const activeScrapesPlan = createQueryPlan({
      data: [
        { product_id: "prod-1", skus: ["SKU-1", " "] },
        { product_id: null, skus: ["SKU-2"] },
      ],
      error: null,
    });
    const productsPlan = createQueryPlan({
      data: [createProduct("prod-1", "SKU-1", "scraped")],
      error: null,
      count: 1,
    });
    const supabase = createSupabaseClient({
      scrape_jobs: [activeScrapesPlan],
      products_ingestion: [productsPlan],
    });

    const result = await queryScrapingTabProducts(supabase);

    expect(result.tab).toBe("scraping");
    expect(result.count).toBe(1);
    expect(activeScrapesPlan.calls).toEqual([
      ["select", "product_id, skus", undefined],
      ["in", "status", ["pending", "claimed", "running"]],
    ]);
    expect(productsPlan.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "pipeline_status", "scraped"],
      ["order", "updated_at", { ascending: false }],
      ["or", 'id.in.("prod-1"),sku.in.("SKU-1","SKU-2")'],
      ["range", 0, 99],
    ]);
  });

  it("queries scraped products by excluding active scrape identifiers", async () => {
    const activeScrapesPlan = createQueryPlan({
      data: [{ product_id: "prod-1", skus: ["SKU-1"] }],
      error: null,
    });
    const productsPlan = createQueryPlan({
      data: [createProduct("prod-2", "SKU-2", "scraped")],
      error: null,
      count: 1,
    });
    const supabase = createSupabaseClient({
      scrape_jobs: [activeScrapesPlan],
      products_ingestion: [productsPlan],
    });

    const result = await queryScrapedTabProducts(supabase, { limit: 50, offset: 5 });

    expect(result.tab).toBe("scraped");
    expect(result.count).toBe(1);
    expect(productsPlan.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "pipeline_status", "scraped"],
      ["order", "updated_at", { ascending: false }],
      ["not", "id", "in", '("prod-1")'],
      ["not", "sku", "in", '("SKU-1")'],
      ["range", 5, 54],
    ]);
  });

  it("queries consolidating products by including active consolidation identifiers", async () => {
    const activeConsolidationsPlan = createQueryPlan({
      data: [
        {
          product_ids: [
            "123e4567-e89b-12d3-a456-426614174000",
            "SKU-9",
          ],
        },
      ],
      error: null,
    });
    const productsPlan = createQueryPlan({
      data: [createProduct("123e4567-e89b-12d3-a456-426614174000", "SKU-9", "finalized")],
      error: null,
      count: 1,
    });
    const supabase = createSupabaseClient({
      consolidation_batches: [activeConsolidationsPlan],
      products_ingestion: [productsPlan],
    });

    const result = await queryConsolidatingTabProducts(supabase);

    expect(result.tab).toBe("consolidating");
    expect(result.count).toBe(1);
    expect(productsPlan.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "pipeline_status", "finalized"],
      ["order", "updated_at", { ascending: false }],
      ["or", 'id.in.("123e4567-e89b-12d3-a456-426614174000"),sku.in.("SKU-9")'],
      ["range", 0, 99],
    ]);
  });

  it("queries finalizing products by excluding active consolidation identifiers", async () => {
    const activeConsolidationsPlan = createQueryPlan({
      data: [
        {
          product_ids: [
            "123e4567-e89b-12d3-a456-426614174000",
            "SKU-9",
          ],
        },
      ],
      error: null,
    });
    const productsPlan = createQueryPlan({
      data: [createProduct("prod-10", "SKU-10", "finalized")],
      error: null,
      count: 1,
    });
    const supabase = createSupabaseClient({
      consolidation_batches: [activeConsolidationsPlan],
      products_ingestion: [productsPlan],
    });

    const result = await queryFinalizingTabProducts(supabase);

    expect(result.tab).toBe("finalizing");
    expect(result.count).toBe(1);
    expect(productsPlan.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "pipeline_status", "finalized"],
      ["order", "updated_at", { ascending: false }],
      ["not", "id", "in", '("123e4567-e89b-12d3-a456-426614174000")'],
      ["not", "sku", "in", '("SKU-9")'],
      ["range", 0, 99],
    ]);
  });

  it("returns an empty scraping result when active scrape lookup fails non-fatally", async () => {
    const activeScrapesPlan = createQueryPlan({
      data: null,
      error: { code: "42P01", message: "relation scrape_jobs does not exist" },
    });
    const supabase = createSupabaseClient({
      scrape_jobs: [activeScrapesPlan],
    });

    const result = await queryScrapingTabProducts(supabase);

    expect(result).toMatchObject({
      tab: "scraping",
      products: [],
      count: 0,
    });
    expect((supabase.from as jest.Mock).mock.calls).toEqual([["scrape_jobs"]]);
  });

  it("still queries finalizing products when active consolidation lookup fails non-fatally", async () => {
    const activeConsolidationsPlan = createQueryPlan({
      data: null,
      error: { code: "42703", message: "column product_ids does not exist" },
    });
    const productsPlan = createQueryPlan({
      data: [createProduct("prod-10", "SKU-10", "finalized")],
      error: null,
      count: 1,
    });
    const supabase = createSupabaseClient({
      consolidation_batches: [activeConsolidationsPlan],
      products_ingestion: [productsPlan],
    });

    const result = await queryProductsForWorkflowTab("finalizing", supabase);

    expect(result.tab).toBe("finalizing");
    expect(result.count).toBe(1);
    expect(productsPlan.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "pipeline_status", "finalized"],
      ["order", "updated_at", { ascending: false }],
      ["range", 0, 99],
    ]);
  });

  it("throws when the products query fails fatally", async () => {
    const productsPlan = createQueryPlan({
      data: null,
      error: { message: "permission denied for products_ingestion" },
      count: null,
    });
    const supabase = createSupabaseClient({
      products_ingestion: [productsPlan],
    });

    await expect(queryImportedTabProducts(supabase)).rejects.toThrow(
      "permission denied for products_ingestion"
    );
  });

  it("aggregates counts for all five workflow tabs", async () => {
    const supabase = createSupabaseClient({
      products_ingestion: [
        createQueryPlan({ data: [createProduct("p-1", "SKU-1", "imported")], error: null, count: 11 }),
        createQueryPlan({ data: [createProduct("p-2", "SKU-2", "scraped")], error: null, count: 2 }),
        createQueryPlan({ data: [createProduct("p-3", "SKU-3", "scraped")], error: null, count: 3 }),
        createQueryPlan({ data: [createProduct("p-4", "SKU-4", "finalized")], error: null, count: 4 }),
        createQueryPlan({ data: [createProduct("p-5", "SKU-5", "finalized")], error: null, count: 5 }),
      ],
      scrape_jobs: [
        createQueryPlan({ data: [{ product_id: "p-2", skus: [] }], error: null }),
      ],
      consolidation_batches: [
        createQueryPlan({ data: [{ product_ids: ["SKU-4"] }], error: null }),
      ],
    });

    await expect(queryWorkflowTabCounts(supabase)).resolves.toEqual({
      imported: 11,
      scraping: 2,
      scraped: 3,
      consolidating: 4,
      finalizing: 5,
    });

    const fromCalls = (supabase.from as jest.Mock).mock.calls.map(([table]) => table);
    expect(fromCalls.filter((table) => table === "scrape_jobs")).toHaveLength(1);
    expect(fromCalls.filter((table) => table === "consolidation_batches")).toHaveLength(1);
  });
});
