/**
 * @jest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { StageTabs } from "@/components/admin/pipeline/StageTabs";
import type { StatusCount } from "@/lib/pipeline/types";

const counts: StatusCount[] = [
  { status: "imported", count: 4 },
  { status: "awaiting_brand", count: 0 },
  { status: "extracting", count: 2 },
  { status: "processed", count: 5 },
  { status: "merging", count: 3 },
  { status: "reviewing", count: 7 },
  { status: "publishing", count: 8 },
  { status: "failed", count: 1 },
];

describe("StageTabs", () => {
  it("renders all pipeline stage tabs", () => {
    render(
      <StageTabs
        currentStage="imported"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBe(7);

    expect(screen.getByRole("tab", { name: /Imported/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Extracting/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Processed/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Merging/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Reviewing/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Publishing/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Failed/i })).toBeInTheDocument();
  });

  it("shows live counts for reviewing and publishing", () => {
    render(
      <StageTabs
        currentStage="reviewing"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const reviewingTab = screen.getByRole("tab", { name: /Reviewing/i });
    const publishingTab = screen.getByRole("tab", { name: /Publishing/i });

    expect(within(reviewingTab).getByText("7")).toBeInTheDocument();
    expect(within(publishingTab).getByText("8")).toBeInTheDocument();
  });

  it("shows live counts for in-progress workflow tabs", () => {
    render(
      <StageTabs
        currentStage="extracting"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const extractingTab = screen.getByRole("tab", { name: /Extracting/i });
    const mergingTab = screen.getByRole("tab", { name: /Merging/i });

    expect(within(extractingTab).getByText("2")).toBeInTheDocument();
    expect(within(mergingTab).getByText("3")).toBeInTheDocument();
  });
});
