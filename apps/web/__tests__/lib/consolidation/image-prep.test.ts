import { describe, expect, it, jest, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { selectProductImageUrls, clearImageUploadCache, prepareProductImages, type PreparedImagePart } from '@/lib/consolidation/image-prep';

// =============================================================================
// Mock setup
// =============================================================================

// Mock fetch globally
const mockFetch = jest.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
global.fetch = mockFetch as unknown as typeof global.fetch;

// Create DNS lookup spy on the actual dns/promises module
let mockDnsLookup: ReturnType<typeof jest.spyOn>;

beforeAll(() => {
  const dnsPromises = jest.requireActual('dns/promises') as { lookup: (...args: unknown[]) => unknown };
  mockDnsLookup = jest.spyOn(dnsPromises, 'lookup' as never);
});

afterAll(() => {
  if (mockDnsLookup) mockDnsLookup.mockRestore();
});

// =============================================================================
// Helpers
// =============================================================================

function mockFetchResponse(
  status: number,
  body: string | Buffer | Uint8Array,
  contentType: string,
  headers?: Record<string, string>
): void {
  const responseHeaders = new Map(Object.entries({
    'content-type': contentType,
    ...headers,
  }));

  mockFetch.mockResolvedValueOnce({
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => responseHeaders.get(name.toLowerCase()) ?? null,
    },
    body: {
      getReader: () => {
        const bytes = typeof body === 'string'
          ? new TextEncoder().encode(body)
          : body instanceof Buffer
            ? new Uint8Array(body)
            : body;
        let read = false;
        return {
          read: async () => {
            if (read) return { done: true, value: undefined };
            read = true;
            return { done: false, value: bytes };
          },
          cancel: jest.fn(),
        };
      },
    },
  } as unknown as Response);
}

/** Mock a Gemini File API upload initiation response (resumable upload) */
function mockGeminiUploadInitiation(uploadUrl: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Map([['x-goog-upload-url', uploadUrl]]),
    json: async () => ({}),
  } as unknown as Response);
}

/** Mock a Gemini File API upload bytes response */
function mockGeminiUploadBytes(
  result: {
    name: string;
    fileUri: string;
    mimeType: string;
    state: string;
    sizeBytes: string;
    expirationTime: string;
  }
): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => result,
  } as unknown as Response);
}

function createJpegBuffer(): Buffer {
  const buf = Buffer.alloc(512);
  buf[0] = 0xFF; buf[1] = 0xD8; buf[2] = 0xFF; buf[3] = 0xE0;
  return buf;
}

// =============================================================================
// Tests
// =============================================================================

describe('Image Prep', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearImageUploadCache();
    // Default DNS: resolve to a public IP (any reachable address)
    mockDnsLookup.mockReset();
    mockDnsLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
  });

  describe('selectProductImageUrls', () => {
    const mockSources = {
      enriched: {
        images: ['https://example.com/img3.jpg', 'https://example.com/img4.jpg'],
        title: 'Test Product',
      },
    };

    it('prioritizes selected_images and fills remaining slots from candidates', () => {
      const urls = selectProductImageUrls(
        ['https://selected.com/img1.jpg'], ['https://candidate.com/img2.jpg'], mockSources,
      );
      expect(urls[0]).toBe('https://selected.com/img1.jpg');
      expect(urls.length).toBeLessThanOrEqual(2);
    });

    it('selects only from selected_images when enough are provided', () => {
      const urls = selectProductImageUrls(
        ['https://sel.com/1.jpg', 'https://sel.com/2.jpg'], ['https://cand.com/3.jpg'], mockSources,
      );
      expect(urls.length).toBe(2);
      expect(urls[0]).toBe('https://sel.com/1.jpg');
      expect(urls[1]).toBe('https://sel.com/2.jpg');
    });

    it('falls back to image_candidates when no selected_images', () => {
      const urls = selectProductImageUrls(
        null, ['https://candidate.com/img1.jpg', 'https://candidate.com/img2.jpg'], {},
      );
      expect(urls.length).toBe(2);
      expect(urls[0]).toBe('https://candidate.com/img1.jpg');
    });

    it('falls back to source images when no selected/candidates', () => {
      const urls = selectProductImageUrls(null, null, mockSources);
      expect(urls.length).toBe(2);
      expect(urls[0]).toBe('https://example.com/img3.jpg');
    });

    it('never returns more than 2 URLs', () => {
      const urls = selectProductImageUrls(
        ['https://sel.com/1.jpg', 'https://sel.com/2.jpg', 'https://sel.com/3.jpg'],
        ['https://cand.com/4.jpg'], mockSources,
      );
      expect(urls.length).toBe(2);
    });

    it('handles structured selected_images (array of objects with url field)', () => {
      const urls = selectProductImageUrls(
        [{ url: 'https://obj.com/img1.jpg' }, { url: 'https://obj.com/img2.jpg' }], null, {},
      );
      expect(urls.length).toBe(2);
      expect(urls[0]).toBe('https://obj.com/img1.jpg');
    });

    it('returns empty array when no images available', () => {
      const urls = selectProductImageUrls(null, null, {});
      expect(urls.length).toBe(0);
    });
  });

  describe('SSRF validation via prepareProductImages', () => {
    const geminiApiKey = 'test-key-123';

    function setupGeminiUploadSuccess(mimeType: string = 'image/jpeg'): void {
      // Mock responses in CONSUMPTION order:
      // 1. Image fetch (handled by mockFetchResponse in the test)
      // 2. Upload initiation (resumable): POST -> returns upload URL
      mockGeminiUploadInitiation('https://example.com/upload-session/xyz');
      // 3. Upload bytes: POST -> returns ACTIVE file
      mockGeminiUploadBytes({
        name: 'files/abc123',
        fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
        mimeType,
        state: 'ACTIVE',
        sizeBytes: '512',
        expirationTime: new Date(Date.now() + 86400000).toISOString(),
      });
    }

    it('rejects loopback IPv4 (127.0.0.1)', async () => {
      const result = await prepareProductImages(['https://127.0.0.1/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/unsafe/i);
    });

    it('rejects private IPv4 (10.x.x.x)', async () => {
      const result = await prepareProductImages(['https://10.0.0.1/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects private IPv4 (192.168.x.x)', async () => {
      const result = await prepareProductImages(['https://192.168.1.1/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects localhost hostname', async () => {
      const result = await prepareProductImages(['https://localhost/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects CGNAT range (100.64.x.x)', async () => {
      const result = await prepareProductImages(['https://100.64.0.1/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects link-local IPv4 (169.254.x.x)', async () => {
      const result = await prepareProductImages(['https://169.254.1.1/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects IPv6 loopback (::1)', async () => {
      const result = await prepareProductImages(['https://[::1]/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects IPv4-mapped IPv6 dotted form (::ffff:127.0.0.1)', async () => {
      const result = await prepareProductImages(['https://[::ffff:127.0.0.1]/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects IPv4-mapped IPv6 hex form (::ffff:7f00:1)', async () => {
      const result = await prepareProductImages(['https://[::ffff:7f00:1]/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects domain resolving to private IP via DNS', async () => {
      mockDnsLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      const result = await prepareProductImages(
        ['https://attacker.internal-network/malicious.jpg'], null, {}, geminiApiKey,
      );
      expect(result.imageParts.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects domain when DNS resolution fails', async () => {
      mockDnsLookup.mockRejectedValue(new Error('ENOTFOUND — test'));
      const result = await prepareProductImages(
        ['https://nonexistent-domain-xyz.com/img.jpg'], null, {}, geminiApiKey,
      );
      expect(result.imageParts.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects redirect target to private IP', async () => {
      // First fetch is a 302 redirect
      mockFetch.mockResolvedValueOnce({
        status: 302, ok: false,
        headers: { get: (name: string) => name.toLowerCase() === 'location' ? 'https://192.168.1.1/evil.jpg' : null },
        body: null,
      } as unknown as Response);
      const result = await prepareProductImages(
        ['https://legitimate-cdn.com/redirect.jpg'], null, {}, geminiApiKey,
      );
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects non-image MIME type', async () => {
      mockFetchResponse(200, '<html>not an image</html>', 'text/html');
      const result = await prepareProductImages(['https://cdn.example.com/fake.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].toLowerCase()).toMatch(/content-type|non-image|rejected/);
    });

    it('rejects content with no recognized magic bytes', async () => {
      mockFetchResponse(200, 'This is not an image file content at all!', 'image/jpeg');
      const result = await prepareProductImages(['https://cdn.example.com/fake.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].toLowerCase()).toMatch(/magic|image format|bytes/);
    });

    it('accepts valid JPEG', async () => {
      // Setup fetch responses in consumption order:
      // 1. Image fetch
      mockFetchResponse(200, createJpegBuffer(), 'image/jpeg');
      // 2. Gemini upload initiation + bytes
      setupGeminiUploadSuccess('image/jpeg');
      const result = await prepareProductImages(['https://cdn.example.com/valid.jpg'], null, {}, geminiApiKey);
      expect(result.errors).toEqual([]);
      expect(result.imageParts.length).toBe(1);
      expect(result.imageParts[0].mimeType).toBe('image/jpeg');
    });

    it('accepts valid PNG', async () => {
      const png = Buffer.alloc(512);
      png[0] = 0x89; png[1] = 0x50; png[2] = 0x4E; png[3] = 0x47;
      mockFetchResponse(200, png, 'image/png');
      setupGeminiUploadSuccess('image/png');
      const result = await prepareProductImages(['https://cdn.example.com/valid.png'], null, {}, geminiApiKey);
      expect(result.errors).toEqual([]);
      expect(result.imageParts.length).toBe(1);
    });

    it('accepts valid WEBP', async () => {
      const webp = Buffer.alloc(20);
      webp[0] = 0x52; webp[1] = 0x49; webp[2] = 0x46; webp[3] = 0x46;
      webp[8] = 0x57; webp[9] = 0x45; webp[10] = 0x42; webp[11] = 0x50;
      mockFetchResponse(200, webp, 'image/webp');
      setupGeminiUploadSuccess('image/webp');
      const result = await prepareProductImages(['https://cdn.example.com/valid.webp'], null, {}, geminiApiKey);
      expect(result.errors).toEqual([]);
      expect(result.imageParts.length).toBe(1);
    });

    it('gracefully handles fetch failure (text-only fallback)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await prepareProductImages(['https://cdn.example.com/unreachable.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('handles timeout gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));
      const result = await prepareProductImages(['https://cdn.example.com/slow.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects URLs with embedded credentials', async () => {
      const result = await prepareProductImages(['https://user:pass@cdn.example.com/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });

    it('rejects non-http/https protocols', async () => {
      const result = await prepareProductImages(['ftp://cdn.example.com/img.jpg'], null, {}, geminiApiKey);
      expect(result.imageParts.length).toBe(0);
    });
  });
});
