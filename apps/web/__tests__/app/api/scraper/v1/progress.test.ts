/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/scraper/v1/progress/route';
import { validateRunnerAuth } from '@/lib/scraper-auth';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/lib/scraper-auth', () => ({
  validateRunnerAuth: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('POST /api/scraper/v1/progress', () => {
  const createRequest = (body: Record<string, unknown>) =>
    ({
      headers: {
        get: () => null,
      },
      json: async () => body,
    }) as unknown as NextRequest;

  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    jest.clearAllMocks();
  });

  it('returns 401 when runner auth fails', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const res = await POST(createRequest({ job_id: 'job-1' }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 409 when the lease token does not match', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue({ runnerName: 'runner-a' });

    const jobSelectBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'job-1',
          status: 'running',
          lease_token: 'expected-lease',
          runner_name: 'runner-a',
          started_at: null,
        },
        error: null,
      }),
    };

    const mockSupabase = {
      from: jest.fn().mockReturnValue(jobSelectBuilder),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const res = await POST(createRequest({ job_id: 'job-1', lease_token: 'wrong-lease' }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'Lease token mismatch' });
  });

  it('persists durable runtime progress and refreshes runner heartbeat state', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue({ runnerName: 'runner-a' });

    const jobSelectBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          id: 'job-1',
          status: 'pending',
          lease_token: 'lease-1',
          runner_name: 'runner-a',
          started_at: null,
        },
        error: null,
      }),
    };

    const jobUpdateBuilder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    const runnerUpdateBuilder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    const mockSupabase = {
      from: jest
        .fn()
        .mockImplementationOnce(() => jobSelectBuilder)
        .mockImplementationOnce(() => jobUpdateBuilder)
        .mockImplementationOnce(() => runnerUpdateBuilder),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    const res = await POST(
      createRequest({
        job_id: 'job-1',
        lease_token: 'lease-1',
        progress: 42,
        status: 'running',
        message: 'Processing SKU-42',
        phase: 'scraping',
        current_sku: 'SKU-42',
        items_processed: 4,
        items_total: 10,
        details: { source: 'unit-test' },
        timestamp: '2024-01-01T00:00:01Z',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        status: 'running',
      }),
    );

    expect(jobUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        runner_name: 'runner-a',
        progress_percent: 42,
        progress_message: 'Processing SKU-42',
        progress_phase: 'scraping',
        current_sku: 'SKU-42',
        items_processed: 4,
        items_total: 10,
        last_event_at: '2024-01-01T00:00:01Z',
      }),
    );
    expect(jobUpdateBuilder.eq).toHaveBeenCalledWith('id', 'job-1');
    expect(runnerUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'busy',
        current_job_id: 'job-1',
      }),
    );
    expect(runnerUpdateBuilder.eq).toHaveBeenCalledWith('name', 'runner-a');
  });
});
