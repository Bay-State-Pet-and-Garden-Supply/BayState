import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminSidebar } from "@/components/admin/sidebar";

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

// Test the sidebar component directly since the layout is now async/server
describe("Admin Layout", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("adminSidebarCollapsed", "false");
  });

  it("renders side navigation with links for admin role", () => {
    render(<AdminSidebar userRole="admin" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pipeline" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runner health" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("hides admin-only links for staff role", () => {
    render(<AdminSidebar userRole="staff" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runner health" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();

    // Staff should NOT see admin-only items
    expect(
      screen.queryByRole("link", { name: "Users" }),
    ).not.toBeInTheDocument();
  });

  it("shows role indicator", () => {
    render(<AdminSidebar userRole="admin" />);
    expect(screen.getByText("Signed in as admin")).toBeInTheDocument();
  });

  it("can toggle collapse state", async () => {
    render(<AdminSidebar userRole="admin" />);
    const button = screen.getByRole("button", { name: "Collapse navigation" });
    expect(button).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();
  });
});
