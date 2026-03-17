import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/admin/pipeline/StatusBadge";

describe("StatusBadge", () => {
  describe("registered status", () => {
    it("renders registered status with Package icon", () => {
      render(<StatusBadge status="registered" />);

      const badge = screen.getByRole("status");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("border-transparent");
    });
  });

  describe("enriched status", () => {
    it("renders enriched status with pulse animation", () => {
      render(<StatusBadge status="enriched" />);

      const badge = screen.getByRole("status");
      expect(badge).toBeInTheDocument();
      const pulseDot = document.querySelector(".animate-ping");
      expect(pulseDot).toBeInTheDocument();
    });

    it("renders enriched status with Sparkles icon", () => {
      render(<StatusBadge status="enriched" />);

      const icon = document.querySelector(".lucide-sparkles");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("finalized status", () => {
    it("renders finalized status with CheckCircle2 icon", () => {
      render(<StatusBadge status="finalized" />);

      const icon = document.querySelector(".lucide-check-circle-2, [data-lucide='check-circle-2']");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("failed status", () => {
    it("renders failed status with AlertCircle icon", () => {
      render(<StatusBadge status="failed" />);

      const icon = document.querySelector(".lucide-alert-circle, [data-lucide='alert-circle']");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("renders sm size correctly", () => {
      render(<StatusBadge status="registered" size="sm" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("text-[10px]");
    });

    it("renders md size correctly", () => {
      render(<StatusBadge status="registered" size="md" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("text-xs");
    });

    it("renders lg size correctly", () => {
      render(<StatusBadge status="registered" size="lg" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("text-sm");
    });
  });

  describe("icon display", () => {
    it("hides icon when showIcon is false", () => {
      render(<StatusBadge status="registered" showIcon={false} />);

      const icon = document.querySelector(".lucide-package");
      expect(icon).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("renders skeleton when isLoading is true", () => {
      render(<StatusBadge status="registered" isLoading={true} />);

      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});
