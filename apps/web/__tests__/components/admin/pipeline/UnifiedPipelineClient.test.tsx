/**
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import type { PipelineProduct, PipelineStage, StatusCount } from "@/lib/pipeline/types";
import type { WorkflowPipelineTab } from "@/lib/pipeline/derivation";
import type { PipelineTabQueryResult } from "@/lib/pipeline/queries";

const mockCreateClient = jest.fn();
const mockQueryProductsForWorkflowTab = jest.fn<
  Promise<PipelineTabQueryResult>,
  [WorkflowPipelineTab, unknown, { limit: number; offset: number }]
>();
const mockQueryWorkflowTabCounts = jest.fn<
  Promise<Record<WorkflowPipelineTab, number>>,
  [unknown]
>();

let lastSinglePipelineTabsProps: {
  activeTab: string;
  counts: Record<string, number>;
  onTabChange: (tab: string) => void;
} | null = null;

jest.mock("@/lib/supabase/client", () => ({
  createClient: () => mockCreateClient(),
}));

jest.mock("@/lib/pipeline/queries", () => ({
  queryProductsForWorkflowTab: (
    ...args: [WorkflowPipelineTab, unknown, { limit: number; offset: number }]
  ) => mockQueryProductsForWorkflowTab(...args),
  queryWorkflowTabCounts: (...args: [unknown]) => mockQueryWorkflowTabCounts(...args),
}));

jest.mock("@/components/admin/pipeline/SinglePipelineTabs", () => ({
  __esModule: true,
  default: (props: {
    activeTab: string;
    counts: Record<string, number>;
    onTabChange: (tab: string) => void;
  }) => {
    lastSinglePipelineTabsProps = props;

    return (
      <div data-testid="single-pipeline-tabs">
        <p>Single pipeline: {props.activeTab}</p>
        <button onClick={() => props.onTabChange("finalizing")} type="button">
          Switch to finalizing
        </button>
      </div>
    );
  },
}));

jest.mock("@/components/admin/pipeline/WorkflowTabs", () => ({
  WorkflowTabs: () => <div data-testid="workflow-tabs" />,
}));

jest.mock("@/components/admin/pipeline/PipelineHeader", () => ({
  PipelineHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div data-testid="pipeline-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

jest.mock("@/components/admin/pipeline/PipelineFlowVisualization", () => ({
  PipelineFlowVisualization: () => <div data-testid="pipeline-flow-visualization" />,
}));

function createProduct(overrides: Partial<PipelineProduct>): PipelineProduct {
  return {
    id: overrides.id ?? overrides.sku ?? "product-1",
    sku: overrides.sku ?? "SKU-1",
    input: overrides.input ?? { name: "Test Product", price: 12.99 },
    sources: overrides.sources ?? {},
    consolidated: overrides.consolidated ?? { name: "Test Product", price: 12.99 },
    pipeline_status: overrides.pipeline_status ?? "imported",
    image_candidates: overrides.image_candidates,
    selected_images: overrides.selected_images,
    confidence_score: overrides.confidence_score,
    error_message: overrides.error_message,
    retry_count: overrides.retry_count,
    created_at: overrides.created_at ?? "2026-04-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-04-01T00:00:00.000Z",
  };
}

const initialCounts: StatusCount[] = [
  { status: "imported", count: 1 },
  { status: "scraped", count: 1 },
  { status: "finalized", count: 1 },
  { status: "failed", count: 0 },
];

interface UnifiedPipelineClientProps {
  initialProducts: PipelineProduct[];
  initialCounts: StatusCount[];
  initialTotal: number;
  initialStage: PipelineStage;
}

process.env.NEXT_PUBLIC_ENABLE_SINGLE_PIPELINE_UI = "true";
process.env.ENABLE_SINGLE_PIPELINE_UI = "true";

const { UnifiedPipelineClient } = require("@/components/admin/pipeline/UnifiedPipelineClient") as {
  UnifiedPipelineClient: ComponentType<UnifiedPipelineClientProps>;
};

describe("UnifiedPipelineClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastSinglePipelineTabsProps = null;
    mockCreateClient.mockReturnValue({ from: jest.fn() });
  });

  it("normalizes the active stage and hydrates the five workflow tab counts", async () => {
    const importedProducts = [
      createProduct({ id: "1", sku: "SKU-1", pipeline_status: "imported" }),
    ];

    mockQueryProductsForWorkflowTab.mockResolvedValue({
      tab: "imported",
      products: importedProducts,
      count: 9,
      durationMs: 5,
    });
    mockQueryWorkflowTabCounts.mockResolvedValue({
      imported: 1,
      scraping: 2,
      scraped: 3,
      consolidating: 4,
      finalizing: 5,
    });

    render(
      <UnifiedPipelineClient
        initialProducts={[]}
        initialCounts={initialCounts}
        initialTotal={0}
        initialStage="published"
      />
    );

    expect(screen.getByTestId("single-pipeline-tabs")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-tabs")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockQueryProductsForWorkflowTab).toHaveBeenCalledWith(
        "imported",
        mockCreateClient.mock.results[0]?.value,
        { limit: 200, offset: 0 }
      );
      expect(lastSinglePipelineTabsProps?.counts).toEqual({
        imported: 1,
        scraping: 2,
        scraped: 3,
        consolidating: 4,
        finalizing: 5,
      });
    });

    expect(lastSinglePipelineTabsProps?.activeTab).toBe("imported");
    expect(screen.getByText("Showing 1 loaded products in imported stage")).toBeInTheDocument();
    expect(screen.getByText("9 products in workflow")).toBeInTheDocument();
  });

  it("re-queries workflow data when the single-pipeline tab changes", async () => {
    const user = userEvent.setup();

    mockQueryProductsForWorkflowTab
      .mockResolvedValueOnce({
        tab: "imported",
        products: [createProduct({ id: "1", sku: "SKU-1", pipeline_status: "imported" })],
        count: 4,
        durationMs: 5,
      })
      .mockResolvedValueOnce({
        tab: "finalizing",
        products: [
          createProduct({ id: "2", sku: "SKU-2", pipeline_status: "finalized" }),
          createProduct({ id: "3", sku: "SKU-3", pipeline_status: "finalized" }),
        ],
        count: 2,
        durationMs: 5,
      });
    mockQueryWorkflowTabCounts.mockResolvedValue({
      imported: 1,
      scraping: 0,
      scraped: 1,
      consolidating: 0,
      finalizing: 2,
    });

    render(
      <UnifiedPipelineClient
        initialProducts={[]}
        initialCounts={initialCounts}
        initialTotal={0}
        initialStage="imported"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Showing 1 loaded products in imported stage")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /switch to finalizing/i }));

    await waitFor(() => {
      expect(mockQueryProductsForWorkflowTab).toHaveBeenNthCalledWith(
        2,
        "finalizing",
        mockCreateClient.mock.results[1]?.value,
        { limit: 200, offset: 0 }
      );
    });

    expect(screen.getByText("Finalizing Stage")).toBeInTheDocument();
    expect(screen.getByText("Showing 2 loaded products in finalizing stage")).toBeInTheDocument();
    expect(screen.getByText("2 products in workflow")).toBeInTheDocument();
  });

  it("falls back to initial data and empty single-pipeline counts when a query fails", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const initialProducts = [
      createProduct({ id: "2", sku: "SKU-2", pipeline_status: "scraped" }),
      createProduct({ id: "3", sku: "SKU-3", pipeline_status: "scraped" }),
    ];

    mockQueryProductsForWorkflowTab.mockRejectedValue(new Error("query failed"));
    mockQueryWorkflowTabCounts.mockResolvedValue({
      imported: 9,
      scraping: 9,
      scraped: 9,
      consolidating: 9,
      finalizing: 9,
    });

    render(
      <UnifiedPipelineClient
        initialProducts={initialProducts}
        initialCounts={initialCounts}
        initialTotal={initialProducts.length}
        initialStage="scraped"
      />
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error querying single pipeline tabs:",
        expect.any(Error)
      );
    });

    expect(lastSinglePipelineTabsProps?.counts).toEqual({
      imported: 0,
      scraping: 0,
      scraped: 0,
      consolidating: 0,
      finalizing: 0,
    });
    expect(screen.getByText("Showing 2 loaded products in scraped stage")).toBeInTheDocument();
    expect(screen.getByText("2 products in workflow")).toBeInTheDocument();
    expect(screen.queryByText(/Resolving active scrape and consolidation jobs/i)).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
