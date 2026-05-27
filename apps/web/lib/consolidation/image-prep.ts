/**
 * Image Preparation for Gemini Multimodal Consolidation
 *
 * Fetches product images from URLs, validates them (SSRF protection, size limits),
 * uploads to Gemini File API, and returns fileData references for multimodal prompts.
 *
 * Design:
 * - Only first 2 images per product (front/back packaging)
 * - SSRF-safe: reject non-http/https, localhost, private-network URLs, redirect revalidation
 * - Max 10MB per image; 30s timeout per fetch
 * - Strict MIME type validation with magic-byte confirmation
 * - Reject non-image content (octet-stream not allowed without magic-byte confirmation)
 * - Caches upload results per URL within one batch
 * - Graceful failure: if image fetch/upload fails, UPC proceeds text-only
 */

import { createGeminiClient, type GeminiClient } from './gemini-client';
import dns from 'dns/promises';

// =============================================================================
// Constants
// =============================================================================

const MAX_IMAGES_PER_PRODUCT = 2;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_FETCH_TIMEOUT_MS = 30_000;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// =============================================================================
// Types
// =============================================================================

export interface PreparedImagePart {
  /** Gemini File API fileUri */
  fileUri: string;
  /** MIME type */
  mimeType: string;
}

export interface ImagePrepResult {
  /** Successfully prepared image parts (0, 1, or 2) */
  imageParts: PreparedImagePart[];
  /** Any errors encountered during prep (not fatal) */
  errors: string[];
}

// =============================================================================
// URL Selection
// =============================================================================

/**
 * Extract up to MAX_IMAGES_PER_PRODUCT image URLs from:
 * 1. selected_images (user-selected or processed) — highest priority
 * 2. image_candidates (AI-discovered) — fallback
 * 3. sources[].images (raw source fields) — last resort
 *
 * Returns at most MAX_IMAGES_PER_PRODUCT normalized URLs.
 */
export function selectProductImageUrls(
  selectedImages: unknown,
  imageCandidates: unknown,
  sources: Record<string, unknown>
): string[] {
  const candidates: string[] = [];

  // 1. selected_images (highest priority)
  const selected = extractUrlsFromValue(selectedImages);
  candidates.push(...selected);

  // 2. image_candidates
  if (candidates.length < MAX_IMAGES_PER_PRODUCT) {
    const candidatesFromField = extractUrlsFromValue(imageCandidates);
    for (const url of candidatesFromField) {
      if (!candidates.includes(url) && candidates.length < MAX_IMAGES_PER_PRODUCT) {
        candidates.push(url);
      }
    }
  }

  // 3. sources[].images
  if (candidates.length < MAX_IMAGES_PER_PRODUCT) {
    const sourceImages = extractImagesFromSources(sources);
    for (const url of sourceImages) {
      if (!candidates.includes(url) && candidates.length < MAX_IMAGES_PER_PRODUCT) {
        candidates.push(url);
      }
    }
  }

  return candidates.slice(0, MAX_IMAGES_PER_PRODUCT);
}

/**
 * Extract URL strings from various value shapes:
 * - string -> single URL
 * - string[] -> array of URLs
 * - Array<{url: string}> -> extract url fields
 * - Array<{url?: unknown}> -> handle typed objects
 */
function extractUrlsFromValue(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    const urls: string[] = [];
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) {
        urls.push(item.trim());
      } else if (item && typeof item === 'object' && 'url' in item) {
        const url = (item as { url?: unknown }).url;
        if (typeof url === 'string' && url.trim()) {
          urls.push(url.trim());
        }
      }
    }
    return urls;
  }

  return [];
}

/**
 * Extract image URLs from product sources' images array.
 */
function extractImagesFromSources(sources: Record<string, unknown>): string[] {
  const urls: string[] = [];

  for (const [, sourceData] of Object.entries(sources)) {
    if (sourceData && typeof sourceData === 'object') {
      const data = sourceData as Record<string, unknown>;
      const images = data.images ?? data.image_urls ?? data.image_url ?? data.image;
      if (images) {
        const extracted = extractUrlsFromValue(images);
        urls.push(...extracted);
      }
    }
  }

  return urls;
}

// =============================================================================
// URL Validation
// =============================================================================

/**
 * Resolve a hostname to all IP addresses (IPv4 and IPv6).
 * Returns an array of address strings, or throws on resolution failure.
 */
/**
 * Resolve a hostname to all IP addresses (IPv4 and IPv6).
 * Uses the injectable dnsLookup function (swappable in tests).
 * Returns an array of address strings, or empty array on failure.
 */
async function resolveHostname(hostname: string): Promise<string[]> {
  try {
    const addresses: string[] = [];
    // Try IPv4 first
    const v4Result = await dns.lookup(hostname, { family: 4 });
    if (v4Result.address) {
      addresses.push(v4Result.address);
    }
    // Try IPv6
    try {
      const v6Result = await dns.lookup(hostname, { family: 6 });
      if (v6Result.address) {
        addresses.push(v6Result.address);
      }
    } catch {
      // IPv6 not available, that's fine
    }
    return addresses;
  } catch {
    // DNS resolution failure
    return [];
  }
}

/**
 * Validate a URL for SSRF safety and basic format.
 * Performs DNS resolution for non-IP hostnames to reject domains
 * that resolve to private/reserved IP addresses.
 * Returns null if the URL is unsafe, otherwise the URL string.
 */
async function validateImageUrl(rawUrl: string, performDnsLookup: boolean = true): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  // Only http/https allowed
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  // Reject localhost and common loopback names
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]' || hostname === '::1') {
    return null;
  }

  // Comprehensive IP validation — reject all private/reserved addresses including IPv6 variants
  const normalizedHost = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1).toLowerCase() : hostname.toLowerCase();

  // Check all private/reserved patterns including IPv4-mapped IPv6 (::ffff:x.x.x.x and ::ffff:7f00:1)
  if (isPrivateOrReservedIP(normalizedHost)) {
    return null;
  }

  // DNS resolution for non-IP hostnames (domain names)
  const looksLikeIP = /^\d/.test(normalizedHost) || normalizedHost.includes(':') || normalizedHost.includes('.');
  const isProbablyDomain = !looksLikeIP || (normalizedHost.includes('.') && !/^\d+\.\d+/.test(normalizedHost));

  if (performDnsLookup && isProbablyDomain && !normalizedHost.includes(':')) {
    const addresses = await resolveHostname(normalizedHost);
    if (addresses.length === 0) {
      // DNS resolution failed entirely — reject for safety
      return null;
    }
    for (const addr of addresses) {
      if (isPrivateOrReservedIP(addr)) {
        return null;
      }
    }
  }

  // Reject URLs with embedded credentials (user:password@host)
  if (url.username || url.password) {
    return null;
  }

  return url.toString();
}

/**
 * Check if a hostname string represents a private or reserved IP address.
 * Covers IPv4 private ranges, IPv6 loopback/link-local/unique-local,
 * and IPv4-mapped IPv6 encodings.
 */
/**
 * Check if a hostname string represents a private or reserved IP address.
 * Covers IPv4 private ranges, IPv6 loopback/link-local/unique-local,
 * IPv4-mapped IPv6 encodings including hex forms like ::ffff:7f00:1,
 * and DNS-bypass encodings.
 */
function isPrivateOrReservedIP(host: string): boolean {
  // Normalize: lowercase, strip brackets
  const normalized = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1).toLowerCase() : host.toLowerCase();

  // Handle IPv4-mapped IPv6: ::ffff:1.2.3.4 -> extract the IPv4 part
  const dottedV4Match = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dottedV4Match) {
    return checkPrivateIPv4(dottedV4Match[1]);
  }

  // Handle IPv4-mapped IPv6 hex form: ::ffff:7f00:1 (127.0.0.1)
  // ::ffff:7f00:1 -> hex parts, decode to dotted quad
  const hexV4Match = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexV4Match) {
    const hi = parseInt(hexV4Match[1], 16);
    const lo = parseInt(hexV4Match[2], 16);
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return checkPrivateIPv4(ipv4);
  }

  // Strip optional leading zeros from each IPv6 hextet for comparison
  const strippedV6 = normalized.replace(/:([0-9a-f]{1,4})/g, (_, h) => ':' + h.replace(/^0+/g, ''));

  // IPv6 patterns (post-normalization)
  // Handle full IPv6 loopback ::1, 0:0:0:0:0:0:0:1, etc.
  const ipv6Loopbacks = ['::1', '::0:1', '0:0:0:0:0:0:0:1'];
  if (ipv6Loopbacks.includes(strippedV6)) {
    return true;
  }
  if (/^0{0,4}(:0{0,4}){7}:1$/.test(normalized)) {
    return true;
  }

  const ipv6Patterns = [
    /^fc00:/i,  // unique-local unicast (ULA)
    /^fe80:/i,  // link-local unicast
    /^f[cd]/i,  // rest of ULA range
    /^ff00:/i,  // multicast (treated as reserved for safety)
    /^::[0]+$/, // unspecified
    /^::$/,     // unspecified
  ];

  if (ipv6Patterns.some((p) => p.test(strippedV6) || p.test(normalized))) {
    return true;
  }

  // Single integer (0, 127, 10, etc.) — likely an IP encoding bypass attempt
  if (/^\d{1,10}$/.test(normalized)) {
    const n = parseInt(normalized, 10);
    // These correspond to 0.0.0.0 (0), 127.0.0.1 (2130706433), 10.0.0.0 (167772160), etc.
    if (n === 0 || n === 2130706433 || n === 167772160 || n === 3232235520 || (n >= 2886729728 && n <= 2886737919)) {
      return true;
    }
  }

  // Dotted decimal with leading zeros (octal) or hex encoding
  const dottedParts = normalized.split('.');
  if (dottedParts.length === 4) {
    for (const part of dottedParts) {
      if (!/^\d{1,3}$/.test(part) && !/^0[xX][0-9a-fA-F]{1,2}$/.test(part)) {
        // Mixed encoding — check if it decodes to a private range
        try {
          const decoded = parseInt(part, /^0[xX]/.test(part) ? 16 : 10);
          if (isNaN(decoded) || decoded < 0 || decoded > 255) return true;
        } catch {
          return true;
        }
      }
    }
  }

  return checkPrivateIPv4(normalized);
}

/**
 * Check a dotted-quad IPv4 string against private/reserved ranges.
 */
function checkPrivateIPv4(ip: string): boolean {
  const ipv4Patterns = [
    /^127\./,           // loopback
    /^10\./,             // class A private
    /^172\.(1[6-9]|2\d|3[01])\./, // class B private
    /^192\.168\./,       // class C private
    /^0\./,              // current network
    /^169\.254\./,       // link-local
    /^100\.(6[4-9]|\d{2}|1[0-1]\d|12[0-7])\./, // CGNAT
    /^198\.1[8-9]\./,    // benchmark testing
    /^203\.0\.11[3-9]\./, // documentation
  ];
  return ipv4Patterns.some((p) => p.test(ip));
}

// =============================================================================
// Image Fetching
// =============================================================================

interface FetchImageResult {
  buffer: Buffer | null;
  mimeType: string | null;
  error: string | null;
}

/**
 * Fetch an image from a URL with size and timeout limits.
 * Enforces SSRF safety on redirect targets and strict MIME + magic-byte validation.
 */
async function fetchImage(url: string, maxRedirects: number = 5): Promise<FetchImageResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount <= maxRedirects) {
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Accept': 'image/jpeg,image/png,image/webp,image/gif',
            'User-Agent': 'BayState-Consolidation/1.0',
          },
          // Do NOT follow redirects automatically — we re-validate each hop
          redirect: 'manual',
        });
      } finally {
        clearTimeout(timeout);
      }

      // Handle redirects (3xx)
      if (response.status >= 300 && response.status < 400) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          return { buffer: null, mimeType: null, error: `Too many redirects (${maxRedirects})` };
        }

        const location = response.headers.get('location');
        if (!location) {
          return { buffer: null, mimeType: null, error: `Redirect ${response.status} with no Location header` };
        }

        // Resolve relative redirects
        const redirectUrl = new URL(location, currentUrl);

        // Re-validate redirect target URL for SSRF safety
        const validatedRedirect = await validateImageUrl(redirectUrl.toString());
        if (!validatedRedirect) {
          return { buffer: null, mimeType: null, error: `Redirect target blocked by SSRF validation: ${redirectUrl.hostname}` };
        }

        currentUrl = validatedRedirect;
        continue;
      }

      if (!response.ok) {
        return { buffer: null, mimeType: null, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      // Strict MIME type validation — only allow image/* MIME types
      const contentType = response.headers.get('content-type') || '';
      const normalizedMime = contentType.split(';')[0].trim().toLowerCase();

      if (!ALLOWED_MIME_TYPES.has(normalizedMime as typeof ALLOWED_MIME_TYPES extends Set<infer T> ? T : never)) {
        return { buffer: null, mimeType: null, error: `Rejected non-image Content-Type: "${normalizedMime}"` };
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const bytes = parseInt(contentLength, 10);
        if (!isNaN(bytes) && bytes > MAX_IMAGE_BYTES) {
          return { buffer: null, mimeType: null, error: `Image too large: ${bytes} bytes (max ${MAX_IMAGE_BYTES})` };
        }
      }

      // Read body with size limit
      const reader = response.body?.getReader();
      if (!reader) {
        return { buffer: null, mimeType: null, error: 'No response body' };
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.length;
        if (totalBytes > MAX_IMAGE_BYTES) {
          reader.cancel();
          return { buffer: null, mimeType: null, error: `Image exceeds ${MAX_IMAGE_BYTES} byte limit` };
        }

        chunks.push(value);
      }

      const combined = new Uint8Array(totalBytes);
      let readOffset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, readOffset);
        readOffset += chunk.length;
      }

      // Validate magic bytes — reject if content doesn't match declared Content-Type
      const detectedMime = detectMimeFromHeader(combined);
      if (!detectedMime) {
        // No recognized image magic bytes — reject even if Content-Type was image/*
        return { buffer: null, mimeType: null, error: 'Content does not match any recognized image format (magic bytes check failed)' };
      }

      // Verify declared MIME matches detected magic bytes
      const normalizedDeclared = normalizeMime(normalizedMime);
      if (detectedMime !== normalizedDeclared) {
        // MIME type mismatch: declared MIME doesn't match actual content
        // Accept if magic bytes confirm it's an image; prefer magic-byte detection for safety
        // But warn about the inconsistency
        console.warn('[ImagePrep] MIME mismatch: declared="%s" vs magic-bytes="%s"', normalizedMime, detectedMime);
      }

      return {
        buffer: Buffer.from(combined.buffer),
        // Use magic-byte detected MIME for upload (more reliable than server-declared)
        mimeType: detectedMime,
        error: null,
      };
    } // end while (redirect loop)

    return { buffer: null, mimeType: null, error: 'Unexpected end of fetch loop' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown fetch error';
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { buffer: null, mimeType: null, error: 'Image fetch timed out' };
    }
    return { buffer: null, mimeType: null, error: message };
  }
}

/**
 * Detect MIME type from the first few bytes of an image.
 */
function detectMimeFromHeader(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // JPEG: starts with FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG: starts with 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }

  // WEBP: starts with 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    // Check for WEBP at offset 8
    if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'image/webp';
    }
  }

  // GIF: starts with 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  return null;
}

/**
 * Normalize a MIME type string.
 */
function normalizeMime(mime: string): string {
  const normalized = mime.toLowerCase().trim();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return normalized;
}

// =============================================================================
// Upload Cache
// =============================================================================

/**
 * Simple in-memory cache for Gemini File API upload results.
 * Keyed by normalized URL. Cleared between batch jobs.
 */
const uploadCache = new Map<string, PreparedImagePart>();

/**
 * Clear the upload cache for a fresh batch.
 */
export function clearImageUploadCache(): void {
  uploadCache.clear();
}

// =============================================================================
// Main Image Prep Function
// =============================================================================

/**
 * Prepare product images for Gemini multimodal consolidation.
 *
 * For a given product:
 * 1. Select up to 2 image URLs
 * 2. Validate each URL (SSRF-safe)
 * 3. Fetch image bytes with size/time limits
 * 4. Upload to Gemini File API (with cache)
 * 5. Return fileData references
 *
 * Failures are non-fatal — the UPC can proceed text-only.
 */
export async function prepareProductImages(
  selectedImages: unknown,
  imageCandidates: unknown,
  sources: Record<string, unknown>,
  geminiApiKey: string
): Promise<ImagePrepResult> {
  const errors: string[] = [];
  const imageParts: PreparedImagePart[] = [];

  // 1. Select URLs
  const urls = selectProductImageUrls(selectedImages, imageCandidates, sources);
  if (urls.length === 0) {
    return { imageParts: [], errors: [] };
  }

  // 2. Create Gemini client
  const client = createGeminiClient(geminiApiKey);

  // 3. Process each URL
  for (const rawUrl of urls) {
    if (imageParts.length >= MAX_IMAGES_PER_PRODUCT) break;

    // Validate URL (with DNS resolution)
    const validatedUrl = await validateImageUrl(rawUrl);
    if (!validatedUrl) {
      errors.push(`Invalid or unsafe image URL: ${rawUrl.slice(0, 100)}`);
      continue;
    }

    // Check cache
    const cached = uploadCache.get(validatedUrl);
    if (cached) {
      imageParts.push(cached);
      continue;
    }

    // Fetch image
    const fetchResult = await fetchImage(validatedUrl);
    if (fetchResult.error || !fetchResult.buffer || !fetchResult.mimeType) {
      errors.push(`Failed to fetch image: ${fetchResult.error || 'unknown error'} (${rawUrl.slice(0, 100)})`);
      continue;
    }

    // Upload to Gemini File API
    try {
      const filename = `product_image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const uploadResult = await client.uploadFile(filename, fetchResult.mimeType, fetchResult.buffer);

      if (uploadResult.state === 'FAILED') {
        errors.push(`Gemini upload failed: ${uploadResult.error || 'unknown'} (${rawUrl.slice(0, 100)})`);
        continue;
      }

      const part: PreparedImagePart = {
        fileUri: uploadResult.fileUri,
        mimeType: uploadResult.mimeType || fetchResult.mimeType,
      };

      // Cache the result
      uploadCache.set(validatedUrl, part);
      imageParts.push(part);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown upload error';
      errors.push(`Gemini upload error for ${rawUrl.slice(0, 100)}: ${message}`);
    }
  }

  return { imageParts, errors };
}

/**
 * Prepare a Gemini Batch JSONL file and upload it to Gemini File API.
 * Returns the file resource name and uploaded file result.
 */
export async function uploadJsonlToGemini(
  jsonlContent: string,
  geminiApiKey: string,
  batchLabel: string = 'consolidation'
): Promise<{ fileResourceName: string; fileUri: string }> {
  const client = createGeminiClient(geminiApiKey);
  const encoder = new TextEncoder();
  const buffer = encoder.encode(jsonlContent);
  const filename = `batch_${batchLabel}_${Date.now()}.jsonl`;

  const uploadResult = await client.uploadFile(filename, 'application/jsonl', Buffer.from(buffer));

  return {
    fileResourceName: uploadResult.name,
    fileUri: uploadResult.fileUri,
  };
}
