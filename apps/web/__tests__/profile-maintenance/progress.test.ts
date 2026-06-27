/**
 * Tests for POST /api/scraper/v1/profile-maintenance/[jobId]/progress
 */

jest.mock('next/server', () => require('@/__tests__/helpers/next-server'));
jest.mock('@/lib/scraper-auth', () => ({
  validateRunnerAuth: jest.fn(),
}));
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: jest.fn(),
}));

const { NextRequest } = require('next/server');
const { validateRunnerAuth } = require('@/lib/scraper-auth');
const { createAdminClient } = require('@/lib/supabase/server');

const MOCK_JOB_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_LEASE_TOKEN = '660e8400-e29b-41d4-a716-446655440001';

describe('POST /api/scraper/v1/profile-maintenance/[jobId]/progress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
  });

  function makeMockJob(overrides: Record<string, unknown> = {}) {
    return {
      id: MOCK_JOB_ID,
      status: 'claimed',
      lease_token: MOCK_LEASE_TOKEN,
      claimed_by: 'test-runner',
      payload: { url: 'https://example.com/pdp/1' },
      ...overrides,
    };
  }

  function makeMockSupabase(jobData: Record<string, unknown> | null, jobError: any = null, options?: { updateReturnsData?: boolean }) {
    const jobSingle = jest.fn().mockResolvedValue({ data: jobData, error: jobError });

    // Default: maybeSingle returns a row ID so success-path tests pass.
    // Override with updateReturnsData: false for stale/raced callback tests.
    const updateResult = (options?.updateReturnsData !== false)
      ? { data: { id: '550e8400-e29b-41d4-a716-446655440000' }, error: null }
      : { data: null, error: null };

    const maybeSingle = jest.fn().mockResolvedValue(updateResult);
    const selectFn = jest.fn().mockReturnValue({ maybeSingle });
    const gtFn = jest.fn().mockReturnValue({ select: selectFn });
    const notFn = jest.fn().mockReturnValue({ gt: gtFn });
    const eq3 = jest.fn().mockReturnValue({ not: notFn });
    const eq2 = jest.fn().mockReturnValue({ eq: eq3 });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const jobUpdate = jest.fn().mockReturnValue({ eq: eq1 });

    const runnerUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const runnerUpdate = jest.fn().mockReturnValue({ eq: runnerUpdateEq });

    const mockClient = {
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'profile_maintenance_jobs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ single: jobSingle }),
            }),
            update: jobUpdate,
          };
        }
        if (table === 'scraper_runners') {
          return {
            update: runnerUpdate,
          };
        }
        return { select: jest.fn(), update: jest.fn() };
      }),
    };

    return { mockClient, jobUpdate, eq1, maybeSingle, jobSingle };
  }

  it('returns 401 when auth fails', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_invalid' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('requires lease_token', async () => {
    const { mockClient } = makeMockSupabase(makeMockJob());
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({}), // no lease_token
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('lease_token is required');
  });

  it('returns 404 for non-existent job', async () => {
    const { mockClient } = makeMockSupabase(null, { message: 'not found' });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({ lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('validates lease token', async () => {
    const job = makeMockJob();
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({ lease_token: 'wrong-token' }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Lease token mismatch');
  });

  it('rejects runner ownership mismatch', async () => {
    const job = makeMockJob({ claimed_by: 'other-runner' });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({ lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Runner does not own current job');
  });

  it('ignores progress on terminal jobs', async () => {
    const job = makeMockJob({ status: 'succeeded' });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({ lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ignored).toBe(true);
    expect(body.reason).toContain('terminal');
  });

  it('updates payload.progress with phase/message/details', async () => {
    const job = makeMockJob();
    const { mockClient, jobUpdate } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          lease_token: MOCK_LEASE_TOKEN,
          status: 'running',
          progress: 50,
          phase: 'crawling',
          message: 'Crawling PDP seed URL',
          details: { url: 'https://example.com/pdp/1' },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('running');

    // Verify the update included the nested progress payload
    const updateCall = jobUpdate.mock.calls[0][0];
    expect(updateCall.payload.progress).toBeDefined();
    expect(updateCall.payload.progress.percent).toBe(50);
    expect(updateCall.payload.progress.phase).toBe('crawling');
    expect(updateCall.payload.progress.message).toBe('Crawling PDP seed URL');
    expect(updateCall.payload.progress.details).toEqual({ url: 'https://example.com/pdp/1' });
  });

  it('transitions queued/claimed status to running', async () => {
    const job = makeMockJob({ status: 'queued' });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          lease_token: MOCK_LEASE_TOKEN,
          status: 'running',
          progress: 10,
          phase: 'starting',
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('running');
  });

  it('rejects progress on expired lease', async () => {
    const expiredLease = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const job = makeMockJob({ lease_expires_at: expiredLease });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          lease_token: MOCK_LEASE_TOKEN,
          status: 'running',
          progress: 50,
          phase: 'crawling',
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Lease expired');
  });

  it('returns 409 when no row updated due to stale/raced callback', async () => {
    const job = makeMockJob();
    const { mockClient } = makeMockSupabase(job, null, { updateReturnsData: false });

    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/progress/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          lease_token: MOCK_LEASE_TOKEN,
          status: 'running',
          progress: 50,
          phase: 'crawling',
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('stale');
  });
});

export {};
