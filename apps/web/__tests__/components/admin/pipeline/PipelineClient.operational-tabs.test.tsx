/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { PipelineClient } from "@/components/admin/pipeline/PipelineClient";
import type { PipelineProduct, StatusCount } from "@/lib/pipeline/types";

const mockSearchParamGet = jest.fn();
const mockSearchParamsToString = jest.fn(() => "");
const mockReplace = jest.fn();
const mockFetch = jest.fn();
let lastFinalizingResultsProps: Record<string, unknown> | null = null;

global.fetch = mockFetch as typeof fetch;

jest.mock("next/dynamic", () => () => {
  const DynamicMock = () => null;
  DynamicMock.displayName = "DynamicMock";
  return DynamicMock;
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/admin/pipeline",
  useSearchParams: () => ({
    get: mockSearchParamGet,
    toString: mockSearchParamsToString,
  }),
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
jest.mock("@/components/admin/pipeline/PipelineToolbar", () => ({
  PipelineToolbar: () => <div data-testid="pipeline-toolbar" />,
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
jest.mock("@/components/admin/pipeline/ImageSelectionTab", () => ({
  ImageSelectionTab: () => <div data-testid="image-selection-tab" />,
}));
jest.mock("@/components/admin/pipeline/ExportTab", () => ({
  ExportTab: () => <div data-testid="export-tab" />,
}));

const products: PipelineProduct[] = [
  {
    sku: "SKU001",
    input: { name: "Product 1", price: 10 },
    sources: {},
    consolidated: { name: "Product 1", price: 10 },
    pipeline_status: "imported",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  },
];

const counts: StatusCount[] = [
  { status: "imported", count: 1 },
  { status: "scraped", count: 0 },
  { status: "finalized", count: 0 },
  { status: "failed", count: 0 },
];

describe("PipelineClient operational tab handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastFinalizingResultsProps = null;
    mockSearchParamsToString.mockReturnValue("");
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return null;
      return null;
    });
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "<?xml version=\"1.0\"?><Products></Products>",
      json: async () => ({ counts }),
    });
  });

  it("renders the images workspace without product toolbar chrome", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "images";
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

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/pipeline/export-xml",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    expect(screen.getByTestId("image-selection-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("pipeline-toolbar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("floating-actions")).not.toBeInTheDocument();
  });

  it("allows the published derived tab without treating it like a workflow status tab", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "published";
      return null;
    });

    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={[]}
        initialTotal={0}
        initialStage="imported"
      />,
    );

    expect(await screen.findByTestId("finalizing-results")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("floating-actions")).toBeInTheDocument();
    expect(screen.queryByTestId("product-table")).not.toBeInTheDocument();
  });

  it("loads the published list from published SKUs instead of persisted ingestion status", async () => {
    mockSearchParamGet.mockImplementation((key: string) => {
      if (key === "stage") return "published";
      return null;
    });

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/admin/pipeline/export-xml")) {
        return Promise.resolve({
          ok: true,
          text: async () => `<?xml version="1.0"?><Products><Product><SKU>SKU001</SKU></Product><Product><SKU>SKU002</SKU></Product></Products>`,
          json: async () => ({}),
        });
      }

      if (url.includes("/api/admin/pipeline/SKU001")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            product: products[0],
          }),
        });
      }

      if (url.includes("/api/admin/pipeline/SKU002")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            product: {
              ...products[0],
              sku: "SKU002",
              input: { name: "Product 2", price: 15 },
              consolidated: { name: "Product 2", price: 15 },
            },
          }),
        });
      }

      if (url.includes("/api/admin/pipeline/counts")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ counts }),
        });
      }

      return Promise.resolve({
        ok: true,
        text: async () => "<?xml version=\"1.0\"?><Products></Products>",
        json: async () => ({ counts }),
      });
    });

    render(
      <PipelineClient
        initialCounts={counts}
        initialProducts={[]}
        initialTotal={0}
        initialStage="imported"
      />,
    );

    await waitFor(() => {
      expect(lastFinalizingResultsProps).toMatchObject({
        products: [
          expect.objectContaining({ sku: "SKU001" }),
          expect.objectContaining({ sku: "SKU002" }),
        ],
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/pipeline/export-xml",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/pipeline/SKU001",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/pipeline/SKU002",
      expect.objectContaining({ cache: "no-store" }),
    );
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

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/pipeline/export-xml",
        expect.objectContaining({ cache: "no-store" }),
      );
    });

    expect(screen.getByTestId("product-table")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-toolbar")).toBeInTheDocument();
    expect(screen.queryByTestId("finalizing-results")).not.toBeInTheDocument();
  });
});
