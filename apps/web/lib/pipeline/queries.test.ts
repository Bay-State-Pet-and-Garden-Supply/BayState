/**
 * @jest-environment node
 */

import {
  queryImportedTabProducts,
  queryProductsForWorkflowTab,
  queryWorkflowTabCounts,
  type PipelineQuerySupabaseClient,
} from "./queries";
import { PERSISTED_PIPELINE_STATUSES, type PersistedPipelineStatus } from "./types";

type QueryCall =
  | ["select", string, { count?: "exact" | "planned" | "estimated" } | undefined]
  | ["eq", string, string]
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
    }) as unknown as PipelineQuerySupabaseClient["from"],
  };
}

function createProduct(
  id: string,
  sku: string,
  status: PersistedPipelineStatus
): {
  id: string;
  sku: string;
  pipeline_status: PersistedPipelineStatus;
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

  it("queries products for a specific workflow tab", async () => {
    const productsPlan = createQueryPlan({
      data: [createProduct("p-2", "SKU-2", "finalizing")],
      error: null,
      count: 1,
    });
    const supabase = createSupabaseClient({
      products_ingestion: [productsPlan],
    });

    const result = await queryProductsForWorkflowTab("finalizing", supabase);

    expect(result.tab).toBe("finalizing");
    expect(result.count).toBe(1);
    expect(productsPlan.calls).toEqual([
      ["select", "*", { count: "exact" }],
      ["eq", "pipeline_status", "finalizing"],
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

  it("aggregates counts for all workflow tabs", async () => {
    const plans: QueryPlan[] = PERSISTED_PIPELINE_STATUSES.map(status => 
      createQueryPlan({ data: [], error: null, count: status.length })
    );

    const supabase = createSupabaseClient({
      products_ingestion: plans,
    });

    const counts = await queryWorkflowTabCounts(supabase);
    
    expect(counts).toEqual({
      imported: "imported".length,
      scraping: "scraping".length,
      scraped: "scraped".length,
      consolidating: "consolidating".length,
      finalizing: "finalizing".length,
      exporting: "exporting".length,
      failed: "failed".length,
    });
  });
});
