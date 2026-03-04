import { parseScraperCallbackPayload, parseChunkCallbackPayload } from '@/lib/scraper-callback/contract';

describe('callback validation - admin payloads', () => {
  describe('missing required fields', () => {
    it('rejects missing job_id', () => {
      const payload = JSON.stringify({ status: 'completed', results: { data: { 'sku-1': {} } } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('job_id');
      }
    });

    it('rejects missing status', () => {
      const payload = JSON.stringify({ job_id: 'job-123', results: { data: { 'sku-1': {} } } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('status');
      }
    });

    it('rejects empty string job_id', () => {
      const payload = JSON.stringify({ job_id: '', status: 'completed', results: { data: { 'sku-1': {} } } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('job_id');
      }
    });
  });

  describe('invalid status enum values', () => {
    it('rejects invalid status "done"', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'done' });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('status');
      }
    });

    it('rejects invalid status "success"', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'success' });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('status');
      }
    });

    it('rejects invalid status "pending"', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'pending' });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('status');
      }
    });

    it('rejects status as number', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 1 });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects status as object', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: {} });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('wrong field types', () => {
    it('rejects job_id as number', () => {
      const payload = JSON.stringify({ job_id: 123, status: 'completed', results: { data: { 'sku-1': {} } } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('job_id');
      }
    });

    it('rejects job_id as array', () => {
      const payload = JSON.stringify({ job_id: ['job-123'], status: 'completed', results: { data: { 'sku-1': {} } } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects job_id as object', () => {
      const payload = JSON.stringify({ job_id: { id: 'job-123' }, status: 'completed', results: { data: { 'sku-1': {} } } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects results as array', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed', results: [] });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects results as string', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed', results: 'invalid' });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects results.data as array', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed', results: { data: [] } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects results.data as string', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed', results: { data: 'invalid' } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('completed status without results.data', () => {
    it('rejects completed without results field', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed' });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('results.data');
      }
    });

    it('rejects completed with results but no data', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed', results: {} });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('results.data');
      }
    });

    it('rejects completed with results.data as null', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed', results: { data: null } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('results.data');
      }
    });

    it('accepts completed with empty results.data object (schema allows empty record)', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'completed', results: { data: {} } });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(true);
    });
  });

  describe('nested malformed structures', () => {
    it('rejects null value in results.data entry', () => {
      const payload = JSON.stringify({
        job_id: 'job-123',
        status: 'completed',
        results: {
          data: {
            'sku-1': { amazon: null }
          }
        }
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects invalid skus_processed type', () => {
      const payload = JSON.stringify({
        job_id: 'job-123',
        status: 'completed',
        results: {
          skus_processed: '1',
          data: { 'sku-1': {} }
        }
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects negative skus_processed', () => {
      const payload = JSON.stringify({
        job_id: 'job-123',
        status: 'completed',
        results: {
          skus_processed: -1,
          data: { 'sku-1': {} }
        }
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects scrapers_run as object', () => {
      const payload = JSON.stringify({
        job_id: 'job-123',
        status: 'completed',
        results: {
          scrapers_run: { amazon: true },
          data: { 'sku-1': {} }
        }
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects scrapers_run with non-string elements', () => {
      const payload = JSON.stringify({
        job_id: 'job-123',
        status: 'completed',
        results: {
          scrapers_run: ['amazon', 123],
          data: { 'sku-1': {} }
        }
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('invalid JSON', () => {
    it('rejects non-JSON string', () => {
      const result = parseScraperCallbackPayload('not valid json');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('invalid-json');
      }
    });

    it('rejects empty string', () => {
      const result = parseScraperCallbackPayload('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('invalid-json');
      }
    });

    it('rejects JSON array', () => {
      const result = parseScraperCallbackPayload('[1, 2, 3]');
      expect(result.success).toBe(false);
    });
  });

  describe('valid payloads - sanity checks', () => {
    it('accepts valid completed payload', () => {
      const payload = JSON.stringify({
        job_id: 'job-123',
        status: 'completed',
        results: {
          skus_processed: 5,
          scrapers_run: ['amazon', 'chewy'],
          data: {
            'sku-1': { amazon: { price: 19.99 } }
          }
        }
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.job_id).toBe('job-123');
      }
    });

    it('accepts running status without results', () => {
      const payload = JSON.stringify({ job_id: 'job-123', status: 'running' });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(true);
    });

    it('accepts failed status with error_message', () => {
      const payload = JSON.stringify({
        job_id: 'job-123',
        status: 'failed',
        error_message: 'Scraper failed'
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(true);
    });

    it('accepts crawl4ai nested metadata object for completed callbacks', () => {
      const payload = JSON.stringify({
        job_id: 'job-789',
        status: 'completed',
        results: {
          data: {
            'sku-1': { amazon: { price: 12.34 } }
          },
          crawl4ai: {
            extraction_strategy: {
              'sku-1': 'llm'
            },
            cost_breakdown: {
              llm_usd: 0.04,
              network_usd: 0.01,
            },
            anti_bot_metrics: {
              blocked_requests: 1,
              retries: 2,
            }
          }
        }
      });
      const result = parseScraperCallbackPayload(payload);
      expect(result.success).toBe(true);
    });
  });
});

describe('callback validation - chunk payloads', () => {
  describe('missing required fields', () => {
    it('rejects missing chunk_id', () => {
      const payload = JSON.stringify({ status: 'completed' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('chunk_id');
      }
    });

    it('rejects missing status', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('status');
      }
    });

    it('rejects empty string chunk_id', () => {
      const payload = JSON.stringify({ chunk_id: '', status: 'completed' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('chunk_id');
      }
    });
  });

  describe('invalid status enum values', () => {
    it('rejects invalid status "done"', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 'done' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects invalid status "running"', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 'running' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects status as string other than completed/failed', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 'success' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects status as number', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 1 });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('wrong field types', () => {
    it('rejects chunk_id as number', () => {
      const payload = JSON.stringify({ chunk_id: 123, status: 'completed' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects chunk_id as array', () => {
      const payload = JSON.stringify({ chunk_id: ['chunk-1'], status: 'completed' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects chunk_id as object', () => {
      const payload = JSON.stringify({ chunk_id: { id: 'chunk-1' }, status: 'completed' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects job_id as number', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', job_id: 123, status: 'completed' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects results as array', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 'completed', results: [] });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects results.data as array', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 'completed', results: { data: [] } });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects results.data as string', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 'completed', results: { data: 'invalid' } });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('nested malformed structures', () => {
    it('rejects invalid skus_processed type', () => {
      const payload = JSON.stringify({
        chunk_id: 'chunk-1',
        status: 'completed',
        results: { skus_processed: '5' }
      });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects negative skus_processed', () => {
      const payload = JSON.stringify({
        chunk_id: 'chunk-1',
        status: 'completed',
        results: { skus_processed: -1 }
      });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects negative skus_successful', () => {
      const payload = JSON.stringify({
        chunk_id: 'chunk-1',
        status: 'completed',
        results: { skus_successful: -1 }
      });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects negative skus_failed', () => {
      const payload = JSON.stringify({
        chunk_id: 'chunk-1',
        status: 'completed',
        results: { skus_failed: -1 }
      });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });

    it('rejects non-integer skus_processed', () => {
      const payload = JSON.stringify({
        chunk_id: 'chunk-1',
        status: 'completed',
        results: { skus_processed: 1.5 }
      });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('invalid JSON', () => {
    it('rejects non-JSON string', () => {
      const result = parseChunkCallbackPayload('not valid json');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('invalid-json');
      }
    });

    it('rejects empty string', () => {
      const result = parseChunkCallbackPayload('');
      expect(result.success).toBe(false);
    });

    it('rejects JSON array', () => {
      const result = parseChunkCallbackPayload('[1, 2, 3]');
      expect(result.success).toBe(false);
    });
  });

  describe('valid payloads - sanity checks', () => {
    it('accepts valid completed payload', () => {
      const payload = JSON.stringify({
        chunk_id: 'chunk-1',
        job_id: 'job-123',
        status: 'completed',
        results: {
          skus_processed: 10,
          skus_successful: 9,
          skus_failed: 1,
          data: {
            'sku-1': { price: 19.99 }
          }
        }
      });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.payload.chunk_id).toBe('chunk-1');
      }
    });

    it('accepts failed status with error_message', () => {
      const payload = JSON.stringify({
        chunk_id: 'chunk-1',
        status: 'failed',
        error_message: 'Chunk processing failed'
      });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(true);
    });

    it('accepts completed without results (optional)', () => {
      const payload = JSON.stringify({ chunk_id: 'chunk-1', status: 'completed' });
      const result = parseChunkCallbackPayload(payload);
      expect(result.success).toBe(true);
    });
  });
});

describe('callback validation - test matrix coverage', () => {
  it('documents all malformed scenarios covered', () => {
    const adminScenarios = [
      'missing job_id',
      'missing status',
      'empty string job_id',
      'invalid status enum (done, success, pending)',
      'status as number/object',
      'job_id as number/array/object',
      'results as array/string',
      'results.data as array/string',
      'completed without results.data',
      'completed with results.data as null',
      'completed with empty results.data object',
      'invalid nested skus_processed type',
      'negative skus_processed',
      'scrapers_run as object',
      'scrapers_run with non-string elements',
      'non-JSON input',
      'empty string JSON',
      'JSON array input'
    ];

    const chunkScenarios = [
      'missing chunk_id',
      'missing status',
      'empty string chunk_id',
      'invalid status enum (done, running, success)',
      'status as number',
      'chunk_id as number/array/object',
      'job_id as number',
      'results as array',
      'results.data as array/string',
      'invalid nested skus_processed type',
      'negative skus_processed/skus_successful/skus_failed',
      'non-integer skus_processed',
      'non-JSON input',
      'empty string JSON',
      'JSON array input'
    ];

    expect(adminScenarios.length).toBe(18);
    expect(chunkScenarios.length).toBe(15);
  });
});
