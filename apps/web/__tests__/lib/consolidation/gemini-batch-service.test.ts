import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { ProductSource } from '@/lib/consolidation/types';
import { buildGeminiBatchStatus } from '@/lib/consolidation/gemini-batch-service';

describe('Gemini Batch Service', () => {
  describe('buildGeminiBatchStatus (pure function, no DB dependency)', () => {
    it('builds correct BatchStatus from DB row', () => {
      const row: Record<string, unknown> = {
        id: 'test-batch-id',
        provider: 'gemini',
        provider_batch_id: 'gemini_abc123',
        status: 'in_progress',
        execution_mode: 'gemini_batch',
        total_requests: 10,
        completed_requests: 3,
        failed_requests: 1,
        prompt_tokens: 500,
        completion_tokens: 250,
        total_tokens: 750,
        created_at: new Date().toISOString(),
        metadata: { gemini_stage: 'in_progress' },
      };

      const status = buildGeminiBatchStatus(row);

      expect(status.provider).toBe('gemini');
      expect(status.total_requests).toBe(10);
      expect(status.completed_requests).toBe(3);
      expect(status.failed_requests).toBe(1);
      expect(status.status).toBe('in_progress');
      expect(status.is_processing).toBe(true);
      expect(status.is_complete).toBe(false);
    });

    it('detects completed status', () => {
      const row: Record<string, unknown> = {
        id: 'test-batch-id',
        status: 'completed',
        total_requests: 5,
        completed_requests: 5,
        failed_requests: 0,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        metadata: {},
      };

      const status = buildGeminiBatchStatus(row);
      expect(status.is_complete).toBe(true);
      expect(status.is_failed).toBe(false);
    });
  });

  describe('createGeminiBatchJob integration (requires DB mock)', () => {
    it('requires supabase env vars — skip in CI without them', async () => {
      // This test validates that the function exists and is properly exported
      const { createGeminiBatchJob } = await import('@/lib/consolidation/gemini-batch-service');
      expect(createGeminiBatchJob).toBeDefined();
    });

    it('returns error for empty products', async () => {
      const { createGeminiBatchJob } = await import('@/lib/consolidation/gemini-batch-service');
      const result = await createGeminiBatchJob([], 'gemini-3.5-flash', 'key', {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No products');
      }
    });
  });
});
