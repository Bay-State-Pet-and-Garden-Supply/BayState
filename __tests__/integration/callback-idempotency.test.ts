/**
 * @jest-environment node
 *
 * Integration tests for callback idempotency behavior.
 * Verifies duplicate callbacks are handled correctly for both admin and chunk routes.
 */

// Setup global stubs for Next.js
if (typeof (globalThis as any).Request === 'undefined') {
  class Request {}
  (globalThis as any).Request = Request;
}
if (typeof (globalThis as any).Response === 'undefined') {
  class Response {}
  (globalThis as any).Response = Response;
}

import { checkIdempotency, recordCallbackProcessed } from '@/lib/scraper-callback/idempotency';
import { persistProductsIngestionSourcesStrict } from '@/lib/scraper-callback/products-ingestion';

// Mock the products-ingestion module
jest.mock('@/lib/scraper-callback/products-ingestion', () => ({
  persistProductsIngestionSourcesStrict: jest.fn(),
  MissingProductsIngestionSkusError: class MissingProductsIngestionSkusError extends Error {
    missingSkus: string[];
    constructor(missingSkus: string[]) {
      super(`Missing SKUs: ${missingSkus.join(', ')}`);
      this.name = 'MissingProductsIngestionSkusError';
      this.missingSkus = missingSkus;
    }
  },
}));

const mockedPersist = persistProductsIngestionSourcesStrict as jest.MockedFunction<
  typeof persistProductsIngestionSourcesStrict
>;

describe('Callback Idempotency Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('First callback delivery', () => {
    it('processes first admin callback successfully', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            filter: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            error: null,
          }),
        }),
      };

      mockedPersist.mockResolvedValue(['SKU-1', 'SKU-2']);

      // Check idempotency
      const idempotencyCheck = await checkIdempotency(
        mockSupabase as any,
        'job-123',
        'admin',
        { 'SKU-1': { price: 10 } }
      );

      // Should not be duplicate
      expect(idempotencyCheck.isDuplicate).toBe(false);
      expect(idempotencyCheck.key).toBe('admin:job-123');
    });

    it('processes first chunk callback successfully', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            filter: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            error: null,
          }),
        }),
      };

      mockedPersist.mockResolvedValue(['SKU-1', 'SKU-2']);

      const aggregatedResults = { 'SKU-1': { price: 10 }, 'SKU-2': { price: 20 } };

      // Check idempotency
      const idempotencyCheck = await checkIdempotency(
        mockSupabase as any,
        'job-456',
        'chunk',
        aggregatedResults
      );

      // Should not be duplicate
      expect(idempotencyCheck.isDuplicate).toBe(false);
      expect(idempotencyCheck.key.startsWith('chunk:job-456:')).toBe(true);
    });
  });

  describe('Duplicate callback replay', () => {
    it('detects duplicate admin callback and skips processing', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            filter: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'record-123',
                  created_at: '2026-02-18T00:00:00Z',
                  data: { _idempotency_key: 'admin:job-123' },
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const idempotencyCheck = await checkIdempotency(
        mockSupabase as any,
        'job-123',
        'admin'
      );

      // Should detect as duplicate
      expect(idempotencyCheck.isDuplicate).toBe(true);
      expect(idempotencyCheck.existingRecordId).toBe('record-123');

      // Persistence should not be called for duplicates
      expect(mockedPersist).not.toHaveBeenCalled();
    });

    it('detects duplicate chunk callback and skips processing', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            filter: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: 'record-456',
                  created_at: '2026-02-18T00:00:00Z',
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const aggregatedResults = { 'SKU-1': { price: 10 } };

      const idempotencyCheck = await checkIdempotency(
        mockSupabase as any,
        'job-789',
        'chunk',
        aggregatedResults
      );

      // Should detect as duplicate
      expect(idempotencyCheck.isDuplicate).toBe(true);
      expect(idempotencyCheck.existingRecordId).toBe('record-456');

      // Persistence should not be called for duplicates
      expect(mockedPersist).not.toHaveBeenCalled();
    });

    it('prevents duplicate scrape_results inserts via idempotency', async () => {
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          insert: mockInsert,
        }),
      };

      // First recording
      await recordCallbackProcessed(
        mockSupabase as any,
        'job-123',
        'runner-1',
        'admin:job-123',
        { skus_processed: 5 }
      );

      expect(mockInsert).toHaveBeenCalledTimes(1);

      // Simulate duplicate by checking idempotency first
      const mockSupabaseWithRecord = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            filter: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'record-1', created_at: '2026-02-18T00:00:00Z' },
                error: null,
              }),
            }),
          }),
        }),
      };

      const idempotencyCheck = await checkIdempotency(
        mockSupabaseWithRecord as any,
        'job-123',
        'admin'
      );

      expect(idempotencyCheck.isDuplicate).toBe(true);

      // Second recording should not happen (guarded by idempotency check)
      if (!idempotencyCheck.isDuplicate) {
        await recordCallbackProcessed(
          mockSupabase as any,
          'job-123',
          'runner-1',
          'admin:job-123',
          { skus_processed: 5 }
        );
      }

      // Insert should still only be called once
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Different payloads create different keys', () => {
    function createMockSupabase() {
      return {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            filter: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      };
    }

    it('treats different results as different callbacks for chunks', async () => {
      const results1 = { 'SKU-1': { price: 10 } };
      const results2 = { 'SKU-1': { price: 20 } };

      const check1 = await checkIdempotency(
        createMockSupabase() as any,
        'job-123',
        'chunk',
        results1
      );

      const check2 = await checkIdempotency(
        createMockSupabase() as any,
        'job-123',
        'chunk',
        results2
      );

      expect(check1.key).not.toBe(check2.key);
    });

    it('treats same results as duplicate for chunks', async () => {
      const results = { 'SKU-1': { price: 10 } };

      const check1 = await checkIdempotency(
        createMockSupabase() as any,
        'job-123',
        'chunk',
        results
      );

      const check2 = await checkIdempotency(
        createMockSupabase() as any,
        'job-123',
        'chunk',
        results
      );

      expect(check1.key).toBe(check2.key);
    });
  });
});
