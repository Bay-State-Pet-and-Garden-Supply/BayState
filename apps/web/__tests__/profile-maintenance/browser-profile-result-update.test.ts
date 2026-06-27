/**
 * Tests for browser_profile_setup and browser_profile_revalidate result target updates
 * in the result route handler.
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

const MOCK_JOB_ID_SETUP = 'job-setup-1';
const MOCK_JOB_ID_REVALIDATE = 'job-reval-1';
const MOCK_LEASE_TOKEN = 'tok-1';

function makeMockJob(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_JOB_ID_SETUP,
    kind: 'browser_profile_setup',
    status: 'claimed',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    profile_id: null,
    profile_version_id: null,
    browser_profile_id: 'bp-1',
    payload: {
      browser_profile_id: 'bp-1',
      brand_id: 'brand-1',
      source_slug: 'test-brand',
      canonical_domain: 'example.com',
    },
    required_capabilities: ['profile_maintenance', 'profile_maintenance.browser_profile_setup'],
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

/**
 * Build a mock Supabase client with explicit control over which table
 * methods are called. Uses a single `from` mock that returns per-table handlers.
 */
function makeMockSupabase(options: {
  jobData?: Record<string, unknown> | null;
  jobError?: any;
  updateReturnsData?: boolean;
  jobKind?: string;
} = {}) {
  const { jobData, jobError, updateReturnsData = true, jobKind } = options;

  // Job row load
  const jobSingle = jest.fn().mockResolvedValue({ data: jobData ?? makeMockJob(jobKind ? { kind: jobKind } : {}), error: jobError ?? null });

  // Job update chain with lease/stale guards
  const updateSelect = jest.fn().mockReturnValue({
    maybeSingle: jest.fn().mockResolvedValue(
      updateReturnsData
        ? { data: { id: jobData?.id ?? MOCK_JOB_ID_SETUP }, error: null }
        : { data: null, error: null },
    ),
  });
  const updateGt = jest.fn().mockReturnValue({ select: updateSelect });
  const updateNot = jest.fn().mockReturnValue({ gt: updateGt });
  const updateEq3 = jest.fn().mockReturnValue({ not: updateNot });
  const updateEq2 = jest.fn().mockReturnValue({ eq: updateEq3 });
  const updateEq1 = jest.fn().mockReturnValue({ eq: updateEq2 });
  const jobUpdate = jest.fn().mockReturnValue({ eq: updateEq1 });

  // Artifact insert chain
  const artifactMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'artifact-1' }, error: null });
  const artifactSelect = jest.fn().mockReturnValue({ maybeSingle: artifactMaybeSingle });
  const artifactInsert = jest.fn().mockReturnValue({ select: artifactSelect });

  // Browser profile update (for target row updates)
  const bpUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const bpUpdate = jest.fn().mockReturnValue({ eq: bpUpdateEq });

  // Browser profile setup requests update
  const reqSelectEq = jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'req-1' }, error: null }) });
  const reqSelect = jest.fn().mockReturnValue({ eq: reqSelectEq });
  const reqUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const reqUpdate = jest.fn().mockReturnValue({ eq: reqUpdateEq });

  // Runner update
  const runnerUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const runnerUpdate = jest.fn().mockReturnValue({ eq: runnerUpdateEq });

  const mockClient = {
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'profile_maintenance_jobs') {
        return {
          select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ single: jobSingle }) }),
          update: jobUpdate,
        };
      }
      if (table === 'profile_maintenance_artifacts') {
        return { insert: artifactInsert };
      }
      if (table === 'browser_profiles') {
        return { update: bpUpdate };
      }
      if (table === 'browser_profile_setup_requests') {
        return { select: reqSelect, update: reqUpdate };
      }
      if (table === 'scraper_runners') {
        return { update: runnerUpdate };
      }
      return { select: jest.fn(), update: jest.fn(), insert: jest.fn() };
    }),
  };
  return {
    mockClient,
    artifactInsert,
    jobUpdate,
    bpUpdate,
    bpUpdateEq,
    reqUpdate,
    reqUpdateEq,
  };
}

describe('POST result route — browser_profile_setup target updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
  });

  it('updates browser_profiles status to validated on successful setup', async () => {
    const job = makeMockJob({ kind: 'browser_profile_setup' });
    const { mockClient, bpUpdate, bpUpdateEq } = makeMockSupabase({ jobData: job });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID_SETUP}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            validation_status: 'validated',
            storage_ref: '550e8400-e29b-41d4-a716-446655440000',
            runner_name: 'test-runner',
            target_pdp_seeds_verified: ['https://example.com/product/1'],
          },
          artifact: {
            kind: 'browser_profile_setup',
            schema_version: '1',
            payload: { validation_status: 'validated' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID_SETUP }) },
    );

    expect(response.status).toBe(200);
    // Verify browser_profiles update was called with validated status
    expect(bpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'validated',
        storage_ref: expect.any(String),
        last_validated_at: expect.any(String),
        stale_after: expect.any(String),
      }),
    );
    expect(bpUpdateEq).toHaveBeenCalledWith('id', 'bp-1');
  });

  it('updates browser_profiles status to validation_failed on failed setup', async () => {
    const job = makeMockJob({ kind: 'browser_profile_setup' });
    const { mockClient, bpUpdate, bpUpdateEq } = makeMockSupabase({ jobData: job });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID_SETUP}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            validation_status: 'failed',
            error_message: 'Profile creation failed',
          },
          artifact: {
            kind: 'browser_profile_setup',
            schema_version: '1',
            payload: { validation_status: 'failed' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID_SETUP }) },
    );

    expect(response.status).toBe(200);
    expect(bpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'validation_failed',
      }),
    );
  });

  it('updates setup request status to completed on successful setup', async () => {
    const job = makeMockJob({ kind: 'browser_profile_setup' });
    const { mockClient, reqUpdate } = makeMockSupabase({ jobData: job });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID_SETUP}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            validation_status: 'validated',
            storage_ref: '550e8400-e29b-41d4-a716-446655440001',
            target_pdp_seeds_verified: ['https://example.com/product/1'],
          },
          artifact: {
            kind: 'browser_profile_setup',
            schema_version: '1',
            payload: { validation_status: 'validated' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID_SETUP }) },
    );

    expect(response.status).toBe(200);
    expect(reqUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
      }),
    );
  });
});

describe('POST result route — browser_profile_revalidate target updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
  });

  it('updates last_validated_at and refreshes stale_after on validated', async () => {
    const job = makeMockJob({
      id: MOCK_JOB_ID_REVALIDATE,
      kind: 'browser_profile_revalidate',
      browser_profile_id: 'bp-1',
      payload: { browser_profile_id: 'bp-1' },
    });
    const { mockClient, bpUpdate, bpUpdateEq } = makeMockSupabase({ jobData: job });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID_REVALIDATE}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            validation_status: 'validated',
            stale_after: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
          artifact: {
            kind: 'browser_profile_revalidate',
            schema_version: '1',
            payload: { validation_status: 'validated' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID_REVALIDATE }) },
    );

    expect(response.status).toBe(200);
    expect(bpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'validated',
        last_validated_at: expect.any(String),
        stale_after: expect.any(String),
      }),
    );
  });

  it('sets status to expired when revalidation reports expired', async () => {
    const job = makeMockJob({
      id: MOCK_JOB_ID_REVALIDATE,
      kind: 'browser_profile_revalidate',
      browser_profile_id: 'bp-1',
      payload: { browser_profile_id: 'bp-1' },
    });
    const { mockClient, bpUpdate } = makeMockSupabase({ jobData: job });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID_REVALIDATE}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            validation_status: 'expired',
            reason: 'profile_data_missing',
          },
          artifact: {
            kind: 'browser_profile_revalidate',
            schema_version: '1',
            payload: { validation_status: 'expired' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID_REVALIDATE }) },
    );

    expect(response.status).toBe(200);
    expect(bpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'expired',
      }),
    );
  });

  it('sets status to revoked and clears storage_ref when revalidation reports revoked', async () => {
    const job = makeMockJob({
      id: MOCK_JOB_ID_REVALIDATE,
      kind: 'browser_profile_revalidate',
      browser_profile_id: 'bp-1',
      payload: { browser_profile_id: 'bp-1' },
    });
    const { mockClient, bpUpdate } = makeMockSupabase({ jobData: job });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID_REVALIDATE}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            validation_status: 'revoked',
            reason: 'auth_changed',
          },
          artifact: {
            kind: 'browser_profile_revalidate',
            schema_version: '1',
            payload: { validation_status: 'revoked' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID_REVALIDATE }) },
    );

    expect(response.status).toBe(200);
    expect(bpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'revoked',
        storage_ref: null,
        runner_name: null,
      }),
    );
  });
});
