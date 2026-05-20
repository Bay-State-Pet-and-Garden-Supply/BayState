import { describe, expect, it } from '@jest/globals';
import { buildGeminiRequest, createGeminiBatchJsonl, parseGeminiBatchOutputLine } from '@/lib/consolidation/multimodal-prompt-builder';
import type { PreparedImagePart } from '@/lib/consolidation/image-prep';
import type { ProductSource } from '@/lib/consolidation/types';
import { generateSystemPrompt, buildUserPrompt } from '@/lib/consolidation/prompt-builder';

jest.mock('@/lib/consolidation/prompt-builder', () => ({
  ...jest.requireActual('@/lib/consolidation/prompt-builder'),
  // We use the real implementations since they're pure functions
}));

jest.mock('@/lib/product-sources', () => ({
  normalizeProductSources: (sources: unknown) => sources as Record<string, unknown>,
  normalizeImageUrl: (url: string) => url,
}));

describe('Gemini Multimodal Prompt Builder', () => {
  describe('buildGeminiRequest', () => {
    it('builds a request with system instruction, text, and two images', () => {
      const sku = 'SKU-001';
      const systemPrompt = 'You are a consolidation assistant.';
      const userPrompt = 'Consolidate this product: {"sku":"SKU-001"}';
      const imageParts: PreparedImagePart[] = [
        { fileUri: 'files/image1', mimeType: 'image/jpeg' },
        { fileUri: 'files/image2', mimeType: 'image/png' },
      ];

      const request = buildGeminiRequest(sku, systemPrompt, userPrompt, imageParts, 'gemini-3.5-flash');

      expect(request.key).toBe('SKU-001');
      expect(request.request.model).toBe('models/gemini-3.5-flash');
      expect(request.request.systemInstruction!.parts[0].text).toBe(systemPrompt);
      expect(request.request.contents[0].role).toBe('user');

      // First part should be text
      expect(request.request.contents[0].parts[0].text).toBe(userPrompt);

      // Next two parts should be image fileData
      expect(request.request.contents[0].parts[1].fileData?.fileUri).toBe('files/image1');
      expect(request.request.contents[0].parts[1].fileData?.mimeType).toBe('image/jpeg');
      expect(request.request.contents[0].parts[2].fileData?.fileUri).toBe('files/image2');
      expect(request.request.contents[0].parts[2].fileData?.mimeType).toBe('image/png');

      // JSON response enforcement
      expect(request.request.generationConfig.responseMimeType).toBe('application/json');
      expect(request.request.generationConfig.temperature).toBe(0.1);
    });

    it('handles zero image parts (text-only)', () => {
      const request = buildGeminiRequest('SKU-002', 'system', 'text', [], 'gemini-3.5-flash');

      expect(request.request.contents[0].parts.length).toBe(1);
      expect(request.request.contents[0].parts[0].text).toBe('text');
    });

    it('caps at 2 images even if more are provided', () => {
      const imageParts: PreparedImagePart[] = [
        { fileUri: 'files/img1', mimeType: 'image/jpeg' },
        { fileUri: 'files/img2', mimeType: 'image/jpeg' },
        { fileUri: 'files/img3', mimeType: 'image/jpeg' },
      ];

      const request = buildGeminiRequest('SKU-003', 'system', 'text', imageParts, 'gemini-3.5-flash');

      // 1 text + 2 images max
      expect(request.request.contents[0].parts.length).toBe(3);
    });

    it('no inline base64 data in the request', () => {
      const imageParts: PreparedImagePart[] = [
        { fileUri: 'files/img1', mimeType: 'image/jpeg' },
      ];

      const request = buildGeminiRequest('SKU-004', 'system', 'text', imageParts, 'gemini-3.5-flash');

      const json = JSON.stringify(request);
      expect(json).not.toContain('base64');
      expect(json).not.toContain('inlineData');
    });

    it('sets cachedContent and omits systemInstruction when cachedContent config is provided', () => {
      const request = buildGeminiRequest('SKU-001', 'system prompt text', 'user text', [], 'gemini-3.5-flash', {
        cachedContent: 'cachedContents/my-cache-id',
      });

      expect(request.request.cachedContent).toBe('cachedContents/my-cache-id');
      expect(request.request.systemInstruction).toBeUndefined();
    });
  });

  describe('createGeminiBatchJsonl', () => {
    it('produces valid JSONL lines with SKU keys', () => {
      const products: ProductSource[] = [
        { sku: 'SKU-001', sources: { test_source: { title: 'Product A', brand: 'Brand X' } } },
        { sku: 'SKU-002', sources: { test_source: { title: 'Product B', brand: 'Brand Y' } } },
      ];

      const imagePartsBySku = new Map<string, PreparedImagePart[]>();
      imagePartsBySku.set('SKU-001', [{ fileUri: 'files/img1', mimeType: 'image/jpeg' }]);

      const jsonl = createGeminiBatchJsonl(products, imagePartsBySku, ['Pet Supplies'], 'gemini-3.5-flash');

      const lines = jsonl.trim().split('\n');
      expect(lines.length).toBe(2);

      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed.key).toBeDefined();
        expect(parsed.request).toBeDefined();
        expect(parsed.request.model).toBe('models/gemini-3.5-flash');
        expect(parsed.request.contents[0].parts[0].text).toBeDefined();
        expect(parsed.request.generationConfig.responseMimeType).toBe('application/json');
      }

      // First SKU has image, second SKU is text-only
      const line1 = JSON.parse(lines[0]);
      const line2 = JSON.parse(lines[1]);

      // SKU-001 has 1 text + 1 image
      if (line1.key === 'SKU-001') {
        expect(line1.request.contents[0].parts.length).toBe(2);
        expect(line2.request.contents[0].parts.length).toBe(1);
      } else {
        // If order is reversed
        expect(line1.request.contents[0].parts.length).toBe(1);
        expect(line2.request.contents[0].parts.length).toBe(2);
      }
    });

    it('all lines parse as valid JSON', () => {
      const products: ProductSource[] = [
        { sku: 'SKU-001', sources: { test: { title: 'Test' } } },
      ];
      const jsonl = createGeminiBatchJsonl(products, new Map(), [], 'gemini-3.5-flash');

      const lines = jsonl.trim().split('\n');
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('passes cachedContent option and omits systemInstruction in JSONL output', () => {
      const products: ProductSource[] = [
        { sku: 'SKU-001', sources: { test: { title: 'Test' } } },
      ];
      const jsonl = createGeminiBatchJsonl(products, new Map(), [], 'gemini-3.5-flash', {
        cachedContent: 'cachedContents/batch-cache-123',
      });

      const parsed = JSON.parse(jsonl.trim());
      expect(parsed.request.cachedContent).toBe('cachedContents/batch-cache-123');
      expect(parsed.request.systemInstruction).toBeUndefined();
    });
  });

  describe('parseGeminiBatchOutputLine', () => {
    it('parses a Gemini batch output line with candidate text', () => {
      const outputLine = JSON.stringify({
        key: 'SKU-001',
        response: {
          statusCode: 200,
          body: {
            candidates: [
              {
                content: {
                  parts: [{ text: '{"name":"Product A","brand":"Brand X"}' }],
                  role: 'model',
                },
                finishReason: 'STOP',
                usageMetadata: {
                  promptTokenCount: 100,
                  candidatesTokenCount: 50,
                  totalTokenCount: 150,
                },
              },
            ],
          },
        },
      });

      const result = parseGeminiBatchOutputLine(outputLine);
      expect(result).not.toBeNull();
      expect(result!.key).toBe('SKU-001');
      expect(result!.text).toContain('Product A');
      expect(result!.usage?.promptTokenCount).toBe(100);
      expect(result!.usage?.totalTokenCount).toBe(150);
    });

    it('handles error lines gracefully', () => {
      const errorLine = JSON.stringify({
        key: 'SKU-002',
        error: { code: 400, message: 'Invalid request' },
      });

      const result = parseGeminiBatchOutputLine(errorLine);
      expect(result).not.toBeNull();
      expect(result!.key).toBe('SKU-002');
      expect(result!.error).toBe('Invalid request');
    });

    it('handles malformed JSON gracefully', () => {
      const result = parseGeminiBatchOutputLine('{not valid json');
      expect(result).toBeNull();
    });

    it('extracts error when response has no candidates', () => {
      const outputLine = JSON.stringify({
        key: 'SKU-003',
        response: {
          statusCode: 200,
          body: { candidates: [] },
        },
      });

      const result = parseGeminiBatchOutputLine(outputLine);
      expect(result).not.toBeNull();
      expect(result!.error).toBe('No candidates in response');
    });

    it('handles nested response structure variations', () => {
      // Some Gemini responses might put candidates at response level
      const outputLine = JSON.stringify({
        key: 'SKU-004',
        response: {
          statusCode: 200,
          candidates: [
            {
              content: {
                parts: [{ text: '{"name":"Product D"}' }],
              },
            },
          ],
        },
      });

      const result = parseGeminiBatchOutputLine(outputLine);
      expect(result).not.toBeNull();
      expect(result!.key).toBe('SKU-004');
      expect(result!.text).toContain('Product D');
    });
  });
});
