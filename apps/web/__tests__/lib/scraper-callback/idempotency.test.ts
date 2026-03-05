import { SupabaseClient } from '@supabase/supabase-js';
import {
  generateIdempotencyKey,
  checkCallbackIdempotency,
  recordCallbackProcessed,
  checkIdempotency,
} from '@/lib/scraper-callback/idempotency';

describe('idempotency key generation', () => {
  it('generates consistent keys for admin callbacks', () => {
    const key1 = generateIdempotencyKey('job-123', 'admin');
    const key2 = generateIdempotencyKey('job-123', 'admin');
    
    expect(key1).toBe('admin:job-123');
    expect(key1).toBe(key2);
  });

  it('generates different keys for different job IDs', () => {
    const key1 = generateIdempotencyKey('job-123', 'admin');
    const key2 = generateIdempotencyKey('job-456', 'admin');
    
    expect(key1).not.toBe(key2);
  });

  it('generates consistent keys for chunk callbacks with same payload', () => {
    const payload = { 'SKU-1': { price: 10 }, 'SKU-2': { price: 20 } };
    const key1 = generateIdempotencyKey('job-123', 'chunk', payload);
    const key2 = generateIdempotencyKey('job-123', 'chunk', payload);
    
    expect(key1).toBe(key2);
    expect(key1.startsWith('chunk:job-123:')).toBe(true);
  });

  it('generates different keys for chunk callbacks with different payloads', () => {
    const payload1 = { 'SKU-1': { price: 10 } };
    const payload2 = { 'SKU-1': { price: 20 } };
    
    const key1 = generateIdempotencyKey('job-123', 'chunk', payload1);
    const key2 = generateIdempotencyKey('job-123', 'chunk', payload2);
    
    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different callback types with same job', () => {
    const key1 = generateIdempotencyKey('job-123', 'admin');
    const key2 = generateIdempotencyKey('job-123', 'chunk', {});
    
    expect(key1).not.toBe(key2);
  });
});

describe('checkCallbackIdempotency', () => {
  function createSupabaseMock(exists: boolean) {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: exists ? { id: 'record-1', created_at: '2026-02-18T00:00:00Z' } : null,
      error: null,
    });
    const filter = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ filter }));
    const from = jest.fn(() => ({ select }));

    return {
      supabase: { from } as unknown as SupabaseClient,
      from,
      select,
      filter,
      maybeSingle,
    };
  }

  it('returns processed=false when no existing record found', async () => {
    const { supabase, filter } = createSupabaseMock(false);

    const result = await checkCallbackIdempotency(supabase, 'admin:job-123');

    expect(result.processed).toBe(false);
    expect(filter).toHaveBeenCalledWith('data->_idempotency_key', 'eq', 'admin:job-123');
  });

  it('returns processed=true when existing record found', async () => {
    const { supabase } = createSupabaseMock(true);

    const result = await checkCallbackIdempotency(supabase, 'admin:job-123');

    expect(result.processed).toBe(true);
    expect(result.existingRecord).toEqual({
      id: 'record-1',
      created_at: '2026-02-18T00:00:00Z',
    });
  });

  it('handles database errors gracefully', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Connection failed' },
    });
    const filter = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ filter }));
    const from = jest.fn(() => ({ select }));
    const supabase = { from } as unknown as SupabaseClient;

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await checkCallbackIdempotency(supabase, 'admin:job-123');

    expect(result.processed).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Idempotency] Error checking for duplicate: Connection failed'
    );

    consoleSpy.mockRestore();
  });
});

describe('recordCallbackProcessed', () => {
  function createSupabaseMock(insertError: Error | null = null) {
    const insert = jest.fn().mockResolvedValue({
      error: insertError,
    });
    const from = jest.fn(() => ({ insert }));

    return {
      supabase: { from } as unknown as SupabaseClient,
      from,
      insert,
    };
  }

  it('successfully records callback with idempotency key', async () => {
    const { supabase, insert } = createSupabaseMock(null);
    const resultsData = { skus_processed: 5 };

    const result = await recordCallbackProcessed(
      supabase,
      'job-123',
      'runner-1',
      'admin:job-123',
      resultsData
    );

    expect(result.success).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      job_id: 'job-123',
      runner_name: 'runner-1',
      data: {
        skus_processed: 5,
        _idempotency_key: 'admin:job-123',
        _processed_at: expect.any(String),
      },
    });
  });

  it('handles unique constraint violations as success (race condition)', async () => {
    const uniqueError = new Error('unique constraint violation') as Error & { code: string };
    uniqueError.code = '23505';
    const { supabase, insert } = createSupabaseMock(uniqueError);

    const result = await recordCallbackProcessed(
      supabase,
      'job-123',
      'runner-1',
      'admin:job-123',
      {}
    );

    expect(result.success).toBe(true);
  });

  it('returns failure for other database errors', async () => {
    const dbError = new Error('Database connection lost');
    const { supabase, insert } = createSupabaseMock(dbError);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await recordCallbackProcessed(
      supabase,
      'job-123',
      'runner-1',
      'admin:job-123',
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database connection lost');

    consoleSpy.mockRestore();
  });
});

describe('checkIdempotency', () => {
  function createSupabaseMock(exists: boolean) {
    const maybeSingle = jest.fn().mockResolvedValue({
      data: exists ? { id: 'record-1', created_at: '2026-02-18T00:00:00Z' } : null,
      error: null,
    });
    const filter = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ filter }));
    const from = jest.fn(() => ({ select }));

    return {
      supabase: { from } as unknown as SupabaseClient,
      from,
      select,
      filter,
      maybeSingle,
    };
  }

  it('returns isDuplicate=false for new callbacks', async () => {
    const { supabase } = createSupabaseMock(false);

    const result = await checkIdempotency(supabase, 'job-123', 'admin');

    expect(result.isDuplicate).toBe(false);
    expect(result.key).toBe('admin:job-123');
  });

  it('returns isDuplicate=true for duplicate callbacks', async () => {
    const { supabase } = createSupabaseMock(true);

    const result = await checkIdempotency(supabase, 'job-123', 'admin');

    expect(result.isDuplicate).toBe(true);
    expect(result.existingRecordId).toBe('record-1');
    expect(result.existingRecordCreatedAt).toBe('2026-02-18T00:00:00Z');
  });

  it('generates correct key for chunk callbacks with payload', async () => {
    const { supabase, filter } = createSupabaseMock(false);
    const payload = { 'SKU-1': { price: 10 } };

    const result = await checkIdempotency(supabase, 'job-123', 'chunk', payload);

    expect(result.isDuplicate).toBe(false);
    expect(result.key.startsWith('chunk:job-123:')).toBe(true);
    expect(filter).toHaveBeenCalledWith(
      'data->_idempotency_key',
      'eq',
      expect.stringMatching(/^chunk:job-123:/)
    );
  });
});
