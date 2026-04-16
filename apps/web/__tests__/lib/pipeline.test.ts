/**
 * @jest-environment node
 */
import { getProductsByStatus } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

describe("getProductsByStatus source filter", () => {
  let mockSupabase: any;

  const makeSupabaseMock = () => {
    const queryBuilder = Promise.resolve({
      data: [],
      error: null,
      count: 0,
    }) as Promise<{
      data: [];
      error: null;
      count: number;
    }> &
      Record<string, jest.Mock>;

    queryBuilder.select = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.eq = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.in = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.or = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.gte = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.lte = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.has = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.filter = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.contains = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.order = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.is = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.limit = jest.fn().mockReturnValue(queryBuilder);
    queryBuilder.range = jest.fn().mockReturnValue(queryBuilder);

    return {
      from: jest.fn().mockReturnValue(queryBuilder),
      _queryBuilder: queryBuilder,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase = makeSupabaseMock();
    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  it("uses has for source key existence", async () => {
    await getProductsByStatus("imported", { source: "amazon" });

    expect(mockSupabase._queryBuilder.has).toHaveBeenCalledWith(
      "sources",
      "amazon",
    );
  });

  it("uses has for source when source is provided", async () => {
    await getProductsByStatus("scraped", { source: "ebay" });

    expect(mockSupabase._queryBuilder.has).toHaveBeenCalledTimes(1);
    expect(mockSupabase._queryBuilder.has).toHaveBeenCalledWith(
      "sources",
      "ebay",
    );
  });

  it("does not use source filter when source is not provided", async () => {
    await getProductsByStatus("imported", {});

    expect(mockSupabase._queryBuilder.has).not.toHaveBeenCalled();
  });

  it("handles source filter with various source names", async () => {
    const sources = ["amazon", "ebay", "walmart", "petco", "petsmart"];

    for (const source of sources) {
      const mock = makeSupabaseMock();
      (createClient as jest.Mock).mockResolvedValue(mock);
      await getProductsByStatus("imported", { source });
      expect(mock._queryBuilder.has).toHaveBeenCalledWith("sources", source);
    }
  });

  it("combines source filter with other filters", async () => {
    await getProductsByStatus("imported", {
      source: "amazon",
      minConfidence: 0.8,
      maxConfidence: 1.0,
      limit: 10,
    });

    expect(mockSupabase._queryBuilder.has).toHaveBeenCalledWith(
      "sources",
      "amazon",
    );
    expect(mockSupabase._queryBuilder.gte).toHaveBeenCalledWith(
      "confidence_score",
      0.8,
    );
    expect(mockSupabase._queryBuilder.lte).toHaveBeenCalledWith(
      "confidence_score",
      1.0,
    );
    expect(mockSupabase._queryBuilder.limit).toHaveBeenCalledWith(10);
  });

  it("works with date range filters combined with source", async () => {
    await getProductsByStatus("finalizing", {
      source: "scraper-v2",
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });

    expect(mockSupabase._queryBuilder.eq).toHaveBeenCalledWith(
      "pipeline_status",
      "finalizing",
    );
    expect(mockSupabase._queryBuilder.has).toHaveBeenCalledWith(
      "sources",
      "scraper-v2",
    );
    expect(mockSupabase._queryBuilder.gte).toHaveBeenCalledWith(
      "updated_at",
      "2024-01-01",
    );
    expect(mockSupabase._queryBuilder.lte).toHaveBeenCalledWith(
      "updated_at",
      "2024-12-31",
    );
  });
});
