/**
 * Tests for POST /api/scraper/v1/profile-maintenance/[jobId]/result
 * — verify_pdp_seed target-row update semantics
 *
 * These tests extend the existing result test suite by verifying that
 * the result endpoint updates product_detail_page_seeds rows after
 * processing a verify_pdp_seed job result.
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
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    profile_id: null,
    profile_version_id: null,
    browser_profile_id: null,
    payload: {
      pdp_seed_id: 'seed-1',
      url: 'https://example.com/pdp/1',
      normalized_url: 'https://example.com/pdp/1',
      brand_id: 'brand-1',
      source_slug: 'test-brand',
      canonical_domain: 'example.com',
    },
    required_capabilities: ['profile_maintenance', 'profile_maintenance.verify_pdp_seed'],
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
 * Build a Supabase mock client that supports chained operations.
 * The artifact insert now supports .select('id') chaining.
 * The PDP seed update supports .eq() chaining.
 * All other tables return the existing patterns.
 */
function makeMockSupabase(
  jobData: Record<string, unknown> | null,
  jobError: any = null,
  options?: { updateReturnsData?: boolean; artifactResult?: { data: unknown; error: unknown } },
) {
  const jobSingle = jest.fn().mockResolvedValue({ data: jobData, error: jobError });

  // Default returns a row ID so the main update succeeds
  const maybeSingle = (options?.updateReturnsData !== false)
    ? jest.fn().mockResolvedValue({ data: { id: MOCK_JOB_ID }, error: null })
    : jest.fn().mockResolvedValue({ data: null, error: null });

  const selectFn = jest.fn().mockReturnValue({ maybeSingle });
  const gtFn = jest.fn().mockReturnValue({ select: selectFn });
  const notFn = jest.fn().mockReturnValue({ gt: gtFn });
  const eq3 = jest.fn().mockReturnValue({ not: notFn });
  const eq2 = jest.fn().mockReturnValue({ eq: eq3 });
  const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
  const jobUpdate = jest.fn().mockReturnValue({ eq: eq1 });

  // Artifact insert with .select('id') chaining
  const defaultArtifactResult = { data: { id: 'artifact-1' }, error: null };
  const artifactResult = options?.artifactResult ?? defaultArtifactResult;
  const artifactSelect = jest.fn().mockReturnValue({
    maybeSingle: jest.fn().mockResolvedValue(artifactResult),
  });
  const artifactInsert = jest.fn().mockReturnValue({
    select: artifactSelect,
  });

  // PDP seed update with thenable .eq() chain
  const seedUpdateEq = jest.fn().mockImplementation(function () {
    // Return a thenable (promise) that resolves to { error: null }
    const result = Promise.resolve({ error: null });
    // Also support chaining more .eq() calls on it
    (result as any).eq = seedUpdateEq;
    return result;
  });
  const seedUpdate = jest.fn().mockReturnValue({ eq: seedUpdateEq });

  const runnerUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });

  // Build a helper chain for additional tables needed by ensureValidationCaseForSeed
  function makeExtraChain(returnData: any) {
    const promise = Promise.resolve(returnData);
    const chain: Record<string, jest.Mock | Function> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue(returnData),
      maybeSingle: jest.fn().mockResolvedValue(returnData),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    };
    return chain;
  }

  const mockClient = {
    from: jest.fn().mockImplementation((table: string) => {
      switch (table) {
        case 'profile_maintenance_jobs':
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({ single: jobSingle }),
            }),
            update: jobUpdate,
          };
        case 'profile_maintenance_artifacts':
          return {
            insert: artifactInsert,
          };
        case 'product_detail_page_seeds':
          return {
            update: seedUpdate,
            select: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'seed-1', url: 'https://example.com/pdp/1', validation_case_id: null }, error: null })),
          };
        case 'scraper_runners':
          return {
            update: runnerUpdate,
          };
        case 'site_extraction_profiles':
          return {
            select: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'prof-1' }, error: null })),
          };
        case 'profile_validation_sets':
          return {
            select: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'set-1' }, error: null })),
            insert: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'set-1' }, error: null })),
          };
        case 'profile_validation_cases':
          return {
            insert: jest.fn().mockReturnValue(makeExtraChain({ data: { id: 'case-1' }, error: null })),
          };
        default:
          return { select: jest.fn().mockReturnValue({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }), update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }), insert: jest.fn() };
      }
    }),
  };

  return { mockClient, artifactInsert, artifactSelect, jobUpdate, seedUpdate, seedUpdateEq };
}

describe('POST /api/scraper/v1/profile-maintenance/[jobId]/result (seed update)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateRunnerAuth as jest.Mock).mockResolvedValue({
      runnerName: 'test-runner',
      authMethod: 'api_key',
    });
  });

  it('updates PDP seed to verified when verification_status is verified', async () => {
    const job = makeMockJob();
    const { mockClient, seedUpdate } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            verification_status: 'verified',
            page_classification: 'product_detail_page',
          },
          artifact: {
            kind: 'verify_pdp_seed',
            schema_version: 'v1',
            payload: { verification_status: 'verified' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    // Should update product_detail_page_seeds
    expect(seedUpdate).toHaveBeenCalled();
    const updateArg = seedUpdate.mock.calls[0][0];
    expect(updateArg.trust_status).toBe('verified');
    expect(updateArg.verified_at).toEqual(expect.any(String));
    expect(updateArg.verification_artifact_id).toBe('artifact-1');
  });

  it('updates PDP seed to rejected when verification_status is rejected', async () => {
    const job = makeMockJob();
    const { mockClient, seedUpdate } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: {
            verification_status: 'rejected',
            rejection_reason: 'URL is a category page, not a PDP',
          },
          artifact: {
            kind: 'verify_pdp_seed',
            schema_version: 'v1',
            payload: { verification_status: 'rejected' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    expect(seedUpdate).toHaveBeenCalled();
    const updateArg = seedUpdate.mock.calls[0][0];
    expect(updateArg.trust_status).toBe('rejected');
    // Should NOT have verified_at
    expect(updateArg.verified_at).toBeUndefined();
  });

  it('does not update PDP seed when job status is failed', async () => {
    const job = makeMockJob();
    const { mockClient, seedUpdate } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'failed',
          lease_token: MOCK_LEASE_TOKEN,
          error_code: 'crawl_error',
          error_message: 'Could not reach URL',
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    // Should NOT call PDP seed update for failed jobs
    expect(seedUpdate).not.toHaveBeenCalled();
  });

  it('does not update PDP seed when job kind is not verify_pdp_seed', async () => {
    const job = makeMockJob({ kind: 'draft_site_extraction_profile' });
    const { mockClient, seedUpdate } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { some_field: 'value' },
          artifact: {
            kind: 'draft_site_extraction_profile',
            schema_version: 'v1',
            payload: {},
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    // Should NOT call PDP seed update for non-verify_pdp_seed jobs
    expect(seedUpdate).not.toHaveBeenCalled();
  });

  it('does not update PDP seed when job payload has no pdp_seed_id', async () => {
    const job = makeMockJob({
      payload: {
        url: 'https://example.com/pdp/1',
        normalized_url: 'https://example.com/pdp/1',
      }, // no pdp_seed_id
    });
    const { mockClient, seedUpdate } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { verification_status: 'verified' },
          artifact: {
            kind: 'verify_pdp_seed',
            schema_version: 'v1',
            payload: { verification_status: 'verified' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    expect(seedUpdate).not.toHaveBeenCalled();
  });

  it('returns success even if PDP seed update fails (non-fatal)', async () => {
    const job = makeMockJob();
    const { mockClient, seedUpdate } = makeMockSupabase(job, null, {
      artifactResult: { data: { id: 'artifact-1' }, error: null },
    });
    // Override seed update to return an error
    const errorEq = jest.fn().mockImplementation(function () {
      const result = Promise.resolve({ error: new Error('DB error') });
      (result as any).eq = errorEq;
      return result;
    });
    seedUpdate.mockReturnValue({ eq: errorEq });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { verification_status: 'verified', page_classification: 'product_detail_page' },
          artifact: {
            kind: 'verify_pdp_seed',
            schema_version: 'v1',
            payload: { verification_status: 'verified', page_classification: 'product_detail_page' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Should have logged the warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[SeedUpdate]'),
      'DB error',
    );
    warnSpy.mockRestore();
  });

  it('skips artifact creation when artifact.kind does not match job.kind', async () => {
    const job = makeMockJob();
    const { mockClient, artifactInsert } = makeMockSupabase(job);
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { verification_status: 'verified', page_classification: 'product_detail_page' },
          artifact: {
            kind: 'draft_site_extraction_profile', // mismatched kind
            schema_version: 'v1',
            payload: { verification_status: 'verified' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    // Artifact insert should NOT be called due to kind mismatch
    expect(artifactInsert).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('does not match job kind'),
    );
    warnSpy.mockRestore();
  });

  it('still returns success when artifact creation fails (non-fatal)', async () => {
    const job = makeMockJob();
    const { mockClient } = makeMockSupabase(job, null, {
      artifactResult: { data: null, error: new Error('Artifact insert failed') },
    });
    (createAdminClient as jest.Mock).mockResolvedValue(mockClient);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { POST } = require('@/app/api/scraper/v1/profile-maintenance/[jobId]/result/route');
    const response = await POST(
      new NextRequest(`http://localhost/api/scraper/v1/profile-maintenance/${MOCK_JOB_ID}/result`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'succeeded',
          lease_token: MOCK_LEASE_TOKEN,
          result: { verification_status: 'verified' },
          artifact: {
            kind: 'verify_pdp_seed',
            schema_version: 'v1',
            payload: { verification_status: 'verified' },
          },
        }),
        headers: { 'X-API-Key': 'bsr_test' },
      }),
      { params: Promise.resolve({ jobId: MOCK_JOB_ID }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Should have logged the artifact failure warning
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create artifact'),
      expect.any(String),
    );
    warnSpy.mockRestore();
  });
});

export {};
