/**
 * @jest-environment jsdom
 */

import { render } from "@testing-library/react";
import PipelinePage from "@/app/admin/pipeline/page";

let lastPipelineClientProps: Record<string, unknown> | null = null;
const mockGetProductsByStage = jest.fn();
const mockGetStatusCounts = jest.fn();
const mockGetAvailableSourcesByStage = jest.fn();

jest.mock("@/components/admin/pipeline/PipelineClient", () => ({
  PipelineClient: (props: Record<string, unknown>) => {
    lastPipelineClientProps = props;
    return <div data-testid="pipeline-client" />;
  },
}));

jest.mock("@/lib/pipeline", () => ({
  getProductsByStage: (...args: unknown[]) => mockGetProductsByStage(...args),
  getStatusCounts: (...args: unknown[]) => mockGetStatusCounts(...args),
  getAvailableSourcesByStage: (...args: unknown[]) =>
    mockGetAvailableSourcesByStage(...args),
}));

describe("admin pipeline page stage params", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastPipelineClientProps = null;
    mockGetProductsByStage.mockResolvedValue({ products: [], count: 0 });
    mockGetStatusCounts.mockResolvedValue([]);
    mockGetAvailableSourcesByStage.mockResolvedValue([]);
  });

  it("maps the legacy published stage param to the export workspace", async () => {
    render(await PipelinePage({ searchParams: Promise.resolve({ stage: "published" }) }));

    expect(mockGetProductsByStage).toHaveBeenCalledWith(
      "export",
      expect.objectContaining({ limit: 500 }),
    );
    expect(lastPipelineClientProps).toMatchObject({
      initialStage: "export",
      initialProducts: [],
      initialTotal: 0,
    });
  });

  it("hydrates finalizing from finalized products", async () => {
    render(await PipelinePage({ searchParams: Promise.resolve({ stage: "finalizing" }) }));

    expect(mockGetProductsByStage).toHaveBeenCalledWith(
      "finalized",
      expect.objectContaining({ limit: 500 }),
    );
    expect(lastPipelineClientProps).toMatchObject({
      initialStage: "finalized",
    });
  });

  it("falls back to imported for unknown stage params", async () => {
    render(await PipelinePage({ searchParams: Promise.resolve({ stage: "legacy-status" }) }));

    expect(mockGetProductsByStage).toHaveBeenCalledWith(
      "imported",
      expect.objectContaining({ limit: 500 }),
    );
    expect(lastPipelineClientProps).toMatchObject({
      initialStage: "imported",
    });
  });
});
