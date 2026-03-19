import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSidebar } from "@/components/admin/sidebar";

// Test the sidebar component directly since the layout is now async/server
describe("Admin Layout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders side navigation with links for admin role", () => {
    render(<AdminSidebar userRole="admin" />);

    const overviewLinks = screen.getAllByRole("link", { name: "Overview" });
    expect(overviewLinks).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Scrapers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Network" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Data Migration" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("hides admin-only links for staff role", () => {
    render(<AdminSidebar userRole="staff" />);

    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();

    // Staff should NOT see admin-only items
    expect(
      screen.queryByRole("link", { name: "New Products" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Scrapers" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Network" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Data Migration" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("shows role indicator", () => {
    render(<AdminSidebar userRole="admin" />);
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("can toggle collapse state", async () => {
    render(<AdminSidebar userRole="admin" />);
    const button = screen.getByRole("button", { name: /collapse sidebar/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
