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

jest.mock("@/components/admin/pipeline/ProductTable", () => ({
  ProductTable: ({
    products,
    selectedUpcs,
    onSelectUpc,
  }: {
    products: Array<{ upc: string }>;
    selectedUpcs: Set<string>;
    onSelectUpc: (
      upc: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: Array<{ upc: string }>,
    ) => void;
  }) => (
    <div data-testid="product-table">
      {products.map((product, index) => {
        const isSelected = selectedUpcs.has(product.upc);

        return (
          <button
            key={product.upc}
            type="button"
            data-state={isSelected ? "selected" : "unselected"}
            onClick={(event) =>
              onSelectUpc(product.upc, !isSelected, index, event.shiftKey, products)
            }
          >
            {product.upc}
          </button>
        );
      })}
    </div>
  ),
}));

jest.mock("@/components/admin/pipeline/PipelineSidebarTable", () => ({
  PipelineSidebarTable: ({
    products,
    selectedUpcs,
    onSelectUpc,
  }: {
    products: Array<{ upc: string }>;
    selectedUpcs: Set<string>;
    onSelectUpc: (
      upc: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: Array<{ upc: string }>,
    ) => void;
  }) => (
    <div data-testid="sidebar-table">
      {products.map((product, index) => {
        const isSelected = selectedUpcs.has(product.upc);

        return (
          <button
            key={product.upc}
            type="button"
            data-state={isSelected ? "selected" : "unselected"}
            onClick={(event) =>
              onSelectUpc(product.upc, !isSelected, index, event.shiftKey, products)
            }
          >
            {product.upc}
          </button>
        );
      })}
    </div>
  ),
}));

jest.mock("@/components/admin/pipeline/ImportedResultsView", () => ({
  ImportedResultsView: ({
    products,
    selectedUpcs,
    onSelectUpc,
  }: {
    products: Array<{ upc: string }>;
    selectedUpcs: Set<string>;
    onSelectUpc: (
      upc: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: Array<{ upc: string }>,
    ) => void;
  }) => (
    <div data-testid="imported-results-view">
      {products.map((product, index) => {
        const isSelected = selectedUpcs.has(product.upc);

        return (
          <button
            key={product.upc}
            type="button"
            data-state={isSelected ? "selected" : "unselected"}
            onClick={() => onSelectUpc(product.upc, !isSelected, index, false, products)}
          >
            {product.upc}
          </button>
        );
      })}
    </div>
  ),
}));

const products: PipelineProduct[] = [
  {
    upc: "UPC001",
    input: { name: "Product 1", price: 10.0 },
    sources: {},
    consolidated: { name: "Product 1", price: 10.0 },
    pipeline_status: "imported",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    upc: "UPC002",
    input: { name: "Product 2", price: 20.0 },
    sources: {},
    consolidated: { name: "Product 2", price: 20.0 },
    pipeline_status: "imported",
    created_at: "2026-01-02",
    updated_at: "2026-01-02",
  },
  {
    upc: "UPC003",
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
  { status: "awaiting_brand", count: 0 },
  { status: "extracting", count: 0 },
  { status: "processed", count: 0 },
  { status: "merging", count: 0 },
  { status: "reviewing", count: 0 },
  { status: "publishing", count: 0 },
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

const importedCounts: StatusCount[] = [
  { status: "imported", count: 3 },
  { status: "awaiting_brand", count: 0 },
  { status: "extracting", count: 0 },
  { status: "processed", count: 0 },
  { status: "merging", count: 0 },
  { status: "reviewing", count: 0 },
  { status: "publishing", count: 0 },
  { status: "failed", count: 0 },
];

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
        initialStage="failed"
      />,
    );

    const row1 = await screen.findByRole("button", { name: "UPC001" });
    const row2 = screen.getByRole("button", { name: "UPC002" });
    const row3 = screen.getByRole("button", { name: "UPC003" });

    fireEvent.click(row1);
    fireEvent.click(row3, { shiftKey: true });

    await waitFor(() => {
      expect(row1).toHaveAttribute("data-state", "selected");
      expect(row2).toHaveAttribute("data-state", "selected");
      expect(row3).toHaveAttribute("data-state", "selected");
    });
  });


});
