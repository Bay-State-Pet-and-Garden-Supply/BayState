import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SinglePipelineTabs from "../SinglePipelineTabs";

describe("SinglePipelineTabs", () => {
  const mockCounts = {
    imported: 10,
    scraping: 5,
    scraped: 20,
    consolidating: 3,
    finalizing: 15,
  };

  const mockOnTabChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all 5 tabs", () => {
    render(
      <SinglePipelineTabs
        activeTab="imported"
        onTabChange={mockOnTabChange}
        counts={mockCounts}
      />
    );

    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("Scraping")).toBeInTheDocument();
    expect(screen.getByText("Scraped")).toBeInTheDocument();
    expect(screen.getByText("Consolidating")).toBeInTheDocument();
    expect(screen.getByText("Finalizing")).toBeInTheDocument();
  });

  it("displays count badges for each tab", () => {
    render(
      <SinglePipelineTabs
        activeTab="imported"
        onTabChange={mockOnTabChange}
        counts={mockCounts}
      />
    );

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("calls onTabChange when tab is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SinglePipelineTabs
        activeTab="imported"
        onTabChange={mockOnTabChange}
        counts={mockCounts}
      />
    );

    const scrapedTab = screen.getByText("Scraped");
    await user.click(scrapedTab);

    expect(mockOnTabChange).toHaveBeenCalledWith("scraped");
  });

  it("applies active state styling to the active tab", () => {
    render(
      <SinglePipelineTabs
        activeTab="scraping"
        onTabChange={mockOnTabChange}
        counts={mockCounts}
      />
    );

    const activeTab = screen.getByRole("tab", { selected: true });
    expect(activeTab).toHaveAttribute("data-state", "active");
  });

  it("handles zero counts gracefully", () => {
    const zeroCounts = {
      imported: 0,
      scraping: 0,
      scraped: 0,
      consolidating: 0,
      finalizing: 0,
    };

    render(
      <SinglePipelineTabs
        activeTab="imported"
        onTabChange={mockOnTabChange}
        counts={zeroCounts}
      />
    );

    const badges = screen.getAllByText("0");
    expect(badges).toHaveLength(5);
  });

  it("handles missing counts gracefully", () => {
    const partialCounts = {
      imported: 5,
    };

    render(
      <SinglePipelineTabs
        activeTab="imported"
        onTabChange={mockOnTabChange}
        counts={partialCounts}
      />
    );

    expect(screen.getByText("5")).toBeInTheDocument();
    const zeroBadges = screen.getAllByText("0");
    expect(zeroBadges).toHaveLength(4);
  });
});