/**
 * @jest-environment jsdom
 */

import { render, screen, within } from "@testing-library/react";
import { StageTabs } from "@/components/admin/pipeline/StageTabs";
import type { StatusCount } from "@/lib/pipeline/types";

const counts: StatusCount[] = [
  { status: "imported", count: 4 },
  { status: "scraping", count: 6 },
  { status: "scraped", count: 2 },
  { status: "consolidating", count: 5 },
  { status: "finalizing", count: 3 },
  { status: "exporting", count: 7 },
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
    expect(screen.getByRole("tab", { name: /Finalizing/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Exporting/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Failed/i })).toBeInTheDocument();
  });

  it("shows live counts for finalizing and exporting", () => {
    render(
      <StageTabs
        currentStage="finalizing"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const finalizingTab = screen.getByRole("tab", { name: /Finalizing/i });
    const exportingTab = screen.getByRole("tab", { name: /Exporting/i });

    expect(within(finalizingTab).getByText("3")).toBeInTheDocument();
    expect(within(exportingTab).getByText("7")).toBeInTheDocument();
  });

  it("shows live counts for in-progress workflow tabs", () => {
    render(
      <StageTabs
        currentStage="scraping"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const scrapingTab = screen.getByRole("tab", { name: /Scraping/i });
    const consolidatingTab = screen.getByRole("tab", { name: /Consolidating/i });

    expect(within(scrapingTab).getByText("6")).toBeInTheDocument();
    expect(within(consolidatingTab).getByText("5")).toBeInTheDocument();
  });
});
