/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { FloatingActionsBar } from "@/components/admin/pipeline/FloatingActionsBar";

describe("FloatingActionsBar", () => {
  it("renders the full action bar for imported stage", () => {
    render(
      <FloatingActionsBar
        selectedCount={4}
        totalCount={10}
        currentStage="imported"
        isLoading={false}
        onClearSelection={() => {}}
        onSelectAll={() => {}}
        onBulkAction={() => {}}
        onOpenScrapeDialog={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Products Selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear Selection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scrape Selected" }),
    ).toBeInTheDocument();
  });

  it("renders export actions in exporting stage", () => {
    const onUploadShopSite = jest.fn();
    const onDownloadZip = jest.fn();

    render(
      <FloatingActionsBar
        selectedCount={3}
        totalCount={12}
        currentStage="exporting"
        isLoading={false}
        onClearSelection={() => {}}
        onSelectAll={() => {}}
        onBulkAction={() => {}}
        onDelete={() => {}}
        onUploadShopSite={onUploadShopSite}
        onDownloadZip={onDownloadZip}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Upload to ShopSite" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download ZIP" }),
    ).toBeInTheDocument();
  });
});
