jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { addToOnboarding } from "@/lib/admin/integra-sync";

describe("addToOnboarding", () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null }),
      }),
    };

    (createClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  afterEach(() => jest.resetAllMocks());

  it("deduplicates duplicate SKUs before upsert and returns unique count", async () => {
    const products = [
      { sku: "SKU1", name: "First", price: 10 },
      { sku: "SKU1", name: "First Duplicated", price: 12 },
      { sku: "SKU2", name: "Second", price: 5 },
    ];

    const res = await addToOnboarding(products as any);

    expect(createClient).toHaveBeenCalled();
    expect(mockSupabase.from).toHaveBeenCalledWith("products_ingestion");

    const upsertArg = mockSupabase.from().upsert.mock.calls[0][0];
    expect(Array.isArray(upsertArg)).toBe(true);
    expect(upsertArg).toHaveLength(2);

    expect(upsertArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sku: "SKU1",
          input: expect.objectContaining({ name: "First", price: 10 }),
        }),
        expect.objectContaining({
          sku: "SKU2",
          input: expect.objectContaining({ name: "Second", price: 5 }),
        }),
      ]),
    );

    expect(res).toEqual({ success: true, count: 2 });
  });
});
