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
    expect(screen.getByText("Products")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select All 10" }),
    ).toBeInTheDocument();
  });

  it("renders start enrichment action for url_review stage", () => {
    render(
      <FloatingActionsBar
        selectedCount={4}
        totalCount={10}
        currentStage="url_review"
        isLoading={false}
        onClearSelection={() => {}}
        onSelectAll={() => {}}
        onBulkAction={() => {}}
        onOpenScrapeDialog={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Start/ }),
    ).toBeInTheDocument();
  });

  it("renders export actions in publishing stage", () => {
    const onUploadShopSite = jest.fn();
    const onDownloadZip = jest.fn();

    render(
      <FloatingActionsBar
        selectedCount={3}
        totalCount={12}
        currentStage="publishing"
        isLoading={false}
        onClearSelection={() => {}}
        onSelectAll={() => {}}
        onBulkAction={() => {}}
        onDelete={() => {}}
        onUploadShopSite={onUploadShopSite}
        onDownloadZip={onDownloadZip}
        showLegacyShopSiteActions={true}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Upload" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download ZIP" }),
    ).toBeInTheDocument();
  });
});
