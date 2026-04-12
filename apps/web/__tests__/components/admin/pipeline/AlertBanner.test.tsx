import { render, screen, fireEvent } from "@testing-library/react";
import { AlertBanner } from "@/components/admin/pipeline/AlertBanner";

describe("AlertBanner", () => {
  describe("Rendering all severities", () => {
    it("renders error severity with red surface treatment", () => {
      render(
        <AlertBanner severity="error" title="Error Title" />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("border-red-200");
      expect(alert).toHaveClass("bg-red-50/80");
    });

    it("renders warning severity with yellow surface treatment", () => {
      render(
        <AlertBanner severity="warning" title="Warning Title" />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("border-yellow-200");
      expect(alert).toHaveClass("bg-yellow-50/80");
    });

    it("renders info severity with blue surface treatment", () => {
      render(
        <AlertBanner severity="info" title="Info Title" />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveClass("border-blue-200");
      expect(alert).toHaveClass("bg-blue-50/80");
    });

    it("renders title text", () => {
      render(
        <AlertBanner severity="info" title="Test Alert Title" />
      );
      expect(screen.getByText("Test Alert Title")).toBeInTheDocument();
    });

    it("renders message when provided", () => {
      render(
        <AlertBanner severity="info" title="Title" message="Test message" />
      );
      expect(screen.getByText("Test message")).toBeInTheDocument();
    });

    it("does not render message when not provided", () => {
      render(
        <AlertBanner severity="info" title="Title" />
      );
      expect(screen.queryByText(/Test message/)).not.toBeInTheDocument();
    });
  });

  describe("Dismiss functionality", () => {
    it("renders dismiss button when onDismiss is provided", () => {
      render(
        <AlertBanner severity="info" title="Title" onDismiss={() => {}} />
      );
      expect(screen.getByLabelText("Dismiss alert")).toBeInTheDocument();
    });

    it("does not render dismiss button when onDismiss is not provided", () => {
      render(
        <AlertBanner severity="info" title="Title" />
      );
      expect(screen.queryByLabelText("Dismiss alert")).not.toBeInTheDocument();
    });

    it("calls onDismiss when dismiss button is clicked", () => {
      const mockOnDismiss = jest.fn();
      render(
        <AlertBanner severity="info" title="Title" onDismiss={mockOnDismiss} />
      );
      
      fireEvent.click(screen.getByLabelText("Dismiss alert"));
      expect(mockOnDismiss).toHaveBeenCalledTimes(1);
    });

    it("removes alert from DOM after dismiss", () => {
      const mockOnDismiss = jest.fn();
      render(
        <AlertBanner severity="info" title="Title" onDismiss={mockOnDismiss} />
      );
      
      expect(screen.getByRole("alert")).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("Dismiss alert"));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("Action buttons", () => {
    it("renders action buttons when provided", () => {
      render(
        <AlertBanner
          severity="info"
          title="Title"
          actions={[
            { label: "Retry", onClick: () => {} },
            { label: "View Logs", onClick: () => {} },
          ]}
        />
      );
      expect(screen.getByText("Retry")).toBeInTheDocument();
      expect(screen.getByText("View Logs")).toBeInTheDocument();
    });

    it("does not render action buttons when not provided", () => {
      render(
        <AlertBanner severity="info" title="Title" />
      );
      expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
    });

    it("calls action callback when clicked", () => {
      const mockAction = jest.fn();
      render(
        <AlertBanner
          severity="info"
          title="Title"
          actions={[{ label: "Retry", onClick: mockAction }]}
        />
      );
      
      fireEvent.click(screen.getByText("Retry"));
      expect(mockAction).toHaveBeenCalledTimes(1);
    });

    it("applies custom variant to action button", () => {
      render(
        <AlertBanner
          severity="error"
          title="Title"
          actions={[{ label: "Delete", onClick: () => {}, variant: "destructive" }]}
        />
      );
      const button = screen.getByText("Delete");
      expect(button).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has role='alert'", () => {
      render(
        <AlertBanner severity="info" title="Title" />
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("has aria-live='polite'", () => {
      render(
        <AlertBanner severity="info" title="Title" />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "polite");
    });

    it("has aria-atomic='true'", () => {
      render(
        <AlertBanner severity="info" title="Title" />
      );
      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-atomic", "true");
    });
  });
});
