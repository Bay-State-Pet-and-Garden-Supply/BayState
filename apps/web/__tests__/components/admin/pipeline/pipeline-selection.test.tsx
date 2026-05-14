/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PipelineClient } from "@/components/admin/pipeline/PipelineClient";
import type { PipelineProduct, StatusCount } from "@/lib/pipeline/types";

let lastScraperDialogProps: Record<string, unknown> | null = null;

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
    selectedSkus,
    onSelectSku,
  }: {
    products: Array<{ sku: string }>;
    selectedSkus: Set<string>;
    onSelectSku: (
      sku: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: Array<{ sku: string }>,
    ) => void;
  }) => (
    <div data-testid="product-table">
      {products.map((product, index) => {
        const isSelected = selectedSkus.has(product.sku);

        return (
          <button
            key={product.sku}
            type="button"
            data-state={isSelected ? "selected" : "unselected"}
            onClick={(event) =>
              onSelectSku(product.sku, !isSelected, index, event.shiftKey, products)
            }
          >
            {product.sku}
          </button>
        );
      })}
    </div>
  ),
}));

jest.mock("@/components/admin/pipeline/ScraperSelectDialog", () => ({
  ScraperSelectDialog: (props: Record<string, unknown>) => {
    lastScraperDialogProps = props;
    return <div data-testid="scraper-dialog-props" />;
  },
}));

jest.mock("@/components/admin/pipeline/PipelineSidebarTable", () => ({
  PipelineSidebarTable: ({
    products,
    selectedSkus,
    onSelectSku,
  }: {
    products: Array<{ sku: string }>;
    selectedSkus: Set<string>;
    onSelectSku: (
      sku: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: Array<{ sku: string }>,
    ) => void;
  }) => (
    <div data-testid="sidebar-table">
      {products.map((product, index) => {
        const isSelected = selectedSkus.has(product.sku);

        return (
          <button
            key={product.sku}
            type="button"
            data-state={isSelected ? "selected" : "unselected"}
            onClick={(event) =>
              onSelectSku(product.sku, !isSelected, index, event.shiftKey, products)
            }
          >
            {product.sku}
          </button>
        );
      })}
    </div>
  ),
}));

jest.mock("@/components/admin/pipeline/ImportedResultsView", () => ({
  ImportedResultsView: ({
    products,
    selectedSkus,
    onSelectSku,
  }: {
    products: Array<{ sku: string }>;
    selectedSkus: Set<string>;
    onSelectSku: (
      sku: string,
      selected: boolean,
      index?: number,
      isShiftClick?: boolean,
      visibleProducts?: Array<{ sku: string }>,
    ) => void;
  }) => (
    <div data-testid="imported-results-view">
      {products.map((product, index) => {
        const isSelected = selectedSkus.has(product.sku);

        return (
          <button
            key={product.sku}
            type="button"
            data-state={isSelected ? "selected" : "unselected"}
            onClick={() => onSelectSku(product.sku, !isSelected, index, false, products)}
          >
            {product.sku}
          </button>
        );
      })}
    </div>
  ),
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
  { status: "url_review", count: 0 },
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
  lastScraperDialogProps = null;
  mockSearchParamGet.mockReturnValue(null);
  mockSearchParamsToString.mockReturnValue("");
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ products, count: 3, counts }),
  });
});

const importedCounts: StatusCount[] = [
  { status: "imported", count: 3 },
  { status: "url_review", count: 0 },
  { status: "extracting", count: 0 },
  { status: "processed", count: 0 },
  { status: "merging", count: 0 },
  { status: "reviewing", count: 0 },
  { status: "publishing", count: 0 },
  { status: "failed", count: 0 },
];

const importedCohortProducts: PipelineProduct[] = [
  {
    sku: "SKU101",
    input: { name: "Product A", price: 10 },
    sources: {},
    consolidated: null,
    pipeline_status: "imported",
    cohort_id: "cohort-1",
    cohort_brand_id: "brand-1",
    cohort_brand_name: "Miracle-Gro",
    cohort_brands: {
      id: "brand-1",
      name: "Miracle-Gro",
      slug: "miracle-gro",
      logo_url: null,
      official_domains: ["scottsmiraclegro.com"],
      preferred_domains: ["homedepot.com"],
    },
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
  {
    sku: "SKU102",
    input: { name: "Product B", price: 12 },
    sources: {},
    consolidated: null,
    pipeline_status: "imported",
    cohort_id: "cohort-2",
    cohort_brand_id: "brand-2",
    cohort_brand_name: "Bentley Seed",
    cohort_brands: {
      id: "brand-2",
      name: "Bentley Seed",
      slug: "bentley-seed",
      logo_url: null,
      official_domains: [],
      preferred_domains: [],
    },
    created_at: "2026-01-02",
    updated_at: "2026-01-02",
  },
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

    const row1 = await screen.findByRole("button", { name: "SKU001" });
    const row2 = screen.getByRole("button", { name: "SKU002" });
    const row3 = screen.getByRole("button", { name: "SKU003" });

    fireEvent.click(row1);
    fireEvent.click(row3, { shiftKey: true });

    await waitFor(() => {
      expect(row1).toHaveAttribute("data-state", "selected");
      expect(row2).toHaveAttribute("data-state", "selected");
      expect(row3).toHaveAttribute("data-state", "selected");
    });
  });

  it("opens enrichment dialog with selected SKU count", async () => {
    const processedCounts: StatusCount[] = [
      { status: "imported", count: 0 },
      { status: "url_review", count: 0 },
      { status: "extracting", count: 0 },
      { status: "processed", count: 2 },
      { status: "merging", count: 0 },
      { status: "reviewing", count: 0 },
      { status: "publishing", count: 0 },
      { status: "failed", count: 0 },
    ];

    const processedProducts = importedCohortProducts.map(p => ({
      ...p,
      pipeline_status: "processed" as const,
    }));

    render(
      <PipelineClient
        initialCounts={processedCounts}
        initialProducts={processedProducts}
        initialTotal={2}
        initialStage="processed"
      />,
    );

    const row1 = await screen.findByRole("button", { name: "SKU101" });
    const row2 = screen.getByRole("button", { name: "SKU102" });
    fireEvent.click(row1);
    fireEvent.click(row2);

    await waitFor(() => {
      expect(lastScraperDialogProps).not.toBeNull();
    });
  });

  it("does not include legacy enrichment method props in scraper dialog", async () => {
    const processedCounts: StatusCount[] = [
      { status: "imported", count: 0 },
      { status: "url_review", count: 0 },
      { status: "extracting", count: 0 },
      { status: "processed", count: 2 },
      { status: "merging", count: 0 },
      { status: "reviewing", count: 0 },
      { status: "publishing", count: 0 },
      { status: "failed", count: 0 },
    ];

    const processedProducts = importedCohortProducts.map(p => ({
      ...p,
      pipeline_status: "processed" as const,
    }));

    render(
      <PipelineClient
        initialCounts={processedCounts}
        initialProducts={processedProducts}
        initialTotal={2}
        initialStage="processed"
      />,
    );

    const row1 = await screen.findByRole("button", { name: "SKU101" });
    const row2 = screen.getByRole("button", { name: "SKU102" });
    fireEvent.click(row1);
    fireEvent.click(row2);

    const reEnrichButton = await screen.findByRole("button", { name: /Re-enrich/i });
    fireEvent.click(reEnrichButton);

    await waitFor(() => {
      expect(lastScraperDialogProps).not.toHaveProperty("brandName");
      expect(lastScraperDialogProps).not.toHaveProperty("officialBrandEligibility");
    });
  });
});
