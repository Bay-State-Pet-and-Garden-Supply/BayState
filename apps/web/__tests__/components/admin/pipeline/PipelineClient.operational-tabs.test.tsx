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
jest.mock("@/components/admin/pipeline/ProcessedResultsView", () => ({
  ProcessedResultsView: () => <div data-testid="processed-results" />,
}));
jest.mock("@/components/admin/pipeline/FloatingActionsBar", () => ({
  FloatingActionsBar: () => <div data-testid="floating-actions" />,
}));
jest.mock("@/components/admin/pipeline/ActiveEnrichmentsTab", () => ({
  ActiveEnrichmentsTab: () => <div data-testid="active-enrichments" />,
}));
jest.mock("@/components/admin/pipeline/ActiveConsolidationsTab", () => ({
  ActiveConsolidationsTab: () => <div data-testid="active-consolidations" />,
}));
jest.mock("@/components/admin/pipeline/ReviewingResultsView", () => ({
  ReviewingResultsView: (props: Record<string, unknown>) => {
    lastFinalizingResultsProps = props;
    return <div data-testid="reviewing-results" />;
  },
}));
jest.mock("@/components/admin/pipeline/PublishingResultsView", () => ({
  PublishingResultsView: () => <div data-testid="publishing-results" />,
}));

const products: PipelineProduct[] = [
  {
    upc: "UPC001",
    input: { name: "Product 1", price: 10 },
    sources: {},
    consolidated: { name: "Product 1", price: 10 },
    pipeline_status: "reviewing",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
];

const counts: StatusCount[] = [
  { status: "imported", count: 1 },
  { status: "extracting", count: 0 },
  { status: "processed", count: 0 },
  { status: "merging", count: 0 },
  { status: "reviewing", count: 1 },
  { status: "publishing", count: 2 },
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

  it("renders the extracting tab without product-table chrome", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "extracting";
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

    const activeRunElements = screen.getAllByTestId("active-enrichments");
    expect(activeRunElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId("floating-actions")).not.toBeInTheDocument();
  });

  it("renders reviewing from server-hydrated reviewed products", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "reviewing";
      return null;
    });

    render(
        <PipelineClient
          initialCounts={counts}
          initialProducts={products}
          initialTotal={1}
          initialStage="reviewing"
        />,
      );

    const reviewingResults = await screen.findAllByTestId("reviewing-results");
    expect(reviewingResults.length).toBeGreaterThan(0);
    expect(lastFinalizingResultsProps).toMatchObject({ products });
    expect(screen.getByTestId("floating-actions")).toBeInTheDocument();
    expect(screen.queryByTestId("product-table")).not.toBeInTheDocument();
  });

  it("renders the publishing stage as the multiselect workspace", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "publishing";
      return null;
    });

    const publishingProducts: PipelineProduct[] = [
      {
        ...products[0],
        pipeline_status: "publishing",
      },
      {
        ...products[0],
        upc: "UPC002",
        input: { name: "Product 2", price: 15 },
        consolidated: { name: "Product 2", price: 15 },
        pipeline_status: "publishing",
      },
    ];

    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={publishingProducts}
        initialTotal={publishingProducts.length}
        initialStage="publishing"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("publishing-results").length).toBeGreaterThan(0);
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
    expect(screen.queryByTestId("reviewing-results")).not.toBeInTheDocument();
  });
});
