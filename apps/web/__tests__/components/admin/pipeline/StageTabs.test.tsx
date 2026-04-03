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
  { status: "failed", count: 1 },
  { status: "published", count: 7 },
];

describe("StageTabs", () => {
  it("renders the live six-tab workflow", () => {
    render(
      <StageTabs
        currentStage="imported"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(6);

    expect(screen.getByRole("tab", { name: /Imported/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Scraping/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Scraped/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Consolidating/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Finalizing/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Published/i })).toBeInTheDocument();
  });

  it("shows derived counts for finalizing and published", () => {
    render(
      <StageTabs
        currentStage="finalizing"
        counts={counts}
        onStageChange={() => {}}
      />,
    );

    const finalizingTab = screen.getByRole("tab", { name: /Finalizing/i });
    const publishedTab = screen.getByRole("tab", { name: /Published/i });

    expect(within(finalizingTab).getByText("3")).toBeInTheDocument();
    expect(within(publishedTab).getByText("7")).toBeInTheDocument();
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
