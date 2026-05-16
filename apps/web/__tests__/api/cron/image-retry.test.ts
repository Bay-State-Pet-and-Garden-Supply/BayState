/**
 * @jest-environment node
 */

import { type NextRequest } from 'next/server';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    rpc: jest.fn(),
    from: jest.fn(),
    storage: { from: jest.fn() },
  }),
}));

jest.mock('@/lib/scraper-callback/image-retry-processor', () => ({
  __esModule: true,
  ImageRetryProcessor: jest.fn().mockImplementation(() => ({
    pollAndProcess: jest.fn().mockResolvedValue({
      fetched: 3,
      processed: 3,
      completed: 2,
      failed: 1,
      rescheduled: 0,
      skippedCircuitOpen: 0,
    }),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GET } = require('@/app/api/cron/image-retry/route');

describe('GET /api/cron/image-retry', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function createRequest(url: string, init?: RequestInit) {
    return new Request(url, { method: 'GET', ...init }) as unknown as NextRequest;
  }

  it('returns 401 without authorization', async () => {
    const request = createRequest('http://localhost/api/cron/image-retry');
    const response = await GET(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 with invalid bearer token', async () => {
    const request = createRequest('http://localhost/api/cron/image-retry', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it('accepts valid secret query param and runs processor', async () => {
    const request = createRequest(
      'http://localhost/api/cron/image-retry?secret=test-cron-secret'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.result).toMatchObject({
      fetched: 3,
      processed: 3,
      completed: 2,
      failed: 1,
    });
  });

  it('accepts valid bearer token and runs processor', async () => {
    const request = createRequest('http://localhost/api/cron/image-retry', {
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('accepts x-vercel-signature header and runs processor', async () => {
    const request = createRequest('http://localhost/api/cron/image-retry', {
      headers: { 'x-vercel-signature': 'some-vercel-sig' },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
