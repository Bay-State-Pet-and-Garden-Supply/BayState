/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";

/**
 * Build a deduplication key for image URLs.
 * For Amazon images, strips the host to handle same image from different CDNs.
 */
function buildImageDedupKey(value: string): string {
  const normalized = normalizeImageUrl(value);
  if (/amazon\./i.test(normalized) && /\/images\/I\//i.test(normalized)) {
    return normalized.replace(/^https?:\/\/[^/]+/i, "").toLowerCase();
  }
  return normalized;
}

/**
 * Normalize image URLs, specifically stripping Amazon's resize parameters.
 */
function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (/amazon\./i.test(parsed.hostname) && /\/images\/I\//i.test(parsed.pathname)) {
      const cleanedPath = parsed.pathname.replace(
        /(\._[^/?#]+_)(?=\.[^.\/?#]+$)/i,
        ""
      );
      return `${parsed.protocol}//${parsed.host}${cleanedPath}`;
    }
  } catch {
    if (/amazon\./i.test(trimmed) && /\/images\/I\//i.test(trimmed)) {
      return trimmed.replace(
        /(\._[^/?#]+_)(?=\.[^.\/?#]+(?:[?#].*)?$)/i,
        ""
      );
    }
  }

  return trimmed;
}

/**
 * Convert array to string array with Amazon-aware deduplication.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Map<string, string>();

  value
    .filter((entry): entry is string => typeof entry === "string")
    .map((url) => normalizeImageUrl(url))
    .filter((url) => url.length > 0)
    .forEach((url) => {
      const key = buildImageDedupKey(url);
      if (!deduped.has(key)) {
        deduped.set(key, url);
      }
    });

  return Array.from(deduped.values());
}

describe("FinalizingResultsView image deduplication", () => {
  describe("buildImageDedupKey", () => {
    it("strips host for Amazon images", () => {
      const url1 = "https://m.media-amazon.com/images/I/71hero.jpg";
      const url2 = "https://images-na.ssl-images-amazon.com/images/I/71hero.jpg";

      expect(buildImageDedupKey(url1)).toBe("/images/i/71hero.jpg");
      expect(buildImageDedupKey(url2)).toBe("/images/i/71hero.jpg");
      expect(buildImageDedupKey(url1)).toBe(buildImageDedupKey(url2));
    });

    it("keeps full URL for non-Amazon images", () => {
      const url = "https://example.com/image.jpg";
      expect(buildImageDedupKey(url)).toBe(url);
    });
  });

  describe("toStringArray", () => {
    it("deduplicates exact duplicate URLs", () => {
      const input = [
        "https://example.com/image1.jpg",
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg",
      ];

      const result = toStringArray(input);
      expect(result).toHaveLength(2);
      expect(result).toContain("https://example.com/image1.jpg");
      expect(result).toContain("https://example.com/image2.jpg");
    });

    it("deduplicates Amazon images from different hosts (the reported bug)", () => {
      // This is the exact scenario from the bug report:
      // Same Amazon image accessed from different CDN hosts
      const input = [
        "https://m.media-amazon.com/images/I/71ABC123._AC_SL1500_.jpg",
        "https://images-na.ssl-images-amazon.com/images/I/71ABC123._AC_US500_.jpg",
        "https://m.media-amazon.com/images/I/81XYZ789._SX38_SY50_.jpg",
      ];

      const result = toStringArray(input);

      // Should dedupe to 2 images (first two are same image, different hosts)
      expect(result).toHaveLength(2);

      // Verify the first image's resize parameters were stripped
      expect(result[0]).toBe(
        "https://m.media-amazon.com/images/I/71ABC123.jpg"
      );
      expect(result[1]).toBe(
        "https://m.media-amazon.com/images/I/81XYZ789.jpg"
      );
    });

    it("handles empty arrays", () => {
      expect(toStringArray([])).toEqual([]);
      expect(toStringArray(null)).toEqual([]);
      expect(toStringArray(undefined)).toEqual([]);
    });

    it("handles Amazon images with different resize parameters", () => {
      const input = [
        "https://m.media-amazon.com/images/I/71hero._AC_SL1500_.jpg",
        "https://m.media-amazon.com/images/I/71hero._AC_US100_.jpg",
        "https://m.media-amazon.com/images/I/71hero._SX38_SY50_CR,0,0,38,50_.jpg",
      ];

      const result = toStringArray(input);

      // All three should dedupe to one image
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("https://m.media-amazon.com/images/I/71hero.jpg");
    });

    it("preserves different Amazon images with different IDs", () => {
      const input = [
        "https://m.media-amazon.com/images/I/71hero._AC_SL1500_.jpg",
        "https://m.media-amazon.com/images/I/81side._AC_SL1500_.jpg",
        "https://m.media-amazon.com/images/I/91back._AC_SL1500_.jpg",
      ];

      const result = toStringArray(input);

      // Should preserve all 3 different images
      expect(result).toHaveLength(3);
    });
  });
});
