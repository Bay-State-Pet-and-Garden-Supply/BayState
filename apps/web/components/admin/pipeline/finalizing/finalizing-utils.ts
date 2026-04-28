import { normalizeImageUrl } from "@/lib/product-sources";
import { extractSelectedImageUrls } from "@/lib/pipeline/finalization-draft";

export interface ImageSourceOption {
  id: string;
  label: string;
  candidates: string[];
}

/**
 * Build a deduplication key for image URLs.
 * For Amazon images, strips the host to handle same image from different CDNs.
 * This matches the logic in product-sources.ts buildImageDedupKey.
 */
function buildImageDedupKey(value: string): string {
  const normalized = normalizeImageUrl(value);
  if (/amazon\./i.test(normalized) && /\/images\/I\//i.test(normalized)) {
    return normalized.replace(/^https?:\/\/[^/]+/i, "").toLowerCase();
  }
  return normalized;
}

/**
 * Convert array to string array with Amazon-aware deduplication.
 * Handles case where same Amazon image comes from different hosts/CDNs.
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

function formatSourceLabel(sourceKey: string): string {
  return sourceKey
    .replace(/^source:/i, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function isValidCustomImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (/^data:image\//i.test(trimmed)) return true;
  if (trimmed.startsWith("/")) return true;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
  } catch {
    return false;
  }

  if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(trimmed)) {
    return true;
  }

  return /(?:image|img|photo|picture|thumbnail|cdn)/i.test(trimmed);
}
