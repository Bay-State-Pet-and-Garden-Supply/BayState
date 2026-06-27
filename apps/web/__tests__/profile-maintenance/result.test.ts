/**
 * Tests for POST /api/scraper/v1/profile-maintenance/[jobId]/result
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

function makeMockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_JOB_ID,
    kind: 'verify_pdp_seed',
    status: 'claimed',
    brand_id: null,
    source_slug: null,
    canonical_domain: 'example.com',
    profile_id: null,
    profile_version_id: null,
    browser_profile_id: null,
    payload: { url: 'https://example.com/pdp/1' },
    required_capabilities: ['profile_maintenance'],
    claimed_by: 'test-runner',
    lease_token: MOCK_LEASE_TOKEN,
    lease_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    attempt_count: 1,
    max_attempts: 3,
    result: null,
    error_code: null,
    error_message: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockSupabase(
  jobData: Record<string, unknown> | null,
  jobError: any = null,
  options?: { updateReturnsData?: boolean },
) {
  const jobSingle = jest.fn().mockResolvedValue({ data: jobData, error: jobError });

  // Default: maybeSingle returns a row ID so success-path tests pass the
  // "no row updated" check. Override with updateReturnsData: false for
  // stale/raced callback tests.
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

  const runnerUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
  // Artifact insert now supports .select('id').maybeSingle() chain
  const artifactMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'artifact-1' }, error: null });
  const artifactSelect = jest.fn().mockReturnValue({ maybeSingle: artifactMaybeSingle });
  const artifactInsert = jest.fn().mockReturnValue({ select: artifactSelect });

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
      if (table === 'profile_maintenance_artifacts') {
        return {
          insert: artifactInsert,
        };
      }
      if (table === 'product_detail_page_seeds') {
        return {
          update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === 'scraper_runners') {
        return {
          update: runnerUpdate,
        };
      }
      return { select: jest.fn(), update: jest.fn(), insert: jest.fn() };
    }),
  };

  return { mockClient, artifactInsert, jobUpdate, artifactSelect, artifactMaybeSingle };
}

describe('POST /api/scraper/v1/profile-maintenance/[jobId]/result', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
  });

  it('returns 401 when auth fails', async () => {
    (validateRunnerAuth as jest.Mock).mockResolvedValue(null);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        headers: { 'X-API-Key': 'bsr_invalid' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(401);
  });

  it('returns 404 for non-existent job', async () => {
    const { mockClient } = makeMockSupabase(null, { message: 'not found' });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({ status: 'succeeded', lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(404);
  });

  it('validates status enum', async () => {
    const { mockClient } = makeMockSupabase(makeMockJob());
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({ status: 'invalid_status', lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid status');
  });

  it('validates lease token match', async () => {
    const { mockClient } = makeMockSupabase(makeMockJob());
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({ status: 'succeeded', lease_token: 'wrong-token' }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Lease token mismatch');
  });

  it('returns 409 when lease token is missing but job has one', async () => {
    const { mockClient } = makeMockSupabase(makeMockJob());
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({ status: 'succeeded' }), // no lease_token
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('Lease token required');
  });

  it('rejects runner ownership mismatch', async () => {
    const job = makeMockJob({ claimed_by: 'other-runner' });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({ status: 'succeeded', lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('not test-runner');
  });

  it('prevents double-processing of terminal jobs', async () => {
    const job = makeMockJob({ status: 'succeeded' });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({ status: 'succeeded', lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('already_completed');
  });

  it('prevents cancelled jobs from being overwritten by late runner results', async () => {
    const job = makeMockJob({ status: 'cancelled' });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({ status: 'succeeded', lease_token: MOCK_LEASE_TOKEN }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('already_completed');
  });

  it('on success: updates job row with result payload', async () => {
    const job = makeMockJob();
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { verification_status: 'verified' },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('succeeded');
    expect(body.job_id).toBe(MOCK_JOB_ID);
  });

  it('on success with artifact: creates artifact row', async () => {
    const job = makeMockJob();
    const { mockClient, artifactInsert } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const artifact = {
      kind: 'verify_pdp_seed',
      schema_version: 'v1',
      payload: { verification_status: 'verified', page_classification: 'product_detail_page' },
      evidence_refs: {},
    };

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { verification_status: 'verified' },
          artifact,
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    // Verify artifact was inserted
    expect(artifactInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'verify_pdp_seed',
        job_id: MOCK_JOB_ID,
        schema_version: 'v1',
        attempt_number: job.attempt_count,
      }),
    );
  });

  it('on failure: stores error_code and error_message', async () => {
    const job = makeMockJob();
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'failed',
          lease_token: MOCK_LEASE_TOKEN,
          error_code: 'verification_failed',
          error_message: 'URL did not match PDP pattern',
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('failed');
  });

  it('rejects error_code on succeeded status', async () => {
    const job = makeMockJob();
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          error_code: 'something',
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('error_code must not be set');
  });

  it('rejects expired lease', async () => {
    const expiredLease = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const job = makeMockJob({ lease_expires_at: expiredLease });
    const { mockClient } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
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
    // Simulate a job that passes the initial SELECT/checks but the UPDATE
    // returns no rows because the state changed between load and update.
    const job = makeMockJob();
    const { mockClient } = makeMockSupabase(job, null, { updateReturnsData: false });

    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { verification_status: 'verified' },
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
