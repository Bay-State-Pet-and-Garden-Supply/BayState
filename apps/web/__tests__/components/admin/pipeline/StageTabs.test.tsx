/**
 * @jest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { StageTabs } from "@/components/admin/pipeline/StageTabs";
import type { StatusCount } from "@/lib/pipeline/types";

const counts: StatusCount[] = [
  { status: "imported", count: 4 },
  { status: "scraped", count: 2 },
  { status: "finalized", count: 3 },
  { status: "export", count: 7 },
  { status: "failed", count: 1 },
];

describe("StageTabs", () => {
  it("renders the live seven-tab workflow", () => {
    render(
      <StageTabs
        currentStage="imported"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);

    expect(screen.getByRole("tab", { name: /Imported/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Scraping/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Scraped/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Consolidating/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Finalized/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Export/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Failed/i })).toBeInTheDocument();
  });

  it("shows derived counts for finalized and export", () => {
    render(
      <StageTabs
        currentStage="finalized"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const finalizedTab = screen.getByRole("tab", { name: /Finalized/i });
    const exportTab = screen.getByRole("tab", { name: /Export/i });

    expect(within(finalizedTab).getByText("3")).toBeInTheDocument();
    expect(within(exportTab).getByText("7")).toBeInTheDocument();
  });

  it("shows zero for in-progress derived tabs", () => {
    render(
      <StageTabs
        currentStage="scraping"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const scrapingTab = screen.getByRole("tab", { name: /Scraping/i });
    const consolidatingTab = screen.getByRole("tab", { name: /Consolidating/i });

    expect(within(scrapingTab).getByText("0")).toBeInTheDocument();
    expect(within(consolidatingTab).getByText("0")).toBeInTheDocument();
  });
});
