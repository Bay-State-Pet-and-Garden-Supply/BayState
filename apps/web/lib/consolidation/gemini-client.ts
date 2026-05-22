/**
 * Gemini Client Abstraction
 *
 * Thin wrapper around Google Gemini Files API and Batch API.
 * Uses direct REST calls to the Gemini API for maximum control and testability.
 *
 * Key endpoints:
 *   POST https://generativelanguage.googleapis.com/upload/v1beta/files    — File upload
 *   POST https://generativelanguage.googleapis.com/v1beta/batchedRequests — Batch create
 *   GET  https://generativelanguage.googleapis.com/v1beta/{name}          — Batch status
 *   GET  https://generativelanguage.googleapis.com/v1beta/files/{name}    — Get file
 *
 * Note: Actual Gemini Batch API endpoints may differ from the ones listed above.
 * This wrapper uses the documented patterns and can be adjusted as the API stabilizes.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload';
const GEMINI_API_VERSION = 'v1beta';

// =============================================================================
// Types
// =============================================================================

export interface GeminiFileUploadResult {
  fileUri: string;
  mimeType: string;
  name: string;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  sizeBytes: string;
  expirationTime: string;
  sha256Hash?: string;
  error?: string;
}

export interface GeminiBatchCreateResult {
  name: string; // e.g. "projects/…/locations/…/batchedRequests/…"
  state: string;
  createTime: string;
  error?: { code: number; message: string };
}

export interface GeminiBatchStatusResult {
  name: string;
  state: 'STATE_UNSPECIFIED' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createTime: string;
  updateTime: string;
  completedTime?: string;
  requestCount: number;
  completedCount: number;
  failedCount: number;
  metadata?: Record<string, unknown>;
  error?: { code: number; message: string };
  outputFile?: {
    fileUri?: string;
    mimeType?: string;
  };
  errorFile?: {
    fileUri?: string;
    mimeType?: string;
  };
}

export interface GeminiBatchOutputLine {
  key: string;
  response?: {
    statusCode: number;
    body?: {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType: string; data: string };
            fileData?: { fileUri: string; mimeType: string };
          }>;
          role?: string;
        };
        finishReason?: string;
        safetyRatings?: Array<Record<string, unknown>>;
        citationMetadata?: Record<string, unknown>;
        usageMetadata?: {
          promptTokenCount: number;
          candidatesTokenCount: number;
          totalTokenCount: number;
        };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };
    error?: { code: number; message: string };
  };
}

// =============================================================================
// Client
// =============================================================================

export interface GeminiClientOptions {
  apiKey: string;
  timeoutMs?: number;
}

export class GeminiClient {
  private apiKey: string;
  private timeoutMs: number;

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  /**
   * Get the authorization headers.
   */
  private authHeaders(): Record<string, string> {
    return {
      'x-goog-api-key': this.apiKey,
    };
  }

  /**
   * Normalize a file resource name for use in REST URL path segments.
   *
   * Gemini File API resource names are of the form "files/abc123" (collection + ID).
   * When constructing URLs like GET /v1beta/files/{name}:download, the {name} is the
   * resource name including the "files/" prefix. But when using the SDK-style URL
   * pattern /v1beta/files/{id} (without the "files/" collection prefix), we need
   * to strip it to avoid double-pathing like /v1beta/files/files/abc123.
   *
   * This helper strips the "files/" prefix if present, returning just the file ID.
   *
   * @param name - The file resource name (e.g., "files/abc123" or "abc123")
   * @returns The file ID without the "files/" prefix
   */
  private normalizeFileId(name: string): string {
    if (name.startsWith('files/')) {
      return name.slice('files/'.length);
    }
    return name;
  }

  /**
   * Upload a file (image or JSONL) to the Gemini File API.
   * Files are stored temporarily (~48 hours) and returned with a fileUri for use in batch requests.
   *
   * The returned `name` field is the resource name ("files/abc123") suitable for
   * constructing REST URLs. The `fileUri` field is the full URI suitable for use
   * as the `inputFile.fileUri` in Batch API requests.
   *
   * Upload flow:
   * 1. POST to upload endpoint with metadata to initiate the upload
   * 2. Upload the file bytes
   * 3. Poll until file state is ACTIVE (for images) or return immediately (for JSONL)
   */
  async uploadFile(
    filename: string,
    mimeType: string,
    fileBuffer: Buffer | Uint8Array
  ): Promise<GeminiFileUploadResult> {
    const url = `${GEMINI_UPLOAD_BASE}/${GEMINI_API_VERSION}/files?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Step 1: Initiate resumable upload with metadata
      // Per Gemini File API docs (https://ai.google.dev/api/files):
      //   - Content-Type must be 'application/json' for the metadata request
      //   - X-Goog-Upload-Protocol: resumable
      //   - X-Goog-Upload-Command: start
      //   - X-Goog-Upload-Header-Content-Length: file size in bytes
      //   - X-Goog-Upload-Header-Content-Type: actual MIME of the file being uploaded
      //   - Body: JSON with file metadata (displayName, mimeType)
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(fileBuffer.length),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          ...this.authHeaders(),
        },
        body: JSON.stringify({
          file: {
            displayName: filename,
            mimeType,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini upload initiation failed (${response.status}): ${errorText.slice(0, 500)}`);
      }

      // Get the upload URL from the response headers
      const uploadUrl = response.headers.get('X-Goog-Upload-URL');
      if (!uploadUrl) {
        // Try direct upload approach if resumable isn't supported
        return await this.directUploadFile(filename, mimeType, fileBuffer);
      }

      // Step 2: Upload file bytes
      const uploadResponse = await fetch(uploadUrl!, {
        method: 'POST',
        headers: {
          'Content-Length': String(fileBuffer.length),
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0',
          ...this.authHeaders(),
        },
        body: fileBuffer as BodyInit,
        signal: controller.signal,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => '');
        throw new Error(`Gemini file upload failed (${uploadResponse.status}): ${errorText.slice(0, 500)}`);
      }

      const result = (await uploadResponse.json()) as GeminiFileUploadResult;

      // Step 3: Poll until ACTIVE for image files
      // JSONL or text files may become ACTIVE immediately
      if (result.state === 'PROCESSING' && mimeType.startsWith('image/')) {
        return await this.pollFileUntilActive(result.name, result);
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Simplified direct upload (fallback if resumable isn't available).
   * Uses multipart/related with boundary specified in Content-Type header.
   */
  private async directUploadFile(
    filename: string,
    mimeType: string,
    fileBuffer: Buffer | Uint8Array
  ): Promise<GeminiFileUploadResult> {
    const url = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.apiKey}`;

    const multipartBody = this.buildMultipartRelatedBody(filename, mimeType, fileBuffer);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': multipartBody.type,
          ...this.authHeaders(),
        },
        body: multipartBody,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini direct upload failed (${response.status}): ${errorText.slice(0, 500)}`);
      }

      const result = (await response.json()) as GeminiFileUploadResult;

      if (result.state === 'PROCESSING' && mimeType.startsWith('image/')) {
        return await this.pollFileUntilActive(result.name, result);
      }

      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Build a multipart/related body for the direct upload approach.
   * Properly includes the boundary in both the Content-Type header and the body.
   *
   * Per Gemini File API docs, the multipart upload body format is:
   *   --boundary
   *   Content-Type: application/json; charset=utf-8
   *   
   *   {"file": {"displayName": "...", "mimeType": "..."}}
   *   --boundary
   *   Content-Type: image/jpeg
   *   
   *   <binary data>
   *   --boundary--
   */
  private buildMultipartRelatedBody(
    filename: string,
    mimeType: string,
    fileBuffer: Buffer | Uint8Array
  ): Blob {
    const boundary = `gemini-upload-${Date.now()}`;

    const metadata = JSON.stringify({
      file: {
        displayName: filename,
        mimeType,
      },
    });

    const encoder = new TextEncoder();
    const header1 = encoder.encode(`--${boundary}\r\n` +
      'Content-Type: application/json; charset=utf-8\r\n\r\n' +
      `${metadata}\r\n`);
    const header2 = encoder.encode(`--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`);
    const trailer = encoder.encode(`\r\n--${boundary}--\r\n`);

    const totalLength = header1.length + header2.length + fileBuffer.length + trailer.length;
    const combined = new Uint8Array(totalLength);
    let pos = 0;
    combined.set(header1, pos); pos += header1.length;
    combined.set(header2, pos); pos += header2.length;
    combined.set(fileBuffer, pos); pos += fileBuffer.length;
    combined.set(trailer, pos);

    return new Blob([combined], { type: `multipart/related; boundary=${boundary}` });
  }

  /**
   * Poll a file until its state is ACTIVE or FAILED.
   * Returns the file result with the final state.
   */
  async pollFileUntilActive(
    fileResourceName: string,
    currentResult?: GeminiFileUploadResult
  ): Promise<GeminiFileUploadResult> {
    let result = currentResult;
    const maxAttempts = 30;
    const pollIntervalMs = 1_000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (result && result.state === 'ACTIVE') {
        return result;
      }
      if (result && result.state === 'FAILED') {
        return result;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      result = await this.getFile(fileResourceName);
    }

    return result ?? { fileUri: '', mimeType: '', name: fileResourceName, state: 'FAILED', sizeBytes: '0', expirationTime: '', error: 'File polling timed out' };
  }

  /**
   * Get file metadata from Gemini File API.
   *
   * @param fileResourceName - File resource name ("files/abc123" or just "abc123")
   */
  async getFile(fileResourceName: string): Promise<GeminiFileUploadResult> {
    const fileId = this.normalizeFileId(fileResourceName);
    const url = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/files/${fileId}?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.authHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini get file failed (${response.status}): ${errorText.slice(0, 500)}`);
      }

      return (await response.json()) as GeminiFileUploadResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Create a Gemini Batch API job.
   *
   * The batch request JSONL should first be uploaded via uploadFile(), then
   * this method is called with the uploaded file's fileUri (the full URI returned
   * by the upload, e.g. "https://generativelanguage.googleapis.com/v1beta/files/abc123").
   *
   * Per Gemini Batch API documentation:
   *   POST https://generativelanguage.googleapis.com/v1beta/batchedRequests
   *   Body: {
   *     inputFile: { fileUri: string, mimeType: string },
   *     model: string,  // e.g. "models/gemini-3.5-flash"
   *     generationConfig: { temperature, maxOutputTokens, ... },
   *   }
   *
   * The `fileUri` field in `inputFile` should be the full file URI from the upload response,
   * NOT the resource name ("files/abc123").
   *
   * The JSONL file uploaded via File API should contain one JSON object per line:
   *   {"key": "", "request": { "model": "...", "contents": [...], ... }}
   */
  async createBatch(
    inputFileUri: string,
    model: string,
    config?: {
      temperature?: number;
      maxOutputTokens?: number;
    }
  ): Promise<GeminiBatchCreateResult> {
    const url = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/batchedRequests?key=${this.apiKey}`;

    const body: Record<string, unknown> = {
      inputFile: {
        fileUri: inputFileUri,
        mimeType: 'application/jsonl',
      },
      model: model.startsWith('models/') ? model : `models/${model}`,
    };

    if (config) {
      const generationConfig: Record<string, unknown> = {};
      if (config.temperature !== undefined) generationConfig.temperature = config.temperature;
      if (config.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = config.maxOutputTokens;
      body.generationConfig = generationConfig;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini batch create failed (${response.status}): ${errorText.slice(0, 1000)}`);
      }

      return (await response.json()) as GeminiBatchCreateResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get the status of a Gemini Batch job.
   * The name is the full resource name returned by createBatch().
   */
  async getBatchStatus(batchResourceName: string): Promise<GeminiBatchStatusResult> {
    // The name returned by createBatch() includes the full path like 
    // "projects/…/locations/…/batchedRequests/…"
    const url = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/${batchResourceName}?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.authHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini batch status failed (${response.status}): ${errorText.slice(0, 500)}`);
      }

      return (await response.json()) as GeminiBatchStatusResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Cancel a Gemini Batch job.
   */
  async cancelBatch(batchResourceName: string): Promise<{ success: boolean; error?: string }> {
    const url = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/${batchResourceName}:cancel?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.authHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return { success: false, error: `Gemini batch cancel failed (${response.status}): ${errorText.slice(0, 500)}` };
      }

      return { success: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Download file content from Gemini File API.
   * Used to download batch output JSONL files.
   *
   * @param fileResourceName - File resource name ("files/abc123") — the "files/"
   *   prefix is stripped internally to avoid double-pathing in the REST URL.
   */
  async downloadFileText(fileResourceName: string): Promise<string> {
    const fileId = this.normalizeFileId(fileResourceName);
    const url = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/files/${fileId}:download?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.authHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini file download failed (${response.status}): ${errorText.slice(0, 500)}`);
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse Gemini batch output JSONL text into per-UPC results.
   * Each line should be a JSON object with a "key" field matching the UPC.
   */
  parseBatchOutput(jsonlText: string): GeminiBatchOutputLine[] {
    const lines = jsonlText.trim().split('\n').filter(Boolean);
    const results: GeminiBatchOutputLine[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as GeminiBatchOutputLine;
        results.push(parsed);
      } catch {
        console.warn('[GeminiClient] Failed to parse batch output line:', line.slice(0, 200));
      }
    }

    return results;
  }

  /**
   * Create a cached content resource containing the system prompt.
   *
   * @param model - Model name (e.g. "gemini-3.5-flash")
   * @param systemPrompt - System prompt text to cache
   * @param ttlSeconds - Time to live in seconds (default 86400s / 24h)
   * @param displayName - Optional display name
   */
  async createCache(
    model: string,
    systemPrompt: string,
    ttlSeconds: number = 86400,
    displayName?: string
  ): Promise<{ name: string; expireTime: string }> {
    const url = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/cachedContents?key=${this.apiKey}`;

    const normalizedModel = model.startsWith('models/') ? model : `models/${model}`;
    const body = {
      model: normalizedModel,
      displayName: displayName ?? `cache-${Date.now()}`,
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      ttl: `${ttlSeconds}s`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini cache create failed (${response.status}): ${errorText.slice(0, 1000)}`);
      }

      const result = await response.json() as { name: string; expireTime: string };
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Delete a cached content resource.
   *
   * @param cacheResourceName - Cache resource name (e.g., "cachedContents/abc123")
   */
  async deleteCache(cacheResourceName: string): Promise<{ success: boolean; error?: string }> {
    const url = `${GEMINI_API_BASE}/${GEMINI_API_VERSION}/${cacheResourceName}?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.authHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return { success: false, error: `Gemini cache delete failed (${response.status}): ${errorText.slice(0, 500)}` };
      }

      return { success: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Clean up — cancel any pending batch, etc.
   */
  async cleanup(): Promise<void> {
    // No client resources to clean up currently
  }
}

/**
 * Create a GeminiClient instance.
 */
export function createGeminiClient(apiKey: string): GeminiClient {
  return new GeminiClient({ apiKey });
}
