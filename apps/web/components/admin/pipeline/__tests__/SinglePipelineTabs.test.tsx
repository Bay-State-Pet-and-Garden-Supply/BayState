import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SinglePipelineTabs from "../SinglePipelineTabs";

describe("SinglePipelineTabs", () => {
  const workflowTabs = [
    { id: "imported", label: "Imported", count: 10 },
    { id: "scraping", label: "Scraping", count: 5 },
    { id: "scraped", label: "Scraped", count: 20 },
    { id: "consolidating", label: "Consolidating", count: 3 },
    { id: "finalizing", label: "Finalizing", count: 15 },
  ] as const;

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

  it("renders all 5 workflow tabs with their counts", () => {
    render(
      <SinglePipelineTabs
        activeTab="imported"
        onTabChange={mockOnTabChange}
        counts={mockCounts}
      />
    );

    expect(screen.getAllByRole("tab")).toHaveLength(5);

    workflowTabs.forEach(({ label, count }) => {
      const tab = screen.getByRole("tab", { name: new RegExp(label, "i") });

      expect(tab).toBeInTheDocument();
      expect(within(tab).getByText(String(count))).toBeInTheDocument();
    });
  });

  it.each(workflowTabs.filter((tab) => tab.id !== "imported"))(
    "calls onTabChange when the $label tab is clicked",
    async ({ id, label }) => {
      const user = userEvent.setup();

      render(
        <SinglePipelineTabs
          activeTab="imported"
          onTabChange={mockOnTabChange}
          counts={mockCounts}
        />
      );

      await user.click(screen.getByRole("tab", { name: new RegExp(label, "i") }));

      expect(mockOnTabChange).toHaveBeenCalledWith(id);
    }
  );

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
    expect(activeTab).toHaveAccessibleName(/scraping/i);
  });

  it("renders zero badges for missing counts", () => {
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

    expect(within(screen.getByRole("tab", { name: /imported/i })).getByText("5")).toBeInTheDocument();

    workflowTabs
      .filter(({ id }) => id !== "imported")
      .forEach(({ label }) => {
        expect(within(screen.getByRole("tab", { name: new RegExp(label, "i") })).getByText("0")).toBeInTheDocument();
      });
  });

  it("handles explicit zero counts across all five tabs", async () => {
    const zeroCounts = {
      imported: 0,
      scraping: 0,
      scraped: 0,
      consolidating: 0,
      finalizing: 0,
    };

    const user = userEvent.setup();

    render(
      <SinglePipelineTabs
        activeTab="imported"
        onTabChange={mockOnTabChange}
        counts={zeroCounts}
      />
    );

    await user.click(screen.getByRole("tab", { name: /finalizing/i }));

    expect(screen.getAllByText("0")).toHaveLength(5);
    expect(mockOnTabChange).toHaveBeenCalledWith("finalizing");
  });
});
