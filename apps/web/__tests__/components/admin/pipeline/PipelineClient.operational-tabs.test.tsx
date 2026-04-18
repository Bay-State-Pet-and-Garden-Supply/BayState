/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import { PipelineClient } from "@/components/admin/pipeline/PipelineClient";
import type { PipelineProduct, StatusCount } from "@/lib/pipeline/types";

const mockSearchParamGet = jest.fn();
const mockSearchParamsToString = jest.fn(() => "");
const mockReplace = jest.fn();
const mockFetch = jest.fn();
let lastFinalizingResultsProps: Record<string, unknown> | null = null;
const mockRouter = { replace: mockReplace };
const mockSearchParams = {
  get: mockSearchParamGet,
  toString: mockSearchParamsToString,
};

global.fetch = mockFetch as typeof fetch;

jest.mock("next/dynamic", () => () => {
  const DynamicMock = () => null;
  DynamicMock.displayName = "DynamicMock";
  return DynamicMock;
});

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/admin/pipeline",
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/components/admin/pipeline/StageTabs", () => ({
  StageTabs: () => <div data-testid="stage-tabs" />,
}));
jest.mock("@/components/admin/pipeline/ProductTable", () => ({
  ProductTable: () => <div data-testid="product-table" />,
}));
jest.mock("@/components/admin/pipeline/ScrapedResultsView", () => ({
  ScrapedResultsView: () => <div data-testid="scraped-results" />,
}));
jest.mock("@/components/admin/pipeline/FloatingActionsBar", () => ({
  FloatingActionsBar: () => <div data-testid="floating-actions" />,
}));
jest.mock("@/components/admin/pipeline/ActiveRunsTab", () => ({
  ActiveRunsTab: () => <div data-testid="active-runs" />,
}));
jest.mock("@/components/admin/pipeline/ActiveConsolidationsTab", () => ({
  ActiveConsolidationsTab: () => <div data-testid="active-consolidations" />,
}));
jest.mock("@/components/admin/pipeline/FinalizingResultsView", () => ({
  FinalizingResultsView: (props: Record<string, unknown>) => {
    lastFinalizingResultsProps = props;
    return <div data-testid="finalizing-results" />;
  },
}));

const products: PipelineProduct[] = [
  {
    sku: "SKU001",
    input: { name: "Product 1", price: 10 },
    sources: {},
    consolidated: { name: "Product 1", price: 10 },
    pipeline_status: "finalizing",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
];

const counts: StatusCount[] = [
  { status: "imported", count: 1 },
  { status: "scraping", count: 0 },
  { status: "scraped", count: 0 },
  { status: "consolidating", count: 0 },
  { status: "finalizing", count: 1 },
  { status: "exporting", count: 2 },
  { status: "failed", count: 0 },
];

describe("PipelineClient live tab handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastFinalizingResultsProps = null;
    mockSearchParamsToString.mockReturnValue("");
    mockSearchParamGet.mockImplementation(() => null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ counts, products: [], count: 0, availableSources: [] }),
    });
  });

  it("renders the scraping tab without product-table chrome", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "scraping";
      return null;
    });

    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={products}
        initialTotal={1}
        initialStage="imported"
      />,
    );

    expect(screen.getByTestId("active-runs")).toBeInTheDocument();
    expect(screen.queryByTestId("floating-actions")).not.toBeInTheDocument();
  });

  it("renders finalizing from server-hydrated finalized products", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "finalizing";
      return null;
    });

    render(
        <PipelineClient
          initialCounts={counts}
          initialProducts={products}
          initialTotal={1}
          initialStage="finalizing"
        />,
      );

    const finalizingResults = await screen.findAllByTestId("finalizing-results");
    expect(finalizingResults.length).toBeGreaterThan(0);
    expect(lastFinalizingResultsProps).toMatchObject({ products });
    expect(screen.getByTestId("floating-actions")).toBeInTheDocument();
    expect(screen.queryByTestId("product-table")).not.toBeInTheDocument();
  });

  it("renders the exporting stage as the multiselect workspace", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "exporting";
      return null;
    });

    const exportingProducts: PipelineProduct[] = [
      {
        ...products[0],
        pipeline_status: "exporting",
      },
      {
        ...products[0],
        sku: "SKU002",
        input: { name: "Product 2", price: 15 },
        consolidated: { name: "Product 2", price: 15 },
        pipeline_status: "exporting",
      },
    ];

    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={exportingProducts}
        initialTotal={exportingProducts.length}
        initialStage="exporting"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("product-table").length).toBeGreaterThan(0);
    });
    expect(lastFinalizingResultsProps).toBeNull();
  });

  it("treats legacy consolidated stage params as out-of-bounds and falls back to the canonical stage", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "consolidated";
      return null;
    });

    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={products}
        initialTotal={1}
        initialStage="imported"
      />,
    );

    expect(screen.getAllByTestId("product-table").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("finalizing-results")).not.toBeInTheDocument();
  });
});
