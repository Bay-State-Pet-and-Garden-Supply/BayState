/**
 * @jest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { StageTabs } from "@/components/admin/pipeline/StageTabs";
import type { StatusCount } from "@/lib/pipeline/types";

const counts: StatusCount[] = [
  { status: "imported", count: 4 },
  { status: "scraped", count: 2 },
  { status: "consolidated", count: 1 },
  { status: "finalized", count: 3 },
  { status: "failed", count: 1 },
  { status: "published", count: 7 },
];

describe("StageTabs", () => {
  it("separates persisted workflow tabs from operational tabs", () => {
    render(
      <StageTabs
        currentStage="imported"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const workflowSection = screen.getByText("Workflow").parentElement;
    const operationalSection = screen.getByText("Operational").parentElement;

    expect(workflowSection).toBeTruthy();
    expect(operationalSection).toBeTruthy();

    expect(within(workflowSection!).getByRole("tab", { name: /Imported/i })).toBeInTheDocument();
    expect(within(workflowSection!).getByRole("tab", { name: /Scraped/i })).toBeInTheDocument();
    expect(within(workflowSection!).getByRole("tab", { name: /Finalized/i })).toBeInTheDocument();
    expect(within(workflowSection!).getByRole("tab", { name: /Failed/i })).toBeInTheDocument();
    expect(within(workflowSection!).queryByRole("tab", { name: /Published/i })).not.toBeInTheDocument();

    expect(within(operationalSection!).getByRole("tab", { name: /Monitoring/i })).toBeInTheDocument();
    expect(within(operationalSection!).getByRole("tab", { name: /Consolidating/i })).toBeInTheDocument();
    expect(within(operationalSection!).getByRole("tab", { name: /Published/i })).toBeInTheDocument();
    expect(within(operationalSection!).getByRole("tab", { name: /Images/i })).toBeInTheDocument();
    expect(within(operationalSection!).getByRole("tab", { name: /Export/i })).toBeInTheDocument();
  });

  it("rolls legacy consolidated rows into the finalized badge without rendering a legacy tab", () => {
    render(
      <StageTabs
        currentStage="finalized"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const workflowSection = screen.getByText("Workflow").parentElement;
    const finalizedTab = within(workflowSection!).getByRole("tab", { name: /Finalized/i });

    expect(within(finalizedTab).getByText("4")).toBeInTheDocument();
    expect(within(workflowSection!).queryByRole("tab", { name: /Consolidated/i })).not.toBeInTheDocument();
  });

  it("renders the published badge from derived counts", () => {
    render(
      <StageTabs
        currentStage="published"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const operationalSection = screen.getByText("Operational").parentElement;
    const publishedTab = within(operationalSection!).getByRole("tab", { name: /Published/i });

    expect(within(publishedTab).getByText("7")).toBeInTheDocument();
  });
});
