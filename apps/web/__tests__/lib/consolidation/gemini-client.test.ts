import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { GeminiClient } from '@/lib/consolidation/gemini-client';

// Mock fetch globally
const mockFetch = jest.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
global.fetch = mockFetch as unknown as typeof global.fetch;

function createClient(): GeminiClient {
  return new GeminiClient({ apiKey: 'test-gemini-key-abc' });
}

describe('GeminiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFile - resumable upload', () => {
    it('sends correct initiate request for resumable upload', async () => {
      const client = createClient();
      const fileBuffer = Buffer.from('fake-image-bytes');
      
      // Step 1: Initiate returns upload URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['X-Goog-Upload-URL', 'https://example.com/upload-session']]),
        json: async () => ({}),
      } as unknown as Response);

      // Step 2: Upload bytes succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'files/abc123',
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
          mimeType: 'image/jpeg',
          state: 'ACTIVE',
          sizeBytes: '15',
          expirationTime: '2026-05-22T00:00:00Z',
        }),
      } as unknown as Response);

      await client.uploadFile('test.jpg', 'image/jpeg', fileBuffer);

      // Check initiate request
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const initiateCall = mockFetch.mock.calls[0];
      const initiateUrl = initiateCall[0] as string;
      const initiateOpts = initiateCall[1] as RequestInit;

      expect(initiateUrl).toContain('https://generativelanguage.googleapis.com/upload/v1beta/files');
      expect(initiateUrl).toContain('key=test-gemini-key-abc');
      expect(initiateOpts.method).toBe('POST');
      
      // Check headers exist — the GeminiClient passes them as a plain object
      // Bun may normalize header keys to lowercase internally
      const initHeaders = initiateOpts.headers as Record<string, string>;
      expect(initHeaders).toBeDefined();
      const initKeys = Object.keys(initHeaders).map(k => k.toLowerCase());
      expect(initKeys).toContain('content-type');
      expect(initKeys).toContain('x-goog-upload-protocol');
      expect(initKeys).toContain('x-goog-upload-command');
      expect(initKeys).toContain('x-goog-upload-header-content-length');
      expect(initKeys).toContain('x-goog-upload-header-content-type');
      // Verify values
      expect(Object.values(initHeaders).join(' ')).toContain('application/json');
      expect(Object.values(initHeaders).join(' ')).toContain('resumable');
      expect(Object.values(initHeaders).join(' ')).toContain('start');
      expect(Object.values(initHeaders).join(' ')).toContain('image/jpeg');
      
      const body = JSON.parse(initiateOpts.body as string);
      expect(body.file.displayName).toBe('test.jpg');
      expect(body.file.mimeType).toBe('image/jpeg');

      // Check upload bytes request
      const uploadCall = mockFetch.mock.calls[1];
      const uploadUrl = uploadCall[0] as string;
      const uploadOpts = uploadCall[1] as RequestInit;

      expect(uploadUrl).toBe('https://example.com/upload-session');
      expect(uploadOpts.method).toBe('POST');
      
      const upHeaders = uploadOpts.headers as Record<string, string>;
      const upKeys = Object.keys(upHeaders).map(k => k.toLowerCase());
      expect(upKeys).toContain('content-length');
      expect(upKeys).toContain('x-goog-upload-command');
      expect(upKeys).toContain('x-goog-upload-offset');
      expect(Object.values(upHeaders).join(' ')).toContain('upload, finalize');
      expect(Object.values(upHeaders).join(' ')).toContain('0');
    });

    it('falls back to direct multipart upload when no upload URL header', async () => {
      const client = createClient();
      const fileBuffer = Buffer.from('fake-image-bytes');

      // Initiate returns no upload URL -> fallback to direct upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(), // No X-Goog-Upload-URL
        json: async () => ({
          name: 'files/abc123',
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
          mimeType: 'image/jpeg',
          state: 'ACTIVE',
          sizeBytes: '15',
          expirationTime: '2026-05-22T00:00:00Z',
        }),
      } as unknown as Response);
      // Direct upload makes its own fetch call — mock that response too
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'files/abc123',
          fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123',
          mimeType: 'image/jpeg',
          state: 'ACTIVE',
          sizeBytes: '15',
          expirationTime: '2026-05-22T00:00:00Z',
        }),
      } as unknown as Response);

      await client.uploadFile('test.jpg', 'image/jpeg', fileBuffer);

      // Direct upload uses multipart/related
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondCall = mockFetch.mock.calls[1]; // The second call is the direct upload
      const url = secondCall[0] as string;
      const opts = secondCall[1] as RequestInit;
      expect(url).toContain('upload/v1beta/files');
      expect((opts as RequestInit).method).toBe('POST');
      
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toContain('multipart/related');
      expect(headers['Content-Type']).toContain('boundary=');
      
      // Body should be a Blob (multipart)
      expect((opts as RequestInit).body).toBeInstanceOf(Blob);
    });
  });

  describe('createBatch', () => {
    it('sends correct POST request with file URI', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'projects/test/locations/us-central1/batchedRequests/xyz789',
          state: 'PENDING',
          createTime: '2026-05-20T00:00:00Z',
        }),
      } as unknown as Response);

      await client.createBatch(
        'https://generativelanguage.googleapis.com/v1beta/files/abc123', // fileUri (full URI)
        'gemini-3.5-flash',
        { temperature: 0.1, maxOutputTokens: 2048 },
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1beta/batchedRequests');
      expect(url).toContain('key=test-gemini-key-abc');
      expect((opts as RequestInit).method).toBe('POST');
      
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer test-gemini-key-abc');

      const body = JSON.parse((opts as RequestInit).body as string);
      // inputFile.fileUri must be the full file URI, not a resource name
      expect(body.inputFile.fileUri).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123');
      expect(body.inputFile.mimeType).toBe('application/jsonl');
      expect(body.model).toBe('models/gemini-3.5-flash');
      expect(body.generationConfig.temperature).toBe(0.1);
      expect(body.generationConfig.maxOutputTokens).toBe(2048);
    });

    it('does not double-prefix models/ if already present', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'projects/...', state: 'PENDING', createTime: '' }),
      } as unknown as Response);

      await client.createBatch('file://test', 'models/gemini-3.5-flash');

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.model).toBe('models/gemini-3.5-flash'); // not models/models/...
    });

    it('sends request without generationConfig when config is omitted', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'projects/...', state: 'PENDING', createTime: '' }),
      } as unknown as Response);

      await client.createBatch('file://test', 'gemini-3.5-flash');

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.generationConfig).toBeUndefined();
    });
  });

  describe('getBatchStatus', () => {
    it('sends correct GET request', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'projects/test/locations/us-central1/batchedRequests/xyz789',
          state: 'ACTIVE',
          createTime: '2026-05-20T00:00:00Z',
          updateTime: '2026-05-20T01:00:00Z',
          requestCount: 10,
          completedCount: 5,
          failedCount: 0,
        }),
      } as unknown as Response);

      await client.getBatchStatus('projects/test/locations/us-central1/batchedRequests/xyz789');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/projects/test/locations/us-central1/batchedRequests/xyz789?key=test-gemini-key-abc'
      );
      expect((opts as RequestInit).method).toBe('GET');
      
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-gemini-key-abc');
    });

    it('throws on non-ok response', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      } as unknown as Response);

      await expect(
        client.getBatchStatus('projects/test/batches/nonexistent')
      ).rejects.toThrow(/Gemini batch status failed \(404\)/i);
    });
  });

  describe('cancelBatch', () => {
    it('sends correct POST request to :cancel endpoint', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response);

      await client.cancelBatch('projects/test/locations/us-central1/batchedRequests/xyz789');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/projects/test/locations/us-central1/batchedRequests/xyz789:cancel?key=test-gemini-key-abc'
      );
      expect((opts as RequestInit).method).toBe('POST');
      
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-gemini-key-abc');
    });

    it('returns success false on non-ok response', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      } as unknown as Response);

      const result = await client.cancelBatch('projects/test/batches/xyz789');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Gemini batch cancel failed \(500\)/i);
    });
  });

  describe('getFile', () => {
    it('normalizes files/ prefix in resource name', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'files/abc123',
          state: 'ACTIVE',
          mimeType: 'image/jpeg',
          sizeBytes: '1000',
          expirationTime: '2026-05-22T00:00:00Z',
        }),
      } as unknown as Response);

      // Call with resource name including "files/" prefix
      await client.getFile('files/abc123');

      // The URL should NOT have double "files/"
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1beta/files/abc123');
      expect(url).not.toContain('/files/files/');
    });

    it('works with bare file ID (no prefix)', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'files/abc123',
          state: 'ACTIVE',
          mimeType: 'image/jpeg',
          sizeBytes: '1000',
          expirationTime: '2026-05-22T00:00:00Z',
        }),
      } as unknown as Response);

      await client.getFile('abc123');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1beta/files/abc123');
    });
  });

  describe('downloadFileText', () => {
    it('normalizes files/ prefix and uses correct download URL', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{"key":"SKU1","text":"Consolidated result"}',
      } as unknown as Response);

      await client.downloadFileText('files/abc123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      // Should NOT have /files/files/
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?key=test-gemini-key-abc'
      );
      expect((opts as RequestInit).method).toBe('GET');
      
      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-gemini-key-abc');
    });

    it('works with bare file ID', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
      } as unknown as Response);

      await client.downloadFileText('abc123');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1beta/files/abc123:download');
    });
  });

  describe('pollFileUntilActive', () => {
    it('returns immediately if already ACTIVE', async () => {
      const client = createClient();
      
      const result = await client.pollFileUntilActive('files/abc123', {
        name: 'files/abc123',
        fileUri: 'https://...',
        mimeType: 'image/jpeg',
        state: 'ACTIVE',
        sizeBytes: '100',
        expirationTime: '2026-05-22T00:00:00Z',
      });

      expect(result.state).toBe('ACTIVE');
      // Should not have attempted any polling requests
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns on FAILED state without polling', async () => {
      const client = createClient();
      
      const result = await client.pollFileUntilActive('files/abc123', {
        name: 'files/abc123',
        fileUri: '',
        mimeType: '',
        state: 'FAILED',
        sizeBytes: '0',
        expirationTime: '',
      });

      expect(result.state).toBe('FAILED');
    });
  });

  describe('parseBatchOutput', () => {
    it('parses JSONL text correctly', () => {
      const client = createClient();
      const jsonl = [
        '{"key":"SKU1","text":"Result 1","usage":{"promptTokenCount":100,"candidatesTokenCount":50,"totalTokenCount":150}}',
        '{"key":"SKU2","text":"Result 2","usage":{"promptTokenCount":50,"candidatesTokenCount":25,"totalTokenCount":75}}',
      ].join('\n');

      const results = client.parseBatchOutput(jsonl);
      expect(results).toHaveLength(2);
      expect(results[0].key).toBe('SKU1');
    });

    it('skips malformed lines', () => {
      const client = createClient();
      const jsonl = [
        '{"key":"SKU1","text":"OK"}',
        'not-json',
        '{"key":"SKU2","text":"Also OK"}',
      ].join('\n');

      const results = client.parseBatchOutput(jsonl);
      expect(results).toHaveLength(2);
    });
  });

  describe('createCache', () => {
    it('sends correct POST request to cachedContents with systemPrompt', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'cachedContents/abc123cache',
          expireTime: '2026-05-21T00:00:00Z',
        }),
      } as unknown as Response);

      const result = await client.createCache(
        'gemini-3.5-flash',
        'You are a helpful assistant',
        10800,
        'my-test-display-name'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1beta/cachedContents');
      expect(url).toContain('key=test-gemini-key-abc');
      expect((opts as RequestInit).method).toBe('POST');

      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer test-gemini-key-abc');

      const body = JSON.parse((opts as RequestInit).body as string);
      expect(body.model).toBe('models/gemini-3.5-flash');
      expect(body.displayName).toBe('my-test-display-name');
      expect(body.systemInstruction.parts[0].text).toBe('You are a helpful assistant');
      expect(body.ttl).toBe('10800s');

      expect(result.name).toBe('cachedContents/abc123cache');
      expect(result.expireTime).toBe('2026-05-21T00:00:00Z');
    });

    it('throws on non-ok response', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      } as unknown as Response);

      await expect(
        client.createCache('gemini-3.5-flash', 'system prompt')
      ).rejects.toThrow(/Gemini cache create failed \(400\)/i);
    });
  });

  describe('deleteCache', () => {
    it('sends correct DELETE request to resource endpoint', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response);

      const result = await client.deleteCache('cachedContents/abc123cache');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/cachedContents/abc123cache?key=test-gemini-key-abc'
      );
      expect((opts as RequestInit).method).toBe('DELETE');

      const headers = (opts as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-gemini-key-abc');
      expect(result.success).toBe(true);
    });

    it('returns success false on non-ok response', async () => {
      const client = createClient();
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Cache not found',
      } as unknown as Response);

      const result = await client.deleteCache('cachedContents/nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Gemini cache delete failed \(404\)/i);
    });
  });
});

