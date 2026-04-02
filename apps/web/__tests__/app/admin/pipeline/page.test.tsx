/**
 * @jest-environment jsdom
 */

import { render } from "@testing-library/react";
import PipelinePage from "@/app/admin/pipeline/page";

let lastPipelineClientProps: Record<string, unknown> | null = null;
const mockGetProductsByStatus = jest.fn();
const mockGetStatusCounts = jest.fn();

jest.mock("@/components/admin/pipeline/PipelineClient", () => ({
  PipelineClient: (props: Record<string, unknown>) => {
    lastPipelineClientProps = props;
    return <div data-testid="pipeline-client" />;
  },
}));

jest.mock("@/lib/pipeline", () => ({
  getProductsByStatus: (...args: unknown[]) => mockGetProductsByStatus(...args),
  getStatusCounts: (...args: unknown[]) => mockGetStatusCounts(...args),
}));

describe("admin pipeline page stage params", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastPipelineClientProps = null;
    mockGetProductsByStatus.mockResolvedValue({ products: [], count: 0 });
    mockGetStatusCounts.mockResolvedValue([]);
  });

  it("accepts derived stage params without fetching persisted products", async () => {
    render(await PipelinePage({ searchParams: Promise.resolve({ stage: "images" }) }));

    expect(mockGetProductsByStatus).not.toHaveBeenCalled();
    expect(lastPipelineClientProps).toMatchObject({
      initialStage: "images",
      initialProducts: [],
      initialTotal: 0,
    });
  });

  it("falls back to imported for unknown stage params", async () => {
    render(await PipelinePage({ searchParams: Promise.resolve({ stage: "legacy-status" }) }));

    expect(mockGetProductsByStatus).toHaveBeenCalledWith("imported", { limit: 500 });
    expect(lastPipelineClientProps).toMatchObject({
      initialStage: "imported",
    });
  });
});
