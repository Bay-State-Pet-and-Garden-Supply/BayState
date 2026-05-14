/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/admin/pipeline/StatusBadge";

describe("StatusBadge", () => {
  describe("imported status", () => {
    it("renders imported status with Package icon", () => {
      render(<StatusBadge status="imported" />);

      const badge = screen.getByText("Imported").closest("[data-slot='badge']");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("rounded-none");
      expect(badge).toHaveClass("border-border");
    });
  });

  describe("extracting status", () => {
    it("renders extracting status with pulse animation", () => {
      render(<StatusBadge status="extracting" />);

      const badge = screen.getByText("Extracting").closest("[data-slot='badge']");
      expect(badge).toBeInTheDocument();
      const pulseDot = document.querySelector(".animate-ping");
      expect(pulseDot).toBeInTheDocument();
    });
  });

  describe("processed status", () => {
    it("renders processed status with Sparkles icon", () => {
      render(<StatusBadge status="processed" />);

      const icon = document.querySelector(".lucide-sparkles");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("reviewing status", () => {
    it("renders reviewing status with CheckCircle2 icon", () => {
      const { container } = render(<StatusBadge status="reviewing" />);

      const icon = container.querySelector("[data-slot='badge'] svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("publishing status", () => {
    it("renders publishing status with Globe icon", () => {
      render(<StatusBadge status="publishing" />);

      const badge = screen.getByText("Publishing").closest("[data-slot='badge']");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("renders sm size correctly", () => {
      render(<StatusBadge status="imported" size="sm" />);

      const badge = screen.getByText("Imported").closest("[data-slot='badge']");
      expect(badge).toHaveClass("text-[10px]");
    });

    it("renders md size correctly", () => {
      render(<StatusBadge status="imported" size="md" />);

      const badge = screen.getByText("Imported").closest("[data-slot='badge']");
      expect(badge).toHaveClass("text-xs");
    });

    it("renders lg size correctly", () => {
      render(<StatusBadge status="imported" size="lg" />);

      const badge = screen.getByText("Imported").closest("[data-slot='badge']");
      expect(badge).toHaveClass("text-sm");
    });
  });

  describe("icon display", () => {
    it("hides icon when showIcon is false", () => {
      render(<StatusBadge status="imported" showIcon={false} />);

      const icon = document.querySelector(".lucide-package");
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("renders skeleton when isLoading is true", () => {
      render(<StatusBadge status="imported" isLoading />);

      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});
