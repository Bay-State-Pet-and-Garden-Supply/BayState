/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/admin/pipeline/StatusBadge";

describe("StatusBadge", () => {
  describe("imported status", () => {
    it("renders imported status with Package icon", () => {
      render(<StatusBadge status="imported" />);

      const badge = screen.getByRole("status");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass("border-transparent");
    });
  });

  describe("scraped status", () => {
    it("renders scraped status with pulse animation", () => {
      render(<StatusBadge status="scraped" />);

      const badge = screen.getByRole("status");
      expect(badge).toBeInTheDocument();
      const pulseDot = document.querySelector(".animate-ping");
      expect(pulseDot).toBeInTheDocument();
    });

    it("renders scraped status with Sparkles icon", () => {
      render(<StatusBadge status="scraped" />);

      const icon = document.querySelector(".lucide-sparkles");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("consolidated status", () => {
    it("renders consolidated status with AlertCircle icon", () => {
      render(<StatusBadge status="consolidated" />);

      const icon = document.querySelector(".lucide-alert-circle, [data-lucide='alert-circle']");
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

  describe("published status", () => {
    it("renders published status with Globe icon", () => {
      render(<StatusBadge status="published" />);

      const badge = screen.getByRole("status");
      expect(badge).toBeInTheDocument();
    });
  });

  describe("size variants", () => {
    it("renders sm size correctly", () => {
      render(<StatusBadge status="imported" size="sm" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("text-[10px]");
    });

    it("renders md size correctly", () => {
      render(<StatusBadge status="imported" size="md" />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("text-xs");
    });

    it("renders lg size correctly", () => {
      render(<StatusBadge status="imported" size="lg" />);

      const badge = screen.getByRole("status");
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
      render(<StatusBadge status="imported" isLoading={true} />);

      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });
});
