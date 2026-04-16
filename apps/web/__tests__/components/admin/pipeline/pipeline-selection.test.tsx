/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PipelineClient } from "@/components/admin/pipeline/PipelineClient";
import type { PipelineProduct, StatusCount } from "@/lib/pipeline/types";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSearchParamGet = jest.fn();
const mockSearchParamsToString = jest.fn(() => "");
const mockSearchParams = {
  get: mockSearchParamGet,
  toString: mockSearchParamsToString,
};

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => "/admin/pipeline",
  useSearchParams: () => mockSearchParams,
}));

const products: PipelineProduct[] = [
  {
    sku: "SKU001",
    input: { name: "Product 1", price: 10.0 },
    sources: {},
    consolidated: { name: "Product 1", price: 10.0 },
    pipeline_status: "imported",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    sku: "SKU002",
    input: { name: "Product 2", price: 20.0 },
    sources: {},
    consolidated: { name: "Product 2", price: 20.0 },
    pipeline_status: "imported",
    created_at: "2026-01-02",
    updated_at: "2026-01-02",
  },
  {
    sku: "SKU003",
    input: { name: "Product 3", price: 30.0 },
    sources: {},
    consolidated: { name: "Product 3", price: 30.0 },
    pipeline_status: "imported",
    created_at: "2026-01-03",
    updated_at: "2026-01-03",
  },
];

const counts: StatusCount[] = [
  { status: "imported", count: 3 },
  { status: "scraping", count: 0 },
  { status: "scraped", count: 0 },
  { status: "consolidating", count: 0 },
  { status: "finalizing", count: 0 },
  { status: "exporting", count: 0 },
  { status: "failed", count: 0 },
];

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ products, count: 3, counts }),
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParamGet.mockReturnValue(null);
  mockSearchParamsToString.mockReturnValue("");
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ products, count: 3, counts }),
  });
});

afterAll(() => {
  // @ts-expect-error global fetch assignment
  global.fetch = undefined;
});

describe("PipelineClient shift range selection", () => {
  it("selects a range with Shift+Click in table mode", async () => {
    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={products}
        initialTotal={3}
      />,
    );

    const row1 = await screen.findByText("SKU001");
    const row2 = screen.getByText("SKU002").closest("tr");
    const row3 = screen.getByText("SKU003").closest("tr");
    const row1Element = row1.closest("tr");

    expect(row1Element).toBeTruthy();
    expect(row2).toBeTruthy();
    expect(row3).toBeTruthy();

    fireEvent.click(row1Element!);
    fireEvent.click(row3!, { shiftKey: true });

    await waitFor(() => {
      expect(row1Element).toHaveAttribute("data-state", "selected");
      expect(row2).toHaveAttribute("data-state", "selected");
      expect(row3).toHaveAttribute("data-state", "selected");
    });
  });
});
